// api/tts.js
// Serverless TTS endpoint for Gemini Neural Voice synthesis
// Securely accesses process.env.GEMINI_API_KEY on the server only


function pcmToWavBuffer(cleanBase64, sampleRate = 24000, numChannels = 1) {
  const pcmBytes = Buffer.from(cleanBase64, 'base64');
  const byteRate = sampleRate * numChannels * 2;
  const blockAlign = numChannels * 2;
  const dataSize = pcmBytes.length;
  const header = Buffer.alloc(44);

  // RIFF header
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);

  // fmt subchunk
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM format
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(16, 34); // 16 bits per sample

  // data subchunk
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBytes]);
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

  const clientKey = req.headers['x-gemini-api-key'] || req.body?.apiKey;
  const rawKey = clientKey || process.env.GEMINI_API_KEY || '';
  let GEMINI_API_KEY = typeof rawKey === 'string' ? rawKey.trim().replace(/^["']|["']$/g, '') : '';
  if (GEMINI_API_KEY.toLowerCase().startsWith('bearer ')) {
    GEMINI_API_KEY = GEMINI_API_KEY.slice(7).trim();
  }

  if (!GEMINI_API_KEY || GEMINI_API_KEY === 'your_gemini_api_key_here') {
    return res.status(500).json({ error: 'GEMINI_API_KEY is not configured or is a placeholder. Please set GEMINI_API_KEY in your Vercel Project Settings or provide an API key in settings.' });
  }

  const { text, voice = 'Aoede' } = req.body || {};
  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'Text is required' });
  }

  // Pre-clean text for clear, natural speech
  const cleanText = text
    .replace(/```[\s\S]*?```/g, 'Code block omitted.')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[*_~#]/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[-–—]{2,}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 4000);

  if (!cleanText) {
    return res.status(400).json({ error: 'No pronounceable text found' });
  }

  const voiceName = ['Aoede', 'Kore', 'Puck', 'Charon', 'Fenrir'].includes(voice)
    ? voice
    : 'Aoede';

  const modelsToTry = [
    'gemini-3.8-flash-lite-tts',
    'gemini-3.8-flash-tts',
    'gemini-3.1-flash-tts-preview',
    'gemini-2.5-flash-preview-tts'
  ];

  const isOAuthToken = GEMINI_API_KEY.startsWith('ya29.');
  const upstreamHeaders = {
    'Content-Type': 'application/json'
  };
  if (isOAuthToken) {
    upstreamHeaders['Authorization'] = `Bearer ${GEMINI_API_KEY}`;
  } else {
    upstreamHeaders['x-goog-api-key'] = GEMINI_API_KEY;
  }

  let lastErrorMsg = null;
  for (const model of modelsToTry) {
    try {
      const queryParam = isOAuthToken ? '' : `?key=${encodeURIComponent(GEMINI_API_KEY)}`;
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent${queryParam}`;
      const response = await fetch(geminiUrl, {
        method: 'POST',
        headers: upstreamHeaders,
        body: JSON.stringify({
          contents: [{ parts: [{ text: cleanText }] }],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName
                }
              }
            }
          }
        })
      });

      if (!response.ok) {
        let errSnippet = '';
        try {
          const errData = await response.json();
          errSnippet = errData?.error?.message || '';
        } catch (_) {}
        if (response.status === 401) {
          lastErrorMsg = `Gemini Authentication Error (401 Unauthenticated): ${errSnippet || 'Invalid credentials'}. Verify GEMINI_API_KEY is active in Google AI Studio.`;
        }
        console.warn(`[TTS] Model ${model} returned status ${response.status}:`, errSnippet);
        continue;
      }

      const data = await response.json();
      const rawBase64 = data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!rawBase64) {
        console.warn(`[TTS] Model ${model} returned no audio parts`);
        continue;
      }

      const cleanBase64 = rawBase64.replace(/[\s\r\n]+/g, '');
      const wavBuffer = pcmToWavBuffer(cleanBase64, 24000, 1);
      const base64Wav = wavBuffer.toString('base64');

      return res.status(200).json({
        audio: base64Wav,
        voice: voiceName,
        mimeType: 'audio/wav',
        model
      });
    } catch (err) {
      console.error(`[TTS] Error calling ${model}:`, err.message);
    }
  }

  return res.status(500).json({ error: lastErrorMsg || 'Failed to synthesize Gemini speech' });
}
