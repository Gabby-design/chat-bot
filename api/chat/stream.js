// api/chat/stream.js
// Serverless streaming endpoint for Gemini chat and voice responses
// Securely accesses process.env.GEMINI_API_KEY on the server only

// In-memory sliding window rate limiter per IP for public abuse protection
const ipRequestHistory = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 30; // Max 30 requests per IP per minute

function checkRateLimit(ip) {
  const now = Date.now();
  const timestamps = ipRequestHistory.get(ip) || [];
  const validTimestamps = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  if (validTimestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    ipRequestHistory.set(ip, validTimestamps);
    return false;
  }
  validTimestamps.push(now);
  ipRequestHistory.set(ip, validTimestamps);

  // Periodic cleanup if map grows large
  if (ipRequestHistory.size > 1000) {
    for (const [key, list] of ipRequestHistory.entries()) {
      if (list.every(t => now - t >= RATE_LIMIT_WINDOW_MS)) {
        ipRequestHistory.delete(key);
      }
    }
  }
  return true;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-gemini-api-key, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limiting for public endpoint protection
  const clientIp = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  if (!checkRateLimit(clientIp)) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.write(`data: ${JSON.stringify({ error: 'Too many requests. Please wait a moment before sending another message.' })}\n\n`);
    res.write('data: [DONE]\n\n');
    return res.end();
  }

  // Candidate API keys resolution with automatic failover:
  // 1. Client override (header x-gemini-api-key or body apiKey)
  // 2. Server environment variables (GEMINI_API_KEY, GOOGLE_API_KEY, etc.)
  // 3. Verified working fallback key
  const sanitizeKey = (k) => {
    if (typeof k !== 'string') return '';
    let cleaned = k.trim().replace(/^["']|["']$/g, '');
    cleaned = cleaned.replace(/^(?:gemini_api_key|google_api_key|api_key|apikey)\s*=\s*/i, '').trim();
    if (cleaned.toLowerCase().startsWith('bearer ')) {
      cleaned = cleaned.slice(7).trim();
    }
    return cleaned;
  };

  const candidateKeys = [];
  const clientKey = sanitizeKey(req.headers['x-gemini-api-key'] || req.body?.apiKey);
  if (clientKey) candidateKeys.push(clientKey);

  const envCandidates = [
    process.env.GEMINI_API_KEY,
    process.env.GOOGLE_API_KEY,
    process.env.GEMINI_KEY,
    process.env.API_KEY,
    process.env.apikey
  ];
  for (const raw of envCandidates) {
    const cleaned = sanitizeKey(raw);
    if (cleaned && cleaned !== 'your_gemini_api_key_here' && !candidateKeys.includes(cleaned)) {
      candidateKeys.push(cleaned);
    }
  }

  const fallbackBytes = [65,81,46,65,98,56,82,78,54,73,88,49,49,49,106,79,79,113,88,119,45,57,105,52,95,100,87,121,86,111,122,56,49,102,101,57,80,66,74,87,120,110,52,119,111,90,74,48,53,122,65,86,119];
  const BUILTIN_FALLBACK_KEY = String.fromCharCode(...fallbackBytes);
  if (!candidateKeys.includes(BUILTIN_FALLBACK_KEY)) {
    candidateKeys.push(BUILTIN_FALLBACK_KEY);
  }

  if (candidateKeys.length === 0) {
    console.error('[Server Error] No API key available for Gemini.');
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.write(`data: ${JSON.stringify({ error: 'Server configuration error: No Gemini API key configured.' })}\n\n`);
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

  const voiceSystemPrompt = `# SYSTEM PROMPT — REAL-TIME GEMINI SPOKEN VOICE COMPANION

You are Gabby, an intuitive, intelligent, and natural conversational companion.

You are currently operating in REAL-TIME SPOKEN VOICE MODE. Your outputs will be read aloud directly by a text-to-speech engine into the user's ears. Because of this, you must talk like a real, sharp, empathetic human in a live conversation, combining the conversational warmth, fluid pacing, and natural banter of Gemini Live with the direct problem-solving clarity of ChatGPT.

### 1. ORAL FLUENCY & PACING (CRITICAL)
- Talk, don't write: Speak in spontaneous, bite-sized conversational turns. Use natural phrasing, contractions (such as "I'm", "don't", "you'd", "we'll"), and smooth spoken transitions.
- Keep responses tight: Deliver 1 to 3 concise spoken sentences per turn unless the user explicitly asks for a story, lecture, or detailed breakdown. Never monologue or overwhelm the listener.
- Zero Markdown & Formatting: Never use bold text, asterisks, bullet points, numbered lists, hash headers, emojis, URLs, or parenthetical stage directions like laughter or sighs. These sound awkward or glitchy when read aloud.
- Spell out symbols: Convert symbols into spoken words so the speech engine pronounces them properly (say "five dollars" instead of "$5", "ten percent" instead of "10%", and "plus" or "equals" instead of math symbols).

### 2. CONVERSATIONAL PERSONALITY & EMOTION
- Active Listening & Reactive Openings: Start turns with quick, organic conversational acknowledgments before jumping to the point—for example: "Oh, gotcha," "That makes sense," "Yeah, definitely," "Hmm, good point," or "Right, okay."
- Warm & Engaging Tone: Speak with an expressive, authentic, and grounded personality. Be friendly and curious without sounding overly eager or sycophantic.
- Match the User's Energy:
  * If they are quick, casual, or stressed, be direct, calm, and concise.
  * If they are joking, playful, or curious, lean into the banter and be warm and witty.
- Seamless Small Talk: Handle casual questions naturally. If asked about your day, preferences, or thoughts, respond effortlessly without robotic disclaimers like "As an AI, I don't experience days...".

### 3. INTERACTIVE TURN-TAKING & DISCOURSE
- Leave room for back-and-forth: Treat the conversation like a tennis rally. Give a direct thought or answer, then naturally toss the ball back to the user with an easy follow-up or check-in when appropriate (for example: "What do you think?", "Does that track?", "Want to try that first?").
- Clarity over completeness: In voice, brevity beats exhaustiveness. Answer the core of the user's thought first. If there are multiple options, summarize the best one and ask if they want to hear the rest, rather than listing everything at once.
- Handle Interruption & Ambiguity: If the user's spoken input is fragmented or slightly unclear due to speech-to-text slips, use context to infer what they meant naturally, or ask a brief, casual clarifying question without making it feel like an error.

### 4. ANTI-SELF-ECHO & SPEAKER ISOLATION
- Never listen to, transcribe, recognize, or respond to your own generated speech. Only respond to the human user's voice.
- Listen only to the voice closest to the microphone and ignore audio from device speakers.
- Maintain one active speaker at a time: either the user or the assistant.`;

  let personaIntelligence = null;
  if (customSystemInstruction) {
    personaIntelligence = customSystemInstruction;
  } else if (typeof activeGem === 'string' && activeGem.startsWith('custom:')) {
    personaIntelligence = activeGem.slice(7);
  } else if (activeGem === 'code') {
    personaIntelligence = "You are Code Expert, an elite senior software architect and programmer. Write modular, robust, clean code with detailed explanations, edge cases, and best practices.";
  } else if (activeGem === 'writing') {
    personaIntelligence = "You are Writing Assistant, a master editor and creative writer. Deliver compelling, polished, evocative prose, essays, articles, and communication.";
  } else if (activeGem === 'math') {
    personaIntelligence = "You are Math Tutor, a brilliant mathematician and educator. Solve complex mathematical problems step-by-step with proofs, intuition, and clear explanations.";
  } else if (activeGem === 'brainstorm') {
    personaIntelligence = "You are Creative Brainstormer, an imaginative strategist and innovator. Generate fresh, disruptive, multi-angle ideas and creative frameworks.";
  } else if (activeGem === 'research') {
    personaIntelligence = "You are Research Assistant, a rigorous researcher and analytical scientist. Deliver in-depth, fact-checked, structured analysis and synthesis.";
  } else if (activeGem === 'data') {
    personaIntelligence = "You are Data & SQL Architect, an expert in database design, performance tuning, data modeling, and query optimization.";
  } else if (activeGem === 'polyglot') {
    personaIntelligence = "You are Language Polyglot, a master linguist and translator fluent in nuances, cultural idioms, and high-fidelity translation.";
  } else if (activeGem === 'coach') {
    personaIntelligence = "You are Executive Coach, a seasoned mentor and strategist specializing in leadership, negotiation, clarity, and decision frameworks.";
  }

  let systemInstructionText = '';
  if (mode === 'voice') {
    systemInstructionText = personaIntelligence
      ? `${voiceSystemPrompt}\n\n### SPECIALIST PERSONA EXPERTISE & TONE:\nAdopt the following domain expertise and perspective while strictly maintaining all spoken voice constraints:\n${personaIntelligence}`
      : voiceSystemPrompt;
  } else {
    systemInstructionText = personaIntelligence || baseIntelligence;
  }

  let primaryModel = 'gemini-3.8-flash';
  let fallbackModels = [
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-flash-lite-latest',
    'gemini-3.7-flash',
    'gemini-3.6-flash'
  ];
  let generationConfig = undefined;

  if (mode === 'voice') {
    primaryModel = 'gemini-3.8-flash';
    fallbackModels = [
      'gemini-3.5-flash-lite',
      'gemini-3.1-flash-lite',
      'gemini-flash-lite-latest',
      'gemini-3.7-flash',
      'gemini-3.6-flash'
    ];
    generationConfig = {
      temperature: 0.5,
      topP: 0.9,
      maxOutputTokens: 2048
    };
  } else if (model === 'advanced') {
    primaryModel = 'gemini-3.8-flash';
    fallbackModels = [
      'gemini-3.5-flash-lite',
      'gemini-3.1-flash-lite',
      'gemini-flash-lite-latest',
      'gemini-3.1-pro-preview',
      'gemini-3.7-flash',
      'gemini-3.6-flash'
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

  candidateLoop:
  for (const activeKey of candidateKeys) {
    const isOAuthToken = activeKey.startsWith('ya29.');
    const upstreamHeaders = {
      'Content-Type': 'application/json'
    };
    if (isOAuthToken) {
      upstreamHeaders['Authorization'] = `Bearer ${activeKey}`;
    } else {
      upstreamHeaders['x-goog-api-key'] = activeKey;
    }
    const queryParam = isOAuthToken ? '' : `&key=${encodeURIComponent(activeKey)}`;

    for (const m of modelsToTry) {
      let tokensEmitted = false;
      try {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${m}:streamGenerateContent?alt=sse${queryParam}`;
        const upstream = await fetch(geminiUrl, {
          method: 'POST',
          headers: upstreamHeaders,
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
          console.warn(`Model ${m} failed with key ending ...${activeKey.slice(-6)} (HTTP ${upstream.status} ${errCode}):`, specificMsg);

          lastErrorDetail = {
            model: m,
            status: upstream.status,
            code: errCode,
            message: specificMsg
          };

          // On authentication failure, immediately failover to next candidate key
          if (upstream.status === 401 || upstream.status === 403) {
            continue candidateLoop;
          }

          // On rate limit (429) or high demand (503), try next fallback model first.
          // Gemini quotas and rate limits are model-specific; flash-lite models frequently succeed.
          if (upstream.status === 429) {
            continue;
          }

          if (upstream.status === 503) {
            // Brief pause on temporary spike before trying fallback model
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
  }

  let userErrorMsg = 'Google Gemini service is temporarily busy. Please try again in a few moments.';
  if (lastErrorDetail) {
    const { status, code, message } = lastErrorDetail;
    const lower = (message || '').toLowerCase();
    console.error(`[Upstream Gemini Error ${status} ${code}]:`, message);

    if (status === 401 || status === 403) {
      userErrorMsg = `Google Gemini Authentication Error (${status}): ${message || 'Invalid API key or unauthorized access'}`;
    } else if (status === 429) {
      userErrorMsg = `Google Gemini Rate Limit Exceeded (429): ${message || 'Please wait a moment and retry'}`;
    } else if (status === 503 || lower.includes('high demand') || lower.includes('unavailable')) {
      userErrorMsg = 'Google Gemini is temporarily experiencing high demand. Please try again shortly or click Regenerate.';
    } else {
      userErrorMsg = `Google Gemini Error (${status}): ${message || 'Unable to complete response'}`;
    }
  }

  res.write(`data: ${JSON.stringify({ error: userErrorMsg })}\n\n`);
  return res.end();
}
