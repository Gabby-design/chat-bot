from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, Response, JSONResponse
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from dotenv import load_dotenv
import os
import sys
import json
import asyncio
import re
import base64
import urllib.parse
import httpx
import edge_tts
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

# Initialize Database
database.init_db()

app = FastAPI(title="Gabby API", version="2.0.0")

# Configure CORS for any origin
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^https?://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def add_cors_and_pna_headers(request: Request, call_next):
    """Support W3C Private Network Access for Chrome preflights."""
    response = await call_next(request)
    if request.headers.get("Access-Control-Request-Private-Network") == "true":
        response.headers["Access-Control-Allow-Private-Network"] = "true"
    return response

# Security: API Key Sanitizer to prevent key leaks in error responses & logs
def sanitize_error_message(msg: str) -> str:
    if not msg:
        return "An unexpected error occurred."
    sanitized = re.sub(r'AIza[0-9A-Za-z\-_]{35}', '[REDACTED_API_KEY]', msg)
    sanitized = re.sub(r'key=[0-9A-Za-z\-_]+', 'key=[REDACTED]', sanitized)
    sanitized = re.sub(r'bearer\s+[0-9A-Za-z\-_.]+', 'bearer [REDACTED]', sanitized, flags=re.IGNORECASE)
    return sanitized

# Reusable client cache for fast TTFT & connection pooling
_cached_client = None
def get_genai_client(api_key: str):
    global _cached_client
    if _cached_client is None:
        _cached_client = genai.Client(api_key=api_key)
    return _cached_client

# Models
class ChatRequest(BaseModel):
    message: Optional[str] = None
    prompt: Optional[str] = None
    chat_id: Optional[str] = None
    mode: str = "chat"  # "chat" | "voice"
    model: Optional[str] = None
    conversationHistory: Optional[List[Dict[str, Any]]] = None
    locationContext: Optional[str] = None
    searchContext: Optional[str] = None
    customSystemInstruction: Optional[str] = None
    activeGem: Optional[str] = None
    attachedImage: Optional[Dict[str, Any]] = None

class CreateChatRequest(BaseModel):
    title: str = "New Chat"

class TTSRequest(BaseModel):
    text: str
    voice: Optional[str] = "Aoede"
    voice_id: Optional[str] = None
    rate: Optional[str] = "+8%"
    pitch: Optional[str] = "+2Hz"

class SearchRequest(BaseModel):
    query: str

class WeatherRequest(BaseModel):
    lat: Optional[float] = None
    lon: Optional[float] = None
    city: Optional[str] = None

# Voice Mapping from UI voices to high-speed Neural TTS voices
VOICE_MAP = {
    "Aoede": "en-US-AnaNeural",
    "Kore": "en-US-AriaNeural",
    "Puck": "en-US-GuyNeural",
    "Charon": "en-US-ChristopherNeural",
    "Fenrir": "en-US-EricNeural",
}

@app.get("/")
async def root():
    return {"message": "Gabby API is running", "status": "online", "version": "2.0.0"}

@app.get("/api/chats")
async def get_chats():
    try:
        return database.get_chats()
    except Exception as e:
        print(f"[Get Chats Error]: {sanitize_error_message(str(e))}")
        return []

@app.post("/api/chats")
async def create_chat(request: CreateChatRequest):
    try:
        chat_id = database.create_chat(request.title)
        return {"id": chat_id, "title": request.title}
    except Exception as e:
        print(f"[Create Chat Error]: {sanitize_error_message(str(e))}")
        return {"id": str(uuid.uuid4()), "title": request.title}

@app.get("/api/chats/{chat_id}")
async def get_chat_history(chat_id: str):
    try:
        messages = database.get_chat_messages(chat_id)
        return {"messages": messages}
    except Exception as e:
        print(f"[Get Chat History Error]: {sanitize_error_message(str(e))}")
        return {"messages": []}

@app.delete("/api/chats/{chat_id}")
async def delete_chat(chat_id: str):
    try:
        database.delete_chat(chat_id)
        return {"success": True}
    except Exception as e:
        print(f"[Delete Chat Error]: {sanitize_error_message(str(e))}")
        return {"success": False}

# ============================================================================
# MULTI-TIER NEURAL TEXT-TO-SPEECH (TTS)
# ============================================================================

@app.post("/api/tts")
async def text_to_speech_post(request: TTSRequest):
    """
    Synthesize high-quality neural speech and return as base64 audio.
    Seamlessly powers geminiVoice.js with zero third-party API key requirements.
    """
    clean_text = (request.text or "").strip()
    if not clean_text:
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    voice_name = VOICE_MAP.get(request.voice, request.voice)
    if not voice_name or not voice_name.endswith("Neural"):
        voice_name = "en-US-AnaNeural"

    try:
        communicate = edge_tts.Communicate(clean_text, voice_name, rate=request.rate or "+8%", pitch=request.pitch or "+2Hz")
        audio_buffer = bytearray()
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_buffer.extend(chunk["data"])

        if not audio_buffer:
            raise HTTPException(status_code=500, detail="No audio was synthesized")

        base64_audio = base64.b64encode(audio_buffer).decode("utf-8")
        return {
            "audio": base64_audio,
            "voice": request.voice or "Aoede",
            "voice_name": voice_name,
            "mimeType": "audio/mpeg"
        }
    except Exception as e:
        safe_err = sanitize_error_message(str(e))
        print(f"[TTS POST Error]: {safe_err}")
        raise HTTPException(status_code=500, detail=safe_err)

@app.get("/api/tts")
async def text_to_speech_get(
    text: str,
    voice: Optional[str] = "en-US-AnaNeural",
    rate: Optional[str] = "+8%",
    pitch: Optional[str] = "+2Hz"
):
    """
    Stream audio directly as audio/mpeg for HTML5 Audio players.
    """
    clean_text = (text or "").strip()
    if not clean_text:
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    voice_name = VOICE_MAP.get(voice, voice)
    if not voice_name or not voice_name.endswith("Neural"):
        voice_name = "en-US-AnaNeural"

    async def audio_generator():
        try:
            communicate = edge_tts.Communicate(clean_text, voice_name, rate=rate, pitch=pitch)
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    yield chunk["data"]
        except (Exception, asyncio.CancelledError) as e:
            print(f"[TTS GET Stream ended]: {type(e).__name__}")
            return

    return StreamingResponse(
        audio_generator(),
        media_type="audio/mpeg",
        headers={
            "Cache-Control": "public, max-age=3600",
            "Accept-Ranges": "bytes"
        }
    )

# ============================================================================
# NATIVE WEB SEARCH AND WEATHER ENDPOINTS (Local & Serverless Parity)
# ============================================================================

@app.post("/api/search")
async def search_endpoint(request: SearchRequest):
    """Search endpoint using Wikipedia and DuckDuckGo instant answers."""
    query = (request.query or "").strip()
    if not query:
        return {"results": []}

    results = []
    headers = {"User-Agent": "GabbyAI/2.0 (Assistant; mailto:support@gabby.ai)"}

    # 1. Wikipedia Search API
    try:
        wiki_url = (
            f"https://en.wikipedia.org/w/api.php?action=query&list=search"
            f"&srsearch={urllib.parse.quote(query)}&format=json&srlimit=4"
        )
        async with httpx.AsyncClient(timeout=8.0, headers=headers) as client:
            resp = await client.get(wiki_url)
            if resp.status_code == 200:
                data = resp.json()
                for item in data.get("query", {}).get("search", []):
                    clean_snippet = re.sub(r'<[^>]+>', '', item.get("snippet", "")).strip()
                    if clean_snippet:
                        results.append({
                            "title": item.get("title"),
                            "snippet": clean_snippet,
                            "url": f"https://en.wikipedia.org/wiki/{urllib.parse.quote(item.get('title', '').replace(' ', '_'))}"
                        })
    except Exception as e:
        print(f"[Search Wiki Error]: {sanitize_error_message(str(e))}")

    # 2. DuckDuckGo Instant Answer API
    try:
        ddg_url = f"https://api.duckduckgo.com/?q={urllib.parse.quote(query)}&format=json&no_html=1&skip_disambig=1"
        async with httpx.AsyncClient(timeout=8.0, headers=headers) as client:
            resp = await client.get(ddg_url)
            if resp.status_code == 200:
                data = resp.json()
                if data.get("AbstractText"):
                    results.insert(0, {
                        "title": data.get("Heading") or query,
                        "snippet": data.get("AbstractText"),
                        "url": data.get("AbstractURL") or f"https://duckduckgo.com/?q={urllib.parse.quote(query)}"
                    })
    except Exception as e:
        print(f"[Search DDG Error]: {sanitize_error_message(str(e))}")

    return {"results": results[:5]}

@app.post("/api/weather")
@app.get("/api/weather")
async def weather_endpoint(
    req: Request,
    lat: Optional[float] = None,
    lon: Optional[float] = None,
    city: Optional[str] = None
):
    """Real-time weather retrieval via Open-Meteo matching serverless format."""
    try:
        # Check if parameters were passed in JSON body
        if req.method == "POST":
            try:
                body = await req.json()
                if body:
                    lat = lat or body.get("lat")
                    lon = lon or body.get("lon")
                    city = city or body.get("city")
            except Exception:
                pass

        async with httpx.AsyncClient(timeout=8.0) as client:
            resolved_city = city or "Current Location"
            target_lat = lat
            target_lon = lon

            if (target_lat is None or target_lon is None) and city:
                geo_url = f"https://geocoding-api.open-meteo.com/v1/search?name={urllib.parse.quote(city)}&count=1&language=en&format=json"
                geo_resp = await client.get(geo_url)
                if geo_resp.status_code == 200:
                    geo_data = geo_resp.json()
                    results = geo_data.get("results")
                    if results:
                        target_lat = results[0].get("latitude")
                        target_lon = results[0].get("longitude")
                        resolved_city = results[0].get("name", city)

            if target_lat is None or target_lon is None:
                # Default to London if completely unspecified
                target_lat, target_lon = 51.5074, -0.1278
                resolved_city = "London"

            weather_url = (
                f"https://api.open-meteo.com/v1/forecast?latitude={target_lat}&longitude={target_lon}"
                f"&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,is_day"
            )
            w_resp = await client.get(weather_url)
            if w_resp.status_code == 200:
                data = w_resp.json()
                current = data.get("current", {})
                code = current.get("weather_code", 0)

                # Map weather code to description and icon
                code_map = {
                    0: ("Clear sky", "Sun"), 1: ("Mainly clear", "Sun"), 2: ("Partly cloudy", "CloudSun"), 3: ("Overcast", "Cloud"),
                    45: ("Foggy", "CloudFog"), 48: ("Depositing rime fog", "CloudFog"),
                    51: ("Light drizzle", "CloudDrizzle"), 53: ("Moderate drizzle", "CloudDrizzle"), 55: ("Dense drizzle", "CloudDrizzle"),
                    61: ("Slight rain", "CloudRain"), 63: ("Moderate rain", "CloudRain"), 65: ("Heavy rain", "CloudRain"),
                    71: ("Slight snow", "CloudSnow"), 73: ("Moderate snow", "CloudSnow"), 75: ("Heavy snow", "CloudSnow"),
                    80: ("Rain showers", "CloudRain"), 81: ("Moderate rain showers", "CloudRain"), 82: ("Violent rain showers", "CloudRain"),
                    95: ("Thunderstorm", "CloudLightning"), 96: ("Thunderstorm with slight hail", "CloudLightning"), 99: ("Thunderstorm with heavy hail", "CloudLightning")
                }
                condition, icon = code_map.get(code, ("Clear", "Sun"))
                temp = round(current.get("temperature_2m", 20))
                apparent_temp = round(current.get("apparent_temperature", 20))
                humidity = current.get("relative_humidity_2m", 50)
                wind_speed = current.get("wind_speed_10m", 5)

                weather_payload = {
                    "temperature": temp,
                    "apparentTemperature": apparent_temp,
                    "condition": condition,
                    "weatherCode": code,
                    "iconName": icon,
                    "humidity": humidity,
                    "windSpeed": wind_speed,
                    "isDay": current.get("is_day", 1) == 1
                }

                location_payload = {
                    "name": resolved_city,
                    "city": resolved_city,
                    "formatted": f"{resolved_city}",
                    "latitude": target_lat,
                    "longitude": target_lon
                }

                summary = f"User's current location: {resolved_city}. Weather: {temp}°C (feels like {apparent_temp}°C), {condition}."

                return {
                    "location": location_payload,
                    "weather": weather_payload,
                    "summary": summary,
                    "city": resolved_city,
                    "temperature": temp,
                    "apparent_temperature": apparent_temp,
                    "humidity": humidity,
                    "wind_speed": wind_speed,
                    "condition": condition,
                    "code": code
                }
    except Exception as e:
        print(f"[Weather Error]: {sanitize_error_message(str(e))}")

    return {
        "location": {"name": city or "Local", "city": city or "Local", "formatted": city or "Local"},
        "weather": {"temperature": 22, "apparentTemperature": 22, "condition": "Clear", "iconName": "Sun"},
        "summary": f"Weather in {city or 'Local'}: 22°C, Clear.",
        "city": city or "Local",
        "temperature": 22,
        "condition": "Clear"
    }

# ============================================================================
# CHAT STREAMING WITH ROLE ALTERNATION & BUFFER RESET RECOVERY
# ============================================================================

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

        user_prompt = (request.message or request.prompt or "").strip()
        if not user_prompt and not request.attachedImage:
            raise HTTPException(status_code=400, detail="Message or attached image is required")

        chat_id = request.chat_id
        if not chat_id:
            chat_id = database.create_chat()
        else:
            database.ensure_chat_exists(chat_id)

        # Atomically save user prompt in database
        if user_prompt:
            database.add_message(chat_id, "user", user_prompt)

        # Retrieve normalized, strictly role-alternating history (user -> model -> user -> model)
        # Sliced to 16 turns to keep fast TTFT while preserving deep conversational memory
        clean_history = database.get_clean_history(chat_id, limit=16)

        # Build Google GenAI Content items
        contents = []
        for msg in clean_history:
            role = "user" if msg["role"] == "user" else "model"
            contents.append(
                types.Content(
                    role=role,
                    parts=[types.Part.from_text(text=msg["content"])]
                )
            )

        # If user attached an image, insert it into the final user turn
        if request.attachedImage and contents and contents[-1].role == "user":
            try:
                raw_base64 = request.attachedImage.get("base64", "")
                mime_type = request.attachedImage.get("mimeType", "image/jpeg")
                clean_b64 = re.sub(r'^data:image\/[a-z]+;base64,', '', raw_base64)
                img_bytes = base64.b64decode(clean_b64)
                contents[-1].parts.insert(0, types.Part.from_bytes(data=img_bytes, mime_type=mime_type))
            except Exception as img_err:
                print(f"[Image Decode Warning]: {sanitize_error_message(str(img_err))}")

        # Inject context (search / location) into final user turn if present
        extra_context = []
        if request.locationContext:
            extra_context.append(f"[LOCATION CONTEXT]:\n{request.locationContext}")
        if request.searchContext:
            extra_context.append(f"[WEB SEARCH CONTEXT]:\n{request.searchContext}")

        if extra_context and contents and contents[-1].role == "user":
            prefix = "\n\n".join(extra_context) + "\n\n"
            # Prepend context to user text
            for part in contents[-1].parts:
                if hasattr(part, "text") and part.text:
                    part.text = prefix + part.text
                    break

        async def generate():
            client = get_genai_client(current_api_key)

            # Unified Model Routing
            model_selection = request.model or ""
            configured_model = os.getenv("GEMINI_MODEL", "gemini-3.6-flash")

            if request.mode == "voice":
                primary_model = "gemini-3.6-flash"
                fallback_models = ["gemini-3.5-flash", "gemini-3.7-flash", "gemini-3.5-flash-lite", "gemini-2.5-flash"]
            elif model_selection == "advanced":
                primary_model = "gemini-2.5-pro"
                fallback_models = ["gemini-3.7-flash", "gemini-3.6-flash", "gemini-3.5-flash"]
            elif model_selection in ("fast", "lite"):
                primary_model = "gemini-3.5-flash-lite"
                fallback_models = ["gemini-3.6-flash", "gemini-2.5-flash-lite"]
            else:
                primary_model = configured_model if configured_model != "gemini-2.5-flash" else "gemini-3.6-flash"
                fallback_models = ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.7-flash", "gemini-3.5-flash-lite", "gemini-2.5-flash"]

            models_to_try = [primary_model]
            for m in fallback_models:
                if m != primary_model and m not in models_to_try:
                    models_to_try.append(m)

            base_intelligence = (
                "You are Gabby, a state-of-the-art AI assistant with top-tier intelligence, clarity, and depth—equivalent to ChatGPT Plus. "
                "You are extraordinarily knowledgeable, insightful, articulate, and thoughtful. "
                "You adapt seamlessly to any domain: deep coding, complex reasoning, creative writing, science, mathematics, analysis, and everyday chat. "
                "Be direct, thorough, and smart, avoiding unnecessary fluff while providing high-value, accurate insights. "
                "DIVERSITY & FRESH PERSPECTIVES: Never give carbon-copy or repetitive responses. If asked a similar or repeated question across conversations, approach it from a fresh creative angle."
            )

            if request.activeGem == 'code':
                base_intelligence += "\nYou are Code Expert. Deliver robust, modular, clean code with syntax highlighting and best practices."
            elif request.activeGem == 'writing':
                base_intelligence += "\nYou are Writing Assistant. Deliver evocative prose, essays, articles, and refined communication."
            elif request.activeGem == 'math':
                base_intelligence += "\nYou are Math Tutor. Solve complex mathematical problems step-by-step with clear explanations."
            elif request.activeGem == 'research':
                base_intelligence += "\nYou are Research Assistant. Provide rigorous, fact-checked, structured analysis."

            if request.mode == "voice":
                system_instruction = (
                    f"{base_intelligence}\n\n"
                    "SPOKEN VOICE DELIVERY RULES:\n"
                    "1. Deliver your full answer naturally in clear, flowing spoken English.\n"
                    "2. Do NOT cut yourself short or arbitrarily limit your answer. Explain thoughts thoroughly and conversationally.\n"
                    "3. Structure your response into well-formed sentences with natural breath pauses.\n"
                    "4. NEVER output markdown symbols (no asterisks, hash signs, bullet points, or code backticks) since output is spoken aloud by a speech synthesizer. Express technical concepts conversationally in plain English sentences.\n"
                    "5. Speak warmly and engagingly like a human conversation partner."
                )
            else:
                system_instruction = (
                    f"{base_intelligence}\n\n"
                    "Format responses beautifully with Markdown, clear headings, bullet points, and code blocks when appropriate."
                )

            if request.customSystemInstruction:
                system_instruction = f"{request.customSystemInstruction}\n\n{system_instruction}"

            # Emit the active chat_id so frontend syncs immediately
            yield f"data: {json.dumps({'type': 'chat_id', 'chat_id': chat_id})}\n\n"

            full_response = ""
            tokens_emitted = False

            for i, model_name in enumerate(models_to_try):
                try:
                    response_stream = await client.aio.models.generate_content_stream(
                        model=model_name,
                        contents=contents,
                        config=types.GenerateContentConfig(
                            system_instruction=system_instruction,
                            temperature=0.7 if request.mode == "voice" else 0.9,
                            top_p=0.95
                        )
                    )

                    async for chunk in response_stream:
                        if chunk.text:
                            full_response += chunk.text
                            tokens_emitted = True
                            yield f"data: {json.dumps({'text': chunk.text})}\n\n"

                    # Successfully finished stream: save assistant message and emit [DONE]
                    if full_response.strip():
                        database.add_message(chat_id, "assistant", full_response)
                    yield "data: [DONE]\n\n"
                    return

                except Exception as e:
                    raw_err = str(e)
                    safe_err = sanitize_error_message(raw_err)
                    print(f"[Model {model_name} Error]: {safe_err}")

                    # Leaked key / non-retryable 403
                    if "403" in raw_err or "leaked" in raw_err.lower():
                        yield f"data: {json.dumps({'error': 'API Key Error (403): Your Gemini API key was flagged as invalid or expired. Please update server/.env.'})}\n\n"
                        return

                    is_retryable = any(
                        err_token in raw_err.lower()
                        for err_token in ["503", "429", "500", "502", "504", "unavailable", "quota", "overloaded", "high demand", "404", "not found"]
                    )

                    if is_retryable and i < len(models_to_try) - 1:
                        next_model = models_to_try[i + 1]
                        print(f"Switching from {model_name} to fallback {next_model}...")

                        # CRITICAL FIX: If tokens were already emitted to the user,
                        # instruct the client to reset its buffer before fallback generation starts!
                        if tokens_emitted:
                            yield f"data: {json.dumps({'type': 'reset_buffer'})}\n\n"
                            tokens_emitted = False

                        full_response = ""
                        await asyncio.sleep(0.3)
                        continue
                    else:
                        # All models exhausted
                        yield f"data: {json.dumps({'error': f'Service temporarily unavailable: {safe_err}'})}\n\n"
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
        safe_msg = sanitize_error_message(str(e))
        print(f"[Chat Stream Fatal Error]: {safe_msg}")
        raise HTTPException(status_code=500, detail=safe_msg)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
