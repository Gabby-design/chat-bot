import React, { useState, useEffect, useRef } from 'react';
import { 
  Database, 
  Upload, 
  Trash2, 
  RefreshCw, 
  Server, 
  FileText, 
  Check, 
  AlertCircle, 
  Search, 
  Plus, 
  X, 
  Tag, 
  Cpu, 
  ChevronRight, 
  ChevronDown 
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function KnowledgeManager({ apiBaseUrl = '' }) {
  const [activeTab, setActiveTab] = useState('knowledge'); // 'knowledge' | 'mcp'
  const [snippets, setSnippets] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  // Manual note input state
  const [showManualForm, setShowManualForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newTags, setNewTags] = useState('');

  // MCP status state
  const [mcpStatus, setMcpStatus] = useState(null);
  const [isReloadingMcp, setIsReloadingMcp] = useState(false);

  const fileInputRef = useRef(null);

  // Fetch knowledge items
  const fetchSnippets = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${apiBaseUrl}/api/knowledge/list?limit=100`);
      if (res.ok) {
        const data = await res.json();
        setSnippets(data.items || []);
      }
    } catch (err) {
      console.warn('Failed to load knowledge snippets:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch MCP server status
  const fetchMcpStatus = async () => {
    try {
      const res = await fetch(`${apiBaseUrl}/api/mcp/servers`);
      if (res.ok) {
        const data = await res.json();
        setMcpStatus(data);
      }
    } catch (err) {
      console.warn('Failed to fetch MCP status:', err);
    }
  };

  useEffect(() => {
    fetchSnippets();
    fetchMcpStatus();
  }, []);

  // Handle manual snippet creation
  const handleCreateSnippet = async (e) => {
    e.preventDefault();
    if (!newContent.trim()) {
      toast.error('Snippet content cannot be empty');
      return;
    }

    const tagsArray = newTags
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);

    try {
      const res = await fetch(`${apiBaseUrl}/api/knowledge/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle.trim() || 'Untitled Note',
          content: newContent.trim(),
          tags: tagsArray,
          source: 'manual_entry'
        })
      });

      if (res.ok) {
        toast.success('Knowledge indexed successfully');
        setNewTitle('');
        setNewContent('');
        setNewTags('');
        setShowManualForm(false);
        fetchSnippets();
      } else {
        const err = await res.json();
        toast.error(err.detail || 'Failed to index knowledge');
      }
    } catch (err) {
      toast.error('Network error indexing knowledge');
    }
  };

  // Handle file uploads (.txt, .md, .json, etc.)
  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setIsUploading(true);
    let successCount = 0;

    for (const file of files) {
      try {
        const text = await file.text();
        if (!text.trim()) continue;

        const res = await fetch(`${apiBaseUrl}/api/knowledge/ingest`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: file.name,
            content: text,
            tags: ['file_upload', file.name.split('.').pop() || 'document'],
            source: 'file_upload'
          })
        });

        if (res.ok) {
          successCount++;
        }
      } catch (err) {
        console.error(`Failed to ingest ${file.name}:`, err);
      }
    }

    setIsUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';

    if (successCount > 0) {
      toast.success(`Ingested ${successCount} document${successCount > 1 ? 's' : ''}`);
      fetchSnippets();
    } else {
      toast.error('Could not ingest selected file(s)');
    }
  };

  // Handle deleting a snippet
  const handleDeleteSnippet = async (id, title) => {
    if (!window.confirm(`Delete "${title}" from knowledge base?`)) return;

    try {
      const res = await fetch(`${apiBaseUrl}/api/knowledge/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        toast.success('Knowledge item removed');
        setSnippets((prev) => prev.filter((s) => s.id !== id));
      } else {
        toast.error('Failed to delete item');
      }
    } catch (err) {
      toast.error('Network error deleting item');
    }
  };

  // Handle MCP reload
  const handleReloadMcp = async () => {
    setIsReloadingMcp(true);
    try {
      const res = await fetch(`${apiBaseUrl}/api/mcp/reload`, {
        method: 'POST'
      });
      if (res.ok) {
        const data = await res.json();
        toast.success('MCP servers reloaded');
        fetchMcpStatus();
      } else {
        toast.error('Failed to reload MCP servers');
      }
    } catch (err) {
      toast.error('Network error during MCP reload');
    } finally {
      setIsReloadingMcp(false);
    }
  };

  const filteredSnippets = snippets.filter((s) => {
    const q = searchQuery.toLowerCase();
    return (
      (s.title && s.title.toLowerCase().includes(q)) ||
      (s.content && s.content.toLowerCase().includes(q)) ||
      (s.tags && s.tags.some((t) => t.toLowerCase().includes(q)))
    );
  });

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex border-b border-white/10 gap-4">
        <button
          type="button"
          onClick={() => setActiveTab('knowledge')}
          className={`pb-2 text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'knowledge'
              ? 'text-[#70CFFF] border-b-2 border-[#70CFFF]'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <Database size={14} />
          <span>Knowledge Store ({snippets.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('mcp')}
          className={`pb-2 text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'mcp'
              ? 'text-[#70CFFF] border-b-2 border-[#70CFFF]'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <Cpu size={14} />
          <span>MCP Servers ({mcpStatus?.active_servers ?? 0})</span>
        </button>
      </div>

      {/* Tab: Knowledge Store */}
      {activeTab === 'knowledge' && (
        <div className="space-y-3">
          {/* Action bar: Ingest and Search */}
          <div className="flex items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              multiple
              accept=".txt,.md,.markdown,.json,.csv,.py,.js,.html,.ts"
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="px-3 py-1.5 bg-[#4E80EE] hover:bg-[#3b6edb] text-white text-xs font-medium rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            >
              <Upload size={13} />
              <span>{isUploading ? 'Ingesting...' : 'Upload Documents'}</span>
            </button>
            <button
              type="button"
              onClick={() => setShowManualForm(!showManualForm)}
              className="px-3 py-1.5 bg-white/10 hover:bg-white/15 text-white text-xs font-medium rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Plus size={13} />
              <span>Add Note</span>
            </button>
            <button
              type="button"
              onClick={fetchSnippets}
              className="p-1.5 text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors cursor-pointer ml-auto"
              title="Refresh list"
            >
              <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
            </button>
          </div>

          {/* Manual Entry Form */}
          {showManualForm && (
            <form
              onSubmit={handleCreateSnippet}
              className="p-3 bg-black/40 border border-white/10 rounded-xl space-y-2.5 text-xs"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white">New Knowledge Note</span>
                <button
                  type="button"
                  onClick={() => setShowManualForm(false)}
                  className="text-gray-400 hover:text-white"
                >
                  <X size={14} />
                </button>
              </div>
              <input
                type="text"
                placeholder="Title (e.g. Server Architecture Notes)"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-[#131314] border border-white/10 rounded-lg text-white focus:outline-none focus:border-[#70CFFF]"
              />
              <textarea
                placeholder="Knowledge content or instructions to remember..."
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                rows={4}
                className="w-full px-2.5 py-1.5 bg-[#131314] border border-white/10 rounded-lg text-white focus:outline-none focus:border-[#70CFFF] resize-none"
              />
              <input
                type="text"
                placeholder="Tags comma separated (e.g. backend, rules, auth)"
                value={newTags}
                onChange={(e) => setNewTags(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-[#131314] border border-white/10 rounded-lg text-white focus:outline-none focus:border-[#70CFFF]"
              />
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowManualForm(false)}
                  className="px-2.5 py-1 bg-white/5 hover:bg-white/10 text-gray-300 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1 bg-[#4E80EE] hover:bg-[#3b6edb] text-white font-medium rounded-lg"
                >
                  Save & Index
                </button>
              </div>
            </form>
          )}

          {/* Search Bar */}
          {snippets.length > 0 && (
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-2.5 text-gray-500" />
              <input
                type="text"
                placeholder="Search knowledge items..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-[#131314] border border-white/10 rounded-lg text-xs text-white focus:outline-none focus:border-[#70CFFF]"
              />
            </div>
          )}

          {/* Snippets List */}
          <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar pr-1">
            {isLoading && snippets.length === 0 ? (
              <div className="p-4 text-center text-xs text-gray-500">Loading knowledge items...</div>
            ) : filteredSnippets.length === 0 ? (
              <div className="p-4 text-center text-xs text-gray-500 bg-white/[0.02] border border-dashed border-white/10 rounded-xl">
                {searchQuery ? 'No matching knowledge items found' : 'No documents indexed yet. Upload .txt or .md files to prime Gabby with domain knowledge.'}
              </div>
            ) : (
              filteredSnippets.map((snippet) => (
                <div
                  key={snippet.id}
                  className="p-2.5 bg-white/5 hover:bg-white/[0.08] border border-white/5 rounded-xl text-xs space-y-1 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-white truncate max-w-[240px]">
                      {snippet.title}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDeleteSnippet(snippet.id, snippet.title)}
                      className="text-gray-500 hover:text-rose-400 p-1 rounded transition-colors"
                      title="Delete snippet"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                  <p className="text-gray-400 line-clamp-2 text-[11px] leading-relaxed">
                    {snippet.content}
                  </p>
                  <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                    {snippet.tags && snippet.tags.map((tag, tIdx) => (
                      <span
                        key={tIdx}
                        className="px-1.5 py-0.2 bg-white/5 text-gray-400 border border-white/10 rounded text-[9px]"
                      >
                        #{tag}
                      </span>
                    ))}
                    {snippet.created_at && (
                      <span className="text-[10px] text-gray-600 ml-auto">
                        {new Date(snippet.created_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Tab: Model Context Protocol (MCP) */}
      {activeTab === 'mcp' && (
        <div className="space-y-3">
          <div className="p-3 bg-white/5 border border-white/10 rounded-xl space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Server size={14} className="text-[#70CFFF]" />
                <span className="font-semibold text-white">External Tool Servers</span>
              </div>
              <button
                type="button"
                onClick={handleReloadMcp}
                disabled={isReloadingMcp}
                className="px-2.5 py-1 bg-white/10 hover:bg-white/15 text-white text-[11px] font-medium rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
              >
                <RefreshCw size={11} className={isReloadingMcp ? 'animate-spin' : ''} />
                <span>Reload</span>
              </button>
            </div>
            <p className="text-[11px] text-gray-400">
              Configured via <code className="text-[#70CFFF]">ai-assistant/server/mcp_config.json</code>. Gabby connects to stdio JSON-RPC subprocesses to dynamically discover tools.
            </p>
            <div className="grid grid-cols-2 gap-2 pt-1 text-[11px]">
              <div className="p-2 bg-black/30 rounded-lg border border-white/5">
                <span className="text-gray-500 block text-[10px] uppercase font-bold">Active Servers</span>
                <span className="text-white font-mono text-sm">{mcpStatus?.active_servers ?? 0} / {mcpStatus?.total_servers ?? 0}</span>
              </div>
              <div className="p-2 bg-black/30 rounded-lg border border-white/5">
                <span className="text-gray-500 block text-[10px] uppercase font-bold">Discovered MCP Tools</span>
                <span className="text-white font-mono text-sm">{mcpStatus?.registered_mcp_tools?.length ?? 0}</span>
              </div>
            </div>
          </div>

          {/* Configured Servers Details */}
          <div className="space-y-2">
            <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block">
              Server Registry
            </span>
            {(!mcpStatus?.servers || Object.keys(mcpStatus.servers).length === 0) ? (
              <div className="p-3 text-center text-xs text-gray-500 bg-white/[0.02] border border-dashed border-white/10 rounded-xl">
                No MCP servers configured yet in mcp_config.json.
              </div>
            ) : (
              Object.entries(mcpStatus.servers).map(([name, srv]) => (
                <div key={name} className="p-2.5 bg-black/30 border border-white/5 rounded-xl space-y-1.5 text-xs font-mono">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-white">{name}</span>
                    <span className={`px-1.5 py-0.2 rounded text-[9px] uppercase font-bold ${
                      srv.status === 'running' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-zinc-700 text-gray-400'
                    }`}>
                      {srv.status}
                    </span>
                  </div>
                  <div className="text-[10px] text-gray-400 truncate">
                    cmd: {srv.command} {srv.args?.join(' ')}
                  </div>
                  {srv.tools && srv.tools.length > 0 && (
                    <div className="flex gap-1 flex-wrap pt-0.5">
                      {srv.tools.map((t) => (
                        <span key={t} className="px-1.5 py-0.5 bg-white/5 text-[#a8c7fa] border border-white/5 rounded text-[10px]">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
