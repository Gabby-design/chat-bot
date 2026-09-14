// Gemini Neural Text-to-Speech Engine
// Studio-quality 24kHz human voice synthesis powered by official Google Gemini models

export const GEMINI_VOICES = [
  { id: 'Aoede', name: 'Aoede', description: 'Warm, natural & melodic (Gemini Default)', gender: 'female' },
  { id: 'Kore', name: 'Kore', description: 'Calm, smooth & gentle', gender: 'female' },
  { id: 'Puck', name: 'Puck', description: 'Upbeat, friendly & lively', gender: 'male' },
  { id: 'Charon', name: 'Charon', description: 'Deep, steady & confident', gender: 'male' },
  { id: 'Fenrir', name: 'Fenrir', description: 'Rich, articulate & resonant', gender: 'male' }
];

export const DEFAULT_GEMINI_VOICE = 'Aoede';

// In-memory cache to play previously synthesized phrases with 0ms latency
const speechAudioCache = new Map();

// Global single Audio instance to prevent overlapping speech
let currentAudio = null;
let currentAbortController = null;

// Prepares clean, natural spoken English text from markdown content
export function cleanTextForSpeech(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/```[\s\S]*?```/g, 'Code block omitted.')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[*_~#]/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[-–—]{2,}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 4000);
}

// Converts base64 PCM L16 24kHz audio into a standard playable WAV Blob in browser memory
export function pcmToWavBlob(base64Pcm, sampleRate = 24000, numChannels = 1) {
  const cleanBase64 = base64Pcm.replace(/[\s\r\n]+/g, '');
  const binaryString = window.atob(cleanBase64);
  const pcmLength = binaryString.length;
  const pcmBytes = new Uint8Array(pcmLength);

  for (let i = 0; i < pcmLength; i++) {
    pcmBytes[i] = binaryString.charCodeAt(i);
  }

  const wavBuffer = new ArrayBuffer(44 + pcmLength);
  const view = new DataView(wavBuffer);

  const writeString = (offset, string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  const byteRate = sampleRate * numChannels * 2;
  const blockAlign = numChannels * 2;

  // RIFF identifier
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + pcmLength, true);
  writeString(8, 'WAVE');

  // fmt sub-chunk
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // 16-bit

  // data sub-chunk
  writeString(36, 'data');
  view.setUint32(40, pcmLength, true);

  const wavBytes = new Uint8Array(wavBuffer);
  wavBytes.set(pcmBytes, 44);

  return new Blob([wavBytes], { type: 'audio/wav' });
}

// Synthesize speech using Google Gemini Neural Voice (Vercel Serverless or direct fallback)
export async function synthesizeGeminiVoice(rawText, { voice = DEFAULT_GEMINI_VOICE, apiKey = '' } = {}) {
  const cleanText = cleanTextForSpeech(rawText);
  if (!cleanText) {
    throw new Error('No text to synthesize');
  }

  const cacheKey = `${voice}:${cleanText.slice(0, 120)}:${cleanText.length}`;
  if (speechAudioCache.has(cacheKey)) {
    return speechAudioCache.get(cacheKey);
  }

  const voiceName = GEMINI_VOICES.some((v) => v.id === voice) ? voice : DEFAULT_GEMINI_VOICE;

  // 1. Try serverless backend /api/tts endpoint first
  try {
    const apiBase = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
      ? ''
      : '';

    const res = await fetch(`${apiBase}/api/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: cleanText, voice: voiceName })
    });

    if (res.ok) {
      const data = await res.json();
      if (data.audio) {
        // audio is base64 WAV
        const binaryWav = window.atob(data.audio.replace(/[\s\r\n]+/g, ''));
        const bytes = new Uint8Array(binaryWav.length);
        for (let i = 0; i < binaryWav.length; i++) {
          bytes[i] = binaryWav.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: 'audio/wav' });
        const blobUrl = URL.createObjectURL(blob);
        speechAudioCache.set(cacheKey, blobUrl);
        return blobUrl;
      }
    }
  } catch (err) {
    console.warn('[Gemini Voice] /api/tts unavailable, trying direct client API:', err.message);
  }

  // 2. Client-side direct Google Gemini API fallback
  if (apiKey) {
    const models = ['gemini-2.5-flash-preview-tts', 'gemini-3.1-flash-tts-preview'];
    for (const model of models) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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

        if (!res.ok) continue;

        const data = await res.json();
        const rawBase64 = data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (rawBase64) {
          const blob = pcmToWavBlob(rawBase64, 24000, 1);
          const blobUrl = URL.createObjectURL(blob);
          speechAudioCache.set(cacheKey, blobUrl);
          return blobUrl;
        }
      } catch (clientErr) {
        console.warn(`[Gemini Voice] Direct call to ${model} failed:`, clientErr.message);
      }
    }
  }

  throw new Error('Could not synthesize Gemini voice audio.');
}

// Stops any currently playing audio immediately
export function stopGeminiVoice() {
  if (currentAbortController) {
    currentAbortController.abort();
    currentAbortController = null;
  }
  if (currentAudio) {
    try {
      currentAudio.pause();
      currentAudio.currentTime = 0;
      currentAudio.src = '';
    } catch (e) {}
    currentAudio = null;
  }
}

// Plays Gemini Voice audio with full state lifecycle callbacks
export async function playGeminiVoice(rawText, {
  voice = DEFAULT_GEMINI_VOICE,
  apiKey = '',
  onLoading = () => {},
  onStart = () => {},
  onEnd = () => {},
  onError = () => {}
} = {}) {
  // Stop existing playback
  stopGeminiVoice();

  const abortController = new AbortController();
  currentAbortController = abortController;

  try {
    onLoading(true);

    const blobUrl = await synthesizeGeminiVoice(rawText, { voice, apiKey });

    if (abortController.signal.aborted) {
      onLoading(false);
      return;
    }

    onLoading(false);

    const audio = new Audio(blobUrl);
    currentAudio = audio;

    audio.onplay = () => {
      onStart();
    };

    audio.onended = () => {
      if (currentAudio === audio) {
        currentAudio = null;
      }
      onEnd();
    };

    audio.onerror = (e) => {
      if (currentAudio === audio) {
        currentAudio = null;
      }
      onError(e);
    };

    await audio.play();
  } catch (err) {
    onLoading(false);
    onError(err);
  }
}
