import React, { useState } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import type { MessagePart } from '../../../server/types/messageParts';
import { FormattedMessage } from './FormattedMessage';
import { ArtifactCard } from './ArtifactCard';
import { ToolStep } from './ToolStep';

export interface MessagePartsProps {
  parts: MessagePart[];
  conversationFont: string;
  /** Réponse en cours : le dernier bloc est encore alimenté */
  isStreaming?: boolean;
  onOpenArtifact?: (artifactId: string) => void;
  onRegenerateImage?: (prompt: string) => void;
  onReuseArtifactAsAttachment?: (artifact: any) => void;
}

function ThinkingPart({ text, active }: { key?: React.Key; text: string; active: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        aria-expanded={open}
        className="flex items-center gap-1.5 text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors select-none cursor-pointer"
      >
        <span className={active ? 'animate-pulse' : ''}>{active ? 'Réflexion en cours…' : 'Réflexion'}</span>
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
      </button>
      {open && (
        <div className="mt-2 pl-3 border-l border-[var(--border-subtle)] text-[13px] text-[var(--text-secondary)] leading-relaxed font-sans whitespace-pre-wrap max-h-60 overflow-y-auto claude-scrollbar">
          {text}
        </div>
      )}
    </div>
  );
}

/** Chronologie d'une réponse : réflexion, texte, étapes d'outils et artéfacts dans leur ordre réel */
export function MessageParts({
  parts, conversationFont, isStreaming, onOpenArtifact, onRegenerateImage, onReuseArtifactAsAttachment
}: MessagePartsProps) {
  const lastIndex = parts.length - 1;
  return (
    <div className="space-y-3" data-message-parts="true">
      {parts.map((part, i) => {
        const isLast = i === lastIndex;
        switch (part.type) {
          case 'thinking':
            return <ThinkingPart key={part.id} text={part.text} active={Boolean(isStreaming) && isLast} />;
          case 'text':
            return (
              <div
                key={part.id}
                className={`text-[15px] sm:text-[15.5px] text-[var(--text-primary)] leading-[1.5] ${
                  conversationFont === 'serif' ? 'font-serif' : 'font-sans'
                }`}
                style={{
                  fontFamily: conversationFont === 'serif' ? 'var(--font-serif)' : 'var(--font-sans)',
                  letterSpacing: '-0.005em'
                }}
              >
                <FormattedMessage content={part.text} isStreaming={Boolean(isStreaming) && isLast} />
              </div>
            );
          case 'tool':
            return <ToolStep key={part.id} part={part} />;
          case 'artifact':
            return (
              <ArtifactCard
                key={part.id}
                artifact={{
                  id: part.artifactId,
                  name: part.name,
                  title: part.title || part.name,
                  mimeType: part.mimeType,
                  currentVersion: part.version,
                  version: part.version,
                  size: part.size,
                  metadata: part.metadata
                } as any}
                onOpen={onOpenArtifact}
                onRegenerate={onRegenerateImage}
                onReuseAsAttachment={onReuseArtifactAsAttachment}
              />
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
