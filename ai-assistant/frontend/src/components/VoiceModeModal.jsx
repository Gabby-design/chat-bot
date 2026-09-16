import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, X, Square, Zap, ThumbsUp, ThumbsDown, Copy, Check, Plus, Volume2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { synthesizeGeminiVoice, stopGeminiVoice, GEMINI_VOICES, DEFAULT_GEMINI_VOICE } from '../utils/geminiVoice.js';

// Anti-Self-Echo & Duplicate Filter: Prevents assistant from transcribing or replying to its own speaker output
function isSelfEchoOrDuplicate(text, recentAssistantSpeeches = [], lastUserText = '') {
  if (!text || typeof text !== 'string') return true;
  const clean = text.toLowerCase().replace(/[^\w\s]/g, '').trim();
  if (!clean || clean.length < 2) return true;

  // 1. Check duplicate of last user submission within short window
  if (lastUserText) {
    const cleanLast = lastUserText.toLowerCase().replace(/[^\w\s]/g, '').trim();
    if (clean === cleanLast) {
      return true;
    }
  }

  // 2. Filter echo of recent assistant utterances
  const userWords = clean.split(/\s+/).filter((w) => w.length > 2);
  if (userWords.length === 0) return false;

  for (const speech of recentAssistantSpeeches) {
    if (!speech) continue;
    const cleanSpeech = speech.toLowerCase().replace(/[^\w\s]/g, '').trim();
    if (cleanSpeech.includes(clean)) {
      return true;
    }
    const speechWordSet = new Set(cleanSpeech.split(/\s+/));
    let matchCount = 0;
    for (const w of userWords) {
      if (speechWordSet.has(w)) matchCount++;
    }
    if (userWords.length <= 3 && matchCount >= 2) {
      return true;
    }
    if (userWords.length > 3 && matchCount / userWords.length >= 0.5) {
      return true;
    }
  }

  return false;
}

export default function VoiceModeModal({
  isOpen,
  onClose,
  onSendMessage,
  onAbort,
  onNewChat,
  messages = [],
  onType,
  selectedVoice = DEFAULT_GEMINI_VOICE,
  apiKey = ''
}) {
  const isMobile = typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  // Voice states: 'listening' | 'processing' | 'speaking' | 'muted' | 'idle'
  const [voiceState, setVoiceState] = useState('listening');
  const [isMuted, setIsMuted] = useState(false);
  const [isMicActive, setIsMicActive] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [copiedIndex, setCopiedIndex] = useState(null);
  const [currentAssistantSpeech, setCurrentAssistantSpeech] = useState('');

  const recognitionRef = useRef(null);
  const isListeningRef = useRef(false);
  const silenceTimeoutRef = useRef(null);
  const isMountedRef = useRef(true);
  const isShuttingDownRef = useRef(false);
  const messagesEndRef = useRef(null);
  const activeAudioRef = useRef(null);
  const voiceStateRef = useRef('listening');
  const isMutedRef = useRef(false);

  // Eliminate self-listening & echo loop safety refs
  const isAssistantSpeakingRef = useRef(false);
  const recentAssistantTextsRef = useRef([]);
  const lastSubmittedUserSpeechRef = useRef('');
  const lastSubmittedTimeRef = useRef(0);
  const resumeListeningTimerRef = useRef(null);

  // Web Audio API & Analyser refs for real-time reactivity
  const audioContextRef = useRef(null);
  const micStreamRef = useRef(null);
  const micSourceRef = useRef(null);
  const micAnalyserRef = useRef(null);
  const ttsAudioRef = useRef(null);
  const ttsSourceRef = useRef(null);
  const ttsAnalyserRef = useRef(null);
  const orbRef = useRef(null);
  const animFrameRef = useRef(null);
  const currentLevelRef = useRef(0);

  const initAudioContext = () => {
    try {
      if (!audioContextRef.current) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
          audioContextRef.current = new AudioContextClass();
        }
      }
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume().catch(() => {});
      }
    } catch (e) {
      console.warn('[Voice Mode] AudioContext init error:', e);
    }
  };

  const unlockAudioContextAndSpeech = () => {
    try {
      initAudioContext();
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        const silent = new SpeechSynthesisUtterance('');
        silent.volume = 0;
        window.speechSynthesis.speak(silent);
      }
      if (!ttsAudioRef.current) {
        const audio = new Audio();
        audio.crossOrigin = 'anonymous';
        ttsAudioRef.current = audio;
      }
    } catch (e) {}
  };

  const setupTtsAudio = () => {
    if (!ttsAudioRef.current) {
      const audio = new Audio();
      audio.crossOrigin = 'anonymous';
      ttsAudioRef.current = audio;
    }

    // On mobile devices, avoid Web Audio createMediaElementSource routing because
    // iOS Safari mutes or blocks MediaElementSource nodes attached to dynamic audio blobs.
    if (isMobile) return;

    initAudioContext();
    if (audioContextRef.current && ttsAudioRef.current && !ttsSourceRef.current) {
      try {
        const source = audioContextRef.current.createMediaElementSource(ttsAudioRef.current);
        const analyser = audioContextRef.current.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.5;
        source.connect(analyser);
        analyser.connect(audioContextRef.current.destination);
        ttsSourceRef.current = source;
        ttsAnalyserRef.current = analyser;
      } catch (e) {
        console.warn('[Voice Mode] createMediaElementSource for TTS failed:', e);
      }
    }
  };

  const setupMicAudio = async () => {
    // IMPORTANT: On mobile phones, DO NOT open a competing getUserMedia audio stream!
    // iOS Safari and Android Chrome lock the microphone hardware exclusively to getUserMedia,
    // which starves and completely breaks webkitSpeechRecognition.
    if (isMobile) return;

    if (micStreamRef.current || !navigator.mediaDevices?.getUserMedia) return;
    try {
      initAudioContext();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: { ideal: true },
          noiseSuppression: { ideal: true },
          autoGainControl: { ideal: true }
        }
      });

      if (!isMountedRef.current || isShuttingDownRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      micStreamRef.current = stream;

      if (audioContextRef.current) {
        if (audioContextRef.current.state === 'suspended') {
          audioContextRef.current.resume().catch(() => {});
        }
        const source = audioContextRef.current.createMediaStreamSource(stream);
        const analyser = audioContextRef.current.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.5;
        source.connect(analyser);
        // Important: DO NOT connect micAnalyser to audioContext.destination (avoids speaker echo)
        micSourceRef.current = source;
        micAnalyserRef.current = analyser;
      }
    } catch (err) {
      console.warn('[Voice Mode] Desktop mic analyser optional stream note:', err.message);
    }
  };

  // Real-time 60fps audio amplitude loop updating CSS custom property --level
  useEffect(() => {
    let isCancelled = false;

    const loop = (timestamp) => {
      if (isCancelled) return;

      let target = 0;
      const state = voiceStateRef.current;

      if (state === 'speaking') {
        if (ttsAnalyserRef.current) {
          const buffer = new Uint8Array(ttsAnalyserRef.current.frequencyBinCount);
          ttsAnalyserRef.current.getByteFrequencyData(buffer);
          let sum = 0;
          for (let i = 0; i < buffer.length; i++) sum += buffer[i];
          const avg = sum / buffer.length;
          target = Math.min(1, Math.max(0, (avg - 10) / 55));
        } else {
          // Mobile natural speech pulse animation
          target = 0.45 + 0.35 * Math.sin(timestamp * 0.007) * Math.cos(timestamp * 0.003);
        }

        // Desktop barge-in: If user talks into mic while assistant speaks
        if (!isMobile && micAnalyserRef.current && !isMutedRef.current && !isShuttingDownRef.current) {
          const micBuffer = new Uint8Array(micAnalyserRef.current.frequencyBinCount);
          micAnalyserRef.current.getByteFrequencyData(micBuffer);
          let micSum = 0;
          for (let i = 0; i < micBuffer.length; i++) micSum += micBuffer[i];
          const micAvg = micSum / micBuffer.length;
          if (micAvg > 28) {
            handleInterrupt();
            return;
          }
        }
      } else if ((state === 'listening' || state === 'processing') && !isMutedRef.current) {
        if (micAnalyserRef.current) {
          const buffer = new Uint8Array(micAnalyserRef.current.frequencyBinCount);
          micAnalyserRef.current.getByteFrequencyData(buffer);
          let sum = 0;
          for (let i = 0; i < buffer.length; i++) sum += buffer[i];
          const avg = sum / buffer.length;
          target = Math.min(1, Math.max(0, (avg - 8) / 50));
        } else if (state === 'listening') {
          // Gentle breathing pulse while listening on mobile
          target = 0.12 + 0.08 * Math.sin(timestamp * 0.003);
        } else if (state === 'processing') {
          // Rapid thinking pulse
          target = 0.25 + 0.2 * Math.sin(timestamp * 0.01);
        }
      }

      // Smooth attack and natural organic decay
      if (target > currentLevelRef.current) {
        currentLevelRef.current = currentLevelRef.current * 0.5 + target * 0.5;
      } else {
        currentLevelRef.current = currentLevelRef.current * 0.85 + target * 0.15;
      }

      if (currentLevelRef.current < 0.005) {
        currentLevelRef.current = 0;
      }

      if (orbRef.current) {
        orbRef.current.style.setProperty('--level', currentLevelRef.current.toFixed(3));
      }

      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);

    return () => {
      isCancelled = true;
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };
  }, [isMobile]);

  const updateVoiceState = (newState) => {
    voiceStateRef.current = newState;
    setVoiceState(newState);
  };

  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, transcript, voiceState, currentAssistantSpeech]);

  // Clean shutdown helper
  const killAllVoiceAndMic = () => {
    isShuttingDownRef.current = true;
    isListeningRef.current = false;
    setIsMicActive(false);

    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }

    if (recognitionRef.current) {
      try {
        const rec = recognitionRef.current;
        recognitionRef.current = null;
        rec.onstart = null;
        rec.onresult = null;
        rec.onerror = null;
        rec.onend = null;
        rec.abort();
      } catch (e) {}
    }

    if (ttsAudioRef.current) {
      try {
        ttsAudioRef.current.pause();
        ttsAudioRef.current.currentTime = 0;
        ttsAudioRef.current.removeAttribute('src');
        ttsAudioRef.current.load();
      } catch (e) {}
    }
    if (activeAudioRef.current && activeAudioRef.current !== ttsAudioRef.current) {
      try {
        activeAudioRef.current.pause();
        activeAudioRef.current.currentTime = 0;
        activeAudioRef.current.removeAttribute('src');
        activeAudioRef.current.load();
      } catch (e) {}
    }
    activeAudioRef.current = null;
    stopGeminiVoice();

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

    if (micStreamRef.current) {
      try {
        micStreamRef.current.getTracks().forEach((track) => track.stop());
      } catch (e) {}
      micStreamRef.current = null;
    }
    if (micSourceRef.current) {
      try {
        micSourceRef.current.disconnect();
      } catch (e) {}
      micSourceRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (audioContextRef.current) {
      try {
        if (audioContextRef.current.state !== 'closed') {
          audioContextRef.current.close().catch(() => {});
        }
      } catch (e) {}
      audioContextRef.current = null;
    }
  };

  const handleExitVoiceMode = () => {
    killAllVoiceAndMic();
    if (onClose) onClose();
  };

  // Instant interruption (barge-in): halts generation, flushes client audio player buffers, and resumes listening
  const handleInterrupt = () => {
    if (resumeListeningTimerRef.current) {
      clearTimeout(resumeListeningTimerRef.current);
      resumeListeningTimerRef.current = null;
    }
    isAssistantSpeakingRef.current = false;

    // Explicitly pause and flush client-side audio player so no buffered words play
    if (ttsAudioRef.current) {
      try {
        ttsAudioRef.current.pause();
        ttsAudioRef.current.currentTime = 0;
        ttsAudioRef.current.removeAttribute('src');
        ttsAudioRef.current.load(); // Purges decoded PCM buffer immediately
      } catch (e) {}
    }
    if (activeAudioRef.current && activeAudioRef.current !== ttsAudioRef.current) {
      try {
        activeAudioRef.current.pause();
        activeAudioRef.current.currentTime = 0;
        activeAudioRef.current.removeAttribute('src');
        activeAudioRef.current.load();
      } catch (e) {}
    }
    activeAudioRef.current = null;
    stopGeminiVoice();

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

    if (onAbort) onAbort();

    setTranscript('');
    setCurrentAssistantSpeech('');
    updateVoiceState('listening');

    if (!isMutedRef.current && !isShuttingDownRef.current) {
      startListening();
    }
  };

  // Device Speech Synthesis (Native TTS Fallback): Guarantees speech works on every phone (iOS Safari & Android Chrome)
  const speakWithDeviceSynthesis = (text) => {
    return new Promise((resolve) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        resolve(false);
        return;
      }

      const cleanText = text
        .replace(/```[\s\S]*?```/g, 'Code block omitted.')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/[*_~#]/g, '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/[-–—]{2,}/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 3000);

      if (!cleanText) {
        resolve(false);
        return;
      }

      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        utterance.lang = 'en-US';

        const voices = window.speechSynthesis.getVoices?.() || [];
        const preferred = voices.find(
          (v) =>
            v.lang.startsWith('en') &&
            (v.name.includes('Natural') ||
              v.name.includes('Siri') ||
              v.name.includes('Google') ||
              v.name.includes('Samantha') ||
              v.name.includes('Karen'))
        ) || voices.find((v) => v.lang.startsWith('en'));

        if (preferred) utterance.voice = preferred;

        utterance.onstart = () => {
          isAssistantSpeakingRef.current = true;
          updateVoiceState('speaking');
        };

        utterance.onend = () => {
          isAssistantSpeakingRef.current = false;
          resolve(true);
        };

        utterance.onerror = (e) => {
          console.warn('[Voice Mode] Device speech synthesis error:', e);
          isAssistantSpeakingRef.current = false;
          resolve(false);
        };

        window.speechSynthesis.speak(utterance);
      } catch (err) {
        console.warn('[Voice Mode] Native speech synthesis failed to execute:', err);
        resolve(false);
      }
    });
  };

  // SpeechRecognition Starter with mobile compatibility (iOS Safari & Android Chrome)
  const startListening = () => {
    if (isShuttingDownRef.current || isMutedRef.current) return;
    if (isAssistantSpeakingRef.current || voiceStateRef.current === 'speaking') return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error('Voice recognition is not supported in this browser. Please use Chrome, Safari, or Edge.');
      updateVoiceState('idle');
      return;
    }

    // Abort existing instance
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch (e) {}
      recognitionRef.current = null;
    }

    try {
      const recognition = new SpeechRecognition();
      // On mobile devices (iOS Safari and Android), continuous = true causes silent stalls or immediate crashes.
      // Setting continuous = false on mobile delivers solid, reliable single-utterance recognition,
      // with onend handling seamless auto-restart.
      recognition.continuous = !isMobile;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        isListeningRef.current = true;
        setIsMicActive(true);
        if (voiceStateRef.current !== 'speaking' && voiceStateRef.current !== 'processing') {
          updateVoiceState('listening');
        }
      };

      recognition.onresult = (event) => {
        if (isShuttingDownRef.current) {
          return;
        }

        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = 0; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript + ' ';
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }

        const currentText = (finalTranscript + interimTranscript).trim();
        if (!currentText) return;

        // Anti-Self-Echo & Duplicate Transcription Filter
        if (isSelfEchoOrDuplicate(currentText, recentAssistantTextsRef.current, lastSubmittedUserSpeechRef.current)) {
          return;
        }

        // Barge-in (Interruption): If assistant is speaking or processing, immediately halt generation,
        // flush the client-side audio player, and switch to listening!
        if (voiceStateRef.current === 'speaking' || isAssistantSpeakingRef.current || voiceStateRef.current === 'processing') {
          console.log('[Voice Mode] Speech detected during assistant turn, interrupting.');
          handleInterrupt();
        }

        setTranscript(currentText);

        if (silenceTimeoutRef.current) {
          clearTimeout(silenceTimeoutRef.current);
          silenceTimeoutRef.current = null;
        }

        const clean = currentText.toLowerCase().trim();
        if (['bye', 'goodbye', 'bye bye', 'exit', 'close voice'].includes(clean)) {
          handleExitVoiceMode();
          return;
        }

        // Adaptive Turn Detection / Semantic VAD:
        // Eagerness "low" behavior: trailing hesitation or incomplete conjunctions get 1800ms
        // Base silence timeout raised from 700ms to 950ms to prevent premature cutoffs
        const words = currentText.trim().split(/\s+/);
        const hasTrailingHesitation = /\b(umm*|uhh*|err*|er|ah|and|or|but|so|because|like|with|to|if|when|that|which|then|also|is|are|was|were)\s*$/i.test(currentText);

        let silenceDuration = 950;
        if (hasTrailingHesitation) {
          silenceDuration = 1800; // Wait longer for trailed-off "umm...", "and...", "so..."
        } else if (words.length <= 2) {
          silenceDuration = 1200; // Wait for user to formulate next words
        } else if (/[.?!]$/.test(currentText)) {
          silenceDuration = 850; // Completed sentence with terminal punctuation
        }

        silenceTimeoutRef.current = setTimeout(() => {
          if (
            voiceStateRef.current === 'listening' &&
            !isShuttingDownRef.current &&
            !isAssistantSpeakingRef.current
          ) {
            silenceTimeoutRef.current = null;
            handleUserSubmit(currentText);
          }
        }, silenceDuration);
      };

      recognition.onerror = (event) => {
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          toast.error('Microphone access needed. Please allow microphone in browser or phone settings.');
          setIsMuted(true);
          isMutedRef.current = true;
          updateVoiceState('muted');
          stopListening();
        } else if (event.error === 'no-speech') {
          // Normal silence, keep listening or allow onend to restart
        } else if (event.error === 'network' || event.error === 'audio-capture') {
          console.warn('[Voice Mode] Non-fatal recognition status:', event.error);
        }
      };

      recognition.onend = () => {
        isListeningRef.current = false;
        setIsMicActive(false);

        // Auto-restart if we should still be listening
        if (
          isMountedRef.current &&
          !isShuttingDownRef.current &&
          !isMutedRef.current &&
          !isAssistantSpeakingRef.current &&
          voiceStateRef.current === 'listening'
        ) {
          const restartDelay = isMobile ? 250 : 150;
          setTimeout(() => {
            if (
              isMountedRef.current &&
              !isShuttingDownRef.current &&
              !isMutedRef.current &&
              !isAssistantSpeakingRef.current &&
              voiceStateRef.current === 'listening'
            ) {
              startListening();
            }
          }, restartDelay);
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.warn('Speech recognition start failed:', err);
    }
  };

  const stopListening = () => {
    isListeningRef.current = false;
    setIsMicActive(false);
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch (e) {}
      recognitionRef.current = null;
    }
  };

  // Submit user speech, stream response, and speak
  const handleUserSubmit = async (spokenText) => {
    if (
      isShuttingDownRef.current ||
      !spokenText.trim() ||
      isAssistantSpeakingRef.current ||
      voiceStateRef.current === 'speaking'
    ) {
      return;
    }

    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }

    if (isSelfEchoOrDuplicate(spokenText, recentAssistantTextsRef.current, lastSubmittedUserSpeechRef.current)) {
      console.warn('[Voice Mode] Dropped self-echo submission:', spokenText);
      setTranscript('');
      return;
    }

    lastSubmittedUserSpeechRef.current = spokenText;
    lastSubmittedTimeRef.current = Date.now();

    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch (e) {}
      recognitionRef.current = null;
    }
    isListeningRef.current = false;
    setIsMicActive(false);

    updateVoiceState('processing');
    setTranscript('');

    try {
      let accumulatedResponse = '';

      await onSendMessage(spokenText, (chunkText, fullText, isDone) => {
        if (isShuttingDownRef.current) return;

        if (fullText) {
          accumulatedResponse = fullText;
          setCurrentAssistantSpeech(fullText);
        }

        if (isDone && accumulatedResponse) {
          recentAssistantTextsRef.current.unshift(accumulatedResponse);
          if (recentAssistantTextsRef.current.length > 6) {
            recentAssistantTextsRef.current.pop();
          }

          if (voiceStateRef.current === 'processing' || voiceStateRef.current === 'speaking') {
            playGeminiResponse(accumulatedResponse);
          }
        }
      });
    } catch (err) {
      console.error('Error submitting voice message:', err);
      isAssistantSpeakingRef.current = false;
      updateVoiceState('listening');
      startListening();
    }
  };

  // Synthesize and play audio with Gemini Neural Audio, with automatic fallback to Device TTS
  const playGeminiResponse = async (text) => {
    if (isShuttingDownRef.current || !text) {
      isAssistantSpeakingRef.current = false;
      updateVoiceState('listening');
      startListening();
      return;
    }

    stopListening();
    isAssistantSpeakingRef.current = true;
    updateVoiceState('speaking');

    let playedViaGemini = false;

    try {
      unlockAudioContextAndSpeech();

      const blobUrl = await synthesizeGeminiVoice(text, {
        voice: selectedVoice,
        apiKey
      });

      if (isShuttingDownRef.current || voiceStateRef.current !== 'speaking') {
        isAssistantSpeakingRef.current = false;
        return;
      }

      const audio = ttsAudioRef.current || new Audio();
      activeAudioRef.current = audio;
      audio.src = blobUrl;

      await new Promise((resolve, reject) => {
        audio.onended = () => {
          activeAudioRef.current = null;
          resolve();
        };
        audio.onerror = (e) => {
          activeAudioRef.current = null;
          reject(e);
        };
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.catch(reject);
        }
      });

      playedViaGemini = true;
    } catch (geminiErr) {
      console.warn('[Voice Mode] Gemini Neural TTS unavailable or blocked on mobile, falling back to device speech synthesis:', geminiErr);
    }

    // Fallback: If Gemini Neural Voice failed (quota limit, network error) or mobile autoplay blocked it,
    // and the user has NOT interrupted, speak seamlessly using device native speech synthesis!
    if (
      !playedViaGemini &&
      isMountedRef.current &&
      !isShuttingDownRef.current &&
      voiceStateRef.current === 'speaking' &&
      isAssistantSpeakingRef.current
    ) {
      try {
        await speakWithDeviceSynthesis(text);
      } catch (deviceErr) {
        console.warn('[Voice Mode] Device speech fallback failed:', deviceErr);
      }
    }

    activeAudioRef.current = null;
    isAssistantSpeakingRef.current = false;

    if (isMountedRef.current && !isShuttingDownRef.current && voiceStateRef.current === 'speaking') {
      setCurrentAssistantSpeech('');
      if (resumeListeningTimerRef.current) {
        clearTimeout(resumeListeningTimerRef.current);
      }
      // Reopening mic acoustic buffer
      resumeListeningTimerRef.current = setTimeout(() => {
        if (isMountedRef.current && !isShuttingDownRef.current && !isMutedRef.current) {
          updateVoiceState('listening');
          startListening();
        }
      }, 350);
    }
  };

  // Component lifecycle: Start listening & audio on mount
  useEffect(() => {
    isMountedRef.current = true;
    isShuttingDownRef.current = false;
    isMutedRef.current = isMuted;

    unlockAudioContextAndSpeech();
    setupTtsAudio();
    setupMicAudio();

    // Start listening
    startListening();

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        handleExitVoiceMode();
      } else if (e.code === 'Space' && (voiceStateRef.current === 'speaking' || voiceStateRef.current === 'processing')) {
        e.preventDefault();
        handleInterrupt();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      isMountedRef.current = false;
      window.removeEventListener('keydown', handleKeyDown);
      killAllVoiceAndMic();
    };
  }, []);

  const handleToggleMute = () => {
    unlockAudioContextAndSpeech();
    if (isMuted) {
      setIsMuted(false);
      isMutedRef.current = false;
      updateVoiceState('listening');
      startListening();
      toast('Microphone unmuted', { icon: '🎙️', duration: 1500 });
    } else {
      setIsMuted(true);
      isMutedRef.current = true;
      updateVoiceState('muted');
      stopListening();
      toast('Microphone muted', { icon: '🔇', duration: 1500 });
    }
  };

  const handleOrbClick = () => {
    unlockAudioContextAndSpeech();
    if (voiceState === 'speaking' || voiceState === 'processing') {
      handleInterrupt();
    } else if (voiceState === 'listening' && transcript.trim()) {
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
        silenceTimeoutRef.current = null;
      }
      handleUserSubmit(transcript);
    } else {
      // Tap to talk user activation on mobile
      startListening();
      toast('Listening... Speak now', { icon: '🎙️', duration: 1500 });
    }
  };

  const handleCopy = (text, index) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
    toast.success('Copied to clipboard', { duration: 1500 });
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0f1012] text-white select-none animate-fade-in overflow-hidden">
      {/* Top Header Bar */}
      <div className="w-full flex items-center justify-between px-4 sm:px-6 py-3.5 border-b border-white/5 bg-[#131314]/80 backdrop-blur-md z-20">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-[#4E80EE] via-[#9B72CF] to-[#E275AA] flex items-center justify-center shadow-md">
            <span className="text-xs font-bold text-white">G</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-sm sm:text-base font-medium tracking-tight text-gray-100">Gabby Voice</span>
            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-gradient-to-r from-blue-500/20 to-purple-500/20 border border-blue-500/30 text-blue-300 font-semibold">3.6 Flash</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* New Chat button */}
          {onNewChat && (
            <button
              onClick={() => {
                handleInterrupt();
                onNewChat();
                toast.success('Started fresh chat');
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition-all text-xs font-medium border border-white/10 cursor-pointer"
              title="Start New Conversation"
            >
              <Plus size={14} />
              <span className="hidden sm:inline">New Chat</span>
            </button>
          )}

          {/* Close button */}
          <button
            onClick={handleExitVoiceMode}
            className="w-10 h-10 min-w-[40px] min-h-[40px] rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors cursor-pointer flex items-center justify-center touch-manipulation"
            title="Exit Voice Mode"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Main Conversation Stream */}
      <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 space-y-4 custom-scrollbar relative">
        <div className="max-w-3xl mx-auto space-y-4 pb-48">
          {messages.map((msg, idx) => (
            <div key={idx} className="space-y-1.5">
              {msg.role === 'user' ? (
                /* User bubble */
                <div className="flex justify-end">
                  <div className="bg-[#282a2c] border border-white/5 text-gray-100 px-4 py-2 rounded-2xl max-w-lg text-xs sm:text-sm leading-relaxed shadow-sm">
                    {msg.content}
                  </div>
                </div>
              ) : (
                /* Assistant message */
                <div className="flex flex-col items-start space-y-1 max-w-2xl">
                  <div className="text-gray-200 text-xs sm:text-sm leading-relaxed pl-1 whitespace-pre-wrap">
                    {msg.content}
                  </div>
                  <div className="flex items-center gap-1 pl-1 pt-0.5 text-gray-500 text-xs">
                    <button
                      onClick={() => handleCopy(msg.content, idx)}
                      className="min-h-[38px] min-w-[38px] p-2 hover:text-gray-300 transition-colors flex items-center justify-center touch-manipulation"
                      title="Copy"
                    >
                      {copiedIndex === idx ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                    </button>
                    <button className="min-h-[38px] min-w-[38px] p-2 hover:text-gray-300 transition-colors flex items-center justify-center touch-manipulation" title="Good response">
                      <ThumbsUp size={14} />
                    </button>
                    <button className="min-h-[38px] min-w-[38px] p-2 hover:text-gray-300 transition-colors flex items-center justify-center touch-manipulation" title="Bad response">
                      <ThumbsDown size={14} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Live User Transcript Preview */}
          {transcript && (
            <div className="flex justify-end animate-fade-in">
              <div className="bg-[#4E80EE]/20 border border-[#70CFFF]/40 text-[#70CFFF] px-3.5 py-2 rounded-2xl max-w-lg text-xs sm:text-sm leading-relaxed shadow-sm flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#70CFFF] animate-pulse" />
                <span>{transcript}</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Floating Bottom Section: Living Voice Orb */}
      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-[#0f1012] via-[#0f1012]/95 to-transparent pt-8 pb-5 px-4 flex flex-col items-center pointer-events-none">
        <div className="pointer-events-auto relative flex flex-col items-center justify-center mb-3">
          {/* Living Voice Orb */}
          <button
            type="button"
            ref={orbRef}
            onClick={handleOrbClick}
            className="voice-orb-container cursor-pointer select-none border-none bg-transparent p-0 flex items-center justify-center focus:outline-none touch-manipulation"
            title="Tap orb to talk or interrupt"
            aria-label="Tap orb to talk or interrupt"
          >
            <div className="voice-orb" />
          </button>

          {/* Live Status Hint for Mobile & Desktop */}
          <div className="mt-2 text-center select-none">
            {voiceState === 'speaking' ? (
              <span className="text-xs font-medium text-[#E275AA] animate-pulse">
                Gabby is speaking • Tap to interrupt
              </span>
            ) : voiceState === 'processing' ? (
              <span className="text-xs font-medium text-purple-300 animate-pulse">
                Thinking...
              </span>
            ) : voiceState === 'muted' ? (
              <span className="text-xs font-medium text-rose-400">
                Microphone muted • Tap mic below to speak
              </span>
            ) : (
              <span className="text-xs font-medium text-[#70CFFF]">
                {transcript ? 'Listening...' : isMobile ? 'Listening • Tap orb to speak' : 'Listening... speak anytime'}
              </span>
            )}
          </div>
        </div>

        {/* Bottom Control Bar */}
        <div className="pointer-events-auto w-full max-w-md flex items-center justify-between px-4">
          {/* Switch to text */}
          <button
            onClick={() => {
              handleExitVoiceMode();
              if (onType) onType();
            }}
            className="min-h-[40px] px-4 py-2 rounded-full bg-white/10 hover:bg-white/15 text-gray-200 hover:text-white transition-all text-xs font-medium flex items-center gap-1.5 border border-white/10 cursor-pointer touch-manipulation"
            title="Switch to typing"
          >
            <span>+</span>
            <span>Type</span>
          </button>

          {/* Action pill: Voice Name badge, Mute, and Close */}
          <div className="flex items-center gap-1.5 bg-[#1e1f20]/90 backdrop-blur-lg border border-white/10 px-2 py-1 rounded-full">
            <div className="px-2.5 py-1 rounded-full text-xs font-medium text-[#70CFFF] flex items-center gap-1">
              <Volume2 size={13} />
              <span className="text-[11px]">Gemini 3.6 • {selectedVoice}</span>
            </div>

            <button
              onClick={handleToggleMute}
              className={`w-10 h-10 min-w-[40px] min-h-[40px] rounded-full transition-colors cursor-pointer flex items-center justify-center touch-manipulation ${
                isMuted
                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/25'
                  : 'hover:bg-white/10 text-gray-300 hover:text-white'
              }`}
              title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
            >
              {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
            </button>

            <button
              onClick={handleExitVoiceMode}
              className="w-10 h-10 min-w-[40px] min-h-[40px] rounded-full hover:bg-rose-500/20 text-gray-400 hover:text-rose-300 transition-colors cursor-pointer flex items-center justify-center touch-manipulation"
              title="Close Voice Mode"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
