---
doc: ARCHITECTURE
purpose: "The current architectural model: workspaces, services, dependency directions, contracts, persistence, integrations, deployment shape, structural constraints"
authority: canonical
hosts_rules: []
mirrors_rules: []
last_reviewed: "2026-09-22"
---

# ARCHITECTURE — chat-bot

> How the repository is structured **now** — not how it was planned, not a directory listing. Document boundaries and why they exist, non-obvious constraints, what breaks if you touch a given thing, and where authority lives. Every statement is `[verified]` against the repository or tagged otherwise.

## 1. Repository shape

- `ai-assistant/frontend`: React 19 + Vite 7 SPA (Chat UI, VoiceModeModal, WeatherChip, MarkdownBlocks, PWA service worker).
- `ai-assistant/server`: Python FastAPI application (`main.py`, `database.py`, `chat.db`) providing `/api/chat/stream`, `/api/chats`, `/api/tts`, `/api/search`, `/api/weather`.
- `api/`: Vercel serverless Node.js functions (`api/chat/stream.js`, `api/chats.js`, `api/search.js`, `api/tts.js`, `api/weather.js`, `api/index.py`).
- `docs/ai/`: Canonical AI operating system rules, architecture, decisions, and memory.

## 2. Boundaries and dependency directions

- Frontend communicates strictly via HTTP / SSE to `/api/*` endpoints.
- No direct browser-to-Gemini credential communication; API keys are server-side only.
- In local development, Vite proxies `/api` requests to `http://127.0.0.1:8000` (FastAPI).
- On Vercel, requests route to `api/index.py` or serverless endpoints.

## 3. Cross-boundary contracts

- Chat Streaming: SSE `text/event-stream` returning `data: {"text": "..."}`, `data: {"type": "chat_id", ...}`, `data: {"type": "status", "message": "..."}`, `data: {"type": "reset_buffer"}`, and `data: [DONE]`.
- TTS: `POST /api/tts` returns `{ "audio": "<base64>", "voice": "...", "mimeType": "audio/mpeg" }`.
- Chat Management: `GET /api/chats`, `POST /api/chats`, `GET /api/chats/{id}`, `DELETE /api/chats/{id}`.

## 4. Persistence

- Primary store: SQLite (`ai-assistant/server/chat.db`) via WAL mode.
- Tables: `chats` (conversation headers, timestamps) and `messages` (turn history with roles: `user`, `assistant`).

## 5. Integrations

- LLM: Google Gemini via `google-genai` SDK (`gemini-3.6-flash`, fallbacks: `gemini-3.5-flash`, `gemini-3.7-flash`, `gemini-2.5-flash`, `gemini-2.5-pro`).
- Speech: Edge Neural TTS via `edge_tts` (Ana, Aria, Guy, Christopher, Eric).
- Search: Wikipedia REST API + DuckDuckGo Instant Answers + optional Tavily/Serper.
- Weather: Open-Meteo Geocoding and Forecast API.

## 6. Modular Agent Architecture

```text
Gabby UI (Text / Voice Mode)
       │
       ▼
SSE / REST API Layer (/api/chat/stream)
       │
       ▼
Agent Orchestrator (Multi-turn tool loop & status streaming)
       │
   ┌───┴────────────────────────┐
   ▼                            ▼
Task Planner & Verifier    Tool Router (Registry & Execution Sandbox)
                                ├── Web Search (Wikipedia / DDG / Tavily)
                                ├── Weather & Geocoding (Open-Meteo)
                                ├── Safe Calculator (AST Evaluator)
                                ├── Sandboxed Workspace (ai-assistant/workspace/)
                                └── Curated Public APIs (allowlisted HTTPS)
       │
       ▼
Gemini GenAI SDK (Native function calling & structured streaming)
```

## 7. Deployment shape

- Vercel: Frontend static bundle (`ai-assistant/frontend/dist`) + serverless API routing (`vercel.json`).
- Netlify: Alternative deployment target via `netlify.toml`.
- Local: Python FastAPI server (port 8000) + Vite dev server (port 3000).

## 8. Structural constraints

- Path Isolation: Workspace file modifications strictly jailed to `ai-assistant/workspace/`.
- Secret Safety: API keys scrubbed by regex from any error messages or logs.
- Turn Alternation: Gemini history strictly Alternates `user` and `model` turns.

