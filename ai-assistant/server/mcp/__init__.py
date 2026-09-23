"""
Model Context Protocol (MCP) package for Gabby AI.
Enables dynamic tool discovery and execution from external stdio MCP servers.
"""

from .client import MCPProcessClient
from .manager import MCPManager, MCPToolAdapter, default_mcp_manager

__all__ = [
    "MCPProcessClient",
    "MCPManager",
    "MCPToolAdapter",
    "default_mcp_manager"
]
