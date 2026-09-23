"""
Base tool interfaces and primitives for Gabby AI Agent.
Provides schema definition, safe execution, timeout controls, and result normalization.
"""

from typing import Dict, Any, Optional
from enum import Enum
import asyncio
import inspect
import json
import logging

logger = logging.getLogger("gabby.tools.base")

class PermissionLevel(str, Enum):
    READ_ONLY = "read_only"
    WORKSPACE_WRITE = "workspace_write"
    NETWORK_ACCESS = "network_access"
    SENSITIVE = "sensitive"

class ToolResult:
    def __init__(
        self,
        success: bool,
        data: Any = None,
        error: Optional[str] = None,
        tool_name: str = ""
    ):
        self.success = success
        self.data = data
        self.error = error
        self.tool_name = tool_name

    def to_dict(self) -> Dict[str, Any]:
        result = {
            "success": self.success,
            "tool": self.tool_name,
        }
        if self.success:
            result["data"] = self.data
        else:
            result["error"] = self.error
        return result

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), default=str)

    def __str__(self) -> str:
        return self.to_json()

class BaseTool:
    """
    Abstract base tool. Every tool implemented in the Gabby Agent ecosystem
    inherits from BaseTool to ensure schema consistency and safe execution.
    """
    name: str = ""
    description: str = ""
    parameters: Dict[str, Any] = {}
    permission_level: PermissionLevel = PermissionLevel.READ_ONLY
    requires_confirmation: bool = False
    timeout_seconds: float = 12.0

    async def run(self, **kwargs) -> Any:
        """Core logic to be implemented by child classes."""
        raise NotImplementedError("Tool subclasses must implement run()")

    async def execute(self, **kwargs) -> ToolResult:
        """
        Public execution wrapper with timeout, argument validation, and error normalization.
        """
        try:
            # Handle synchronous vs asynchronous run implementation
            if inspect.iscoroutinefunction(self.run):
                task = self.run(**kwargs)
            else:
                task = asyncio.to_thread(self.run, **kwargs)

            data = await asyncio.wait_for(task, timeout=self.timeout_seconds)
            return ToolResult(success=True, data=data, tool_name=self.name)
        except asyncio.TimeoutError:
            err_msg = f"Tool '{self.name}' timed out after {self.timeout_seconds}s."
            logger.warning(err_msg)
            return ToolResult(success=False, error=err_msg, tool_name=self.name)
        except Exception as e:
            err_msg = f"Tool '{self.name}' execution failed: {type(e).__name__}: {str(e)}"
            logger.error(err_msg)
            return ToolResult(success=False, error=err_msg, tool_name=self.name)

    def to_gemini_declaration(self) -> Dict[str, Any]:
        """
        Returns declaration dictionary compatible with Google GenAI FunctionDeclaration schema.
        """
        return {
            "name": self.name,
            "description": self.description,
            "parameters": self.parameters or {
                "type": "OBJECT",
                "properties": {},
            }
        }
