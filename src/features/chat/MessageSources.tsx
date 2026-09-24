import React, { useState } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { MessageSource } from '../../types';

export interface MessageSourcesProps {
  sources?: MessageSource[];
}

export function MessageSources({ sources }: MessageSourcesProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!sources || sources.length === 0) {
    return null;
  }

  const hasMore = sources.length > 3;
  const displayedSources = hasMore && !isExpanded ? sources.slice(0, 3) : sources;

  return (
    <div className="pt-2 pb-1 space-y-1.5" data-message-sources="true">
      <div className="text-[12px] text-[var(--text-secondary)] font-normal flex items-center gap-1.5 select-none">
        <span>Sources{'\u00A0'}:</span>
      </div>

      <div className="flex flex-col gap-1.5 max-w-full">
        {displayedSources.map((source, idx) => (
          <a
            key={`${source.url}-${idx}`}
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${source.title} (${source.domain})`}
            className="group flex items-center justify-between gap-3 px-3 py-1.5 min-h-[30px] rounded-[var(--radius-button)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] text-[12px] text-[var(--text-primary)] transition-colors focus-visible:outline-2 focus-visible:outline-[var(--border-active)] focus-visible:outline-offset-2 tap-target-24"
          >
            <span className="truncate flex-1 text-[var(--text-primary)]">
              {source.title || source.domain}
            </span>
            <span className="text-[11px] text-[var(--text-tertiary)] group-hover:text-[var(--text-secondary)] shrink-0 font-mono">
              {source.domain}
            </span>
          </a>
        ))}
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
              <span>Afficher les {sources.length - 3} autres sources</span>
            </>
          )}
        </button>
      )}
    </div>
  );
}
