from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
from dotenv import load_dotenv
import os
import sys
import json
import asyncio
import re
from google import genai
from google.genai import types
import database

# Fix for Windows asyncio Proactor connection reset errors on client disconnect
if sys.platform == "win32":
    try:
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    except Exception:
        pass

# Load environment
load_dotenv(override=True)

# Configure Gemini Model
gemini_model = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
print(f"Default Gemini model configured: {gemini_model}")

# Initialize Database
database.init_db()

app = FastAPI(title="Gabby API")

# Configure CORS for any origin (local, netlify, vercel, mobile)
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^https?://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def add_cors_and_pna_headers(request, call_next):
    """Support W3C Private Network Access for Chrome preflights."""
    response = await call_next(request)
    if request.headers.get("Access-Control-Request-Private-Network") == "true":
        response.headers["Access-Control-Allow-Private-Network"] = "true"
    return response

class ChatRequest(BaseModel):
    message: str
    chat_id: Optional[str] = None
    mode: str = "chat"  # "chat" | "voice"
    interrupted_context: Optional[str] = None
    model: Optional[str] = None  # Optional model override e.g. "advanced", "fast", "standard" or model ID

class CreateChatRequest(BaseModel):
    title: str = "New Chat"

@app.get("/")
async def root():
    return {"message": "Gabby API is running"}

@app.get("/api/chats")
async def get_chats():
    return database.get_chats()

@app.post("/api/chats")
async def create_chat(request: CreateChatRequest):
    chat_id = database.create_chat(request.title)
    return {"id": chat_id, "title": request.title}

@app.get("/api/chats/{chat_id}")
async def get_chat_history(chat_id: str):
    messages = database.get_chat_messages(chat_id)
    return {"messages": messages}

@app.delete("/api/chats/{chat_id}")
async def delete_chat(chat_id: str):
    database.delete_chat(chat_id)
    return {"success": True}

class TTSRequest(BaseModel):
    text: str
    voice_id: Optional[str] = "21m00Tcm4TlvDq8ikWAM"  # Default: Rachel (warm, natural conversational)

@app.post("/api/tts")
async def text_to_speech(request: TTSRequest):
    load_dotenv(override=True)
    elevenlabs_api_key = os.getenv("ELEVENLABS_API_KEY")
    if not elevenlabs_api_key:
        return {"available": False, "error": "No ELEVENLABS_API_KEY configured"}
    
    try:
        import httpx
        from fastapi.responses import Response
        url = f"https://api.elevenlabs.io/v1/text-to-speech/{request.voice_id}"
        headers = {
            "Accept": "audio/mpeg",
            "Content-Type": "application/json",
            "xi-api-key": elevenlabs_api_key
        }
        data = {
            "text": request.text,
            "model_id": "eleven_turbo_v2_5",
            "voice_settings": {
                "stability": 0.5,
                "similarity_boost": 0.8
            }
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(url, json=data, headers=headers)
            if resp.status_code != 200:
                return {"available": False, "error": resp.text}
            return Response(content=resp.content, media_type="audio/mpeg")
    except Exception as e:
        return {"available": False, "error": str(e)}

# Reusable persistent client cache for connection pooling and fast TTFT
_cached_client = None
def get_genai_client(api_key: str):
    global _cached_client
    if _cached_client is None:
        _cached_client = genai.Client(api_key=api_key)
    return _cached_client

@app.post("/api/chat/stream")
async def chat_stream(request: ChatRequest):
    try:
        load_dotenv(override=True)
        current_api_key = os.getenv("GEMINI_API_KEY")
        if not current_api_key:
            raise HTTPException(
                status_code=500, 
                detail="Gemini API key is not configured. Please add GEMINI_API_KEY to server/.env"
            )
        
        chat_id = request.chat_id
        if not chat_id:
            chat_id = database.create_chat()
            
        # Save user message
        database.add_message(chat_id, "user", request.message)
        
        # Keep 16 messages of rich conversation context memory in both chat and voice mode
        history_messages = database.get_chat_messages(chat_id)
        history_limit = 16
        recent_history = history_messages[:-1][-history_limit:]
        
        # Convert history into google.genai Content objects
        contents = []
        for msg in recent_history:
            role = "user" if msg["role"] == "user" else "model"
            contents.append(
                types.Content(
                    role=role,
                    parts=[types.Part.from_text(text=msg["content"])]
                )
            )
        # Current user prompt
        user_prompt = request.message

        contents.append(
            types.Content(
                role="user",
                parts=[types.Part.from_text(text=user_prompt)]
            )
        )

        async def generate():
            client = get_genai_client(current_api_key)
            
            # Unified Model Routing for both Text and Voice:
            # Respects user model selection with high-availability fallbacks
            model_selection = request.model or ""
            configured_model = os.getenv("GEMINI_MODEL", "gemini-3.6-flash")
            
            if request.mode == "voice":
                primary_model = "gemini-3.6-flash"
                fallback_models = ["gemini-3.5-flash", "gemini-3.7-flash", "gemini-3.5-flash-lite", "gemini-3.8-flash"]
            elif model_selection == "advanced":
                primary_model = "gemini-3.6-flash"
                fallback_models = ["gemini-3.7-flash", "gemini-3.5-flash", "gemini-3.8-flash"]
            elif model_selection in ("fast", "lite"):
                primary_model = "gemini-3.5-flash-lite"
                fallback_models = ["gemini-3.6-flash", "gemini-3.5-flash"]
            else:
                primary_model = configured_model
                fallback_models = ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.7-flash", "gemini-3.5-flash-lite", "gemini-3.8-flash"]
            
            models_to_try = [primary_model]
            for model in fallback_models:
                if model != primary_model and model not in models_to_try:
                    models_to_try.append(model)
            
            full_response = ""

            # Unified ChatGPT Plus Intelligence for both Text and Voice
            base_intelligence = (
                "You are Gabby, a state-of-the-art AI assistant with top-tier intelligence, clarity, and depth—equivalent to ChatGPT Plus. "
                "You are extraordinarily knowledgeable, insightful, articulate, and thoughtful. "
                "You adapt seamlessly to any domain: deep coding, complex reasoning, creative writing, science, mathematics, analysis, and everyday chat. "
                "Be direct, thorough, and smart, avoiding unnecessary fluff while providing high-value, accurate insights. "
                "DIVERSITY & FRESH PERSPECTIVES: Never give carbon-copy or repetitive responses. If asked a similar or repeated question across conversations, approach it from a fresh creative angle, explore different nuances, provide varied examples, and bring a unique perspective."
            )

            if request.mode == "voice":
                system_instruction = (
                    f"{base_intelligence}\n\n"
                    "SPOKEN VOICE DELIVERY RULES:\n"
                    "1. Deliver your full, top-tier intelligent answer naturally and articulately in clear, flowing spoken English.\n"
                    "2. Do NOT cut yourself short or arbitrarily limit your answer. Explain concepts, steps, and thoughts thoroughly and conversationally.\n"
                    "3. Structure your response into well-formed sentences with clear punctuation (commas for natural breath pauses, periods to conclude sentences).\n"
                    "4. NEVER output markdown symbols (no asterisks *, hashtags #, bullet points -, code blocks, or emojis) since your output is spoken aloud by a speech synthesizer. Express technical concepts and code conversationally in plain English sentences.\n"
                    "5. Speak warmly and engagingly like a human conversation partner."
                )
            else:
                system_instruction = (
                    f"{base_intelligence}\n\n"
                    "Format responses beautifully with Markdown, clear headings, bullet points, and code blocks when appropriate."
                )

            # Emit the chat_id so frontend knows the active conversation ID
            yield f"data: {json.dumps({'chat_id': chat_id})}\n\n"

            for i, model_name in enumerate(models_to_try):
                try:
                    print(f"Attempting to use model: {model_name} (mode: {request.mode})")
                    
                    response_stream = await client.aio.models.generate_content_stream(
                        model=model_name,
                        contents=contents,
                        config=types.GenerateContentConfig(
                            system_instruction=system_instruction,
                            temperature=0.95,
                            top_p=0.95
                        )
                    )
                    
                    async for chunk in response_stream:
                        if chunk.text:
                            full_response += chunk.text
                            # Stream tokens naturally to both text and voice modes
                            yield f"data: {json.dumps({'text': chunk.text})}\n\n"
                    
                    # Completed normally: save to database and signal completion
                    if full_response.strip():
                        database.add_message(chat_id, "assistant", full_response)
                    yield "data: [DONE]\n\n"
                    return  # Success, exit generator

                    
                except Exception as e:
                    error_msg = str(e)
                    error_lower = error_msg.lower()
                    print(f"Error with model {model_name}: {error_msg}")
                    
                    # Check for leaked API key or auth errors (non-retryable)
                    if "403" in error_msg or "leaked" in error_lower:
                        yield f"data: {json.dumps({'error': 'API Key Error (403): Your Gemini API key was flagged as leaked or invalid. Please update server/.env with a valid API key from https://aistudio.google.com/app/apikey'})}\n\n"
                        return

                    # Detect retryable/fallback conditions:
                    # 1. 503: High demand / Service Unavailable / temporary spike
                    # 2. 429: Rate limit / quota exceeded
                    # 3. 500 / 502 / 504: Google server / gateway issue
                    # 4. 404: Deprecated model or not found
                    is_503_overloaded = "503" in error_msg or "unavailable" in error_lower or "high demand" in error_lower or "overloaded" in error_lower
                    is_rate_limit = "429" in error_msg or "quota" in error_lower or "rate" in error_lower
                    is_server_error = any(code in error_msg for code in ["500", "502", "504"]) or "internal" in error_lower or "gateway" in error_lower
                    is_model_unavailable = "404" in error_msg or "not found" in error_lower or "no longer available" in error_lower

                    is_retryable = is_503_overloaded or is_rate_limit or is_server_error or is_model_unavailable

                    if is_retryable:
                        if i < len(models_to_try) - 1:
                            next_model = models_to_try[i + 1]
                            reason = (
                                "experiencing temporary high demand (503)" if is_503_overloaded else
                                "rate limited (429)" if is_rate_limit else
                                "temporarily unavailable"
                            )
                            print(f"Model {model_name} is {reason}. Seamlessly switching to fallback model: {next_model}...")
                            full_response = ""  # Reset any partial buffer for clean generation from fallback model
                            await asyncio.sleep(0.2)
                            continue
                        else:
                            # All fallback models exhausted
                            if is_503_overloaded:
                                friendly_msg = "Google Gemini is currently experiencing exceptionally high demand across all models (503 Service Unavailable). Please wait a few seconds and try again."
                            elif is_rate_limit:
                                friendly_msg = "Rate limit reached across all available models. Please wait a few moments and try again."
                            else:
                                friendly_msg = f"Temporary service error: {error_msg}"
                            yield f"data: {json.dumps({'error': friendly_msg})}\n\n"
                            return
                    else:
                        yield f"data: {json.dumps({'error': error_msg})}\n\n"
                        return
        
        return StreamingResponse(
            generate(), 
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
            }
        )
        
    except Exception as e:
        error_msg = str(e)
        print(f"Error: {error_msg}")
        raise HTTPException(status_code=500, detail=error_msg)

import edge_tts

@app.get("/api/tts")
async def tts_stream(text: str, voice: str = "en-US-AnaNeural", rate: str = "+12%", pitch: str = "+4Hz"):
    if not text or not text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")
        
    async def audio_generator():
        try:
            communicate = edge_tts.Communicate(text.strip(), voice, rate=rate, pitch=pitch)
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    yield chunk["data"]
        except (Exception, asyncio.CancelledError) as e:
            print(f"TTS Stream ended/cancelled: {type(e).__name__}")
            return
            
    return StreamingResponse(
        audio_generator(),
        media_type="audio/mpeg",
        headers={
            "Cache-Control": "no-cache",
            "Accept-Ranges": "bytes"
        }
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
