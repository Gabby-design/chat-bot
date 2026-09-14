import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, X, Square, Zap, Globe, ThumbsUp, ThumbsDown, Copy, Check, MessageSquare, Plus } from 'lucide-react';
import toast from 'react-hot-toast';

// High-quality Natural/Neural Voice Selector
// Prioritizes natural, human-sounding English voices (Edge Natural, Chrome Google US, etc.)
const getNaturalVoice = () => {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices() || [];
  if (voices.length === 0) return null;

  // 1. Prioritize Microsoft Edge Natural voices & Google US English
  const priorityVoices = [
    'natural', 'jenny', 'aria', 'guy', 'christopher', 'ava',
    'google us english', 'samantha', 'victoria'
  ];

  for (const name of priorityVoices) {
    const found = voices.find((v) =>
      v.lang.startsWith('en') && v.name.toLowerCase().includes(name)
    );
    if (found) return found;
  }

  // 2. Any English voice
  const anyEn = voices.find((v) => v.lang.startsWith('en'));
  return anyEn || voices[0];
};

// Strips markdown symbols, code markers, and prepares clean pronounceable English text
const cleanForSpeech = (text) => {
  if (!text) return '';
  return text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[*_~#]/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[-–—]{2,}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

export default function VoiceModeModal({ isOpen, onClose, onSendMessage, onAbort, onNewChat, messages = [], onType }) {
  // Finite State Machine: 'idle' | 'listening' | 'processing' | 'streaming' | 'speaking' | 'muted'
  const [voiceState, setVoiceState] = useState('listening');
  const [isMuted, setIsMuted] = useState(false);
  const [isMicActive, setIsMicActive] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [copiedIndex, setCopiedIndex] = useState(null);

  const recognitionRef = useRef(null);
  const isListeningRef = useRef(false);
  const silenceTimeoutRef = useRef(null);
  const resumeListeningTimeoutRef = useRef(null);
  const restartTimeoutRef = useRef(null);
  const voiceStateRef = useRef('listening');
  const isMountedRef = useRef(true);
  const isShuttingDownRef = useRef(false);
  const selectedVoiceRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Dedicated speech FIFO queue and streaming word buffer
  const speechQueueRef = useRef([]);
  const wordBufferRef = useRef('');
  const isSpeakingRef = useRef(false);
  const isCancelledRef = useRef(false);
  const streamDoneRef = useRef(false);
  const activeUtterancesRef = useRef([]);
  const lastSpokenTextRef = useRef('');
  const speechKeepAliveRef = useRef(null);
  const currentChunkRef = useRef('');

  // Proximity & Background noise gate refs
  const audioStreamRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const audioPollIntervalRef = useRef(null);
  const lastCloseVoiceTimestampRef = useRef(Date.now());
  const lastVoiceActiveTimestampRef = useRef(Date.now());
  const lastSpeechResultTimestampRef = useRef(Date.now());
  const latestTranscriptRef = useRef('');

  const INTERRUPTION_KEYWORDS = [
    'wait', 'stop', 'hold on', 'hang on', 'pause', 'quiet', 'shut up',
    'hush', 'please stop', 'stop talking', 'shh', 'hold up', 'cancel',
    'okay stop', 'stop please', 'wait wait'
  ];

  // Self-Voice Echo Filter: Distinguishes assistant's own voice from user speech
  const isEchoOfAssistant = (text) => {
    if (!text) return false;
    const clean = text.toLowerCase().replace(/[.,!?;:'"“”\-—]/g, ' ').trim();
    if (!clean) return false;

    // Direct keyword check: Interruption keywords are ALWAYS considered real user speech, never an echo
    const hasKeyword = INTERRUPTION_KEYWORDS.some(
      (kw) => clean === kw || clean.startsWith(kw + ' ') || clean.includes(' ' + kw) || clean.endsWith(' ' + kw)
    );
    if (hasKeyword) return false;

    const heardWords = clean.split(/\s+/).filter((w) => w.length > 1);
    if (heardWords.length === 0) return true;

    const currentChunk = (currentChunkRef.current || '').toLowerCase().replace(/[.,!?;:'"“”\-—]/g, ' ');
    const recentAssistantSpeech = (lastSpokenTextRef.current || '').toLowerCase().replace(/[.,!?;:'"“”\-—]/g, ' ');
    const combinedAssistantSpeech = currentChunk + ' ' + recentAssistantSpeech;

    // Substring check for partial leaks of 4+ characters
    if (clean.length > 4 && combinedAssistantSpeech.includes(clean)) {
      return true;
    }

    let matchedWords = 0;
    for (const word of heardWords) {
      if (combinedAssistantSpeech.includes(word)) {
        matchedWords++;
      }
    }

    const echoRatio = matchedWords / heardWords.length;
    return echoRatio >= 0.2;
  };

  const updateVoiceState = (newState) => {
    voiceStateRef.current = newState;
    setVoiceState(newState);
  };

  // Performance timing metrics for latency tracking
  const perfTimingRef = useRef({
    speechEnd: 0,
    requestStart: 0,
    firstToken: 0,
    firstSpeech: 0,
    streamComplete: 0
  });

  // Auto-scroll to bottom of conversation (instant scroll to eliminate layout thrashing during streaming)
  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'auto' });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, transcript, voiceState]);

  // Load natural TTS voices
  useEffect(() => {
    const loadVoice = () => {
      const v = getNaturalVoice();
      if (v) selectedVoiceRef.current = v;
    };
    loadVoice();
    if ('speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = loadVoice;
    }
  }, []);

  // Kill all voice and mic hardware cleanly
  const killAllVoiceAndMic = () => {
    isShuttingDownRef.current = true;
    isCancelledRef.current = true;
    speechQueueRef.current = [];
    wordBufferRef.current = '';
    isSpeakingRef.current = false;
    streamDoneRef.current = false;
    activeUtterancesRef.current = [];
    currentChunkRef.current = '';
    setIsMicActive(false);

    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }

    if (resumeListeningTimeoutRef.current) {
      clearTimeout(resumeListeningTimeoutRef.current);
      resumeListeningTimeoutRef.current = null;
    }

    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }

    if (speechKeepAliveRef.current) {
      clearInterval(speechKeepAliveRef.current);
      speechKeepAliveRef.current = null;
    }

    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch (e) { }
    }

    if (audioPollIntervalRef.current) {
      clearInterval(audioPollIntervalRef.current);
      audioPollIntervalRef.current = null;
    }

    if (audioStreamRef.current) {
      try {
        audioStreamRef.current.getTracks().forEach((track) => track.stop());
      } catch (e) { }
      audioStreamRef.current = null;
    }

    if (audioCtxRef.current) {
      try {
        audioCtxRef.current.close();
      } catch (e) { }
      audioCtxRef.current = null;
    }
    analyserRef.current = null;

    if (recognitionRef.current) {
      const rec = recognitionRef.current;
      recognitionRef.current = null;
      isListeningRef.current = false;
      try {
        rec.onstart = null;
        rec.onresult = null;
        rec.onerror = null;
        rec.onend = null;
        rec.abort();
      } catch (e) { }
    }
  };

  const handleExitVoiceMode = () => {
    killAllVoiceAndMic();
    if (onAbort) onAbort();
    onClose();
  };

  // Keyboard Shortcuts: Esc to stop speaking or exit, Space to stop speaking
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (voiceStateRef.current === 'speaking' || voiceStateRef.current === 'streaming' || voiceStateRef.current === 'processing') {
          handleInterrupt();
        } else {
          handleExitVoiceMode();
        }
      } else if (e.key === ' ' && (voiceStateRef.current === 'speaking' || voiceStateRef.current === 'streaming')) {
        e.preventDefault();
        handleInterrupt();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const stopListening = () => {
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
    if (resumeListeningTimeoutRef.current) {
      clearTimeout(resumeListeningTimeoutRef.current);
      resumeListeningTimeoutRef.current = null;
    }
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }
    if (recognitionRef.current && isListeningRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) { }
    }
    isListeningRef.current = false;
    setIsMicActive(false);
  };

  // Robust SpeechRecognition starter with instance reuse to eliminate audio daemon re-init lag
  const startListening = () => {
    if (isShuttingDownRef.current || isMuted) return;
    // Allow listening in both 'listening' AND 'speaking' (for ChatGPT-style voice barge-in)
    if (voiceStateRef.current !== 'listening' && voiceStateRef.current !== 'speaking') return;
    if (isListeningRef.current) return;

    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }

    // Reuse existing recognition instance if available
    if (recognitionRef.current) {
      try {
        recognitionRef.current.start();
        return;
      } catch (e) {
        // If recognition failed to start (e.g., invalidated state), clean and recreate below
        try {
          recognitionRef.current.abort();
        } catch (err) { }
        recognitionRef.current = null;
      }
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error('Speech recognition not supported in this browser. Please use Chrome or Edge.');
      return;
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
      };

      recognition.onresult = (event) => {
        if (isShuttingDownRef.current) return;
        // In processing or streaming states (before audio playback begins), ignore mic recognition events
        // to prevent residual user input (like 'hi') from aborting the connection
        if (voiceStateRef.current === 'processing' || voiceStateRef.current === 'streaming') return;

        let interimTranscript = '';
        let finalTranscript = '';
        let isFinalEvent = false;

        // Iterate through all results to capture full text without losing earlier tokens
        for (let i = 0; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript + ' ';
            if (i >= event.resultIndex) isFinalEvent = true;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }

        const currentText = (finalTranscript + interimTranscript).trim();
        if (!currentText) return;

        const cleanHeard = currentText.toLowerCase().replace(/[.,!?;:'"“”\-—]/g, ' ').trim();
        const isCurrentlySpeaking = voiceStateRef.current === 'speaking' && isSpeakingRef.current;

        // 5. TRUE INTERRUPTIONS (when AI is speaking or streaming):
        if (isCurrentlySpeaking) {
          const isEcho = isEchoOfAssistant(currentText);

          if (isEcho) {
            // Speaker sound leaking into mic: discard completely!
            return;
          }

          // Check if user spoke an explicit stop keyword
          const hasStopKeyword = INTERRUPTION_KEYWORDS.some(
            (kw) => cleanHeard === kw || cleanHeard.startsWith(kw + ' ') || cleanHeard.includes(' ' + kw) || cleanHeard.endsWith(' ' + kw)
          );

          // If AI is actively speaking, single isolated syllables or short noises are likely mic bleed
          if (!hasStopKeyword && cleanHeard.split(/\s+/).length < 3) {
            return;
          }

          // Real user interruption!
          // Instantly stop speech synthesis, abort request, switch to listening, and transcribe new speech!
          handleInterrupt(currentText);

          const isPureStop = ['stop', 'pause', 'quiet', 'shut up', 'hush', 'please stop', 'stop talking', 'okay stop'].includes(cleanHeard);

          if (silenceTimeoutRef.current) {
            clearTimeout(silenceTimeoutRef.current);
          }

          if (isPureStop) {
            // Pure stop command: stay quietly in listening mode waiting for user
            silenceTimeoutRef.current = setTimeout(() => {
              if (!isShuttingDownRef.current && voiceStateRef.current === 'listening') {
                setTranscript('');
                latestTranscriptRef.current = '';
              }
            }, 1200);
            return;
          }

          // User spoke words/questions: wait 700ms of silence before submitting
          silenceTimeoutRef.current = setTimeout(() => {
            if (!isShuttingDownRef.current && voiceStateRef.current === 'listening') {
              const textToSubmit = latestTranscriptRef.current || currentText;
              latestTranscriptRef.current = '';
              handleUserSubmit(textToSubmit);
            }
          }, 700);
          return;
        }

        // 1. LISTENING BEHAVIOR (when assistant is NOT speaking):
        if (isEchoOfAssistant(currentText)) {
          return;
        }

        // Show live transcription while user is speaking
        setTranscript(currentText);
        latestTranscriptRef.current = currentText;
        lastSpeechResultTimestampRef.current = Date.now();
        lastCloseVoiceTimestampRef.current = Date.now();

        if (silenceTimeoutRef.current) {
          clearTimeout(silenceTimeoutRef.current);
          silenceTimeoutRef.current = null;
        }

        if (['bye', 'goodbye', 'bye bye', 'exit'].includes(cleanHeard)) {
          handleExitVoiceMode();
          return;
        }

        // Detect silence before considering speech finished (400ms: snappy, immediate response)
        silenceTimeoutRef.current = setTimeout(() => {
          if (
            voiceStateRef.current === 'listening' &&
            !isSpeakingRef.current &&
            !isShuttingDownRef.current
          ) {
            const textToSubmit = latestTranscriptRef.current || currentText;
            if (textToSubmit.trim()) {
              latestTranscriptRef.current = '';
              handleUserSubmit(textToSubmit);
            }
          }
        }, 400);
      };

      recognition.onerror = (event) => {
        console.log('Speech recognition event:', event.error);
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          toast.error('Microphone access denied. Please allow microphone permissions in your browser.');
          setIsMuted(true);
          updateVoiceState('muted');
          stopListening();
        }
      };

      recognition.onend = () => {
        isListeningRef.current = false;
        setIsMicActive(false);

        // Auto-recovery only when truly in listening state (NEVER while assistant is speaking)
        if (
          isMountedRef.current &&
          !isShuttingDownRef.current &&
          !isMuted &&
          voiceStateRef.current === 'listening' &&
          !isSpeakingRef.current
        ) {
          restartTimeoutRef.current = setTimeout(() => {
            if (
              isMountedRef.current &&
              !isShuttingDownRef.current &&
              !isMuted &&
              voiceStateRef.current === 'listening' &&
              !isSpeakingRef.current
            ) {
              startListening();
            }
          }, 100);
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.error('Failed to start speech recognition session:', err);
      if (
        isMountedRef.current &&
        !isShuttingDownRef.current &&
        !isMuted &&
        voiceStateRef.current === 'listening' &&
        !isSpeakingRef.current
      ) {
        restartTimeoutRef.current = setTimeout(() => {
          startListening();
        }, 250);
      }
    }
  };

  // Mount & initialize speech recognition with microphone hardware warm-up and proximity gate
  useEffect(() => {
    isMountedRef.current = true;
    isShuttingDownRef.current = false;
    setTranscript('');
    setIsMuted(false);
    updateVoiceState('listening');

    if (typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      })
      .then((stream) => {
        if (!isMountedRef.current || isShuttingDownRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        audioStreamRef.current = stream;
        try {
          const AudioContextClass = window.AudioContext || window.webkitAudioContext;
          if (AudioContextClass) {
            const audioCtx = new AudioContextClass();
            const analyser = audioCtx.createAnalyser();
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.3;
            const source = audioCtx.createMediaStreamSource(stream);
            source.connect(analyser);
            audioCtxRef.current = audioCtx;
            analyserRef.current = analyser;

            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);

            audioPollIntervalRef.current = setInterval(() => {
              if (!analyserRef.current) return;
              analyserRef.current.getByteTimeDomainData(dataArray);
              let sum = 0;
              for (let i = 0; i < bufferLength; i++) {
                const val = (dataArray[i] - 128) / 128;
                sum += val * val;
              }
              const rms = Math.sqrt(sum / bufferLength);

              // Low-latency Voice Activity Detection (VAD):
              // RMS > 0.010 indicates vocal sound
              if (rms > 0.010) {
                lastVoiceActiveTimestampRef.current = Date.now();
                lastCloseVoiceTimestampRef.current = Date.now();
              } else {
                // Audio has dropped into silence
                const silenceDuration = Date.now() - lastVoiceActiveTimestampRef.current;
                const timeSinceLastResult = Date.now() - lastSpeechResultTimestampRef.current;

                // If user finished vocalizing > 400ms ago and we have an accumulated transcript in listening mode:
                if (
                  silenceDuration > 400 &&
                  timeSinceLastResult > 400 &&
                  latestTranscriptRef.current &&
                  voiceStateRef.current === 'listening' &&
                  !isSpeakingRef.current &&
                  !isShuttingDownRef.current
                ) {
                  const textToSubmit = latestTranscriptRef.current;
                  latestTranscriptRef.current = '';
                  if (isEchoOfAssistant(textToSubmit)) {
                    setTranscript('');
                    return;
                  }
                  if (silenceTimeoutRef.current) {
                    clearTimeout(silenceTimeoutRef.current);
                    silenceTimeoutRef.current = null;
                  }
                  handleUserSubmit(textToSubmit);
                }
              }
            }, 35);
          }
        } catch (e) {
          console.warn('AudioContext setup warning:', e);
        }

        if (isMountedRef.current && !isShuttingDownRef.current) {
          startListening();
        }
      })
      .catch((err) => {
        console.warn('Microphone permission warning:', err);
        if (isMountedRef.current && !isShuttingDownRef.current) {
          startListening();
        }
      });
    } else {
      startListening();
    }

    return () => {
      isMountedRef.current = false;
      killAllVoiceAndMic();
    };
  }, []);

  // 5. TRUE INTERRUPTIONS: Instantly halt audio, abort backend generation, clear queue, and listen
  const handleInterrupt = (newTranscript = '') => {
    if (speechKeepAliveRef.current) {
      clearInterval(speechKeepAliveRef.current);
      speechKeepAliveRef.current = null;
    }

    if (resumeListeningTimeoutRef.current) {
      clearTimeout(resumeListeningTimeoutRef.current);
      resumeListeningTimeoutRef.current = null;
    }

    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }

    isCancelledRef.current = true;
    speechQueueRef.current = [];
    wordBufferRef.current = '';
    currentChunkRef.current = '';
    isSpeakingRef.current = false;
    streamDoneRef.current = false;
    activeUtterancesRef.current = [];

    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch (e) { }
    }

    // Abort backend generation immediately
    if (onAbort) {
      onAbort();
    }

    // Instantly transition back to listening mode
    updateVoiceState('listening');

    if (newTranscript) {
      setTranscript(newTranscript);
      latestTranscriptRef.current = newTranscript;
    } else {
      setTranscript('');
      latestTranscriptRef.current = '';
    }

    // Instantly restart speech recognition to transcribe the user's interruption
    if (!isMuted && !isShuttingDownRef.current) {
      if (!isListeningRef.current) {
        startListening();
      }
    }
  };

  const stopSpeaking = () => handleInterrupt();

  // Natural sentence & clause chunking engine for smooth, human-paced speech synthesis
  const extractChunksFromBuffer = (isFinalFlush = false) => {
    const chunks = [];
    if (!wordBufferRef.current) return chunks;

    while (wordBufferRef.current && wordBufferRef.current.trim().length > 0) {
      const text = wordBufferRef.current;
      const words = text.trim().split(/\s+/);
      if (words.length === 0) break;

      // 1. Final flush when stream completes: deliver remaining sentences or clauses
      if (isFinalFlush) {
        const remaining = wordBufferRef.current.trim();
        wordBufferRef.current = '';
        if (remaining) {
          const sentenceSplit = remaining.match(/[^.!?\n]+[.!?\n]+(?:\s+|$)|[^.!?\n]+$/g);
          if (sentenceSplit && sentenceSplit.length > 0) {
            for (const s of sentenceSplit) {
              const cleaned = s.trim();
              if (cleaned) chunks.push(cleaned);
            }
          } else {
            chunks.push(remaining);
          }
        }
        break;
      }

      // 2. Full sentence boundary: [.!?] followed by whitespace or newline
      const sentenceMatch = text.match(/^([\s\S]*?[.!?])(?:\s+|\n+|$)/);
      if (sentenceMatch) {
        const sentenceCandidate = sentenceMatch[1].trim();
        const sentenceWords = sentenceCandidate.split(/\s+/);
        // Avoid cutting inside common abbreviations or file extensions (e.g., .toml, .js)
        const isAbbreviation = /(?:e\.g|i\.e|mr|mrs|ms|dr|vs|etc|\.toml|\.json|\.js|\.jsx|\.ts|\.html|\.css)$/i.test(sentenceCandidate);

        if (!isAbbreviation && sentenceWords.length >= 2) {
          chunks.push(sentenceCandidate);
          wordBufferRef.current = text.slice(sentenceMatch[0].length);
          continue;
        }
      }

      // 3. Natural clause boundary: comma, semicolon, colon, or em-dash (when at least 4 words have arrived)
      const clauseMatch = text.match(/^([\s\S]*?[,;:—–])(?:\s+|\n+)/);
      if (clauseMatch) {
        const clauseCandidate = clauseMatch[1].trim();
        const clauseWords = clauseCandidate.split(/\s+/);
        if (clauseWords.length >= 4) {
          chunks.push(clauseCandidate);
          wordBufferRef.current = text.slice(clauseMatch[0].length);
          continue;
        }
      }

      // 4. Safe fallback for unusually long sentences without punctuation (> 18 words)
      if (words.length >= 18) {
        const chunk = words.slice(0, 12).join(' ').trim();
        wordBufferRef.current = words.slice(12).join(' ');
        if (chunk) chunks.push(chunk);
        continue;
      }

      // Wait for complete sentence or clause from stream
      break;
    }
    return chunks;
  };

  // Enqueue speakable chunk into FIFO queue
  const enqueueSpeech = (rawChunk) => {
    if (isCancelledRef.current || !isMountedRef.current || isShuttingDownRef.current) return;
    const clean = cleanForSpeech(rawChunk);
    if (!clean) return;

    speechQueueRef.current.push(clean);

    if (!isSpeakingRef.current) {
      playNextChunk();
    }
  };

  // Plays queued chunks sequentially without overlapping utterances
  const playNextChunk = () => {
    if (isCancelledRef.current || !isMountedRef.current || isShuttingDownRef.current) {
      isSpeakingRef.current = false;
      return;
    }

    if (speechQueueRef.current.length === 0) {
      isSpeakingRef.current = false;
      if (streamDoneRef.current) {
        finishSpeakingAndResumeListening();
      }
      return;
    }

    const chunkToSpeak = speechQueueRef.current.shift();
    if (!chunkToSpeak || !chunkToSpeak.trim()) {
      playNextChunk();
      return;
    }

    if (!('speechSynthesis' in window)) {
      isSpeakingRef.current = false;
      playNextChunk();
      return;
    }

    currentChunkRef.current = chunkToSpeak;
    isSpeakingRef.current = true;
    updateVoiceState('speaking');

    // Ensure mic is paused while assistant is speaking to prevent acoustic feedback
    stopListening();

    const utterance = new SpeechSynthesisUtterance(chunkToSpeak);
    utterance.rate = 1.05; // Natural, clear, human conversational pace
    utterance.pitch = 1.0;

    const naturalVoice = selectedVoiceRef.current || getNaturalVoice();
    if (naturalVoice) utterance.voice = naturalVoice;

    utterance.onstart = () => {
      // Record timing of first spoken sound
      if (!perfTimingRef.current.firstSpeech) {
        perfTimingRef.current.firstSpeech = Date.now();
        const speechDelay = perfTimingRef.current.firstSpeech - perfTimingRef.current.speechEnd;
        const ttsPrep = perfTimingRef.current.firstSpeech - perfTimingRef.current.firstToken;
        console.log(`⏱️ [Perf Timing] [+${speechDelay}ms total / +${ttsPrep}ms from first token] Audio playback started speaking`);
      }
      isSpeakingRef.current = true;
      updateVoiceState('speaking');
      stopListening();
    };

    utterance.onend = () => {
      activeUtterancesRef.current = activeUtterancesRef.current.filter((u) => u !== utterance);
      if (isCancelledRef.current || isShuttingDownRef.current) {
        isSpeakingRef.current = false;
        return;
      }

      if (speechQueueRef.current.length > 0) {
        // Natural conversational breath/break between clauses or sentences (60ms)
        setTimeout(() => {
          if (!isCancelledRef.current && !isShuttingDownRef.current) {
            playNextChunk();
          }
        }, 60);
      } else if (streamDoneRef.current) {
        isSpeakingRef.current = false;
        finishSpeakingAndResumeListening();
      } else {
        isSpeakingRef.current = false;
      }
    };

    utterance.onerror = (event) => {
      console.warn('Utterance speech error:', event);
      activeUtterancesRef.current = activeUtterancesRef.current.filter((u) => u !== utterance);
      if (isCancelledRef.current || isShuttingDownRef.current) {
        isSpeakingRef.current = false;
        return;
      }
      if (speechQueueRef.current.length > 0) {
        setTimeout(() => {
          if (!isCancelledRef.current && !isShuttingDownRef.current) {
            playNextChunk();
          }
        }, 60);
      } else if (streamDoneRef.current) {
        isSpeakingRef.current = false;
        finishSpeakingAndResumeListening();
      } else {
        isSpeakingRef.current = false;
      }
    };

    // Safe Chrome/Windows TTS resume check without disruptive pause()
    if (speechKeepAliveRef.current) {
      clearInterval(speechKeepAliveRef.current);
    }
    speechKeepAliveRef.current = setInterval(() => {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
      } else {
        if (speechKeepAliveRef.current) {
          clearInterval(speechKeepAliveRef.current);
          speechKeepAliveRef.current = null;
        }
      }
    }, 4000);

    activeUtterancesRef.current.push(utterance);

    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
    window.speechSynthesis.speak(utterance);
  };

  // Submit spoken text and stream response token by token
  const handleUserSubmit = async (spokenText) => {
    if (isShuttingDownRef.current || !spokenText.trim()) return;

    if (isEchoOfAssistant(spokenText)) {
      setTranscript('');
      latestTranscriptRef.current = '';
      return;
    }

    // Performance timing initialization
    perfTimingRef.current = {
      speechEnd: Date.now(),
      requestStart: Date.now(),
      firstToken: 0,
      firstSpeech: 0,
      streamComplete: 0
    };
    console.log(`⏱️ [Perf Timing] [0ms] User finished speaking: "${spokenText.trim()}". Submitting request...`);

    // 2. PROCESSING STATE: Immediately disable mic, show thinking indicator
    stopListening();
    updateVoiceState('processing');
    setTranscript('');
    latestTranscriptRef.current = '';

    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }

    // Clean up all speech and timing state
    isCancelledRef.current = false;
    speechQueueRef.current = [];
    wordBufferRef.current = '';
    currentChunkRef.current = '';
    isSpeakingRef.current = false;
    streamDoneRef.current = false;
    activeUtterancesRef.current = [];
    lastSpokenTextRef.current = '';

    try {
      await onSendMessage(spokenText, (chunkText, fullText, isDone) => {
        if (isCancelledRef.current || isShuttingDownRef.current) return;

        if (fullText) {
          lastSpokenTextRef.current = fullText;
        }

        // 3. STREAMING TEXT STATE: Tokens arrive word-by-word into bubble
        if (chunkText) {
          if (!perfTimingRef.current.firstToken) {
            perfTimingRef.current.firstToken = Date.now();
            const netDelay = perfTimingRef.current.firstToken - perfTimingRef.current.requestStart;
            console.log(`⏱️ [Perf Timing] [+${netDelay}ms] First token received from backend (Network + AI generation)`);
          }

          wordBufferRef.current += chunkText;

          // Transition from processing to streaming once first token arrives
          if (voiceStateRef.current === 'processing') {
            updateVoiceState('streaming');
          }

          // 4. SPEECH SYNCHRONIZATION: Extract speakable chunks and queue for audio playback
          const chunks = extractChunksFromBuffer(false);
          for (const chunk of chunks) {
            enqueueSpeech(chunk);
          }
        }

        if (isDone) {
          if (!perfTimingRef.current.streamComplete) {
            perfTimingRef.current.streamComplete = Date.now();
            const totalStream = perfTimingRef.current.streamComplete - perfTimingRef.current.speechEnd;
            console.log(`⏱️ [Perf Timing] [+${totalStream}ms] Full AI message stream complete`);
          }

          streamDoneRef.current = true;
          const remainingChunks = extractChunksFromBuffer(true);
          for (const chunk of remainingChunks) {
            enqueueSpeech(chunk);
          }

          if (!isSpeakingRef.current && speechQueueRef.current.length === 0) {
            finishSpeakingAndResumeListening();
          }
        }
      });
    } catch (error) {
      console.error('Voice submission error:', error);
      if (isMountedRef.current && !isCancelledRef.current && !isShuttingDownRef.current) {
        finishSpeakingAndResumeListening();
      }
    }
  };

  // Resets speaking state and re-enables microphone in listening state
  const finishSpeakingAndResumeListening = () => {
    isSpeakingRef.current = false;
    currentChunkRef.current = '';
    speechQueueRef.current = [];
    wordBufferRef.current = '';
    streamDoneRef.current = false;
    setTranscript('');
    latestTranscriptRef.current = '';

    if (speechKeepAliveRef.current) {
      clearInterval(speechKeepAliveRef.current);
      speechKeepAliveRef.current = null;
    }

    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch (e) { }
    }

    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
    if (resumeListeningTimeoutRef.current) {
      clearTimeout(resumeListeningTimeoutRef.current);
      resumeListeningTimeoutRef.current = null;
    }

    // Cooldown buffer (200ms): Ensure speaker audio finishes before opening microphone
    resumeListeningTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current && !isShuttingDownRef.current && !isSpeakingRef.current) {
        latestTranscriptRef.current = '';
        setTranscript('');
        updateVoiceState('listening');
        if (!isMuted && !isListeningRef.current) {
          startListening();
        }
      }
    }, 200);
  };

  const handleToggleMute = () => {
    if (isMuted) {
      setIsMuted(false);
      if (voiceStateRef.current === 'listening' && !isSpeakingRef.current) {
        startListening();
      }
      toast('Microphone on', { icon: '🎙️', duration: 1500 });
    } else {
      setIsMuted(true);
      updateVoiceState('muted');
      stopListening();
      toast('Microphone muted', { icon: '🔇', duration: 1500 });
    }
  };

  const handleCopy = (text, index) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
    toast.success('Copied to clipboard', { duration: 1500 });
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white select-none animate-fade-in overflow-hidden">
      {/* Top Header Bar (ChatGPT Voice style) */}
      <div className="w-full flex items-center justify-between px-6 py-4 border-b border-white/5 bg-black/40 backdrop-blur-md z-20">
        <div className="flex items-center gap-3">
          {/* Logo icon */}
          <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-cyan-500 to-blue-500 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <span className="text-xs font-bold text-white">G</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-base font-medium tracking-tight text-gray-100">Gabby Voice</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium border flex items-center gap-1.5 ${
              voiceState === 'speaking' || voiceState === 'streaming'
                ? 'bg-purple-500/10 text-purple-300 border-purple-500/20'
                : voiceState === 'processing' || voiceState === 'thinking'
                  ? 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                  : voiceState === 'muted'
                    ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                    : isMicActive
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${
                voiceState === 'speaking' || voiceState === 'streaming'
                  ? 'bg-purple-400 animate-pulse'
                  : voiceState === 'processing' || voiceState === 'thinking'
                    ? 'bg-amber-400 animate-ping'
                    : voiceState === 'muted'
                      ? 'bg-rose-400'
                      : isMicActive
                        ? 'bg-emerald-400 animate-pulse'
                        : 'bg-cyan-400 animate-ping'
              }`} />
              <span>
                {voiceState === 'speaking'
                  ? 'Speaking'
                  : voiceState === 'streaming'
                    ? 'Streaming...'
                    : voiceState === 'processing' || voiceState === 'thinking'
                      ? 'Thinking...'
                      : voiceState === 'muted'
                        ? 'Muted'
                        : isMicActive
                          ? 'Listening'
                          : 'Connecting mic...'}
              </span>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* New Chat button */}
          {onNewChat && (
            <button
              onClick={() => {
                if ('speechSynthesis' in window) {
                  try {
                    window.speechSynthesis.cancel();
                  } catch (e) { }
                }
                if (onAbort) onAbort();
                isSpeakingRef.current = false;
                speechQueueRef.current = [];
                wordBufferRef.current = '';
                currentChunkRef.current = '';
                latestTranscriptRef.current = '';
                streamDoneRef.current = false;
                setTranscript('');
                onNewChat();
                toast.success('Started new conversation', {
                  id: 'voice-new-chat',
                  style: { background: '#1E1E1E', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }
                });
                updateVoiceState('listening');
                startListening();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition-all text-xs font-medium border border-white/10 cursor-pointer"
              title="Start New Conversation"
            >
              <Plus size={14} />
              <span>New Chat</span>
            </button>
          )}

          {/* Close button */}
          <button
            onClick={handleExitVoiceMode}
            className="p-2 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors cursor-pointer"
            title="Exit Voice Mode"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Main Conversation Stream: Displays the conversation bubbles just like ChatGPT Voice! */}
      <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 space-y-6 custom-scrollbar relative">
        <div className="max-w-3xl mx-auto space-y-6 pb-36">
          {messages.length === 0 && !transcript && (
            <div className="h-64 flex flex-col items-center justify-center text-center text-gray-500">
              <p className="text-lg font-light text-gray-300">
                {isMuted ? 'Microphone is muted' : isMicActive ? 'Listening to you...' : 'Connecting microphone...'}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {isMuted
                  ? 'Click the microphone button below to unmute'
                  : isMicActive
                    ? 'Start speaking anytime, or say "Tell me a short story"'
                    : 'Please grant microphone access if prompted by your browser'}
              </p>
            </div>
          )}

          {messages.map((msg, idx) => (
            <div key={idx} className="space-y-2">
              {msg.role === 'user' ? (
                /* User bubble on the right */
                <div className="flex justify-end">
                  <div className="bg-[#1e2330] border border-white/10 text-gray-100 px-4 py-2.5 rounded-2xl max-w-lg text-sm md:text-base leading-relaxed shadow-sm">
                    {msg.content}
                  </div>
                </div>
              ) : (
                /* Assistant message on the left */
                <div className="flex flex-col items-start space-y-1.5 max-w-2xl">
                  <div className="text-gray-100 text-sm md:text-base leading-relaxed pl-1 whitespace-pre-wrap">
                    {msg.content}
                  </div>
                  {/* Message action icons (thumbs up, copy) */}
                  <div className="flex items-center gap-2 pl-1 pt-1 text-gray-500 text-xs">
                    <button
                      onClick={() => handleCopy(msg.content, idx)}
                      className="p-1 hover:text-gray-300 transition-colors"
                      title="Copy"
                    >
                      {copiedIndex === idx ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                    </button>
                    <button className="p-1 hover:text-gray-300 transition-colors" title="Good response">
                      <ThumbsUp size={14} />
                    </button>
                    <button className="p-1 hover:text-gray-300 transition-colors" title="Bad response">
                      <ThumbsDown size={14} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Live User Transcript Preview Bubble (while user is actively speaking) */}
          {transcript && (
            <div className="flex justify-end animate-fade-in">
              <div className="bg-cyan-950/60 border border-cyan-500/40 text-cyan-200 px-4 py-2.5 rounded-2xl max-w-lg text-sm md:text-base leading-relaxed shadow-sm flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                <span>{transcript}</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Floating Bottom Section: The ChatGPT-style glowing Pearl Orb & Action Bar */}
      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black via-black/90 to-transparent pt-12 pb-6 px-4 flex flex-col items-center pointer-events-none">
        {/* Floating Living Pearl Orb (hovering seamlessly right above the bottom controls) */}
        <div className="pointer-events-auto relative flex flex-col items-center justify-center mb-3">
          {/* Ambient luminous glow aura */}
          <div className="absolute w-28 h-28 rounded-full bg-cyan-500/25 blur-2xl pointer-events-none animate-pulse" />

          <button
            onClick={() => {
              if (voiceState === 'speaking' || voiceState === 'streaming' || voiceState === 'processing' || voiceState === 'thinking') {
                handleInterrupt();
              }
            }}
            className={`w-18 h-18 rounded-full cursor-pointer transition-transform duration-300 select-none flex items-center justify-center shadow-2xl hover:scale-105 active:scale-95 ${
              voiceState === 'speaking' || voiceState === 'streaming'
                ? 'chatgpt-orb-speaking scale-110'
                : voiceState === 'processing' || voiceState === 'thinking'
                  ? 'chatgpt-orb-thinking'
                  : voiceState === 'muted'
                    ? 'bg-gray-700 opacity-60'
                    : 'chatgpt-orb'
            }`}
            title={voiceState === 'speaking' || voiceState === 'streaming' ? 'Click to interrupt/stop' : 'Tap to stop or listen'}
          >
            {(voiceState === 'processing' || voiceState === 'thinking') && (
              <span className="w-2.5 h-2.5 rounded-full bg-white/90 animate-ping" />
            )}
            {(voiceState === 'speaking' || voiceState === 'streaming') && (
              <Square size={16} className="fill-white/80 text-white/80" />
            )}
          </button>

          {/* Quick stop badge when speaking or streaming */}
          {(voiceState === 'speaking' || voiceState === 'streaming') && (
            <button
              onClick={() => handleInterrupt()}
              className="mt-2 px-3 py-1 bg-white/10 hover:bg-white/20 text-gray-200 border border-white/15 rounded-full text-xs font-medium flex items-center gap-1.5 cursor-pointer transition-all animate-fade-in shadow-lg"
              title="Stop speaking and listen"
            >
              <Square size={10} className="fill-current" />
              <span>Tap to interrupt (Space)</span>
            </button>
          )}
        </div>

        {/* Bottom Control Bar (matching the ChatGPT Voice screenshot layout) */}
        <div className="pointer-events-auto w-full max-w-xl flex items-center justify-between px-4">
          {/* Left: + Type button */}
          <button
            onClick={() => {
              handleExitVoiceMode();
              if (onType) onType();
            }}
            className="px-4 py-2 rounded-full bg-white/10 hover:bg-white/15 text-gray-200 hover:text-white transition-all text-xs md:text-sm font-medium flex items-center gap-2 border border-white/10 cursor-pointer shadow-md"
            title="Switch to typing"
          >
            <span>+</span>
            <span>Type</span>
          </button>

          {/* Right: Floating action pill with Language/Web, Mic, and Close */}
          <div className="flex items-center gap-1.5 bg-[#1e2330]/90 backdrop-blur-lg border border-white/10 px-2 py-1.5 rounded-full shadow-xl">
            {/* Status / Live badge */}
            <div className="px-2.5 py-1 rounded-full text-xs font-medium text-cyan-400 flex items-center gap-1.5">
              <Zap size={13} className="text-cyan-400" />
              <span className="text-[11px] hidden sm:inline">Ultra Fast</span>
            </div>

            {/* Mute toggle button */}
            <button
              onClick={handleToggleMute}
              className={`p-2 rounded-full transition-colors cursor-pointer ${isMuted
                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                  : 'hover:bg-white/10 text-gray-300 hover:text-white'
                }`}
              title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
            >
              {isMuted ? <MicOff size={17} /> : <Mic size={17} />}
            </button>

            {/* Close button */}
            <button
              onClick={handleExitVoiceMode}
              className="p-2 rounded-full hover:bg-rose-500/20 text-gray-400 hover:text-rose-300 transition-colors cursor-pointer"
              title="Close Voice Mode"
            >
              <X size={17} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
