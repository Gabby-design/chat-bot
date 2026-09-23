"""
Sandboxed workspace file tool for Gabby AI Agent.
Allows creating, reading, listing, and inspecting files strictly jailed inside
the user workspace directory (ai-assistant/workspace/).
Path traversal attacks outside the sandbox are strictly prohibited.
"""

from typing import Dict, Any, List
import os
import pathlib
from .base import BaseTool, PermissionLevel

# Root sandbox directory for user-created files and projects
SERVER_DIR = pathlib.Path(__file__).parent.parent.resolve()
WORKSPACE_ROOT = (SERVER_DIR.parent / "workspace").resolve()

def _resolve_safe_path(rel_path: str) -> pathlib.Path:
    """
    Resolve relative path against WORKSPACE_ROOT and ensure it cannot escape the jail.
    """
    WORKSPACE_ROOT.mkdir(parents=True, exist_ok=True)
    clean = (rel_path or "").strip().lstrip("/\\")
    target = (WORKSPACE_ROOT / clean).resolve()

    if not str(target).startswith(str(WORKSPACE_ROOT)):
        raise PermissionError(f"Access denied: Path '{rel_path}' escapes the workspace sandbox.")
    return target

class WorkspaceFileTool(BaseTool):
    name = "workspace_file"
    description = (
        "Work with files in the user workspace: create files, write code or projects, "
        "read files, and list workspace contents. All files are safely sandboxed in the workspace."
    )
    permission_level = PermissionLevel.WORKSPACE_WRITE
    timeout_seconds = 8.0

    parameters = {
        "type": "OBJECT",
        "properties": {
            "action": {
                "type": "STRING",
                "description": "Action to perform: 'write', 'read', or 'list'.",
                "enum": ["write", "read", "list"]
            },
            "path": {
                "type": "STRING",
                "description": "Relative file or directory path inside workspace (e.g. 'notes.txt', 'src/main.py', or '' for root)."
            },
            "content": {
                "type": "STRING",
                "description": "Text content to write when action is 'write'."
            }
        },
        "required": ["action"]
    }

    async def run(self, action: str, path: str = "", content: str = "") -> Dict[str, Any]:
        action = (action or "").lower().strip()

        if action == "write":
            if not path:
                return {"error": "Path is required for write action."}
            target_path = _resolve_safe_path(path)
            target_path.parent.mkdir(parents=True, exist_ok=True)

            with open(target_path, "w", encoding="utf-8") as f:
                f.write(content or "")

            size = target_path.stat().st_size
            lines = len((content or "").splitlines())
            return {
                "action": "write",
                "path": str(target_path.relative_to(WORKSPACE_ROOT)).replace("\\", "/"),
                "status": "created_or_updated",
                "bytes_written": size,
                "lines": lines,
                "verified": target_path.exists()
            }

        elif action == "read":
            if not path:
                return {"error": "Path is required for read action."}
            target_path = _resolve_safe_path(path)
            if not target_path.exists():
                return {"error": f"File not found: {path}"}
            if target_path.is_dir():
                return {"error": f"Path is a directory, not a file: {path}. Use action 'list'."}

            # Size check to prevent giant file memory saturation (max 512KB)
            if target_path.stat().st_size > 512 * 1024:
                return {"error": "File exceeds maximum 512KB read size."}

            with open(target_path, "r", encoding="utf-8", errors="replace") as f:
                data = f.read()

            return {
                "action": "read",
                "path": str(target_path.relative_to(WORKSPACE_ROOT)).replace("\\", "/"),
                "content": data,
                "lines": len(data.splitlines()),
                "size_bytes": target_path.stat().st_size
            }

        elif action == "list":
            target_dir = _resolve_safe_path(path)
            if not target_dir.exists():
                return {"action": "list", "files": [], "notice": "Workspace is currently empty."}

            items: List[Dict[str, Any]] = []
            for root, dirs, files in os.walk(target_dir):
                for d in dirs:
                    p = pathlib.Path(root) / d
                    items.append({
                        "name": str(p.relative_to(WORKSPACE_ROOT)).replace("\\", "/"),
                        "type": "directory"
                    })
                for f in files:
                    p = pathlib.Path(root) / f
                    items.append({
                        "name": str(p.relative_to(WORKSPACE_ROOT)).replace("\\", "/"),
                        "type": "file",
                        "size_bytes": p.stat().st_size
                    })

            return {
                "action": "list",
                "workspace_path": str(target_dir.relative_to(WORKSPACE_ROOT)).replace("\\", "/") or ".",
                "item_count": len(items),
                "items": items[:50]
            }

        else:
            return {"error": f"Unknown action: '{action}'. Must be 'write', 'read', or 'list'."}
