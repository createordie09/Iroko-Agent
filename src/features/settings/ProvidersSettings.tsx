import React, { useState, useEffect } from 'react';
import { KeyRound, CheckCircle2, AlertCircle, RefreshCw, Trash2, Eye, EyeOff, Plus } from 'lucide-react';
import { ProviderCredential, KeySelectionStrategy } from '../../../server/models/types';
import { useApp } from '../../context/AppContext';

interface ProviderMeta {
  id: string;
  name: string;
  keyCount: number;
  activeKeys: number;
}

export function ProvidersSettings() {
  const { activeModel, setActiveModel } = useApp();

  const [providers, setProviders]       = useState<ProviderMeta[]>([]);
  const [credentials, setCredentials]   = useState<ProviderCredential[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<string>('openrouter');
  const [loading, setLoading]           = useState(false);
  const [testingKeyId, setTestingKeyId] = useState<string | null>(null);
  const [testResults, setTestResults]   = useState<Record<string, { valid: boolean; latencyMs?: number; error?: string }>>({});

  /* Formulaire ajout clé */
  const [showAddForm, setShowAddForm]   = useState(false);
  const [newLabel, setNewLabel]         = useState('');
  const [newRawKey, setNewRawKey]       = useState('');
  const [newPriority, setNewPriority]   = useState(1);
  const [showSecret, setShowSecret]     = useState(false);
  const [testBeforeSave, setTestBeforeSave] = useState(true);
  const [addError, setAddError]         = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const API_BASE = (import.meta as any).env?.VITE_AGENT_HTTP_URL || 'http://localhost:3001';

  const fetchData = async () => {
    setLoading(true);
    try {
      const [provRes, credRes] = await Promise.all([
        fetch(`${API_BASE}/api/providers`).then(r => r.json()),
        fetch(`${API_BASE}/api/credentials`).then(r => r.json())
      ]);
      if (provRes.providers) setProviders(provRes.providers.filter((p: any) => p.id !== 'mock'));
      if (credRes.credentials) setCredentials(credRes.credentials);
    } catch {
      /* silencieux si backend hors ligne */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleAddKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRawKey.trim()) return;
    setIsSubmitting(true);
    setAddError('');
    try {
      const res = await fetch(`${API_BASE}/api/credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: selectedProviderId,
          label: newLabel.trim() || `Clé ${newRawKey.slice(-4)}`,
          key: newRawKey.trim(),
          priority: Number(newPriority) || 1,
          testBeforeSave
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Échec de l\'ajout');
      setNewRawKey(''); setNewLabel(''); setShowAddForm(false);
      await fetchData();
    } catch (err: any) {
      setAddError(err.message || 'Erreur lors de l\'ajout');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleKey = async (cred: ProviderCredential) => {
    try {
      await fetch(`${API_BASE}/api/credentials`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: cred.id, enabled: !cred.enabled })
      });
      fetchData();
    } catch { /* silencieux */ }
  };

  const handleDeleteKey = async (id: string) => {
    if (!confirm('Supprimer définitivement cette clé API ?')) return;
    try {
      await fetch(`${API_BASE}/api/credentials?id=${id}`, { method: 'DELETE' });
      fetchData();
    } catch { /* silencieux */ }
  };

  const handleTestKey = async (id: string) => {
    setTestingKeyId(id);
    try {
      const res = await fetch(`${API_BASE}/api/credentials/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      const data = await res.json();
      setTestResults(prev => ({ ...prev, [id]: data }));
    } catch (err: any) {
      setTestResults(prev => ({ ...prev, [id]: { valid: false, error: err.message } }));
    } finally {
      setTestingKeyId(null);
    }
  };

  const selectedProvider = providers.find(p => p.id === selectedProviderId);
  const providerKeys     = credentials.filter(c => c.providerId === selectedProviderId);

  /* Styles partagés */
  const fieldCls = 'w-full px-3 py-2 bg-[#0a0a0a] border-b border-[#1f1f1f] text-[13px] text-white placeholder:text-[#555555] focus:outline-none focus:border-b-[#aaaaaa] transition-colors font-mono';

  return (
    <div className="h-full overflow-y-auto custom-scrollbar w-full bg-[#0a0a0a]">
      <div className="max-w-5xl mx-auto px-6 py-6">

        {/* En-tête */}
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-[#1f1f1f]">
          <div>
            <h1 className="text-[20px] font-semibold text-white flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-[#8a8a8a]" />
              Fournisseurs IA & Clés API
            </h1>
            <p className="text-[13px] text-[#8a8a8a] mt-1">
              Gérez vos fournisseurs et clés API. La rotation automatique s'active dès qu'une clé atteint son quota.
            </p>
          </div>
          <button
            type="button"
            onClick={fetchData}
            disabled={loading}
            className="btn-ghost text-[13px]"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Actualiser
          </button>
        </div>

        {/* Grille principale */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-0 lg:gap-6">

          {/* Colonne gauche : liste fournisseurs */}
          <div className="lg:col-span-4 border-b lg:border-b-0 lg:border-r border-[#1f1f1f] pb-4 lg:pb-0 lg:pr-6 mb-4 lg:mb-0">
            <p className="text-[12px] text-[#555555] mb-3">Fournisseurs connectés</p>
            <div className="space-y-0">
              {providers.map(p => {
                const isSelected = p.id === selectedProviderId;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedProviderId(p.id)}
                    className={`w-full flex items-center justify-between px-3 py-3 text-left transition-colors border-b border-[#1f1f1f] last:border-b-0 ${
                      isSelected
                        ? 'bg-[#1a1a1a] text-white'
                        : 'text-[#8a8a8a] hover:text-white hover:bg-[#1a1a1a]'
                    }`}
                  >
                    <div>
                      <div className="text-[14px] font-medium">{p.name}</div>
                      <div className="text-[12px] text-[#555555] mt-0.5">
                        {p.keyCount} clé{p.keyCount > 1 ? 's' : ''} · {p.activeKeys} active{p.activeKeys > 1 ? 's' : ''}
                      </div>
                    </div>
                    <span
                      className="w-2 h-2 shrink-0"
                      style={{ background: p.activeKeys > 0 ? '#ffffff' : '#333333' }}
                    />
                  </button>
                );
              })}

              {providers.length === 0 && !loading && (
                <p className="text-[13px] text-[#555555] px-3 py-4">
                  Aucun fournisseur détecté. Vérifiez que le serveur tourne sur le port 3001.
                </p>
              )}
            </div>

            {/* Note tolérance aux pannes */}
            <div className="mt-6 border-t border-[#1f1f1f] pt-4">
              <p className="text-[12px] text-[#555555] leading-relaxed">
                En cas de quota épuisé (429), Iroko bascule automatiquement sur la clé suivante sans interrompre la session.
              </p>
            </div>
          </div>

          {/* Colonne droite : clés du fournisseur sélectionné */}
          <div className="lg:col-span-8 space-y-4">

            {/* Titre fournisseur + bouton ajouter */}
            <div className="flex items-center justify-between pb-3 border-b border-[#1f1f1f]">
              <div>
                <h2 className="text-[16px] font-semibold text-white">{selectedProvider?.name || '—'}</h2>
                <p className="text-[12px] text-[#555555] mt-0.5">Pool de clés et politique de rotation</p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddForm(!showAddForm)}
                className="btn-ghost text-[13px]"
              >
                <Plus className="w-4 h-4" />
                Ajouter une clé
              </button>
            </div>

            {/* Formulaire ajout clé */}
            {showAddForm && (
              <form onSubmit={handleAddKey} className="border-b border-[#1f1f1f] pb-4 space-y-3">
                <p className="text-[12px] text-[#555555]">Nouvelle clé pour {selectedProvider?.name}</p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[12px] text-[#8a8a8a] block mb-1">Nom / Label</label>
                    <input
                      type="text"
                      value={newLabel}
                      onChange={e => setNewLabel(e.target.value)}
                      placeholder="Ex : Production, Backup…"
                      className={fieldCls}
                    />
                  </div>
                  <div>
                    <label className="text-[12px] text-[#8a8a8a] block mb-1">Priorité</label>
                    <select
                      value={newPriority}
                      onChange={e => setNewPriority(Number(e.target.value))}
                      className={fieldCls}
                    >
                      <option value={1}>1 — Priorité maximale</option>
                      <option value={2}>2 — Clé de repli</option>
                      <option value={3}>3 — Secours d'urgence</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-[12px] text-[#8a8a8a] block mb-1">Clé secrète (API Key)</label>
                  <div className="relative">
                    <input
                      type={showSecret ? 'text' : 'password'}
                      value={newRawKey}
                      onChange={e => setNewRawKey(e.target.value)}
                      placeholder="sk-…"
                      required
                      className={`${fieldCls} pr-9`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecret(!showSecret)}
                      className="absolute right-2 top-2 text-[#8a8a8a] hover:text-white transition-colors"
                    >
                      {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {addError && (
                  <p className="text-[13px] text-[#8a8a8a]">⚠ {addError}</p>
                )}

                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-[13px] text-[#8a8a8a] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={testBeforeSave}
                      onChange={e => setTestBeforeSave(e.target.checked)}
                      className="accent-white"
                    />
                    Tester avant d'enregistrer
                  </label>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setShowAddForm(false)} className="btn-ghost text-[13px]">
                      Annuler
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting || !newRawKey.trim()}
                      className="send-btn"
                      style={{ width: 'auto', padding: '0 14px', fontSize: 13 }}
                    >
                      {isSubmitting ? 'Validation…' : 'Enregistrer'}
                    </button>
                  </div>
                </div>
              </form>
            )}

            {/* Liste des clés */}
            {providerKeys.length === 0 ? (
              <div className="py-8 text-center">
                <KeyRound className="w-6 h-6 text-[#555555] mx-auto mb-2" />
                <p className="text-[14px] text-[#8a8a8a]">Aucune clé enregistrée pour ce fournisseur</p>
                <p className="text-[13px] text-[#555555] mt-0.5">
                  Ajoutez votre première clé pour activer les modèles de ce fournisseur.
                </p>
              </div>
            ) : (
              <div className="space-y-0">
                {providerKeys.map(key => {
                  const isTesting  = testingKeyId === key.id;
                  const testResult = testResults[key.id];
                  return (
                    <div
                      key={key.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3 border-b border-[#1f1f1f] last:border-b-0"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="text-[14px] font-medium text-white truncate">{key.label}</span>
                          <span className="text-[12px] text-[#555555] font-mono">P{key.priority}</span>
                          <span className={`text-[12px] ${key.enabled ? 'text-white' : 'text-[#555555]'}`}>
                            {key.enabled ? 'Active' : 'Désactivée'}
                          </span>
                        </div>
                        <div className="text-[12px] font-mono text-[#555555] mt-0.5">{key.maskedKey}</div>
                        {testResult && (
                          <div className="flex items-center gap-1.5 text-[12px] mt-1 text-[#8a8a8a]">
                            {testResult.valid
                              ? <><CheckCircle2 className="w-3.5 h-3.5" /> Valide ({testResult.latencyMs}ms)</>
                              : <><AlertCircle className="w-3.5 h-3.5" /> {testResult.error}</>
                            }
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleTestKey(key.id)}
                          disabled={isTesting}
                          className="btn-ghost text-[13px]"
                        >
                          {isTesting ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Tester'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleKey(key)}
                          className="btn-ghost text-[13px]"
                        >
                          {key.enabled ? 'Désactiver' : 'Activer'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteKey(key.id)}
                          className="btn-ghost text-[13px]"
                          title="Supprimer la clé"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
