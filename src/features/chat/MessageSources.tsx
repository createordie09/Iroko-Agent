import React, { useState } from 'react';
import { ChevronRight, ChevronDown, Copy, Check } from 'lucide-react';
import { MessageSource } from '../../types';
import { useCopyFeedback } from '../../hooks/useCopyFeedback';

export interface MessageSourcesProps {
  sources?: MessageSource[];
}

export function MessageSources({ sources }: MessageSourcesProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { copy, isCopied } = useCopyFeedback();

  if (!sources || sources.length === 0) {
    return null;
  }

  const hasMore = sources.length > 4;
  const displayedSources = hasMore && !isExpanded ? sources.slice(0, 4) : sources;

  return (
    <div className="pt-2 pb-1 space-y-1.5" data-message-sources="true">
      <div className="text-[12px] text-[var(--text-secondary)] font-normal flex items-center gap-1.5 select-none">
        <span>Sources{'\u00A0'}:</span>
      </div>

      <div className="flex flex-col gap-1.5 max-w-full">
        {displayedSources.map((source, idx) => {
          const copied = isCopied(idx);
          return (
            <div
              key={`${source.url}-${idx}`}
              className="group flex items-center justify-between gap-2 px-3 py-1.5 min-h-[30px] rounded-[var(--radius-button)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] text-[12px] text-[var(--text-primary)] transition-colors"
            >
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${source.title} (${source.domain})`}
                className="flex-1 min-w-0 flex items-center justify-between gap-3 text-[12px] text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-[var(--border-active)] focus-visible:outline-offset-2 tap-target-24"
              >
                <span className="truncate flex-1 text-[var(--text-primary)]">
                  {source.title || source.domain}
                </span>
                <span className="text-[11px] text-[var(--text-tertiary)] group-hover:text-[var(--text-secondary)] shrink-0 font-mono">
                  {source.domain}
                </span>
              </a>

              <button
                type="button"
                onClick={() => copy(source.url, idx)}
                className={`w-[58px] py-0.5 rounded text-[11px] font-sans transition-colors flex items-center justify-center gap-1 shrink-0 tap-target-24 cursor-pointer ${
                  copied
                    ? 'text-[var(--text-primary)] bg-[var(--bg-surface-hover)]'
                    : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)]'
                }`}
                title="Copier le lien"
                aria-label={`Copier le lien de la source ${source.title || source.domain}`}
              >
                {copied ? (
                  <>
                    <Check className="w-3 h-3 text-[var(--text-primary)]" />
                    <span className="text-[var(--text-primary)]">Copié</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3 text-[var(--text-secondary)]" />
                    <span>Copier</span>
                  </>
                )}
                <span className="sr-only" aria-live="polite">
                  {copied ? 'Lien de la source copié dans le presse-papier' : ''}
                </span>
              </button>
            </div>
          );
        })}
      </div>

      {hasMore && (
        <button
          type="button"
          onClick={() => setIsExpanded(prev => !prev)}
          aria-expanded={isExpanded}
          className="flex items-center gap-1 text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer pt-0.5 min-h-[24px] tap-target-24 select-none"
        >
          {isExpanded ? (
            <>
              <ChevronDown className="w-3.5 h-3.5 shrink-0 text-[var(--text-secondary)]" />
              <span>Afficher moins</span>
            </>
          ) : (
            <>
              <ChevronRight className="w-3.5 h-3.5 shrink-0 text-[var(--text-secondary)]" />
              <span>
                {sources.length - 4 === 1
                  ? 'Afficher la 1 autre source'
                  : `Afficher les ${sources.length - 4} autres sources`}
              </span>
            </>
          )}
        </button>
      )}
    </div>
  );
}
