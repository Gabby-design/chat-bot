import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, X, Square, Zap, ThumbsUp, ThumbsDown, Copy, Check, Plus, Volume2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { synthesizeGeminiVoice, stopGeminiVoice, GEMINI_VOICES, DEFAULT_GEMINI_VOICE } from '../utils/geminiVoice.js';

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

    if (activeAudioRef.current) {
      try {
        activeAudioRef.current.pause();
        activeAudioRef.current.src = '';
      } catch (e) {}
      activeAudioRef.current = null;
    }
    stopGeminiVoice();
  };

  const handleExitVoiceMode = () => {
    killAllVoiceAndMic();
    if (onClose) onClose();
  };

  // True interruption: instantly halt audio playback and resume listening
  const handleInterrupt = () => {
    if (activeAudioRef.current) {
      try {
        activeAudioRef.current.pause();
        activeAudioRef.current.src = '';
      } catch (e) {}
      activeAudioRef.current = null;
    }
    stopGeminiVoice();

    if (onAbort) onAbort();

    setTranscript('');
    setCurrentAssistantSpeech('');
    updateVoiceState('listening');

    if (!isMuted && !isShuttingDownRef.current) {
      startListening();
    }
  };

  // Robust SpeechRecognition Starter
  const startListening = () => {
    if (isShuttingDownRef.current || isMuted) return;
    if (voiceStateRef.current === 'speaking' || voiceStateRef.current === 'processing') return;

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
        updateVoiceState('listening');
      };

      recognition.onresult = (event) => {
        if (isShuttingDownRef.current) return;
        if (voiceStateRef.current === 'speaking' || voiceStateRef.current === 'processing') return;

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
          if (voiceStateRef.current === 'listening' && !isShuttingDownRef.current) {
            silenceTimeoutRef.current = null;
            handleUserSubmit(currentText);
          }
        }, 750);
      };

      recognition.onerror = (event) => {
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          toast.error('Microphone permission required. Please allow mic access in browser.');
          setIsMuted(true);
          updateVoiceState('muted');
          stopListening();
        } else if (event.error === 'no-speech') {
          // Normal silence, keep listening
        }
      };

      recognition.onend = () => {
        isListeningRef.current = false;
        setIsMicActive(false);

        // Auto-restart if in listening state
        if (
          isMountedRef.current &&
          !isShuttingDownRef.current &&
          !isMuted &&
          voiceStateRef.current === 'listening'
        ) {
          setTimeout(() => {
            if (isMountedRef.current && !isShuttingDownRef.current && voiceStateRef.current === 'listening') {
              startListening();
            }
          }, 200);
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
        recognitionRef.current.stop();
      } catch (e) {}
    }
  };

  // Submit user speech, stream response, and speak with authentic Gemini Voice
  const handleUserSubmit = async (spokenText) => {
    if (isShuttingDownRef.current || !spokenText.trim()) return;

    stopListening();
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
          // AI message stream completed; speak response using Gemini Neural Audio
          playGeminiResponse(accumulatedResponse);
        }
      });
    } catch (err) {
      console.error('Error submitting voice message:', err);
      updateVoiceState('listening');
      startListening();
    }
  };

  // Synthesize and play audio with Gemini Neural Audio
  const playGeminiResponse = async (text) => {
    if (isShuttingDownRef.current || !text) {
      updateVoiceState('listening');
      startListening();
      return;
    }

    updateVoiceState('speaking');

    try {
      const blobUrl = await synthesizeGeminiVoice(text, {
        voice: selectedVoice,
        apiKey
      });

      if (isShuttingDownRef.current || voiceStateRef.current !== 'speaking') {
        return;
      }

      const audio = new Audio(blobUrl);
      activeAudioRef.current = audio;

      audio.onended = () => {
        activeAudioRef.current = null;
        if (isMountedRef.current && !isShuttingDownRef.current) {
          setCurrentAssistantSpeech('');
          updateVoiceState('listening');
          if (!isMuted) {
            startListening();
          }
        }
      };

      audio.onerror = (e) => {
        console.warn('Audio playback error, returning to listen:', e);
        activeAudioRef.current = null;
        updateVoiceState('listening');
        if (!isMuted) {
          startListening();
        }
      };

      await audio.play();
    } catch (synthErr) {
      console.warn('Gemini voice synthesis failed, returning to listening:', synthErr);
      updateVoiceState('listening');
      if (!isMuted) {
        startListening();
      }
    }
  };

  // Component lifecycle: Start listening on mount
  useEffect(() => {
    isMountedRef.current = true;
    isShuttingDownRef.current = false;

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
      updateVoiceState('listening');
      startListening();
      toast('Microphone unmuted', { icon: '🎙️', duration: 1500 });
    } else {
      setIsMuted(true);
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
          <div className="flex items-center gap-2">
            <span className="text-sm sm:text-base font-medium tracking-tight text-gray-100">Gabby Live Voice</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium border flex items-center gap-1.5 ${
              voiceState === 'speaking'
                ? 'bg-purple-500/15 text-purple-300 border-purple-500/30'
                : voiceState === 'processing'
                ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                : voiceState === 'muted'
                ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                : isMicActive
                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                : 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${
                voiceState === 'speaking'
                  ? 'bg-purple-400 animate-pulse'
                  : voiceState === 'processing'
                  ? 'bg-amber-400 animate-ping'
                  : voiceState === 'muted'
                  ? 'bg-rose-400'
                  : 'bg-emerald-400 animate-pulse'
              }`} />
              <span>
                {voiceState === 'speaking'
                  ? `Speaking (${selectedVoice})`
                  : voiceState === 'processing'
                  ? 'Thinking...'
                  : voiceState === 'muted'
                  ? 'Muted'
                  : isMicActive
                  ? 'Listening'
                  : 'Tap to Speak'}
              </span>
            </span>
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
          {messages.length === 0 && !transcript && (
            <div className="h-64 flex flex-col items-center justify-center text-center text-gray-400">
              <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-[#4E80EE]/20 via-[#9B72CF]/20 to-[#E275AA]/20 flex items-center justify-center mb-3">
                <Mic size={24} className="text-[#70CFFF]" />
              </div>
              <p className="text-base sm:text-lg font-medium text-gray-200">
                {isMuted ? 'Microphone is muted' : 'Listening to you...'}
              </p>
              <p className="text-xs text-gray-500 mt-1 max-w-sm">
                {isMuted
                  ? 'Click the microphone button below to unmute'
                  : 'Speak naturally, or tap the Glowing Orb to talk anytime. Gabby responds with clear Gemini audio.'}
              </p>
            </div>
          )}

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

      {/* Floating Bottom Section: Living Gemini Glowing Orb & Controls */}
      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-[#0f1012] via-[#0f1012]/95 to-transparent pt-10 pb-5 px-4 flex flex-col items-center pointer-events-none">
        <div className="pointer-events-auto relative flex flex-col items-center justify-center mb-3">
          {/* Ambient luminous glow aura */}
          <div className={`absolute w-28 h-28 rounded-full blur-2xl pointer-events-none transition-all duration-500 ${
            voiceState === 'speaking'
              ? 'bg-purple-500/35 scale-125'
              : voiceState === 'processing'
              ? 'bg-amber-500/35 scale-110'
              : 'bg-cyan-500/25'
          }`} />

          {/* Gemini Living Voice Orb */}
          <button
            onClick={handleOrbClick}
            className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full cursor-pointer transition-all duration-300 select-none flex items-center justify-center shadow-2xl hover:scale-105 active:scale-95 border border-white/20 ${
              voiceState === 'speaking'
                ? 'bg-gradient-to-tr from-[#9B72CF] via-[#E275AA] to-[#4E80EE] animate-pulse scale-110'
                : voiceState === 'processing'
                ? 'bg-gradient-to-tr from-amber-500 via-orange-500 to-yellow-400 animate-spin'
                : voiceState === 'muted'
                ? 'bg-gray-800 opacity-60'
                : 'bg-gradient-to-tr from-[#4E80EE] via-[#70CFFF] to-[#9B72CF]'
            }`}
            title={
              voiceState === 'speaking'
                ? 'Tap to Interrupt'
                : voiceState === 'processing'
                ? 'Thinking...'
                : 'Tap to Speak / Send'
            }
          >
            {voiceState === 'speaking' ? (
              <Square size={18} className="fill-white text-white" />
            ) : voiceState === 'processing' ? (
              <span className="w-3 h-3 rounded-full bg-white animate-ping" />
            ) : (
              <Mic size={24} className="text-white" />
            )}
          </button>

          {/* Status Label underneath the Orb */}
          <div className="mt-2 text-center">
            <span className="text-xs text-gray-300 font-medium">
              {voiceState === 'speaking'
                ? 'Tap to interrupt'
                : voiceState === 'processing'
                ? 'Synthesizing speech...'
                : transcript
                ? 'Tap orb to send now'
                : 'Listening... (or tap orb to speak)'}
            </span>
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
            className="min-h-[40px] px-4 py-2 rounded-full bg-white/10 hover:bg-white/15 text-gray-200 hover:text-white transition-all text-xs font-medium flex items-center gap-1.5 border border-white/10 cursor-pointer shadow-md touch-manipulation"
            title="Switch to typing"
          >
            <span>+</span>
            <span>Type</span>
          </button>

          {/* Action pill: Voice Name badge, Mute, and Close */}
          <div className="flex items-center gap-1.5 bg-[#1e1f20]/90 backdrop-blur-lg border border-white/10 px-2 py-1 rounded-full shadow-xl">
            <div className="px-2.5 py-1 rounded-full text-xs font-medium text-[#70CFFF] flex items-center gap-1">
              <Volume2 size={13} />
              <span className="text-[11px]">{selectedVoice}</span>
            </div>

            <button
              onClick={handleToggleMute}
              className={`w-10 h-10 min-w-[40px] min-h-[40px] rounded-full transition-colors cursor-pointer flex items-center justify-center touch-manipulation ${
                isMuted
                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
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
