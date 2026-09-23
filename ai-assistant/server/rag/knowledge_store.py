"""
RAG (Retrieval-Augmented Generation) & Knowledge Store for Gabby AI.
Provides local document ingestion, structured note storage, and full-text
search powered by SQLite FTS5 with BM25 relevance scoring.
"""

from typing import Dict, Any, List, Optional
import sqlite3
import uuid
import json
import logging
import re
from datetime import datetime

import database
try:
    from memory.manager import scrub_secrets
except (ImportError, ValueError):
    from ..memory.manager import scrub_secrets

logger = logging.getLogger("gabby.rag")

class KnowledgeStore:
    """
    Persistent document and snippet store backed by SQLite with FTS5 search.
    Enables durable semantic retrieval across sessions without external vector databases.
    """
    def __init__(self):
        self._init_schema()

    def _init_schema(self):
        """Initialize knowledge tables and FTS5 index with sync triggers."""
        try:
            with database._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('''
                CREATE TABLE IF NOT EXISTS knowledge_snippets (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    content TEXT NOT NULL,
                    tags TEXT DEFAULT '[]',
                    source TEXT DEFAULT 'manual',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                ''')

                # Create FTS5 virtual table for lightning-fast token search
                try:
                    cursor.execute('''
                    CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_snippets_fts USING fts5(
                        id UNINDEXED,
                        title,
                        content,
                        tags,
                        tokenize = 'porter unicode61'
                    );
                    ''')

                    # Trigger: Keep FTS synchronized on INSERT
                    cursor.execute('''
                    CREATE TRIGGER IF NOT EXISTS trg_knowledge_insert AFTER INSERT ON knowledge_snippets
                    BEGIN
                        INSERT INTO knowledge_snippets_fts (id, title, content, tags)
                        VALUES (new.id, new.title, new.content, new.tags);
                    END;
                    ''')

                    # Trigger: Keep FTS synchronized on UPDATE
                    cursor.execute('''
                    CREATE TRIGGER IF NOT EXISTS trg_knowledge_update AFTER UPDATE ON knowledge_snippets
                    BEGIN
                        DELETE FROM knowledge_snippets_fts WHERE id = old.id;
                        INSERT INTO knowledge_snippets_fts (id, title, content, tags)
                        VALUES (new.id, new.title, new.content, new.tags);
                    END;
                    ''')

                    # Trigger: Keep FTS synchronized on DELETE
                    cursor.execute('''
                    CREATE TRIGGER IF NOT EXISTS trg_knowledge_delete AFTER DELETE ON knowledge_snippets
                    BEGIN
                        DELETE FROM knowledge_snippets_fts WHERE id = old.id;
                    END;
                    ''')
                except sqlite3.OperationalError as fts_err:
                    logger.warning(f"FTS5 setup warning: {fts_err}. Fallback search will be used.")

                conn.commit()
        except Exception as e:
            logger.error(f"Failed to initialize knowledge store schema: {e}")

    def ingest(self, title: str, content: str, tags: Optional[List[str]] = None, source: str = "manual") -> str:
        """
        Store a knowledge snippet or document text.
        Returns unique snippet ID.
        """
        if not title or not title.strip():
            title = "Untitled Note"
        clean_title = scrub_secrets(title.strip())
        clean_content = scrub_secrets((content or "").strip())
        if not clean_content:
            raise ValueError("Knowledge snippet content cannot be empty.")

        clean_tags = [scrub_secrets(str(t).strip().lower()) for t in (tags or []) if str(t).strip()]
        tags_json = json.dumps(clean_tags)
        snippet_id = str(uuid.uuid4())

        with database._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                '''
                INSERT INTO knowledge_snippets (id, title, content, tags, source)
                VALUES (?, ?, ?, ?, ?)
                ''',
                (snippet_id, clean_title, clean_content, tags_json, source)
            )
            conn.commit()

        logger.info(f"Ingested knowledge snippet '{clean_title}' (id={snippet_id})")
        return snippet_id

    def search(self, query: str, limit: int = 5, tag: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Search for relevant snippets matching query using FTS5 with fallback to token matching.
        """
        clean_query = (query or "").strip()
        if not clean_query:
            return self.list_all(limit=limit)

        results = []
        # Sanitize query for FTS5 syntax
        fts_query = re.sub(r'[^\w\s]', ' ', clean_query)
        fts_tokens = [t for t in fts_query.split() if len(t) > 1]
        
        # 1. Attempt FTS5 query with BM25 ranking
        if fts_tokens:
            formatted_fts = " OR ".join(f'"{token}"*' for token in fts_tokens[:6])
            try:
                with database._get_connection() as conn:
                    conn.row_factory = sqlite3.Row
                    cursor = conn.cursor()
                    cursor.execute(
                        '''
                        SELECT k.id, k.title, k.content, k.tags, k.source, k.created_at,
                               bm25(knowledge_snippets_fts) AS rank
                        FROM knowledge_snippets_fts
                        JOIN knowledge_snippets k ON k.id = knowledge_snippets_fts.id
                        WHERE knowledge_snippets_fts MATCH ?
                        ORDER BY rank ASC
                        LIMIT ?
                        ''',
                        (formatted_fts, limit * 2)
                    )
                    rows = cursor.fetchall()
                    for r in rows:
                        row_dict = dict(r)
                        try:
                            row_dict["tags"] = json.loads(row_dict["tags"])
                        except Exception:
                            row_dict["tags"] = []
                        if tag and tag.lower() not in [t.lower() for t in row_dict["tags"]]:
                            continue
                        results.append({
                            "id": row_dict["id"],
                            "title": row_dict["title"],
                            "content": row_dict["content"],
                            "tags": row_dict["tags"],
                            "source": row_dict["source"],
                            "created_at": str(row_dict["created_at"]),
                            "score": round(abs(1.0 / (1.0 + abs(float(row_dict.get("rank", 1.0))))), 3)
                        })
            except Exception as e:
                logger.debug(f"FTS5 search notice: {e}. Falling back to LIKE matching.")

        # 2. Fallback to SQL LIKE search if FTS yielded few results
        if len(results) < limit:
            existing_ids = {r["id"] for r in results}
            try:
                with database._get_connection() as conn:
                    conn.row_factory = sqlite3.Row
                    cursor = conn.cursor()
                    pattern = f"%{clean_query[:40]}%"
                    cursor.execute(
                        '''
                        SELECT id, title, content, tags, source, created_at
                        FROM knowledge_snippets
                        WHERE title LIKE ? OR content LIKE ?
                        ORDER BY updated_at DESC
                        LIMIT ?
                        ''',
                        (pattern, pattern, limit)
                    )
                    for r in cursor.fetchall():
                        if r["id"] not in existing_ids:
                            row_dict = dict(r)
                            try:
                                row_dict["tags"] = json.loads(row_dict["tags"])
                            except Exception:
                                row_dict["tags"] = []
                            if tag and tag.lower() not in [t.lower() for t in row_dict["tags"]]:
                                continue
                            results.append({
                                "id": row_dict["id"],
                                "title": row_dict["title"],
                                "content": row_dict["content"],
                                "tags": row_dict["tags"],
                                "source": row_dict["source"],
                                "created_at": str(row_dict["created_at"]),
                                "score": 0.5
                            })
            except Exception as e:
                logger.error(f"Fallback search error: {e}")

        return results[:limit]

    def list_all(self, limit: int = 50) -> List[Dict[str, Any]]:
        """List all stored knowledge snippets."""
        try:
            with database._get_connection() as conn:
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()
                cursor.execute(
                    '''
                    SELECT id, title, content, tags, source, created_at, updated_at
                    FROM knowledge_snippets
                    ORDER BY updated_at DESC
                    LIMIT ?
                    ''',
                    (limit,)
                )
                items = []
                for r in cursor.fetchall():
                    d = dict(r)
                    try:
                        d["tags"] = json.loads(d["tags"])
                    except Exception:
                        d["tags"] = []
                    # Truncate content for index listing
                    d["snippet"] = d["content"][:200] + ("..." if len(d["content"]) > 200 else "")
                    items.append(d)
                return items
        except Exception as e:
            logger.error(f"Error listing knowledge snippets: {e}")
            return []

    def get(self, snippet_id: str) -> Optional[Dict[str, Any]]:
        """Fetch a specific knowledge item by ID."""
        try:
            with database._get_connection() as conn:
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()
                cursor.execute('SELECT * FROM knowledge_snippets WHERE id = ?', (snippet_id,))
                row = cursor.fetchone()
                if not row:
                    return None
                d = dict(row)
                try:
                    d["tags"] = json.loads(d["tags"])
                except Exception:
                    d["tags"] = []
                return d
        except Exception as e:
            logger.error(f"Error retrieving knowledge snippet {snippet_id}: {e}")
            return None

    def delete(self, snippet_id: str) -> bool:
        """Delete a knowledge snippet by ID."""
        try:
            with database._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('DELETE FROM knowledge_snippets WHERE id = ?', (snippet_id,))
                deleted = cursor.rowcount > 0
                conn.commit()
                return deleted
        except Exception as e:
            logger.error(f"Error deleting knowledge snippet {snippet_id}: {e}")
            return False

    def clear_all(self) -> bool:
        """Purge all knowledge snippets."""
        try:
            with database._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('DELETE FROM knowledge_snippets;')
                try:
                    cursor.execute('DELETE FROM knowledge_snippets_fts;')
                except Exception:
                    pass
                conn.commit()
                return True
        except Exception as e:
            logger.error(f"Error clearing knowledge store: {e}")
            return False

# Global singleton instance
default_knowledge_store = KnowledgeStore()
