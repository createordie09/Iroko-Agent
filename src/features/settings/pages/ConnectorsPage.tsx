import React from 'react';
import { ChevronDown, Trash2 } from 'lucide-react';
import { useConnectorsSettings } from '../../../hooks/settings/useConnectorsSettings';

export function ConnectorsPage() {
  const {
    mcpServers,
    projectMcpConfig,
    setProjectMcpConfig,
    showAddMcpForm,
    setShowAddMcpForm,
    newMcpName,
    setNewMcpName,
    newMcpType,
    setNewMcpType,
    newMcpCommand,
    setNewMcpCommand,
    newMcpArgs,
    setNewMcpArgs,
    newMcpUrl,
    setNewMcpUrl,
    mcpError,
    mcpSuccessMessage,
    expandedMcpServer,
    setExpandedMcpServer,
    handleAddMcpServer,
    handleToggleMcpServer,
    handleToggleMcpTool,
    handleDeleteMcpServer,
    handleApproveProjectMcpConfig
  } = useConnectorsSettings();

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">
            Connecteurs (MCP)
          </h3>
          {!showAddMcpForm && (
            <button
              type="button"
              onClick={() => {
                setShowAddMcpForm(true);
              }}
              className="px-2.5 py-1 text-[12px] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--bg-active)] border border-[var(--border-modal)] rounded-[6px] transition-colors cursor-pointer"
            >
              + Ajouter un connecteur
            </button>
          )}
        </div>
        <p className="text-[12px] text-[var(--text-secondary)] leading-normal">
          Serveurs Model Context Protocol (stdio, Streamable HTTP, SSE). Les outils et ressources découverts sont traités comme du contenu non fiable (§26).
        </p>
      </div>

      {/* Message de succès */}
      {mcpSuccessMessage && (
        <div className="p-2.5 bg-[var(--bg-app)] border border-[var(--border-modal)] rounded-[6px] text-[12px] text-[var(--text-primary)]">
          {mcpSuccessMessage}
        </div>
      )}

      {/* Détection de configuration projet */}
      {projectMcpConfig?.found && (
        <div className="p-3 bg-[var(--bg-app)] border border-[var(--border-modal)] rounded-[8px] space-y-2">
          <div className="text-[12px] font-medium text-[var(--text-primary)]">
            Configuration MCP détectée dans le projet
          </div>
          <p className="text-[11px] text-[var(--text-secondary)]">
            Fichier : <span className="font-mono text-[var(--text-primary)]">{projectMcpConfig.filePath}</span> ({projectMcpConfig.servers.length} serveur(s)). L'approbation explicite est obligatoire avant tout chargement.
          </p>
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleApproveProjectMcpConfig}
              className="px-2.5 py-1 text-[11px] bg-[var(--bg-active)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] rounded transition-colors cursor-pointer"
            >
              Approuver et charger
            </button>
            <button
              type="button"
              onClick={() => setProjectMcpConfig(null)}
              className="px-2.5 py-1 text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            >
              Ignorer
            </button>
          </div>
        </div>
      )}

      {/* Formulaire d'ajout de serveur */}
      {showAddMcpForm && (
        <div className="p-3 bg-[var(--bg-app)] border border-[var(--border-modal)] rounded-[8px] space-y-3">
          <div className="text-[13px] font-medium text-[var(--text-primary)]">Nouveau connecteur MCP</div>
          <div className="space-y-2">
            <div>
              <label className="text-[11px] text-[var(--text-secondary)] block mb-1">Nom unique du connecteur</label>
              <input
                type="text"
                value={newMcpName}
                onChange={e => setNewMcpName(e.target.value)}
                placeholder="Ex: filesystem-mcp"
                className="w-full bg-[var(--bg-surface)] border border-[var(--border-modal)] rounded-[6px] px-2.5 py-1 text-[12px] text-[var(--text-primary)] font-mono focus:outline-none focus:border-[var(--border-focus)]"
              />
            </div>
            <div>
              <label className="text-[11px] text-[var(--text-secondary)] block mb-1">Transport</label>
              <div className="flex items-center bg-[var(--bg-surface)] p-0.5 rounded-[6px] border border-[var(--border-modal)]">
                {(['stdio', 'streamable-http', 'sse'] as const).map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setNewMcpType(t)}
                    className={`px-2.5 py-0.5 text-[11px] font-mono rounded transition-colors ${
                      newMcpType === t ? 'bg-[var(--bg-active)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {newMcpType === 'stdio' ? (
              <>
                <div>
                  <label className="text-[11px] text-[var(--text-secondary)] block mb-1">Commande exécutable</label>
                  <input
                    type="text"
                    value={newMcpCommand}
                    onChange={e => setNewMcpCommand(e.target.value)}
                    placeholder="Ex: npx -y @modelcontextprotocol/server-filesystem"
                    className="w-full bg-[var(--bg-surface)] border border-[var(--border-modal)] rounded-[6px] px-2.5 py-1 text-[12px] text-[var(--text-primary)] font-mono focus:outline-none focus:border-[var(--border-focus)]"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-[var(--text-secondary)] block mb-1">Arguments (séparés par un espace)</label>
                  <input
                    type="text"
                    value={newMcpArgs}
                    onChange={e => setNewMcpArgs(e.target.value)}
                    placeholder="Ex: C:\Users\..."
                    className="w-full bg-[var(--bg-surface)] border border-[var(--border-modal)] rounded-[6px] px-2.5 py-1 text-[12px] text-[var(--text-primary)] font-mono focus:outline-none focus:border-[var(--border-focus)]"
                  />
                </div>
                <p className="text-[10px] text-[var(--text-tertiary)]">
                  Demande de sécurité HIGH : un serveur stdio exécute une commande système avec environnement assaini.
                </p>
              </>
            ) : (
              <div>
                <label className="text-[11px] text-[var(--text-secondary)] block mb-1">URL du serveur</label>
                <input
                  type="text"
                  value={newMcpUrl}
                  onChange={e => setNewMcpUrl(e.target.value)}
                  placeholder="Ex: http://localhost:8000/mcp"
                  className="w-full bg-[var(--bg-surface)] border border-[var(--border-modal)] rounded-[6px] px-2.5 py-1 text-[12px] text-[var(--text-primary)] font-mono focus:outline-none focus:border-[var(--border-focus)]"
                />
              </div>
            )}
          </div>

          {mcpError && <div className="text-[12px] text-[var(--text-primary)] bg-[var(--border-subtle)] p-2 rounded">{mcpError}</div>}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setShowAddMcpForm(false)}
              className="px-2.5 py-1 text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handleAddMcpServer}
              className="px-3 py-1 text-[12px] bg-[var(--bg-active)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] rounded-[6px] transition-colors cursor-pointer"
            >
              Enregistrer
            </button>
          </div>
        </div>
      )}

      {/* Liste des serveurs MCP */}
      {mcpServers.length === 0 && !showAddMcpForm ? (
        <p className="text-[13px] text-[var(--text-secondary)]">
          Aucun connecteur configuré.
        </p>
      ) : (
        <div className="space-y-2">
          {mcpServers.map(server => {
            const isExpanded = expandedMcpServer === server.name;
            return (
              <div
                key={server.name}
                className="p-3 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded-[8px] space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[13px] font-medium text-[var(--text-primary)]">{server.name}</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-modal)]">
                      {server.type}
                    </span>
                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                      server.status === 'connected'
                        ? 'text-[var(--text-primary)] bg-[var(--bg-surface)]'
                        : server.status === 'error'
                        ? 'text-[var(--text-secondary)] bg-[var(--border-subtle)]'
                        : 'text-[var(--text-tertiary)] bg-[var(--bg-modal)]'
                    }`}>
                      {server.status === 'connected' ? 'Connecté' : server.status === 'error' ? 'Erreur' : 'Déconnecté'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleToggleMcpServer(server.name, server.enabled)}
                      className={`px-2 py-0.5 text-[11px] rounded transition-colors ${
                        server.enabled ? 'bg-[var(--bg-active)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      {server.enabled ? 'Désactiver' : 'Activer'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteMcpServer(server.name)}
                      className="p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                      title="Supprimer le connecteur"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {server.error && (
                  <div className="text-[11px] text-[var(--text-secondary)] bg-[var(--border-subtle)] p-1.5 rounded font-mono">
                    {server.error}
                  </div>
                )}

                {/* Outils découverts */}
                <div className="pt-1 border-t border-[var(--border-subtle)]">
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setExpandedMcpServer(isExpanded ? null : server.name)}
                      className="text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors flex items-center gap-1"
                    >
                      <span>Outils ({server.tools.length})</span>
                      <ChevronDown className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    </button>
                    <span className="text-[10px] text-[var(--text-tertiary)]">
                      {server.tools.filter((t: any) => t.enabled).length} actif(s)
                    </span>
                  </div>

                  {isExpanded && (
                    <div className="mt-2 space-y-1.5 pl-2 border-l border-[var(--border-modal)]">
                      {server.tools.length === 0 ? (
                        <p className="text-[11px] text-[var(--text-tertiary)]">Aucun outil découvert sur ce serveur.</p>
                      ) : (
                        server.tools.map((tool: any) => (
                          <div
                            key={tool.name}
                            className="flex items-center justify-between py-1 text-[11px]"
                          >
                            <div className="truncate max-w-[320px]">
                              <span className="font-mono text-[var(--text-primary)]">{tool.name}</span>
                              {tool.description && (
                                <span className="text-[var(--text-tertiary)] ml-2 truncate">
                                  {tool.description}
                                </span>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => handleToggleMcpTool(server.name, tool.name, tool.enabled)}
                              className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${
                                tool.enabled ? 'bg-[var(--bg-active)] text-[var(--text-primary)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                              }`}
                            >
                              {tool.enabled ? 'Actif' : 'Désactivé'}
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
