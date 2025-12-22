// src/App.jsx
import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Sparkles, Menu, Plus, MessageSquare, Settings, LogOut, Copy, RotateCcw, Square, Trash2, X, Code, Calculator, Search, FileText, ChevronRight, Zap, ChevronDown, Star, Bookmark, Folder, Gem, HelpCircle, Moon, Bell, Shield, Info } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import toast, { Toaster } from 'react-hot-toast';

function App() {
  // State
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isToolsOpen, setIsToolsOpen] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState(null);
  const [copiedCodeBlock, setCopiedCodeBlock] = useState(null);

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
  const [selectedModel, setSelectedModel] = useState('fast');

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
      const response = await fetch('http://localhost:8000/api/chats');
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
      const response = await fetch(`http://localhost:8000/api/chats/${chatId}`);
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
                await fetch(`http://localhost:8000/api/chats/${chatId}`, { method: 'DELETE' });
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
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      setIsStreaming(false);
      setIsLoading(false);
    }
  };

  const copyToClipboard = async (text, index) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (err) {
      console.error('Copy failed', err);
    }
  };

  const copyCodeToClipboard = async (code, blockId) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCodeBlock(blockId);
      setTimeout(() => setCopiedCodeBlock(null), 2000);
    } catch (err) {
      console.error('Copy code failed', err);
    }
  };

  const regenerateMessage = async (assistantIndex) => {
    const userIdx = messages
      .slice(0, assistantIndex)
      .reverse()
      .findIndex((msg) => msg.role === 'user');
    if (userIdx === -1) return;
    const userMsgIndex = assistantIndex - 1 - userIdx;
    const userMsg = messages[userMsgIndex];

    setMessages((prev) => {
      const newMsgs = [...prev];
      newMsgs[assistantIndex] = { role: 'assistant', content: '' };
      return newMsgs;
    });

    await streamResponse(userMsg.content, currentChatId);
  };

  const streamResponse = async (message, chatIdToUse) => {
    setIsLoading(true);
    setIsStreaming(true);

    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

    try {
      const response = await fetch('http://localhost:8000/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, chat_id: chatIdToUse })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Stream response not ok:', response.status, errorText);
        throw new Error(`Server error: ${response.status} ${errorText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let streamed = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              setIsStreaming(false);
              setIsLoading(false);
              // Refresh chat list to update titles/order
              fetchChats();

              return;
            }
            try {
              const parsed = JSON.parse(data);
              if (parsed.text) {
                streamed += parsed.text;
                setMessages((prev) => {
                  const newMsgs = [...prev];
                  newMsgs[newMsgs.length - 1].content = streamed;
                  return newMsgs;
                });
              } else if (parsed.info) {
                // Show info message (like "Retrying in X seconds...")
                setMessages((prev) => {
                  const newMsgs = [...prev];
                  // Append info to content temporarily or just update it
                  // We'll append it in italics to distinguish it
                  newMsgs[newMsgs.length - 1].content = streamed + `\n\n*${parsed.info}*`;
                  return newMsgs;
                });
              } else if (parsed.error) {
                throw new Error(parsed.error);
              }
            } catch (e) {
              console.error('Parse error', e);
            }
          }
        }
      }
    } catch (err) {
      console.error('Stream error', err);
      setMessages((prev) => {
        const newMsgs = [...prev];
        newMsgs[newMsgs.length - 1].content = 'Error: ' + err.message;
        return newMsgs;
      });
    } finally {
      setIsStreaming(false);
      setIsLoading(false);
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
        const res = await fetch('http://localhost:8000/api/chats', {
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
                  await fetch(`http://localhost:8000/api/chats/${chat.id}`, { method: 'DELETE' });
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

  // Helper components - Glowing Arc (Large)
  const ThinkingArc = () => (
    <div className="flex items-center justify-center p-4">
      <div className="glowing-arc"></div>
    </div>
  );

  // Helper components - Gemini-style thinking dots (Restored)
  const LoadingDots = () => (
    <div className="gemini-thinking-container">
      <div className="gemini-dot"></div>
      <div className="gemini-dot"></div>
      <div className="gemini-dot"></div>
    </div>
  );

  const renderMessageActions = (msg, index) => {
    if (msg.role !== 'assistant') return null;
    return (
      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => copyToClipboard(msg.content, index)}
          className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors text-xs flex items-center gap-1"
          title="Copy message"
        >
          <Copy size={14} />
          {copiedIndex === index && <span className="text-xs">Copied!</span>}
        </button>
        <button
          onClick={() => regenerateMessage(index)}
          className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors"
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
      className="glass-card p-6 rounded-2xl text-left group cursor-pointer animate-fade-in"
    >
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500/20 to-emerald-500/20 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
          <Icon size={24} className="text-green-400" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-white mb-1">{title}</h3>
          <p className="text-sm text-gray-400">{description}</p>
        </div>
        <ChevronRight size={20} className="text-gray-500 group-hover:text-green-400 transition-colors" />
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
      <aside className={`${isSidebarOpen ? 'w-[260px]' : 'w-[56px]'} bg-[#1E1E1E] transition-all duration-300 ease-in-out flex flex-col border-r border-white/10 relative shrink-0`}>
        {isSidebarOpen ? (
          <>
            {/* Sidebar Header - Full */}
            <div className="flex items-center justify-between p-3 border-b border-white/10">
              <button
                onClick={() => setIsSidebarOpen(false)}
                className="p-2 hover:bg-white/5 rounded-lg text-gray-400 hover:text-white transition-colors"
              >
                <Menu size={20} />
              </button>
              <button
                onClick={() => setIsSearchOpen(true)}
                className="p-2 hover:bg-white/5 rounded-lg text-gray-400 hover:text-white transition-colors"
                title="Search chats"
              >
                <Search size={20} />
              </button>
            </div>

            {/* New Chat Button - Full */}
            <div className="p-3">
              <button
                onClick={createNewChat}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/5 transition-colors text-sm font-medium text-left text-gray-300 hover:text-white"
              >
                <Plus size={18} />
                <span>New chat</span>
              </button>
            </div>

            {/* Chat Sections - Full */}
            <div className="flex-1 overflow-y-auto px-2 space-y-4 custom-scrollbar">
              {/* My Stuff Section */}
              <div>
                <button
                  onClick={() => setIsMyStuffOpen(true)}
                  className="w-full flex items-center justify-between px-3 py-2 text-sm text-gray-400 hover:text-white transition-colors"
                >
                  <span className="font-medium">My Stuff</span>
                  <ChevronRight size={16} />
                </button>
              </div>

              {/* Gems Section */}
              <div>
                <button
                  onClick={() => setIsGemsOpen(true)}
                  className="w-full flex items-center justify-between px-3 py-2 text-sm text-gray-400 hover:text-white transition-colors"
                >
                  <span className="font-medium">Gems</span>
                  <ChevronRight size={16} />
                </button>
              </div>

              {/* Chats Section */}
              <div>
                <div className="px-3 py-2 text-sm font-medium text-gray-400">Chats</div>
                <div className="space-y-1">
                  {chats.map((chat) => (
                    <div key={chat.id} className="group relative">
                      <button
                        onClick={() => loadChat(chat.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm text-left truncate ${currentChatId === chat.id ? 'bg-white/10 text-white' : 'text-gray-300 hover:bg-white/5'}`}
                      >
                        <span className="truncate flex-1">{chat.title || 'New Chat'}</span>
                      </button>
                      <button
                        onClick={(e) => deleteChat(e, chat.id)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>


            {/* Settings Footer - Full */}
            <div className="p-3 border-t border-white/10">
              <button
                onClick={() => setIsSettingsOpen(true)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/5 transition-colors text-sm text-left text-gray-300 hover:text-white"
              >
                <Settings size={18} />
                <span>Settings & help</span>
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Collapsed Sidebar - Icon Rail */}
            <div className="flex flex-col items-center py-3 space-y-2">
              <button
                onClick={() => setIsSidebarOpen(true)}
                className="p-3 hover:bg-white/5 rounded-lg text-gray-400 hover:text-white transition-colors"
                title="Expand sidebar"
              >
                <Menu size={20} />
              </button>
              <button
                onClick={createNewChat}
                className="p-3 hover:bg-white/5 rounded-lg text-gray-400 hover:text-white transition-colors"
                title="New chat"
              >
                <Plus size={20} />
              </button>
            </div>

            {/* Settings Icon at Bottom */}
            <div className="mt-auto flex flex-col items-center py-3 border-t border-white/10">
              <button
                onClick={() => setIsSettingsOpen(true)}
                className="p-3 hover:bg-white/5 rounded-lg text-gray-400 hover:text-white transition-colors"
                title="Settings & help"
              >
                <Settings size={20} />
              </button>
            </div>
          </>
        )}
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full relative min-w-0">
        {/* Header */}
        <header className="h-14 flex items-center px-4 justify-between bg-[var(--color-background-dark)] border-b border-white/5 z-10">
          <div className="flex items-center gap-3">
            <span className="text-lg font-normal text-white">Gabby</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-sm font-medium text-white">
              G
            </div>
          </div>
        </header>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto scroll-smooth relative">
          {messages.length === 0 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4">
              <div className="max-w-3xl w-full space-y-8 animate-fade-in">
                {/* Gabby Icon and Greeting */}
                <div className="flex flex-col items-center mb-8">
                  <div className="mb-6 flex items-center gap-3">
                    <Sparkles size={32} className="text-blue-400" />
                    <h1 className="text-4xl font-normal text-white">Hi Gabriel</h1>
                  </div>
                </div>

                {/* Suggestion Pills */}
                <div className="flex flex-wrap items-center justify-center gap-3 px-4">
                  <button
                    onClick={() => handleSuggestionClick('Create an image')}
                    className="px-4 py-2.5 rounded-full bg-[#2A2A2A] hover:bg-[#333333] text-white text-sm transition-colors border border-white/10 flex items-center gap-2"
                  >
                    <span>🔥</span>
                    <span>Create image</span>
                  </button>
                  <button
                    onClick={() => handleSuggestionClick('Create a video')}
                    className="px-4 py-2.5 rounded-full bg-[#2A2A2A] hover:bg-[#333333] text-white text-sm transition-colors border border-white/10"
                  >
                    Create video
                  </button>
                  <button
                    onClick={() => handleSuggestionClick('Write anything')}
                    className="px-4 py-2.5 rounded-full bg-[#2A2A2A] hover:bg-[#333333] text-white text-sm transition-colors border border-white/10"
                  >
                    Write anything
                  </button>
                  <button
                    onClick={() => handleSuggestionClick('Help me learn')}
                    className="px-4 py-2.5 rounded-full bg-[#2A2A2A] hover:bg-[#333333] text-white text-sm transition-colors border border-white/10"
                  >
                    Help me learn
                  </button>
                  <button
                    onClick={() => handleSuggestionClick('Boost my day')}
                    className="px-4 py-2.5 rounded-full bg-[#2A2A2A] hover:bg-[#333333] text-white text-sm transition-colors border border-white/10"
                  >
                    Boost my day
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto w-full pb-32 pt-4 px-4">
              {messages.map((msg, index) => (
                <div key={index} className={`group flex gap-6 mb-8 ${msg.role === 'assistant' ? 'items-start' : 'items-start flex-row-reverse'}`}>
                  <div className="relative shrink-0">
                    {/* Pulsing ring when AI is thinking - Gemini Style */}
                    {msg.role === 'assistant' && !msg.content && isLoading && (
                      <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-blue-400 via-cyan-400 to-purple-500 blur-sm opacity-50 animate-pulse" />
                    )}
                    {/* Avatar with glowing effect for AI */}
                    <div className={`relative w-8 h-8 rounded-full flex items-center justify-center ${msg.role === 'assistant' ? (isLoading && !msg.content ? 'bg-transparent shadow-none' : 'bg-cyan-500 shadow-lg shadow-cyan-500/50') : 'bg-gray-600'}`}>
                      {msg.role === 'assistant' && isLoading && !msg.content ? (
                        <div className="avatar-loader"></div>
                      ) : (
                        <User size={18} className="text-white" />
                      )}
                    </div>
                  </div>
                  <div className={`flex-1 max-w-[85%] space-y-2 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                    <div className={`inline-block text-[15px] leading-relaxed ${msg.role === 'assistant' ? 'text-gray-100' : 'bg-[var(--color-surface-dark)] text-white rounded-2xl px-5 py-3'}`}>
                      {msg.role === 'assistant' ? (
                        msg.content ? (
                          <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                            pre: ({ children }) => <>{children}</>,
                            p: ({ children }) => <div className="mb-2 last:mb-0">{children}</div>,
                            code({ node, inline, className, children, ...props }) {
                              const match = /language-(\w+)/.exec(className || '');
                              return !inline ? (
                                <div className="relative my-4 rounded-lg overflow-hidden bg-black/40 border border-white/10 group/code text-left">
                                  <div className="flex items-center justify-between px-4 py-2 bg-white/5 border-b border-white/10">
                                    <span className="text-xs text-gray-400 font-mono">{match ? match[1] : 'code'}</span>
                                    <button
                                      onClick={() => {
                                        const codeText = String(children).replace(/\n$/, '');
                                        const blockId = `${index}-${match ? match[1] : 'code'}`;
                                        copyCodeToClipboard(codeText, blockId);
                                      }}
                                      className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                                      title="Copy code"
                                    >
                                      <Copy size={12} />
                                      {copiedCodeBlock === `${index}-${match ? match[1] : 'code'}` ? <span>Copied!</span> : <span>Copy</span>}
                                    </button>
                                  </div>
                                  <pre className="p-4 overflow-x-auto"><code className={className} {...props}>{children}</code></pre>
                                </div>
                              ) : (
                                <code className="bg-white/10 px-1.5 py-0.5 rounded text-sm font-mono text-teal-300" {...props}>{children}</code>
                              );
                            }
                          }}>
                            {msg.content}
                          </ReactMarkdown>
                        ) : (
                          <LoadingDots />
                        )
                      ) : (
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      )}
                    </div>
                    {renderMessageActions(msg, index)}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>





        {/* Input Area */}
        <div className={`absolute bottom-0 left-0 w-full bg-gradient-to-t from-[var(--color-background-dark)] via-[var(--color-background-dark)] to-transparent px-4 ${isMobile ? 'mobile-input-container pb-4' : 'pt-10 pb-6'}`}>
          <div className="max-w-3xl mx-auto w-full relative">
            <form onSubmit={handleSubmit} className="relative bg-[#2A2A2A] rounded-3xl border border-white/10 focus-within:border-white/20 transition-colors shadow-lg">
              <div className="flex items-center gap-2 px-4 py-3">
                {/* Plus button for attachments */}
                <button
                  type="button"
                  onClick={() => setIsAttachmentOpen(!isAttachmentOpen)}
                  className="p-2 hover:bg-white/5 rounded-lg text-gray-400 hover:text-white transition-colors"
                  title="Add attachment"
                >
                  <Plus size={20} />
                </button>

                {/* Input field */}
                <input
                  type="text"
                  placeholder="Ask Gabby"
                  className="flex-1 bg-transparent text-white focus:outline-none placeholder-gray-400"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  disabled={isLoading}
                />

                {/* Right side buttons */}
                <div className="flex items-center gap-1">
                  {/* Tools button */}
                  <button
                    type="button"
                    onClick={() => setIsToolsOpen(!isToolsOpen)}
                    className="px-3 py-1.5 hover:bg-white/5 rounded-lg text-gray-400 hover:text-white transition-colors flex items-center gap-1.5 text-sm"
                    title="Tools"
                  >
                    <Zap size={16} />
                    <span>Tools</span>
                  </button>

                  {/* Model selector */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setIsModelSelectorOpen(!isModelSelectorOpen)}
                      className="px-3 py-1.5 hover:bg-white/5 rounded-lg text-gray-400 hover:text-white transition-colors flex items-center gap-1.5 text-sm"
                      title="Select model"
                    >
                      <span>{selectedModel === 'fast' ? 'Fast' : selectedModel === 'advanced' ? 'Advanced' : 'Experimental'}</span>
                      <ChevronDown size={16} />
                    </button>

                    {/* Model selector dropdown */}
                    {isModelSelectorOpen && (
                      <div className="absolute bottom-full right-0 mb-2 w-56 bg-[#2A2A2A] border border-white/10 rounded-lg shadow-xl overflow-hidden z-50">
                        <div className="p-2 space-y-1">
                          <button
                            onClick={() => {
                              setSelectedModel('fast');
                              setIsModelSelectorOpen(false);
                            }}
                            className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors ${selectedModel === 'fast' ? 'bg-white/10 text-white' : 'text-gray-300 hover:bg-white/5'}`}
                          >
                            <div className="font-medium text-sm">Fast</div>
                            <div className="text-xs text-gray-400 mt-0.5">Gemini 1.5 Flash - Quick responses</div>
                          </button>
                          <button
                            onClick={() => {
                              setSelectedModel('advanced');
                              setIsModelSelectorOpen(false);
                            }}
                            className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors ${selectedModel === 'advanced' ? 'bg-white/10 text-white' : 'text-gray-300 hover:bg-white/5'}`}
                          >
                            <div className="font-medium text-sm">Advanced</div>
                            <div className="text-xs text-gray-400 mt-0.5">Gemini 1.5 Pro - Better reasoning</div>
                          </button>
                          <button
                            onClick={() => {
                              setSelectedModel('experimental');
                              setIsModelSelectorOpen(false);
                            }}
                            className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors ${selectedModel === 'experimental' ? 'bg-white/10 text-white' : 'text-gray-300 hover:bg-white/5'}`}
                          >
                            <div className="font-medium text-sm">Experimental</div>
                            <div className="text-xs text-gray-400 mt-0.5">Gemini 2.0 - Latest features</div>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>



                  {/* Send/Stop button */}
                  {isStreaming ? (
                    <button
                      type="button"
                      onClick={stopGeneration}
                      className="p-2 bg-white text-black rounded-lg hover:bg-gray-200 transition-colors"
                      title="Stop generation"
                    >
                      <Square size={16} fill="currentColor" />
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={!input.trim()}
                      className={`p-2 rounded-lg transition-colors ${input.trim() ? 'bg-blue-600 text-white hover:bg-blue-500' : 'bg-transparent text-gray-500 cursor-not-allowed'}`}
                      title="Send message"
                    >
                      <Send size={18} />
                    </button>
                  )}
                </div>
              </div>
            </form>
            <div className="text-center mt-2">
              <p className="text-xs text-gray-500">Gabby can make mistakes. Check important info.</p>
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

    </div>
  );
}

export default App;
