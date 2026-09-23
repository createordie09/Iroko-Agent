import React from 'react';
import { useCapabilitiesSettings } from '../../../hooks/settings/useCapabilitiesSettings';

export function CapabilitiesPage() {
  const {
    toolsList,
    togglingToolName,
    handleToggleTool
  } = useCapabilitiesSettings();

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h3 className="text-[14px] font-semibold text-[var(--text-primary)] mb-1">
          Capacités
        </h3>
        <p className="text-[12px] text-[var(--text-secondary)] mb-4">
          Contrôle dynamique des outils du registre (Tool Registry). Source unique de vérité pour l'agent.
        </p>

        <div className="space-y-2">
          {toolsList.map(tool => (
            <div
              key={tool.name}
              className="bg-[var(--bg-surface)] border border-[var(--border-modal)] rounded-[6px] p-3 flex items-center justify-between gap-3"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <span className="font-mono text-[13px] text-[var(--text-primary)] font-medium">
                    {tool.name}
                  </span>
                  <span className="px-1.5 py-0.5 bg-[var(--bg-app)] border border-[var(--border-modal)] text-[10px] text-[var(--text-secondary)] rounded">
                    {tool.category}
                  </span>
                  <span className="px-1.5 py-0.5 bg-[var(--bg-app)] border border-[var(--border-modal)] text-[10px] text-[var(--text-secondary)] rounded">
                    {tool.permission}
                  </span>
                </div>
                <p className="text-[12px] text-[var(--text-secondary)] truncate">
                  {tool.description}
                </p>
                {!tool.available && (
                  <p className="text-[11px] text-[var(--text-muted)] mt-1">
                    Indisponible : {tool.reasonDisabled || 'Service non configuré.'}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() => handleToggleTool(tool.name, tool.enabled)}
                disabled={!tool.available || togglingToolName === tool.name}
                className={`w-9 h-5 rounded-full relative transition-colors shrink-0 ${
                  !tool.available
                    ? 'opacity-40 cursor-not-allowed bg-[var(--bg-active)]'
                    : tool.enabled
                    ? 'bg-[var(--text-primary)]'
                    : 'bg-[var(--bg-active)]'
                }`}
                aria-label={`Activer ou désactiver l'outil ${tool.name}`}
              >
                <span
                  className={`w-4 h-4 rounded-full absolute top-0.5 transition-transform ${
                    tool.enabled && tool.available
                      ? 'right-0.5 bg-[var(--bg-app)]'
                      : 'left-0.5 bg-[var(--text-secondary)]'
                  }`}
                />
              </button>
            </div>
          ))}

          {toolsList.length === 0 && (
            <div className="text-center py-6 text-[12px] text-[var(--text-secondary)] bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded-[6px]">
              Aucun outil enregistré dans le Tool Registry.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
