---
doc: plans/plan-custom-gems-persona-builder
purpose: "Implement Custom Gems and AI Persona Builder in Gabby frontend and streaming runtimes"
authority: canonical
hosts_rules: []
mirrors_rules: []
last_reviewed: "2026-10-06"
---

# Plan — Custom Gems and AI Persona Builder

**Status:** complete · **Classification:** feature · **Source:** User explicit request · **Owner approval:** 2026-10-06

## Objective
Provide a full-featured Gems & AI Persona Builder allowing users to select built-in specialist personas, build, edit, prompt-engineer, test, and persist custom specialist Gems in Gabby, with dynamic prompt injection into both chat streaming and spoken voice modes.

## Scope
1. Dedicated `GemsModal.jsx` component replacing the temporary inline prompt.
2. Built-in Gems catalog: Code Expert, Writing Assistant, Math Tutor, Brainstormer, Research Assistant, Data/SQL Master, Language Polyglot, Executive Coach.
3. Custom Gem Builder form: Name, Description/Tagline, Custom System Instructions, Theme Color/Gradient, Icon selector, Starter Prompts.
4. AI Prompt Generator / Assist: auto-expand a brief concept into comprehensive system instructions.
5. Persistent storage in `localStorage` with Edit, Delete, Duplicate, and JSON Export/Import capabilities.
6. Header & Input Active Gem indicators, dynamic empty-state starter cards, and persona-aware voice mode integration.
7. Backend update in `api/chat/stream.js` and `ai-assistant/frontend/api/chat/stream.js` to combine active personas with chat and spoken voice prompts.

## Ordered tasks

| ID | Task | Acceptance criteria | Status |
| --- | --- | --- | --- |
| T1 | Create `GemsModal.jsx` component | Full modal/drawer with catalog, builder form, icon/color picker, AI assist, and JSON import/export | done |
| T2 | Update `App.jsx` integration | Active Gem pill in header/input, custom starter cards in empty state, state management | done |
| T3 | Update `api/chat/stream.js` and frontend copy | Full persona resolution for built-in and custom gems in chat and voice mode | done |
| T4 | Verification & Quality Gates | `npm run lint` and `npm run build` pass with 0 errors; live test verified | done |
| T5 | Deploy & Live Verification | Push to GitHub `origin/main`, test on Vercel production | done |

## Verification
- ESLint: 0 errors
- Vite build: dist/ bundle generated with 0 errors
- Live endpoint: returns custom persona-tailored response in chat and voice
