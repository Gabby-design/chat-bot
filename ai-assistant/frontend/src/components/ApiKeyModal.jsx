import { useState, useEffect } from 'react';
import { X, Key, ExternalLink, Check, Trash2, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';

export default function ApiKeyModal({ isOpen, onClose }) {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [savedKeyExists, setSavedKeyExists] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const stored = localStorage.getItem('gabby_gemini_api_key') || '';
      setApiKey(stored);
      setSavedKeyExists(!!stored);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    let clean = apiKey.trim().replace(/^["']|["']$/g, '');
    if (clean.toLowerCase().startsWith('bearer ')) {
      clean = clean.slice(7).trim();
    }
    if (!clean) {
      localStorage.removeItem('gabby_gemini_api_key');
      setSavedKeyExists(false);
      toast.success('Reset to server default API key', {
        style: { background: '#1E1E1E', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }
      });
      onClose();
      return;
    }

    if (!clean.startsWith('AIza') && !clean.startsWith('AQ.')) {
      toast.error('Gemini API keys typically start with "AIza" or "AQ.". Please check your key.', {
        style: { background: '#1E1E1E', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }
      });
    }

    localStorage.setItem('gabby_gemini_api_key', clean);
    setSavedKeyExists(true);
    toast.success('Gemini API key saved for this browser!', {
      style: { background: '#1E1E1E', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }
    });
    onClose();
  };

  const handleClear = () => {
    localStorage.removeItem('gabby_gemini_api_key');
    setApiKey('');
    setSavedKeyExists(false);
    toast.success('Custom API key cleared. Using server default.', {
      style: { background: '#1E1E1E', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div
        className="bg-[#1e1f20] border border-white/10 rounded-2xl w-full max-w-md p-5 sm:p-6 shadow-2xl relative text-left"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-[#4E80EE]/20 flex items-center justify-center text-[#70CFFF]">
              <Key size={18} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Google Gemini API Key</h2>
              <p className="text-xs text-[#8e918f]">Configure direct access or bypass rate limits</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[#8e918f] hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Status */}
        <div className="mt-4 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] text-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[#8e918f]">Active Key Source:</span>
            <span className={`font-medium px-2 py-0.5 rounded-full text-[11px] ${
              savedKeyExists
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
            }`}>
              {savedKeyExists ? 'Custom Browser Key' : 'Vercel Server Key'}
            </span>
          </div>
          <p className="text-[#c4c7c5] text-[11px] leading-relaxed pt-1">
            If the server key experiences high demand or quota limits, entering your free Gemini API key here connects you directly.
          </p>
        </div>

        {/* Input */}
        <div className="mt-4 space-y-2">
          <label className="block text-xs font-medium text-[#c4c7c5]">
            Gemini API Key
          </label>
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="AIzaSy... or AQ...."
              className="w-full bg-[#131314] border border-white/15 focus:border-[#70CFFF] rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-[#8e918f] outline-none font-mono pr-10 transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8e918f] hover:text-white p-1"
            >
              {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          <a
            href="https://aistudio.google.com/app/apikey"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-[#70CFFF] hover:underline pt-0.5"
          >
            Get a free Gemini API key in Google AI Studio
            <ExternalLink size={11} />
          </a>
        </div>

        {/* Actions */}
        <div className="mt-6 flex items-center justify-between gap-2 pt-2 border-t border-white/10">
          {savedKeyExists ? (
            <button
              type="button"
              onClick={handleClear}
              className="px-3 py-2 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-xl transition-colors flex items-center gap-1.5"
            >
              <Trash2 size={13} />
              Reset to Server
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs text-[#8e918f] hover:text-white hover:bg-white/5 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-2 text-xs font-medium text-white bg-[#4E80EE] hover:bg-[#3b6ecc] rounded-xl transition-colors flex items-center gap-1.5 shadow-md shadow-[#4E80EE]/20"
            >
              <Check size={14} />
              Save Key
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
