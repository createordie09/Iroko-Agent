import React from 'react';
import { Trash2 } from 'lucide-react';
import { usePluginsSettings } from '../../../hooks/settings/usePluginsSettings';

export function PluginsPage() {
  const {
    pluginsList,
    handleTogglePlugin,
    handleDeletePlugin
  } = usePluginsSettings();

  const [confirmDeletePluginId, setConfirmDeletePluginId] = React.useState<string | null>(null);

  return (
    <div className="space-y-4 max-w-xl">
      <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">
        Plugins
      </h3>
      {pluginsList.length === 0 ? (
        <p className="text-[13px] text-[var(--text-secondary)]">
          Aucun plugin configuré.
        </p>
      ) : (
        <div className="space-y-2">
          {pluginsList.map((plugin) => (
            <div
              key={plugin.id}
              className="p-3 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded-[var(--radius-button)] space-y-2"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[13px] font-medium text-[var(--text-primary)]">{plugin.name}</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-modal)]">
                    v{plugin.version}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleTogglePlugin(plugin.id, plugin.enabled)}
                    className={`px-2 py-0.5 text-[11px] rounded transition-colors ${
                      plugin.enabled ? 'bg-[var(--bg-active)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {plugin.enabled ? 'Désactiver' : 'Activer'}
                  </button>
                  {confirmDeletePluginId === plugin.id ? (
                    <div className="flex items-center gap-1.5 text-xs bg-[var(--bg-surface)] px-2 py-0.5 rounded border border-[var(--border-modal)]">
                      <span className="text-[11px] text-[var(--text-secondary)]">Supprimer{'\u00A0'}?</span>
                      <button
                        type="button"
                        onClick={() => setConfirmDeletePluginId(null)}
                        className="px-1.5 py-0.5 text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                      >
                        Annuler
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await handleDeletePlugin(plugin.id);
                          setConfirmDeletePluginId(null);
                        }}
                        className="px-2 py-0.5 bg-[var(--bg-active)] border border-[var(--border-modal)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] rounded text-[11px] font-medium cursor-pointer"
                      >
                        Confirmer
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeletePluginId(plugin.id)}
                      className="p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                      title="Supprimer le plugin"
                      aria-label={`Supprimer le plugin ${plugin.name}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
              <p className="text-[12px] text-[var(--text-secondary)]">{plugin.description}</p>
              <div className="flex items-center gap-3 pt-1 border-t border-[var(--border-subtle)] text-[11px] text-[var(--text-tertiary)]">
                {plugin.packageData?.skills?.length > 0 && (
                  <span>{plugin.packageData.skills.length} compétence(s)</span>
                )}
                {plugin.packageData?.connectors?.length > 0 && (
                  <span>{plugin.packageData.connectors.length} connecteur(s)</span>
                )}
                {plugin.packageData?.rules?.length > 0 && (
                  <span>{plugin.packageData.rules.length} règle(s)</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
