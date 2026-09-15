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
    // Direct substring check
    if (cleanSpeech.includes(clean)) {
      return true;
    }
    // Word overlap check (handles slightly altered STT transcripts of speaker audio)
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

  const setupTtsAudio = () => {
    if (!ttsAudioRef.current) {
      const audio = new Audio();
      audio.crossOrigin = 'anonymous';
      ttsAudioRef.current = audio;
    }

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
    if (micStreamRef.current || !navigator.mediaDevices?.getUserMedia) return;
    try {
      initAudioContext();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: { ideal: true },
          noiseSuppression: { ideal: true },
          autoGainControl: { ideal: true },
          channelCount: 1,
          sampleRate: 48000,
          googEchoCancellation: { ideal: true },
          googAutoGainControl: { ideal: true },
          googNoiseSuppression: { ideal: true },
          googHighpassFilter: { ideal: true },
          googTypingNoiseDetection: { ideal: true }
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
      console.warn('[Voice Mode] Mic stream audio analysis unavailable:', err.message);
    }
  };

  // Real-time 60fps audio amplitude loop updating CSS custom property --level
  useEffect(() => {
    let isCancelled = false;

    const loop = () => {
      if (isCancelled) return;

      let target = 0;
      const state = voiceStateRef.current;

      if (state === 'speaking' && ttsAnalyserRef.current) {
        const buffer = new Uint8Array(ttsAnalyserRef.current.frequencyBinCount);
        ttsAnalyserRef.current.getByteFrequencyData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) sum += buffer[i];
        const avg = sum / buffer.length;
        target = Math.min(1, Math.max(0, (avg - 10) / 55));

        // Simple barge-in: If user starts talking into the microphone while assistant is speaking
        if (micAnalyserRef.current && !isMutedRef.current && !isShuttingDownRef.current) {
          const micBuffer = new Uint8Array(micAnalyserRef.current.frequencyBinCount);
          micAnalyserRef.current.getByteFrequencyData(micBuffer);
          let micSum = 0;
          for (let i = 0; i < micBuffer.length; i++) micSum += micBuffer[i];
          const micAvg = micSum / micBuffer.length;
          // Hardware AEC subtracts speaker output; user talking into mic triggers micAvg > 35
          if (micAvg > 35) {
            handleInterrupt();
            return;
          }
        }
      } else if ((state === 'listening' || state === 'processing') && !isMutedRef.current && micAnalyserRef.current) {
        const buffer = new Uint8Array(micAnalyserRef.current.frequencyBinCount);
        micAnalyserRef.current.getByteFrequencyData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) sum += buffer[i];
        const avg = sum / buffer.length;
        target = Math.min(1, Math.max(0, (avg - 8) / 50));
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
  }, []);

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
        ttsAudioRef.current.src = '';
      } catch (e) {}
    }
    if (activeAudioRef.current && activeAudioRef.current !== ttsAudioRef.current) {
      try {
        activeAudioRef.current.pause();
        activeAudioRef.current.src = '';
      } catch (e) {}
    }
    activeAudioRef.current = null;
    stopGeminiVoice();

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

  // True interruption: instantly halt audio playback and resume listening
  const handleInterrupt = () => {
    if (resumeListeningTimerRef.current) {
      clearTimeout(resumeListeningTimerRef.current);
      resumeListeningTimerRef.current = null;
    }
    isAssistantSpeakingRef.current = false;

    if (ttsAudioRef.current) {
      try {
        ttsAudioRef.current.pause();
        ttsAudioRef.current.src = '';
      } catch (e) {}
    }
    if (activeAudioRef.current && activeAudioRef.current !== ttsAudioRef.current) {
      try {
        activeAudioRef.current.pause();
        activeAudioRef.current.src = '';
      } catch (e) {}
    }
    activeAudioRef.current = null;
    stopGeminiVoice();

    if (onAbort) onAbort();

    setTranscript('');
    setCurrentAssistantSpeech('');
    updateVoiceState('listening');

    if (!isMutedRef.current && !isShuttingDownRef.current) {
      startListening();
    }
  };

  // Robust SpeechRecognition Starter with zero self-listening protection
  const startListening = () => {
    if (isShuttingDownRef.current || isMutedRef.current) return;
    // Primary Rule: Suspend speech recognition when assistant is speaking
    if (isAssistantSpeakingRef.current || voiceStateRef.current === 'speaking') return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error('Microphone voice recognition is not supported in this browser. Please use Chrome, Edge, or Safari.');
      updateVoiceState('idle');
      return;
    }

    // Abort existing instance if any
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch (e) {}
      recognitionRef.current = null;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
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
        if (
          isShuttingDownRef.current ||
          isAssistantSpeakingRef.current ||
          voiceStateRef.current === 'speaking'
        ) {
          // Never process TTS audio or speaker feedback
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

        // Anti-Self-Echo & Duplicate Transcription Filter:
        // Ignore any speech that matches or contains recent assistant speech or duplicate submissions
        if (isSelfEchoOrDuplicate(currentText, recentAssistantTextsRef.current, lastSubmittedUserSpeechRef.current)) {
          console.warn('[Voice Mode] Ignored self-echo or duplicate transcript:', currentText);
          return;
        }

        // Barge-in during processing (user changes mind while model is thinking)
        if (voiceStateRef.current === 'processing') {
          if (onAbort) onAbort();
          setCurrentAssistantSpeech('');
          updateVoiceState('listening');
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

        // Silence detection: submit speech after 750ms of quiet
        silenceTimeoutRef.current = setTimeout(() => {
          if (
            voiceStateRef.current === 'listening' &&
            !isShuttingDownRef.current &&
            !isAssistantSpeakingRef.current
          ) {
            silenceTimeoutRef.current = null;
            handleUserSubmit(currentText);
          }
        }, 750);
      };

      recognition.onerror = (event) => {
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          toast.error('Microphone permission required. Please allow mic access in browser.');
          setIsMuted(true);
          isMutedRef.current = true;
          updateVoiceState('muted');
          stopListening();
        } else if (event.error === 'no-speech') {
          // Normal silence, keep listening
        }
      };

      recognition.onend = () => {
        isListeningRef.current = false;
        setIsMicActive(false);

        // Auto-restart ONLY if in listening state and assistant is not speaking
        if (
          isMountedRef.current &&
          !isShuttingDownRef.current &&
          !isMutedRef.current &&
          !isAssistantSpeakingRef.current &&
          voiceStateRef.current === 'listening'
        ) {
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
          }, 150);
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

  // Submit user speech, stream response, and speak with authentic Gemini Voice
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

    // Reject self-echoes or immediate duplicate loops
    if (isSelfEchoOrDuplicate(spokenText, recentAssistantTextsRef.current, lastSubmittedUserSpeechRef.current)) {
      console.warn('[Voice Mode] Dropped self-echo submission:', spokenText);
      setTranscript('');
      return;
    }

    lastSubmittedUserSpeechRef.current = spokenText;
    lastSubmittedTimeRef.current = Date.now();

    // Reset speech recognition buffer to discard already-submitted audio
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
          // Track recent assistant texts for anti-echo filtering
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

  // Synthesize and play audio with Gemini Neural Audio
  const playGeminiResponse = async (text) => {
    if (isShuttingDownRef.current || !text) {
      isAssistantSpeakingRef.current = false;
      updateVoiceState('listening');
      startListening();
      return;
    }

    // Primary Rule: Suspend speech recognition the moment speaking begins
    stopListening();
    isAssistantSpeakingRef.current = true;
    updateVoiceState('speaking');

    try {
      initAudioContext();
      setupTtsAudio();

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

      audio.onended = () => {
        activeAudioRef.current = null;
        isAssistantSpeakingRef.current = false;
        if (isMountedRef.current && !isShuttingDownRef.current) {
          setCurrentAssistantSpeech('');
          if (resumeListeningTimerRef.current) {
            clearTimeout(resumeListeningTimerRef.current);
          }
          // Acoustic decay buffer (300ms) to ensure speaker reverberation dissipates before reopening mic
          resumeListeningTimerRef.current = setTimeout(() => {
            if (isMountedRef.current && !isShuttingDownRef.current && !isMutedRef.current) {
              updateVoiceState('listening');
              startListening();
            }
          }, 300);
        }
      };

      audio.onerror = (e) => {
        console.warn('[Voice Mode] Audio playback error, returning to listen:', e);
        activeAudioRef.current = null;
        isAssistantSpeakingRef.current = false;
        updateVoiceState('listening');
        if (!isMutedRef.current) {
          startListening();
        }
      };

      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume().catch(() => {});
      }

      await audio.play();
    } catch (synthErr) {
      console.warn('[Voice Mode] Gemini voice synthesis failed, returning to listening:', synthErr);
      activeAudioRef.current = null;
      isAssistantSpeakingRef.current = false;
      updateVoiceState('listening');
      if (!isMutedRef.current) {
        startListening();
      }
    }
  };

  // Component lifecycle: Start listening & audio on mount
  useEffect(() => {
    isMountedRef.current = true;
    isShuttingDownRef.current = false;
    isMutedRef.current = isMuted;

    initAudioContext();
    setupTtsAudio();
    setupMicAudio();

    // Small delay to ensure modal transition has completed
    const initTimer = setTimeout(() => {
      startListening();
    }, 250);

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
      clearTimeout(initTimer);
      window.removeEventListener('keydown', handleKeyDown);
      killAllVoiceAndMic();
    };
  }, []);

  const handleToggleMute = () => {
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
    if (voiceState === 'speaking' || voiceState === 'processing') {
      handleInterrupt();
    } else if (voiceState === 'listening' && transcript.trim()) {
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
        silenceTimeoutRef.current = null;
      }
      handleUserSubmit(transcript);
    } else {
      // Tap to talk user activation
      startListening();
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
          <span className="text-sm sm:text-base font-medium tracking-tight text-gray-100">Gabby Voice</span>
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

      {/* Main Conversation Stream - Clean, minimal, blank when new, preserved when continuing */}
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

      {/* Floating Bottom Section: Living Voice Orb (pure animation, no center square, no status labels) */}
      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-[#0f1012] via-[#0f1012]/95 to-transparent pt-8 pb-5 px-4 flex flex-col items-center pointer-events-none">
        <div className="pointer-events-auto relative flex flex-col items-center justify-center mb-4">
          {/* Living ChatGPT Voice Orb */}
          <button
            type="button"
            ref={orbRef}
            onClick={handleOrbClick}
            className="voice-orb-container cursor-pointer select-none border-none bg-transparent p-0 flex items-center justify-center focus:outline-none touch-manipulation"
            title="Tap and talk"
            aria-label="Tap and talk"
          >
            {/* Soft glowing fluid voice orb */}
            <div className="voice-orb" />
          </button>
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
              <span className="text-[11px]">{selectedVoice}</span>
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
