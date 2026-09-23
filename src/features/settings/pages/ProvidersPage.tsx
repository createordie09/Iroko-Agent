import React from 'react';
import { Plus, Trash2, Image as ImageIcon, Film, ArrowRight } from 'lucide-react';
import { useProvidersSettings } from '../../../hooks/settings/useProvidersSettings';
import { ManageModelsSection } from './ManageModelsSection';

export function ProvidersPage() {
  const {
    providers, credentials, selectedProviderId, setSelectedProviderId,
    newKeyLabel, setNewKeyLabel, newKeyRaw, setNewKeyRaw,
    showAddKeyForm, setShowAddKeyForm, showSecret, testingKeyId, testStatus,
    showManageModels, setShowManageModels, refreshingProviderId,
    handleTestCredential, handleTestProvider, handleRefreshProvider,
    handleDeleteProviderKeys, getProviderStatusText, handleAddCredential, handleDeleteCredential,
    imageProviders, imageModels, activeImageProvider, activeImageModel, setActiveImageModel,
    imageApiKey, setImageApiKey, imageAccountId, setImageAccountId,
    imageHasKey, imageMaskedKey, imageSaveSuccess, isSavingImageSettings,
    handleSelectImageProvider, handleSaveMediaSettings,
    videoProviders, videoModels, activeVideoProvider, activeVideoModel, setActiveVideoModel,
    videoApiKey, setVideoApiKey, videoHasKey, videoMaskedKey, videoTimeoutMs, setVideoTimeoutMs,
    videoSaveSuccess, isSavingVideoSettings, handleSelectVideoProvider, handleSaveVideoSettings
  } = useProvidersSettings();

  if (showManageModels) {
    return <ManageModelsSection onBack={() => setShowManageModels(false)} />;
  }

  const selectedProvider = providers.find(p => p.id === selectedProviderId);

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">
            Fournisseurs IA & Clés API
          </h3>
          <button
            type="button"
            onClick={() => setShowManageModels(true)}
            className="btn-ghost text-[12px] gap-1 cursor-pointer"
          >
            <span>Gérer les modèles</span>
            <ArrowRight className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />
          </button>
        </div>
        <p className="text-[12px] text-[var(--text-secondary)] mb-4">
          Une ligne par fournisseur. La rotation automatique s'active en cas de quota épuisé (429).
        </p>

        {/* Lignes de fournisseurs avec URL pré-remplie, statut gris et actions */}
        <div className="space-y-2">
          {providers.map(p => {
            const statusText = getProviderStatusText(p);
            const hasKeys = p.keyCount > 0;
            const isRefreshing = refreshingProviderId === p.id;

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
                  {/* Statut en texte gris : "Prêt · N modèles", "Clé refusée", "Fournisseur injoignable" */}
                  <div className="text-[12px] text-[var(--text-secondary)] mt-0.5">
                    {statusText}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {hasKeys ? (
                    <>
                      <button
                        type="button"
                        onClick={() => handleTestProvider(p.id)}
                        disabled={testingKeyId !== null}
                        className="btn-ghost text-[11px] py-1 px-2 cursor-pointer"
                      >
                        Tester
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRefreshProvider(p.id)}
                        disabled={isRefreshing}
                        className="btn-ghost text-[11px] py-1 px-2 cursor-pointer"
                      >
                        {isRefreshing ? 'Actualisation…' : 'Actualiser'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteProviderKeys(p.id)}
                        className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-[4px] hover:bg-[var(--bg-active)] transition-colors cursor-pointer"
                        title="Supprimer la clé"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedProviderId(p.id);
                        setShowAddKeyForm(true);
                      }}
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

        {/* Formulaire d'ajout de clé pour un preset */}
        {showAddKeyForm && (
          <form
            onSubmit={handleAddCredential}
            className="p-3 bg-[var(--bg-surface)] border border-[var(--border-modal)] rounded-[var(--radius-item)] space-y-3 mt-4"
          >
            <div className="text-[12px] text-[var(--text-primary)] font-medium">
              Nouvelle clé pour {selectedProvider?.name || selectedProviderId}
            </div>

            {/* URL pré-remplie (lecture seule pour presets standards) */}
            {selectedProvider?.baseUrl && (
              <div>
                <label className="text-[11px] text-[var(--text-secondary)] block mb-1">URL du service (pré-configurée)</label>
                <input
                  type="text"
                  value={selectedProvider.baseUrl}
                  readOnly
                  disabled
                  className="w-full bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded-[6px] px-3 py-1.5 text-[12px] text-[var(--text-tertiary)] font-mono opacity-80 cursor-not-allowed"
                />
              </div>
            )}

            <div>
              <label className="text-[11px] text-[var(--text-secondary)] block mb-1">Clé API (seule la clé est à saisir)</label>
              <input
                type={showSecret ? 'text' : 'password'}
                value={newKeyRaw}
                onChange={e => setNewKeyRaw(e.target.value)}
                placeholder="sk-..."
                className="w-full bg-[var(--bg-app)] border border-[var(--bg-active)] rounded-[6px] px-3 py-1.5 text-[13px] text-[var(--text-primary)] font-mono focus:outline-none"
                autoFocus
              />
            </div>

            <div>
              <label className="text-[11px] text-[var(--text-secondary)] block mb-1">Libellé facultatif</label>
              <input
                type="text"
                value={newKeyLabel}
                onChange={e => setNewKeyLabel(e.target.value)}
                placeholder="Ex: Clé personnelle"
                className="w-full bg-[var(--bg-app)] border border-[var(--bg-active)] rounded-[6px] px-3 py-1.5 text-[13px] text-[var(--text-primary)] focus:outline-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowAddKeyForm(false)}
                className="btn-ghost text-[12px] cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={!newKeyRaw.trim()}
                className="px-3 py-1 bg-[var(--text-primary)] text-[var(--bg-app)] text-[12px] rounded-[6px] font-medium disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                Enregistrer
              </button>
            </div>
          </form>
        )}

        {/* ── Sous-section Génération d'images (Mission M6) ── */}
        <div className="pt-6 mt-6 border-t border-[var(--border-subtle)]">
          <h3 className="text-[14px] font-semibold text-[var(--text-primary)] mb-1 flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-[var(--text-secondary)]" />
            <span>Génération d'images</span>
          </h3>
          <p className="text-[12px] text-[var(--text-secondary)] mb-4">
            Fournisseur média dédié à la création d'images (Cahier §10, §26). La clé est chiffrée avec le même trousseau sécurisé hors dépôt.
          </p>

          <div className="space-y-3 bg-[var(--bg-surface)] border border-[var(--border-modal)] p-3.5 rounded-[var(--radius-item)]">
            <div>
              <label className="text-[11px] text-[var(--text-secondary)] uppercase tracking-wider block mb-1">Fournisseur d'images</label>
              <select
                value={activeImageProvider}
                onChange={e => handleSelectImageProvider(e.target.value)}
                className="w-full bg-[var(--bg-app)] border border-[var(--bg-active)] rounded-[6px] px-3 py-1.5 text-[13px] text-[var(--text-primary)] outline-none"
              >
                <option value="">-- Aucun fournisseur sélectionné --</option>
                {imageProviders.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            {imageModels.length > 0 && (
              <div>
                <label className="text-[11px] text-[var(--text-secondary)] uppercase tracking-wider block mb-1">Modèle</label>
                <select
                  value={activeImageModel}
                  onChange={e => setActiveImageModel(e.target.value)}
                  className="w-full bg-[var(--bg-app)] border border-[var(--bg-active)] rounded-[6px] px-3 py-1.5 text-[13px] text-[var(--text-primary)] outline-none"
                >
                  {imageModels.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
            )}

            {activeImageProvider && activeImageProvider !== 'mock' && (
              <div>
                <label className="text-[11px] text-[var(--text-secondary)] uppercase tracking-wider block mb-1">
                  Clé d'API ou Jeton {imageHasKey && <span className="text-[var(--text-muted)] normal-case">(Actuellement{'\u00A0'}: {imageMaskedKey || 'enregistrée'})</span>}
                </label>
                <input
                  type="password"
                  value={imageApiKey}
                  onChange={e => setImageApiKey(e.target.value)}
                  placeholder={imageHasKey ? "Laisser vide pour conserver la clé actuelle" : "Clé ou jeton d'API..."}
                  className="w-full bg-[var(--bg-app)] border border-[var(--bg-active)] rounded-[6px] px-3 py-1.5 text-[13px] text-[var(--text-primary)] font-mono outline-none"
                />
              </div>
            )}

            {activeImageProvider === 'cloudflare' && (
              <div>
                <label className="text-[11px] text-[var(--text-secondary)] uppercase tracking-wider block mb-1">Identifiant de compte Cloudflare (Account ID)</label>
                <input
                  type="text"
                  value={imageAccountId}
                  onChange={e => setImageAccountId(e.target.value)}
                  placeholder="ID de compte Cloudflare..."
                  className="w-full bg-[var(--bg-app)] border border-[var(--bg-active)] rounded-[6px] px-3 py-1.5 text-[13px] text-[var(--text-primary)] font-mono outline-none"
                />
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <div className="text-[12px] text-[var(--text-secondary)]">
                {imageSaveSuccess && <span className="text-[var(--text-primary)]">Réglages d'images enregistrés.</span>}
              </div>
              <button
                type="button"
                onClick={handleSaveMediaSettings}
                disabled={isSavingImageSettings}
                className="px-3 py-1.5 bg-[var(--text-primary)] text-[var(--bg-app)] text-[12px] rounded-[6px] font-medium hover:bg-[var(--text-title)] transition-colors"
              >
                {isSavingImageSettings ? 'Enregistrement...' : 'Enregistrer les réglages d\'image'}
              </button>
            </div>
          </div>
        </div>

        {/* ── Sous-section Génération de vidéos (Mission M7) ── */}
        <div className="pt-6 mt-6 border-t border-[var(--border-subtle)]">
          <h3 className="text-[14px] font-semibold text-[var(--text-primary)] mb-1 flex items-center gap-2">
            <Film className="w-4 h-4 text-[var(--text-secondary)]" />
            <span>Génération de vidéos</span>
          </h3>
          <p className="text-[12px] text-[var(--text-secondary)] mb-4">
            Fournisseur média dédié à la génération asynchrone de vidéos (Cahier §10, §26). Les clés sont chiffrées au repos par AES-256-GCM.
          </p>

          <div className="space-y-3 bg-[var(--bg-surface)] border border-[var(--border-modal)] p-3.5 rounded-[var(--radius-item)]">
            <div>
              <label className="text-[11px] text-[var(--text-secondary)] uppercase tracking-wider block mb-1">Fournisseur de vidéos</label>
              <select
                value={activeVideoProvider}
                onChange={e => handleSelectVideoProvider(e.target.value)}
                className="w-full bg-[var(--bg-app)] border border-[var(--bg-active)] rounded-[6px] px-3 py-1.5 text-[13px] text-[var(--text-primary)] outline-none"
              >
                <option value="">-- Aucun fournisseur sélectionné --</option>
                {videoProviders.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            {videoModels.length > 0 && (
              <div>
                <label className="text-[11px] text-[var(--text-secondary)] uppercase tracking-wider block mb-1">Modèle</label>
                <select
                  value={activeVideoModel}
                  onChange={e => setActiveVideoModel(e.target.value)}
                  className="w-full bg-[var(--bg-app)] border border-[var(--bg-active)] rounded-[6px] px-3 py-1.5 text-[13px] text-[var(--text-primary)] outline-none"
                >
                  {videoModels.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
            )}

            {activeVideoProvider && activeVideoProvider !== 'mock' && (
              <div>
                <label className="text-[11px] text-[var(--text-secondary)] uppercase tracking-wider block mb-1">
                  Clé d'API ou Jeton {videoHasKey && <span className="text-[var(--text-muted)] normal-case">(Actuellement{'\u00A0'}: {videoMaskedKey || 'enregistrée'})</span>}
                </label>
                <input
                  type="password"
                  value={videoApiKey}
                  onChange={e => setVideoApiKey(e.target.value)}
                  placeholder={videoHasKey ? "Laisser vide pour conserver la clé actuelle" : "Clé ou jeton d'API..."}
                  className="w-full bg-[var(--bg-app)] border border-[var(--bg-active)] rounded-[6px] px-3 py-1.5 text-[13px] text-[var(--text-primary)] font-mono outline-none"
                />
              </div>
            )}

            <div>
              <label className="text-[11px] text-[var(--text-secondary)] uppercase tracking-wider block mb-1">Délai d'attente maximal (Timeout)</label>
              <select
                value={videoTimeoutMs}
                onChange={e => setVideoTimeoutMs(Number(e.target.value))}
                className="w-full bg-[var(--bg-app)] border border-[var(--bg-active)] rounded-[6px] px-3 py-1.5 text-[13px] text-[var(--text-primary)] outline-none"
              >
                <option value={300000}>5 minutes (300 000 ms)</option>
                <option value={600000}>10 minutes (600 000 ms - Défaut)</option>
                <option value={900000}>15 minutes (900 000 ms)</option>
              </select>
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="text-[12px] text-[var(--text-secondary)]">
                {videoSaveSuccess && <span className="text-[var(--text-primary)]">Réglages vidéo enregistrés.</span>}
              </div>
              <button
                type="button"
                onClick={handleSaveVideoSettings}
                disabled={isSavingVideoSettings}
                className="px-3 py-1.5 bg-[var(--text-primary)] text-[var(--bg-app)] text-[12px] rounded-[6px] font-medium hover:bg-[var(--text-title)] transition-colors"
              >
                {isSavingVideoSettings ? 'Enregistrement...' : 'Enregistrer les réglages vidéo'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
