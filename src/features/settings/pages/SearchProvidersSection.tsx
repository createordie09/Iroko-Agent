import React, { useState } from 'react';
import { Plus, Trash2, Globe } from 'lucide-react';
import { ProviderCredential } from '../../../../server/models/types';

interface SearchProviderDef {
  id: string;
  name: string;
  baseUrl: string;
  docsUrl?: string;
  isCustom?: boolean;
}

const SEARCH_PROVIDERS: SearchProviderDef[] = [
  {
    id: 'brave',
    name: 'Brave Search',
    baseUrl: 'https://api.search.brave.com',
    docsUrl: 'https://brave.com/search/api/'
  },
  {
    id: 'tavily',
    name: 'Tavily',
    baseUrl: 'https://api.tavily.com',
    docsUrl: 'https://tavily.com'
  },
  {
    id: 'custom_search',
    name: 'URL personnalisée',
    baseUrl: 'Point d\'accès HTTP compatible JSON',
    isCustom: true
  }
];

interface SearchProvidersSectionProps {
  credentials: ProviderCredential[];
  onAddCredential: (providerId: string, key: string, label: string) => Promise<void>;
  onDeleteCredential: (id: string) => Promise<void>;
  onTestCredential: (id: string) => Promise<void>;
  testingKeyId: string | null;
  testStatus: Record<string, { valid: boolean; error?: string }>;
}

export function SearchProvidersSection({
  credentials,
  onAddCredential,
  onDeleteCredential,
  onTestCredential,
  testingKeyId,
  testStatus
}: SearchProvidersSectionProps) {
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [keyRaw, setKeyRaw] = useState('');
  const [keyLabel, setKeyLabel] = useState('');
  const [customUrl, setCustomUrl] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);

  const selectedDef = SEARCH_PROVIDERS.find(p => p.id === selectedProviderId);

  const handleOpenAdd = (providerId: string) => {
    setSelectedProviderId(providerId);
    setKeyRaw('');
    setKeyLabel('');
    setShowAddForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProviderId || !keyRaw.trim()) return;

    await onAddCredential(
      selectedProviderId,
      keyRaw.trim(),
      keyLabel.trim() || `Clé ${selectedDef?.name || selectedProviderId}`
    );

    setShowAddForm(false);
    setKeyRaw('');
    setKeyLabel('');
  };

  const getStatusText = (providerId: string, pCreds: ProviderCredential[]): string => {
    if (pCreds.length === 0) {
      return 'Non configuré';
    }
    for (const c of pCreds) {
      const t = testStatus[c.id];
      if (t && !t.valid) {
        return 'Clé refusée';
      }
      if (t && t.valid) {
        return 'Prêt · Clé validée';
      }
    }
    return `Prêt · ${pCreds.length} clé${pCreds.length > 1 ? 's' : ''}`;
  };

  return (
    <div className="pt-6 mt-6 border-t border-[var(--border-subtle)]">
      <div className="flex items-center gap-2 mb-1">
        <Globe className="w-4 h-4 text-[var(--text-secondary)]" />
        <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">
          Recherche
        </h3>
      </div>
      <p className="text-[12px] text-[var(--text-secondary)] mb-4">
        Fournisseurs de recherche web indépendants du modèle de conversation (Cahier Mission N3).
      </p>

      {/* Lignes réutilisant exactement les composants de M10 */}
      <div className="space-y-2">
        {SEARCH_PROVIDERS.map(p => {
          const pCreds = credentials.filter(c => c.providerId === p.id);
          const hasKeys = pCreds.length > 0;
          const statusText = getStatusText(p.id, pCreds);

          return (
            <div
              key={p.id}
              className="flex items-center justify-between py-2.5 px-3 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[8px]"
            >
              <div className="min-w-0 pr-2">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium text-[var(--text-primary)]">{p.name}</span>
                  <span className="text-[11px] text-[var(--text-tertiary)] font-mono truncate max-w-[200px]">
                    {p.baseUrl}
                  </span>
                </div>
                <div className="text-[12px] text-[var(--text-secondary)] mt-0.5">
                  {statusText}
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {hasKeys ? (
                  <>
                    <button
                      type="button"
                      onClick={() => onTestCredential(pCreds[0].id)}
                      disabled={testingKeyId !== null}
                      className="btn-ghost text-[11px] py-1 px-2 cursor-pointer"
                    >
                      {testingKeyId === pCreds[0].id ? 'Test…' : 'Tester'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteCredential(pCreds[0].id)}
                      className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-[4px] hover:bg-[var(--bg-active)] transition-colors cursor-pointer"
                      title="Supprimer la clé"
                      aria-label={`Supprimer la clé ${p.name}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleOpenAdd(p.id)}
                    className="btn-ghost text-[12px] gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Ajouter</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Formulaire d'ajout réutilisant les styles M10 */}
      {showAddForm && (
        <form
          onSubmit={handleSubmit}
          className="p-3 bg-[var(--bg-surface)] border border-[var(--border-modal)] rounded-[var(--radius-item)] space-y-3 mt-4"
        >
          <div className="text-[12px] text-[var(--text-primary)] font-medium">
            Nouvelle clé pour {selectedDef?.name || selectedProviderId}
          </div>

          <div>
            <label className="text-[11px] text-[var(--text-secondary)] block mb-1">
              {selectedDef?.isCustom ? 'URL du point d\'accès personnalisé' : 'URL du service (pré-configurée)'}
            </label>
            <input
              type="text"
              value={selectedDef?.isCustom ? customUrl : selectedDef?.baseUrl || ''}
              onChange={e => selectedDef?.isCustom && setCustomUrl(e.target.value)}
              readOnly={!selectedDef?.isCustom}
              disabled={!selectedDef?.isCustom}
              placeholder={selectedDef?.isCustom ? 'https://mon-service-recherche.local/search' : undefined}
              className={`w-full bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded-[6px] px-3 py-1.5 text-[12px] font-mono ${
                selectedDef?.isCustom
                  ? 'text-[var(--text-primary)] focus:outline-none'
                  : 'text-[var(--text-tertiary)] opacity-80 cursor-not-allowed'
              }`}
            />
          </div>

          <div>
            <label className="text-[11px] text-[var(--text-secondary)] block mb-1">
              Clé d'API {selectedDef?.isCustom && '(facultative si non requise)'}
            </label>
            <input
              type="password"
              value={keyRaw}
              onChange={e => setKeyRaw(e.target.value)}
              placeholder="Clé secrète..."
              className="w-full bg-[var(--bg-app)] border border-[var(--bg-active)] rounded-[6px] px-3 py-1.5 text-[13px] text-[var(--text-primary)] font-mono focus:outline-none"
              autoFocus
            />
          </div>

          <div>
            <label className="text-[11px] text-[var(--text-secondary)] block mb-1">Libellé facultatif</label>
            <input
              type="text"
              value={keyLabel}
              onChange={e => setKeyLabel(e.target.value)}
              placeholder="Ex&nbsp;: Clé personnelle"
              className="w-full bg-[var(--bg-app)] border border-[var(--bg-active)] rounded-[6px] px-3 py-1.5 text-[13px] text-[var(--text-primary)] focus:outline-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="btn-ghost text-[12px] cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={!keyRaw.trim()}
              className="px-3 py-1 bg-[var(--text-primary)] text-[var(--bg-app)] text-[12px] rounded-[6px] font-medium disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              Enregistrer
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
