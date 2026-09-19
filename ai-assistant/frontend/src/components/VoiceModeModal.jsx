import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, X, Square, Zap, ThumbsUp, ThumbsDown, Copy, Check, Plus, Volume2, Globe, Brain, ExternalLink } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { TableBlock, CodeBlock, GeminiSparkle } from './MarkdownBlocks.jsx';
import toast from 'react-hot-toast';
import { synthesizeGeminiVoice, stopGeminiVoice, GEMINI_VOICES, DEFAULT_GEMINI_VOICE } from '../utils/geminiVoice.js';

// Anti-Self-Echo & Duplicate Filter: Prevents assistant from transcribing or replying to its own speaker output
function isSelfEchoOrDuplicate(text, recentAssistantSpeeches = [], lastUserText = '', isSpeaking = false) {
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

  // 2. ONLY filter echo of assistant utterances IF the assistant is actually speaking or just finished
  if (!isSpeaking) {
    // When assistant is silent, user is speaking freely. Never block user follow-ups!
    return false;
  }

  // Assistant IS speaking: check if mic is transcribing speaker audio
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
    if (userWords.length >= 2 && matchCount / userWords.length >= 0.8) {
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
  selectedVoice = DEFAULT_GEMINI_VOICE
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
  const assistantSpeechStartTimeRef = useRef(0);

  // Fresh props and callbacks refs to eliminate stale closure traps across turns
  const onSendMessageRef = useRef(onSendMessage);
  onSendMessageRef.current = onSendMessage;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const handleUserSubmitRef = useRef(null);

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
        window.speechSynthesis.resume();
        const silent = new SpeechSynthesisUtterance('');
        silent.volume = 0;
        window.speechSynthesis.speak(silent);
      }
      if (!ttsAudioRef.current) {
        const audio = new Audio();
        ttsAudioRef.current = audio;
      }
      // Play 1-sample silent wave to truly unlock HTMLMediaElement autoplay on user click
      const silentAudio = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA');
      silentAudio.volume = 0.01;
      silentAudio.play().then(() => silentAudio.pause()).catch(() => {});
    } catch (e) {}
  };

  const setupTtsAudio = () => {
    if (!ttsAudioRef.current) {
      const audio = new Audio();
      ttsAudioRef.current = audio;
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
        // Natural fluid speech pulse animation for the central orb
        target = 0.45 + 0.35 * Math.sin(timestamp * 0.007) * Math.cos(timestamp * 0.003);
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
    assistantSpeechStartTimeRef.current = 0;
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
        window.speechSynthesis.resume();
        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;
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
        if (isSelfEchoOrDuplicate(currentText, recentAssistantTextsRef.current, lastSubmittedUserSpeechRef.current, isAssistantSpeakingRef.current || voiceStateRef.current === 'speaking')) {
          return;
        }

        // Barge-in (Interruption): If assistant is speaking or processing, immediately halt generation,
        // flush the client-side audio player, and switch to listening!
        if (voiceStateRef.current === 'speaking' || isAssistantSpeakingRef.current || voiceStateRef.current === 'processing') {
          // Grace period: do not allow barge-in during the first 1.5 seconds of assistant speech to prevent audio echo cutoff
          if (isAssistantSpeakingRef.current && Date.now() - assistantSpeechStartTimeRef.current < 1500) {
            return;
          }
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
            if (handleUserSubmitRef.current) {
              handleUserSubmitRef.current(currentText);
            } else {
              handleUserSubmit(currentText);
            }
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

    if (isSelfEchoOrDuplicate(spokenText, recentAssistantTextsRef.current, lastSubmittedUserSpeechRef.current, isAssistantSpeakingRef.current || voiceStateRef.current === 'speaking')) {
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

      const sendFn = onSendMessageRef.current || onSendMessage;
      await sendFn(spokenText, (chunkText, fullText, isDone) => {
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
  handleUserSubmitRef.current = handleUserSubmit;

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
    assistantSpeechStartTimeRef.current = Date.now();
    updateVoiceState('speaking');

    let playedViaGemini = false;

    try {
      unlockAudioContextAndSpeech();

      const blobUrl = await synthesizeGeminiVoice(text, {
        voice: selectedVoice
      });

      if (isShuttingDownRef.current || voiceStateRef.current !== 'speaking') {
        isAssistantSpeakingRef.current = false;
        return;
      }

      const audio = ttsAudioRef.current || new Audio();
      activeAudioRef.current = audio;
      audio.src = blobUrl;
      audio.volume = 1.0;

      await new Promise((resolve, reject) => {
        let startedAt = 0;
        audio.onplay = () => {
          startedAt = Date.now();
        };
        audio.onended = () => {
          activeAudioRef.current = null;
          // If ended suspiciously fast (<150ms), treat as failure to trigger device fallback
          if (startedAt && Date.now() - startedAt < 150) {
            reject(new Error('Audio ended prematurely'));
          } else {
            resolve();
          }
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
      console.warn('[Voice Mode] Gemini Neural TTS unavailable or blocked, falling back to device speech synthesis:', geminiErr);
    }

    // Fallback: If Gemini Neural Voice failed or audio was blocked, speak seamlessly using device native speech synthesis!
    if (
      !playedViaGemini &&
      isMountedRef.current &&
      !isShuttingDownRef.current &&
      voiceStateRef.current === 'speaking'
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
      // Reopening mic acoustic buffer after speaker reverb decays
      resumeListeningTimerRef.current = setTimeout(() => {
        if (isMountedRef.current && !isShuttingDownRef.current && !isMutedRef.current) {
          updateVoiceState('listening');
          startListening();
        }
      }, 700);
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
      <div className="w-full flex items-center justify-between px-3 sm:px-6 py-2.5 sm:py-3.5 border-b border-white/5 bg-[#131314]/80 backdrop-blur-md z-20">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-[#4E80EE] via-[#9B72CF] to-[#E275AA] flex items-center justify-center shadow-md">
            <span className="text-xs font-bold text-white">G</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[var(--text-body)] sm:text-base font-medium tracking-tight text-gray-100">Gabby Voice</span>
            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-gradient-to-r from-blue-500/20 to-purple-500/20 border border-blue-500/30 text-blue-300 font-semibold">2.5 Flash</span>
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          {/* New Chat button */}
          {onNewChat && (
            <button
              onClick={() => {
                handleInterrupt();
                onNewChat();
                toast.success('Started fresh chat');
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 min-h-[var(--tap-target)] rounded-full bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition-all text-[var(--text-xs)] font-medium border border-white/10 cursor-pointer touch-manipulation"
              title="Start New Conversation"
            >
              <Plus className="icon-sm" />
              <span className="hidden sm:inline">New Chat</span>
            </button>
          )}

          {/* Close button */}
          <button
            onClick={handleExitVoiceMode}
            className="tap-target rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors cursor-pointer touch-manipulation"
            title="Exit Voice Mode"
          >
            <X className="icon-md" />
          </button>
        </div>
      </div>

      {/* Main Conversation Stream - Matches Text Mode Turn-by-Turn Bubble Layout */}
      <div className="flex-1 overflow-y-auto px-3 sm:px-6 md:px-8 py-4 sm:py-6 space-y-4 custom-scrollbar relative">
        <div className="max-w-3xl mx-auto space-y-4 sm:space-y-6 pb-48">
          {messages.map((msg, idx) => (
            <div key={idx} className="w-full mb-3 sm:mb-5 transition-all">
              {msg.role === 'user' ? (
                /* User bubble (aligned right) */
                <div className="flex justify-end">
                  <div className="max-w-[88%] sm:max-w-[78%] flex flex-col items-end group/user">
                    {msg.image && (
                      <div className="mb-2 max-w-sm rounded-2xl overflow-hidden border border-white/10 shadow-lg bg-black/40">
                        <img
                          src={msg.image}
                          alt="User attachment"
                          className="max-h-64 w-auto object-contain rounded-2xl"
                        />
                      </div>
                    )}
                    <div className="inline-block text-[11px] sm:text-[13px] md:text-[14px] leading-snug sm:leading-relaxed bg-[#282a2c] text-[#e3e3e3] rounded-2xl rounded-tr-sm px-3.5 py-2 sm:px-4 sm:py-2.5 border border-white/5 shadow-sm text-left">
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    </div>
                    <div className="opacity-90 sm:opacity-0 sm:group-hover/user:opacity-100 transition-opacity mt-1 flex items-center gap-1">
                      <button
                        onClick={() => handleCopy(msg.content, idx)}
                        className="tap-target p-1 text-[var(--text-xs)] text-[#8e918f] hover:text-white rounded-md hover:bg-white/5 transition-colors touch-manipulation cursor-pointer"
                        title="Copy text"
                      >
                        {copiedIndex === idx ? <Check className="icon-sm text-emerald-400" /> : <Copy className="icon-sm" />}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                /* Assistant Message - Full width, flush matching text mode */
                <div className="w-full text-left space-y-1.5">
                  <div className="flex items-center gap-1.5 mb-1 text-xs text-[#8a8a8e]">
                    <GeminiSparkle
                      className="icon-sm shrink-0"
                      animated={!msg.content && idx === messages.length - 1}
                    />
                    <span className="text-[11px] sm:text-xs font-semibold text-[#c4c7c5]">Gabby</span>
                  </div>

                  {/* Search Sources if available */}
                  {msg.searchSources && msg.searchSources.length > 0 && (
                    <div className="mb-2 space-y-1">
                      <div className="flex items-center gap-1 text-[10px] sm:text-xs text-[#8a8a8e]">
                        <Globe className="icon-sm text-[#70CFFF]" />
                        <span className="font-medium">Sources ({msg.searchSources.length})</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {msg.searchSources.map((source, sIdx) => (
                          <a
                            key={sIdx}
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[#1c1c1e] hover:bg-[#282a2c] border border-white/10 text-[9.5px] sm:text-xs text-[#8a8a8e] hover:text-white transition-colors max-w-xs truncate"
                            title={source.snippet || source.title}
                          >
                            <span className="w-3.5 h-3.5 rounded-full bg-white/10 flex items-center justify-center text-[9px] font-mono shrink-0">
                              {sIdx + 1}
                            </span>
                            <span className="truncate">{source.title || source.url}</span>
                            <ExternalLink size={9} className="shrink-0 opacity-60" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Thinking block if any */}
                  {msg.isThinking && (
                    <div className="mb-2 rounded-xl bg-[#1c1c1e]/60 border border-white/10 p-2 sm:p-2.5 text-[10px] sm:text-xs">
                      <div className="flex items-center gap-1.5 font-medium text-[#c4c7c5] mb-1 text-[10px] sm:text-xs">
                        <Brain className="icon-sm text-[#9B72CF] animate-pulse" />
                        <span>Thinking...</span>
                      </div>
                      {msg.reasoning && (
                        <div className="border-l-2 border-white/20 pl-2.5 py-0.5 font-mono text-[10px] sm:text-[11.5px] leading-relaxed whitespace-pre-wrap text-[#8a8a8e]">
                          {msg.reasoning}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Prose Content */}
                  <div className="prose-chat text-[#e8e8e8] leading-relaxed w-full">
                    {msg.content ? (
                      <>
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            table: ({ children }) => <TableBlock>{children}</TableBlock>,
                            pre: ({ children }) => <>{children}</>,
                            code({ node, inline, className, children, ...props }) {
                              return !inline ? (
                                <CodeBlock className={className} {...props}>
                                  {children}
                                </CodeBlock>
                              ) : (
                                <code className="bg-[#282a2c] px-1.5 py-0.5 rounded-md text-xs sm:text-sm font-mono text-[#70CFFF]" {...props}>
                                  {children}
                                </code>
                              );
                            }
                          }}
                        >
                          {msg.content}
                        </ReactMarkdown>
                        {idx === messages.length - 1 && (voiceState === 'processing' || msg.isInProgress) && (
                          <span className="streaming-cursor" title="Streaming..." />
                        )}
                      </>
                    ) : (
                      <div className="inline-flex items-center gap-2 text-xs text-[#8a8a8e] py-1">
                        <span className="w-2 h-2 rounded-full bg-[#9B72CF] animate-pulse" />
                        <span>Thinking...</span>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  {msg.content && (
                    <div className="flex items-center gap-1 sm:gap-1.5 pt-1.5 sm:pt-2 opacity-95 transition-opacity">
                      <button
                        onClick={() => handleCopy(msg.content, idx)}
                        className="tap-target p-2 hover:text-gray-300 transition-colors text-gray-500 hover:text-white cursor-pointer"
                        title="Copy"
                      >
                        {copiedIndex === idx ? <Check className="icon-sm text-emerald-400" /> : <Copy className="icon-sm" />}
                      </button>
                      <button className="tap-target p-2 hover:text-gray-300 transition-colors text-gray-500 hover:text-white cursor-pointer" title="Good response">
                        <ThumbsUp className="icon-sm" />
                      </button>
                      <button className="tap-target p-2 hover:text-gray-300 transition-colors text-gray-500 hover:text-white cursor-pointer" title="Bad response">
                        <ThumbsDown className="icon-sm" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* Live In-Progress User Speech Bubble */}
          {transcript && (
            <div className="w-full mb-3 sm:mb-5 transition-all flex justify-end animate-fade-in">
              <div className="max-w-[88%] sm:max-w-[78%] flex flex-col items-end">
                <div className="inline-block text-[11px] sm:text-[13px] md:text-[14px] leading-snug sm:leading-relaxed bg-[#282a2c] text-[#70CFFF] rounded-2xl rounded-tr-sm px-3.5 py-2 sm:px-4 sm:py-2.5 border border-[#4E80EE]/40 shadow-sm text-left">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#70CFFF] animate-pulse shrink-0" />
                    <p className="whitespace-pre-wrap">{transcript}</p>
                  </div>
                </div>
                <span className="text-[10px] text-[#70CFFF]/70 mt-1 mr-1">Listening...</span>
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
            className={`voice-orb-container state-${voiceState} cursor-pointer select-none border-none bg-transparent p-0 flex items-center justify-center focus:outline-none touch-manipulation`}
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
            ) : voiceState === 'idle' ? (
              <span className="text-xs font-medium text-slate-400">
                Ready • Tap orb to speak
              </span>
            ) : (
              <span className="text-xs font-medium text-[#70CFFF]">
                {transcript ? 'Listening...' : isMobile ? 'Listening • Tap orb to speak' : 'Listening... speak anytime'}
              </span>
            )}
          </div>
        </div>

        {/* Bottom Control Bar */}
        <div className="pointer-events-auto w-full max-w-md flex items-center justify-between px-3 sm:px-4">
          {/* Switch to text */}
          <button
            onClick={() => {
              handleExitVoiceMode();
              if (onType) onType();
            }}
            className="tap-target px-4 py-2 rounded-full bg-white/10 hover:bg-white/15 text-gray-200 hover:text-white transition-all text-[var(--text-xs)] font-medium flex items-center gap-1.5 border border-white/10 cursor-pointer touch-manipulation"
            title="Switch to typing"
          >
            <Plus className="icon-sm" />
            <span>Type</span>
          </button>

          {/* Action pill: Voice Name badge, Mute, and Close */}
          <div className="flex items-center gap-1 sm:gap-1.5 bg-[#1e1f20]/90 backdrop-blur-lg border border-white/10 px-2 py-1 rounded-full">
            <div className="px-2.5 py-1 rounded-full text-xs font-medium text-[#70CFFF] flex items-center gap-1">
              <Volume2 className="icon-sm" />
              <span className="text-[11px]">Gemini 2.5 • {selectedVoice}</span>
            </div>

            <button
              onClick={handleToggleMute}
              className={`tap-target rounded-full transition-colors cursor-pointer touch-manipulation ${
                isMuted
                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/25'
                  : 'hover:bg-white/10 text-gray-300 hover:text-white'
              }`}
              title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
            >
              {isMuted ? <MicOff className="icon-md" /> : <Mic className="icon-md" />}
            </button>

            <button
              onClick={handleExitVoiceMode}
              className="tap-target rounded-full hover:bg-rose-500/20 text-gray-400 hover:text-rose-300 transition-colors cursor-pointer touch-manipulation"
              title="Close Voice Mode"
            >
              <X className="icon-md" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}