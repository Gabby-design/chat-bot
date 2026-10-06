import React, { useState, useRef } from 'react';
import {
  Gem,
  Code,
  FileText,
  Calculator,
  Search,
  Brain,
  Database,
  Languages,
  Briefcase,
  Plus,
  X,
  Trash2,
  Edit2,
  Copy,
  Check,
  Download,
  Upload,
  Sparkles,
  Wand2,
  ArrowLeft,
  ChevronRight,
  Shield,
  Terminal,
  Zap
} from 'lucide-react';
import toast from 'react-hot-toast';
import { BUILTIN_GEMS } from './gemsData.js';

const ICON_MAP = {
  Code,
  FileText,
  Calculator,
  Search,
  Brain,
  Database,
  Languages,
  Briefcase,
  Terminal,
  Shield,
  Sparkles,
  Zap
};

const COLOR_THEMES = [
  { name: 'Purple', key: 'purple', bg: 'from-purple-500 to-pink-500', border: 'border-purple-500/40' },
  { name: 'Blue', key: 'blue', bg: 'from-blue-500 to-cyan-500', border: 'border-blue-500/40' },
  { name: 'Emerald', key: 'emerald', bg: 'from-emerald-500 to-green-500', border: 'border-emerald-500/40' },
  { name: 'Cyan', key: 'cyan', bg: 'from-cyan-500 to-teal-500', border: 'border-cyan-500/40' },
  { name: 'Orange', key: 'orange', bg: 'from-orange-500 to-amber-500', border: 'border-orange-500/40' },
  { name: 'Rose', key: 'rose', bg: 'from-rose-500 to-pink-500', border: 'border-rose-500/40' },
  { name: 'Amber', key: 'amber', bg: 'from-amber-500 to-yellow-500', border: 'border-amber-500/40' },
  { name: 'Indigo', key: 'indigo', bg: 'from-indigo-500 to-purple-500', border: 'border-indigo-500/40' }
];

export default function GemsModal({
  isOpen,
  onClose,
  activeGem,
  onSelectGem,
  customGems = [],
  onSaveCustomGem,
  onDeleteCustomGem
}) {
  const [activeTab, setActiveTab] = useState('browse'); // 'browse' | 'builder'
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [editingGem, setEditingGem] = useState(null);

  // Builder Form State
  const [formName, setFormName] = useState('');
  const [formTagline, setFormTagline] = useState('');
  const [formCategory, setFormCategory] = useState('General');
  const [formColor, setFormColor] = useState('purple');
  const [formIcon, setFormIcon] = useState('Sparkles');
  const [formInstructions, setFormInstructions] = useState('');
  const [formStarter1, setFormStarter1] = useState('');
  const [formStarter2, setFormStarter2] = useState('');
  const [formStarter3, setFormStarter3] = useState('');
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [aiPromptInput, setAiPromptInput] = useState('');
  const [showAiHelper, setShowAiHelper] = useState(false);

  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  const allGems = [...BUILTIN_GEMS, ...customGems];
  const categories = ['All', 'Coding', 'Writing', 'STEM', 'Strategy', 'Custom'];

  const filteredGems = allGems.filter((g) => {
    if (selectedCategory === 'All') return true;
    if (selectedCategory === 'Custom') return g.isCustom;
    return g.category === selectedCategory;
  });

  const resetForm = () => {
    setEditingGem(null);
    setFormName('');
    setFormTagline('');
    setFormCategory('General');
    setFormColor('purple');
    setFormIcon('Sparkles');
    setFormInstructions('');
    setFormStarter1('');
    setFormStarter2('');
    setFormStarter3('');
    setAiPromptInput('');
    setShowAiHelper(false);
  };

  const handleStartCreate = () => {
    resetForm();
    setActiveTab('builder');
  };

  const handleStartEdit = (gem) => {
    setEditingGem(gem);
    setFormName(gem.name || '');
    setFormTagline(gem.tagline || gem.description || '');
    setFormCategory(gem.category || 'Custom');
    setFormColor(gem.color || 'purple');
    setFormIcon(gem.icon || 'Sparkles');
    setFormInstructions(gem.systemInstruction || '');
    setFormStarter1(gem.starterPrompts?.[0] || '');
    setFormStarter2(gem.starterPrompts?.[1] || '');
    setFormStarter3(gem.starterPrompts?.[2] || '');
    setActiveTab('builder');
  };

  const handleSaveGem = () => {
    if (!formName.trim()) {
      return toast.error('Please enter a name for the Gem');
    }
    if (!formInstructions.trim()) {
      return toast.error('Please specify system instructions for this Gem');
    }

    const starterPrompts = [formStarter1, formStarter2, formStarter3].filter((s) => s.trim());

    const theme = COLOR_THEMES.find((c) => c.key === formColor) || COLOR_THEMES[0];

    const gemData = {
      id: editingGem ? editingGem.id : `custom_${Date.now()}`,
      name: formName.trim(),
      tagline: formTagline.trim() || 'Custom AI specialist',
      description: formTagline.trim() || formInstructions.slice(0, 120),
      category: formCategory || 'Custom',
      icon: formIcon,
      color: formColor,
      gradient: `from-${formColor}-500/20 to-${formColor}-600/20`,
      border: theme.border,
      iconBg: theme.bg,
      starterPrompts,
      systemInstruction: formInstructions.trim(),
      isCustom: true,
      updatedAt: Date.now()
    };

    onSaveCustomGem(gemData);
    toast.success(editingGem ? 'Gem updated successfully' : 'Custom Gem created!');
    resetForm();
    setActiveTab('browse');
  };

  const handleGenerateInstructions = async () => {
    if (!aiPromptInput.trim() && !formName.trim()) {
      return toast.error('Please enter a concept or name first');
    }
    const topic = aiPromptInput.trim() || `${formName}: ${formTagline}`;
    setIsGeneratingAi(true);

    try {
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Write a comprehensive, professional System Instruction prompt for an AI Persona named "${formName || 'Specialist'}" whose goal is: "${topic}". Include exact identity, tone, domain knowledge, structural rules, and step-by-step reasoning constraints. Output ONLY the system instruction prose without markdown headers or fluff.`,
          mode: 'chat'
        })
      });

      if (!response.ok) {
        throw new Error('AI generation failed');
      }

      const text = await response.text();
      const lines = text.split('\n');
      let generated = '';
      for (const line of lines) {
        if (line.startsWith('data: ') && !line.includes('[DONE]')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.text) generated += data.text;
          } catch (_) {}
        }
      }

      if (generated) {
        setFormInstructions(generated.trim());
        setShowAiHelper(false);
        toast.success('Generated instructions with AI!');
      } else {
        toast.error('Could not parse generated instructions');
      }
    } catch (err) {
      toast.error('AI generator notice: ' + err.message);
    } finally {
      setIsGeneratingAi(false);
    }
  };

  const handleExportGems = () => {
    if (customGems.length === 0) {
      return toast.error('No custom gems to export');
    }
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(customGems, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `gabby_gems_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    toast.success('Custom gems exported');
  };

  const handleImportGems = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        if (Array.isArray(parsed)) {
          let count = 0;
          parsed.forEach((gem) => {
            if (gem.name && gem.systemInstruction) {
              onSaveCustomGem({ ...gem, id: gem.id || `custom_${Date.now()}_${Math.random()}`, isCustom: true });
              count++;
            }
          });
          toast.success(`Imported ${count} gems!`);
        } else {
          toast.error('Invalid JSON format: expected array');
        }
      } catch (err) {
        toast.error('Failed to parse JSON file');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end animate-fade-in">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Drawer Panel */}
      <div className="relative w-full max-w-2xl h-full bg-[#161719] border-l border-white/10 shadow-2xl flex flex-col z-10 animate-slide-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-[#1a1b1e]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
              <Gem className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-semibold text-white flex items-center gap-2">
                Gems & AI Personas
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-normal border border-purple-500/30">
                  {allGems.length} available
                </span>
              </h2>
              <p className="text-xs text-gray-400">Specialized AI intelligence tailored for any task</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {activeGem && (
              <button
                onClick={() => {
                  onSelectGem(null);
                  toast('Reset to standard Gabby intelligence');
                }}
                className="text-xs text-purple-300 hover:text-white px-3 py-1.5 rounded-lg bg-purple-500/20 border border-purple-500/30 hover:bg-purple-500/30 transition-all cursor-pointer font-medium"
                title="Deactivate current gem"
              >
                Reset Gem
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/5 rounded-xl text-gray-400 hover:text-white transition-colors cursor-pointer"
              title="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Tab Controls & Actions */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/5 bg-[#141517]">
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setActiveTab('browse');
                setEditingGem(null);
              }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                activeTab === 'browse'
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              Browse Catalog
            </button>
            <button
              onClick={handleStartCreate}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'builder'
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Plus size={14} />
              {editingGem ? 'Edit Gem' : 'Create Custom Gem'}
            </button>
          </div>

          {activeTab === 'browse' && (
            <div className="flex items-center gap-1">
              <button
                onClick={handleExportGems}
                disabled={customGems.length === 0}
                className="p-1.5 hover:bg-white/5 text-gray-400 hover:text-white disabled:opacity-40 rounded-lg transition-colors cursor-pointer"
                title="Export custom gems as JSON"
              >
                <Download size={15} />
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="p-1.5 hover:bg-white/5 text-gray-400 hover:text-white rounded-lg transition-colors cursor-pointer"
                title="Import custom gems from JSON"
              >
                <Upload size={15} />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={handleImportGems}
              />
            </div>
          )}
        </div>

        {/* Tab 1: Browse Catalog */}
        {activeTab === 'browse' && (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Category Filter Pills */}
            <div className="flex items-center gap-1.5 px-5 py-2.5 overflow-x-auto custom-scrollbar border-b border-white/5 bg-[#121315]">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
                    selectedCategory === cat
                      ? 'bg-white/15 text-white border border-white/20'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-white/5 border border-transparent'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Gems Grid */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3.5 custom-scrollbar">
              {filteredGems.length === 0 ? (
                <div className="py-16 text-center text-gray-400 space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-white/5 mx-auto flex items-center justify-center text-gray-500">
                    <Gem size={22} />
                  </div>
                  <p className="text-sm font-medium">No custom gems created yet</p>
                  <button
                    onClick={handleStartCreate}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium transition-all"
                  >
                    <Plus size={14} />
                    Create your first Gem
                  </button>
                </div>
              ) : (
                filteredGems.map((gem) => {
                  const isActive = activeGem === gem.id || (typeof activeGem === 'string' && activeGem.startsWith(`custom:${gem.id}`));
                  const IconComp = ICON_MAP[gem.icon] || Sparkles;

                  return (
                    <div
                      key={gem.id}
                      className={`p-4 rounded-2xl border transition-all relative overflow-hidden group ${
                        isActive
                          ? 'border-purple-400/80 bg-purple-950/20 shadow-lg shadow-purple-950/40'
                          : 'border-white/5 bg-[#1e2023]/70 hover:border-white/15 hover:bg-[#232529]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3.5 flex-1 min-w-0">
                          {/* Icon Badge */}
                          <div
                            className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${gem.iconBg || 'from-purple-500 to-indigo-600'} flex items-center justify-center shrink-0 shadow-md`}
                          >
                            <IconComp size={20} className="text-white" />
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="text-sm sm:text-base font-semibold text-white truncate">
                                {gem.name}
                              </h3>
                              {gem.isCustom && (
                                <span className="text-[9.5px] px-1.5 py-0.2 rounded-md bg-white/10 text-gray-300 font-mono">
                                  Custom
                                </span>
                              )}
                              {isActive && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30 flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                  Active
                                </span>
                              )}
                            </div>

                            <p className="text-xs text-gray-300 mb-1 leading-relaxed">
                              {gem.tagline || gem.description}
                            </p>

                            <p className="text-[11px] text-gray-500 line-clamp-2 leading-normal">
                              {gem.systemInstruction}
                            </p>

                            {/* Starter Prompts */}
                            {gem.starterPrompts && gem.starterPrompts.length > 0 && (
                              <div className="mt-3 flex flex-wrap gap-1.5">
                                {gem.starterPrompts.map((p, pIdx) => (
                                  <button
                                    key={pIdx}
                                    onClick={() => {
                                      onSelectGem(gem.id, gem.systemInstruction, gem);
                                      onClose();
                                    }}
                                    className="text-[10.5px] text-gray-400 hover:text-white bg-black/30 hover:bg-white/10 px-2.5 py-1 rounded-lg border border-white/5 transition-colors text-left truncate max-w-xs"
                                    title={p}
                                  >
                                    &ldquo;{p}&rdquo;
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Card Actions */}
                        <div className="flex flex-col items-end gap-2 shrink-0">
                          <button
                            onClick={() => {
                              if (isActive) {
                                onSelectGem(null);
                                toast('Deactivated gem');
                              } else {
                                onSelectGem(gem.id, gem.systemInstruction, gem);
                                toast.success(`${gem.name} persona activated!`);
                                onClose();
                              }
                            }}
                            className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                              isActive
                                ? 'bg-white/10 hover:bg-white/15 text-gray-300'
                                : 'bg-purple-600 hover:bg-purple-500 text-white shadow-md shadow-purple-600/30'
                            }`}
                          >
                            {isActive ? 'Deactivate' : 'Use Gem'}
                          </button>

                          {gem.isCustom && (
                            <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => handleStartEdit(gem)}
                                className="p-1 hover:bg-white/10 text-gray-400 hover:text-white rounded-lg transition-colors cursor-pointer"
                                title="Edit Gem"
                              >
                                <Edit2 size={13} />
                              </button>
                              <button
                                onClick={() => {
                                  if (confirm(`Delete custom gem "${gem.name}"?`)) {
                                    onDeleteCustomGem(gem.id);
                                    toast.success('Gem deleted');
                                  }
                                }}
                                className="p-1 hover:bg-rose-500/20 text-gray-400 hover:text-rose-400 rounded-lg transition-colors cursor-pointer"
                                title="Delete Gem"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Custom Gem Builder Form */}
        {activeTab === 'builder' && (
          <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
            <div className="flex items-center justify-between pb-2 border-b border-white/5">
              <button
                onClick={() => setActiveTab('browse')}
                className="text-xs text-gray-400 hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
              >
                <ArrowLeft size={14} />
                Back to catalog
              </button>
              <span className="text-xs text-purple-400 font-medium">
                {editingGem ? 'Edit Custom Gem' : 'Create New AI Persona'}
              </span>
            </div>

            {/* Name & Tagline */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">
                  Gem Name <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Next.js Architect"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full bg-[#121315] border border-white/10 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">
                  Category
                </label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  className="w-full bg-[#121315] border border-white/10 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-purple-500 transition-colors"
                >
                  <option value="Coding">Coding</option>
                  <option value="Writing">Writing</option>
                  <option value="STEM">STEM</option>
                  <option value="Strategy">Strategy</option>
                  <option value="General">General</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">
                Short Tagline / Summary
              </label>
              <input
                type="text"
                placeholder="e.g. Senior TypeScript engineer specializing in App Router & SSR"
                value={formTagline}
                onChange={(e) => setFormTagline(e.target.value)}
                className="w-full bg-[#121315] border border-white/10 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 transition-colors"
              />
            </div>

            {/* Theme & Icon Selection */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-[#121315] p-3.5 rounded-2xl border border-white/5">
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-2">
                  Color Gradient
                </label>
                <div className="flex flex-wrap gap-2">
                  {COLOR_THEMES.map((theme) => (
                    <button
                      key={theme.key}
                      type="button"
                      onClick={() => setFormColor(theme.key)}
                      className={`w-7 h-7 rounded-xl bg-gradient-to-br ${theme.bg} transition-all cursor-pointer ${
                        formColor === theme.key ? 'ring-2 ring-white scale-110 shadow-lg' : 'opacity-60 hover:opacity-100'
                      }`}
                      title={theme.name}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-300 mb-2">
                  Icon
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {Object.keys(ICON_MAP).map((iconKey) => {
                    const Comp = ICON_MAP[iconKey];
                    return (
                      <button
                        key={iconKey}
                        type="button"
                        onClick={() => setFormIcon(iconKey)}
                        className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                          formIcon === iconKey
                            ? 'bg-purple-600 text-white border-purple-400'
                            : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
                        }`}
                        title={iconKey}
                      >
                        <Comp size={15} />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* System Instructions & AI Generator */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-gray-300">
                  System Instructions & Knowledge <span className="text-rose-400">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => setShowAiHelper(!showAiHelper)}
                  className="text-xs text-purple-400 hover:text-purple-300 font-medium flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Wand2 size={13} />
                  <span>Draft with AI</span>
                </button>
              </div>

              {/* AI Generator Helper Bar */}
              {showAiHelper && (
                <div className="mb-2.5 p-3 rounded-xl bg-purple-950/30 border border-purple-500/30 space-y-2 animate-fade-in">
                  <p className="text-[11px] text-purple-200">
                    Briefly describe what this persona should do, and Gemini will generate comprehensive system instructions:
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="e.g. An expert in Flutter Riverpod state management and testing"
                      value={aiPromptInput}
                      onChange={(e) => setAiPromptInput(e.target.value)}
                      className="flex-1 bg-[#121315] border border-purple-500/30 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none placeholder-gray-500"
                    />
                    <button
                      type="button"
                      disabled={isGeneratingAi}
                      onClick={handleGenerateInstructions}
                      className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium flex items-center gap-1.5 shrink-0 transition-colors disabled:opacity-50"
                    >
                      {isGeneratingAi ? (
                        <>
                          <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          <span>Generating...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles size={13} />
                          <span>Generate</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              <textarea
                rows={6}
                placeholder="You are [Persona Name], an expert in [Domain]. Always format responses with... Prioritize..."
                value={formInstructions}
                onChange={(e) => setFormInstructions(e.target.value)}
                className="w-full bg-[#121315] border border-white/10 rounded-xl p-3.5 text-xs sm:text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 font-sans leading-relaxed transition-colors"
              />
              <span className="text-[10px] text-gray-500 mt-1 block">
                Define the persona's identity, expertise, constraints, tone, and reasoning style.
              </span>
            </div>

            {/* Starter Prompts */}
            <div className="space-y-2">
              <label className="block text-xs font-medium text-gray-300">
                Suggested Starter Prompts (Optional)
              </label>
              <input
                type="text"
                placeholder="Starter prompt 1 (e.g. Review this code for security issues)"
                value={formStarter1}
                onChange={(e) => setFormStarter1(e.target.value)}
                className="w-full bg-[#121315] border border-white/10 rounded-xl px-3.5 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 transition-colors"
              />
              <input
                type="text"
                placeholder="Starter prompt 2 (e.g. How do I optimize database throughput?)"
                value={formStarter2}
                onChange={(e) => setFormStarter2(e.target.value)}
                className="w-full bg-[#121315] border border-white/10 rounded-xl px-3.5 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 transition-colors"
              />
              <input
                type="text"
                placeholder="Starter prompt 3"
                value={formStarter3}
                onChange={(e) => setFormStarter3(e.target.value)}
                className="w-full bg-[#121315] border border-white/10 rounded-xl px-3.5 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 transition-colors"
              />
            </div>

            {/* Bottom Actions */}
            <div className="pt-3 border-t border-white/10 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setActiveTab('browse');
                }}
                className="px-4 py-2 rounded-xl text-xs font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveGem}
                className="px-5 py-2 rounded-xl text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-600/30 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Check size={14} />
                <span>{editingGem ? 'Save Changes' : 'Create Gem'}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
