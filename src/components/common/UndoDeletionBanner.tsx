/**
 * UndoDeletionBanner — Bandeau discret de suppression différée avec bouton "Annuler" (Mission R4b)
 * [À VALIDER]
 *
 * Apparaît pendant 5 secondes lors de la suppression d'une discussion, d'un message,
 * d'un élément de mémoire ou d'une compétence importée.
 * Zéro ombre, zéro glow, zéro dégradé, zéro flou, tokens monochromes stricts.
 */
import React from 'react';
import { useUndoDeletion } from '../../hooks/useUndoDeletion';

export function UndoDeletionBanner() {
  const { activeDeletion, cancelActiveDeletion } = useUndoDeletion();

  if (!activeDeletion) return null;

  return (
    <aside
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-undo-banner="true"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] max-w-[calc(100vw-32px)] bg-[var(--bg-modal)] text-[var(--text-primary)] border border-[var(--border-subtle)] rounded-[var(--radius-modal)] px-4 py-2.5 flex items-center gap-3 text-[13px] select-none outline-none"
    >
      <span className="truncate font-normal">{activeDeletion.label}</span>
      <button
        type="button"
        onClick={cancelActiveDeletion}
        className="text-[var(--text-primary)] hover:underline font-medium tap-target-24 px-2 py-1 rounded-[var(--radius-button)] text-[13px] hover:bg-[var(--bg-surface-hover)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-focus)] transition-colors shrink-0"
        title="Annuler la suppression"
        aria-label="Annuler la suppression"
      >
        Annuler
      </button>
    </aside>
  );
}
