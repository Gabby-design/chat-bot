import sqlite3
import json
import uuid
import os
from datetime import datetime
from typing import List, Dict, Optional

DB_PATH = os.getenv("DB_PATH", "/tmp/chat.db" if os.getenv("VERCEL") else "chat.db")

def _get_connection():
    """Ensure parent directory exists and return SQLite connection."""
    db_dir = os.path.dirname(DB_PATH)
    if db_dir and not os.path.exists(db_dir):
        os.makedirs(db_dir, exist_ok=True)
    return sqlite3.connect(DB_PATH)

def init_db():
    """Initialize the database with necessary tables."""
    conn = _get_connection()
    cursor = conn.cursor()
    
    # Create chats table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS chats (
        id TEXT PRIMARY KEY,
        title TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    ''')
    
    # Create messages table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id TEXT,
        role TEXT,
        content TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (chat_id) REFERENCES chats (id)
    )
    ''')
    
    conn.commit()
    conn.close()

def create_chat(title: str = "New Chat") -> str:
    """Create a new chat and return its ID."""
    chat_id = str(uuid.uuid4())
    conn = _get_connection()
    cursor = conn.cursor()
    cursor.execute('INSERT INTO chats (id, title) VALUES (?, ?)', (chat_id, title))
    conn.commit()
    conn.close()
    return chat_id

def add_message(chat_id: str, role: str, content: str):
    """Add a message to a chat."""
    conn = _get_connection()
    cursor = conn.cursor()
    cursor.execute('INSERT INTO messages (chat_id, role, content) VALUES (?, ?, ?)', 
                   (chat_id, role, content))
    
    # Update chat title if it's the first user message and title is "New Chat"
    if role == "user":
        cursor.execute('SELECT title FROM chats WHERE id = ?', (chat_id,))
        row = cursor.fetchone()
        if row and row[0] == "New Chat":
            # Simple truncation for title, could be improved with AI summarization later
            new_title = content[:30] + "..." if len(content) > 30 else content
            cursor.execute('UPDATE chats SET title = ? WHERE id = ?', (new_title, chat_id))
            
    conn.commit()
    conn.close()

def get_chats() -> List[Dict]:
    """Get all chats ordered by creation date (newest first)."""
    conn = _get_connection()
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM chats ORDER BY created_at DESC')
    rows = cursor.fetchall()
    chats = [dict(row) for row in rows]
    conn.close()
    return chats

def get_chat_messages(chat_id: str) -> List[Dict]:
    """Get all messages for a specific chat."""
    conn = _get_connection()
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute('SELECT role, content FROM messages WHERE chat_id = ? ORDER BY id ASC', (chat_id,))
    rows = cursor.fetchall()
    messages = [dict(row) for row in rows]
    conn.close()
    return messages

def delete_chat(chat_id: str):
    """Delete a chat and its messages."""
    conn = _get_connection()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM messages WHERE chat_id = ?', (chat_id,))
    cursor.execute('DELETE FROM chats WHERE id = ?', (chat_id,))
    conn.commit()
    conn.close()
