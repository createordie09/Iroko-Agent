import React, { useState, useRef, useEffect } from 'react';
import { 
  Plus, ArrowUp, Mic, Volume2, ChevronDown, Check, Wrench, Sparkles, Paperclip, Terminal
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

export interface ClaudeComposerProps {
  onSend: (text: string, options?: { mode: 'chat' | 'code'; tools?: string[] }) => void;
  isLoading?: boolean;
  placeholder?: string;
  isConversation?: boolean;
  className?: string;
}

export function ClaudeComposer({
  onSend,
  isLoading = false,
  placeholder,
  isConversation = false,
  className = ''
}: ClaudeComposerProps) {
  const { 
    activeModel, 
    setActiveModel, 
    composerMode, 
    setComposerMode, 
    setActiveView 
  } = useApp();

  const [input, setInput] = useState('');
  const [isToolsOpen, setIsToolsOpen] = useState(false);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [enabledTools, setEnabledTools] = useState<string[]>(['filesystem', 'terminal', 'git']);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const toolsMenuRef = useRef<HTMLDivElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);

  // Auto-resize textarea up to 200px
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const newH = Math.min(Math.max(textareaRef.current.scrollHeight, 24), 200);
      textareaRef.current.style.height = `${newH}px`;
    }
  }, [input]);

  // Click outside listener for dropdowns
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (toolsMenuRef.current && !toolsMenuRef.current.contains(e.target as Node)) {
        setIsToolsOpen(false);
      }
      if (modelMenuRef.current && !modelMenuRef.current.contains(e.target as Node)) {
        setIsModelDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || isLoading) return;
    const text = input.trim();
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    onSend(text, { mode: composerMode, tools: enabledTools });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const availableModels = [
    { id: 'anthropic/claude-3.5-sonnet', name: 'Sonnet 5', note: 'Moyen' },
    { id: 'openai/gpt-4o', name: 'GPT-4o', note: 'Équilibré' },
    { id: 'google/gemini-2.0-flash', name: 'Gemini 2 Flash', note: 'Rapide' },
    { id: 'openrouter/auto', name: 'Rotation auto', note: 'Automatique' }
  ];

  const currentModelMeta = availableModels.find(m => m.id === activeModel) || availableModels[0];

  const defaultPlaceholder = isConversation
    ? "Écrivez un message..."
    : "Comment puis-je vous aider aujourd'hui ?";

  const maxWidth = isConversation ? 720 : 576;

  return (
    <div
      className={`w-full relative transition-all duration-150 ${className}`}
      style={{
        maxWidth,
        backgroundColor: '#20201f',
        borderRadius: 'var(--radius-composer)',
        border: '1px solid #30302f',
        padding: '12px 14px 10px 14px',
        boxShadow: 'none'
      }}
    >
      {/* ── Ligne 1 : Zone de saisie ── */}
      <textarea
        ref={textareaRef}
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder || defaultPlaceholder}
        rows={1}
        className="w-full bg-transparent resize-none outline-none text-[#ededeb] placeholder:text-[#6a6967] text-[14px] leading-[1.5] claude-scrollbar"
        style={{
          minHeight: 24,
          maxHeight: 200,
          border: 'none',
          padding: 0
        }}
      />

      {/* ── Ligne 2 : Barre d'outils alignée avec le texte ── */}
      <div className="flex items-center justify-between pt-2.5 mt-1 select-none">
        
        {/* Gauche : Bouton '+' et contrôle segmenté [ Chat | Code ] */}
        <div className="flex items-center gap-2">
          {/* Menu '+' */}
          <div className="relative" ref={toolsMenuRef}>
            <button
              type="button"
              onClick={() => setIsToolsOpen(!isToolsOpen)}
              className="w-6 h-6 rounded-full flex items-center justify-center text-[#878684] hover:text-[#ededeb] hover:bg-[#2c2b2a] transition-colors"
              title="Ajouter du contenu ou activer des outils"
            >
              <Plus className="w-4 h-4" />
            </button>

            {isToolsOpen && (
              <div
                className="absolute bottom-[calc(100%+8px)] left-0 w-60 bg-[#1b1b1a] border border-[#2d2d2b] rounded-[10px] py-1 z-50 shadow-xl"
              >
                <div className="text-[11px] text-[#878684] px-3 py-1 font-medium">Outils et pièces jointes</div>
                <button
                  type="button"
                  onClick={() => {
                    setEnabledTools(prev => prev.includes('filesystem') ? prev.filter(t => t !== 'filesystem') : [...prev, 'filesystem']);
                    setIsToolsOpen(false);
                  }}
                  className="w-full flex items-center justify-between px-3 py-1.5 text-[13px] text-[#ededeb] hover:bg-[#262625] transition-colors text-left"
                >
                  <div className="flex items-center gap-2">
                    <Wrench className="w-3.5 h-3.5 text-[#878684]" />
                    <span>Système de fichiers</span>
                  </div>
                  {enabledTools.includes('filesystem') && <Check className="w-3.5 h-3.5 text-[#ededeb]" />}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEnabledTools(prev => prev.includes('terminal') ? prev.filter(t => t !== 'terminal') : [...prev, 'terminal']);
                    setIsToolsOpen(false);
                  }}
                  className="w-full flex items-center justify-between px-3 py-1.5 text-[13px] text-[#ededeb] hover:bg-[#262625] transition-colors text-left"
                >
                  <div className="flex items-center gap-2">
                    <Terminal className="w-3.5 h-3.5 text-[#878684]" />
                    <span>Terminal de commande</span>
                  </div>
                  {enabledTools.includes('terminal') && <Check className="w-3.5 h-3.5 text-[#ededeb]" />}
                </button>
                <div className="border-t border-[#2d2d2b] my-1" />
                <button
                  type="button"
                  onClick={() => {
                    setActiveView('workspace');
                    setIsToolsOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-[13px] text-[#ededeb] hover:bg-[#262625] transition-colors text-left"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#878684]" />
                  <span>Basculer en mode Agent</span>
                </button>
              </div>
            )}
          </div>

          {/* Contrôle segmenté : [ Chat | Code ] (Captures 1 et 3) */}
          <div className="flex items-center bg-[#171716] p-0.5 rounded-[var(--radius-pill)] border border-[#2b2a29]">
            <button
              type="button"
              onClick={() => setComposerMode('chat')}
              className={`px-2.5 py-0.5 text-[12px] font-medium rounded-[var(--radius-pill)] transition-all ${
                composerMode === 'chat'
                  ? 'bg-[#2b2a29] text-[#ededeb] shadow-xs'
                  : 'text-[#878684] hover:text-[#ededeb]'
              }`}
            >
              Chat
            </button>
            <button
              type="button"
              onClick={() => setComposerMode('code')}
              className={`px-2.5 py-0.5 text-[12px] font-medium rounded-[var(--radius-pill)] transition-all ${
                composerMode === 'code'
                  ? 'bg-[#2b2a29] text-[#ededeb] shadow-xs'
                  : 'text-[#878684] hover:text-[#ededeb]'
              }`}
            >
              Code
            </button>
          </div>
        </div>

        {/* Droite : Modèle + Voix ou Bouton d'envoi */}
        <div className="flex items-center gap-2">
          {/* Sélecteur de modèle discret */}
          <div className="relative" ref={modelMenuRef}>
            <button
              type="button"
              onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
              className="flex items-center gap-1.5 text-[12px] text-[#878684] hover:text-[#ededeb] px-1 py-0.5 rounded transition-colors"
            >
              <span className="text-[#ededeb] font-normal">{currentModelMeta.name}</span>
              <span className="text-[#878684]">{currentModelMeta.note}</span>
              <ChevronDown className="w-3 h-3 text-[#878684]" />
            </button>

            {isModelDropdownOpen && (
              <div
                className="absolute bottom-[calc(100%+8px)] right-0 w-52 bg-[#1b1b1a] border border-[#2d2d2b] rounded-[10px] py-1 z-50 shadow-xl"
              >
                <div className="text-[11px] text-[#878684] px-3 py-1 font-medium">Modèles IA</div>
                {availableModels.map(m => {
                  const isSelected = m.id === activeModel;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        setActiveModel(m.id);
                        setIsModelDropdownOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-1.5 text-[13px] text-left transition-colors ${
                        isSelected ? 'bg-[#262625] text-[#ededeb]' : 'text-[#878684] hover:text-[#ededeb] hover:bg-[#242423]'
                      }`}
                    >
                      <div>
                        <div className="font-medium text-[#ededeb]">{m.name}</div>
                        <div className="text-[11px] text-[#878684]">{m.note}</div>
                      </div>
                      {isSelected && <Check className="w-3.5 h-3.5 text-[#ededeb]" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Icônes Voix / Micro (Captures 1 et 3) OU Bouton d'envoi si texte présent */}
          {input.trim() ? (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isLoading}
              className="w-7 h-7 rounded-full bg-[#ededeb] text-[#151515] hover:bg-white flex items-center justify-center transition-all cursor-pointer shrink-0"
              title="Envoyer (Entrée)"
            >
              <ArrowUp className="w-4 h-4 stroke-[2.5]" />
            </button>
          ) : (
            <div className="flex items-center gap-1 text-[#878684]">
              <button
                type="button"
                className="p-1 rounded hover:text-[#ededeb] transition-colors"
                title="Saisie vocale"
              >
                <Mic className="w-4 h-4" />
              </button>
              <button
                type="button"
                className="p-1 rounded hover:text-[#ededeb] transition-colors"
                title="Lecture audio"
              >
                <Volume2 className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
