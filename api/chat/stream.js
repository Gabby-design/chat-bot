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

  const { message, model = 'standard', mode = 'chat' } = req.body || {};
  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  let selectedModel = 'gemini-3.6-flash';
  if (model === 'fast' || model === 'lite') {
    selectedModel = 'gemini-3.5-flash-lite';
  } else if (model === 'advanced') {
    selectedModel = 'gemini-3.6-flash';
  }

  const baseIntelligence = "You are Gabby, a state-of-the-art AI assistant with top-tier intelligence, clarity, and depth—equivalent to ChatGPT Plus. You are extraordinarily knowledgeable, insightful, articulate, and thoughtful. You adapt seamlessly to any domain: deep coding, complex reasoning, creative writing, science, mathematics, analysis, and everyday chat. Be direct, thorough, and smart, avoiding unnecessary fluff while providing high-value, accurate insights.";

  const systemInstructionText = mode === 'voice'
    ? `${baseIntelligence}\n\nSPOKEN VOICE DELIVERY RULES:\n1. Deliver your full, top-tier intelligent answer naturally in clear, flowing spoken English.\n2. Do not output markdown symbols (no asterisks, hash signs, bullet points, or code blocks) since your output is spoken aloud.\n3. Speak warmly and engagingly.`
    : baseIntelligence;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const modelsToTry = [selectedModel, 'gemini-flash-latest', 'gemini-3.5-flash', 'gemini-3.8-flash'];

  for (const m of modelsToTry) {
    try {
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${m}:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`;
      const upstream = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: message }] }],
          systemInstruction: { parts: [{ text: systemInstructionText }] }
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
