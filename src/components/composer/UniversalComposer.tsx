import React, { useState, useRef, useEffect } from 'react';
import { ArrowUp, Wrench, Sparkles, ChevronDown, RefreshCw, Check } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export interface UniversalComposerProps {
  onSend: (text: string, options?: { autonomousLoop?: boolean; tools?: string[] }) => void;
  isLoading?: boolean;
  placeholder?: string;
  className?: string;
}

export function UniversalComposer({
  onSend,
  isLoading = false,
  placeholder,
  className = ''
}: UniversalComposerProps) {
  const { activeAgent } = useApp();
  const [input, setInput] = useState('');
  const [autonomousLoop, setAutonomousLoop] = useState(true);
  const [isToolsOpen, setIsToolsOpen] = useState(false);
  const [enabledTools, setEnabledTools] = useState<string[]>(['filesystem', 'terminal', 'git']);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const toolsMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (toolsMenuRef.current && !toolsMenuRef.current.contains(e.target as Node)) {
        setIsToolsOpen(false);
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
    onSend(text, { autonomousLoop, tools: enabledTools });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const defaultPlaceholder =
    placeholder ||
    (activeAgent === 'coder'
      ? "Donnez une consigne de code…"
      : activeAgent === 'editorial'
      ? "Décrivez votre idée de post…"
      : "Demandez n'importe quoi…");

  const availableToolsList = [
    { id: 'filesystem', name: 'Système de fichiers', desc: 'Lecture et édition de fichiers' },
    { id: 'terminal', name: 'Terminal', desc: 'Lancement de commandes et scripts' },
    { id: 'git', name: 'Git', desc: 'Diffs, commits, branches' },
    { id: 'lsp', name: 'Diagnostics', desc: 'Vérification syntaxique et types' }
  ];

  const toggleTool = (id: string) =>
    setEnabledTools(prev =>
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    );

  return (
    /* Piste B : champ ouvert, bordure supérieure fine 1px, 0px radius, max-width 720px, centré */
    <div
      className={`mono-composer w-full p-3 ${className}`}
      style={{ maxWidth: 720 }}
    >
      {/* Zone de texte */}
      <textarea
        ref={textareaRef}
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={defaultPlaceholder}
        rows={2}
        className="w-full bg-transparent resize-none outline-none text-white placeholder:text-[#555555] text-[14px] leading-relaxed custom-scrollbar"
        style={{ minHeight: 52, maxHeight: 160 }}
      />

      {/* Ligne d'actions alignée avec le texte */}
      <div className="flex items-center justify-between pt-2 border-t border-[#1f1f1f] mt-1">
        {/* Actions gauche : boutons ghost sans cadre */}
        <div className="flex items-center gap-3">
          {/* Menu Outils */}
          <div className="relative" ref={toolsMenuRef}>
            <button
              type="button"
              onClick={() => setIsToolsOpen(!isToolsOpen)}
              className="btn-ghost px-0 py-0 gap-1 text-[13px]"
              title="Outils de l'agent"
            >
              <Wrench className="w-4 h-4" />
              <span>Outils ({enabledTools.length})</span>
              <ChevronDown className="w-3 h-3" />
            </button>

            {isToolsOpen && (
              <div className="absolute bottom-[calc(100%+8px)] left-0 w-56 bg-[#111111] border border-[#1f1f1f] py-1 z-50">
                <div className="text-[12px] text-[#555555] px-3 py-1">Outils de l'agent</div>
                {availableToolsList.map(tool => {
                  const isEnabled = enabledTools.includes(tool.id);
                  return (
                    <button
                      key={tool.id}
                      type="button"
                      onClick={() => toggleTool(tool.id)}
                      className={`w-full flex items-center justify-between px-3 py-2 text-[13px] transition-colors ${
                        isEnabled ? 'text-white bg-[#1a1a1a]' : 'text-[#8a8a8a] hover:text-white hover:bg-[#1a1a1a]'
                      }`}
                    >
                      <div>
                        <div className="font-medium">{tool.name}</div>
                        <div className="text-[12px] text-[#555555]">{tool.desc}</div>
                      </div>
                      {isEnabled && <Check className="w-3.5 h-3.5 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Bouton Boucle autonome */}
          <button
            type="button"
            onClick={() => setAutonomousLoop(!autonomousLoop)}
            className={`btn-ghost px-0 py-0 gap-1 text-[13px] ${autonomousLoop ? 'text-white' : ''}`}
            title="Boucle autonome"
          >
            <Sparkles className="w-4 h-4" />
            <span>Boucle autonome</span>
          </button>
        </div>

        {/* Action droite : bouton d'envoi carré 32×32, 0px radius */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!input.trim() || isLoading}
          className="send-btn"
          title="Envoyer (Entrée)"
        >
          {isLoading ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <ArrowUp className="w-4 h-4" />
          )}
        </button>
      </div>
    </div>
  );
}
