"""
RAG and knowledge retrieval tools for Gabby AI Agent.
Allows searching and storing persistent knowledge snippets, guidelines,
documentation, and user notes.
"""

from typing import Dict, Any, List, Optional
import json

try:
    from tools.base import BaseTool, PermissionLevel
    from rag.knowledge_store import default_knowledge_store
except (ImportError, ValueError):
    from .base import BaseTool, PermissionLevel
    from ..rag.knowledge_store import default_knowledge_store

class SearchKnowledgeTool(BaseTool):
    name = "search_knowledge"
    description = (
        "Search stored notes, facts, project guidelines, and documentation in Gabby's persistent "
        "knowledge base. Use when user asks about stored notes, saved facts, project conventions, "
        "or information from previous interactions."
    )
    permission_level = PermissionLevel.READ_ONLY
    requires_confirmation = False
    parameters = {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "Keywords or search phrase to match against stored documents and notes."
            },
            "limit": {
                "type": "integer",
                "description": "Maximum number of snippets to retrieve (1-10). Default is 3."
            },
            "tag": {
                "type": "string",
                "description": "Optional category or tag filter (e.g. 'coding', 'personal', 'project')."
            }
        },
        "required": ["query"]
    }

    async def run(self, query: str, limit: int = 3, tag: Optional[str] = None, **kwargs) -> Dict[str, Any]:
        limit = max(1, min(10, int(limit or 3)))
        results = default_knowledge_store.search(query=query, limit=limit, tag=tag)
        return {
            "query": query,
            "count": len(results),
            "results": results
        }

class StoreKnowledgeTool(BaseTool):
    name = "store_knowledge"
    description = (
        "Save a note, important fact, user guideline, or document snippet into Gabby's persistent "
        "knowledge base so it can be recalled in future conversations."
    )
    permission_level = PermissionLevel.WORKSPACE_WRITE
    requires_confirmation = False
    parameters = {
        "type": "object",
        "properties": {
            "title": {
                "type": "string",
                "description": "Short descriptive title for the knowledge snippet."
            },
            "content": {
                "type": "string",
                "description": "The information or note content to remember."
            },
            "tags": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Optional tags for categorization (e.g. ['rule', 'frontend'])."
            }
        },
        "required": ["title", "content"]
    }

    async def run(self, title: str, content: str, tags: Optional[List[str]] = None, **kwargs) -> Dict[str, Any]:
        if not title or not title.strip():
            return {"error": "Title is required"}
        if not content or not content.strip():
            return {"error": "Content is required"}

        snippet_id = default_knowledge_store.ingest(
            title=title.strip(),
            content=content.strip(),
            tags=tags or [],
            source="agent_memory"
        )
        return {
            "success": True,
            "id": snippet_id,
            "title": title.strip(),
            "message": f"Successfully stored knowledge snippet '{title.strip()}' in persistent memory."
        }
