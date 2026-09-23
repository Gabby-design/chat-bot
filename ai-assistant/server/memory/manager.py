"""
Memory architecture for Gabby AI Agent.
Separates:
1. Conversation History (via SQLite database)
2. Short-term task state & tool execution audit
3. Long-term user preferences (key-value store in SQLite)
4. Secret scrubber preventing credential persistence
"""

from typing import Dict, Any, List, Optional
import sqlite3
import re
import json
import logging
import database

logger = logging.getLogger("gabby.memory")

# Sensitive credential patterns to scrub from all memory layers
SECRET_PATTERNS = [
    r'AIza[0-9A-Za-z\-_]{20,}',                      # Google API keys
    r'sk-[A-Za-z0-9\-_]{15,}',                       # OpenAI / OpenRouter / Anthropic keys
    r'AQ\.[0-9A-Za-z\-_]{20,}',                      # Google OAuth access tokens
    r'bearer\s+[0-9A-Za-z\-_.]+',                    # Bearer tokens
    r'ghp_[0-9A-Za-z]{20,}',                         # GitHub Personal Access Tokens
    r'password\s*[:=]\s*["\']?[^\s"\']+',            # Password fields
    r'api[_-]?key\s*[:=]\s*["\']?[0-9A-Za-z\-_]+',  # Generic API keys
]

def scrub_secrets(text: str) -> str:
    """
    Remove secrets, tokens, passwords, and sensitive credentials from text.
    """
    if not text or not isinstance(text, str):
        return text or ""
    scrubbed = text
    for pattern in SECRET_PATTERNS:
        scrubbed = re.sub(pattern, '[REDACTED_CREDENTIAL]', scrubbed, flags=re.IGNORECASE)
    return scrubbed

class MemoryManager:
    """
    Unified manager handling persistent preferences, session state, and conversation memory.
    """
    def __init__(self):
        self._init_memory_schema()

    def _init_memory_schema(self):
        """Create preferences table if not present."""
        try:
            with database._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('''
                CREATE TABLE IF NOT EXISTS user_preferences (
                    key TEXT PRIMARY KEY,
                    value TEXT,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                ''')
                conn.commit()
        except Exception as e:
            logger.error(f"Failed to initialize memory schema: {e}")

    # --- Long-term User Preferences ---
    def get_preference(self, key: str, default: Any = None) -> Any:
        try:
            with database._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('SELECT value FROM user_preferences WHERE key = ?', (key,))
                row = cursor.fetchone()
                if row:
                    try:
                        return json.loads(row[0])
                    except Exception:
                        return row[0]
                return default
        except Exception as e:
            logger.warning(f"Error reading preference '{key}': {e}")
            return default

    def set_preference(self, key: str, value: Any):
        safe_key = (key or "").strip()
        if not safe_key:
            return
        serialized = json.dumps(value) if not isinstance(value, str) else value
        scrubbed_val = scrub_secrets(serialized)
        try:
            with database._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('''
                INSERT INTO user_preferences (key, value, updated_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
                ''', (safe_key, scrubbed_val))
                conn.commit()
        except Exception as e:
            logger.error(f"Error saving preference '{key}': {e}")

    def get_all_preferences(self) -> Dict[str, Any]:
        try:
            with database._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('SELECT key, value FROM user_preferences')
                rows = cursor.fetchall()
                result = {}
                for k, v in rows:
                    try:
                        result[k] = json.loads(v)
                    except Exception:
                        result[k] = v
                return result
        except Exception as e:
            logger.warning(f"Error reading all preferences: {e}")
            return {}

    def delete_preference(self, key: str):
        try:
            with database._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('DELETE FROM user_preferences WHERE key = ?', (key,))
                conn.commit()
        except Exception as e:
            logger.error(f"Error deleting preference '{key}': {e}")

    # --- Short-term Task & Execution Context ---
    def create_task_context(self, chat_id: str) -> Dict[str, Any]:
        """
        Creates an ephemeral task tracking object for the active turn execution.
        """
        return {
            "chat_id": chat_id,
            "steps": [],
            "tools_called": [],
            "verifications": [],
            "error_recovers": 0
        }

    def record_tool_execution(self, task_context: Dict[str, Any], tool_name: str, args: Dict[str, Any], success: bool):
        safe_args = {k: scrub_secrets(str(v)) for k, v in (args or {}).items()}
        task_context["tools_called"].append({
            "tool": tool_name,
            "args": safe_args,
            "success": success
        })

default_memory_manager = MemoryManager()
