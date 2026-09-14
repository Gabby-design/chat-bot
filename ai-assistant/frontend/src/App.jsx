// src/App.jsx
import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Sparkles, Menu, Plus, MessageSquare, Settings, LogOut, Copy, RotateCcw, Square, Trash2, X, Code, Calculator, Search, FileText, ChevronRight, Zap, ChevronDown, Star, Bookmark, Folder, Gem, HelpCircle, Moon, Bell, Shield, Info, ThumbsUp, ThumbsDown, Volume2, VolumeX, Pencil, Check, Mic, MicOff, Download } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import toast, { Toaster } from 'react-hot-toast';
import VoiceModeModal from './components/VoiceModeModal.jsx';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

function CodeBlock({ className, children, ...props }) {
  const [isCopied, setIsCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || '');
  const codeText = String(children).replace(/\n$/, '');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(codeText);
      setIsCopied(true);
      toast.success('Code copied!', {
        id: 'code-copied-toast',
        style: { background: '#1E1E1E', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }
      });
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Copy code failed', err);
      toast.error('Failed to copy code');
    }
  };

  return (
    <div className="relative my-4 rounded-2xl overflow-hidden bg-[#1e1f20] border border-white/10 group/code shadow-lg text-left">
      <div className="flex items-center justify-between px-4 py-2 bg-[#131314]/70 border-b border-white/5">
        <span className="text-xs font-mono text-[#70CFFF] font-medium tracking-wide">
          {match ? match[1] : 'code'}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-[#c4c7c5] hover:text-white hover:bg-white/10 transition-colors"
          title="Copy code"
        >
          {isCopied ? (
            <>
              <Check size={13} className="text-emerald-400" />
              <span className="text-emerald-400 font-medium">Copied!</span>
            </>
          ) : (
            <>
              <Copy size={13} />
              <span>Copy code</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-4 overflow-x-auto text-[13.5px] leading-relaxed font-mono">
        <code className={className} {...props}>
          {children}
        </code>
      </pre>
    </div>
  );
}

function App() {
  // State
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isToolsOpen, setIsToolsOpen] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState(null);

  // Live Voice Mode State
  const [isVoiceModeOpen, setIsVoiceModeOpen] = useState(false);

  // Ratings & Speech & Editing state
  const [ratings, setRatings] = useState({});
  const [speakingIndex, setSpeakingIndex] = useState(null);
  const [editingIndex, setEditingIndex] = useState(null);
  const [editingText, setEditingText] = useState('');
  const abortControllerRef = useRef(null);

  // Responsive state
  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);

  // Tools state
  const [tools, setTools] = useState({
    pythonRunner: true,
    calculator: true,
    webSearch: false,
    textScraper: false,
  });

  // New State for Chat History
  const [chats, setChats] = useState([]);
  const [currentChatId, setCurrentChatId] = useState(null);

  // My Stuff state
  const [isMyStuffOpen, setIsMyStuffOpen] = useState(false);

  // Gems state
  const [isGemsOpen, setIsGemsOpen] = useState(false);

  // Settings state
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(true);
  const [desktopNotifications, setDesktopNotifications] = useState(false);
  const [soundEffects, setSoundEffects] = useState(true);
  const [showDocumentation, setShowDocumentation] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);

  // Search and input bar state
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAttachmentOpen, setIsAttachmentOpen] = useState(false);
  const [isModelSelectorOpen, setIsModelSelectorOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState('standard');

  // PWA Install State
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isAppInstalled, setIsAppInstalled] = useState(false);

  // Detect standalone PWA mode & capture beforeinstallprompt
  useEffect(() => {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if (isStandalone) {
      setIsAppInstalled(true);
    }

    const handleBeforeInstall = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
    };

    const handleAppInstalled = () => {
      setIsAppInstalled(true);
      setInstallPrompt(null);
      toast.success('Gabby installed as an App!', {
        icon: '✨',
        style: { background: '#1E1E1E', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }
      });
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallApp = async () => {
    if (installPrompt) {
      installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      if (outcome === 'accepted') {
        setIsAppInstalled(true);
      }
      setInstallPrompt(null);
    } else {
      toast(
        (t) => (
          <div className="text-xs space-y-1.5 py-0.5">
            <p className="font-semibold text-white">Install Gabby App</p>
            <p className="text-[#c4c7c5]">
              • <strong>Desktop:</strong> Click the <span className="text-[#70CFFF]">Install icon (⊕)</span> in your browser's address bar.
            </p>
            <p className="text-[#c4c7c5]">
              • <strong>iPhone / iPad:</strong> Tap <span className="text-[#70CFFF]">Share</span> then tap <span className="text-[#70CFFF]">Add to Home Screen</span>.
            </p>
          </div>
        ),
        {
          duration: 6000,
          style: { background: '#1E1E1E', color: '#fff', border: '1px solid rgba(255,255,255,0.15)' }
        }
      );
    }
  };

  const messagesEndRef = useRef(null);
  const eventSourceRef = useRef(null);

  // Responsive breakpoint detection
  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      setIsMobile(width < 768);
      setIsTablet(width >= 768 && width < 1024);

      // Auto-hide sidebars on mobile
      if (width < 768) {
        setIsSidebarOpen(false);
        setIsToolsOpen(false);
      } else if (width >= 1024) {
        setIsSidebarOpen(true);
        setIsToolsOpen(false); // Keep tools sidebar closed
      }
    };

    handleResize(); // Initial check
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Fetch chats on mount
  useEffect(() => {
    fetchChats();
  }, []);

  const fetchChats = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/chats`);
      if (response.ok) {
        const data = await response.json();
        setChats(data);
      }
    } catch (error) {
      console.error('Failed to fetch chats:', error);
    }
  };

  const createNewChat = async () => {
    try {
      if (!currentChatId && messages.length === 0) return;
      setCurrentChatId(null);
      setMessages([]);
      if (window.innerWidth < 768) setIsSidebarOpen(false);
    } catch (error) {
      console.error('Failed to create new chat:', error);
    }
  };

  const loadChat = async (chatId) => {
    if (chatId === currentChatId) return;

    try {
      setIsLoading(true);
      const response = await fetch(`${API_BASE_URL}/api/chats/${chatId}`);
      if (response.ok) {
        const data = await response.json();
        setMessages(data.messages);
        setCurrentChatId(chatId);
        if (window.innerWidth < 768) setIsSidebarOpen(false);
      }
    } catch (error) {
      console.error('Failed to load chat:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const deleteChat = async (e, chatId) => {
    e.stopPropagation();

    toast((t) => (
      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium text-white">Delete this chat?</p>
        <div className="flex gap-2">
          <button
            onClick={async () => {
              toast.dismiss(t.id);
              try {
                await fetch(`${API_BASE_URL}/api/chats/${chatId}`, { method: 'DELETE' });
                setChats(chats.filter(c => c.id !== chatId));
                if (currentChatId === chatId) {
                  setCurrentChatId(null);
                  setMessages([]);
                }
                toast.success('Chat deleted', {
                  style: {
                    background: '#1E1E1E',
                    color: '#fff',
                    border: '1px solid rgba(255,255,255,0.1)'
                  }
                });
              } catch (error) {
                console.error('Failed to delete chat:', error);
                toast.error('Failed to delete chat');
              }
            }}
            className="bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          >
            Delete
          </button>
          <button
            onClick={() => toast.dismiss(t.id)}
            className="bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    ), {
      duration: 5000,
      position: 'bottom-center',
      style: {
        background: '#2A2A2A',
        border: '1px solid rgba(255,255,255,0.1)',
        padding: '12px',
        borderRadius: '12px',
      },
    });
  };

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);



  const stopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
    setIsLoading(false);
    toast('Generation stopped', { icon: '⏹️', style: { background: '#1E1E1E', color: '#fff' } });
  };

  const copyToClipboard = async (text, index) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      toast.success('Copied to clipboard', {
        id: `copy-${index}`,
        style: { background: '#1E1E1E', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }
      });
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (err) {
      console.error('Copy failed', err);
      toast.error('Failed to copy');
    }
  };

  const handleRate = (index, type) => {
    setRatings((prev) => {
      const current = prev[index];
      const next = current === type ? null : type;
      if (next === 'like') {
        toast.success('Thanks for the feedback!', {
          icon: '👍',
          id: `rate-${index}`,
          style: { background: '#1E1E1E', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }
        });
      } else if (next === 'dislike') {
        toast('Feedback noted. We will work to improve.', {
          icon: '👎',
          id: `rate-${index}`,
          style: { background: '#1E1E1E', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }
        });
      }
      return { ...prev, [index]: next };
    });
  };

  const toggleSpeech = (index, text) => {
    if (!('speechSynthesis' in window)) {
      toast.error('Text-to-speech is not supported in this browser.');
      return;
    }

    if (speakingIndex === index) {
      window.speechSynthesis.cancel();
      setSpeakingIndex(null);
      return;
    }

    window.speechSynthesis.cancel();

    // Strip code blocks and markdown markers for clear voice output
    const cleanText = text
      .replace(/```[\s\S]*?```/g, 'Code block omitted.')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/[*_~#]/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    utterance.onend = () => setSpeakingIndex(null);
    utterance.onerror = () => setSpeakingIndex(null);

    setSpeakingIndex(index);
    window.speechSynthesis.speak(utterance);
  };

  useEffect(() => {
    const handleGlobalSpeechKey = (e) => {
      if (e.key === 'Escape' && speakingIndex !== null) {
        window.speechSynthesis.cancel();
        setSpeakingIndex(null);
        toast('Speech stopped', { icon: '⏹', id: 'global-tts-stop' });
      }
    };
    window.addEventListener('keydown', handleGlobalSpeechKey);
    return () => window.removeEventListener('keydown', handleGlobalSpeechKey);
  }, [speakingIndex]);


  const handleStartEdit = (index, content) => {
    setEditingIndex(index);
    setEditingText(content);
  };

  const handleCancelEdit = () => {
    setEditingIndex(null);
    setEditingText('');
  };

  const handleSaveAndSubmitEdit = async (index) => {
    if (!editingText.trim() || isLoading) return;
    const updatedContent = editingText.trim();
    setEditingIndex(null);
    setEditingText('');

    // Truncate messages up to the edited user message
    const updatedHistory = [...messages.slice(0, index), { role: 'user', content: updatedContent }];
    setMessages(updatedHistory);

    let activeChatId = currentChatId;
    if (!activeChatId) {
      try {
        const res = await fetch(`${API_BASE_URL}/api/chats`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: updatedContent.slice(0, 30) })
        });
        const newChat = await res.json();
        activeChatId = newChat.id;
        setCurrentChatId(activeChatId);
        setChats((prev) => [newChat, ...prev]);
      } catch (err) {
        console.error('Failed to create chat', err);
        return;
      }
    }

    await streamResponse(updatedContent, activeChatId);
  };

  const regenerateMessage = async (assistantIndex) => {
    const userIdx = messages
      .slice(0, assistantIndex)
      .reverse()
      .findIndex((msg) => msg.role === 'user');
    if (userIdx === -1) return;
    const userMsgIndex = assistantIndex - 1 - userIdx;
    const userMsg = messages[userMsgIndex];

    // Truncate conversation to right after the prompt
    const truncated = messages.slice(0, userMsgIndex + 1);
    setMessages(truncated);

    await streamResponse(userMsg.content, currentChatId);
  };

  const streamResponse = async (message, chatIdToUse) => {
    setIsLoading(true);
    setIsStreaming(true);

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

    try {
      const response = await fetch(`${API_BASE_URL}/api/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, chat_id: chatIdToUse, model: selectedModel }),
        signal: controller.signal
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Stream response not ok:', response.status, errorText);
        throw new Error(`Server error: ${response.status} ${errorText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let streamed = '';
      let sseBuffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split('\n');
        sseBuffer = lines.pop(); // Keep partial line across chunks

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (trimmedLine.startsWith('data: ')) {
            const data = trimmedLine.slice(6).trim();
            if (data === '[DONE]') {
              setIsStreaming(false);
              setIsLoading(false);
              abortControllerRef.current = null;
              fetchChats();
              return;
            }
            try {
              const parsed = JSON.parse(data);
              if (parsed.text) {
                const newToken = parsed.text;
                streamed += newToken;
                setMessages((prev) => {
                  const updated = [...prev];
                  if (updated.length > 0) {
                    const lastIdx = updated.length - 1;
                    updated[lastIdx] = {
                      ...updated[lastIdx],
                      content: updated[lastIdx].content + newToken
                    };
                  }
                  return updated;
                });
              } else if (parsed.info) {
                setMessages((prev) => {
                  const updated = [...prev];
                  if (updated.length > 0) {
                    const lastIdx = updated.length - 1;
                    updated[lastIdx] = {
                      ...updated[lastIdx],
                      content: updated[lastIdx].content + `\n\n*${parsed.info}*`
                    };
                  }
                  return updated;
                });
              } else if (parsed.error) {
                throw new Error(parsed.error);
              }
            } catch (e) {
              if (e.message && !e.message.includes('JSON')) {
                throw e;
              }
            }
          }
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        console.log('Stream aborted by user');
        return;
      }
      console.error('Stream error', err);
      let displayError = err.message || 'An unexpected error occurred';
      if (
        displayError.includes('503') ||
        displayError.includes('high demand') ||
        displayError.includes('UNAVAILABLE') ||
        displayError.includes('Service Unavailable')
      ) {
        displayError = 'Google Gemini is temporarily experiencing high demand (503 Service Unavailable). Please try again in a few moments or click Regenerate.';
      }
      setMessages((prev) => {
        const newMsgs = [...prev];
        if (newMsgs.length > 0) {
          newMsgs[newMsgs.length - 1].content = displayError.startsWith('Error:') ? displayError : 'Error: ' + displayError;
        }
        return newMsgs;
      });
    } finally {
      setIsStreaming(false);
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMsg = { role: 'user', content: input };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');

    let activeChatId = currentChatId;

    if (!activeChatId) {
      try {
        const res = await fetch(`${API_BASE_URL}/api/chats`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: input.slice(0, 30) })
        });
        const newChat = await res.json();
        activeChatId = newChat.id;
        setCurrentChatId(activeChatId);
        setChats(prev => [newChat, ...prev]);
      } catch (err) {
        console.error("Failed to create chat", err);
        return;
      }
    }

    await streamResponse(userMsg.content, activeChatId);
  };

  const handleVoiceMessage = async (spokenText, onChunk, interruptedContext = null) => {
    if (!spokenText.trim()) return '';

    const userMsg = { role: 'user', content: spokenText };
    setMessages((prev) => [...prev, userMsg]);

    let activeChatId = currentChatId;

    setIsLoading(true);
    setIsStreaming(true);

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

    try {
      // Direct conversational voice instruction prompt with mode='voice' and optional interruption context
      const response = await fetch(`${API_BASE_URL}/api/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: spokenText,
          chat_id: activeChatId || undefined,
          mode: 'voice',
          model: selectedModel
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error('Server response error');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let streamed = '';
      let sseBuffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split('\n');
        sseBuffer = lines.pop(); // Keep partial line across chunks

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (trimmedLine.startsWith('data: ')) {
            const data = trimmedLine.slice(6).trim();
            if (data === '[DONE]') {
              setIsStreaming(false);
              setIsLoading(false);
              abortControllerRef.current = null;
              if (onChunk) onChunk(null, streamed, true);
              fetchChats();
              return streamed;
            }
            try {
              const parsed = JSON.parse(data);
              if (parsed.chat_id && !currentChatId) {
                setCurrentChatId(parsed.chat_id);
              }
              if (parsed.error) {
                console.error('Server error received in voice stream:', parsed.error);
                streamed = parsed.error;
                setMessages((prev) => {
                  const updated = [...prev];
                  if (updated.length > 0) {
                    updated[updated.length - 1].content = parsed.error;
                  }
                  return updated;
                });
                if (onChunk) onChunk(null, parsed.error, true);
                return parsed.error;
              }
              if (parsed.text) {
                const newToken = parsed.text;
                streamed += newToken;
                if (onChunk) onChunk(newToken, streamed, false);
                setMessages((prev) => {
                  const updated = [...prev];
                  if (updated.length > 0) {
                    const lastIdx = updated.length - 1;
                    updated[lastIdx] = {
                      ...updated[lastIdx],
                      content: updated[lastIdx].content + newToken
                    };
                  }
                  return updated;
                });
              }
            } catch (e) {}
          }
        }
      }
      if (onChunk) onChunk(null, streamed, true);
      return streamed;
    } catch (err) {
      if (err.name === 'AbortError' || err.name === 'DOMException' || String(err).toLowerCase().includes('abort')) {
        console.log('Voice stream aborted cleanly by user');
        return '';
      }
      console.error('Voice stream error:', err);
      setMessages((prev) => {
        const newMsgs = [...prev];
        if (newMsgs.length > 0) {
          newMsgs[newMsgs.length - 1].content = "Connection lost. Try speaking again.";
        }
        return newMsgs;
      });
      return "Connection lost. Try speaking again.";
    } finally {
      setIsStreaming(false);
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleAbortStream = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
    setIsLoading(false);
  };


  const handleSuggestionClick = (suggestion) => {
    setInput(suggestion);
  };

  // Settings handlers
  const handleClearHistory = async () => {
    toast((t) => (
      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium text-white">Clear all chat history?</p>
        <p className="text-xs text-gray-400">This action cannot be undone.</p>
        <div className="flex gap-2">
          <button
            onClick={async () => {
              toast.dismiss(t.id);
              const loadingToast = toast.loading('Clearing history...');
              try {
                // Delete all chats
                for (const chat of chats) {
                  await fetch(`${API_BASE_URL}/api/chats/${chat.id}`, { method: 'DELETE' });
                }
                setChats([]);
                setCurrentChatId(null);
                setMessages([]);
                toast.dismiss(loadingToast);
                toast.success('History cleared', {
                  style: {
                    background: '#1E1E1E',
                    color: '#fff',
                    border: '1px solid rgba(255,255,255,0.1)'
                  }
                });
              } catch (error) {
                console.error('Failed to clear history:', error);
                toast.dismiss(loadingToast);
                toast.error('Failed to clear history');
              }
            }}
            className="bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          >
            Delete All
          </button>
          <button
            onClick={() => toast.dismiss(t.id)}
            className="bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    ), {
      duration: 6000,
      position: 'bottom-center',
      style: {
        background: '#2A2A2A',
        border: '1px solid rgba(255,255,255,0.1)',
        padding: '16px',
        borderRadius: '12px',
      },
    });
  };

  const handleExportData = () => {
    const exportData = {
      chats: chats,
      exportDate: new Date().toISOString(),
      version: '1.0.0'
    };

    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `gabby-export-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const requestNotificationPermission = async () => {
    if ('Notification' in window && Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      setDesktopNotifications(permission === 'granted');
    } else if (Notification.permission === 'granted') {
      setDesktopNotifications(true);
    }
  };


  const toggleTool = (toolName) => {
    setTools(prev => ({ ...prev, [toolName]: !prev[toolName] }));
  };

  // Authentic 4-point Google Gemini Sparkle Star SVG
  const GeminiSparkle = ({ className = "w-5 h-5", animated = false }) => (
    <svg
      viewBox="0 0 28 28"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`${className} ${animated ? 'gemini-sparkle-active' : ''}`}
    >
      <defs>
        <linearGradient id="gemini-sparkle-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#4E80EE" />
          <stop offset="35%" stopColor="#70CFFF" />
          <stop offset="70%" stopColor="#9B72CF" />
          <stop offset="100%" stopColor="#E275AA" />
        </linearGradient>
      </defs>
      <path
        d="M14 0C14 7.732 7.732 14 0 14C7.732 14 14 20.268 14 28C14 20.268 20.268 14 28 14C20.268 14 14 7.732 14 0Z"
        fill="url(#gemini-sparkle-grad)"
      />
    </svg>
  );

  // Gemini Signature Shimmer Response Animation
  const GeminiThinkingAnimation = () => (
    <div className="flex flex-col gap-2.5 py-1 text-left">
      <div className="flex items-center gap-2 mb-0.5">
        <span className="gemini-thinking-text">
          <span className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-[#4E80EE] to-[#E275AA] animate-ping" />
          Gabby is thinking...
        </span>
      </div>
      <div className="gemini-shimmer-card">
        <div className="gemini-shimmer-bar" />
        <div className="gemini-shimmer-bar" />
        <div className="gemini-shimmer-bar" />
      </div>
    </div>
  );

  const renderMessageActions = (msg, index) => {
    if (msg.role !== 'assistant') return null;
    const isLiked = ratings[index] === 'like';
    const isDisliked = ratings[index] === 'dislike';
    const isSpeaking = speakingIndex === index;

    return (
      <div className="flex items-center gap-1.5 pt-2 opacity-95 transition-opacity">
        {/* Copy Response Button */}
        <button
          onClick={() => copyToClipboard(msg.content, index)}
          className="p-1.5 px-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors text-xs flex items-center gap-1 border border-transparent hover:border-white/10"
          title="Copy response"
        >
          {copiedIndex === index ? (
            <>
              <Check size={14} className="text-emerald-400" />
              <span className="text-[11px] text-emerald-400 font-medium">Copied!</span>
            </>
          ) : (
            <>
              <Copy size={14} />
              <span className="text-[11px] hidden sm:inline">Copy</span>
            </>
          )}
        </button>

        {/* Read Aloud / TTS Button */}
        <button
          onClick={() => toggleSpeech(index, msg.content)}
          className={`p-1.5 px-2 rounded-lg text-xs flex items-center gap-1.5 transition-colors border ${
            isSpeaking
              ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40'
              : 'text-gray-400 hover:text-white hover:bg-white/10 border-transparent hover:border-white/10'
          }`}
          title={isSpeaking ? 'Stop speaking' : 'Read aloud'}
        >
          {isSpeaking ? (
            <>
              <div className="flex items-center gap-0.5 h-3">
                <span className="sound-wave-bar" />
                <span className="sound-wave-bar" />
                <span className="sound-wave-bar" />
              </div>
              <VolumeX size={14} />
              <span className="text-[11px] hidden sm:inline">Stop</span>
            </>
          ) : (
            <>
              <Volume2 size={14} />
              <span className="text-[11px] hidden sm:inline">Listen</span>
            </>
          )}
        </button>

        {/* Thumbs Up (Good Response) */}
        <button
          onClick={() => handleRate(index, 'like')}
          className={`p-1.5 rounded-lg text-xs transition-colors border ${
            isLiked
              ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40'
              : 'text-gray-400 hover:text-white hover:bg-white/10 border-transparent hover:border-white/10'
          }`}
          title="Good response"
        >
          <ThumbsUp size={14} className={isLiked ? 'fill-cyan-400' : ''} />
        </button>

        {/* Thumbs Down (Bad Response) */}
        <button
          onClick={() => handleRate(index, 'dislike')}
          className={`p-1.5 rounded-lg text-xs transition-colors border ${
            isDisliked
              ? 'bg-rose-500/20 text-rose-400 border-rose-500/40'
              : 'text-gray-400 hover:text-white hover:bg-white/10 border-transparent hover:border-white/10'
          }`}
          title="Bad response"
        >
          <ThumbsDown size={14} className={isDisliked ? 'fill-rose-400' : ''} />
        </button>

        {/* Regenerate Button */}
        <button
          onClick={() => regenerateMessage(index)}
          className="p-1.5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors border border-transparent hover:border-white/10"
          title="Regenerate response"
        >
          <RotateCcw size={14} />
        </button>
      </div>
    );
  };

  const SuggestionCard = ({ icon: Icon, title, description }) => (
    <button
      onClick={() => handleSuggestionClick(description)}
      className="p-4 rounded-2xl bg-[#1e1f20] hover:bg-[#282a2c] text-left transition-all border border-white/5 hover:border-white/10 group cursor-pointer flex flex-col justify-between h-[150px] shadow-sm relative overflow-hidden"
    >
      <div>
        <h3 className="text-sm font-medium text-[#e3e3e3] mb-1 group-hover:text-white transition-colors">{title}</h3>
        <p className="text-xs text-[#c4c7c5] line-clamp-2 leading-relaxed">{description}</p>
      </div>
      <div className="flex justify-end mt-auto">
        <div className="w-8 h-8 rounded-full bg-[#131314] flex items-center justify-center text-[#e3e3e3] group-hover:scale-110 group-hover:text-white transition-all border border-white/5">
          <Icon size={15} />
        </div>
      </div>
    </button>
  );

  const ToolCard = ({ icon: Icon, name, description, enabled, onToggle }) => (
    <div className="p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-green-500/20 to-emerald-500/20 flex items-center justify-center">
            <Icon size={16} className="text-green-400" />
          </div>
          <div>
            <h4 className="text-sm font-medium text-white">{name}</h4>
          </div>
        </div>
        <div
          className={`toggle-switch ${enabled ? 'active' : ''}`}
          onClick={onToggle}
        />
      </div>
      <p className="text-xs text-gray-400 ml-11">{description}</p>
    </div>
  );

  return (
    <div className="flex h-screen bg-[var(--color-background-dark)] text-[var(--color-text-light)] overflow-hidden font-sans">
      <Toaster />
      {/* Left Sidebar */}
      <aside className={`${isSidebarOpen ? 'w-[260px]' : 'w-[56px]'} bg-[#1e1f20] transition-all duration-300 ease-in-out flex flex-col border-r border-[#282a2c] relative shrink-0`}>
        {isSidebarOpen ? (
          <>
            {/* Sidebar Header - Full */}
            <div className="flex items-center justify-between p-3 border-b border-white/5">
              <button
                onClick={() => setIsSidebarOpen(false)}
                className="p-2 hover:bg-[#282a2c] rounded-full text-[#c4c7c5] hover:text-white transition-colors"
              >
                <Menu size={20} />
              </button>
              <button
                onClick={() => setIsSearchOpen(true)}
                className="p-2 hover:bg-[#282a2c] rounded-full text-[#c4c7c5] hover:text-white transition-colors"
                title="Search chats"
              >
                <Search size={18} />
              </button>
            </div>

            {/* New Chat Button - Full */}
            <div className="p-3">
              <button
                onClick={createNewChat}
                className="w-full flex items-center gap-3 px-4 py-2.5 rounded-full bg-[#131314] hover:bg-[#282a2c] transition-all text-sm font-medium text-left text-[#e3e3e3] hover:text-white border border-white/5 shadow-sm"
              >
                <Plus size={18} className="text-[#4E80EE]" />
                <span>New chat</span>
              </button>
            </div>

            {/* Chat Sections - Full */}
            <div className="flex-1 overflow-y-auto px-2 space-y-4 custom-scrollbar">
              {/* My Stuff Section */}
              <div>
                <button
                  onClick={() => setIsMyStuffOpen(true)}
                  className="w-full flex items-center justify-between px-3 py-2 text-sm text-[#c4c7c5] hover:text-white hover:bg-[#282a2c]/60 rounded-xl transition-colors"
                >
                  <span className="font-medium text-xs">My Stuff</span>
                  <ChevronRight size={15} />
                </button>
              </div>

              {/* Gems Section */}
              <div>
                <button
                  onClick={() => setIsGemsOpen(true)}
                  className="w-full flex items-center justify-between px-3 py-2 text-sm text-[#c4c7c5] hover:text-white hover:bg-[#282a2c]/60 rounded-xl transition-colors"
                >
                  <span className="font-medium text-xs">Gems</span>
                  <ChevronRight size={15} />
                </button>
              </div>

              {/* Chats Section */}
              <div>
                <div className="px-3 py-1.5 text-xs font-medium text-[#8e918f]">Recent</div>
                <div className="space-y-1">
                  {chats.map((chat) => (
                    <div key={chat.id} className="group relative">
                      <button
                        onClick={() => loadChat(chat.id)}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-full transition-all text-sm text-left truncate ${
                          currentChatId === chat.id
                            ? 'bg-[#282a2c] text-white font-medium'
                            : 'text-[#c4c7c5] hover:bg-[#282a2c]/60 hover:text-white'
                        }`}
                      >
                        <MessageSquare size={14} className="text-[#8e918f] shrink-0" />
                        <span className="truncate flex-1 text-[13.5px]">{chat.title || 'New Chat'}</span>
                      </button>
                      <button
                        onClick={(e) => deleteChat(e, chat.id)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-[#8e918f] hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity rounded-full hover:bg-white/5"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Settings & Install Footer - Full */}
            <div className="p-3 border-t border-white/5 space-y-1">
              {!isAppInstalled && (
                <button
                  onClick={handleInstallApp}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-full hover:bg-[#282a2c] transition-colors text-sm text-left text-[#70CFFF] hover:text-white group cursor-pointer"
                >
                  <Download size={18} className="text-[#70CFFF] group-hover:scale-110 transition-transform" />
                  <span className="text-xs font-medium">Install Gabby App</span>
                </button>
              )}
              <button
                onClick={() => setIsSettingsOpen(true)}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-full hover:bg-[#282a2c] transition-colors text-sm text-left text-[#c4c7c5] hover:text-white cursor-pointer"
              >
                <Settings size={18} />
                <span className="text-xs">Settings & help</span>
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Collapsed Sidebar - Icon Rail */}
            <div className="flex flex-col items-center py-3 space-y-2">
              <button
                onClick={() => setIsSidebarOpen(true)}
                className="p-3 hover:bg-[#282a2c] rounded-full text-[#c4c7c5] hover:text-white transition-colors cursor-pointer"
                title="Expand sidebar"
              >
                <Menu size={20} />
              </button>
              <button
                onClick={createNewChat}
                className="p-3 hover:bg-[#282a2c] rounded-full text-[#4E80EE] hover:text-white transition-colors cursor-pointer"
                title="New chat"
              >
                <Plus size={20} />
              </button>
            </div>

            {/* Settings & Install Icons at Bottom */}
            <div className="mt-auto flex flex-col items-center py-3 border-t border-white/5 space-y-1">
              {!isAppInstalled && (
                <button
                  onClick={handleInstallApp}
                  className="p-3 hover:bg-[#282a2c] rounded-full text-[#70CFFF] hover:text-white transition-colors cursor-pointer"
                  title="Install Gabby App"
                >
                  <Download size={20} />
                </button>
              )}
              <button
                onClick={() => setIsSettingsOpen(true)}
                className="p-3 hover:bg-[#282a2c] rounded-full text-[#c4c7c5] hover:text-white transition-colors cursor-pointer"
                title="Settings & help"
              >
                <Settings size={20} />
              </button>
            </div>
          </>
        )}
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full relative min-w-0 bg-[#131314]">
        {/* Header */}
        <header className="h-14 flex items-center px-4 justify-between bg-[#131314] border-b border-white/5 z-10">
          <div className="flex items-center gap-3">
            {!isSidebarOpen && (
              <button
                onClick={() => setIsSidebarOpen(true)}
                className="p-2 hover:bg-[#1e1f20] rounded-full text-[#c4c7c5] hover:text-white transition-colors"
                title="Open sidebar"
              >
                <Menu size={20} />
              </button>
            )}
            <div className="flex items-center gap-2.5">
              <GeminiSparkle className="w-6 h-6" />
              <span className="text-xl font-medium tracking-tight text-[#e3e3e3]">
                Gabby
              </span>
              <span className="text-xs text-[#8e918f] bg-[#1e1f20] px-2.5 py-0.5 rounded-full border border-white/5 ml-1 font-mono">
                3.8 Flash
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Install Gabby PWA App Button */}
            {!isAppInstalled && (
              <button
                type="button"
                onClick={handleInstallApp}
                className="px-3 py-1.5 rounded-full bg-[#1e1f20] hover:bg-[#282a2c] border border-[#70CFFF]/40 hover:border-[#70CFFF]/70 text-[#70CFFF] hover:text-white text-xs font-medium flex items-center gap-1.5 transition-all shadow-sm group cursor-pointer"
                title="Install Gabby as a standalone App"
              >
                <Download size={14} className="text-[#70CFFF] group-hover:scale-110 transition-transform" />
                <span className="hidden sm:inline">Install App</span>
              </button>
            )}

            {/* Live Voice Mode Button */}
            <button
              type="button"
              onClick={() => setIsVoiceModeOpen(true)}
              className="px-3.5 py-1.5 rounded-full bg-gradient-to-r from-[#4E80EE]/15 via-[#9B72CF]/15 to-[#E275AA]/15 hover:from-[#4E80EE]/25 hover:via-[#9B72CF]/25 hover:to-[#E275AA]/25 border border-[#4E80EE]/30 hover:border-[#9B72CF]/50 text-[#e3e3e3] text-xs font-medium flex items-center gap-1.5 transition-all shadow-sm group cursor-pointer"
              title="Start Live Voice Conversation"
            >
              <Mic size={14} className="text-[#70CFFF] group-hover:scale-110 transition-transform" />
              <span>Voice Mode</span>
            </button>
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#4E80EE] via-[#9B72CF] to-[#E275AA] flex items-center justify-center text-sm font-semibold text-white shadow-md">
              G
            </div>
          </div>
        </header>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto scroll-smooth relative">
          {messages.length === 0 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-4 sm:p-6 overflow-y-auto custom-scrollbar">
              <div className="max-w-4xl w-full flex flex-col items-start space-y-8 animate-fade-in my-auto">
                {/* Gemini Signature Heading */}
                <div className="space-y-1 text-left px-2">
                  <h1 className="text-4xl sm:text-5xl md:text-6xl font-medium tracking-tight bg-gradient-to-r from-[#4E80EE] via-[#9B72CF] to-[#E275AA] bg-clip-text text-transparent">
                    Hello, Gabriel
                  </h1>
                  <h2 className="text-3xl sm:text-4xl md:text-5xl font-medium text-[#757775]">
                    How can I help you today?
                  </h2>
                </div>

                {/* Gemini 4 Suggestion Cards in a Row / Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 w-full">
                  <SuggestionCard
                    icon={FileText}
                    title="Help me write"
                    description="a professional thank-you email after a job interview"
                  />
                  <SuggestionCard
                    icon={Sparkles}
                    title="Brainstorm ideas"
                    description="for a modern high-performance AI web application"
                  />
                  <SuggestionCard
                    icon={HelpCircle}
                    title="Explain a concept"
                    description="how neural networks understand natural language"
                  />
                  <SuggestionCard
                    icon={Code}
                    title="Code & debug"
                    description="write a python script to parse and organize files"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto w-full pb-36 pt-6 px-4 md:px-0">
              {messages.map((msg, index) => (
                <div
                  key={index}
                  className={`group flex gap-3.5 md:gap-4 mb-6 md:mb-8 transition-all ${
                    msg.role === 'assistant' ? 'items-start' : 'items-start flex-row-reverse'
                  }`}
                >
                  {/* Avatar */}
                  <div className="relative shrink-0 mt-0.5">
                    {msg.role === 'assistant' ? (
                      <div className="w-8 h-8 md:w-9 md:h-9 flex items-center justify-center">
                        <GeminiSparkle
                          className="w-6 h-6 md:w-7 md:h-7"
                          animated={isLoading && !msg.content && index === messages.length - 1}
                        />
                      </div>
                    ) : (
                      <div className="w-8 h-8 md:w-9 md:h-9 rounded-full bg-[#282a2c] border border-white/5 flex items-center justify-center text-[#e3e3e3] shadow-sm">
                        <User size={16} />
                      </div>
                    )}
                  </div>

                  {/* Message Content Container */}
                  <div className={`flex-1 max-w-[88%] md:max-w-[82%] space-y-1.5 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                    {msg.role === 'user' ? (
                      /* User Message Bubble */
                      editingIndex === index ? (
                        /* Inline Edit Form */
                        <div className="bg-[#1e1f20] border border-[#4E80EE]/50 rounded-2xl p-3.5 shadow-xl text-left">
                          <textarea
                            className="w-full bg-transparent text-[#e3e3e3] text-sm focus:outline-none resize-none min-h-[70px] placeholder-[#8e918f] font-sans"
                            value={editingText}
                            onChange={(e) => setEditingText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSaveAndSubmitEdit(index);
                              }
                            }}
                            autoFocus
                          />
                          <div className="flex justify-end items-center gap-2 mt-2 pt-2 border-t border-white/10">
                            <span className="text-[11px] text-[#8e918f] mr-auto">Press Enter to save, Shift+Enter for newline</span>
                            <button
                              type="button"
                              onClick={handleCancelEdit}
                              className="px-3 py-1.5 rounded-lg text-xs font-medium text-[#c4c7c5] hover:text-white hover:bg-white/10 transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSaveAndSubmitEdit(index)}
                              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gradient-to-r from-[#4E80EE] to-[#9B72CF] hover:opacity-95 text-white font-semibold transition-all shadow flex items-center gap-1"
                            >
                              <Check size={13} />
                              Save & Submit
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* Display User Bubble */
                        <div className="inline-flex flex-col items-end group/user">
                          <div className="inline-block text-[15px] leading-relaxed bg-[#282a2c] text-[#e3e3e3] rounded-3xl rounded-tr-sm px-5 py-3 border border-white/5 shadow-sm">
                            <p className="whitespace-pre-wrap text-left">{msg.content}</p>
                          </div>
                          {/* User action buttons on hover */}
                          <div className="opacity-0 group-hover/user:opacity-100 transition-opacity mt-1 flex items-center gap-1">
                            <button
                              onClick={() => handleStartEdit(index, msg.content)}
                              className="flex items-center gap-1 text-xs text-[#8e918f] hover:text-[#70CFFF] px-2 py-1 rounded-md hover:bg-white/5 transition-colors"
                              title="Edit message"
                            >
                              <Pencil size={12} />
                              <span>Edit</span>
                            </button>
                            <button
                              onClick={() => copyToClipboard(msg.content, index)}
                              className="text-xs text-[#8e918f] hover:text-white px-2 py-1 rounded-md hover:bg-white/5 transition-colors"
                              title="Copy text"
                            >
                              <Copy size={12} />
                            </button>
                          </div>
                        </div>
                      )
                    ) : (
                      /* Assistant Message */
                      <div className="text-left space-y-2">
                        <div className="prose-chat text-[#e3e3e3] leading-relaxed">
                          {msg.content ? (
                            <>
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={{
                                  pre: ({ children }) => <>{children}</>,
                                  code({ node, inline, className, children, ...props }) {
                                    return !inline ? (
                                      <CodeBlock className={className} {...props}>
                                        {children}
                                      </CodeBlock>
                                    ) : (
                                      <code className="bg-[#282a2c] px-1.5 py-0.5 rounded-md text-sm font-mono text-[#70CFFF]" {...props}>
                                        {children}
                                      </code>
                                    );
                                  }
                                }}
                              >
                                {msg.content}
                              </ReactMarkdown>
                              {isStreaming && index === messages.length - 1 && (
                                <span className="streaming-cursor" title="Streaming..." />
                              )}
                            </>
                          ) : (
                            /* Gemini Signature Response Shimmer Animation */
                            <GeminiThinkingAnimation />
                          )}
                        </div>

                        {/* Action buttons (Copy, Listen/TTS, Thumbs Up/Down, Regenerate) */}
                        {msg.content && renderMessageActions(msg, index)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area (Gemini Floating Pill) */}
        <div className={`absolute bottom-0 left-0 w-full bg-gradient-to-t from-[#131314] via-[#131314]/95 to-transparent px-4 ${isMobile ? 'mobile-input-container pb-3' : 'pt-8 pb-5'}`}>
          <div className="max-w-3xl mx-auto w-full relative">
            <form onSubmit={handleSubmit} className="relative bg-[#1e1f20] rounded-[28px] border border-[#282a2c] focus-within:border-white/20 transition-all shadow-2xl">
              <div className="flex items-end gap-2 px-4 py-2.5">
                {/* Plus button for attachments */}
                <button
                  type="button"
                  onClick={() => setIsAttachmentOpen(!isAttachmentOpen)}
                  className="p-2 hover:bg-[#282a2c] rounded-full text-[#c4c7c5] hover:text-white transition-colors mb-0.5"
                  title="Add attachment"
                >
                  <Plus size={20} />
                </button>

                {/* Auto-expanding Input textarea */}
                <textarea
                  rows={1}
                  placeholder="Ask Gabby..."
                  className="flex-1 bg-transparent text-[#e3e3e3] focus:outline-none placeholder-[#8e918f] text-sm py-2 resize-none max-h-36 custom-scrollbar"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSubmit(e);
                    }
                  }}
                  disabled={isLoading && !isStreaming}
                />

                {/* Right side buttons */}
                <div className="flex items-center gap-1.5 mb-0.5">
                  {/* Tools button */}
                  <button
                    type="button"
                    onClick={() => setIsToolsOpen(!isToolsOpen)}
                    className="px-2.5 py-1.5 hover:bg-[#282a2c] rounded-full text-[#c4c7c5] hover:text-white transition-colors flex items-center gap-1.5 text-xs font-medium"
                    title="Tools"
                  >
                    <Zap size={14} className="text-[#4E80EE]" />
                    <span className="hidden sm:inline">Tools</span>
                  </button>

                  {/* Model selector */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setIsModelSelectorOpen(!isModelSelectorOpen)}
                      className="px-2.5 py-1.5 hover:bg-[#282a2c] rounded-full text-[#c4c7c5] hover:text-white transition-colors flex items-center gap-1 text-xs font-medium bg-[#131314]/60 border border-white/5"
                      title="Select model"
                    >
                      <span className="text-[11px] font-medium">
                        {selectedModel === 'fast'
                          ? 'Gemini 3.5 Flash Lite'
                          : selectedModel === 'advanced'
                          ? 'Gemini 3.7 Flash'
                          : 'Gemini 3.8 Flash'}
                      </span>
                      <ChevronDown size={13} />
                    </button>

                    {/* Model selector dropdown */}
                    {isModelSelectorOpen && (
                      <div className="absolute bottom-full right-0 mb-2 w-64 bg-[#1e1f20] border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50 p-1.5 space-y-1">
                        <button
                          onClick={() => {
                            setSelectedModel('standard');
                            setIsModelSelectorOpen(false);
                          }}
                          className={`w-full text-left px-3 py-2 rounded-xl transition-colors ${
                            selectedModel === 'standard' ? 'bg-[#4E80EE]/20 text-[#70CFFF] border border-[#4E80EE]/30' : 'text-[#c4c7c5] hover:bg-[#282a2c]'
                          }`}
                        >
                          <div className="font-semibold text-xs flex items-center gap-1.5">
                            <span>Gemini 3.8 Flash</span>
                            <span className="text-[10px] bg-[#4E80EE]/20 text-[#70CFFF] px-1.5 py-0.5 rounded-full font-mono">⚡ Ultra Fast & Smart</span>
                          </div>
                          <div className="text-[11px] text-[#8e918f] mt-0.5">Top-speed 1.0s response & exceptional intelligence</div>
                        </button>
                        <button
                          onClick={() => {
                            setSelectedModel('advanced');
                            setIsModelSelectorOpen(false);
                          }}
                          className={`w-full text-left px-3 py-2 rounded-xl transition-colors ${
                            selectedModel === 'advanced' ? 'bg-[#E275AA]/20 text-pink-300 border border-[#E275AA]/30' : 'text-[#c4c7c5] hover:bg-[#282a2c]'
                          }`}
                        >
                          <div className="font-semibold text-xs flex items-center gap-1.5">
                            <span>Gemini 3.7 Flash</span>
                            <span className="text-[10px] bg-[#E275AA]/20 text-pink-300 px-1.5 py-0.5 rounded-full font-mono">🧠 Advanced</span>
                          </div>
                          <div className="text-[11px] text-[#8e918f] mt-0.5">Deep reasoning and complex queries</div>
                        </button>
                        <button
                          onClick={() => {
                            setSelectedModel('fast');
                            setIsModelSelectorOpen(false);
                          }}
                          className={`w-full text-left px-3 py-2 rounded-xl transition-colors ${
                            selectedModel === 'fast' ? 'bg-[#9B72CF]/20 text-purple-300 border border-[#9B72CF]/30' : 'text-[#c4c7c5] hover:bg-[#282a2c]'
                          }`}
                        >
                          <div className="font-semibold text-xs flex items-center gap-1.5">
                            <span>Gemini 3.5 Flash Lite</span>
                            <span className="text-[10px] bg-[#9B72CF]/20 text-purple-300 px-1.5 py-0.5 rounded-full font-mono">⚡ Instant Voice</span>
                          </div>
                          <div className="text-[11px] text-[#8e918f] mt-0.5">Sub-second immediate answers & instant voice</div>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Live Voice Button (Opens untouched VoiceModeModal) */}
                  <button
                    type="button"
                    onClick={() => setIsVoiceModeOpen(true)}
                    className="p-2 hover:bg-[#282a2c] rounded-full text-[#c4c7c5] hover:text-white transition-colors flex items-center justify-center"
                    title="Start Live Voice Conversation"
                  >
                    <Mic size={18} />
                  </button>

                  {/* Send or Stop button */}
                  {isStreaming ? (
                    <button
                      type="button"
                      onClick={stopGeneration}
                      className="p-2 bg-white text-[#131314] hover:bg-gray-200 rounded-full transition-all shadow-md flex items-center justify-center"
                      title="Stop generation"
                    >
                      <Square size={14} className="fill-current" />
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={!input.trim() || isLoading}
                      className={`p-2 rounded-full transition-all flex items-center justify-center ${
                        input.trim() && !isLoading
                          ? 'bg-white text-[#131314] hover:bg-gray-200 shadow-md scale-100 hover:scale-105 active:scale-95'
                          : 'bg-white/5 text-[#8e918f] cursor-not-allowed'
                      }`}
                      title="Send message"
                    >
                      <Send size={16} />
                    </button>
                  )}
                </div>
              </div>
            </form>
            <div className="text-center mt-2 flex items-center justify-center gap-2">
              <p className="text-[11px] text-[#8e918f]">Gabby may display inaccurate info, including about people, so double-check its responses.</p>
            </div>
          </div>
        </div>
      </main>

      {/* My Stuff Panel */}
      {isMyStuffOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setIsMyStuffOpen(false)}
          />

          {/* Panel */}
          <div className="relative w-full max-w-md h-full bg-[#1E1E1E] shadow-2xl animate-slide-in flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <div className="flex items-center gap-3">
                <Folder size={20} className="text-blue-400" />
                <h2 className="text-lg font-semibold text-white">My Stuff</h2>
              </div>
              <button
                onClick={() => setIsMyStuffOpen(false)}
                className="p-2 hover:bg-white/5 rounded-lg text-gray-400 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
              {/* Saved Conversations Section */}
              <div>
                <h3 className="text-sm font-medium text-gray-400 mb-3 flex items-center gap-2">
                  <Star size={16} />
                  Saved Conversations
                </h3>
                <div className="space-y-2">
                  {chats.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <Bookmark size={32} className="mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No saved conversations yet</p>
                      <p className="text-xs mt-1">Star your favorite chats to save them here</p>
                    </div>
                  ) : (
                    chats.slice(0, 5).map((chat) => (
                      <button
                        key={chat.id}
                        onClick={() => {
                          loadChat(chat.id);
                          setIsMyStuffOpen(false);
                        }}
                        className="w-full p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-left group"
                      >
                        <div className="flex items-start gap-3">
                          <MessageSquare size={16} className="text-gray-400 mt-0.5 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-white truncate">{chat.title || 'Untitled Chat'}</p>
                            <p className="text-xs text-gray-500 mt-1">Recent conversation</p>
                          </div>
                          <ChevronRight size={16} className="text-gray-500 group-hover:text-white transition-colors" />
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>

              {/* Collections Section */}
              <div>
                <h3 className="text-sm font-medium text-gray-400 mb-3 flex items-center gap-2">
                  <Folder size={16} />
                  Collections
                </h3>
                <div className="text-center py-6 text-gray-500">
                  <p className="text-sm">No collections yet</p>
                  <p className="text-xs mt-1">Organize your chats into collections</p>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-white/10">
              <button className="w-full px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors">
                Create Collection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Gems Panel */}
      {isGemsOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setIsGemsOpen(false)}
          />

          {/* Panel */}
          <div className="relative w-full max-w-md h-full bg-[#1E1E1E] shadow-2xl animate-slide-in flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <div className="flex items-center gap-3">
                <Gem size={20} className="text-purple-400" />
                <h2 className="text-lg font-semibold text-white">Gems</h2>
              </div>
              <button
                onClick={() => setIsGemsOpen(false)}
                className="p-2 hover:bg-white/5 rounded-lg text-gray-400 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
              <p className="text-sm text-gray-400 mb-4">Custom AI assistants with specialized expertise</p>

              {/* Gem Cards */}
              <button className="w-full p-4 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/30 hover:border-purple-400/50 transition-all text-left group">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shrink-0">
                    <Code size={20} className="text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-white font-medium mb-1">Code Expert</h3>
                    <p className="text-xs text-gray-400">Specialized in programming, debugging, and code reviews</p>
                  </div>
                </div>
              </button>

              <button className="w-full p-4 rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border border-blue-500/30 hover:border-blue-400/50 transition-all text-left group">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shrink-0">
                    <FileText size={20} className="text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-white font-medium mb-1">Writing Assistant</h3>
                    <p className="text-xs text-gray-400">Expert in creative writing, editing, and content creation</p>
                  </div>
                </div>
              </button>

              <button className="w-full p-4 rounded-xl bg-gradient-to-br from-green-500/20 to-emerald-500/20 border border-green-500/30 hover:border-green-400/50 transition-all text-left group">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center shrink-0">
                    <Calculator size={20} className="text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-white font-medium mb-1">Math Tutor</h3>
                    <p className="text-xs text-gray-400">Helps with math problems, explanations, and learning</p>
                  </div>
                </div>
              </button>

              <button className="w-full p-4 rounded-xl bg-gradient-to-br from-orange-500/20 to-red-500/20 border border-orange-500/30 hover:border-orange-400/50 transition-all text-left group">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center shrink-0">
                    <Sparkles size={20} className="text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-white font-medium mb-1">Creative Brainstormer</h3>
                    <p className="text-xs text-gray-400">Generates ideas, concepts, and creative solutions</p>
                  </div>
                </div>
              </button>

              <button className="w-full p-4 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 hover:border-indigo-400/50 transition-all text-left group">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center shrink-0">
                    <Search size={20} className="text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-white font-medium mb-1">Research Assistant</h3>
                    <p className="text-xs text-gray-400">Helps with research, fact-checking, and analysis</p>
                  </div>
                </div>
              </button>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-white/10">
              <button className="w-full px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2">
                <Plus size={16} />
                Create Custom Gem
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings & Help Panel */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setIsSettingsOpen(false)}
          />

          {/* Panel */}
          <div className="relative w-full max-w-md h-full bg-[#1E1E1E] shadow-2xl animate-slide-in flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <div className="flex items-center gap-3">
                <Settings size={20} className="text-gray-400" />
                <h2 className="text-lg font-semibold text-white">Settings & help</h2>
              </div>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="p-2 hover:bg-white/5 rounded-lg text-gray-400 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
              {/* Appearance Section */}
              <div>
                <h3 className="text-sm font-medium text-gray-400 mb-3 flex items-center gap-2">
                  <Moon size={16} />
                  Appearance
                </h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors cursor-pointer" onClick={() => setDarkMode(!darkMode)}>
                    <div>
                      <p className="text-sm text-white">Dark mode</p>
                      <p className="text-xs text-gray-500 mt-0.5">{darkMode ? 'Currently enabled' : 'Currently disabled'}</p>
                    </div>
                    <div className={`toggle-switch ${darkMode ? 'active' : ''}`}></div>
                  </div>
                </div>
              </div>

              {/* Notifications Section */}
              <div>
                <h3 className="text-sm font-medium text-gray-400 mb-3 flex items-center gap-2">
                  <Bell size={16} />
                  Notifications
                </h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors cursor-pointer" onClick={() => { setDesktopNotifications(!desktopNotifications); if (!desktopNotifications) requestNotificationPermission(); }}>
                    <div>
                      <p className="text-sm text-white">Desktop notifications</p>
                      <p className="text-xs text-gray-500 mt-0.5">Get notified about responses</p>
                    </div>
                    <div className={`toggle-switch ${desktopNotifications ? 'active' : ''}`}></div>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors cursor-pointer" onClick={() => setSoundEffects(!soundEffects)}>
                    <div>
                      <p className="text-sm text-white">Sound effects</p>
                      <p className="text-xs text-gray-500 mt-0.5">Play sounds for actions</p>
                    </div>
                    <div className={`toggle-switch ${soundEffects ? 'active' : ''}`}></div>
                  </div>
                </div>
              </div>

              {/* Privacy Section */}
              <div>
                <h3 className="text-sm font-medium text-gray-400 mb-3 flex items-center gap-2">
                  <Shield size={16} />
                  Privacy & data
                </h3>
                <div className="space-y-2">
                  <button onClick={handleClearHistory} className="w-full p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-left">
                    <p className="text-sm text-white">Clear chat history</p>
                    <p className="text-xs text-gray-500 mt-0.5">Delete all conversations</p>
                  </button>
                  <button onClick={handleExportData} className="w-full p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-left">
                    <p className="text-sm text-white">Export data</p>
                    <p className="text-xs text-gray-500 mt-0.5">Download your conversations</p>
                  </button>
                </div>
              </div>

              {/* Help Section */}
              <div>
                <h3 className="text-sm font-medium text-gray-400 mb-3 flex items-center gap-2">
                  <HelpCircle size={16} />
                  Help & support
                </h3>
                <div className="space-y-2">
                  <button onClick={() => setShowDocumentation(true)} className="w-full p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-left flex items-center justify-between group">
                    <div>
                      <p className="text-sm text-white">Documentation</p>
                      <p className="text-xs text-gray-500 mt-0.5">Learn how to use Gabby</p>
                    </div>
                    <ChevronRight size={16} className="text-gray-500 group-hover:text-white transition-colors" />
                  </button>
                  <button onClick={() => setShowShortcuts(true)} className="w-full p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-left flex items-center justify-between group">
                    <div>
                      <p className="text-sm text-white">Keyboard shortcuts</p>
                      <p className="text-xs text-gray-500 mt-0.5">View all shortcuts</p>
                    </div>
                    <ChevronRight size={16} className="text-gray-500 group-hover:text-white transition-colors" />
                  </button>
                  <button onClick={() => setShowFeedback(true)} className="w-full p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-left flex items-center justify-between group">
                    <div>
                      <p className="text-sm text-white">Report an issue</p>
                      <p className="text-xs text-gray-500 mt-0.5">Send feedback or bug reports</p>
                    </div>
                    <ChevronRight size={16} className="text-gray-500 group-hover:text-white transition-colors" />
                  </button>
                </div>
              </div>

              {/* About Section */}
              <div>
                <h3 className="text-sm font-medium text-gray-400 mb-3 flex items-center gap-2">
                  <Info size={16} />
                  About
                </h3>
                <div className="p-3 rounded-lg bg-white/5">
                  <p className="text-sm text-white mb-1">Gabby AI Assistant</p>
                  <p className="text-xs text-gray-500">Version 1.0.0</p>
                  <p className="text-xs text-gray-500 mt-2">Built with React & Google Gemini API</p>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-white/10">
              <button className="w-full px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2">
                <LogOut size={16} />
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Documentation Modal */}
      {showDocumentation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-[#1E1E1E] rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-white/10">
              <h2 className="text-xl font-semibold text-white">Documentation</h2>
              <button onClick={() => setShowDocumentation(false)} className="p-2 hover:bg-white/5 rounded-lg text-gray-400 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[calc(80vh-80px)] custom-scrollbar">
              <div className="space-y-6 text-gray-300">
                <section>
                  <h3 className="text-lg font-semibold text-white mb-3">Getting Started</h3>
                  <p className="mb-2">Gabby is your AI assistant powered by Google's Gemini API. Here's how to get the most out of it:</p>
                  <ul className="list-disc list-inside space-y-1 ml-4">
                    <li>Type your question or request in the input box</li>
                    <li>Press Enter or click the send button</li>
                    <li>Gabby will respond in real-time with streaming responses</li>
                  </ul>
                </section>
                <section>
                  <h3 className="text-lg font-semibold text-white mb-3">Features</h3>
                  <ul className="list-disc list-inside space-y-1 ml-4">
                    <li><strong>Chat History:</strong> All your conversations are automatically saved</li>
                    <li><strong>Code Highlighting:</strong> Code blocks are syntax-highlighted for easy reading</li>
                    <li><strong>Copy & Regenerate:</strong> Easily copy responses or regenerate them</li>
                    <li><strong>Export Data:</strong> Download all your conversations as JSON</li>
                  </ul>
                </section>
                <section>
                  <h3 className="text-lg font-semibold text-white mb-3">Tips</h3>
                  <ul className="list-disc list-inside space-y-1 ml-4">
                    <li>Be specific with your questions for better responses</li>
                    <li>You can ask follow-up questions in the same chat</li>
                    <li>Use the sidebar to organize and access your chats</li>
                  </ul>
                </section>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Keyboard Shortcuts Modal */}
      {showShortcuts && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-[#1E1E1E] rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-white/10">
              <h2 className="text-xl font-semibold text-white">Keyboard Shortcuts</h2>
              <button onClick={() => setShowShortcuts(false)} className="p-2 hover:bg-white/5 rounded-lg text-gray-400 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[calc(80vh-80px)] custom-scrollbar">
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 rounded-lg bg-white/5">
                  <span className="text-gray-300">Send message</span>
                  <kbd className="px-3 py-1 bg-white/10 rounded text-sm text-white font-mono">Enter</kbd>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-white/5">
                  <span className="text-gray-300">New line in message</span>
                  <kbd className="px-3 py-1 bg-white/10 rounded text-sm text-white font-mono">Shift + Enter</kbd>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-white/5">
                  <span className="text-gray-300">New chat</span>
                  <kbd className="px-3 py-1 bg-white/10 rounded text-sm text-white font-mono">Ctrl + N</kbd>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-white/5">
                  <span className="text-gray-300">Toggle sidebar</span>
                  <kbd className="px-3 py-1 bg-white/10 rounded text-sm text-white font-mono">Ctrl + B</kbd>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-white/5">
                  <span className="text-gray-300">Focus input</span>
                  <kbd className="px-3 py-1 bg-white/10 rounded text-sm text-white font-mono">/</kbd>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-white/5">
                  <span className="text-gray-300">Open settings</span>
                  <kbd className="px-3 py-1 bg-white/10 rounded text-sm text-white font-mono">Ctrl + ,</kbd>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Feedback Modal */}
      {showFeedback && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-[#1E1E1E] rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-white/10">
              <h2 className="text-xl font-semibold text-white">Report an Issue</h2>
              <button onClick={() => setShowFeedback(false)} className="p-2 hover:bg-white/5 rounded-lg text-gray-400 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[calc(80vh-80px)] custom-scrollbar">
              <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); alert('Thank you for your feedback!'); setShowFeedback(false); }}>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Issue Type</label>
                  <select className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-cyan-500">
                    <option value="bug">Bug Report</option>
                    <option value="feature">Feature Request</option>
                    <option value="feedback">General Feedback</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Subject</label>
                  <input type="text" className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500" placeholder="Brief description of the issue" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Description</label>
                  <textarea className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 min-h-[150px] resize-y" placeholder="Please provide details about the issue..." required></textarea>
                </div>
                <div className="flex gap-3 pt-4">
                  <button type="button" onClick={() => setShowFeedback(false)} className="flex-1 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white transition-colors">
                    Cancel
                  </button>
                  <button type="submit" className="flex-1 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white transition-colors">
                    Submit
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Search Panel */}
      {isSearchOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setIsSearchOpen(false)}
          />

          {/* Panel */}
          <div className="relative w-full max-w-md h-full bg-[#1E1E1E] shadow-2xl animate-slide-in flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <div className="flex items-center gap-3">
                <Search size={20} className="text-blue-400" />
                <h2 className="text-lg font-semibold text-white">Search Chats</h2>
              </div>
              <button
                onClick={() => setIsSearchOpen(false)}
                className="p-2 hover:bg-white/5 rounded-lg text-gray-400 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Search Input */}
            <div className="p-4 border-b border-white/10">
              <input
                type="text"
                placeholder="Search conversations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500"
                autoFocus
              />
            </div>

            {/* Search Results */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
              {chats
                .filter(chat =>
                  searchQuery.trim() === '' ||
                  (chat.title && chat.title.toLowerCase().includes(searchQuery.toLowerCase()))
                )
                .map((chat) => (
                  <button
                    key={chat.id}
                    onClick={() => {
                      loadChat(chat.id);
                      setIsSearchOpen(false);
                      setSearchQuery('');
                    }}
                    className="w-full p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-left group"
                  >
                    <div className="flex items-start gap-3">
                      <MessageSquare size={16} className="text-gray-400 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">{chat.title || 'Untitled Chat'}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {new Date(chat.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              {chats.filter(chat =>
                searchQuery.trim() === '' ||
                (chat.title && chat.title.toLowerCase().includes(searchQuery.toLowerCase()))
              ).length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    <Search size={32} className="mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No chats found</p>
                  </div>
                )}
            </div>
          </div>
        </div>
      )}

      {/* Attachment Menu */}
      {isAttachmentOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setIsAttachmentOpen(false)}>
          <div
            className="absolute bottom-24 left-8 w-64 bg-[#2A2A2A] border border-white/10 rounded-lg shadow-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-2 space-y-1">
              <button
                onClick={() => {
                  alert('File upload coming soon!');
                  setIsAttachmentOpen(false);
                }}
                className="w-full text-left px-3 py-2.5 rounded-lg text-gray-300 hover:bg-white/5 transition-colors flex items-center gap-3"
              >
                <FileText size={18} className="text-blue-400" />
                <div>
                  <div className="font-medium text-sm text-white">Upload file</div>
                  <div className="text-xs text-gray-400">PDF, TXT, DOC</div>
                </div>
              </button>
              <button
                onClick={() => {
                  alert('Image upload coming soon!');
                  setIsAttachmentOpen(false);
                }}
                className="w-full text-left px-3 py-2.5 rounded-lg text-gray-300 hover:bg-white/5 transition-colors flex items-center gap-3"
              >
                <span className="text-lg">🖼️</span>
                <div>
                  <div className="font-medium text-sm text-white">Upload image</div>
                  <div className="text-xs text-gray-400">JPG, PNG, GIF</div>
                </div>
              </button>
              <button
                onClick={() => {
                  alert('Code upload coming soon!');
                  setIsAttachmentOpen(false);
                }}
                className="w-full text-left px-3 py-2.5 rounded-lg text-gray-300 hover:bg-white/5 transition-colors flex items-center gap-3"
              >
                <Code size={18} className="text-green-400" />
                <div>
                  <div className="font-medium text-sm text-white">Upload code</div>
                  <div className="text-xs text-gray-400">Any programming language</div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Speech Status Pill when reading aloud in chat */}
      {speakingIndex !== null && (
        <div className="fixed bottom-28 right-6 z-40 flex items-center gap-3 bg-[#1e2330]/95 backdrop-blur-md border border-rose-500/40 text-white px-4 py-2.5 rounded-full shadow-2xl animate-fade-in">
          <div className="flex items-center gap-1">
            <span className="live-eq-bar bg-rose-400 !h-4" />
            <span className="live-eq-bar bg-rose-400 !h-4" />
            <span className="live-eq-bar bg-rose-400 !h-4" />
          </div>
          <span className="text-xs text-gray-200 font-medium">Gabby is speaking...</span>
          <button
            onClick={() => {
              window.speechSynthesis.cancel();
              setSpeakingIndex(null);
              toast('Speech stopped', { icon: '⏹', id: 'tts-stopped' });
            }}
            className="px-3 py-1 text-xs bg-rose-500/20 hover:bg-rose-500/40 text-rose-300 rounded-full font-semibold transition-all border border-rose-500/30 flex items-center gap-1"
          >
            <Square size={10} className="fill-rose-300" />
            <span>Stop (Esc)</span>
          </button>
        </div>
      )}

      {/* Live Voice Mode Overlay (ChatGPT Voice Style) */}
      {isVoiceModeOpen && (
        <VoiceModeModal
          isOpen={isVoiceModeOpen}
          onClose={() => {
            setIsVoiceModeOpen(false);
            if ('speechSynthesis' in window) {
              window.speechSynthesis.cancel();
            }
          }}
          onSendMessage={handleVoiceMessage}
          onAbort={handleAbortStream}
          onNewChat={createNewChat}
          messages={messages}
          onType={() => {
            setIsVoiceModeOpen(false);
            setTimeout(() => {
              const inputEl = document.querySelector('textarea');
              if (inputEl) inputEl.focus();
            }, 100);
          }}
        />
      )}


    </div>
  );
}

export default App;
