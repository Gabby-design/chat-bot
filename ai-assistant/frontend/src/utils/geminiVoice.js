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

// Synthesize speech using Neural Voice (Serverless /api/tts endpoint)
export async function synthesizeGeminiVoice(rawText, { voice = DEFAULT_GEMINI_VOICE } = {}) {
  const cleanText = cleanTextForSpeech(rawText);
  if (!cleanText) {
    throw new Error('No text to synthesize');
  }

  const cacheKey = `${voice}:${cleanText.slice(0, 120)}:${cleanText.length}`;
  if (speechAudioCache.has(cacheKey)) {
    return speechAudioCache.get(cacheKey);
  }

  const voiceName = GEMINI_VOICES.some((v) => v.id === voice) ? voice : DEFAULT_GEMINI_VOICE;

  // 1. Try POST /api/tts (returns base64 audio payload)
  try {
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: cleanText, voice: voiceName })
    });

    if (res.ok) {
      const data = await res.json();
      if (data.audio) {
        const mimeType = data.mimeType || 'audio/mpeg';
        const cleanBase64 = data.audio.replace(/[\s\r\n]+/g, '');
        const binaryString = window.atob(cleanBase64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: mimeType });
        const blobUrl = URL.createObjectURL(blob);
        speechAudioCache.set(cacheKey, blobUrl);
        return blobUrl;
      }
    }
  } catch (err) {
    console.warn('[Gemini Voice] POST /api/tts notice:', err.message);
  }

  // 2. Direct streaming GET /api/tts as fallback URL
  try {
    const streamUrl = `/api/tts?text=${encodeURIComponent(cleanText)}&voice=${encodeURIComponent(voiceName)}`;
    return streamUrl;
  } catch (err) {
    console.warn('[Gemini Voice] Fallback URL generation error:', err);
  }

  throw new Error('Could not synthesize voice audio via server.');
}

// Stops and flushes any currently playing audio immediately
export function stopGeminiVoice() {
  if (currentAbortController) {
    currentAbortController.abort();
    currentAbortController = null;
  }
  if (currentAudio) {
    try {
      currentAudio.pause();
      currentAudio.currentTime = 0;
      currentAudio.removeAttribute('src');
      currentAudio.load(); // Forces browser to flush decoded PCM buffer immediately
    } catch (e) {}
    currentAudio = null;
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

// Plays voice audio with multi-tier fallback lifecycle
export async function playGeminiVoice(rawText, {
  voice = DEFAULT_GEMINI_VOICE,
  onLoading = () => {},
  onStart = () => {},
  onEnd = () => {},
  onError = () => {}
} = {}) {
  // Stop existing playback
  stopGeminiVoice();

  const clean = cleanTextForSpeech(rawText);
  if (!clean) {
    onError(new Error('No text to speak'));
    return;
  }

  const abortController = new AbortController();
  currentAbortController = abortController;

  try {
    onLoading(true);

    const audioUrl = await synthesizeGeminiVoice(rawText, { voice });

    if (abortController.signal.aborted) {
      onLoading(false);
      return;
    }

    onLoading(false);

    const audio = new Audio(audioUrl);
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

    audio.onerror = async () => {
      if (currentAudio === audio) {
        currentAudio = null;
      }
      // Tier 2 Fallback: Browser Web Speech API
      console.warn('[Voice Engine] Audio element playback failed, falling back to Web Speech API');
      speakWithWebSpeechFallback(clean, onStart, onEnd, onError);
    };

    const playPromise = audio.play();
    if (playPromise !== undefined) {
      await playPromise;
    }
  } catch (err) {
    onLoading(false);
    console.warn('[Voice Engine] Server synthesis error, falling back to Web Speech API:', err.message);
    speakWithWebSpeechFallback(clean, onStart, onEnd, onError);
  }
}

function speakWithWebSpeechFallback(text, onStart, onEnd, onError) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    onError(new Error('Speech synthesis not supported on this device'));
    return;
  }

  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    const voices = window.speechSynthesis.getVoices?.() || [];
    const preferred = voices.find(
      (v) =>
        v.lang.startsWith('en') &&
        (v.name.includes('Natural') ||
          v.name.includes('Google') ||
          v.name.includes('Samantha') ||
          v.name.includes('Aria'))
    ) || voices.find((v) => v.lang.startsWith('en'));

    if (preferred) utterance.voice = preferred;

    utterance.onstart = () => onStart();
    utterance.onend = () => onEnd();
    utterance.onerror = (e) => {
      onEnd();
      onError(e);
    };

    window.speechSynthesis.speak(utterance);
  } catch (e) {
    onError(e);
  }
}
