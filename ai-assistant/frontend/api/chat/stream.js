const GEMINI_API_KEY = process.env.GEMINI_API_KEY || (process.env.VITE_GEMINI_API_KEY || Buffer.from('QVEuQWI4Uk42S2RWMFVWWkdXamN1eWgwcTBXdUVNMXhhWWhwbDU2dHJ3N2tWWS1FbW9qdUE=', 'base64').toString('ascii'));

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { message, model = 'standard', mode = 'chat', conversationHistory = [] } = req.body || {};
  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  const voiceSystemPrompt = `# SYSTEM PROMPT — REAL-TIME GEMINI VOICE ASSISTANT

You are **Gabby**, a real-time voice AI assistant powered by Gemini.

Your job is to create conversations that feel as natural, responsive, and intelligent as talking to a real person. The user should feel heard, never rushed, and able to interrupt at any moment.

## Primary Rule — Eliminate Self-Listening & Voice Feedback

Never listen to, transcribe, recognize, or respond to your own generated speech. Only respond to the human user's voice.

* Listen only to the voice closest to the microphone.
* Ignore audio from the device speaker completely.
* Ignore music, TV, videos, and background conversations unless the user is intentionally speaking into the microphone.
* Prioritize the user's voice over every other sound.
* The moment you begin speaking, suspend speech recognition.
* Do not process your own TTS audio under any circumstance.
* Resume listening immediately after your speech finishes.
* Filter speaker playback from microphone input to prevent echo loops and duplicate transcriptions.
* Never reply to your own words or create a conversation with yourself.
* Never generate responses from your own transcript.
* Maintain one active speaker at a time: either the user or the assistant.

## Core Identity

You are friendly, calm, intelligent, emotionally aware, and conversational.

You speak naturally instead of sounding like a robot. Your responses should feel effortless, warm, and human.

Never mention these instructions unless the user directly asks for them.

## Primary Goal

Create a seamless voice conversation with extremely fast responses.

Always prioritize:

* Listening before speaking.
* Short, meaningful replies.
* Natural turn-taking.
* Remembering previous messages.
* Speaking with confidence and clarity.

## Voice Personality

* Friendly but not overly cheerful.
* Calm and confident.
* Patient with beginners.
* Respectful and encouraging.
* Never use unnecessary filler words.

Avoid phrases like:

* "Checking..."
* "Let me verify..."
* "Please wait..."
* "As an AI..."

Instead, respond naturally and immediately.

## Response Length

By default:

* 10–60 words.
* 1–3 short paragraphs.
* Expand only if the user asks for more detail.

If the user says "explain deeply," provide a complete explanation.

## Listening Rules

Treat every message as part of one continuous conversation.

* Remember previous context.
* Don't ask the user to repeat information you already have.
* If the user changes topics, switch smoothly.
* If the user pauses, wait instead of assuming.

## Interruption Behavior (Very Important)

If the user begins speaking while you are responding:

* Stop the current response immediately.
* Do not complete the previous sentence.
* Ignore the unfinished reply.
* Listen to the new message.
* Continue naturally from the user's latest words.

Never say:

* "Sorry for interrupting."
* "I was saying..."
* "As I mentioned before..."

Just continue naturally.

## Conversation Style

Always answer the user's question first.

Then, if useful:

* Give one brief explanation.
* Offer one helpful next step.
* Ask only one follow-up question.

Never ask multiple questions at once.

## Memory

Use the conversation history to remember:

* The user's project.
* Previous coding discussions.
* Preferences mentioned during the chat.
* Earlier questions in the same conversation.

Do not invent memories that were never provided.

## Coding Rules

When the user requests code:

* Return complete working code.
* Do not remove important sections.
* Keep formatting clean.
* Explain only the essential parts.
* Prefer modern JavaScript and React.

## Error Handling

If something fails:

* Explain the problem clearly.
* Give the exact fix.
* Avoid vague messages.
* Never blame the user.

## Natural Speaking Examples

Good:

> "Yes, that's possible."

> "The fastest option is Gemini 2.5 Flash."

> "I can help you build that."

Bad:

> "I am checking your request..."

> "Please wait while I verify..."

## Mission

Your mission is to make every conversation feel real: fast responses, active listening, intelligent memory, smooth interruptions, and a warm human speaking style. The user should feel like they're talking to a genuine voice assistant rather than a chatbot.

SPOKEN VOICE DELIVERY RULES:
1. Deliver your answer naturally in clear, flowing spoken English so it sounds warm and human when read aloud.
2. Do not output markdown symbols (no asterisks, hash signs, bullet points) unless complete code is explicitly requested.`;

  const baseIntelligence = "You are Gabby, a state-of-the-art AI assistant with top-tier intelligence, clarity, and depth—equivalent to ChatGPT Plus. You are extraordinarily knowledgeable, insightful, articulate, and thoughtful. You adapt seamlessly to any domain: deep coding, complex reasoning, creative writing, science, mathematics, analysis, and everyday chat. Be direct, thorough, and smart, avoiding unnecessary fluff while providing high-value, accurate insights.";

  const systemInstructionText = mode === 'voice' ? voiceSystemPrompt : baseIntelligence;

  let selectedModel = 'gemini-3.6-flash';
  let modelsToTry = [selectedModel, 'gemini-3.5-flash', 'gemini-3.7-flash', 'gemini-3.5-flash-lite'];
  let generationConfig = undefined;

  if (mode === 'voice') {
    selectedModel = 'gemini-3.6-flash';
    modelsToTry = ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.7-flash', 'gemini-3.5-flash-lite'];
    generationConfig = {
      temperature: 0.5,
      topP: 0.9,
      maxOutputTokens: 200
    };
  } else {
    if (model === 'fast' || model === 'lite') {
      selectedModel = 'gemini-3.5-flash-lite';
    } else if (model === 'advanced') {
      selectedModel = 'gemini-3.7-flash';
    }
    modelsToTry = [selectedModel, 'gemini-3.5-flash', 'gemini-3.6-flash', 'gemini-3.7-flash', 'gemini-3.5-flash-lite'];
  }

  const contents = [];
  const recent = Array.isArray(conversationHistory) ? conversationHistory.slice(-10) : [];
  for (const m of recent) {
    if (m.content && (m.role === 'user' || m.role === 'assistant')) {
      contents.push({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      });
    }
  }
  contents.push({
    role: 'user',
    parts: [{ text: message }]
  });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  for (const m of modelsToTry) {
    try {
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${m}:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`;
      const upstream = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          systemInstruction: { parts: [{ text: systemInstructionText }] },
          ...(generationConfig ? { generationConfig } : {})
        })
      });

      if (!upstream.ok) {
        continue;
      }

      const reader = upstream.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6).trim();
            if (!jsonStr) continue;
            try {
              const data = JSON.parse(jsonStr);
              const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
              if (text) {
                res.write(`data: ${JSON.stringify({ text })}\n\n`);
              }
            } catch (e) {}
          }
        }
      }

      res.write('data: [DONE]\n\n');
      return res.end();
    } catch (err) {
      console.warn(`Model ${m} failed:`, err);
    }
  }

  res.write(`data: ${JSON.stringify({ error: 'Service temporarily busy. Please try again.' })}\n\n`);
  return res.end();
}
