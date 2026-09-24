"""
Comprehensive automated test suite for Gabby Agent modular core.
Tests tool execution, sandboxing, verifier, memory, planner, orchestrator re-exports,
and RAG knowledge store.
"""

import sys
import os
import asyncio
import pathlib

# Ensure server is on path
CURRENT_DIR = pathlib.Path(__file__).parent.resolve()
if str(CURRENT_DIR) not in sys.path:
    sys.path.insert(0, str(CURRENT_DIR))

from tools import default_tool_registry, CalculatorTool, WorkspaceFileTool, WeatherTool, WebSearchTool
from memory import MemoryManager, scrub_secrets
from agent import select_specialist, TaskPlanner, ToolVerifier
from orchestrator import AgentOrchestrator, TaskPlanner as OrchPlanner
from rag import default_knowledge_store, KnowledgeStore

async def test_tools():
    print("[TEST 1] Testing Tool Registry...")
    tools = default_tool_registry.get_tool_names()
    assert "calculate" in tools, "calculate tool missing"
    assert "workspace_file" in tools, "workspace_file tool missing"
    assert "web_search" in tools, "web_search tool missing"
    assert "get_weather" in tools, "get_weather tool missing"
    assert "call_public_api" in tools, "call_public_api tool missing"
    assert "search_knowledge" in tools, "search_knowledge tool missing"
    assert "store_knowledge" in tools, "store_knowledge tool missing"
    print("  -> Passed: Registry has all 7 core tools including knowledge retrieval.")

    print("[TEST 2] Testing Calculator Tool (AST-based safe evaluation)...")
    calc = CalculatorTool()
    res1 = await calc.execute(expression="2 + 3 * 4")
    assert res1.success and res1.data["result"] == 14, f"Failed: {res1.data}"

    res2 = await calc.execute(expression="sqrt(144) + 10")
    assert res2.success and res2.data["result"] == 22, f"Failed: {res2.data}"

    res3 = await calc.execute(expression="10 / 0")
    assert res3.success and "error" in res3.data, "Division by zero should be caught"
    print("  -> Passed: Calculator accurately evaluates arithmetic & handles errors.")

    print("[TEST 3] Testing Workspace File Tool (Sandbox & Path Traversal)...")
    ws = WorkspaceFileTool()
    write_res = await ws.execute(action="write", path="test_dir/sample.txt", content="Sample agent output")
    assert write_res.success, f"Write failed: {write_res.error}"
    assert write_res.data["verified"] is True, "Verification flag should be True"

    read_res = await ws.execute(action="read", path="test_dir/sample.txt")
    assert read_res.success and read_res.data["content"] == "Sample agent output", f"Read failed: {read_res.data}"

    # Test Path Traversal Prevention
    jailbreak_res = await ws.execute(action="read", path="../../sensitive.txt")
    assert not jailbreak_res.success or "error" in jailbreak_res.to_dict(), "Jailbreak should fail"
    print("  -> Passed: Workspace file tool creates files & prevents directory traversal.")

    print("[TEST 4] Testing Tool Verifier...")
    verif = ToolVerifier.verify_tool_result("calculate", {"expression": "2+2"}, {"success": True, "data": {"result": 4}})
    assert verif["verified"] is True, "Calculation verification failed"

    failed_verif = ToolVerifier.verify_tool_result("calculate", {}, {"success": False, "error": "Invalid syntax"})
    assert failed_verif["verified"] is False, "Failed tool should not be verified"
    print("  -> Passed: Tool Verifier validates post-conditions.")

    print("[TEST 5] Testing Memory Secret Scrubber...")
    dirty = "API Key is AIzaSyD3fakeAPIkey1234567890abcdef and token is Bearer sk-ant-api03-abcdefg"
    clean = scrub_secrets(dirty)
    assert "AIza" not in clean, "Google API key was not redacted"
    assert "sk-" not in clean, "Bearer token key was not redacted"
    assert "[REDACTED_CREDENTIAL]" in clean, "Redaction token missing"
    print("  -> Passed: Secret scrubber redacts credentials.")

    print("[TEST 6] Testing Task Planner & Specialist Routing...")
    plan = TaskPlanner.plan_task("Research the latest Mars rover discoveries and save a report to my workspace")
    assert plan["is_complex"] is True, "Multi-step prompt should be marked complex"

    role_code = select_specialist("Write a python class for binary search tree")
    assert role_code.name == "code", f"Should route to code role, got {role_code.name}"

    role_math = select_specialist("Calculate the compound interest on $5000 at 8% for 10 years")
    assert role_math.name == "math", f"Should route to math role, got {role_math.name}"
    print("  -> Passed: Intent decomposition and specialist routing verified.")

    print("[TEST 7] Testing Orchestrator Re-Exports...")
    assert AgentOrchestrator is not None, "AgentOrchestrator export missing"
    assert OrchPlanner is not None, "TaskPlanner export missing"
    print("  -> Passed: Orchestrator package cleanly re-exports core agent components.")

    print("[TEST 8] Testing RAG Knowledge Store (FTS5 & Ingestion)...")
    default_knowledge_store.clear_all()
    s_id = default_knowledge_store.ingest(
        title="Project Architecture Guidelines",
        content="Gabby AI uses a modular architecture with sandboxed tools in ai-assistant/workspace.",
        tags=["guidelines", "architecture"]
    )
    assert s_id, "Snippet ingestion failed to return an ID"

    search_hits = default_knowledge_store.search("modular architecture sandboxed tools")
    assert len(search_hits) > 0, "FTS5 search returned 0 results"
    assert search_hits[0]["title"] == "Project Architecture Guidelines", "Incorrect snippet ranked first"

    all_items = default_knowledge_store.list_all(limit=10)
    assert len(all_items) >= 1, "list_all should return stored snippet"
    print("  -> Passed: Knowledge store ingests, indexes with FTS5, and ranks accurately.")

    print("[TEST 9] Testing Knowledge Tools via Registry...")
    store_tool = default_tool_registry.get("store_knowledge")
    assert store_tool is not None, "store_knowledge missing from registry"
    store_res = await store_tool.execute(
        title="Meeting Notes 2026",
        content="Decided to adopt SQLite FTS5 for zero-dependency RAG.",
        tags=["notes", "database"]
    )
    assert store_res.success, f"store_knowledge tool failed: {store_res.error}"

    search_tool = default_tool_registry.get("search_knowledge")
    assert search_tool is not None, "search_knowledge missing from registry"
    search_res = await search_tool.execute(query="SQLite FTS5 zero dependency")
    assert search_res.success, f"search_knowledge tool failed: {search_res.error}"
    assert search_res.data["count"] > 0, "search_knowledge returned no results"
    print("  -> Passed: Knowledge tools operate seamlessly via default_tool_registry.")

    print("[TEST 10] Testing Model Context Protocol (MCP) Manager...")
    from mcp import default_mcp_manager, MCPManager
    assert default_mcp_manager is not None, "default_mcp_manager missing"
    statuses = default_mcp_manager.get_server_statuses()
    assert "total_servers" in statuses, "get_server_statuses missing total_servers"
    assert "servers" in statuses, "get_server_statuses missing servers"
    print("  -> Passed: MCP Manager cleanly loads configuration and manages server statuses.")

    print("\nALL 10 AGENT CORE, ORCHESTRATOR, RAG & MCP TEST SUITES PASSED CLEANLY!")

if __name__ == "__main__":
    asyncio.run(test_tools())
