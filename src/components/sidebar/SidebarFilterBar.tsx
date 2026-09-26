/**
 * SidebarFilterBar — Barre de recherche et de filtrage des discussions dans la sidebar
 */
import React from 'react';
import { Search, X } from 'lucide-react';

export interface SidebarFilterBarProps {
  isOpen: boolean;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  filterMode: 'all' | 'chat' | 'code' | 'pinned';
  setFilterMode: (mode: 'all' | 'chat' | 'code' | 'pinned') => void;
  setShowAll: (showAll: boolean) => void;
  onClose: () => void;
}

export function SidebarFilterBar({
  isOpen,
  searchQuery,
  setSearchQuery,
  filterMode,
  setFilterMode,
  setShowAll,
  onClose
}: SidebarFilterBarProps) {
  if (!isOpen) return null;

  return (
    <div className="space-y-1.5 px-2.5 pb-1.5 pt-0.5">
      <div data-field-container="true" className="flex items-center gap-1.5 bg-[var(--bg-surface)] border border-[var(--border-modal)] rounded-[6px] px-2 py-1">
        <Search className="w-3 h-3 text-[var(--text-secondary)] shrink-0" />
        <input
          data-search="true"
          type="text"
          value={searchQuery}
          onChange={e => { setSearchQuery(e.target.value); setShowAll(true); }}
          onKeyDown={e => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              onClose();
            }
          }}
          placeholder="Rechercher..."
          className="w-full bg-transparent text-[var(--font-size-search,12px)] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] outline-none sidebar-search-input"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] tap-target-24"
            title="Effacer la recherche"
            aria-label="Effacer la recherche"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
      <div className="flex items-center gap-1">
        {(['all', 'chat', 'code', 'pinned'] as const).map((mode) => {
          const labels: Record<string, string> = { all: 'Tout', chat: 'Chat', code: 'Code', pinned: 'Épinglées' };
          const active = filterMode === mode;
          return (
            <button
              key={mode}
              type="button"
              onClick={() => { setFilterMode(mode); setShowAll(false); }}
              aria-pressed={active}
              className={`text-[11px] px-1.5 py-0.5 rounded transition-colors tap-target-24 ${
                active ? 'bg-[var(--bg-active)] text-[var(--text-primary)] font-medium' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'
              }`}
            >
              {labels[mode]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
