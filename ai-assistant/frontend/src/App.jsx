// src/App.jsx
import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Sparkles, Menu, Plus, MessageSquare, Settings, LogOut, Copy, RotateCcw, Square, Trash2, X, Code, Calculator, Search, FileText, ChevronRight, Zap, ChevronDown, Star, Bookmark, Folder, Gem, HelpCircle, Moon, Bell, Shield, Info, ThumbsUp, ThumbsDown, Volume2, VolumeX, Pencil, Check, Mic, MicOff, Download, Brain, Globe, Maximize2, ExternalLink } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import toast, { Toaster } from 'react-hot-toast';
import { SpeedInsights } from '@vercel/speed-insights/react';
import VoiceModeModal from './components/VoiceModeModal.jsx';
import {
  playGeminiVoice,
  stopGeminiVoice,
  GEMINI_VOICES,
  DEFAULT_GEMINI_VOICE
} from './utils/geminiVoice.js';
import { performWebSearch } from './utils/webSearch.js';

// Dynamic API_BASE_URL:
// - If custom VITE_API_BASE_URL is provided, use it.
// - If running on localhost or 127.0.0.1, use 'http://localhost:8000'.
// - When deployed (Vercel, Netlify, custom domain), use '' so all requests use same-origin relative URLs (/api/...) avoiding CORS, Mixed Content, and Private Network Access errors.
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL !== undefined && import.meta.env.VITE_API_BASE_URL !== '')
  ? import.meta.env.VITE_API_BASE_URL
  : (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
      ? 'http://localhost:8000'
      : '');

const getClientGeminiKey = () => {
  if (import.meta.env.VITE_GEMINI_API_KEY) return import.meta.env.VITE_GEMINI_API_KEY;
  try {
    return atob('QVEuQWI4Uk42S2RWMFVWWkdXamN1eWgwcTBXdUVNMXhhWWhwbDU2dHJ3N2tWWS1FbW9qdUE=');
  } catch (e) {
    return '';
  }
};
const GEMINI_API_KEY = getClientGeminiKey();

// Natural English Voice Selector for TTS Listen Button
const getEnglishVoice = () => {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices() || [];
  if (voices.length === 0) return null;

  const preferred = [
    'natural', 'google us english', 'google uk english',
    'samantha', 'jenny', 'aria', 'guy', 'ava', 'victoria',
    'en-us', 'en-gb'
  ];

  for (const name of preferred) {
    const match = voices.find(
      (v) => v.lang.toLowerCase().startsWith('en') && v.name.toLowerCase().includes(name)
    );
    if (match) return match;
  }

  const anyEnglish = voices.find((v) => v.lang.toLowerCase().startsWith('en'));
  return anyEnglish || voices[0];
};

async function streamGeminiDirect({
  prompt,
  conversationHistory = [],
  modelSelection = 'standard',
  mode = 'chat',
  activeGem = null,
  attachedImage = null,
  customSystemInstruction = null,
  searchContext = null,
  signal,
  onToken
}) {
  let primaryModel = 'gemini-3.6-flash';
  let fallbackModels = ['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-flash-latest'];
  if (modelSelection === 'advanced') {
    primaryModel = 'gemini-3.7-flash';
    fallbackModels = ['gemini-3.6-flash', 'gemini-3.8-flash', 'gemini-flash-latest'];
  } else if (modelSelection === 'fast' || modelSelection === 'lite') {
    primaryModel = 'gemini-3.5-flash-lite';
    fallbackModels = ['gemini-3.6-flash', 'gemini-flash-latest'];
  }

  const modelsToTry = [primaryModel, ...fallbackModels.filter((m) => m !== primaryModel)];

  let baseIntelligence = "You are Gabby, an advanced AI assistant with DeepSeek/ChatGPT-level depth, reasoning, and precision. Provide insightful, thorough, and highly articulate answers. Structure complex responses with clear numbered headings ('1. ...', '2. ...'), concise paragraphs, round bullet points with bold lead-ins, clean code blocks, and markdown tables where data is presented. Avoid filler.";

  if (activeGem === 'code') {
    baseIntelligence = "You are Code Expert, an elite senior software architect and programmer. Write modular, robust, clean code with detailed explanations, edge cases, and best practices.";
  } else if (activeGem === 'writing') {
    baseIntelligence = "You are Writing Assistant, a master editor and creative writer. Deliver compelling, polished, evocative prose, essays, articles, and communication.";
  } else if (activeGem === 'math') {
    baseIntelligence = "You are Math Tutor, a brilliant mathematician and educator. Solve complex mathematical problems step-by-step with proofs, intuition, and clear explanations.";
  } else if (activeGem === 'brainstorm') {
    baseIntelligence = "You are Creative Brainstormer, an imaginative strategist and innovator. Generate fresh, disruptive, multi-angle ideas and creative frameworks.";
  } else if (activeGem === 'research') {
    baseIntelligence = "You are Research Assistant, a rigorous researcher and analytical scientist. Deliver in-depth, fact-checked, structured analysis and synthesis.";
  }

  let systemInstructionText = customSystemInstruction || baseIntelligence;
  if (mode === 'voice') {
    systemInstructionText = `${baseIntelligence}\n\nSPOKEN VOICE DELIVERY RULES:\n1. Deliver your full, top-tier intelligent answer naturally in clear, flowing spoken English.\n2. Do not output markdown symbols (no asterisks, hashtags, bullet points, or code blocks) since your output is spoken aloud.\n3. Speak warmly and engagingly.`;
  }

  const contents = [];
  const recent = conversationHistory.slice(-10);
  for (const m of recent) {
    if (m.content && (m.role === 'user' || m.role === 'assistant')) {
      contents.push({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      });
    }
  }

  const userParts = [];
  if (attachedImage?.base64 && attachedImage?.mimeType) {
    userParts.push({
      inlineData: {
        mimeType: attachedImage.mimeType,
        data: attachedImage.base64
      }
    });
  }

  let finalUserPrompt = prompt || (attachedImage ? 'Please analyze this image.' : 'Hello');
  if (searchContext) {
    finalUserPrompt = `${searchContext}\n\n[USER QUERY]:\n${finalUserPrompt}`;
  }

  userParts.push({ text: finalUserPrompt });

  contents.push({
    role: 'user',
    parts: userParts
  });

  let lastError = null;
  for (const model of modelsToTry) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          systemInstruction: { parts: [{ text: systemInstructionText }] }
        }),
        signal
      });

      if (!res.ok) {
        lastError = new Error(`Model ${model} returned ${res.status}`);
        continue;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = '';
      let streamed = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split('\n');
        sseBuffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            const jsonStr = trimmed.slice(6).trim();
            if (!jsonStr) continue;
            try {
              const data = JSON.parse(jsonStr);
              const textPart = data.candidates?.[0]?.content?.parts?.[0]?.text;
              if (textPart) {
                streamed += textPart;
                if (onToken) onToken(textPart);
              }
            } catch (e) {}
          }
        }
      }

      return streamed;
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      lastError = err;
    }
  }

  throw lastError || new Error('Google Gemini streaming is temporarily unavailable.');
}

function TableBlock({ children }) {
  const [isCopied, setIsCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const tableRef = useRef(null);

  const extractTableCsv = () => {
    if (!tableRef.current) return '';
    const rows = Array.from(tableRef.current.querySelectorAll('tr'));
    return rows
      .map((r) => {
        const cells = Array.from(r.querySelectorAll('th, td'));
        return cells.map((c) => `"${c.innerText.replace(/"/g, '""').trim()}"`).join(',');
      })
      .join('\n');
  };

  const handleCopy = async () => {
    try {
      const csv = extractTableCsv();
      await navigator.clipboard.writeText(csv);
      setIsCopied(true);
      toast.success('Table copied as CSV!');
      setTimeout(() => setIsCopied(false), 2000);
    } catch (e) {
      toast.error('Failed to copy table');
    }
  };

  const handleDownload = () => {
    try {
      const csv = extractTableCsv();
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `table-${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Table downloaded as CSV!');
    } catch (e) {
      toast.error('Failed to download table');
    }
  };

  return (
    <>
      <div className="relative my-4 rounded-xl overflow-hidden bg-[#1c1c1e] border border-white/10 shadow-lg text-left">
        {/* Table Card Header */}
        <div className="flex items-center justify-between px-3.5 py-2 bg-[#131314]/80 border-b border-white/10">
          <span className="text-xs font-mono font-medium text-[#8a8a8e] tracking-wider uppercase">
            Table
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={handleCopy}
              className="px-2 py-1 rounded-md text-xs text-[#8a8a8e] hover:text-white hover:bg-white/10 transition-colors flex items-center gap-1 cursor-pointer"
              title="Copy table as CSV"
            >
              {isCopied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
              <span className="text-[11px]">{isCopied ? 'Copied' : 'Copy'}</span>
            </button>
            <button
              onClick={handleDownload}
              className="px-2 py-1 rounded-md text-xs text-[#8a8a8e] hover:text-white hover:bg-white/10 transition-colors flex items-center gap-1 cursor-pointer"
              title="Download CSV"
            >
              <Download size={12} />
              <span className="text-[11px] hidden sm:inline">CSV</span>
            </button>
            <button
              onClick={() => setIsExpanded(true)}
              className="p-1 rounded-md text-[#8a8a8e] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              title="Expand table"
            >
              <Maximize2 size={13} />
            </button>
          </div>
        </div>

        {/* Scrollable Table Content */}
        <div className="overflow-x-auto custom-scrollbar p-1" ref={tableRef}>
          <table className="w-full border-collapse text-xs sm:text-sm text-[#e8e8e8]">
            {children}
          </table>
        </div>
      </div>

      {/* Expanded Table Modal */}
      {isExpanded && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md"
          onClick={() => setIsExpanded(false)}
        >
          <div
            className="w-full max-w-4xl max-h-[85vh] bg-[#1c1c1e] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-[#131314]">
              <span className="text-sm font-semibold text-white">Expanded Table View</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDownload}
                  className="px-2.5 py-1 rounded-lg text-xs bg-white/10 hover:bg-white/15 text-white flex items-center gap-1.5 cursor-pointer"
                >
                  <Download size={13} />
                  <span>Download CSV</span>
                </button>
                <button
                  onClick={() => setIsExpanded(false)}
                  className="p-1 hover:bg-white/10 rounded-lg text-[#8a8a8e] hover:text-white transition-colors cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="overflow-auto p-4 flex-1 custom-scrollbar">
              <table className="w-full border-collapse text-sm text-[#e8e8e8]">
                {children}
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function CodeBlock({ className, children, ...props }) {
  const [isCopied, setIsCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || '');
  const codeText = String(children).replace(/\n$/, '');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(codeText);
      setIsCopied(true);
      toast.success('Code copied!');
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      toast.error('Failed to copy code');
    }
  };

  return (
    <div className="relative my-4 rounded-xl overflow-hidden bg-[#1c1c1e] border border-white/10 group/code shadow-lg text-left">
      <div className="flex items-center justify-between px-3.5 py-2 bg-[#131314]/80 border-b border-white/10">
        <span className="text-xs font-mono text-[#8a8a8e] font-medium tracking-wide uppercase">
          {match ? match[1] : 'code'}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-[#8a8a8e] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
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
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-3 sm:p-4 overflow-x-auto text-[13px] sm:text-sm leading-relaxed font-mono text-[#e8e8e8] custom-scrollbar whitespace-pre">
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
  const [audioLoadingIndex, setAudioLoadingIndex] = useState(null);
  const [selectedGeminiVoice, setSelectedGeminiVoice] = useState(() => {
    return localStorage.getItem('gabby_gemini_voice') || DEFAULT_GEMINI_VOICE;
  });
  const [isVoiceSelectorOpen, setIsVoiceSelectorOpen] = useState(false);
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

  // DeepSeek-Style Think (Reasoning) & Search (Web Grounding) State
  const [isThinkEnabled, setIsThinkEnabled] = useState(() => {
    return localStorage.getItem('gabby_think_enabled') === 'true';
  });
  const [isSearchEnabled, setIsSearchEnabled] = useState(() => {
    return localStorage.getItem('gabby_search_enabled') === 'true';
  });
  const [isSearchingWeb, setIsSearchingWeb] = useState(false);
  const [isThinkingLive, setIsThinkingLive] = useState(false);
  const [thinkingSeconds, setThinkingSeconds] = useState(0);
  const [expandedThoughts, setExpandedThoughts] = useState(new Set());
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const chatContainerRef = useRef(null);

  const toggleThink = () => {
    setIsThinkEnabled((prev) => {
      const next = !prev;
      localStorage.setItem('gabby_think_enabled', String(next));
      toast(next ? 'Reasoning mode (Think) ON' : 'Reasoning mode (Think) OFF', {
        icon: '🧠',
        id: 'toggle-think'
      });
      return next;
    });
  };

  const toggleSearch = () => {
    setIsSearchEnabled((prev) => {
      const next = !prev;
      localStorage.setItem('gabby_search_enabled', String(next));
      toast(next ? 'Web Search grounding ON' : 'Web Search grounding OFF', {
        icon: '🌐',
        id: 'toggle-search'
      });
      return next;
    });
  };

  const toggleThoughtExpanded = (msgIndex) => {
    setExpandedThoughts((prev) => {
      const next = new Set(prev);
      if (next.has(msgIndex)) next.delete(msgIndex);
      else next.add(msgIndex);
      return next;
    });
  };

  const handleChatScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    const isUp = scrollHeight - scrollTop - clientHeight > 160;
    setShowScrollBottom(isUp);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Active Gem Persona & Multimodal Attachment
  const [activeGem, setActiveGem] = useState(null);
  const [attachedImage, setAttachedImage] = useState(null);
  const imageInputRef = useRef(null);
  const fileInputRef = useRef(null);

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
      const height = window.innerHeight;
      // Phone in landscape (height < 520) or standard mobile (width < 768)
      const mobile = width < 768 || height < 520;
      setIsMobile(mobile);
      setIsTablet(!mobile && width < 1024);

      // Auto-hide sidebars on mobile or phone-landscape
      if (mobile) {
        setIsSidebarOpen(false);
        setIsToolsOpen(false);
      } else if (width >= 1024) {
        setIsSidebarOpen(true);
        setIsToolsOpen(false);
      }
    };

    handleResize(); // Initial check
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Preload speech synthesis voices for crisp English TTS
  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
      };
    }
  }, []);

  // Fetch chats on mount
  useEffect(() => {
    fetchChats();
  }, []);

  const saveChatLocally = (chatId, updatedMessages, title = null) => {
    if (!chatId) return;
    try {
      localStorage.setItem(`gabby_chat_msgs_${chatId}`, JSON.stringify(updatedMessages));
      const cached = localStorage.getItem('gabby_chats_cache');
      let list = cached ? JSON.parse(cached) : [];
      const existingIdx = list.findIndex((c) => c.id === chatId);
      const chatTitle = title || updatedMessages.find((m) => m.role === 'user')?.content?.slice(0, 30) || 'New Chat';
      if (existingIdx !== -1) {
        list[existingIdx].title = chatTitle;
        list[existingIdx].updated_at = new Date().toISOString();
      } else {
        list.unshift({
          id: chatId,
          title: chatTitle,
          created_at: new Date().toISOString()
        });
      }
      localStorage.setItem('gabby_chats_cache', JSON.stringify(list));
      setChats(list);
    } catch (e) {}
  };

  const fetchChats = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/chats`);
      const contentType = response.headers.get('content-type') || '';
      if (response.ok && contentType.includes('application/json')) {
        const data = await response.json();
        if (Array.isArray(data)) {
          setChats(data);
          try {
            localStorage.setItem('gabby_chats_cache', JSON.stringify(data));
          } catch (e) {}
          return;
        }
      }
    } catch (error) {
      // Backend offline or unreachable
    }

    try {
      const cached = localStorage.getItem('gabby_chats_cache');
      if (cached) setChats(JSON.parse(cached));
    } catch (e) {}
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
      let loadedMessages = null;
      try {
        const response = await fetch(`${API_BASE_URL}/api/chats/${chatId}`);
        const contentType = response.headers.get('content-type') || '';
        if (response.ok && contentType.includes('application/json')) {
          const data = await response.json();
          if (data && Array.isArray(data.messages)) {
            loadedMessages = data.messages;
          }
        }
      } catch (err) {}

      if (!loadedMessages) {
        const cached = localStorage.getItem(`gabby_chat_msgs_${chatId}`);
        if (cached) {
          try {
            loadedMessages = JSON.parse(cached);
          } catch (e) {}
        }
      }

      setMessages(loadedMessages || []);
      setCurrentChatId(chatId);
      if (window.innerWidth < 768) setIsSidebarOpen(false);
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
                try {
                  await fetch(`${API_BASE_URL}/api/chats/${chatId}`, { method: 'DELETE' });
                } catch (err) {}

                setChats((prev) => {
                  const updated = prev.filter((c) => c.id !== chatId);
                  try {
                    localStorage.setItem('gabby_chats_cache', JSON.stringify(updated));
                  } catch (e) {}
                  return updated;
                });
                localStorage.removeItem(`gabby_chat_msgs_${chatId}`);

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

  const fallbackSpeechSynthesis = (index, text) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const clean = text
      .replace(/```[\s\S]*?```/g, 'Code block omitted.')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/[*_~#]/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[-–—]{2,}/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.lang = 'en-US';
    const englishVoice = getEnglishVoice();
    if (englishVoice) utterance.voice = englishVoice;
    utterance.onend = () => setSpeakingIndex(null);
    utterance.onerror = () => setSpeakingIndex(null);
    setSpeakingIndex(index);
    window.speechSynthesis.speak(utterance);
  };

  const toggleSpeech = async (index, text) => {
    if (speakingIndex === index || audioLoadingIndex === index) {
      stopGeminiVoice();
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      setSpeakingIndex(null);
      setAudioLoadingIndex(null);
      return;
    }

    stopGeminiVoice();
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();

    await playGeminiVoice(text, {
      voice: selectedGeminiVoice,
      apiKey: GEMINI_API_KEY,
      onLoading: (isLoading) => {
        setAudioLoadingIndex(isLoading ? index : null);
      },
      onStart: () => {
        setAudioLoadingIndex(null);
        setSpeakingIndex(index);
      },
      onEnd: () => {
        setSpeakingIndex(null);
        setAudioLoadingIndex(null);
      },
      onError: (err) => {
        console.warn('[Gemini Voice] Falling back to device synthesizer:', err);
        setAudioLoadingIndex(null);
        fallbackSpeechSynthesis(index, text);
      }
    });
  };

  useEffect(() => {
    const handleGlobalSpeechKey = (e) => {
      if (e.key === 'Escape' && (speakingIndex !== null || audioLoadingIndex !== null)) {
        stopGeminiVoice();
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
        setSpeakingIndex(null);
        setAudioLoadingIndex(null);
        toast('Speech stopped', { icon: '⏹', id: 'global-tts-stop' });
      }
    };
    window.addEventListener('keydown', handleGlobalSpeechKey);
    return () => window.removeEventListener('keydown', handleGlobalSpeechKey);
  }, [speakingIndex, audioLoadingIndex]);

  // Image and File Attachment Handlers
  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload a valid image (PNG, JPG, WebP, GIF)');
      return;
    }
    const reader = new FileReader();
    reader.onload = (loadEvt) => {
      const dataUrl = loadEvt.target.result;
      const base64 = dataUrl.split(',')[1];
      setAttachedImage({
        dataUrl,
        base64,
        mimeType: file.type,
        name: file.name
      });
      setIsAttachmentOpen(false);
      toast.success(`Attached image: ${file.name}`);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (loadEvt) => {
      const content = loadEvt.target.result;
      const ext = file.name.split('.').pop() || '';
      setInput((prev) => `${prev ? prev + '\n\n' : ''}\`\`\`${ext} [${file.name}]\n${content}\n\`\`\`\n`);
      setIsAttachmentOpen(false);
      toast.success(`Attached code file: ${file.name}`);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Gems Selection
  const handleSelectGem = (gemId) => {
    setActiveGem(gemId);
    setIsGemsOpen(false);
    const gemNames = {
      code: 'Code Expert',
      writing: 'Writing Assistant',
      math: 'Math Tutor',
      brainstorm: 'Creative Brainstormer',
      research: 'Research Assistant'
    };
    toast.success(`Activated Gem: ${gemNames[gemId] || 'Custom Gem'}`);
  };


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
        if (res.ok) {
          const newChat = await res.json();
          activeChatId = newChat.id;
          setCurrentChatId(activeChatId);
          setChats((prev) => [newChat, ...prev]);
        } else {
          activeChatId = 'local-' + Date.now();
          setCurrentChatId(activeChatId);
        }
      } catch (err) {
        console.warn('Chat creation fallback to local session:', err);
        activeChatId = 'local-' + Date.now();
        setCurrentChatId(activeChatId);
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

  const streamResponse = async (message, chatIdToUse, currentImg = null) => {
    setIsLoading(true);
    setIsStreaming(true);

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // 1. Search Grounding Pass (when Search toggle is active)
    let searchResults = [];
    let searchContextStr = null;
    if (isSearchEnabled) {
      setIsSearchingWeb(true);
      try {
        searchResults = await performWebSearch(message);
        if (searchResults && searchResults.length > 0) {
          searchContextStr = `[VERIFIED REAL-TIME WEB SEARCH RESULTS FOR GROUNDING]:\n` +
            searchResults.map((r, i) => `[Source ${i + 1}]: ${r.title}\nURL: ${r.url}\nSnippet: ${r.snippet}`).join('\n\n') +
            `\nPlease ground your response in these verified search results where relevant and cite sources accurately.`;
        }
      } catch (err) {
        console.warn('Web search grounding error:', err);
      } finally {
        setIsSearchingWeb(false);
      }
    }

    // 2. Think Reasoning Pass (when Think toggle is active)
    let accumulatedReasoning = '';
    let thoughtElapsed = null;

    if (isThinkEnabled) {
      setIsThinkingLive(true);
      setThinkingSeconds(0);
      const thinkStart = Date.now();
      const thinkInterval = setInterval(() => {
        setThinkingSeconds(Math.floor((Date.now() - thinkStart) / 1000));
      }, 200);

      // Append assistant message in thinking mode
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: '',
          reasoning: '',
          isThinking: true,
          thoughtTime: null,
          searchSources: searchResults
        }
      ]);

      try {
        await streamGeminiDirect({
          prompt: message,
          conversationHistory: messages,
          modelSelection: selectedModel,
          mode: 'chat',
          activeGem,
          attachedImage: currentImg,
          searchContext: searchContextStr,
          customSystemInstruction:
            "You are an analytical deep reasoning engine. Think through this step by step. Evaluate constraints, evaluate alternatives, detect edge cases, and structure the logic. Output ONLY your internal chain-of-thought. Do not output the final polished response yet.",
          signal: controller.signal,
          onToken: (token) => {
            accumulatedReasoning += token;
            setMessages((prev) => {
              const updated = [...prev];
              if (updated.length > 0) {
                const lastIdx = updated.length - 1;
                updated[lastIdx] = {
                  ...updated[lastIdx],
                  reasoning: (updated[lastIdx].reasoning || '') + token
                };
              }
              return updated;
            });
          }
        });
      } catch (err) {
        if (err.name === 'AbortError') throw err;
        console.warn('Reasoning pass notice:', err.message);
      } finally {
        clearInterval(thinkInterval);
        thoughtElapsed = Math.max(1, Math.floor((Date.now() - thinkStart) / 1000));
        setThinkingSeconds(thoughtElapsed);
        setIsThinkingLive(false);

        setMessages((prev) => {
          const updated = [...prev];
          if (updated.length > 0) {
            const lastIdx = updated.length - 1;
            updated[lastIdx] = {
              ...updated[lastIdx],
              isThinking: false,
              thoughtTime: thoughtElapsed
            };
          }
          return updated;
        });
      }
    } else {
      // Direct stream without thinking pass
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: '',
          searchSources: searchResults
        }
      ]);
    }

    // 3. Final Answer Streaming Pass
    try {
      let finalStreamed = '';
      const answerPrompt = accumulatedReasoning
        ? `[INTERNAL REASONING CHAIN]:\n${accumulatedReasoning}\n\n[USER QUERY]:\n${message}\n\n[TASK]:\nProvide the comprehensive, structured, and polished final answer to the user.`
        : message;

      await streamGeminiDirect({
        prompt: answerPrompt,
        conversationHistory: messages,
        modelSelection: selectedModel,
        mode: 'chat',
        activeGem,
        attachedImage: currentImg,
        searchContext: searchContextStr,
        signal: controller.signal,
        onToken: (token) => {
          finalStreamed += token;
          setMessages((prev) => {
            const updated = [...prev];
            if (updated.length > 0) {
              const lastIdx = updated.length - 1;
              updated[lastIdx] = {
                ...updated[lastIdx],
                content: (updated[lastIdx].content || '') + token
              };
            }
            return updated;
          });
        }
      });

      setMessages((latest) => {
        saveChatLocally(chatIdToUse, latest);
        return latest;
      });
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
    if ((!input.trim() && !attachedImage) || isLoading) return;

    const currentImg = attachedImage;
    const userMsg = {
      role: 'user',
      content: input,
      image: currentImg?.dataUrl || null
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setAttachedImage(null);

    let activeChatId = currentChatId;

    if (!activeChatId) {
      const chatTitle = (input || 'Image Analysis').slice(0, 30);
      try {
        const res = await fetch(`${API_BASE_URL}/api/chats`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: chatTitle })
        });
        const contentType = res.headers.get('content-type') || '';
        if (res.ok && contentType.includes('application/json')) {
          const newChat = await res.json();
          activeChatId = newChat.id;
          setCurrentChatId(activeChatId);
          setChats((prev) => [newChat, ...prev]);
        } else {
          activeChatId = 'local-' + Date.now();
          setCurrentChatId(activeChatId);
          saveChatLocally(activeChatId, [userMsg], chatTitle);
        }
      } catch (err) {
        activeChatId = 'local-' + Date.now();
        setCurrentChatId(activeChatId);
        saveChatLocally(activeChatId, [userMsg], chatTitle);
      }
    }

    await streamResponse(userMsg.content, activeChatId, currentImg);
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

    let streamed = '';

    try {
      let response = null;
      try {
        response = await fetch(`${API_BASE_URL}/api/chat/stream`, {
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
      } catch (err) {
        console.warn('Voice stream fetch failed, falling back to direct Gemini:', err);
      }

      if (!response || !response.ok) {
        // Fallback to direct Gemini streaming
        await streamGeminiDirect({
          prompt: spokenText,
          conversationHistory: messages,
          modelSelection: selectedModel,
          mode: 'voice',
          activeGem,
          signal: controller.signal,
          onToken: (token) => {
            streamed += token;
            setMessages((prev) => {
              const updated = [...prev];
              if (updated.length > 0) {
                const lastIdx = updated.length - 1;
                updated[lastIdx] = {
                  ...updated[lastIdx],
                  content: (updated[lastIdx].content || '') + token
                };
              }
              return updated;
            });
            if (onChunk) onChunk(token, streamed, false);
          }
        });
        if (onChunk) onChunk(null, streamed, true);
        setMessages((latest) => {
          saveChatLocally(activeChatId || 'local-' + Date.now(), latest);
          return latest;
        });
        return streamed;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
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
              setMessages((latest) => {
                saveChatLocally(activeChatId || 'local-' + Date.now(), latest);
                return latest;
              });
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
      setMessages((latest) => {
        saveChatLocally(activeChatId || 'local-' + Date.now(), latest);
        return latest;
      });
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
      <div className="flex items-center gap-1 sm:gap-1.5 pt-1.5 sm:pt-2 opacity-95 transition-opacity">
        {/* Copy Response Button */}
        <button
          onClick={() => copyToClipboard(msg.content, index)}
          className="p-1 sm:p-1.5 px-1.5 sm:px-2 hover:bg-white/10 rounded-md sm:rounded-lg text-gray-400 hover:text-white transition-colors text-[11px] sm:text-xs flex items-center gap-1 border border-transparent hover:border-white/10"
          title="Copy response"
        >
          {copiedIndex === index ? (
            <>
              <Check size={12} className="sm:w-3.5 sm:h-3.5 text-emerald-400" />
              <span className="text-[10px] sm:text-[11px] text-emerald-400 font-medium">Copied!</span>
            </>
          ) : (
            <>
              <Copy size={12} className="sm:w-3.5 sm:h-3.5" />
              <span className="text-[10px] sm:text-[11px] hidden sm:inline">Copy</span>
            </>
          )}
        </button>

        {/* Read Aloud / TTS Button (Authentic Gemini Voice) */}
        <button
          onClick={() => toggleSpeech(index, msg.content)}
          disabled={audioLoadingIndex === index}
          className={`p-1 sm:p-1.5 px-1.5 sm:px-2 rounded-md sm:rounded-lg text-[11px] sm:text-xs flex items-center gap-1 sm:gap-1.5 transition-colors border ${
            isSpeaking
              ? 'bg-gradient-to-r from-[#4E80EE]/20 to-[#9B72CF]/20 text-[#70CFFF] border-[#70CFFF]/40 shadow-sm'
              : audioLoadingIndex === index
              ? 'bg-white/5 text-[#8e918f] border-white/10'
              : 'text-gray-400 hover:text-white hover:bg-white/10 border-transparent hover:border-white/10'
          }`}
          title={isSpeaking ? 'Stop speaking' : `Listen with Gemini ${selectedGeminiVoice} voice`}
        >
          {isSpeaking ? (
            <>
              <div className="flex items-center gap-0.5 h-2.5 sm:h-3">
                <span className="sound-wave-bar" />
                <span className="sound-wave-bar" />
                <span className="sound-wave-bar" />
              </div>
              <VolumeX size={12} className="sm:w-3.5 sm:h-3.5" />
              <span className="text-[10px] sm:text-[11px] hidden sm:inline">Stop</span>
            </>
          ) : audioLoadingIndex === index ? (
            <>
              <div className="w-3 h-3 border-2 border-[#70CFFF] border-t-transparent rounded-full animate-spin" />
              <span className="text-[10px] sm:text-[11px]">Gemini Voice...</span>
            </>
          ) : (
            <>
              <Volume2 size={12} className="sm:w-3.5 sm:h-3.5" />
              <span className="text-[10px] sm:text-[11px] hidden sm:inline">Listen</span>
            </>
          )}
        </button>

        {/* Thumbs Up (Good Response) */}
        <button
          onClick={() => handleRate(index, 'like')}
          className={`p-1 sm:p-1.5 rounded-md sm:rounded-lg text-[11px] sm:text-xs transition-colors border ${
            isLiked
              ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40'
              : 'text-gray-400 hover:text-white hover:bg-white/10 border-transparent hover:border-white/10'
          }`}
          title="Good response"
        >
          <ThumbsUp size={12} className={`sm:w-3.5 sm:h-3.5 ${isLiked ? 'fill-cyan-400' : ''}`} />
        </button>

        {/* Thumbs Down (Bad Response) */}
        <button
          onClick={() => handleRate(index, 'dislike')}
          className={`p-1 sm:p-1.5 rounded-md sm:rounded-lg text-[11px] sm:text-xs transition-colors border ${
            isDisliked
              ? 'bg-rose-500/20 text-rose-400 border-rose-500/40'
              : 'text-gray-400 hover:text-white hover:bg-white/10 border-transparent hover:border-white/10'
          }`}
          title="Bad response"
        >
          <ThumbsDown size={12} className={`sm:w-3.5 sm:h-3.5 ${isDisliked ? 'fill-rose-400' : ''}`} />
        </button>

        {/* Regenerate Button */}
        <button
          onClick={() => regenerateMessage(index)}
          className="p-1 sm:p-1.5 hover:bg-white/10 rounded-md sm:rounded-lg text-gray-400 hover:text-white transition-colors border border-transparent hover:border-white/10"
          title="Regenerate response"
        >
          <RotateCcw size={12} className="sm:w-3.5 sm:h-3.5" />
        </button>
      </div>
    );
  };

  const SuggestionCard = ({ icon: Icon, title, description }) => (
    <button
      onClick={() => handleSuggestionClick(description)}
      className="p-2.5 sm:p-4 rounded-xl sm:rounded-2xl bg-[#1e1f20] hover:bg-[#282a2c] text-left transition-all border border-white/5 hover:border-white/10 group cursor-pointer flex flex-col justify-between min-h-[72px] sm:min-h-[110px] md:h-[145px] shadow-sm relative overflow-hidden"
    >
      <div>
        <h3 className="text-[11.5px] sm:text-sm font-medium text-[#e3e3e3] mb-0.5 sm:mb-1 group-hover:text-white transition-colors line-clamp-1">{title}</h3>
        <p className="text-[10px] sm:text-xs text-[#a8aaa8] line-clamp-2 leading-tight sm:leading-relaxed">{description}</p>
      </div>
      <div className="flex justify-end mt-1 sm:mt-auto">
        <div className="w-5 h-5 sm:w-8 sm:h-8 rounded-full bg-[#131314] flex items-center justify-center text-[#e3e3e3] group-hover:scale-110 group-hover:text-white transition-all border border-white/5">
          <Icon size={11} className="sm:w-[15px] sm:h-[15px]" />
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
    <div className="flex h-screen h-[100dvh] bg-[var(--color-background-dark)] text-[var(--color-text-light)] overflow-hidden font-sans">
      <Toaster />
      {/* Mobile Backdrop when Sidebar Drawer is open */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden animate-fade-in"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Left Sidebar */}
      <aside
        className={`bg-[#1e1f20] transition-all duration-300 ease-in-out flex flex-col border-r border-[#282a2c] fixed inset-y-0 left-0 z-50 lg:relative lg:z-auto shrink-0 ${
          isSidebarOpen
            ? 'w-[280px] sm:w-[300px] lg:w-[260px] translate-x-0'
            : '-translate-x-full lg:translate-x-0 w-0 lg:w-[56px] overflow-hidden'
        }`}
      >
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
        <header className="h-12 sm:h-14 flex items-center px-3 sm:px-4 justify-between bg-[#131314] border-b border-white/[0.08] z-10 shrink-0">
          {/* Left: hamburger icon -> opens slide-out panel with chat history */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 hover:bg-[#1e1f20] rounded-full text-[#c4c7c5] hover:text-white transition-colors cursor-pointer"
              title="Chat history"
            >
              <Menu size={20} />
            </button>
          </div>

          {/* Center: current chat's title (truncate with ellipsis if long) + Gemini Star icon */}
          <div className="flex items-center gap-2 max-w-[50%] sm:max-w-[60%] justify-center min-w-0">
            <GeminiSparkle className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
            <span className="text-sm sm:text-base font-medium text-[#e8e8e8] truncate">
              {chats.find((c) => c.id === currentChatId)?.title || (messages.length > 0 ? (messages[0].content?.slice(0, 32) || 'Chat') : 'Gabby AI')}
            </span>
            <button
              type="button"
              onClick={() => setIsModelSelectorOpen(!isModelSelectorOpen)}
              className="hidden md:inline-flex text-[10px] text-[#8a8a8e] hover:text-[#e8e8e8] bg-[#1e1f20] hover:bg-[#282a2c] px-2 py-0.5 rounded-full border border-white/5 font-mono items-center gap-0.5 transition-colors cursor-pointer shrink-0"
              title="Select Gemini Model"
            >
              <span>
                {selectedModel === 'fast'
                  ? '3.5 Lite'
                  : selectedModel === 'advanced'
                  ? '3.7 Flash'
                  : '3.8 Flash'}
              </span>
              <ChevronDown size={10} />
            </button>
          </div>

          {/* Right: circular outlined "+" button -> starts a new chat, plus Voice mode */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Live Voice Mode Button */}
            <button
              type="button"
              onClick={() => setIsVoiceModeOpen(true)}
              className="p-1.5 sm:px-3 sm:py-1.5 rounded-full text-[#c4c7c5] hover:text-white hover:bg-white/5 border border-white/10 transition-all flex items-center gap-1.5 cursor-pointer"
              title="Start Live Voice Conversation"
            >
              <Mic size={15} className="text-[#70CFFF]" />
              <span className="text-xs font-medium hidden sm:inline">Voice</span>
            </button>

            {/* Circular outlined "+" button for new chat */}
            <button
              type="button"
              onClick={createNewChat}
              className="w-8 h-8 sm:w-8.5 sm:h-8.5 rounded-full border border-white/20 hover:border-white/60 text-[#e8e8e8] hover:text-white hover:bg-white/5 flex items-center justify-center transition-all cursor-pointer shadow-sm"
              title="Start new chat"
            >
              <Plus size={18} />
            </button>
          </div>
        </header>

        {/* Chat Area */}
        <div
          ref={chatContainerRef}
          onScroll={handleChatScroll}
          className="flex-1 overflow-y-auto scroll-smooth relative custom-scrollbar"
        >
          {messages.length === 0 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-3 sm:p-6 overflow-y-auto custom-scrollbar">
              <div className="max-w-4xl w-full flex flex-col items-start space-y-3 sm:space-y-6 md:space-y-8 animate-fade-in my-auto pb-20 sm:pb-28">
                {/* Gemini Signature Heading */}
                <div className="space-y-0.5 sm:space-y-1 text-left px-1 sm:px-2">
                  <h1 className="text-xl sm:text-3xl md:text-5xl lg:text-6xl font-medium tracking-tight bg-gradient-to-r from-[#4E80EE] via-[#9B72CF] to-[#E275AA] bg-clip-text text-transparent">
                    Hello, Gabriel
                  </h1>
                  <h2 className="text-sm sm:text-2xl md:text-3xl lg:text-4xl font-medium text-[#757775]">
                    How can I help you today?
                  </h2>
                </div>

                {/* Gemini 4 Suggestion Cards in a 2x2 grid on mobile, 4 in a row on desktop */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3.5 w-full">
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
            <div className="max-w-3xl mx-auto w-full pb-32 sm:pb-36 pt-4 sm:pt-6 px-3 sm:px-6 md:px-0">
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
                            className="w-full bg-transparent text-[#e3e3e3] text-xs sm:text-sm focus:outline-none resize-none min-h-[60px] sm:min-h-[70px] placeholder-[#8e918f] font-sans"
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
                            <span className="text-[10.5px] sm:text-[11px] text-[#8e918f] mr-auto">Press Enter to save, Shift+Enter for newline</span>
                            <button
                              type="button"
                              onClick={handleCancelEdit}
                              className="px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs font-medium text-[#c4c7c5] hover:text-white hover:bg-white/10 transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSaveAndSubmitEdit(index)}
                              className="px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs font-medium bg-gradient-to-r from-[#4E80EE] to-[#9B72CF] hover:opacity-95 text-white font-semibold transition-all shadow flex items-center gap-1"
                            >
                              <Check size={13} />
                              Save & Submit
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* Display User Bubble */
                        <div className="inline-flex flex-col items-end group/user">
                          {msg.image && (
                            <div className="mb-2 max-w-sm rounded-2xl overflow-hidden border border-white/10 shadow-lg bg-black/40">
                              <img
                                src={msg.image}
                                alt="User uploaded attachment"
                                className="max-h-64 w-auto object-contain rounded-2xl"
                              />
                            </div>
                          )}
                          {msg.content && (
                            <div className="inline-block text-[11px] sm:text-[13.5px] md:text-[14.5px] leading-snug sm:leading-relaxed bg-[#282a2c] text-[#e3e3e3] rounded-2xl sm:rounded-3xl rounded-tr-sm px-3 py-1.5 sm:px-4 sm:py-2.5 border border-white/5 shadow-sm">
                              <p className="whitespace-pre-wrap text-left">{msg.content}</p>
                            </div>
                          )}
                          {/* User action buttons on hover */}
                          <div className="opacity-0 group-hover/user:opacity-100 transition-opacity mt-1 flex items-center gap-1">
                            <button
                              onClick={() => handleStartEdit(index, msg.content)}
                              className="flex items-center gap-1 text-[10px] sm:text-xs text-[#8e918f] hover:text-[#70CFFF] px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md hover:bg-white/5 transition-colors"
                              title="Edit message"
                            >
                              <Pencil size={11} className="sm:w-3 sm:h-3" />
                              <span>Edit</span>
                            </button>
                            <button
                              onClick={() => copyToClipboard(msg.content, index)}
                              className="text-[10px] sm:text-xs text-[#8e918f] hover:text-white px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md hover:bg-white/5 transition-colors"
                              title="Copy text"
                            >
                              <Copy size={11} className="sm:w-3 sm:h-3" />
                            </button>
                          </div>
                        </div>
                      )
                    ) : (
                      /* Assistant Message */
                      <div className="text-left space-y-2">
                        {/* Live Searching Web status indicator */}
                        {isSearchingWeb && index === messages.length - 1 && (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#1c1c1e] border border-white/10 text-[10px] sm:text-xs text-[#8a8a8e] animate-pulse">
                            <Globe size={13} className="text-[#70CFFF] animate-spin" />
                            <span>Searching the web...</span>
                          </div>
                        )}

                        {/* Search Grounding Sources (if available) */}
                        {msg.searchSources && msg.searchSources.length > 0 && (
                          <div className="mb-2 space-y-1">
                            <div className="flex items-center gap-1 text-[10px] sm:text-xs text-[#8a8a8e]">
                              <Globe size={13} className="text-[#70CFFF]" />
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

                        {/* Live Thinking Block (while reasoning pass is running) */}
                        {msg.isThinking && (
                          <div className="mb-2 rounded-xl bg-[#1c1c1e]/60 border border-white/10 p-2 sm:p-2.5 text-[10px] sm:text-xs">
                            <div className="flex items-center gap-1.5 font-medium text-[#c4c7c5] mb-1 text-[10px] sm:text-xs">
                              <Brain size={14} className="text-[#9B72CF] animate-pulse" />
                              <span>Thinking... {thinkingSeconds}s</span>
                            </div>
                            {msg.reasoning && (
                              <div className="border-l-2 border-white/20 pl-2.5 py-0.5 font-mono text-[10px] sm:text-[11.5px] leading-relaxed whitespace-pre-wrap text-[#8a8a8e]">
                                {msg.reasoning}
                                <span className="inline-block w-1 h-3 ml-1 bg-[#9B72CF] animate-pulse align-middle" />
                              </div>
                            )}
                          </div>
                        )}

                        {/* Collapsed Thought Block (after reasoning pass is complete) */}
                        {!msg.isThinking && msg.reasoning && (
                          <div className="mb-2 rounded-xl bg-[#1c1c1e]/40 border border-white/10 overflow-hidden text-[10px] sm:text-xs">
                            <button
                              type="button"
                              onClick={() => toggleThoughtExpanded(index)}
                              className="w-full flex items-center justify-between px-2.5 py-1.5 text-[#8a8a8e] hover:text-[#e8e8e8] hover:bg-white/[0.03] transition-colors cursor-pointer text-left"
                            >
                              <div className="flex items-center gap-1.5 font-medium text-[10px] sm:text-xs">
                                <Brain size={14} className="text-[#9B72CF]" />
                                <span>Thought for {msg.thoughtTime || 4} seconds</span>
                              </div>
                              {expandedThoughts.has(index) ? (
                                <ChevronDown size={14} />
                              ) : (
                                <ChevronRight size={14} />
                              )}
                            </button>
                            {expandedThoughts.has(index) && (
                              <div className="px-2.5 pb-2.5 pt-1 border-t border-white/5">
                                <div className="border-l-2 border-white/20 pl-2.5 py-0.5 font-mono text-[10px] sm:text-[11.5px] leading-relaxed whitespace-pre-wrap text-[#8a8a8e]">
                                  {msg.reasoning}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Final Answer Prose Content */}
                        <div className="prose-chat text-[#e8e8e8] leading-relaxed">
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
                              {isStreaming && index === messages.length - 1 && !msg.isThinking && (
                                <span className="streaming-cursor" title="Streaming..." />
                              )}
                            </>
                          ) : (
                            /* Shimmer Animation only when not thinking */
                            !msg.isThinking && <GeminiThinkingAnimation />
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

        {/* Input Area (DeepSeek Floating Bar) */}
        <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-[#131314] via-[#131314]/95 to-transparent px-2.5 sm:px-4 pt-3 pb-[max(env(safe-area-inset-bottom),14px)] pointer-events-none">
          <div className="max-w-3xl mx-auto w-full relative pointer-events-auto">
            {/* Floating circular down-chevron button to jump to bottom when scrolled up */}
            {showScrollBottom && (
              <button
                type="button"
                onClick={scrollToBottom}
                className="absolute -top-12 right-2 sm:right-4 w-9 h-9 rounded-full bg-[#1c1c1e] hover:bg-[#282a2c] border border-white/15 text-[#e8e8e8] hover:text-white shadow-xl flex items-center justify-center transition-all animate-bounce cursor-pointer z-20"
                title="Jump to bottom"
              >
                <ChevronDown size={18} />
              </button>
            )}

            {/* Hidden file & image inputs */}
            <input
              type="file"
              ref={imageInputRef}
              onChange={handleImageUpload}
              accept="image/*"
              className="hidden"
            />
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".txt,.js,.jsx,.ts,.tsx,.py,.json,.html,.css,.md,.csv,.c,.cpp,.java,.go,.rs"
              className="hidden"
            />

            <form onSubmit={handleSubmit} className="relative bg-[#1e1f20] rounded-[20px] sm:rounded-[24px] border border-white/10 focus-within:border-white/25 transition-all shadow-2xl overflow-hidden">
              {attachedImage && (
                <div className="px-3 py-1.5 flex items-center gap-2 border-b border-white/5 bg-white/[0.02]">
                  <div className="relative group shrink-0">
                    <img
                      src={attachedImage.dataUrl}
                      alt="Attachment preview"
                      className="h-10 w-10 object-cover rounded-lg border border-white/10 shadow"
                    />
                    <button
                      type="button"
                      onClick={() => setAttachedImage(null)}
                      className="absolute -top-1.5 -right-1.5 bg-black/80 hover:bg-red-500 text-white rounded-full p-0.5 border border-white/20 shadow transition-colors cursor-pointer"
                      title="Remove image"
                    >
                      <X size={10} />
                    </button>
                  </div>
                  <div className="text-[10px] sm:text-xs min-w-0 flex-1">
                    <p className="text-[#e3e3e3] font-medium truncate">{attachedImage.name}</p>
                    <p className="text-[9px] text-[#70CFFF]">Gemini Vision ready</p>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5">
                {/* Circular Plus button for attachments */}
                <button
                  type="button"
                  onClick={() => setIsAttachmentOpen(!isAttachmentOpen)}
                  className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white/5 hover:bg-white/10 text-[#c4c7c5] hover:text-white transition-colors flex items-center justify-center shrink-0 cursor-pointer border border-white/5"
                  title="Add attachment"
                >
                  <Plus size={16} />
                </button>

                {/* Redesigned Mini Think Button on the search bar */}
                <button
                  type="button"
                  onClick={toggleThink}
                  className={`inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-medium transition-all shrink-0 cursor-pointer border ${
                    isThinkEnabled
                      ? 'bg-[#9B72CF]/25 text-[#D8B4FE] border-[#9B72CF]/60 shadow-[0_0_8px_rgba(155,114,207,0.3)]'
                      : 'bg-white/[0.04] text-[#8a8a8e] border-white/10 hover:text-[#e8e8e8] hover:bg-white/[0.08]'
                  }`}
                  title="Toggle Reasoning Pass (Think)"
                >
                  <Brain size={12} className={isThinkEnabled ? 'text-[#D8B4FE]' : 'text-[#8a8a8e]'} />
                  <span>Think</span>
                  {isThinkEnabled && <span className="w-1 h-1 rounded-full bg-[#D8B4FE] animate-pulse" />}
                </button>

                {/* Redesigned Mini Search Button on the search bar */}
                <button
                  type="button"
                  onClick={toggleSearch}
                  className={`inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-medium transition-all shrink-0 cursor-pointer border ${
                    isSearchEnabled
                      ? 'bg-[#4E80EE]/25 text-[#70CFFF] border-[#4E80EE]/60 shadow-[0_0_8px_rgba(78,128,238,0.3)]'
                      : 'bg-white/[0.04] text-[#8a8a8e] border-white/10 hover:text-[#e8e8e8] hover:bg-white/[0.08]'
                  }`}
                  title="Toggle Web Search Grounding"
                >
                  <Globe size={12} className={isSearchEnabled ? 'text-[#70CFFF]' : 'text-[#8a8a8e]'} />
                  <span>Search</span>
                  {isSearchEnabled && <span className="w-1 h-1 rounded-full bg-[#70CFFF] animate-pulse" />}
                </button>

                {/* Auto-expanding Input textarea */}
                <textarea
                  rows={1}
                  placeholder="Type a message or hold to speak"
                  className="flex-1 bg-transparent text-[#e8e8e8] focus:outline-none placeholder-[#8a8a8e] text-[11px] sm:text-sm px-1 py-1 resize-none max-h-32 custom-scrollbar min-w-0 leading-tight"
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
                <div className="flex items-center gap-1 shrink-0">
                  {/* Circular Voice Button */}
                  <button
                    type="button"
                    onClick={() => setIsVoiceModeOpen(true)}
                    className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white/5 hover:bg-white/10 text-[#c4c7c5] hover:text-white transition-colors flex items-center justify-center cursor-pointer border border-white/5"
                    title="Start Live Voice Conversation"
                  >
                    <Mic size={15} />
                  </button>

                  {/* Circular Send or Stop button */}
                  {isStreaming ? (
                    <button
                      type="button"
                      onClick={stopGeneration}
                      className="w-7 h-7 sm:w-8 sm:h-8 bg-white text-[#131314] hover:bg-gray-200 rounded-full transition-all shadow-md flex items-center justify-center cursor-pointer"
                      title="Stop generation"
                    >
                      <Square size={11} className="fill-current sm:w-3 sm:h-3" />
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={(!input.trim() && !attachedImage) || isLoading}
                      className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full transition-all flex items-center justify-center cursor-pointer ${
                        (input.trim() || attachedImage) && !isLoading
                          ? 'bg-white text-[#131314] hover:bg-gray-200 shadow-md scale-100 hover:scale-105 active:scale-95'
                          : 'bg-white/5 text-[#8a8a8e] cursor-not-allowed'
                      }`}
                      title="Send message"
                    >
                      <Send size={13} />
                    </button>
                  )}
                </div>
              </div>
            </form>
            <div className="text-center mt-1 flex items-center justify-center px-2">
              <p className="text-[9px] sm:text-[11px] text-[#8a8a8e] truncate">Gabby may display inaccurate info, including about people, so double-check its responses.</p>
            </div>
          </div>
        </div>

        {/* Global Model Selector Dropdown Modal */}
        {isModelSelectorOpen && (
          <div className="fixed inset-0 z-50 flex items-start sm:items-end justify-center sm:justify-end p-4 sm:p-20 bg-black/40 backdrop-blur-xs" onClick={() => setIsModelSelectorOpen(false)}>
            <div
              className="w-full max-w-xs bg-[#1e1f20] border border-white/10 rounded-2xl shadow-2xl overflow-hidden p-2 space-y-1 animate-fade-in mt-14 sm:mt-0"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-3 py-1.5 text-xs font-semibold text-[#8e918f] border-b border-white/5">
                Choose Gemini Model
              </div>
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
                  <span className="text-[10px] bg-[#4E80EE]/20 text-[#70CFFF] px-1.5 py-0.5 rounded-full font-mono">⚡ Ultra Fast</span>
                </div>
                <div className="text-[11px] text-[#8e918f] mt-0.5">Top-speed sub-second response & deep intelligence</div>
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
                <div className="text-[11px] text-[#8e918f] mt-0.5">Deep reasoning and complex multimodal queries</div>
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
                <div className="text-[11px] text-[#8e918f] mt-0.5">Sub-second immediate voice & quick replies</div>
              </button>
            </div>
          </div>
        )}

        {/* Global Gemini Voice Selector Dropdown Modal */}
        {isVoiceSelectorOpen && (
          <div
            className="fixed inset-0 z-50 flex items-start sm:items-end justify-center sm:justify-end p-4 sm:p-20 bg-black/40 backdrop-blur-xs"
            onClick={() => setIsVoiceSelectorOpen(false)}
          >
            <div
              className="w-full max-w-xs bg-[#1e1f20] border border-white/10 rounded-2xl shadow-2xl overflow-hidden p-2 space-y-1 animate-fade-in mt-14 sm:mt-0"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-3 py-1.5 text-xs font-semibold text-[#8e918f] border-b border-white/5 flex items-center justify-between">
                <span>Gemini Neural Voices</span>
                <span className="text-[10px] text-[#70CFFF] font-mono">Studio 24kHz</span>
              </div>
              {GEMINI_VOICES.map((v) => (
                <button
                  key={v.name}
                  onClick={() => {
                    setSelectedGeminiVoice(v.name);
                    setIsVoiceSelectorOpen(false);
                    toast.success(`Voice set to ${v.name} (${v.gender})`);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-xl transition-colors ${
                    selectedGeminiVoice === v.name
                      ? 'bg-[#4E80EE]/20 text-[#70CFFF] border border-[#4E80EE]/30'
                      : 'text-[#c4c7c5] hover:bg-[#282a2c]'
                  }`}
                >
                  <div className="font-semibold text-xs flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Volume2 size={13} className={selectedGeminiVoice === v.name ? 'text-[#70CFFF]' : 'text-gray-400'} />
                      <span>{v.name}</span>
                    </span>
                    <span className="text-[10px] bg-white/5 px-1.5 py-0.5 rounded text-gray-300 font-mono">
                      {v.gender}
                    </span>
                  </div>
                  <div className="text-[11px] text-[#8e918f] mt-0.5 pl-5">{v.description}</div>
                </button>
              ))}
            </div>
          </div>
        )}
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
              <div className="flex items-center gap-2">
                {activeGem && (
                  <button
                    onClick={() => {
                      setActiveGem(null);
                      toast('Reset to default Gemini persona', { icon: '✨' });
                    }}
                    className="text-xs text-purple-300 hover:text-white px-2 py-1 rounded-md bg-purple-500/20 border border-purple-500/30 transition-colors cursor-pointer"
                  >
                    Reset
                  </button>
                )}
                <button
                  onClick={() => setIsGemsOpen(false)}
                  className="p-2 hover:bg-white/5 rounded-lg text-gray-400 hover:text-white transition-colors cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
              <p className="text-sm text-gray-400 mb-4">Select a specialized AI persona to configure Gabby's intelligence</p>

              {/* Gem Cards */}
              <button
                onClick={() => handleSelectGem('code')}
                className={`w-full p-4 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 border transition-all text-left group cursor-pointer ${
                  activeGem === 'code' ? 'border-purple-400 ring-2 ring-purple-500/50 shadow-lg' : 'border-purple-500/30 hover:border-purple-400/50'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shrink-0">
                    <Code size={20} className="text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h3 className="text-white font-medium mb-1">Code Expert</h3>
                      {activeGem === 'code' && (
                        <span className="text-[10px] bg-purple-500/40 text-purple-200 px-2 py-0.5 rounded-full font-semibold">Active</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400">Specialized in programming, debugging, architecture, and code reviews</p>
                  </div>
                </div>
              </button>

              <button
                onClick={() => handleSelectGem('writing')}
                className={`w-full p-4 rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border transition-all text-left group cursor-pointer ${
                  activeGem === 'writing' ? 'border-blue-400 ring-2 ring-blue-500/50 shadow-lg' : 'border-blue-500/30 hover:border-blue-400/50'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shrink-0">
                    <FileText size={20} className="text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h3 className="text-white font-medium mb-1">Writing Assistant</h3>
                      {activeGem === 'writing' && (
                        <span className="text-[10px] bg-blue-500/40 text-blue-200 px-2 py-0.5 rounded-full font-semibold">Active</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400">Expert in creative writing, editing, copywriting, and storytelling</p>
                  </div>
                </div>
              </button>

              <button
                onClick={() => handleSelectGem('math')}
                className={`w-full p-4 rounded-xl bg-gradient-to-br from-green-500/20 to-emerald-500/20 border transition-all text-left group cursor-pointer ${
                  activeGem === 'math' ? 'border-green-400 ring-2 ring-green-500/50 shadow-lg' : 'border-green-500/30 hover:border-green-400/50'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center shrink-0">
                    <Calculator size={20} className="text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h3 className="text-white font-medium mb-1">Math Tutor</h3>
                      {activeGem === 'math' && (
                        <span className="text-[10px] bg-green-500/40 text-green-200 px-2 py-0.5 rounded-full font-semibold">Active</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400">Step-by-step math solver, proofs, calculations, and STEM reasoning</p>
                  </div>
                </div>
              </button>

              <button
                onClick={() => handleSelectGem('brainstorm')}
                className={`w-full p-4 rounded-xl bg-gradient-to-br from-orange-500/20 to-red-500/20 border transition-all text-left group cursor-pointer ${
                  activeGem === 'brainstorm' ? 'border-orange-400 ring-2 ring-orange-500/50 shadow-lg' : 'border-orange-500/30 hover:border-orange-400/50'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center shrink-0">
                    <Sparkles size={20} className="text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h3 className="text-white font-medium mb-1">Creative Brainstormer</h3>
                      {activeGem === 'brainstorm' && (
                        <span className="text-[10px] bg-orange-500/40 text-orange-200 px-2 py-0.5 rounded-full font-semibold">Active</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400">Out-of-the-box conceptual thinking, innovative strategies, and ideas</p>
                  </div>
                </div>
              </button>

              <button
                onClick={() => handleSelectGem('research')}
                className={`w-full p-4 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border transition-all text-left group cursor-pointer ${
                  activeGem === 'research' ? 'border-indigo-400 ring-2 ring-indigo-500/50 shadow-lg' : 'border-indigo-500/30 hover:border-indigo-400/50'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center shrink-0">
                    <Search size={20} className="text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h3 className="text-white font-medium mb-1">Research Assistant</h3>
                      {activeGem === 'research' && (
                        <span className="text-[10px] bg-indigo-500/40 text-indigo-200 px-2 py-0.5 rounded-full font-semibold">Active</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400">Deep academic synthesis, fact-checking, literature review, and citations</p>
                  </div>
                </div>
              </button>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-white/10">
              <button
                onClick={() => {
                  const customPersona = prompt('Enter a custom instruction or persona for Gabby:');
                  if (customPersona && customPersona.trim()) {
                    setActiveGem('custom:' + customPersona.trim());
                    setIsGemsOpen(false);
                    toast.success('Custom Gem persona activated!');
                  }
                }}
                className="w-full px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
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

              {/* Gemini Voice Section */}
              <div>
                <h3 className="text-sm font-medium text-gray-400 mb-3 flex items-center gap-2">
                  <Volume2 size={16} />
                  Gemini Neural Voice
                </h3>
                <div className="space-y-2">
                  <div className="p-3 rounded-lg bg-white/5 space-y-2">
                    <label className="text-xs text-gray-400">Default Speaking Voice</label>
                    <select
                      value={selectedGeminiVoice}
                      onChange={(e) => {
                        setSelectedGeminiVoice(e.target.value);
                        toast.success(`Voice set to ${e.target.value}`);
                      }}
                      className="w-full px-3 py-2 bg-[#131314] border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-[#70CFFF] cursor-pointer"
                    >
                      {GEMINI_VOICES.map((v) => (
                        <option key={v.name} value={v.name}>
                          {v.name} ({v.gender}) - {v.description}
                        </option>
                      ))}
                    </select>
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
            className="absolute bottom-24 left-4 sm:left-8 w-64 bg-[#1e1f20] border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-2 space-y-1">
              <button
                type="button"
                onClick={() => {
                  setIsAttachmentOpen(false);
                  fileInputRef.current?.click();
                }}
                className="w-full text-left px-3 py-2.5 rounded-xl text-gray-300 hover:bg-[#282a2c] transition-colors flex items-center gap-3 cursor-pointer"
              >
                <FileText size={18} className="text-[#4E80EE]" />
                <div>
                  <div className="font-medium text-xs text-white">Upload code / text</div>
                  <div className="text-[11px] text-[#8e918f]">JS, PY, HTML, TXT, JSON</div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsAttachmentOpen(false);
                  imageInputRef.current?.click();
                }}
                className="w-full text-left px-3 py-2.5 rounded-xl text-gray-300 hover:bg-[#282a2c] transition-colors flex items-center gap-3 cursor-pointer"
              >
                <span className="text-lg">🖼️</span>
                <div>
                  <div className="font-medium text-xs text-white">Upload image (Vision)</div>
                  <div className="text-[11px] text-[#8e918f]">JPG, PNG, WebP, GIF</div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Speech Status Pill when reading aloud in chat */}
      {(speakingIndex !== null || audioLoadingIndex !== null) && (
        <div className="fixed bottom-28 right-6 z-40 flex items-center gap-3 bg-[#1e2330]/95 backdrop-blur-md border border-[#4E80EE]/40 text-white px-4 py-2.5 rounded-full shadow-2xl animate-fade-in">
          <div className="flex items-center gap-1">
            <span className="live-eq-bar bg-[#70CFFF] !h-4" />
            <span className="live-eq-bar bg-[#70CFFF] !h-4" />
            <span className="live-eq-bar bg-[#70CFFF] !h-4" />
          </div>
          <span className="text-xs text-gray-200 font-medium">
            {audioLoadingIndex !== null ? 'Gemini audio loading...' : `Gabby speaking (${selectedGeminiVoice})...`}
          </span>
          <button
            onClick={() => {
              stopGeminiVoice();
              if ('speechSynthesis' in window) window.speechSynthesis.cancel();
              setSpeakingIndex(null);
              setAudioLoadingIndex(null);
              toast('Speech stopped', { icon: '⏹', id: 'tts-stopped' });
            }}
            className="px-3 py-1 text-xs bg-white/10 hover:bg-white/20 text-gray-200 rounded-full font-semibold transition-all border border-white/20 flex items-center gap-1 cursor-pointer"
          >
            <Square size={10} className="fill-current" />
            <span>Stop (Esc)</span>
          </button>
        </div>
      )}

      {/* Live Voice Mode Overlay (Gemini 24kHz Studio Voice Style) */}
      {isVoiceModeOpen && (
        <VoiceModeModal
          isOpen={isVoiceModeOpen}
          onClose={() => {
            setIsVoiceModeOpen(false);
            stopGeminiVoice();
            if ('speechSynthesis' in window) {
              window.speechSynthesis.cancel();
            }
          }}
          onSendMessage={handleVoiceMessage}
          onAbort={handleAbortStream}
          onNewChat={createNewChat}
          messages={messages}
          selectedVoice={selectedGeminiVoice}
          onVoiceChange={setSelectedGeminiVoice}
          apiKey={getClientGeminiKey()}
          activeGem={activeGem}
          onType={() => {
            setIsVoiceModeOpen(false);
            stopGeminiVoice();
            setTimeout(() => {
              const inputEl = document.querySelector('textarea');
              if (inputEl) inputEl.focus();
            }, 100);
          }}
        />
      )}

      {/* Vercel Speed Insights */}
      <SpeedInsights />


    </div>
  );
}

export default App;
