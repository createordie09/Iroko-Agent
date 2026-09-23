import React from 'react';
import { Monitor, Sun, Moon, ChevronDown, Check } from 'lucide-react';
import { usePreferencesSettings } from '../../../hooks/settings/usePreferencesSettings';
import { VoiceSpeed } from '../../../services/speech/SpeechService';

export function PreferencesPage() {
  const {
    conversationFont,
    setConversationFont,
    theme,
    setTheme,
    animations,
    setAnimations,
    voiceLang,
    setVoiceLang,
    voiceURI,
    setVoiceURI,
    voiceSpeed,
    setVoiceSpeed,
    notificationsEnabled,
    toggleNotifications,
    availableVoices,
    isSynthesisSupported,
    isLangMenuOpen,
    setIsLangMenuOpen,
    isVoiceMenuOpen,
    setIsVoiceMenuOpen,
    isSpeedMenuOpen,
    setIsSpeedMenuOpen,
    customInstructions,
    setCustomInstructions,
    isSavingCustomInstructions,
    customInstructionsSuccess,
    customInstructionsError,
    handleSaveCustomInstructions,
    isNotificationSupported
  } = usePreferencesSettings();

  return (
    <div className="space-y-6 max-w-xl">
      {/* ── Section Apparence ── */}
      <div>
        <h3 className="text-[14px] font-semibold text-[var(--text-primary)] mb-4">
          Apparence
        </h3>

        {/* Thème */}
        <div className="flex items-center justify-between py-3 border-b border-[var(--border-subtle)]">
          <span className="text-[13px] text-[var(--text-primary)]">Thème</span>
          <div className="flex items-center bg-[var(--bg-app)] p-0.5 rounded-[var(--radius-button)] border border-[var(--bg-active)]">
            <button
              type="button"
              onClick={() => setTheme('system')}
              className={`p-1.5 rounded-[6px] text-xs transition-colors ${
                theme === 'system' ? 'bg-[var(--bg-active)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
              title="Système"
            >
              <Monitor className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setTheme('light')}
              className={`p-1.5 rounded-[6px] text-xs transition-colors ${
                theme === 'light' ? 'bg-[var(--bg-active)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
              title="Clair"
            >
              <Sun className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setTheme('dark')}
              className={`p-1.5 rounded-[6px] text-xs transition-colors ${
                theme === 'dark' ? 'bg-[var(--bg-active)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
              title="Sombre"
            >
              <Moon className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Police de la conversation */}
        <div className="flex items-center justify-between py-3 border-b border-[var(--border-subtle)]">
          <span className="text-[13px] text-[var(--text-primary)]">Police de la conversation</span>
          <button
            type="button"
            onClick={() => setConversationFont(conversationFont === 'serif' ? 'sans' : 'serif')}
            className="flex items-center gap-1.5 text-[13px] text-[var(--text-primary)] hover:text-[var(--text-title)] transition-colors"
          >
            <span>{conversationFont === 'serif' ? 'Iroko Serif' : 'Sans-serif'}</span>
            <ChevronDown className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
          </button>
        </div>

        {/* Animations (Système / Réduites) */}
        <div className="flex items-center justify-between py-3">
          <div className="max-w-xs">
            <div className="text-[13px] text-[var(--text-primary)]">Animations</div>
            <p className="text-[12px] text-[var(--text-secondary)] mt-0.5 leading-normal">
              Réduisez les animations lors de l'affichage progressif des réponses et dans les autres éléments de l'interface.
            </p>
          </div>
          <div className="flex items-center bg-[var(--bg-app)] p-0.5 rounded-[var(--radius-button)] border border-[var(--bg-active)] shrink-0">
            <button
              type="button"
              onClick={() => setAnimations('system')}
              className={`px-3 py-1 text-[12px] rounded-[6px] transition-colors ${
                animations === 'system' ? 'bg-[var(--bg-active)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              Système
            </button>
            <button
              type="button"
              onClick={() => setAnimations('reduced')}
              className={`px-3 py-1 text-[12px] rounded-[6px] transition-colors ${
                animations === 'reduced' ? 'bg-[var(--bg-active)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              Réduites
            </button>
          </div>
        </div>
      </div>

      {/* ── Section Voix ── */}
      <div className="pt-2 border-t border-[var(--border-subtle)]">
        <h3 className="text-[14px] font-semibold text-[var(--text-primary)] mb-4">
          Voix
        </h3>

        {/* Langue */}
        <div className="relative border-b border-[var(--border-subtle)]">
          <div 
            className={`flex items-center justify-between py-3 ${
              !isSynthesisSupported ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
            }`}
            onClick={() => isSynthesisSupported && setIsLangMenuOpen(!isLangMenuOpen)}
            title={!isSynthesisSupported ? "Synthèse vocale non supportée par ce navigateur" : "Changer la langue"}
          >
            <span className="text-[13px] text-[var(--text-primary)]">Langue</span>
            <div className="flex items-center gap-1.5 text-[13px] text-[var(--text-primary)]">
              <span>{voiceLang || 'Français'}</span>
              <ChevronDown className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
            </div>
          </div>
          {isLangMenuOpen && (
            <div className="absolute right-0 top-[calc(100%-4px)] w-48 bg-[var(--bg-modal)] border border-[var(--border-modal)] rounded-[8px] py-1 z-50">
              {['Français', 'English', 'Español', 'Deutsch', 'Italiano'].map(lang => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => {
                    setVoiceLang(lang);
                    setIsLangMenuOpen(false);
                  }}
                  className={`w-full px-3 py-1.5 text-left text-[13px] flex items-center justify-between hover:bg-[var(--bg-active)] ${
                    voiceLang === lang ? 'text-[var(--text-primary)] font-medium bg-[var(--border-subtle)]' : 'text-[var(--text-secondary)]'
                  }`}
                >
                  <span>{lang}</span>
                  {voiceLang === lang && <Check className="w-3.5 h-3.5 text-[var(--text-primary)]" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Style */}
        <div className="relative border-b border-[var(--border-subtle)]">
          <div 
            className={`flex items-center justify-between py-3 ${
              !isSynthesisSupported ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
            }`}
            onClick={() => isSynthesisSupported && setIsVoiceMenuOpen(!isVoiceMenuOpen)}
            title={!isSynthesisSupported ? "Synthèse vocale non supportée par ce navigateur" : "Changer la voix"}
          >
            <span className="text-[13px] text-[var(--text-primary)]">Style</span>
            {voiceURI ? (
              <div className="flex items-center gap-1.5 text-[13px] text-[var(--text-primary)]">
                <span>{availableVoices.find(v => v.voiceURI === voiceURI)?.name || 'Voix personnalisée'}</span>
                <ChevronDown className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
              </div>
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
            )}
          </div>
          {isVoiceMenuOpen && (
            <div className="absolute right-0 top-[calc(100%-4px)] w-64 max-h-48 overflow-y-auto claude-scrollbar bg-[var(--bg-modal)] border border-[var(--border-modal)] rounded-[8px] py-1 z-50">
              <button
                type="button"
                onClick={() => {
                  setVoiceURI('');
                  setIsVoiceMenuOpen(false);
                }}
                className={`w-full px-3 py-1.5 text-left text-[13px] flex items-center justify-between hover:bg-[var(--bg-active)] ${
                  !voiceURI ? 'text-[var(--text-primary)] font-medium bg-[var(--border-subtle)]' : 'text-[var(--text-secondary)]'
                }`}
              >
                <span>Par défaut</span>
                {!voiceURI && <Check className="w-3.5 h-3.5 text-[var(--text-primary)]" />}
              </button>
              {availableVoices.map(voice => (
                <button
                  key={voice.voiceURI}
                  type="button"
                  onClick={() => {
                    setVoiceURI(voice.voiceURI);
                    setIsVoiceMenuOpen(false);
                  }}
                  className={`w-full px-3 py-1.5 text-left text-[13px] flex items-center justify-between hover:bg-[var(--bg-active)] ${
                    voiceURI === voice.voiceURI ? 'text-[var(--text-primary)] font-medium bg-[var(--border-subtle)]' : 'text-[var(--text-secondary)]'
                  }`}
                >
                  <span className="truncate pr-2">{voice.name} ({voice.lang})</span>
                  {voiceURI === voice.voiceURI && <Check className="w-3.5 h-3.5 text-[var(--text-primary)] shrink-0" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Vitesse */}
        <div className="relative">
          <div 
            className={`flex items-center justify-between py-3 ${
              !isSynthesisSupported ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
            }`}
            onClick={() => isSynthesisSupported && setIsSpeedMenuOpen(!isSpeedMenuOpen)}
            title={!isSynthesisSupported ? "Synthèse vocale non supportée par ce navigateur" : "Changer la vitesse"}
          >
            <span className="text-[13px] text-[var(--text-primary)]">Vitesse</span>
            <div className="flex items-center gap-1.5 text-[13px] text-[var(--text-primary)]">
              <span>{voiceSpeed}</span>
              <ChevronDown className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
            </div>
          </div>
          {isSpeedMenuOpen && (
            <div className="absolute right-0 top-[calc(100%-4px)] w-48 bg-[var(--bg-modal)] border border-[var(--border-modal)] rounded-[8px] py-1 z-50">
              {(['Lente', 'Normale', 'Rapide'] as VoiceSpeed[]).map(speed => (
                <button
                  key={speed}
                  type="button"
                  onClick={() => {
                    setVoiceSpeed(speed);
                    setIsSpeedMenuOpen(false);
                  }}
                  className={`w-full px-3 py-1.5 text-left text-[13px] flex items-center justify-between hover:bg-[var(--bg-active)] ${
                    voiceSpeed === speed ? 'text-[var(--text-primary)] font-medium bg-[var(--border-subtle)]' : 'text-[var(--text-secondary)]'
                  }`}
                >
                  <span>{speed}</span>
                  {voiceSpeed === speed && <Check className="w-3.5 h-3.5 text-[var(--text-primary)]" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Section Notifications ── */}
      <div className="pt-2 border-t border-[var(--border-subtle)]">
        <h3 className="text-[14px] font-semibold text-[var(--text-primary)] mb-4">
          Notifications
        </h3>

        <div className="flex items-center justify-between py-2">
          <div className="max-w-xs">
            <div className="text-[13px] text-[var(--text-primary)]">Fin de réponse</div>
            <p className="text-[12px] text-[var(--text-secondary)] mt-0.5 leading-normal">
              Recevez une notification lorsque Iroko a terminé une réponse. Utile pour les tâches de longue durée.
            </p>
          </div>
          <button
            type="button"
            onClick={async () => {
              await toggleNotifications();
            }}
            title={
              !isNotificationSupported
                ? "Notifications non supportées par ce navigateur"
                : notificationsEnabled
                ? "Désactiver les notifications"
                : "Activer les notifications"
            }
            className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${
              notificationsEnabled ? 'bg-[var(--text-primary)]' : 'bg-[var(--bg-active)]'
            }`}
          >
            <span
              className={`w-4 h-4 rounded-full absolute top-0.5 transition-transform ${
                notificationsEnabled ? 'left-4 bg-[var(--bg-app)]' : 'left-0.5 bg-[var(--text-secondary)]'
              }`}
            />
          </button>
        </div>
      </div>

      {/* ── Section Instructions personnalisées ── */}
      <div className="pt-2 border-t border-[var(--border-subtle)]">
        <h3 className="text-[14px] font-semibold text-[var(--text-primary)] mb-2">
          Instructions personnalisées
        </h3>
        <p className="text-[12px] text-[var(--text-secondary)] mb-3">
          Ces directives sont transmises au modèle au début de chaque échange pour guider son style et ses réponses, dans la limite de 4000 caractères. Ne pas y inclure de clés d'API ou d'identifiants sensibles.
        </p>

        {customInstructionsSuccess && (
          <div className="p-2 mb-3 bg-[var(--bg-surface)] border border-[var(--border-modal)] rounded-[6px] text-[12px] text-[var(--text-primary)]">
            {customInstructionsSuccess}
          </div>
        )}
        {customInstructionsError && (
          <div className="p-2 mb-3 bg-[var(--bg-error-subtle)] border border-[var(--border-error-subtle)] rounded-[6px] text-[12px] text-[var(--text-primary)]">
            {customInstructionsError}
          </div>
        )}

        <div className="space-y-2">
          <textarea
            value={customInstructions}
            onChange={(e) => setCustomInstructions(e.target.value)}
            rows={4}
            maxLength={4000}
            placeholder={`Exemple\u00A0: Réponds toujours de façon concise, privilégie le typage strict en TypeScript, évite le superflu…`}
            className="w-full bg-[var(--bg-app)] border border-[var(--bg-active)] focus:border-[var(--border-focus)] rounded-[6px] p-3 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] resize-y outline-none"
          />
          <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
            <span>
              {customInstructions.length} / 4000 caractères
            </span>
            <button
              type="button"
              onClick={handleSaveCustomInstructions}
              disabled={isSavingCustomInstructions || customInstructions.length > 4000}
              className="px-3 py-1.5 bg-[var(--bg-active)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-modal)] text-[var(--text-primary)] text-xs rounded-[6px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              {isSavingCustomInstructions ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Section Raccourcis clavier ── */}
      <div className="pt-2 border-t border-[var(--border-subtle)]">
        <h3 className="text-[14px] font-semibold text-[var(--text-primary)] mb-2">
          Raccourcis clavier
        </h3>
        <p className="text-[12px] text-[var(--text-secondary)] mb-3">
          Raccourcis utilisables dans toute l'application.
        </p>

        <div className="bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded-[6px] divide-y divide-[var(--border-subtle)] text-[12px]">
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-[var(--text-secondary)]">Afficher / masquer la barre latérale</span>
            <kbd className="font-mono bg-[var(--bg-surface)] border border-[var(--border-modal)] px-1.5 py-0.5 rounded text-[var(--text-primary)] text-[11px]">Ctrl+B</kbd>
          </div>
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-[var(--text-secondary)]">Rechercher dans les discussions</span>
            <kbd className="font-mono bg-[var(--bg-surface)] border border-[var(--border-modal)] px-1.5 py-0.5 rounded text-[var(--text-primary)] text-[11px]">Ctrl+K</kbd>
          </div>
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-[var(--text-secondary)]">Nouvelle discussion</span>
            <kbd className="font-mono bg-[var(--bg-surface)] border border-[var(--border-modal)] px-1.5 py-0.5 rounded text-[var(--text-primary)] text-[11px]">Ctrl+Maj+O</kbd>
          </div>
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-[var(--text-secondary)]">Ouvrir les paramètres</span>
            <kbd className="font-mono bg-[var(--bg-surface)] border border-[var(--border-modal)] px-1.5 py-0.5 rounded text-[var(--text-primary)] text-[11px]">Ctrl+,</kbd>
          </div>
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-[var(--text-secondary)]">Envoyer le message</span>
            <kbd className="font-mono bg-[var(--bg-surface)] border border-[var(--border-modal)] px-1.5 py-0.5 rounded text-[var(--text-primary)] text-[11px]">Entrée</kbd>
          </div>
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-[var(--text-secondary)]">Saut de ligne</span>
            <kbd className="font-mono bg-[var(--bg-surface)] border border-[var(--border-modal)] px-1.5 py-0.5 rounded text-[var(--text-primary)] text-[11px]">Maj+Entrée</kbd>
          </div>
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-[var(--text-secondary)]">Fermer menu / modale / arrêter tâche</span>
            <kbd className="font-mono bg-[var(--bg-surface)] border border-[var(--border-modal)] px-1.5 py-0.5 rounded text-[var(--text-primary)] text-[11px]">Échap</kbd>
          </div>
        </div>
      </div>
    </div>
  );
}
