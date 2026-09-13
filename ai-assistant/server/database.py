import sqlite3
import json
import uuid
from datetime import datetime
from typing import List, Dict, Optional

DB_PATH = "chat.db"

def init_db():
    """Initialize the database with necessary tables."""
    conn = sqlite3.connect(DB_PATH)
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
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('INSERT INTO chats (id, title) VALUES (?, ?)', (chat_id, title))
    conn.commit()
    conn.close()
    return chat_id

def add_message(chat_id: str, role: str, content: str):
    """Add a message to a chat."""
    conn = sqlite3.connect(DB_PATH)
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
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM chats ORDER BY created_at DESC')
    rows = cursor.fetchall()
    chats = [dict(row) for row in rows]
    conn.close()
    return chats

def get_chat_messages(chat_id: str) -> List[Dict]:
    """Get all messages for a specific chat."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute('SELECT role, content FROM messages WHERE chat_id = ? ORDER BY id ASC', (chat_id,))
    rows = cursor.fetchall()
    messages = [dict(row) for row in rows]
    conn.close()
    return messages

def delete_chat(chat_id: str):
    """Delete a chat and its messages."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('DELETE FROM messages WHERE chat_id = ?', (chat_id,))
    cursor.execute('DELETE FROM chats WHERE id = ?', (chat_id,))
    conn.commit()
    conn.close()
