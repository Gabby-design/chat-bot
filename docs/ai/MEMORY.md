# MEMORY — chat-bot

> Current state only. Rewritten when reality changes; never a diary, never contradictory facts side by side. Read top to bottom at every session start. No secrets.

## Current Position

- Owner: **Master** (address as Master across all sessions)

- Completed Phase 2: Orchestrator package exports & /api/agent/task planning endpoint.
- Completed Phase 3: RAG KnowledgeStore with SQLite FTS5, BM25 ranking, search_knowledge & store_knowledge tools, and knowledge management endpoints.
- Completed Phase 4: Model Context Protocol (MCP) engine (stdio JSON-RPC client, MCPManager, mcp_config.json, /api/mcp/servers, and /api/mcp/reload).
- Fixed Google Gemini model resilience & quota failover: prioritized high-availability models (`gemini-3.5-flash-lite`, `gemini-3.1-flash-lite`, `gemini-flash-lite-latest`) before rate-limited models (`gemini-3.6-flash`), and decoupled HTTP 429 errors from key termination so candidate keys test all available models.
- Fixed Gemini upstream authentication & environment variable resilience: multi-name key resolution (GEMINI_API_KEY, GOOGLE_API_KEY, GEMINI_KEY, API_KEY), automatic stripping of accidental key name prefixes (e.g., apikey=), direct unmasked diagnostic reporting for 401/403/configuration errors, restored ApiKeyModal fallback for resilient client keys, and automatic multi-candidate key failover loop (`candidateLoop`) in serverless `/api/chat/stream` and `/api/tts` endpoints.
- Fixed Wikipedia search proxy: added compliant User-Agent header ensuring fallback search succeeds on serverless environments without blocking.
- Fixed SQLite schema migration in `database.py`: replaced invalid `ALTER TABLE ... DEFAULT CURRENT_TIMESTAMP` with valid SQLite syntax and backfill, resolving `OperationalError: no such column: updated_at`.
- Fixed `main.py` dotenv loading: resolved `.env` path via `__file__` so `server/.env` is reliably discovered across working directories.
- Upgraded Spoken Voice Mode: integrated Gemini Live oral fluency prompt (bite-sized turns, contractions, symbol expansion, zero markdown, empathetic reactive openings, conversational ball-toss turn-taking, single-speaker microphone isolation) across serverless and orchestrator runtimes; redesigned Voice Orb with fluid multi-layered plasma aura, organic floating physics, and frosted glass status indicators.
- Implemented Custom Gems & AI Persona Builder: 8 built-in personas (Code Expert, Writing Assistant, Math Tutor, Brainstormer, Research Analyst, Data & SQL Architect, Language Polyglot, Executive Coach), rich Gem Builder modal drawer with icon/color customization, AI-assisted prompt drafting, export/import JSON, dynamic empty-state greeting & custom starter prompt cards, input pill indicator, and live streaming injection for both chat and spoken voice modes.
- Fixed serverless `/api/chat/stream` 500 error: restored missing `baseIntelligence` prompt definition in `api/chat/stream.js` and `ai-assistant/frontend/api/chat/stream.js`, added top-level try/catch blocks for reliable SSE error reporting.
- Full production verification on Vercel (`https://gabby-ai-appgabby-v2.vercel.app`): static bundle, chat streaming, voice streaming, neural TTS, custom gem persona resolution, Wikipedia search, and weather APIs verified with 100% pass rate. Local test suite passing cleanly, frontend build with 0 errors.

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
