from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, Response, JSONResponse
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from contextlib import asynccontextmanager
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
from agent import default_orchestrator
from agent.planner import TaskPlanner
from agent.verifier import ToolVerifier
from agent.specialists import select_specialist
from rag.knowledge_store import default_knowledge_store
from mcp import default_mcp_manager

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

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Initialize MCP manager
    try:
        await default_mcp_manager.initialize()
    except Exception as e:
        print(f"[MCP Startup Notice]: {e}")
    yield
    # Shutdown: Cleanly terminate MCP subprocesses
    try:
        await default_mcp_manager.shutdown()
    except Exception as e:
        print(f"[MCP Shutdown Notice]: {e}")

app = FastAPI(title="Gabby API", version="2.0.0", lifespan=lifespan)

# Configure CORS
# ALLOWED_ORIGINS env var: comma-separated list of production origins.
# Falls back to permissive localhost-only list for local dev.
_raw_origins = os.getenv("ALLOWED_ORIGINS", "")
if _raw_origins.strip():
    _allowed_origins = [o.strip() for o in _raw_origins.split(",") if o.strip()]
else:
    _allowed_origins = [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3002",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
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
    interruptedText: Optional[str] = None
    interruptedContext: Optional[Any] = None
    alreadySpokenText: Optional[str] = None

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

class TaskPlanRequest(BaseModel):
    task: str
    context: Optional[Dict[str, Any]] = None

class IngestKnowledgeRequest(BaseModel):
    title: str
    content: str
    tags: Optional[List[str]] = None
    source: Optional[str] = "api"

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

@app.delete("/api/chats")
async def delete_all_chats():
    try:
        database.delete_all_chats()
        return {"success": True, "message": "All chats deleted"}
    except Exception as e:
        print(f"[Delete All Chats Error]: {sanitize_error_message(str(e))}")
        return {"success": False, "error": sanitize_error_message(str(e))}

@app.delete("/api/chats/{chat_id}")
async def delete_chat(chat_id: str):
    try:
        database.delete_chat(chat_id)
        return {"success": True}
    except Exception as e:
        print(f"[Delete Chat Error]: {sanitize_error_message(str(e))}")
        return {"success": False}

# ============================================================================
# AGENT TASK PLANNING & KNOWLEDGE RAG ENDPOINTS
# ============================================================================

@app.post("/api/agent/task")
async def plan_task(request: TaskPlanRequest):
    """
    Decomposes a complex prompt/task into an actionable execution plan
    with tool assignments, intent breakdown, and acceptance criteria.
    """
    clean_task = (request.task or "").strip()
    if not clean_task:
        raise HTTPException(status_code=400, detail="Task cannot be empty")
    try:
        planner = TaskPlanner()
        plan = planner.create_plan(clean_task)
        specialist = select_specialist(clean_task)
        verifier = ToolVerifier()
        verification = verifier.verify_plan(plan)
        return {
            "task": clean_task,
            "specialist": {
                "name": specialist.name,
                "title": specialist.display_title,
                "preferred_tools": specialist.preferred_tools
            },
            "plan": plan.to_dict(),
            "verification": verification.to_dict()
        }
    except Exception as e:
        safe_err = sanitize_error_message(str(e))
        print(f"[Task Plan Error]: {safe_err}")
        raise HTTPException(status_code=500, detail=safe_err)

@app.post("/api/knowledge/ingest")
async def ingest_knowledge(request: IngestKnowledgeRequest):
    """
    Ingest a note, document, or snippet into Gabby's persistent knowledge base.
    """
    clean_content = (request.content or "").strip()
    if not clean_content:
        raise HTTPException(status_code=400, detail="Content cannot be empty")
    try:
        snippet_id = default_knowledge_store.ingest(
            title=request.title or "Untitled Note",
            content=clean_content,
            tags=request.tags or [],
            source=request.source or "api"
        )
        return {
            "success": True,
            "id": snippet_id,
            "title": request.title,
            "message": "Knowledge snippet successfully indexed."
        }
    except Exception as e:
        safe_err = sanitize_error_message(str(e))
        print(f"[Knowledge Ingest Error]: {safe_err}")
        raise HTTPException(status_code=500, detail=safe_err)

@app.get("/api/knowledge/search")
async def search_knowledge_endpoint(q: str = "", limit: int = 5, tag: Optional[str] = None):
    """
    Search the persistent knowledge base via full-text search and BM25 ranking.
    """
    try:
        results = default_knowledge_store.search(query=q, limit=limit, tag=tag)
        return {"query": q, "count": len(results), "results": results}
    except Exception as e:
        print(f"[Knowledge Search Error]: {sanitize_error_message(str(e))}")
        return {"query": q, "count": 0, "results": []}

@app.get("/api/knowledge/list")
async def list_knowledge_endpoint(limit: int = 50):
    """
    List all knowledge snippets currently stored in SQLite.
    """
    try:
        items = default_knowledge_store.list_all(limit=limit)
        return {"count": len(items), "items": items}
    except Exception as e:
        print(f"[Knowledge List Error]: {sanitize_error_message(str(e))}")
        return {"count": 0, "items": []}

@app.delete("/api/knowledge/{snippet_id}")
async def delete_knowledge_endpoint(snippet_id: str):
    """
    Delete a knowledge snippet by ID.
    """
    try:
        success = default_knowledge_store.delete(snippet_id)
        return {"success": success}
    except Exception as e:
        print(f"[Knowledge Delete Error]: {sanitize_error_message(str(e))}")
        return {"success": False}

# ============================================================================
# MODEL CONTEXT PROTOCOL (MCP) ENDPOINTS
# ============================================================================

@app.get("/api/mcp/servers")
async def get_mcp_servers():
    """
    Get configured and running Model Context Protocol (MCP) servers and tools.
    """
    try:
        return default_mcp_manager.get_server_statuses()
    except Exception as e:
        print(f"[MCP Status Error]: {sanitize_error_message(str(e))}")
        return {"total_servers": 0, "active_servers": 0, "registered_mcp_tools": [], "servers": {}}

@app.post("/api/mcp/reload")
async def reload_mcp_servers():
    """
    Reload mcp_config.json and re-establish MCP server connections.
    """
    try:
        status = await default_mcp_manager.reload()
        return {"success": True, "status": status}
    except Exception as e:
        safe_err = sanitize_error_message(str(e))
        print(f"[MCP Reload Error]: {safe_err}")
        return {"success": False, "error": safe_err}

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

        return StreamingResponse(
            default_orchestrator.stream_chat(
                prompt=user_prompt,
                chat_id=request.chat_id,
                mode=request.mode,
                model_selection=request.model,
                active_gem=request.activeGem,
                attached_image=request.attachedImage,
                location_context=request.locationContext,
                search_context=request.searchContext,
                custom_system_instruction=request.customSystemInstruction,
                interrupted_text=request.interruptedText,
                already_spoken_text=request.alreadySpokenText,
                api_key=current_api_key
            ),
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
