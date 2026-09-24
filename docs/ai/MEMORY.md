# MEMORY — chat-bot

> Current state only. Rewritten when reality changes; never a diary, never contradictory facts side by side. Read top to bottom at every session start. No secrets.

## Current Position

- Completed Phase 2: Orchestrator package exports & /api/agent/task planning endpoint.
- Completed Phase 3: RAG KnowledgeStore with SQLite FTS5, BM25 ranking, search_knowledge & store_knowledge tools, and knowledge management endpoints.
- Completed Phase 4: Model Context Protocol (MCP) engine (stdio JSON-RPC client, MCPManager, mcp_config.json, /api/mcp/servers, and /api/mcp/reload).
- Fixed conversation history resurrection bug: added atomic `DELETE /api/chats` endpoint and synchronized ground-truth cache purge across backend, React state, and browser localStorage.
- All 10 automated test suites in `test_agent_suite.py` passing cleanly.
- Frontend and backend daemons active and listening on ports 3000 and 8000.
- Zero git commits or pushes made. Ready for owner testing.

## Fixed Decisions

- `ADR-001`: Python FastAPI backend serves as primary agent orchestration engine and tool execution sandbox.
- `ADR-002`: Filesystem operations are strictly jailed inside `ai-assistant/workspace/`.
- `ADR-003`: Sensitive credentials redacted via regex scrubbers before persistence or client emission.

## Architecture

- Frontend: React 19 + Vite 7 SPA (Chat UI, VoiceModeModal, WeatherChip, MarkdownBlocks, real-time agent status pill).
- Backend: Python FastAPI (`main.py`, `database.py`) delegating chat streaming to `AgentOrchestrator`.
- Tools: Web search, weather, calculator, workspace file operations, and allowlisted public APIs.

## Features

- Multi-turn conversation with SQLite database persistence and turn role alternation.
- Neural text-to-speech with edge-tts and Web Speech API fallback.
- Voice mode with real-time barge-in interruption detection and speech continuation.
- Native tool routing with Gemini function calling and tool verification.
- Semantic RAG Knowledge Base with SQLite FTS5 BM25 search and automatic prompt context injection.
- Model Context Protocol (MCP) stdio JSON-RPC client and dynamic server manager.
- In-chat collapsible tool execution cards displaying real-time arguments, outcomes, and verification badges.
- Frontend Knowledge & MCP Manager with document file upload, manual snippet indexing, and live server reload.

## Environment

- Backend: Run with `./venv-win/Scripts/uvicorn.exe main:app --host 127.0.0.1 --port 8000 --reload` from `ai-assistant/server`.
- Frontend: Run with `npm run dev` from `ai-assistant/frontend` (port 3000 proxies `/api` to 8000).
- Keys required: `GEMINI_API_KEY` in `ai-assistant/server/.env`.

## Gotchas

- Exponentiation in calculator tool capped at 1000 to prevent denial-of-service.
- Paths in workspace tool with `..` or escaping prefixes are rejected with PermissionError.

## Deferred Work

- None. All phases (0 through 5) complete.

## Deviations

- None.

## Open Questions

- None. Ready for owner test.
