"""
Tool registry and Gemini tool schema builder for Gabby AI Agent.
Manages tool discovery, permission filtering, and execution dispatching.
"""

from typing import Dict, List, Any, Optional
import logging
from .base import BaseTool, ToolResult
from .search_tool import WebSearchTool
from .weather_tool import WeatherTool
from .calculator_tool import CalculatorTool
from .workspace_tool import WorkspaceFileTool
from .public_apis.tool import PublicApiTool
from .rag_tool import SearchKnowledgeTool, StoreKnowledgeTool

logger = logging.getLogger("gabby.tools.registry")

class ToolRegistry:
    def __init__(self):
        self._tools: Dict[str, BaseTool] = {}
        self._register_default_tools()

    def _register_default_tools(self):
        self.register(WebSearchTool())
        self.register(WeatherTool())
        self.register(CalculatorTool())
        self.register(WorkspaceFileTool())
        self.register(PublicApiTool())
        self.register(SearchKnowledgeTool())
        self.register(StoreKnowledgeTool())

    def register(self, tool: BaseTool):
        if not tool.name:
            raise ValueError(f"Tool {tool.__class__.__name__} must define a unique 'name'.")
        self._tools[tool.name] = tool
        logger.info(f"Registered tool: {tool.name}")

    def get(self, name: str) -> Optional[BaseTool]:
        return self._tools.get(name)

    def list_tools(self) -> List[BaseTool]:
        return list(self._tools.values())

    def get_tool_names(self) -> List[str]:
        return list(self._tools.keys())

    def to_gemini_declarations(self, tool_names: Optional[List[str]] = None) -> List[Dict[str, Any]]:
        """
        Build function declarations compatible with Google GenAI SDK.
        """
        declarations = []
        selected = tool_names or self._tools.keys()
        for name in selected:
            tool = self._tools.get(name)
            if tool:
                declarations.append(tool.to_gemini_declaration())
        return declarations

    async def execute(self, name: str, arguments: Dict[str, Any]) -> ToolResult:
        """
        Safely execute a tool by name with arguments.
        """
        tool = self.get(name)
        if not tool:
            err = f"Unknown tool: '{name}'. Available tools: {', '.join(self._tools.keys())}"
            logger.error(err)
            return ToolResult(success=False, error=err, tool_name=name)

        args = arguments or {}
        logger.info(f"Executing tool '{name}' with args: {list(args.keys())}")
        return await tool.execute(**args)

# Global default tool registry
default_tool_registry = ToolRegistry()
