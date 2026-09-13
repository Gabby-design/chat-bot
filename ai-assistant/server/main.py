from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
from dotenv import load_dotenv
import os
import json
import asyncio
import re
from google import genai
from google.genai import types
import database

# Load environment
load_dotenv(override=True)

# Configure Gemini Model
gemini_model = os.getenv("GEMINI_MODEL", "gemini-3.6-flash")
print(f"Default Gemini model configured: {gemini_model}")

# Initialize Database
database.init_db()

app = FastAPI(title="Gabby API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
        
        # Get history for context: keep 3-4 messages in voice mode for rapid prompt processing and instant TTFT
        history_messages = database.get_chat_messages(chat_id)
        history_limit = 4 if request.mode == "voice" else 16
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
            
            # Smart Model Routing:
            # For Voice Mode: prioritize lowest latency (~0.6s) sub-second streaming
            # For Chat Mode: prioritize deep reasoning, code generation, and top-tier intelligence
            model_selection = request.model or ""
            configured_model = os.getenv("GEMINI_MODEL", "gemini-3.6-flash")
            if request.mode == "voice":
                primary_model = configured_model
                fallback_models = ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite"]
            else:
                if model_selection == "advanced":
                    primary_model = "gemini-3.7-flash"
                    fallback_models = ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite"]
                elif model_selection == "fast":
                    primary_model = configured_model
                    fallback_models = ["gemini-3.6-flash", "gemini-3.5-flash-lite", "gemini-3.5-flash"]
                else:
                    primary_model = configured_model
                    fallback_models = ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.7-flash", "gemini-3.5-flash-lite"]
            
            models_to_try = [primary_model]
            for model in fallback_models:
                if model != primary_model and model not in models_to_try:
                    models_to_try.append(model)
            
            full_response = ""
            if request.mode == "voice":
                system_instruction = (
                    "You are Gabby, a fast, natural, perceptive, and friendly AI voice companion speaking live with the user just like ChatGPT Voice. "
                    "CONVERSATIONAL VOICE RULES:\n"
                    "1. Answer ONLY the user's latest question or message directly, naturally, and warmly.\n"
                    "2. Keep responses concise and conversational (1 to 3 spoken sentences) unless the user explicitly asks for more detail or an in-depth explanation.\n"
                    "3. Never randomly tell stories or continue old topics unless the user explicitly asks for a story.\n"
                    "4. Every new response must answer only the latest speech, never continuing an old sentence or story.\n"
                    "5. NEVER EVER output markdown symbols (no asterisks *, hashtags #, bullet points -, code blocks, or emojis) since your output is spoken aloud by a speech synthesizer. Write strictly in clean, pronounceable English sentences.\n"
                    "6. Speak in a human, conversational tone."
                )
            else:
                system_instruction = (
                    "You are Gabby, a state-of-the-art AI assistant with top-tier intelligence, clarity, and depth—equivalent to ChatGPT Plus. "
                    "You are extraordinarily knowledgeable, insightful, articulate, and thoughtful. "
                    "You adapt to any domain: deep coding, complex reasoning, creative writing, science, mathematics, analysis, and everyday chat. "
                    "Format responses beautifully with Markdown, clear headings, bullet points, and code blocks when appropriate. "
                    "Be direct, thorough, and smart, avoiding unnecessary fluff while providing high-value, accurate insights. "
                    "DIVERSITY & FRESH PERSPECTIVES: Never give carbon-copy or repetitive responses. If asked a similar or repeated question across conversations, approach it from a fresh creative angle, explore different nuances, provide varied examples, and bring a unique perspective."
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
                            temperature=1.0 if request.mode == "voice" else 0.95,
                            top_p=0.95
                        )
                    )
                    
                    async for chunk in response_stream:
                        if chunk.text:
                            full_response += chunk.text
                            if request.mode == "voice":
                                # Stream tokens word-by-word so frontend renders a true real-time typing effect
                                words = re.findall(r'\S+\s*', chunk.text)
                                for idx, w in enumerate(words):
                                    yield f"data: {json.dumps({'text': w})}\n\n"
                                    # Ultra-fast 8ms pacing for instant, high-speed typing
                                    if idx > 0:
                                        await asyncio.sleep(0.008)
                            else:
                                yield f"data: {json.dumps({'text': chunk.text})}\n\n"
                    
                    # Completed normally: save to database and signal completion
                    if full_response.strip():
                        database.add_message(chat_id, "assistant", full_response)
                    yield "data: [DONE]\n\n"
                    return  # Success, exit generator

                    
                except Exception as e:
                    error_msg = str(e)
                    print(f"Error with model {model_name}: {error_msg}")
                    
                    # Check for leaked API key or auth errors
                    if "403" in error_msg or "leaked" in error_msg.lower():
                        yield f"data: {json.dumps({'error': 'API Key Error (403): Your Gemini API key was flagged as leaked or invalid. Please update server/.env with a valid API key from https://aistudio.google.com/app/apikey'})}\n\n"
                        return

                    # Check for rate limit error (429)
                    is_rate_limit = "429" in error_msg or "quota" in error_msg.lower() or "rate" in error_msg.lower()
                    
                    if is_rate_limit:
                        print(f"Rate limit hit for {model_name}.")
                        if i == len(models_to_try) - 1:
                            yield f"data: {json.dumps({'error': f'Rate limit exceeded on all models. Please try again in a few moments. Error: {error_msg}'})}\n\n"
                        else:
                            yield f"data: {json.dumps({'info': f'Rate limit on {model_name}. Switching to fallback...'})}\n\n"
                            continue
                    elif "404" in error_msg or "not found" in error_msg.lower():
                        print(f"Model {model_name} not available, trying next fallback...")
                        if i == len(models_to_try) - 1:
                            yield f"data: {json.dumps({'error': f'Model {model_name} not found or unavailable. Error: {error_msg}'})}\n\n"
                        else:
                            continue
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
