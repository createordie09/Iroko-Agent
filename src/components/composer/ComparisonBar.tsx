import React from 'react';
import { Columns, ChevronDown, X } from 'lucide-react';

export interface ComparisonBarProps {
  modelAName: string;
  modelBId: string;
  availableModels: Array<{ id: string; name: string }>;
  onSelectModelB: (modelId: string) => void;
  onClose: () => void;
}

/**
 * ComparisonBar — Bandeau sobre de configuration du mode comparaison de deux modèles (Mission R4d)
 *
 * Affiche le modèle A actif face au sélecteur du modèle B, avec mention claire que deux réponses
 * seront générées en parallèle (coût implicite sans montant) et bouton de fermeture.
 */
export function ComparisonBar({
  modelAName,
  modelBId,
  availableModels,
  onSelectModelB,
  onClose
}: ComparisonBarProps) {
  return (
    <div
      data-comparison-bar="true"
      className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[8px] px-3 py-2 mb-2 flex items-center justify-between text-[12px] text-[var(--text-secondary)] select-none animate-in fade-in duration-150"
    >
      <div className="flex flex-wrap items-center gap-2 min-w-0">
        <div className="flex items-center gap-1.5 text-[var(--text-primary)]">
          <Columns className="w-3.5 h-3.5 text-[var(--text-secondary)] shrink-0" aria-hidden="true" />
          <span className="font-medium text-[12px] truncate max-w-[140px]" title={modelAName}>
            {modelAName}
          </span>
        </div>

        <span className="text-[var(--text-tertiary)] text-[11px] font-sans">vs</span>

        <div className="relative inline-flex items-center">
          <select
            value={modelBId}
            onChange={(e) => onSelectModelB(e.target.value)}
            className="appearance-none bg-[var(--bg-app)] border border-[var(--border-subtle)] hover:border-[var(--border-focus-field)] rounded-[6px] pl-2 pr-6 py-1 text-[12px] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--border-focus-field)] cursor-pointer tap-target-24 max-w-[180px] truncate"
            aria-label="Sélectionner le second modèle pour la comparaison"
          >
            {availableModels.map(m => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <ChevronDown className="w-3.5 h-3.5 text-[var(--text-secondary)] absolute right-1.5" aria-hidden="true" />
        </div>

        {/* Mention claire de génération double sans mention de montant (§ Mission R4d) */}
        <div
          className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-[4px] bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[11px] text-[var(--text-tertiary)]"
          role="note"
        >
          <span>Deux réponses seront générées en parallèle</span>
        </div>
      </div>

      <button
        type="button"
        onClick={onClose}
        className="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer tap-target-24 shrink-0 ml-2"
        aria-label="Fermer le mode comparaison"
        title="Fermer le mode comparaison"
      >
        <X className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
