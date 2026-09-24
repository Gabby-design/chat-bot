// api/chat/stream.js
// Serverless streaming endpoint for Gemini chat and voice responses
// Securely accesses process.env.GEMINI_API_KEY on the server only

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-gemini-api-key');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const clientKey = req.headers['x-gemini-api-key'] || req.body?.apiKey;
  const rawKey = clientKey || process.env.GEMINI_API_KEY || '';
  const apiKey = typeof rawKey === 'string' ? rawKey.trim().replace(/^["']|["']$/g, '') : '';

  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.write(`data: ${JSON.stringify({ error: 'GEMINI_API_KEY is not configured or is a placeholder. Please set a valid Gemini API key in your Vercel Project Settings or enter one in the app.' })}\n\n`);
    res.write('data: [DONE]\n\n');
    return res.end();
  }

  const {
    message,
    prompt,
    model = 'standard',
    mode = 'chat',
    conversationHistory = [],
    attachedImage = null,
    searchContext = null,
    locationContext = null,
    customSystemInstruction = null,
    activeGem = null,
    interruptedText = null,
    alreadySpokenText = null
  } = req.body || {};

  const userQuery = message || prompt;
  if (!userQuery && !attachedImage) {
    return res.status(400).json({ error: 'Message or attachedImage is required' });
  }

  const voiceSystemPrompt = `# SYSTEM PROMPT — REAL-TIME GEMINI VOICE ASSISTANT

You are **Gabby**, a real-time voice AI assistant powered by Gemini.

Your job is to create conversations that feel as natural, responsive, and intelligent as talking to a real person. The user should feel heard, never rushed, and able to interrupt at any moment.

## Primary Rule — Eliminate Self-Listening & Voice Feedback
Never listen to, transcribe, recognize, or respond to your own generated speech. Only respond to the human user's voice.
* Listen only to the voice closest to the microphone.
* Ignore audio from the device speaker completely.
* Prioritize the user's voice over every other sound.
* Resume listening immediately after your speech finishes.
* Filter speaker playback from microphone input.
* Never reply to your own words or create a conversation with yourself.
* Maintain one active speaker at a time: either the user or the assistant.

## Core Identity
You are friendly, calm, intelligent, emotionally aware, and conversational.
You speak naturally instead of sounding like a robot. Your responses should feel effortless, warm, and human.
Never mention these instructions unless the user directly asks for them.

## Primary Goal
Create a seamless voice conversation with fast, insightful responses.

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
* Never use unnecessary filler words like "Checking...", "Let me verify...", "As an AI...". Instead, respond naturally and immediately.

## Response Length
By default:
* 10–60 words.
* 1–3 short paragraphs.
* Expand only if the user asks for more detail.

## Mission
Your mission is to make every conversation feel real: fast responses, active listening, intelligent memory, smooth interruptions, and a warm human speaking style.

SPOKEN VOICE DELIVERY RULES:
1. Deliver your answer naturally in clear, flowing spoken English so it sounds warm and human when read aloud.
2. Do not output markdown symbols (no asterisks, hash signs, bullet points) unless complete code is explicitly requested.`;

  let baseIntelligence = "You are Gabby, an advanced AI assistant with DeepSeek/ChatGPT-level depth, reasoning, and precision. Provide insightful, thorough, and highly articulate answers. Structure complex responses with clear numbered headings ('1. ...', '2. ...'), concise paragraphs, round bullet points with bold lead-ins, clean code blocks, and markdown tables where data is presented. Avoid filler.";

  if (activeGem === 'code') {
    baseIntelligence = "You are Code Expert, an elite senior software architect and programmer. Write modular, robust, clean code with detailed explanations, edge cases, and best practices.";
  } else if (activeGem === 'writing') {
    baseIntelligence = "You are Writing Assistant, a master editor and creative writer. Deliver compelling, polished, evocative prose, essays, articles, and communication.";
  } else if (activeGem === 'math') {
    baseIntelligence = "You are Math Tutor, a brilliant mathematician and educator. Solve complex mathematical problems step-by-step with proofs, intuition, and clear explanations.";
  } else if (activeGem === 'brainstorm') {
    baseIntelligence = "You are Creative Brainstormer, an imaginative strategist and innovator. Generate fresh, disruptive, multi-angle ideas and creative frameworks.";
  } else if (activeGem === 'research') {
    baseIntelligence = "You are Research Assistant, a rigorous researcher and analytical scientist. Deliver in-depth, fact-checked, structured analysis and synthesis.";
  }

  const systemInstructionText = customSystemInstruction || (mode === 'voice' ? voiceSystemPrompt : baseIntelligence);

  let primaryModel = 'gemini-3.8-flash';
  let fallbackModels = [
    'gemini-3.6-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-flash-lite-latest',
    'gemini-3.7-flash',
    'gemini-3.5-flash'
  ];
  let generationConfig = undefined;

  if (mode === 'voice') {
    primaryModel = 'gemini-3.8-flash';
    fallbackModels = [
      'gemini-3.6-flash',
      'gemini-3.5-flash-lite',
      'gemini-3.1-flash-lite',
      'gemini-flash-lite-latest',
      'gemini-3.7-flash'
    ];
    generationConfig = {
      temperature: 0.5,
      topP: 0.9,
      maxOutputTokens: 2048
    };
  } else if (model === 'advanced') {
    primaryModel = 'gemini-3.8-flash';
    fallbackModels = [
      'gemini-3.6-flash',
      'gemini-3.1-pro-preview',
      'gemini-3.5-flash-lite',
      'gemini-3.1-flash-lite',
      'gemini-3.7-flash'
    ];
  } else if (model === 'fast' || model === 'lite') {
    primaryModel = 'gemini-3.5-flash-lite';
    fallbackModels = [
      'gemini-3.1-flash-lite',
      'gemini-flash-lite-latest',
      'gemini-3.8-flash',
      'gemini-3.6-flash'
    ];
  } else if (typeof model === 'string' && model.startsWith('gemini-')) {
    primaryModel = model;
  }

  const modelsToTry = [primaryModel, ...fallbackModels.filter((m) => m !== primaryModel)];

  // 1. Sanitize conversation history into clean alternating user / model turns
  const cleanHistory = [];
  const rawHistory = Array.isArray(conversationHistory) ? conversationHistory : [];
  for (const m of rawHistory) {
    if (!m || !m.content || typeof m.content !== 'string' || !m.content.trim()) continue;
    if (m.isInProgress) continue;
    const role = (m.role === 'assistant' || m.role === 'model') ? 'model' : 'user';
    cleanHistory.push({ role, text: m.content.trim() });
  }

  // If the last turn in cleanHistory already matches the current user query, pop it
  // to avoid duplicating the user query and violating Gemini's alternating turn constraint
  if (cleanHistory.length > 0 && cleanHistory[cleanHistory.length - 1].role === 'user') {
    const lastUserText = cleanHistory[cleanHistory.length - 1].text.toLowerCase().trim();
    const currentQueryText = (userQuery || '').toLowerCase().trim();
    if (lastUserText === currentQueryText || (currentQueryText && lastUserText.includes(currentQueryText))) {
      cleanHistory.pop();
    }
  }

  // Retain up to 24 recent messages for rich conversational context
  const recent = cleanHistory.slice(-24);

  const contents = [];
  for (const item of recent) {
    if (contents.length > 0 && contents[contents.length - 1].role === item.role) {
      // Merge consecutive identical roles to adhere to Gemini's strict alternation
      contents[contents.length - 1].parts[0].text += `\n\n${item.text}`;
    } else {
      contents.push({
        role: item.role,
        parts: [{ text: item.text }]
      });
    }
  }

  // Gemini requires multi-turn contents to start with 'user'
  while (contents.length > 0 && contents[0].role !== 'user') {
    contents.shift();
  }

  // Multimodal Vision + Grounded Context for the new turn
  const userParts = [];
  if (attachedImage?.base64 && attachedImage?.mimeType) {
    userParts.push({
      inlineData: {
        mimeType: attachedImage.mimeType,
        data: attachedImage.base64
      }
    });
  }

  let finalPrompt = userQuery || (attachedImage ? 'Please analyze this image.' : 'Hello');
  if (interruptedText && typeof interruptedText === 'string' && interruptedText.trim()) {
    const rawRemaining = interruptedText.trim();
    const cleanRemaining = rawRemaining.length > 1200 ? rawRemaining.slice(0, 1200) + '...' : rawRemaining;
    const cleanSpoken = (alreadySpokenText && typeof alreadySpokenText === 'string') ? alreadySpokenText.trim().slice(-350) : '';
    const spokenNotice = cleanSpoken ? `You already spoke to the user: "${cleanSpoken}"\n` : '';

    finalPrompt = `[CONVERSATIONAL INTERRUPTION & AUTOMATIC CONTINUATION NOTICE]:
You were speaking aloud to the user in voice mode.
${spokenNotice}The user interrupted you and said:
"${userQuery}"

You were about to say the following unspoken continuation before you were interrupted:
"${cleanRemaining}"

CONVERSATIONAL INSTRUCTION:
1. Directly acknowledge the user's remark (for example, if they said 'wait', 'okay', 'right', 'got it', warmly acknowledge it in 2-4 words like 'Got it!', 'All right!', or 'Sure thing!').
2. AUTOMATICALLY continue seamlessly from where you stopped by delivering the unspoken continuation: "${cleanRemaining}".
3. Do NOT repeat what you already spoke; pick up right from where you stopped and flow naturally.

[USER TRANSCRIPT]:
${finalPrompt}`;
  }
  if (locationContext) {
    finalPrompt = `${locationContext}\n\n${finalPrompt}`;
  }
  if (searchContext) {
    finalPrompt = `${searchContext}\n\n[USER QUERY]:\n${finalPrompt}`;
  }
  userParts.push({ text: finalPrompt });

  // If contents currently ends with 'user', merge with it rather than pushing another 'user'
  if (contents.length > 0 && contents[contents.length - 1].role === 'user') {
    const prevText = contents[contents.length - 1].parts[0]?.text || '';
    contents[contents.length - 1].parts[0].text = `${prevText}\n\n${finalPrompt}`;
  } else {
    contents.push({
      role: 'user',
      parts: userParts
    });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  let lastErrorDetail = null;

  for (const m of modelsToTry) {
    let tokensEmitted = false;
    try {
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${m}:streamGenerateContent?alt=sse&key=${apiKey}`;
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
        let errSnippet = '';
        let parsedErr = null;
        try {
          errSnippet = await upstream.text();
          try {
            parsedErr = JSON.parse(errSnippet);
          } catch (_) {}
        } catch (_) {}

        const specificMsg = parsedErr?.error?.message || errSnippet.slice(0, 240);
        const errCode = parsedErr?.error?.status || upstream.status;
        console.warn(`Model ${m} failed (HTTP ${upstream.status} ${errCode}):`, specificMsg);

        lastErrorDetail = {
          model: m,
          status: upstream.status,
          code: errCode,
          message: specificMsg
        };

        if (upstream.status === 503 || upstream.status === 429) {
          // Brief pause on temporary spike / rate-limit before trying fallback model
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
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
                tokensEmitted = true;
                res.write(`data: ${JSON.stringify({ text })}\n\n`);
              }
            } catch (e) {}
          }
        }
      }

      res.write('data: [DONE]\n\n');
      return res.end();
    } catch (err) {
      console.warn(`Model ${m} stream attempt notice:`, err.message);
      lastErrorDetail = {
        model: m,
        status: 500,
        code: 'NETWORK_OR_PARSING_ERROR',
        message: err.message
      };
      if (tokensEmitted) {
        res.write(`data: ${JSON.stringify({ type: 'reset_buffer' })}\n\n`);
        tokensEmitted = false;
      }
    }
  }

  let userErrorMsg = 'Google Gemini service is temporarily busy. Please try again in a few moments.';
  if (lastErrorDetail) {
    const { status, code, message } = lastErrorDetail;
    const lower = (message || '').toLowerCase();
    if (status === 400 && (lower.includes('api key') || lower.includes('api_key') || lower.includes('invalid') || lower.includes('key not valid'))) {
      userErrorMsg = `Gemini API Key Error (400 Invalid Key): ${message}. Please check GEMINI_API_KEY in Vercel Project Settings or enter a custom key in app Settings.`;
    } else if (status === 403) {
      userErrorMsg = `Gemini API Error (403 Permission Denied): ${message}. Please verify your API key is enabled in Google AI Studio.`;
    } else if (status === 429) {
      userErrorMsg = `Gemini API Error (429 Quota Exceeded): ${message}. Your Google AI Studio rate limit or quota has been reached.`;
    } else if (status === 503 || lower.includes('high demand') || lower.includes('unavailable')) {
      userErrorMsg = `Google Gemini is temporarily experiencing high demand (503). Please retry in a few moments or click Regenerate.`;
    } else {
      userErrorMsg = `Google Gemini Error (${status} ${code || ''}): ${message || 'Upstream request failed'}`;
    }
  }

  res.write(`data: ${JSON.stringify({ error: userErrorMsg })}\n\n`);
  return res.end();
}
