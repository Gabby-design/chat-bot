from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from dotenv import load_dotenv
import os
import json
import time
import asyncio
import google.generativeai as genai
import database


load_dotenv()

# Configure Gemini
api_key = os.getenv("GEMINI_API_KEY")
gemini_model = os.getenv("GEMINI_MODEL", "gemini-2.0-flash-exp")  # Default to 2.0-flash-exp
if not api_key:
    print("Warning: GEMINI_API_KEY not found in environment variables")
else:
    genai.configure(api_key=api_key)
    print(f"Using Gemini model: {gemini_model}")

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
    chat_id: str = None

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

@app.post("/api/chat/stream")
async def chat_stream(request: ChatRequest):
    try:
        if not api_key:
            raise HTTPException(status_code=500, detail="Gemini API key not configured")
        
        chat_id = request.chat_id
        if not chat_id:
            # If no chat_id provided, create a new one temporarily (or handle error)
            # For now, we expect the frontend to always provide a chat_id
            # But to be safe, let's create one if missing
            chat_id = database.create_chat()
            
        # Save user message
        database.add_message(chat_id, "user", request.message)
        
        # Get history for context
        history_messages = database.get_chat_messages(chat_id)
        # Convert to Gemini format (excluding the last user message we just added, as we send it in send_message)
        # Actually, Gemini history should not include the current message
        gemini_history = []
        for msg in history_messages[:-1]:
            gemini_history.append({
                "role": "user" if msg["role"] == "user" else "model",
                "parts": [msg["content"]]
            })

        async def generate():
            # List of models to try in order
            primary_model = os.getenv("GEMINI_MODEL", "gemini-2.0-flash-exp")
            # Fallback models in order of preference
            fallback_models = ["gemini-2.0-flash", "gemini-flash-latest"]
            
            models_to_try = [primary_model]
            for model in fallback_models:
                if model != primary_model and model not in models_to_try:
                    models_to_try.append(model)
            
            full_response = ""
            
            for i, model_name in enumerate(models_to_try):
                try:
                    print(f"Attempting to use model: {model_name}")
                    # Gabby AI assistant system instruction
                    system_instruction = "You are Gabby, a helpful and friendly AI assistant. When asked about your name, introduce yourself as Gabby. Provide clear, accurate, and informative responses to user questions across a wide range of topics. Be professional, concise, and thorough in your answers."
                    
                    model = genai.GenerativeModel(
                        model_name,
                        system_instruction=system_instruction
                    )
                    chat_session = model.start_chat(history=gemini_history)
                    
                    response = chat_session.send_message(request.message, stream=True)
                    
                    for chunk in response:
                        if chunk.text:
                            full_response += chunk.text
                            yield f"data: {json.dumps({'text': chunk.text})}\n\n"
                    
                    # Save assistant response
                    database.add_message(chat_id, "assistant", full_response)
                    yield "data: [DONE]\n\n"
                    return  # Success, exit function
                    
                except Exception as e:
                    error_msg = str(e)
                    print(f"Error with model {model_name}: {error_msg}")
                    
                    # Check if it's a rate limit error (429)
                    is_rate_limit = "429" in error_msg or "quota" in error_msg.lower() or "rate" in error_msg.lower()
                    
                    if is_rate_limit:
                        print(f"Rate limit hit for {model_name}.")
                        # If this is the last model, we have to report the error
                        if i == len(models_to_try) - 1:
                             yield f"data: {json.dumps({'error': f'Rate limit exceeded on all available models. Please try again later. Error: {error_msg}'})}\n\n"
                        else:
                            yield f"data: {json.dumps({'info': f'Rate limit hit on {model_name}. Switching to fallback model...'})}\n\n"
                            # Continue to next model in loop
                            continue
                    else:
                        # Non-rate-limit error, don't retry other models
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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
