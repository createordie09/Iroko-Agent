import React from 'react';
import { ClaudeComposer } from '../../components/composer/ClaudeComposer';

export interface ClaudeHeroProps {
  onSendMessage: (text: string, options?: { mode: 'chat' | 'code'; tools?: string[] }) => void;
  isLoading?: boolean;
}

export function ClaudeHero({ onSendMessage, isLoading = false }: ClaudeHeroProps) {
  return (
    <div className="flex-1 h-full w-full flex flex-col items-center justify-center px-4 relative select-none bg-[var(--bg-app)]">
      
      {/* ── Contenu centré (~40% de la hauteur du viewport) ── */}
      <div className="w-full flex flex-col items-center -mt-16 sm:-mt-24">
        
        {/* ── Logo Iroko + Titre "Bonjour" en serif ── */}
        <div className="flex items-center justify-center gap-3.5 mb-8">
          {/* Logo Iroko : astérisque / emblème géométrique en blanc cassé (Règle 8) */}
          <svg
            className="w-7 h-7 sm:w-8 sm:h-8 text-[var(--text-primary)] shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="12" y1="2" x2="12" y2="22" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
            <line x1="19.07" y1="4.93" x2="4.93" y2="19.07" />
            <circle cx="12" cy="12" r="3" fill="currentColor" />
          </svg>

          {/* Titre en serif ~36px (sans prénom par instruction 4) */}
          <h1
            className="font-serif text-[32px] sm:text-[36px] text-[var(--text-primary)] font-normal tracking-[-0.01em] select-none"
            style={{
              fontFamily: 'var(--font-serif)',
              letterSpacing: '-0.015em'
            }}
          >
            Bonjour
          </h1>
        </div>

        {/* ── Barre de saisie (Composer) : largeur 576px, espacement 32px ── */}
        <ClaudeComposer
          onSend={onSendMessage}
          isLoading={isLoading}
          isConversation={false}
        />

      </div>

    </div>
  );
}
