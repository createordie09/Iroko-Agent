import React from 'react';

export interface ModeSwitchSuggestionProps {
  reason: string;
  onAccept: () => void;
}

/**
 * Proposition sobre de passage en mode Code, affichée sous la réponse lorsque le modèle
 * signale qu'une demande exige les outils du mode Code (fichiers du projet, terminal, git, tests).
 */
export function ModeSwitchSuggestion({ reason, onAccept }: ModeSwitchSuggestionProps) {
  return (
    <div
      role="status"
      data-mode-switch-suggestion="true"
      className="p-3 rounded-[var(--radius-button)] bg-[var(--bg-surface)] border border-[var(--border-modal)] text-[13px] text-[var(--text-secondary)] flex items-center justify-between gap-3"
    >
      <span className="min-w-0">
        Cette tâche nécessite le mode Code{reason ? <>&nbsp;: {reason}</> : null}
      </span>
      <button
        type="button"
        onClick={onAccept}
        className="shrink-0 px-2.5 py-1 rounded-[var(--radius-button)] bg-[var(--bg-active)] text-[var(--text-primary)] hover:opacity-90 text-[12px] transition-colors cursor-pointer"
      >
        Passer en mode Code et continuer
      </button>
    </div>
  );
}
