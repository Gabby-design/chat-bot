"""
Standard IO JSON-RPC 2.0 Client for Model Context Protocol (MCP) servers.
Manages subprocess lifecycle, asynchronous message passing, tool schema discovery,
and tool execution.
"""

from typing import Dict, Any, List, Optional
import asyncio
import json
import os
import logging

logger = logging.getLogger("gabby.mcp.client")

class MCPProcessClient:
    """
    Client connecting to a local MCP server subprocess via standard input/output.
    Implements MCP protocol handshake, tools/list discovery, and tools/call execution.
    """
    def __init__(
        self,
        name: str,
        command: str,
        args: Optional[List[str]] = None,
        env: Optional[Dict[str, str]] = None,
        cwd: Optional[str] = None
    ):
        self.name = name
        self.command = command
        self.args = args or []
        self.env = env or {}
        self.cwd = cwd
        self.process: Optional[asyncio.subprocess.Process] = None
        self._reader_task: Optional[asyncio.Task] = None
        self._pending_requests: Dict[int, asyncio.Future] = {}
        self._request_counter = 0
        self.is_connected = False
        self.discovered_tools: List[Dict[str, Any]] = []

    async def start(self, timeout: float = 12.0) -> bool:
        """
        Spawn MCP subprocess and complete protocol initialization handshake.
        """
        try:
            merged_env = os.environ.copy()
            merged_env.update(self.env)

            logger.info(f"Starting MCP server '{self.name}': {self.command} {' '.join(self.args)}")
            self.process = await asyncio.create_subprocess_exec(
                self.command,
                *self.args,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=merged_env,
                cwd=self.cwd
            )

            self._reader_task = asyncio.create_task(self._listen_stdout())

            # Complete MCP handshake
            init_res = await self.send_request(
                "initialize",
                {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {},
                    "clientInfo": {"name": "gabby-agent", "version": "2.0.0"}
                },
                timeout=timeout
            )

            await self.send_notification("notifications/initialized", {})

            # Discover available tools
            tools_res = await self.send_request("tools/list", {}, timeout=timeout)
            raw_tools = tools_res.get("tools", []) if isinstance(tools_res, dict) else []
            self.discovered_tools = raw_tools

            self.is_connected = True
            logger.info(f"MCP server '{self.name}' initialized. Discovered {len(self.discovered_tools)} tools.")
            return True
        except Exception as e:
            logger.error(f"Failed to start MCP server '{self.name}': {e}")
            await self.stop()
            return False

    async def _listen_stdout(self):
        """
        Continuously read JSON-RPC responses from subprocess stdout.
        """
        try:
            while self.process and self.process.stdout and not self.process.stdout.at_eof():
                line = await self.process.stdout.readline()
                if not line:
                    break
                line_str = line.decode("utf-8", errors="ignore").strip()
                if not line_str:
                    continue
                try:
                    message = json.loads(line_str)
                    self._dispatch_message(message)
                except json.JSONDecodeError:
                    logger.debug(f"[{self.name} stderr/raw]: {line_str}")
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"Reader error in MCP client '{self.name}': {e}")
        finally:
            self.is_connected = False

    def _dispatch_message(self, message: Dict[str, Any]):
        """
        Match incoming response to pending request future.
        """
        msg_id = message.get("id")
        if msg_id is not None and msg_id in self._pending_requests:
            future = self._pending_requests.pop(msg_id)
            if not future.done():
                if "error" in message:
                    err = message["error"]
                    err_msg = err.get("message", str(err)) if isinstance(err, dict) else str(err)
                    future.set_exception(RuntimeError(f"MCP error: {err_msg}"))
                else:
                    future.set_result(message.get("result", {}))

    async def send_request(self, method: str, params: Optional[Dict[str, Any]] = None, timeout: float = 15.0) -> Any:
        """
        Send a JSON-RPC 2.0 request and await corresponding response.
        """
        if not self.process or not self.process.stdin:
            raise RuntimeError(f"MCP server '{self.name}' is not running.")

        self._request_counter += 1
        req_id = self._request_counter
        payload = {
            "jsonrpc": "2.0",
            "id": req_id,
            "method": method,
            "params": params or {}
        }

        loop = asyncio.get_running_loop()
        future = loop.create_future()
        self._pending_requests[req_id] = future

        msg_bytes = (json.dumps(payload) + "\n").encode("utf-8")
        self.process.stdin.write(msg_bytes)
        await self.process.stdin.drain()

        try:
            return await asyncio.wait_for(future, timeout=timeout)
        except asyncio.TimeoutError:
            self._pending_requests.pop(req_id, None)
            raise TimeoutError(f"Request '{method}' (id={req_id}) to MCP server '{self.name}' timed out after {timeout}s.")

    async def send_notification(self, method: str, params: Optional[Dict[str, Any]] = None):
        """
        Send a one-way JSON-RPC notification.
        """
        if not self.process or not self.process.stdin:
            return
        payload = {
            "jsonrpc": "2.0",
            "method": method,
            "params": params or {}
        }
        msg_bytes = (json.dumps(payload) + "\n").encode("utf-8")
        self.process.stdin.write(msg_bytes)
        await self.process.stdin.drain()

    async def call_tool(self, tool_name: str, arguments: Dict[str, Any], timeout: float = 30.0) -> Dict[str, Any]:
        """
        Invoke an MCP tool via 'tools/call' and normalize content response.
        """
        res = await self.send_request(
            "tools/call",
            {"name": tool_name, "arguments": arguments or {}},
            timeout=timeout
        )
        content_items = res.get("content", []) if isinstance(res, dict) else []
        texts = []
        for item in content_items:
            if isinstance(item, dict) and item.get("type") == "text":
                texts.append(item.get("text", ""))
            elif isinstance(item, str):
                texts.append(item)

        output_text = "\n".join(texts) if texts else json.dumps(res)
        is_error = res.get("isError", False) if isinstance(res, dict) else False

        return {
            "success": not is_error,
            "output": output_text,
            "raw": res
        }

    async def stop(self):
        """
        Cleanly terminate subprocess and clean up pending requests.
        """
        self.is_connected = False
        for fut in self._pending_requests.values():
            if not fut.done():
                fut.cancel()
        self._pending_requests.clear()

        if self._reader_task and not self._reader_task.done():
            self._reader_task.cancel()

        if self.process:
            try:
                if self.process.stdin and not self.process.stdin.is_closing():
                    self.process.stdin.close()
                self.process.terminate()
                try:
                    await asyncio.wait_for(self.process.wait(), timeout=2.0)
                except asyncio.TimeoutError:
                    self.process.kill()
            except Exception:
                pass
            self.process = None

        logger.info(f"MCP server '{self.name}' stopped.")
