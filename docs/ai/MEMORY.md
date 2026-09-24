# MEMORY — chat-bot

> Current state only. Rewritten when reality changes; never a diary, never contradictory facts side by side. Read top to bottom at every session start. No secrets.

## Current Position

- Completed Phase 2: Orchestrator package exports & /api/agent/task planning endpoint.
- Completed Phase 3: RAG KnowledgeStore with SQLite FTS5, BM25 ranking, search_knowledge & store_knowledge tools, and knowledge management endpoints.
- Completed Phase 4: Model Context Protocol (MCP) engine (stdio JSON-RPC client, MCPManager, mcp_config.json, /api/mcp/servers, and /api/mcp/reload).
- Fixed Google Gemini model resilience: eliminated deprecated 404/503 models, configured robust fallback chain with Gemini 3.8 Flash, 3.6 Flash, 3.5 Flash Lite, and 3.1 Flash Lite.
- Fixed stream error opacity: parse raw upstream Google API error JSON (400 Invalid Key, 403 Permission Denied, 429 Quota Exceeded, 503 High Demand) instead of masking behind generic service busy messages.
- Fixed Gemini upstream authentication: added dual-auth header (x-goog-api-key) and query-param fallback supporting modern Google AI Studio keys (AQ. and AIza), OAuth access token (ya29.) detection, Bearer prefix sanitization, and explicit 401 unauthenticated diagnostic reporting.
- Added client-side Gemini API key configuration modal and x-gemini-api-key header forwarding to bypass Vercel server key limits.
- Resolved PWA console warning by removing e.preventDefault() on beforeinstallprompt so browser banner renders cleanly.
- All 10 automated test suites passing cleanly; frontend builds with 0 errors.

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
