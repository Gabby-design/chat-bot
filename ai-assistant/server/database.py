import sqlite3
import json
import uuid
import os
import re
from datetime import datetime
from typing import List, Dict, Optional

DB_PATH = os.getenv("DB_PATH", "/tmp/chat.db" if os.getenv("VERCEL") else "chat.db")

def _get_connection() -> sqlite3.Connection:
    """Ensure parent directory exists and return optimized SQLite connection."""
    db_dir = os.path.dirname(DB_PATH)
    if db_dir and not os.path.exists(db_dir):
        os.makedirs(db_dir, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=15.0)
    conn.execute("PRAGMA foreign_keys = ON;")
    try:
        conn.execute("PRAGMA journal_mode = WAL;")
    except Exception:
        pass
    return conn

def init_db():
    """Initialize the database with necessary tables, columns, and performance indexes."""
    with _get_connection() as conn:
        cursor = conn.cursor()
        
        # Create chats table
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS chats (
            id TEXT PRIMARY KEY,
            title TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        ''')
        
        # Backward compatibility migration: add updated_at if missing
        cursor.execute("PRAGMA table_info(chats);")
        columns = [col[1] for col in cursor.fetchall()]
        if "updated_at" not in columns:
            try:
                cursor.execute("ALTER TABLE chats ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;")
            except Exception:
                pass
        
        # Create messages table
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chat_id TEXT,
            role TEXT,
            content TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (chat_id) REFERENCES chats (id) ON DELETE CASCADE
        )
        ''')
        
        # Performance index for fast message history retrieval
        cursor.execute('''
        CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages (chat_id, id ASC)
        ''')
        conn.commit()

def create_chat(title: str = "New Chat") -> str:
    """Create a new chat and return its unique ID."""
    chat_id = str(uuid.uuid4())
    with _get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('INSERT INTO chats (id, title) VALUES (?, ?)', (chat_id, title))
        conn.commit()
    return chat_id

def ensure_chat_exists(chat_id: str, title: str = "New Chat") -> str:
    """Ensure a chat row exists for the given chat_id to prevent foreign key violations."""
    if not chat_id:
        return create_chat(title)
    with _get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('INSERT OR IGNORE INTO chats (id, title) VALUES (?, ?)', (chat_id, title))
        conn.commit()
    return chat_id

def _generate_smart_title(content: str) -> str:
    """Generate a clean, readable title truncated at word boundary."""
    if not content:
        return "New Chat"
    cleaned = re.sub(r'^[#*`\-_>\s]+', '', content).strip()
    cleaned = re.sub(r'\s+', ' ', cleaned)
    if not cleaned:
        return "New Chat"
    cleaned = cleaned[0].upper() + cleaned[1:]
    if len(cleaned) <= 36:
        return cleaned
    truncated = cleaned[:36]
    last_space = truncated.rfind(' ')
    if last_space > 18:
        truncated = truncated[:last_space]
    return truncated.rstrip(',.:;!? ') + "..."

def add_message(chat_id: str, role: str, content: str):
    """Add a message to a chat with transactional safety and smart title generation."""
    if not content or not content.strip():
        return
    with _get_connection() as conn:
        cursor = conn.cursor()
        # Guarantee parent chat exists to protect foreign key constraint
        cursor.execute('INSERT OR IGNORE INTO chats (id, title) VALUES (?, "New Chat")', (chat_id,))
        
        cursor.execute(
            'INSERT INTO messages (chat_id, role, content) VALUES (?, ?, ?)',
            (chat_id, role, content.strip())
        )
        
        # Update updated_at timestamp
        cursor.execute('UPDATE chats SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', (chat_id,))
        
        # Update chat title if it's the first user message and title is generic
        if role == "user":
            cursor.execute('SELECT title FROM chats WHERE id = ?', (chat_id,))
            row = cursor.fetchone()
            if row and row[0] in ("New Chat", "New Conversation"):
                new_title = _generate_smart_title(content)
                cursor.execute('UPDATE chats SET title = ? WHERE id = ?', (new_title, chat_id))
                
        conn.commit()

def get_chats() -> List[Dict]:
    """Get all chats ordered by latest update (newest first)."""
    try:
        with _get_connection() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute('SELECT * FROM chats ORDER BY updated_at DESC, created_at DESC')
            rows = cursor.fetchall()
            return [dict(row) for row in rows]
    except Exception as e:
        print(f"[Database get_chats notice]: {e}")
        try:
            with _get_connection() as conn:
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()
                cursor.execute('SELECT * FROM chats ORDER BY created_at DESC')
                rows = cursor.fetchall()
                return [dict(row) for row in rows]
        except Exception:
            return []

def get_chat_messages(chat_id: str) -> List[Dict]:
    """Get all raw messages for a specific chat."""
    try:
        with _get_connection() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute('SELECT role, content FROM messages WHERE chat_id = ? ORDER BY id ASC', (chat_id,))
            rows = cursor.fetchall()
            return [dict(row) for row in rows]
    except Exception as e:
        print(f"[Database get_chat_messages notice]: {e}")
        return []

def get_clean_history(chat_id: str, limit: int = 16) -> List[Dict]:
    """
    Get conversation history strictly normalized for Google Gemini API:
    1. Alternating roles: user -> model -> user -> model.
    2. Strips leading model messages so history always begins with user.
    3. Merges consecutive same-role messages to prevent 400 Invalid argument errors.
    4. Slices to the requested limit while keeping valid turn structure.
    """
    raw_messages = get_chat_messages(chat_id)
    if not raw_messages:
        return []

    normalized = []
    for msg in raw_messages:
        role = "user" if msg["role"] == "user" else "model"
        content = (msg.get("content") or "").strip()
        if not content:
            continue
            
        if normalized and normalized[-1]["role"] == role:
            # Merge consecutive turns of the same role
            normalized[-1]["content"] += f"\n\n{content}"
        else:
            normalized.append({"role": role, "content": content})

    # Gemini history should start with a 'user' turn
    while normalized and normalized[0]["role"] != "user":
        normalized.pop(0)

    # Gemini history should end with a 'model' turn if a new user prompt will be appended next
    # (or start with user and end with model before the new user prompt)
    if len(normalized) > limit:
        normalized = normalized[-limit:]
        while normalized and normalized[0]["role"] != "user":
            normalized.pop(0)

    return normalized

def delete_chat(chat_id: str):
    """Delete a chat and cascade-delete its messages."""
    with _get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('DELETE FROM messages WHERE chat_id = ?', (chat_id,))
        cursor.execute('DELETE FROM chats WHERE id = ?', (chat_id,))
        conn.commit()

def delete_all_chats():
    """Delete all chats and cascade-delete all messages."""
    with _get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('DELETE FROM messages;')
        cursor.execute('DELETE FROM chats;')
        conn.commit()


