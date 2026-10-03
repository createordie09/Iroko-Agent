import React from 'react';

export type ArtifactViewMode = 'preview' | 'code';

export interface ArtifactViewToggleProps {
  mode: ArtifactViewMode;
  onChange: (mode: ArtifactViewMode) => void;
}

/** Bascule « Aperçu » / « Code » d'un artéfact qui a un rendu (markdown, HTML, SVG) */
export function ArtifactViewToggle({ mode, onChange }: ArtifactViewToggleProps) {
  const options: Array<{ id: ArtifactViewMode; label: string }> = [
    { id: 'preview', label: 'Aperçu' },
    { id: 'code', label: 'Code' }
  ];
  return (
    <div role="tablist" aria-label="Affichage de l'artéfact" className="inline-flex border border-[var(--border-subtle)] rounded-[var(--radius-button)] overflow-hidden mb-2" data-artifact-view-toggle="true">
      {options.map(option => (
        <button
          key={option.id}
          type="button"
          role="tab"
          aria-selected={mode === option.id}
          onClick={() => onChange(option.id)}
          className={`px-3 py-1 text-[12px] transition-colors cursor-pointer ${
            mode === option.id
              ? 'bg-[var(--bg-surface)] text-[var(--text-primary)]'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
