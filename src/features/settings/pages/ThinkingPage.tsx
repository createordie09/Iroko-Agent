import React from 'react';
import { useThinkingSettings } from '../../../hooks/settings/useThinkingSettings';

export function ThinkingPage() {
  const {
    thinkingLevel,
    handleUpdateThinkingLevel
  } = useThinkingSettings();

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h3 className="text-[14px] font-semibold text-[var(--text-primary)] mb-1">
          Réfléchir
        </h3>
        <p className="text-[12px] text-[var(--text-secondary)] mb-4">
          Configuration du niveau de réflexion et du budget de raisonnement des modèles (§22, §37).
        </p>

        <div className="py-3 border-b border-[var(--border-subtle)]">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[13px] text-[var(--text-primary)]">Budget de réflexion</div>
              <p className="text-[12px] text-[var(--text-secondary)] mt-0.5">
                Paliers d'analyse approfondie alloués au modèle avant formulation de la réponse.
              </p>
            </div>
            <div className="flex items-center bg-[var(--bg-app)] p-0.5 rounded-[var(--radius-button)] border border-[var(--bg-active)]">
              <button
                type="button"
                onClick={() => handleUpdateThinkingLevel('disabled')}
                className={`px-2.5 py-1 rounded-[6px] text-xs transition-colors ${
                  thinkingLevel === 'disabled' ? 'bg-[var(--bg-active)] text-[var(--text-primary)] font-medium' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
                title="Désactiver le raisonnement explicite"
              >
                Désactivé
              </button>
              <button
                type="button"
                onClick={() => handleUpdateThinkingLevel('low')}
                className={`px-2.5 py-1 rounded-[6px] text-xs transition-colors ${
                  thinkingLevel === 'low' ? 'bg-[var(--bg-active)] text-[var(--text-primary)] font-medium' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
                title="Faible (~1 024 tokens)"
              >
                Faible
              </button>
              <button
                type="button"
                onClick={() => handleUpdateThinkingLevel('medium')}
                className={`px-2.5 py-1 rounded-[6px] text-xs transition-colors ${
                  thinkingLevel === 'medium' ? 'bg-[var(--bg-active)] text-[var(--text-primary)] font-medium' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
                title="Moyen (~4 096 tokens)"
              >
                Moyen
              </button>
              <button
                type="button"
                onClick={() => handleUpdateThinkingLevel('high')}
                className={`px-2.5 py-1 rounded-[6px] text-xs transition-colors ${
                  thinkingLevel === 'high' ? 'bg-[var(--bg-active)] text-[var(--text-primary)] font-medium' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
                title="Élevé (~16 384 tokens)"
              >
                Élevé
              </button>
            </div>
          </div>

          <div className="mt-3 text-[12px] text-[var(--text-secondary)]">
            {thinkingLevel === 'disabled' && 'Formulation directe sans étape de raisonnement intermédiaire.'}
            {thinkingLevel === 'low' && 'Analyse succincte (~1 024 tokens) adaptée aux requêtes simples.'}
            {thinkingLevel === 'medium' && 'Analyse équilibrée (~4 096 tokens) recommandée pour le code et l\'architecture.'}
            {thinkingLevel === 'high' && 'Raisonnement approfondi (~16 384 tokens) pour les résolutions complexes et le débogage.'}
          </div>
        </div>
      </div>
    </div>
  );
}
