import React from 'react';
import { Plus, Download, Trash2, Edit2 } from 'lucide-react';
import { useMemorySettings } from '../../../hooks/settings/useMemorySettings';

export function MemoryPage() {
  const {
    memoryEnabled,
    memories,
    memoryScopeFilter,
    setMemoryScopeFilter,
    showAddMemoryModal,
    setShowAddMemoryModal,
    editingMemoryId,
    setEditingMemoryId,
    memoryFactInput,
    setMemoryFactInput,
    memoryScopeInput,
    setMemoryScopeInput,
    memoryCategoryInput,
    setMemoryCategoryInput,
    memoryError,
    setMemoryError,
    showClearConfirm,
    setShowClearConfirm,
    deletingMemoryId,
    handleToggleMemory,
    handleSaveMemoryItem,
    handleDeleteMemoryItem,
    handleClearAllMemories,
    handleExportMemories
  } = useMemorySettings();

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h3 className="text-[14px] font-semibold text-[var(--text-primary)] mb-1">
          Mémoire
        </h3>
        <p className="text-[12px] text-[var(--text-secondary)] mb-4">
          Gestion de la mémoire de projet (§20). La persistance des sessions (§21) reste indépendante.
        </p>

        {/* Interrupteur Activer la mémoire */}
        <div className="flex items-center justify-between py-3 border-b border-[var(--border-subtle)]">
          <div className="max-w-xs">
            <div className="text-[13px] text-[var(--text-primary)]">Activer la mémoire</div>
            <p className="text-[12px] text-[var(--text-secondary)] mt-0.5">
              Permet à l'agent de retenir le contexte, les décisions d'architecture et vos préférences entre les sessions.
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleToggleMemory(!memoryEnabled)}
            className={`w-9 h-5 rounded-full relative transition-colors ${
              memoryEnabled ? 'bg-[var(--text-primary)]' : 'bg-[var(--bg-active)]'
            }`}
            aria-label="Activer ou désactiver la mémoire"
          >
            <span
              className={`w-4 h-4 rounded-full absolute top-0.5 transition-transform ${
                memoryEnabled ? 'right-0.5 bg-[var(--bg-app)]' : 'left-0.5 bg-[var(--text-secondary)]'
              }`}
            />
          </button>
        </div>

        {/* Avertissement de sécurité */}
        <div className="py-2.5">
          <p className="text-[11px] text-[var(--text-secondary)]">
            Règle de sécurité (§20, §26) : les secrets, clés d'API et jetons sont formellement refusés et ne sont jamais conservés en mémoire.
          </p>
        </div>

        {/* Barre d'actions et filtres */}
        <div className="flex items-center justify-between pt-2 pb-3 gap-2 flex-wrap">
          {/* Filtres de portée */}
          <div className="flex items-center bg-[var(--bg-app)] p-0.5 rounded-[var(--radius-button)] border border-[var(--bg-active)]">
            <button
              type="button"
              onClick={() => setMemoryScopeFilter('all')}
              className={`px-2 py-1 rounded-[6px] text-xs transition-colors ${
                memoryScopeFilter === 'all' ? 'bg-[var(--bg-active)] text-[var(--text-primary)] font-medium' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              Tous ({memories.length})
            </button>
            <button
              type="button"
              onClick={() => setMemoryScopeFilter('project')}
              className={`px-2 py-1 rounded-[6px] text-xs transition-colors ${
                memoryScopeFilter === 'project' ? 'bg-[var(--bg-active)] text-[var(--text-primary)] font-medium' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              Projet actif ({memories.filter(m => m.scope === 'project').length})
            </button>
            <button
              type="button"
              onClick={() => setMemoryScopeFilter('global')}
              className={`px-2 py-1 rounded-[6px] text-xs transition-colors ${
                memoryScopeFilter === 'global' ? 'bg-[var(--bg-active)] text-[var(--text-primary)] font-medium' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              Global ({memories.filter(m => m.scope === 'global').length})
            </button>
          </div>

          {/* Boutons d'action */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setEditingMemoryId(null);
                setMemoryFactInput('');
                setMemoryScopeInput('project');
                setMemoryCategoryInput('general');
                setMemoryError(null);
                setShowAddMemoryModal(true);
              }}
              className="flex items-center gap-1 px-2 py-1 bg-[var(--bg-surface)] hover:bg-[var(--bg-active)] border border-[var(--border-modal)] text-[var(--text-primary)] text-xs rounded-[6px] transition-colors"
              title="Ajouter un fait à la mémoire"
            >
              <Plus className="w-3 h-3 text-[var(--text-secondary)]" />
              <span>Ajouter</span>
            </button>

            <button
              type="button"
              onClick={handleExportMemories}
              disabled={memories.length === 0}
              className="flex items-center gap-1 px-2 py-1 bg-[var(--bg-surface)] hover:bg-[var(--bg-active)] border border-[var(--border-modal)] text-[var(--text-primary)] text-xs rounded-[6px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title="Exporter la mémoire en JSON"
            >
              <Download className="w-3 h-3 text-[var(--text-secondary)]" />
              <span>Exporter</span>
            </button>

            <button
              type="button"
              onClick={() => setShowClearConfirm(true)}
              disabled={memories.length === 0}
              className="flex items-center gap-1 px-2 py-1 bg-[var(--bg-surface)] hover:bg-[var(--bg-active)] border border-[var(--border-modal)] text-[var(--text-primary)] text-xs rounded-[6px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title="Effacer la mémoire"
            >
              <Trash2 className="w-3 h-3 text-[var(--text-secondary)]" />
              <span>Tout effacer</span>
            </button>
          </div>
        </div>

        {/* Formulaire d'ajout / modification */}
        {showAddMemoryModal && (
          <div className="bg-[var(--bg-surface)] border border-[var(--border-modal)] rounded-[6px] p-3.5 space-y-3 mb-4">
            <div className="text-[13px] font-medium text-[var(--text-primary)]">
              {editingMemoryId ? 'Modifier l\'élément de mémoire' : 'Ajouter un élément à la mémoire'}
            </div>

            {memoryError && (
              <div className="p-2 bg-[var(--bg-error-subtle)] border border-[var(--border-error-subtle)] rounded-[4px] text-[12px] text-[var(--text-primary)]">
                {memoryError}
              </div>
            )}

            <div>
              <label className="text-[11px] text-[var(--text-secondary)] block mb-1">
                Fait ou décision (interdiction stricte de secrets/clés)
              </label>
              <textarea
                value={memoryFactInput}
                onChange={e => setMemoryFactInput(e.target.value)}
                placeholder="Ex: Utiliser PostgreSQL pour les migrations, ne pas modifier l'architecture du store..."
                rows={3}
                className="w-full bg-[var(--bg-app)] border border-[var(--border-modal)] rounded-[6px] p-2 text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)] focus:outline-none focus:border-[var(--border-focus)] resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] text-[var(--text-secondary)] block mb-1">Portée</label>
                <select
                  value={memoryScopeInput}
                  onChange={e => setMemoryScopeInput(e.target.value as any)}
                  className="w-full bg-[var(--bg-app)] border border-[var(--border-modal)] rounded-[6px] px-2 py-1 text-[12px] text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-focus)]"
                >
                  <option value="project">Projet actif uniquement</option>
                  <option value="global">Global (toutes les sessions)</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] text-[var(--text-secondary)] block mb-1">Catégorie</label>
                <select
                  value={memoryCategoryInput}
                  onChange={e => setMemoryCategoryInput(e.target.value)}
                  className="w-full bg-[var(--bg-app)] border border-[var(--border-modal)] rounded-[6px] px-2 py-1 text-[12px] text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-focus)]"
                >
                  <option value="architecture">Architecture</option>
                  <option value="decision">Décision</option>
                  <option value="rule">Règle</option>
                  <option value="preference">Préférence</option>
                  <option value="pattern">Pattern</option>
                  <option value="general">Général</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setShowAddMemoryModal(false);
                  setEditingMemoryId(null);
                  setMemoryError(null);
                }}
                className="px-2.5 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleSaveMemoryItem}
                className="px-3 py-1 bg-[var(--text-primary)] text-[var(--bg-app)] hover:bg-[var(--text-title)] text-xs font-medium rounded-[6px] transition-colors"
              >
                Enregistrer
              </button>
            </div>
          </div>
        )}

        {/* Boîte de confirmation "Tout effacer" */}
        {showClearConfirm && (
          <div className="bg-[var(--bg-surface)] border border-[var(--border-modal)] rounded-[6px] p-3.5 space-y-3 mb-4">
            <div className="text-[13px] font-medium text-[var(--text-primary)]">
              Confirmer l'effacement de la mémoire
            </div>
            <p className="text-[12px] text-[var(--text-secondary)]">
              Cette action supprime uniquement les éléments de la mémoire de projet. Vos discussions, l'historique des sessions et vos clés de connexion restent strictement intacts.
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                className="px-2.5 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleClearAllMemories}
                className="px-3 py-1 bg-[var(--bg-active)] border border-[var(--border-modal)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] text-xs font-medium rounded-[6px] transition-colors"
              >
                Confirmer la suppression
              </button>
            </div>
          </div>
        )}

        {/* Liste des éléments mémorisés */}
        <div className="space-y-2 mt-2">
          {memories
            .filter(m => {
              if (memoryScopeFilter === 'global') return m.scope === 'global';
              if (memoryScopeFilter === 'project') return m.scope === 'project';
              return true;
            })
            .map(m => (
              <div
                key={m.id}
                className="bg-[var(--bg-surface)] border border-[var(--border-modal)] rounded-[6px] p-3 flex flex-col gap-1.5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="px-1.5 py-0.5 bg-[var(--bg-app)] border border-[var(--border-modal)] text-[10px] text-[var(--text-secondary)] rounded">
                      {m.scope === 'global' ? 'Global' : 'Projet'}
                    </span>
                    <span className="px-1.5 py-0.5 bg-[var(--bg-app)] border border-[var(--border-modal)] text-[10px] text-[var(--text-secondary)] rounded">
                      {m.category}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-[var(--text-placeholder)]">
                      {new Date(m.updated_at).toLocaleDateString('fr-FR', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingMemoryId(m.id);
                        setMemoryFactInput(m.fact);
                        setMemoryScopeInput(m.scope);
                        setMemoryCategoryInput(m.category);
                        setMemoryError(null);
                        setShowAddMemoryModal(true);
                      }}
                      className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-0.5"
                      title="Modifier ce fait"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteMemoryItem(m.id)}
                      disabled={deletingMemoryId === m.id}
                      className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-0.5 disabled:opacity-40"
                      title="Supprimer ce fait"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <p className="text-[12px] text-[var(--text-primary)] break-words whitespace-pre-wrap">
                  {m.fact}
                </p>
              </div>
            ))}

          {memories.length === 0 && (
            <div className="text-center py-6 text-[12px] text-[var(--text-secondary)] bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded-[6px]">
              Aucun fait mémorisé pour le moment.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
