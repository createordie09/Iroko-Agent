/**
 * CommandPalette — Palette de commandes universelle (Mission R4a)
 * [À VALIDER par capture]
 *
 * - Raccourci : Ctrl+K (Cmd+K)
 * - Liste unique filtrée groupée par catégorie
 * - Navigation flèches / Entrée / Échap
 * - Responsive jusqu'à 375px
 * - Tokens existants uniquement, zéro ombre/glow/dégradé
 */
import React, { useRef, useEffect, useCallback, useState } from 'react';
import { Search, ArrowUpRight } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useOverlayFocus } from '../../hooks/useOverlayFocus';
import { useCommandPalette, CommandItem } from '../../hooks/useCommandPalette';

export function CommandPalette() {
  const { isCommandPaletteOpen, setIsCommandPaletteOpen } = useApp();

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const [activeIndex, setActiveIndex] = useState(0);

  const { query, setQuery, groups, flatItems } = useCommandPalette(isCommandPaletteOpen);

  /* Focus piégé dans la palette */
  useOverlayFocus({
    isOpen: isCommandPaletteOpen,
    onClose: () => setIsCommandPaletteOpen(false),
    containerRef,
    initialFocusRef: inputRef,
  });

  /* Réinitialiser l'index actif à chaque changement de résultats */
  useEffect(() => {
    setActiveIndex(0);
  }, [query, groups.length]);

  /* Scroller l'élément actif dans la vue */
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector<HTMLLIElement>(`[data-palette-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const close = useCallback(() => {
    setIsCommandPaletteOpen(false);
  }, [setIsCommandPaletteOpen]);

  const runItem = useCallback((item: CommandItem) => {
    item.execute();
    close();
  }, [close]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(i => Math.min(i + 1, flatItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = flatItems[activeIndex];
      if (item) runItem(item);
    }
    /* Échap géré par useOverlayFocus */
  }, [flatItems, activeIndex, runItem]);

  if (!isCommandPaletteOpen) return null;

  const isEmpty = flatItems.length === 0;

  return (
    /* Fond semi-opaque SANS flou */
    <div
      data-overlay-backdrop="true"
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4 bg-black/70 animate-in fade-in duration-150"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
    >
      {/* Fenêtre palette — max 560px, responsive 375px */}
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Palette de commandes"
        tabIndex={-1}
        className="w-full max-w-[560px] bg-[var(--bg-modal)] border border-[var(--border-subtle)] rounded-[var(--radius-modal)] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150 outline-none"
        style={{ maxHeight: 'min(520px, 80vh)' }}
        onKeyDown={handleKeyDown}
      >

        {/* Champ de recherche */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[var(--border-subtle)] shrink-0">
          <Search className="w-4 h-4 text-[var(--text-secondary)] shrink-0" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Rechercher des discussions, actions, paramètres…"
            className="flex-1 bg-transparent text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none"
            aria-label="Rechercher dans la palette de commandes"
            aria-autocomplete="list"
            aria-controls="palette-listbox"
            aria-activedescendant={flatItems[activeIndex] ? `palette-item-${flatItems[activeIndex].id}` : undefined}
          />
          <kbd className="text-[11px] font-mono text-[var(--text-tertiary)] bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-1.5 py-0.5 rounded shrink-0">
            Échap
          </kbd>
        </div>

        {/* Résultats */}
        <ul
          ref={listRef}
          id="palette-listbox"
          role="listbox"
          aria-label="Résultats de la palette de commandes"
          className="flex-1 overflow-y-auto claude-scrollbar py-1"
        >
          {isEmpty && (
            <li className="px-4 py-6 text-center text-[13px] text-[var(--text-tertiary)]" role="option" aria-selected="false">
              Aucun résultat
            </li>
          )}

          {groups.map((group) => (
            <li key={group.name} role="presentation">
              {/* En-tête de groupe */}
              <div
                className="px-3 pt-2 pb-0.5 text-[11px] font-medium text-[var(--text-tertiary)] uppercase tracking-wide select-none"
                role="presentation"
                aria-hidden="true"
              >
                {group.name}
              </div>
              {/* Items du groupe */}
              <ul role="group" aria-label={group.name}>
                {group.items.map((item) => {
                  const globalIdx = flatItems.indexOf(item);
                  const isActive = globalIdx === activeIndex;
                  return (
                    <li
                      key={item.id}
                      id={`palette-item-${item.id}`}
                      role="option"
                      aria-selected={isActive}
                      data-palette-index={globalIdx}
                      className={`flex items-center gap-2.5 px-3 py-2 mx-1 rounded-[6px] cursor-pointer select-none transition-colors ${
                        isActive
                          ? 'bg-[var(--bg-surface-hover)] text-[var(--text-primary)]'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)]'
                      }`}
                      onMouseEnter={() => setActiveIndex(globalIdx)}
                      onClick={() => runItem(item)}
                    >
                      {/* Icône de type */}
                      {item.kind === 'conversation' && (
                        <span className="w-4 h-4 flex items-center justify-center text-[var(--text-tertiary)] shrink-0" aria-hidden="true">
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                            <path d="M2 2h10v8H8l-3 2v-2H2V2z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" fill="none"/>
                          </svg>
                        </span>
                      )}
                      {item.kind === 'nav' && (
                        <ArrowUpRight className="w-3.5 h-3.5 text-[var(--text-tertiary)] shrink-0" aria-hidden="true" />
                      )}
                      {(item.kind === 'action' || item.kind === 'model') && (
                        <span className="w-3.5 h-3.5 flex items-center justify-center text-[var(--text-tertiary)] shrink-0 text-[10px]" aria-hidden="true">
                          ⌘
                        </span>
                      )}
                      {item.kind === 'shortcut' && (
                        <span className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      )}

                      {/* Label + description */}
                      <span className="flex-1 min-w-0">
                        <span className="block text-[13px] truncate">{item.label}</span>
                        {item.description && (
                          <span className="block text-[11px] text-[var(--text-tertiary)] truncate">{item.description}</span>
                        )}
                      </span>

                      {/* Badge kbd pour raccourcis */}
                      {item.kind === 'shortcut' && item.description && (
                        <kbd className="text-[10px] font-mono text-[var(--text-tertiary)] bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-1.5 py-0.5 rounded shrink-0">
                          {item.description}
                        </kbd>
                      )}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>

        {/* Pied de page discret */}
        <div className="px-3 py-1.5 border-t border-[var(--border-subtle)] flex items-center gap-3 text-[11px] text-[var(--text-tertiary)] shrink-0 select-none">
          <span><kbd className="font-mono">↑↓</kbd> Naviguer</span>
          <span><kbd className="font-mono">Entrée</kbd> Ouvrir</span>
          <span><kbd className="font-mono">Échap</kbd> Fermer</span>
        </div>
      </div>
    </div>
  );
}
