import React, { useState, useRef } from 'react';
import { Sparkles, Paperclip, Sliders, LayoutGrid, Mic, ArrowUp } from 'lucide-react';

export interface ZyriconHeroProps {
  onSendMessage: (text: string) => void;
  onOpenEditorial: () => void;
  onOpenTasks: () => void;
  onOpenCodeAgent: () => void;
  onOpenAttach: () => void;
}

export function ZyriconHero({
  onSendMessage,
  onOpenEditorial,
  onOpenTasks,
  onOpenCodeAgent,
  onOpenAttach
}: ZyriconHeroProps) {
  const [prompt, setPrompt] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!prompt.trim()) return;
    const text = prompt.trim();
    setPrompt('');
    onSendMessage(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const setPreset = (presetText: string) => {
    setPrompt(presetText);
    textareaRef.current?.focus();
  };

  const suggestions = [
    { label: 'Rédiger un post LinkedIn', prompt: 'Rédige un post percutant sur la fin des microservices et l\'essor des agents IA.' },
    { label: 'Brainstormer des idées', prompt: 'Brainstorm 3 idées stratégiques de fonctionnalités pour une plateforme IA.' },
    { label: 'Créer un plan d\'architecture', prompt: 'Fais un plan d\'architecture pour le déploiement de notre app en production.' },
  ];

  return (
    <div className="flex-1 h-full overflow-y-auto gutter-stable custom-scrollbar flex flex-col items-center justify-center px-4 sm:px-6 py-8 sm:py-12">
      
      {/* ── Icône + Titre + Description ── */}
      <div className="w-full max-w-[720px] flex flex-col items-center text-center mb-8">
        <Sparkles className="w-6 h-6 text-[#8a8a8a] mb-4" />

        <h1 className="text-[20px] font-semibold text-white mb-2" style={{ textWrap: 'balance' } as React.CSSProperties}>
          Prêt à créer quelque chose de nouveau ?
        </h1>
        <p className="text-[14px] text-[#8a8a8a] max-w-md" style={{ textWrap: 'balance' } as React.CSSProperties}>
          Posez une question, demandez un brouillon ou déclenchez un agent de code.
        </p>
      </div>

      {/* ── Compositeur : max 720px, 0px radius, bordure supérieure fine ── */}
      <div className="w-full max-w-[720px] mb-8">
        <div className="mono-composer p-3 flex flex-col">
          {/* Zone de saisie */}
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Demandez n'importe quoi…"
            rows={2}
            className="w-full bg-transparent resize-none outline-none text-white placeholder:text-[#555555] text-[14px] leading-relaxed custom-scrollbar"
            style={{ minHeight: 52, maxHeight: 160 }}
          />

          {/* Ligne d'outils */}
          <div className="flex items-center justify-between pt-2 border-t border-[#1f1f1f] mt-2">
            {/* Actions ghost gauche */}
            <div className="flex items-center gap-3 text-[13px] text-[#8a8a8a]">
              <button
                type="button"
                onClick={onOpenAttach}
                className="btn-ghost px-0 py-0 gap-1.5"
                title="Joindre un fichier"
              >
                <Paperclip className="w-4 h-4" />
                <span className="hidden sm:inline">Joindre</span>
              </button>
              <button
                type="button"
                onClick={onOpenEditorial}
                className="btn-ghost px-0 py-0 gap-1.5"
                title="Paramètres"
              >
                <Sliders className="w-4 h-4" />
                <span className="hidden sm:inline">Paramètres</span>
              </button>
              <button
                type="button"
                onClick={onOpenCodeAgent}
                className="btn-ghost px-0 py-0 gap-1.5"
                title="Options agent"
              >
                <LayoutGrid className="w-4 h-4" />
                <span className="hidden sm:inline">Options</span>
              </button>
            </div>

            {/* Actions droite : micro + envoi carré */}
            <div className="flex items-center gap-2">
              <button type="button" className="btn-ghost px-1 py-1" title="Entrée vocale">
                <Mic className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!prompt.trim()}
                className="mono-send-btn"
                title="Envoyer (Entrée)"
              >
                <ArrowUp className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Suggestions : lignes texte simples, 0px radius, sans carte ni icône ── */}
      <div className="w-full max-w-[720px] flex flex-col space-y-2">
        {suggestions.map((s, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setPreset(s.prompt)}
            className="text-left text-[13px] text-[#8a8a8a] hover:text-white hover:bg-[#1a1a1a] transition-colors px-3 py-2"
          >
            {s.label}
          </button>
        ))}
      </div>

    </div>
  );
}
