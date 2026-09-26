import React from 'react';
import { useDesktopSettings } from '../../../hooks/settings/useDesktopSettings';

export function DesktopPreferencesSection() {
  const {
    isDesktop,
    canAutoLaunch,
    canTray,
    autoLaunch,
    closeToTray,
    loading,
    toggleAutoLaunch,
    toggleCloseToTray
  } = useDesktopSettings();

  const isAutoLaunchSupported = isDesktop && canAutoLaunch;

  return (
    <div className="pt-2 border-t border-[var(--border-subtle)]">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">
          Système & Bureau
        </h3>
        <span className="text-[11px] font-mono text-[var(--text-tertiary)] uppercase">
          [À VALIDER]
        </span>
      </div>

      <div className="space-y-4">
        {/* ── 1. Lancer au démarrage du système ── */}
        <div className="flex items-center justify-between py-2">
          <div className="max-w-xs pr-4">
            <div className="text-[13px] text-[var(--text-primary)]">
              Lancer Iroko au démarrage du système
            </div>
            <p className="text-[12px] text-[var(--text-secondary)] mt-0.5 leading-normal">
              {!isDesktop
                ? "Disponible uniquement dans l'application de bureau Iroko."
                : !canAutoLaunch
                ? "Le démarrage automatique n'est pas supporté sur cette configuration système."
                : "Lance automatiquement Iroko en arrière-plan à la connexion de votre session."}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={autoLaunch}
            aria-label="Lancer Iroko au démarrage du système"
            disabled={loading || !isAutoLaunchSupported}
            aria-disabled={loading || !isAutoLaunchSupported}
            onClick={toggleAutoLaunch}
            title={
              !isDesktop
                ? "Disponible uniquement dans l'application de bureau Iroko"
                : !canAutoLaunch
                ? "Démarrage automatique non supporté"
                : autoLaunch
                ? "Désactiver le démarrage automatique"
                : "Activer le démarrage automatique"
            }
            className={`w-9 h-5 rounded-full transition-colors relative tap-target-24 ${
              !isAutoLaunchSupported ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
            } ${autoLaunch ? 'bg-[var(--text-primary)]' : 'bg-[var(--bg-active)]'}`}
          >
            <span
              className={`w-4 h-4 rounded-full absolute top-0.5 transition-transform ${
                autoLaunch ? 'left-4 bg-[var(--bg-app)]' : 'left-0.5 bg-[var(--text-secondary)]'
              }`}
            />
          </button>
        </div>

        {/* ── 2. Réduire dans la zone de notification au lieu de fermer ── */}
        {/* Visible uniquement si le système d'exploitation le permet proprement (R2e.2) */}
        {canTray && (
          <div className="flex items-center justify-between py-2 border-t border-[var(--border-subtle)]">
            <div className="max-w-xs pr-4">
              <div className="text-[13px] text-[var(--text-primary)]">
                Réduire dans la zone de notification au lieu de fermer
              </div>
              <p className="text-[12px] text-[var(--text-secondary)] mt-0.5 leading-normal">
                Garde Iroko actif dans la zone de notification lors de la fermeture de la fenêtre.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={closeToTray}
              aria-label="Réduire dans la zone de notification au lieu de fermer"
              disabled={loading}
              aria-disabled={loading}
              onClick={toggleCloseToTray}
              title={
                closeToTray
                  ? "Fermer l'application à la fermeture de la fenêtre"
                  : "Réduire dans la zone de notification à la fermeture"
              }
              className={`w-9 h-5 rounded-full transition-colors relative tap-target-24 cursor-pointer ${
                closeToTray ? 'bg-[var(--text-primary)]' : 'bg-[var(--bg-active)]'
              }`}
            >
              <span
                className={`w-4 h-4 rounded-full absolute top-0.5 transition-transform ${
                  closeToTray ? 'left-4 bg-[var(--bg-app)]' : 'left-0.5 bg-[var(--text-secondary)]'
                }`}
              />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
