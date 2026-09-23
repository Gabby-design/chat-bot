"""
MCP Server Manager and Dynamic Tool Adapter for Gabby AI Agent.
Reads mcp_config.json, launches stdio servers, translates tool schemas,
and registers them into ToolRegistry.
"""

from typing import Dict, Any, List, Optional
import os
import json
import pathlib
import logging

from tools.base import BaseTool, PermissionLevel, ToolResult
from tools.registry import default_tool_registry, ToolRegistry
from .client import MCPProcessClient

logger = logging.getLogger("gabby.mcp.manager")

CONFIG_PATH = pathlib.Path(__file__).parent.parent / "mcp_config.json"

class MCPToolAdapter(BaseTool):
    """
    Adapter converting an external MCP tool into a Gabby BaseTool instance.
    """
    def __init__(
        self,
        server_name: str,
        tool_meta: Dict[str, Any],
        client: MCPProcessClient
    ):
        raw_name = tool_meta.get("name", "unknown")
        # Format name for Gemini compatibility (alphanumeric and underscores only)
        clean_server = server_name.replace("-", "_").lower()
        clean_tool = raw_name.replace("-", "_").lower()
        self.name = f"mcp_{clean_server}_{clean_tool}"
        self.raw_tool_name = raw_name
        self.server_name = server_name
        self.description = f"[{server_name.upper()} MCP] " + tool_meta.get("description", f"Tool from {server_name} MCP server.")
        self.parameters = tool_meta.get("inputSchema", {"type": "object", "properties": {}})
        self.permission_level = PermissionLevel.NETWORK_ACCESS
        self.requires_confirmation = False
        self.client = client

    async def run(self, **kwargs) -> Dict[str, Any]:
        result = await self.client.call_tool(self.raw_tool_name, kwargs)
        return result

class MCPManager:
    """
    Central manager for external Model Context Protocol (MCP) servers.
    """
    def __init__(self, tool_registry: Optional[ToolRegistry] = None, config_path: Optional[pathlib.Path] = None):
        self.tool_registry = tool_registry or default_tool_registry
        self.config_path = config_path or CONFIG_PATH
        self.clients: Dict[str, MCPProcessClient] = {}
        self.registered_tool_names: List[str] = []

    def load_config(self) -> Dict[str, Any]:
        """
        Load mcp_config.json, creating default template if missing.
        """
        if not self.config_path.exists():
            default_config = {
                "mcpServers": {}
            }
            try:
                self.config_path.write_text(json.dumps(default_config, indent=2), encoding="utf-8")
                logger.info(f"Created default MCP config at {self.config_path}")
            except Exception as e:
                logger.error(f"Failed to create default MCP config: {e}")
            return default_config

        try:
            return json.loads(self.config_path.read_text(encoding="utf-8"))
        except Exception as e:
            logger.error(f"Failed to read MCP config: {e}")
            return {"mcpServers": {}}

    async def initialize(self):
        """
        Start configured MCP servers and register discovered tools.
        """
        config = self.load_config()
        servers = config.get("mcpServers", {})

        if not servers:
            logger.info("No external MCP servers configured in mcp_config.json.")
            return

        for s_name, s_cfg in servers.items():
            if not isinstance(s_cfg, dict):
                continue
            command = s_cfg.get("command")
            if not command:
                continue

            args = s_cfg.get("args", [])
            env = s_cfg.get("env", {})
            cwd = s_cfg.get("cwd")

            client = MCPProcessClient(
                name=s_name,
                command=command,
                args=args,
                env=env,
                cwd=cwd
            )

            connected = await client.start()
            if connected:
                self.clients[s_name] = client
                self._register_client_tools(client)

    def _register_client_tools(self, client: MCPProcessClient):
        """
        Wrap MCP tools and add to ToolRegistry.
        """
        for tool_meta in client.discovered_tools:
            try:
                adapter = MCPToolAdapter(client.name, tool_meta, client)
                self.tool_registry.register(adapter)
                self.registered_tool_names.append(adapter.name)
                logger.info(f"Registered MCP tool '{adapter.name}' from server '{client.name}'")
            except Exception as e:
                logger.error(f"Failed to register MCP tool {tool_meta.get('name')}: {e}")

    async def reload(self) -> Dict[str, Any]:
        """
        Hot-reload MCP server configuration.
        """
        await self.shutdown()
        await self.initialize()
        return self.get_server_statuses()

    def get_server_statuses(self) -> Dict[str, Any]:
        """
        Return status summary of all configured and running MCP servers.
        """
        config = self.load_config()
        servers_cfg = config.get("mcpServers", {})
        result = {}

        for name, cfg in servers_cfg.items():
            client = self.clients.get(name)
            if client and client.is_connected:
                status = "connected"
                tools = [t.get("name") for t in client.discovered_tools]
            else:
                status = "configured_offline"
                tools = []
            result[name] = {
                "status": status,
                "command": cfg.get("command"),
                "tool_count": len(tools),
                "tools": tools
            }

        return {
            "total_servers": len(servers_cfg),
            "active_servers": len(self.clients),
            "registered_mcp_tools": self.registered_tool_names,
            "servers": result
        }

    async def shutdown(self):
        """
        Gracefully stop all running MCP subprocesses.
        """
        for name, client in list(self.clients.items()):
            try:
                await client.stop()
            except Exception as e:
                logger.warning(f"Error stopping MCP client '{name}': {e}")
        self.clients.clear()
        self.registered_tool_names.clear()
        logger.info("All MCP servers shutdown.")

# Global singleton instance
default_mcp_manager = MCPManager()
