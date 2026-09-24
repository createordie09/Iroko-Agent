import React from 'react';
import { ClaudeComposer } from '../../components/composer/ClaudeComposer';

export interface ClaudeHeroProps {
  onSendMessage: (text: string, options?: { mode: 'chat' | 'code'; tools?: string[]; attachmentIds?: string[] }) => void;
  isLoading?: boolean;
}

export function ClaudeHero({ onSendMessage, isLoading = false }: ClaudeHeroProps) {
  return (
    <div className="flex-1 h-full w-full flex flex-col items-center justify-center px-4 relative select-none bg-[var(--bg-app)]">
      
      {/* ── Contenu centré (~40% de la hauteur du viewport) ── */}
      <div className="w-full flex flex-col items-center -mt-16 sm:-mt-24">
        
        {/* ── Titre "Iroko" en serif + sous-titre sobre ── */}
        <div className="flex flex-col items-center justify-center mb-8 text-center">
          <h1
            className="font-serif text-[36px] sm:text-[44px] text-[var(--text-primary)] font-normal tracking-[-0.01em] select-none"
            style={{
              fontFamily: 'var(--font-serif)',
              letterSpacing: '-0.015em'
            }}
          >
            Iroko Agent
          </h1>
          <p className="text-[14px] sm:text-[15px] text-[var(--text-secondary)] font-normal mt-2 select-none">
            Comment puis-je vous aider aujourd'hui&nbsp;?
          </p>
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
