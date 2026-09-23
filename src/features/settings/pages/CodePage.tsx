import React from 'react';
import { useCodeSettings } from '../../../hooks/settings/useCodeSettings';

export function CodePage() {
  const {
    permissionMode,
    terminalTimeout,
    fileTimeout,
    projectRules,
    auditEntries,
    revokingRuleId,
    handleUpdatePermissionMode,
    handleUpdateTerminalTimeout,
    handleUpdateFileTimeout,
    handleRevokeRule
  } = useCodeSettings();

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h3 className="text-[14px] font-semibold text-[var(--text-primary)] mb-1">
          Iroko Code
        </h3>
        <p className="text-[12px] text-[var(--text-secondary)] mb-4">
          Règles d'autorisation d'exécution et de sécurité du terminal local.
        </p>

        <div className="space-y-4">
          {/* Règle d'autorisation par défaut */}
          <div className="py-3 border-b border-[var(--border-subtle)]">
            <div className="flex items-center justify-between">
              <div className="max-w-xs">
                <div className="text-[13px] text-[var(--text-primary)]">Règle d'autorisation par défaut</div>
                <p className="text-[12px] text-[var(--text-secondary)] mt-0.5">
                  Niveau d'approbation préalable requis avant toute modification ou exécution.
                </p>
              </div>
              <div className="flex items-center bg-[var(--bg-app)] p-0.5 rounded-[var(--radius-button)] border border-[var(--bg-active)] shrink-0">
                <button
                  type="button"
                  onClick={() => handleUpdatePermissionMode('ask')}
                  className={`px-2.5 py-1 rounded-[6px] text-xs transition-colors ${
                    permissionMode === 'ask' ? 'bg-[var(--bg-active)] text-[var(--text-primary)] font-medium' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                  title="Demander pour toute modification ou commande non triviale"
                >
                  Demander
                </button>
                <button
                  type="button"
                  onClick={() => handleUpdatePermissionMode('auto_edit')}
                  className={`px-2.5 py-1 rounded-[6px] text-xs transition-colors ${
                    permissionMode === 'auto_edit' ? 'bg-[var(--bg-active)] text-[var(--text-primary)] font-medium' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                  title="Autoriser automatiquement l'édition de fichiers, demander pour les commandes"
                >
                  Auto-édition
                </button>
                <button
                  type="button"
                  onClick={() => handleUpdatePermissionMode('read_only')}
                  className={`px-2.5 py-1 rounded-[6px] text-xs transition-colors ${
                    permissionMode === 'read_only' ? 'bg-[var(--bg-active)] text-[var(--text-primary)] font-medium' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                  title="Interdire toute modification ou commande risquée"
                >
                  Lecture seule
                </button>
              </div>
            </div>
            <div className="mt-2 text-[12px] text-[var(--text-secondary)]">
              {permissionMode === 'ask' && 'Demande systématique de confirmation avant toute action modificatrice ou commande.'}
              {permissionMode === 'auto_edit' && 'Autorise automatiquement les modifications de fichiers, sollicite l\'accord pour les commandes.'}
              {permissionMode === 'read_only' && 'Mode sécurisé strict : aucune écriture de fichier ni commande modificatrice autorisée.'}
            </div>
          </div>

          {/* Délai d'attente du terminal */}
          <div className="flex items-center justify-between py-3 border-b border-[var(--border-subtle)]">
            <div className="max-w-xs">
              <div className="text-[13px] text-[var(--text-primary)]">Délai d'attente des commandes</div>
              <p className="text-[12px] text-[var(--text-secondary)] mt-0.5">
                Délai maximal alloué aux commandes terminal et scripts.
              </p>
            </div>
            <div className="flex items-center bg-[var(--bg-app)] p-0.5 rounded-[var(--radius-button)] border border-[var(--bg-active)] shrink-0">
              {[
                { ms: 30000, label: '30 s' },
                { ms: 60000, label: '60 s' },
                { ms: 120000, label: '120 s' },
                { ms: 300000, label: '5 min' }
              ].map(opt => (
                <button
                  key={opt.ms}
                  type="button"
                  onClick={() => handleUpdateTerminalTimeout(opt.ms)}
                  className={`px-2.5 py-1 rounded-[6px] text-xs transition-colors ${
                    terminalTimeout === opt.ms ? 'bg-[var(--bg-active)] text-[var(--text-primary)] font-medium' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Délai d'attente des fichiers */}
          <div className="flex items-center justify-between py-3 border-b border-[var(--border-subtle)]">
            <div className="max-w-xs">
              <div className="text-[13px] text-[var(--text-primary)]">Délai d'attente des outils fichiers</div>
              <p className="text-[12px] text-[var(--text-secondary)] mt-0.5">
                Délai maximal pour les lectures, écritures et analyses de fichiers.
              </p>
            </div>
            <div className="flex items-center bg-[var(--bg-app)] p-0.5 rounded-[var(--radius-button)] border border-[var(--bg-active)] shrink-0">
              {[
                { ms: 15000, label: '15 s' },
                { ms: 30000, label: '30 s' },
                { ms: 60000, label: '60 s' }
              ].map(opt => (
                <button
                  key={opt.ms}
                  type="button"
                  onClick={() => handleUpdateFileTimeout(opt.ms)}
                  className={`px-2.5 py-1 rounded-[6px] text-xs transition-colors ${
                    fileTimeout === opt.ms ? 'bg-[var(--bg-active)] text-[var(--text-primary)] font-medium' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Règles mémorisées pour ce projet */}
          <div className="py-3 border-b border-[var(--border-subtle)] space-y-3">
            <div>
              <div className="text-[13px] text-[var(--text-primary)]">Règles mémorisées pour ce projet</div>
              <p className="text-[12px] text-[var(--text-secondary)] mt-0.5">
                Autorisations durables "Toujours pour ce projet" conservées hors du workspace.
              </p>
            </div>
            {projectRules.length === 0 ? (
              <p className="text-[13px] text-[var(--text-secondary)]">
                Aucune règle mémorisée pour ce projet.
              </p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto claude-scrollbar">
                {projectRules.map(rule => (
                  <div
                    key={rule.id}
                    className="flex items-center justify-between p-2 rounded-[6px] bg-[var(--bg-app)] border border-[var(--border-subtle)]"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] font-mono text-[var(--text-primary)]">{rule.tool}</span>
                        <span className="text-[11px] font-mono text-[var(--text-secondary)]">{rule.pattern}</span>
                      </div>
                      <div className="text-[10px] text-[var(--text-tertiary)]">
                        {new Date(rule.createdAt).toLocaleString('fr-FR')}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRevokeRule(rule.id)}
                      disabled={revokingRuleId === rule.id}
                      className="px-2 py-1 text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] rounded border border-[var(--border-modal)] transition-colors"
                      title="Révoquer cette autorisation"
                    >
                      Révoquer
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Journal d'audit récent */}
          <div className="py-3 space-y-3">
            <div>
              <div className="text-[13px] text-[var(--text-primary)]">Journal d'audit récent</div>
              <p className="text-[12px] text-[var(--text-secondary)] mt-0.5">
                Historique en lecture seule des décisions de sécurité (secrets caviardés).
              </p>
            </div>
            {auditEntries.length === 0 ? (
              <p className="text-[13px] text-[var(--text-secondary)]">
                Aucun événement dans le journal d'audit.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-56 overflow-y-auto claude-scrollbar">
                {auditEntries.slice(0, 15).map(entry => (
                  <div
                    key={entry.id}
                    className="p-2 rounded-[6px] bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[12px] space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[var(--text-primary)]">{entry.tool}</span>
                        <span className="text-[10px] font-mono px-1 py-0.5 rounded bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-modal)]">
                          {entry.level}
                        </span>
                      </div>
                      <span className={`text-[11px] font-medium ${entry.approved ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>
                        {entry.approved ? `Autorisé (${entry.scope})` : 'Refusé'}
                      </span>
                    </div>
                    {entry.commandOrPath && (
                      <div className="font-mono text-[11px] text-[var(--text-secondary)] truncate">
                        {entry.commandOrPath}
                      </div>
                    )}
                    <div className="text-[10px] text-[var(--text-tertiary)]">
                      {new Date(entry.timestamp).toLocaleString('fr-FR')}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
