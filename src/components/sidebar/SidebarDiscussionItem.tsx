/**
 * SidebarDiscussionItem — Élément de discussion individuel dans la sidebar (Mission R4c)
 * [À VALIDER]
 *
 * Supporte :
 * 1. Renommage inline par double-clic ou via le menu "…" (Entrée = valider, Échap = annuler).
 * 2. Duplication directe via l'action "Dupliquer".
 * 3. Case à cocher en mode sélection multiple.
 * Zéro décalage de mise en page (hauteur 28px constante), tokens neutres stricts.
 */
import React, { useState, useRef, useEffect } from 'react';
import { Code2, Trash2, MoreHorizontal, Pencil, Copy, Check } from 'lucide-react';
import { HistoryItem } from '../../types';

export interface SidebarDiscussionItemProps {
  key?: React.Key;
  item: HistoryItem;
  isActive: boolean;
  isRunning: boolean;
  isEditing: boolean;
  editingTitle: string;
  setEditingTitle: (v: string) => void;
  onSaveRename: (id: string) => void;
  onCancelRename: () => void;
  onStartRename: (id: string, topic: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (e: React.MouseEvent, item: HistoryItem) => void;
  onSelect: () => void;
  isSelectionMode: boolean;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
}

export function SidebarDiscussionItem({
  item,
  isActive,
  isRunning,
  isEditing,
  editingTitle,
  setEditingTitle,
  onSaveRename,
  onCancelRename,
  onStartRename,
  onDuplicate,
  onDelete,
  onSelect,
  isSelectionMode,
  isSelected,
  onToggleSelect
}: SidebarDiscussionItemProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMenuOpen]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onSaveRename(item.id);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancelRename();
    }
  };

  return (
    <div
      className={`relative w-full h-[28px] flex items-center justify-between rounded-[var(--radius-item)] text-[var(--text-muted)] transition-colors group ${
        isActive ? 'bg-[var(--bg-active)] text-[var(--text-primary)]' : 'hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)]'
      }`}
    >
      {/* ── Mode sélection multiple : case à cocher ── */}
      {isSelectionMode && (
        <button
          type="button"
          onClick={() => onToggleSelect(item.id)}
          aria-checked={isSelected}
          role="checkbox"
          className="pl-2 pr-1 tap-target-24 flex items-center justify-center shrink-0 cursor-pointer"
          title={isSelected ? 'Désélectionner' : 'Sélectionner'}
          aria-label={isSelected ? `Désélectionner ${item.topic}` : `Sélectionner ${item.topic}`}
        >
          <span
            className={`w-3.5 h-3.5 rounded-[3px] border flex items-center justify-center transition-colors ${
              isSelected
                ? 'bg-[var(--text-primary)] border-[var(--text-primary)] text-[var(--bg-app)]'
                : 'border-[var(--border-subtle)] bg-transparent'
            }`}
          >
            {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
          </span>
        </button>
      )}

      {/* ── Mode Édition Inline : champ input sans saut de mise en page ── */}
      {isEditing ? (
        <div className="flex-1 min-w-0 px-1.5 flex items-center">
          <input
            ref={inputRef}
            type="text"
            value={editingTitle}
            onChange={(e) => setEditingTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => onSaveRename(item.id)}
            className="w-full h-[24px] px-1.5 text-[13px] bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-focus-field)] rounded-[var(--radius-item)] outline-none leading-none select-text"
            aria-label="Modifier le titre de la discussion"
          />
        </div>
      ) : (
        /* ── Mode Normal : bouton de sélection avec double-clic pour renommer ── */
        <button
          type="button"
          onClick={isSelectionMode ? () => onToggleSelect(item.id) : onSelect}
          onDoubleClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onStartRename(item.id, item.topic);
          }}
          className="flex-1 min-w-0 flex items-center gap-2 px-2.5 h-[28px] text-[13px] text-left select-none cursor-pointer"
          title={`${item.topic} (double-clic pour renommer)`}
          aria-label={item.topic || 'Discussion'}
        >
          {isRunning ? (
            <span className="w-2 h-2 rounded-full bg-[var(--text-secondary)] shrink-0" aria-label="Tâche en cours d'exécution" title="Tâche en cours d'exécution" />
          ) : item.mode === 'code' ? (
            <Code2 className="w-3 h-3 text-[var(--text-secondary)] shrink-0" aria-label="Mode Code" />
          ) : (
            <span className="w-1 h-1 rounded-full bg-[var(--text-tertiary)] shrink-0 group-hover:bg-[var(--text-secondary)]" />
          )}
          <span className="truncate mask-fade-right leading-none">{item.topic}</span>
        </button>
      )}

      {/* ── Actions au survol (Menu "…" + Corbeille) ── */}
      {!isEditing && !isSelectionMode && (
        <div className="flex items-center gap-0.5 pr-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity shrink-0">
          {/* Menu "…" */}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsMenuOpen(prev => !prev);
              }}
              className="p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-[4px] tap-target-24 shrink-0 transition-colors"
              title="Options de la discussion"
              aria-label="Options de la discussion"
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>

            {isMenuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-[calc(100%+2px)] w-40 bg-[var(--bg-surface)] border border-[var(--border-modal)] rounded-[8px] py-1 z-50 shadow-none text-[12px]"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsMenuOpen(false);
                    onStartRename(item.id, item.topic);
                  }}
                  className="w-full px-2.5 py-1.5 text-left flex items-center gap-2 hover:bg-[var(--bg-surface-hover)] text-[var(--text-primary)] transition-colors cursor-pointer"
                >
                  <Pencil className="w-3 h-3 text-[var(--text-secondary)]" />
                  <span>Renommer</span>
                </button>

                <button
                  type="button"
                  role="menuitem"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsMenuOpen(false);
                    onDuplicate(item.id);
                  }}
                  className="w-full px-2.5 py-1.5 text-left flex items-center gap-2 hover:bg-[var(--bg-surface-hover)] text-[var(--text-primary)] transition-colors cursor-pointer"
                >
                  <Copy className="w-3 h-3 text-[var(--text-secondary)]" />
                  <span>Dupliquer</span>
                </button>

                <div className="my-1 border-t border-[var(--border-subtle)]" />

                <button
                  type="button"
                  role="menuitem"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsMenuOpen(false);
                    onDelete(e, item);
                  }}
                  className="w-full px-2.5 py-1.5 text-left flex items-center gap-2 hover:bg-[var(--bg-surface-hover)] text-[var(--text-primary)] transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3 h-3 text-[var(--text-secondary)]" />
                  <span>Supprimer</span>
                </button>
              </div>
            )}
          </div>

          {/* Raccourci suppression directe */}
          <button
            type="button"
            onClick={(e) => onDelete(e, item)}
            className="p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-[4px] tap-target-24 shrink-0 transition-colors"
            title="Supprimer la discussion"
            aria-label={`Supprimer la discussion ${item.topic}`}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
