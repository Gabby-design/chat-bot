import React, { useState, useRef } from 'react';
import { Copy, Check, Download, Maximize2, X } from 'lucide-react';
import toast from 'react-hot-toast';

export const GeminiSparkle = ({ className = "icon-sm", size, animated = false }) => (
  <svg
    viewBox="0 0 296 298"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`${className} ${animated ? 'gemini-sparkle-active' : ''}`}
    style={size ? { width: size, height: size } : undefined}
  >
    <defs>
      <linearGradient id="gemini-sparkle-grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#4E80EE" />
        <stop offset="30%" stopColor="#70CFFF" />
        <stop offset="65%" stopColor="#9B72CF" />
        <stop offset="100%" stopColor="#E275AA" />
      </linearGradient>
    </defs>
    <path
      fill="url(#gemini-sparkle-grad)"
      d="M141.201 4.886c2.282-6.17 11.042-6.071 13.184.148l5.985 17.37a184.004 184.004 0 0 0 111.257 113.049l19.304 6.997c6.143 2.227 6.156 10.91.02 13.155l-19.35 7.082a184.001 184.001 0 0 0-109.495 109.385l-7.573 20.629c-2.241 6.105-10.869 6.121-13.133.025l-7.908-21.296a184 184 0 0 0-109.02-108.658l-19.698-7.239c-6.102-2.243-6.118-10.867-.025-13.132l20.083-7.467A183.998 183.998 0 0 0 133.291 26.28l7.91-21.394Z"
    />
  </svg>
);

export function TableBlock({ children }) {
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
          <span className="text-[var(--text-xs)] font-mono font-medium text-[#8a8a8e] tracking-wider uppercase">
            Table
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={handleCopy}
              className="min-h-[var(--tap-target)] min-w-[var(--tap-target)] px-2.5 py-1.5 rounded-lg text-[var(--text-xs)] text-[#8a8a8e] hover:text-white hover:bg-white/10 transition-colors flex items-center gap-1.5 cursor-pointer touch-manipulation"
              title="Copy table as CSV"
            >
              {isCopied ? <Check className="icon-sm text-emerald-400" /> : <Copy className="icon-sm" />}
              <span className="text-[var(--text-xs)]">{isCopied ? 'Copied' : 'Copy'}</span>
            </button>
            <button
              onClick={handleDownload}
              className="min-h-[var(--tap-target)] min-w-[var(--tap-target)] px-2.5 py-1.5 rounded-lg text-[var(--text-xs)] text-[#8a8a8e] hover:text-white hover:bg-white/10 transition-colors flex items-center gap-1.5 cursor-pointer touch-manipulation"
              title="Download CSV"
            >
              <Download className="icon-sm" />
              <span className="text-[var(--text-xs)] hidden sm:inline">CSV</span>
            </button>
            <button
              onClick={() => setIsExpanded(true)}
              className="min-h-[var(--tap-target)] min-w-[var(--tap-target)] p-2 rounded-lg text-[#8a8a8e] hover:text-white hover:bg-white/10 transition-colors cursor-pointer flex items-center justify-center touch-manipulation"
              title="Expand table"
            >
              <Maximize2 className="icon-sm" />
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
                  className="min-h-[var(--tap-target)] px-3 py-1 rounded-lg text-[var(--text-xs)] bg-white/10 hover:bg-white/15 text-white flex items-center gap-1.5 cursor-pointer touch-manipulation"
                >
                  <Download className="icon-sm" />
                  <span>Download CSV</span>
                </button>
                <button
                  onClick={() => setIsExpanded(false)}
                  className="min-w-[var(--tap-target)] min-h-[var(--tap-target)] p-2 hover:bg-white/10 rounded-lg text-[#8a8a8e] hover:text-white transition-colors cursor-pointer flex items-center justify-center touch-manipulation"
                >
                  <X className="icon-md" />
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

export function CodeBlock({ className, children, ...props }) {
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
        <span className="text-[var(--text-xs)] font-mono text-[#8a8a8e] font-medium tracking-wide uppercase">
          {match ? match[1] : 'code'}
        </span>
        <button
          onClick={handleCopy}
          className="min-h-[var(--tap-target)] min-w-[var(--tap-target)] flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[var(--text-xs)] text-[#8a8a8e] hover:text-white hover:bg-white/10 transition-colors cursor-pointer touch-manipulation"
          title="Copy code"
        >
          {isCopied ? (
            <>
              <Check className="icon-sm text-emerald-400" />
              <span className="text-emerald-400 font-medium text-[var(--text-xs)]">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="icon-sm" />
              <span className="text-[var(--text-xs)]">Copy</span>
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
