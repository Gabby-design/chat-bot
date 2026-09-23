"""
Agent Orchestrator for Gabby AI.
Coordinates multi-turn conversations, tool routing, native Gemini function calling,
verification, model fallback failover, and real-time SSE streaming.
"""

from typing import Dict, Any, List, Optional, AsyncGenerator
import json
import asyncio
import os
import base64
import logging
from google import genai
from google.genai import types

import database
try:
    from tools.registry import default_tool_registry, ToolRegistry
    from memory.manager import default_memory_manager, scrub_secrets
    from rag.knowledge_store import default_knowledge_store
except (ImportError, ValueError):
    from ..tools.registry import default_tool_registry, ToolRegistry
    from ..memory.manager import default_memory_manager, scrub_secrets
    from ..rag.knowledge_store import default_knowledge_store
from .specialists import select_specialist, SpecialistRole
from .planner import TaskPlanner
from .verifier import ToolVerifier

logger = logging.getLogger("gabby.orchestrator")

# Model routing fallbacks
MODEL_FALLBACKS = {
    "voice": ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.7-flash", "gemini-2.5-flash"],
    "advanced": ["gemini-2.5-pro", "gemini-3.7-flash", "gemini-3.6-flash"],
    "fast": ["gemini-3.5-flash-lite", "gemini-3.6-flash", "gemini-2.5-flash-lite"],
    "standard": ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.7-flash", "gemini-2.5-flash"]
}

class AgentOrchestrator:
    def __init__(self, tool_registry: Optional[ToolRegistry] = None):
        self.tool_registry = tool_registry or default_tool_registry
        self.memory = default_memory_manager
        self.planner = TaskPlanner()
        self.verifier = ToolVerifier()
        self._cached_client: Optional[genai.Client] = None
        self._cached_api_key: Optional[str] = None

    def _get_client(self, api_key: str) -> genai.Client:
        if self._cached_client is None or self._cached_api_key != api_key:
            self._cached_client = genai.Client(api_key=api_key)
            self._cached_api_key = api_key
        return self._cached_client

    def _build_model_chain(self, mode: str, model_selection: Optional[str]) -> List[str]:
        configured_model = os.getenv("GEMINI_MODEL", "gemini-3.6-flash")
        if mode == "voice":
            chain = MODEL_FALLBACKS["voice"].copy()
        elif model_selection == "advanced":
            chain = MODEL_FALLBACKS["advanced"].copy()
        elif model_selection in ("fast", "lite"):
            chain = MODEL_FALLBACKS["fast"].copy()
        else:
            chain = [configured_model] + [m for m in MODEL_FALLBACKS["standard"] if m != configured_model]

        # Deduplicate while preserving order
        seen = set()
        deduped = []
        for m in chain:
            if m not in seen:
                deduped.append(m)
                seen.add(m)
        return deduped

    async def stream_chat(
        self,
        prompt: str,
        chat_id: Optional[str] = None,
        mode: str = "chat",
        model_selection: Optional[str] = None,
        active_gem: Optional[str] = None,
        attached_image: Optional[Dict[str, Any]] = None,
        location_context: Optional[str] = None,
        search_context: Optional[str] = None,
        custom_system_instruction: Optional[str] = None,
        interrupted_text: Optional[str] = None,
        already_spoken_text: Optional[str] = None,
        api_key: Optional[str] = None
    ) -> AsyncGenerator[str, None]:
        """
        Main execution generator yielding SSE events to the client.
        """
        current_key = api_key or os.getenv("GEMINI_API_KEY")
        if not current_key:
            yield f"data: {json.dumps({'error': 'Gemini API key is not configured in server/.env'})}\n\n"
            return

        # Initialize or resolve chat ID
        if not chat_id:
            chat_id = database.create_chat()
        else:
            database.ensure_chat_exists(chat_id)

        # Notify client of active chat ID immediately
        yield f"data: {json.dumps({'type': 'chat_id', 'chat_id': chat_id})}\n\n"

        clean_user_prompt = (prompt or "").strip()
        if clean_user_prompt:
            database.add_message(chat_id, "user", clean_user_prompt)

        # Select specialist role and decompose plan
        specialist: SpecialistRole = select_specialist(clean_user_prompt, active_gem)
        task_plan = self.planner.plan_task(clean_user_prompt)
        task_context = self.memory.create_task_context(chat_id)

        if task_plan["is_complex"]:
            yield f"data: {json.dumps({'type': 'status', 'message': task_plan['initial_status']})}\n\n"

        # Assemble conversation history (normalized alternating turns)
        clean_history = database.get_clean_history(chat_id, limit=16)

        # Build Google GenAI Content turns
        contents: List[types.Content] = []
        for msg in clean_history:
            role = "user" if msg["role"] == "user" else "model"
            contents.append(
                types.Content(
                    role=role,
                    parts=[types.Part.from_text(text=msg["content"])]
                )
            )

        # Attach image to final user turn if present
        if attached_image and contents and contents[-1].role == "user":
            try:
                raw_b64 = attached_image.get("base64", "")
                mime = attached_image.get("mimeType", "image/jpeg")
                clean_b64 = raw_b64.split(",")[-1]
                img_bytes = base64.b64decode(clean_b64)
                contents[-1].parts.insert(0, types.Part.from_bytes(data=img_bytes, mime_type=mime))
            except Exception as e:
                logger.warning(f"Image decode warning: {e}")

        # Voice interruption continuation directive
        if interrupted_text and contents and contents[-1].role == "user":
            remaining = interrupted_text.strip()[:1200]
            spoken = (already_spoken_text or "").strip()[-350:]
            spoken_notice = f'You already spoke: "{spoken}"\n' if spoken else ""
            continuation_directive = (
                f"[CONVERSATIONAL INTERRUPTION & AUTO-CONTINUATION]:\n"
                f"You were speaking aloud in voice mode. {spoken_notice}"
                f"The user interrupted you with: \"{clean_user_prompt}\"\n"
                f"You were about to say: \"{remaining}\"\n"
                f"INSTRUCTION: Briefly acknowledge the user in 2-4 words, then smoothly deliver the unspoken continuation without repeating what you already said."
            )
            for part in contents[-1].parts:
                if hasattr(part, "text") and part.text:
                    part.text = f"{continuation_directive}\n\n[USER TRANSCRIPT]: {part.text}"
                    break

        # Injected groundings (location/weather, client pre-search, knowledge store)
        extra_ctx = []
        if location_context:
            extra_ctx.append(f"[LOCATION/WEATHER CONTEXT]:\n{location_context}")
        if search_context:
            extra_ctx.append(f"[WEB CONTEXT]:\n{search_context}")

        try:
            matched_knowledge = default_knowledge_store.search(clean_user_prompt, limit=2)
            if matched_knowledge:
                rag_snippets = [f"- {k['title']}: {k['content'][:300]}" for k in matched_knowledge]
                extra_ctx.append("[RELEVANT KNOWLEDGE BASE CONTEXT]:\n" + "\n".join(rag_snippets))
        except Exception as rag_err:
            logger.debug(f"Knowledge lookup notice: {rag_err}")

        if extra_ctx and contents and contents[-1].role == "user":
            prefix = "\n\n".join(extra_ctx) + "\n\n"
            for part in contents[-1].parts:
                if hasattr(part, "text") and part.text:
                    part.text = prefix + part.text
                    break

        # Assemble system instruction
        system_instruction = specialist.system_instruction
        if mode == "voice":
            system_instruction += (
                "\n\nSPOKEN VOICE DELIVERY RULES:\n"
                "1. Deliver your full answer naturally in clear, flowing spoken English.\n"
                "2. NEVER output markdown symbols (no asterisks, hash signs, bullet points, or code backticks).\n"
                "3. Speak warmly and engagingly like a human conversation partner."
            )
        else:
            system_instruction += (
                "\n\nFormat responses beautifully with Markdown, clear headings, bullet points, and code blocks where appropriate."
            )

        # Inject user preferences
        prefs = self.memory.get_all_preferences()
        if prefs:
            prefs_summary = ", ".join([f"{k}: {v}" for k, v in prefs.items()])
            system_instruction += f"\n\n[USER PREFERENCES]: {prefs_summary}"

        if custom_system_instruction:
            system_instruction = f"{custom_system_instruction}\n\n{system_instruction}"

        # Prepare Gemini tools
        gemini_tools = [
            types.Tool(function_declarations=self.tool_registry.to_gemini_declarations())
        ]

        models_to_try = self._build_model_chain(mode, model_selection)
        client = self._get_client(current_key)

        for model_idx, model_name in enumerate(models_to_try):
            tokens_emitted = False
            full_response = ""
            tool_iterations = 0
            max_tool_iterations = 4

            try:
                while tool_iterations < max_tool_iterations:
                    tool_iterations += 1
                    config = types.GenerateContentConfig(
                        system_instruction=system_instruction,
                        temperature=0.6 if mode == "voice" else specialist.temperature,
                        top_p=0.95,
                        tools=gemini_tools
                    )

                    response = await client.aio.models.generate_content(
                        model=model_name,
                        contents=contents,
                        config=config
                    )

                    # Check for tool/function calls
                    function_calls = []
                    if response.candidates and response.candidates[0].content:
                        for part in response.candidates[0].content.parts:
                            if part.function_call:
                                function_calls.append(part.function_call)

                    if function_calls:
                        # Model requested tool executions
                        # Append the model's call turn to history
                        contents.append(response.candidates[0].content)

                        # Execute all function calls
                        response_parts = []
                        for call in function_calls:
                            tool_name = call.name
                            tool_args = dict(call.args) if call.args else {}

                            # Clean user status signal
                            status_msg = f"Using {tool_name.replace('_', ' ')}..."
                            if tool_name == "web_search":
                                status_msg = f"Searching for '{tool_args.get('query', '')[:40]}'..."
                            elif tool_name == "get_weather":
                                status_msg = f"Checking weather for {tool_args.get('city', 'location')}..."
                            elif tool_name == "calculate":
                                status_msg = f"Calculating expression..."
                            elif tool_name == "workspace_file":
                                status_msg = f"Accessing workspace file '{tool_args.get('path', '')}'..."
                            elif tool_name == "call_public_api":
                                status_msg = f"Querying {tool_args.get('service', 'API')}..."

                            yield f"data: {json.dumps({'type': 'status', 'message': status_msg})}\n\n"

                            # Execute tool
                            tool_result = await self.tool_registry.execute(tool_name, tool_args)
                            verif = self.verifier.verify_tool_result(tool_name, tool_args, tool_result.to_dict())
                            self.memory.record_tool_execution(task_context, tool_name, tool_args, tool_result.success)

                            # Format response for Gemini
                            tool_output = tool_result.to_dict()
                            if not verif.get("verified", True):
                                tool_output["verification_warning"] = verif.get("reason")

                            response_parts.append(
                                types.Part.from_function_response(
                                    name=tool_name,
                                    response={"result": tool_output}
                                )
                            )

                        # Append function response turn to contents
                        contents.append(types.Content(role="tool", parts=response_parts))
                        # Loop back so Gemini can formulate response with tool findings
                        continue

                    # If no function calls, stream or emit final answer
                    text_content = ""
                    if response.candidates and response.candidates[0].content:
                        for part in response.candidates[0].content.parts:
                            if part.text:
                                text_content += part.text

                    if text_content:
                        clean_text = scrub_secrets(text_content)
                        full_response += clean_text
                        tokens_emitted = True
                        yield f"data: {json.dumps({'text': clean_text})}\n\n"

                    break

                # Successfully finished response turn
                if full_response.strip():
                    database.add_message(chat_id, "assistant", full_response)
                yield "data: [DONE]\n\n"
                return

            except Exception as e:
                err_str = str(e)
                logger.error(f"Error on model {model_name}: {err_str}")

                if "403" in err_str or "leaked" in err_str.lower():
                    yield f"data: {json.dumps({'error': 'API Key Error (403): Gemini API key invalid. Update server/.env'})}\n\n"
                    return

                is_retryable = any(
                    token in err_str.lower()
                    for token in ["503", "429", "500", "502", "504", "unavailable", "quota", "overloaded", "404", "not found"]
                )

                if is_retryable and model_idx < len(models_to_try) - 1:
                    next_model = models_to_try[model_idx + 1]
                    logger.info(f"Failing over to {next_model}...")
                    if tokens_emitted:
                        yield f"data: {json.dumps({'type': 'reset_buffer'})}\n\n"
                        tokens_emitted = False
                    await asyncio.sleep(0.3)
                    continue
                else:
                    yield f"data: {json.dumps({'error': f'Service unavailable: {err_str}'})}\n\n"
                    return

default_orchestrator = AgentOrchestrator()
