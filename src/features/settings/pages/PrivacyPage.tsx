import React from 'react';
import { Download, Trash2, Upload, Copy, Check } from 'lucide-react';
import { usePrivacySettings } from '../../../hooks/settings/usePrivacySettings';
import { StorageBreakdownSection } from './StorageBreakdownSection';

export function PrivacyPage() {
  const {
    privacyInfo,
    maskModelEnabled,
    privacySuccessMessage,
    showClearConversationsConfirm,
    setShowClearConversationsConfirm,
    showClearMemoryConfirmInPrivacy,
    setShowClearMemoryConfirmInPrivacy,
    showClearKeysConfirm,
    setShowClearKeysConfirm,
    handleToggleMaskModel,
    handleExportAllData,
    handleClearAllConversations,
    handleClearAllMemoryInPrivacy,
    handleClearAllKeys,
    storageBreakdown,
    cleaningCategory,
    confirmCleanCategory,
    setConfirmCleanCategory,
    handleCleanStorageCategory,
    formatStorageSize,
    isBackingUp,
    isRestoring,
    restoreConfirmPath,
    setRestoreConfirmPath,
    backupSuccessMessage,
    backupErrorMessage,
    handleBackup,
    handlePickRestoreFile,
    handleConfirmRestore,
    diagnosticData,
    diagnosticCopied,
    handleCopyDiagnostic
  } = usePrivacySettings();

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h3 className="text-[14px] font-semibold text-[var(--text-primary)] mb-1">
          Confidentialité
        </h3>
        <p className="text-[12px] text-[var(--text-secondary)] mb-4">
          Paramètres de confidentialité locale, gestion des données et protection des secrets.
        </p>

        {privacySuccessMessage && (
          <div className="p-2.5 mb-4 bg-[var(--bg-surface)] border border-[var(--border-modal)] rounded-[6px] text-[12px] text-[var(--text-primary)]">
            {privacySuccessMessage}
          </div>
        )}

        {/* 1. Dossier de données local */}
        <div className="py-3 border-b border-[var(--border-subtle)]">
          <div className="text-[13px] text-[var(--text-primary)] mb-1">Dossier de données du runtime</div>
          <p className="text-[12px] text-[var(--text-secondary)] mb-2">
            Emplacement local unique où sont stockées la base SQLite, la mémoire et les clés chiffrées (hors workspace).
          </p>
          <div className="bg-[var(--bg-app)] border border-[var(--border-modal)] rounded-[6px] p-2 text-[12px] font-mono text-[var(--text-primary)] select-text break-all">
            {privacyInfo?.dataDir || 'Chargement...'}
          </div>
          {privacyInfo?.stats && (
            <div className="flex gap-4 mt-2 text-[11px] text-[var(--text-secondary)]">
              <span>Discussions : {privacyInfo.stats.conversationsCount}</span>
              <span>Mémoire : {privacyInfo.stats.memoriesCount} faits</span>
              <span>Clés d'API : {privacyInfo.stats.credentialsCount}</span>
            </div>
          )}
        </div>

        {/* 2. Masquage avant envoi au modèle */}
        <div className="flex items-center justify-between py-3 border-b border-[var(--border-subtle)]">
          <div className="max-w-xs">
            <div className="text-[13px] text-[var(--text-primary)]">Masquer les secrets détectés avant envoi au modèle</div>
            <p className="text-[12px] text-[var(--text-secondary)] mt-0.5">
              Filtre à haute confiance les clés d'API et blocs de clés privées avant transmission aux fournisseurs, sans altérer le code légitime.
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleToggleMaskModel(!maskModelEnabled)}
            className={`w-9 h-5 rounded-full relative transition-colors ${
              maskModelEnabled ? 'bg-[var(--text-primary)]' : 'bg-[var(--bg-active)]'
            }`}
            aria-label="Masquer les secrets avant envoi au modèle"
          >
            <span
              className={`w-4 h-4 rounded-full absolute top-0.5 transition-transform ${
                maskModelEnabled ? 'right-0.5 bg-[var(--bg-app)]' : 'left-0.5 bg-[var(--text-secondary)]'
              }`}
            />
          </button>
        </div>

        {/* 3. Actions réelles avec confirmation */}
        <div className="py-3 border-b border-[var(--border-subtle)]">
          <div className="text-[13px] text-[var(--text-primary)] mb-1">Gestion des données locales</div>
          <p className="text-[12px] text-[var(--text-secondary)] mb-3">
            Exportation ou suppression définitive de vos données locales.
          </p>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleExportAllData}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[var(--bg-surface)] hover:bg-[var(--bg-active)] border border-[var(--border-modal)] text-[var(--text-primary)] text-xs rounded-[6px] transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
              <span>Exporter mes données (JSON)</span>
            </button>

            <button
              type="button"
              onClick={() => setShowClearConversationsConfirm(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[var(--bg-surface)] hover:bg-[var(--bg-active)] border border-[var(--border-modal)] text-[var(--text-primary)] text-xs rounded-[6px] transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
              <span>Supprimer les discussions</span>
            </button>

            <button
              type="button"
              onClick={() => setShowClearMemoryConfirmInPrivacy(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[var(--bg-surface)] hover:bg-[var(--bg-active)] border border-[var(--border-modal)] text-[var(--text-primary)] text-xs rounded-[6px] transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
              <span>Supprimer la mémoire</span>
            </button>

            <button
              type="button"
              onClick={() => setShowClearKeysConfirm(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[var(--bg-surface)] hover:bg-[var(--bg-active)] border border-[var(--border-modal)] text-[var(--text-primary)] text-xs rounded-[6px] transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
              <span>Supprimer les clés d'API</span>
            </button>
          </div>

          {/* Confirmation Suppression Discussions */}
          {showClearConversationsConfirm && (
            <div className="mt-3 bg-[var(--bg-surface)] border border-[var(--border-modal)] rounded-[6px] p-3 space-y-2">
              <div className="text-[12px] text-[var(--text-primary)] font-medium">Confirmer la suppression de toutes les discussions ?</div>
              <p className="text-[11px] text-[var(--text-secondary)]">
                L'historique complet des discussions et des messages sera supprimé. La mémoire et les clés restent conservées.
              </p>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowClearConversationsConfirm(false)}
                  className="px-2.5 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={handleClearAllConversations}
                  className="px-3 py-1 bg-[var(--bg-active)] border border-[var(--border-modal)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] text-xs font-medium rounded-[6px]"
                >
                  Confirmer la suppression
                </button>
              </div>
            </div>
          )}

          {/* Confirmation Suppression Mémoire */}
          {showClearMemoryConfirmInPrivacy && (
            <div className="mt-3 bg-[var(--bg-surface)] border border-[var(--border-modal)] rounded-[6px] p-3 space-y-2">
              <div className="text-[12px] text-[var(--text-primary)] font-medium">Confirmer la suppression de toute la mémoire ?</div>
              <p className="text-[11px] text-[var(--text-secondary)]">
                Tous les faits et décisions mémorisés seront supprimés. Les discussions et les clés restent conservées.
              </p>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowClearMemoryConfirmInPrivacy(false)}
                  className="px-2.5 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={handleClearAllMemoryInPrivacy}
                  className="px-3 py-1 bg-[var(--bg-active)] border border-[var(--border-modal)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] text-xs font-medium rounded-[6px]"
                >
                  Confirmer la suppression
                </button>
              </div>
            </div>
          )}

          {/* Confirmation Suppression Clés */}
          {showClearKeysConfirm && (
            <div className="mt-3 bg-[var(--bg-surface)] border border-[var(--border-modal)] rounded-[6px] p-3 space-y-2">
              <div className="text-[12px] text-[var(--text-primary)] font-medium">Confirmer la suppression de toutes les clés d'API ?</div>
              <p className="text-[11px] text-[var(--text-secondary)]">
                Toutes les clés d'API enregistrées seront définitivement effacées du trousseau local. Vous devrez les ressaisir pour utiliser les modèles.
              </p>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowClearKeysConfirm(false)}
                  className="px-2.5 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={handleClearAllKeys}
                  className="px-3 py-1 bg-[var(--bg-active)] border border-[var(--border-modal)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] text-xs font-medium rounded-[6px]"
                >
                  Confirmer la suppression
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 3b. Sauvegarde & Restauration SQLite */}
        <div className="py-3 border-b border-[var(--border-subtle)]">
          <div className="text-[13px] text-[var(--text-primary)] mb-1">Sauvegarde & Restauration de la base</div>
          <p className="text-[12px] text-[var(--text-secondary)] mb-3">
            Créez une archive ZIP autonome de la base SQLite et de vos préférences locales (excluant par défaut les clés d'API et jetons sensibles). Vous pouvez également restaurer une archive antérieure.
          </p>

          {backupSuccessMessage && (
            <div className="p-2 mb-3 bg-[var(--bg-surface)] border border-[var(--border-modal)] rounded-[6px] text-[12px] text-[var(--text-primary)]">
              {backupSuccessMessage}
            </div>
          )}
          {backupErrorMessage && (
            <div className="p-2 mb-3 bg-[var(--bg-error-subtle)] border border-[var(--border-error-subtle)] rounded-[6px] text-[12px] text-[var(--text-primary)]">
              {backupErrorMessage}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleBackup}
              disabled={isBackingUp}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[var(--bg-surface)] hover:bg-[var(--bg-active)] border border-[var(--border-modal)] text-[var(--text-primary)] text-xs rounded-[6px] transition-colors disabled:opacity-40 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
              <span>{isBackingUp ? 'Création de la sauvegarde...' : 'Sauvegarder la base (ZIP)'}</span>
            </button>

            <button
              type="button"
              onClick={handlePickRestoreFile}
              disabled={isRestoring}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[var(--bg-surface)] hover:bg-[var(--bg-active)] border border-[var(--border-modal)] text-[var(--text-primary)] text-xs rounded-[6px] transition-colors disabled:opacity-40 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
              <span>Restaurer une sauvegarde</span>
            </button>
          </div>

          {restoreConfirmPath && (
            <div className="mt-3 bg-[var(--bg-surface)] border border-[var(--border-modal)] rounded-[6px] p-3 space-y-2">
              <div className="text-[12px] text-[var(--text-primary)] font-medium">Confirmer la restauration de la base ?</div>
              <p className="text-[11px] text-[var(--text-secondary)]">
                Fichier sélectionné : <span className="font-mono text-[var(--text-primary)]">{restoreConfirmPath}</span>
              </p>
              <p className="text-[11px] text-[var(--text-secondary)]">
                La base actuelle sera remplacée. Une copie de secours automatique (.pre-restore.bak) sera créée avant le remplacement.
              </p>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setRestoreConfirmPath(null)}
                  className="px-2.5 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={handleConfirmRestore}
                  disabled={isRestoring}
                  className="px-3 py-1 bg-[var(--bg-active)] border border-[var(--border-modal)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] text-xs font-medium rounded-[6px] cursor-pointer"
                >
                  {isRestoring ? 'Restauration en cours...' : 'Confirmer la restauration'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 3c. Diagnostic système anonymisé */}
        <div className="py-3 border-b border-[var(--border-subtle)]">
          <div className="flex items-center justify-between mb-1">
            <div className="text-[13px] text-[var(--text-primary)]">Diagnostic système</div>
            <button
              type="button"
              onClick={handleCopyDiagnostic}
              className="flex items-center gap-1.5 px-2 py-1 bg-[var(--bg-surface)] hover:bg-[var(--bg-active)] border border-[var(--border-modal)] text-[var(--text-primary)] text-[11px] rounded-[6px] transition-colors cursor-pointer"
              title="Copier le diagnostic sans secrets pour support ou vérification"
            >
              {diagnosticCopied ? (
                <>
                  <Check className="w-3 h-3 text-[var(--text-primary)]" />
                  <span>Copié !</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3 text-[var(--text-secondary)]" />
                  <span>Copier le diagnostic</span>
                </>
              )}
            </button>
          </div>
          <p className="text-[12px] text-[var(--text-secondary)] mb-3">
            Informations techniques locales sans aucun secret ni donnée nominative (chemins anonymisés).
          </p>

          <div className="bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded-[6px] p-3 text-[11px] font-mono text-[var(--text-secondary)] space-y-1 select-text overflow-x-auto">
            {diagnosticData ? (
              <>
                <div><span className="text-[var(--text-primary)]">Iroko :</span> v{diagnosticData.appVersion} | Node {diagnosticData.nodeVersion}</div>
                <div><span className="text-[var(--text-primary)]">Plateforme :</span> {diagnosticData.platform}</div>
                <div><span className="text-[var(--text-primary)]">Port runtime :</span> {diagnosticData.runtimePort}</div>
                <div><span className="text-[var(--text-primary)]">Base SQLite :</span> Schéma v{diagnosticData.database?.schemaVersion} ({Math.round((diagnosticData.database?.sizeBytes || 0) / 1024)} Ko)</div>
                <div><span className="text-[var(--text-primary)]">Dossier données :</span> {diagnosticData.dataDir}</div>
                <div><span className="text-[var(--text-primary)]">Fournisseurs configurés :</span> {diagnosticData.connectedProviders?.join(', ') || 'aucun'}</div>
                <div><span className="text-[var(--text-primary)]">Serveurs MCP :</span> {diagnosticData.mcpServers?.length || 0} configuré(s)</div>
                {diagnosticData.recentErrors && diagnosticData.recentErrors.length > 0 ? (
                  <div className="pt-1 text-[var(--text-muted)]">
                    Dernière erreur : {diagnosticData.recentErrors[0].message}
                  </div>
                ) : (
                  <div><span className="text-[var(--text-primary)]">Erreurs récentes :</span> 0</div>
                )}
              </>
            ) : (
              <div>Chargement du diagnostic...</div>
            )}
          </div>
        </div>

        {/* 3d. Espace disque par catégorie (Composant dédié) */}
        <StorageBreakdownSection
          storageBreakdown={storageBreakdown}
          cleaningCategory={cleaningCategory}
          confirmCleanCategory={confirmCleanCategory}
          setConfirmCleanCategory={setConfirmCleanCategory}
          handleCleanStorageCategory={handleCleanStorageCategory}
          formatStorageSize={formatStorageSize}
        />

        {/* 4. Notes d'information réelles */}
        <div className="pt-3 space-y-2">
          <div className="text-[12px] text-[var(--text-secondary)]">
            <span className="text-[var(--text-primary)] font-medium">Zéro télémétrie :</span> Aucune télémétrie ni donnée d'utilisation ne quitte cette machine. Vos données restent exclusivement sur votre disque.
          </div>
          <div className="text-[12px] text-[var(--text-secondary)]">
            <span className="text-[var(--text-primary)] font-medium">Services vocaux :</span> La dictée et la lecture audio utilisent l'API Web Speech native de votre navigateur, pouvant faire appel au moteur vocal du système hôte.
          </div>
          <div className="text-[12px] text-[var(--text-secondary)]">
            <span className="text-[var(--text-primary)] font-medium">Destinations réseau :</span> Seuls les fournisseurs configurés et serveurs MCP locaux sont sollicités. Consultez la documentation complète dans <code className="text-[var(--text-primary)]">docs/NETWORK.md</code>.
          </div>
        </div>
      </div>
    </div>
  );
}
