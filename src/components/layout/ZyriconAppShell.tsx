import React, { useRef, lazy, Suspense } from 'react';
import { ClaudeSidebar } from './ClaudeSidebar';
import { ClaudeTopbar } from './ClaudeTopbar';
import { ClaudeHero } from '../../features/home/ClaudeHero';
import { useApp } from '../../context/AppContext';
import { agentClient } from '../../lib/agent-client';
import { useOverlayFocus } from '../../hooks/useOverlayFocus';
import { useLiveAnnouncements } from '../../hooks/useLiveAnnouncements';
import { useVisualViewportHeight } from '../../hooks/useVisualViewportHeight';
import { OnboardingView } from '../../features/onboarding/OnboardingView';
import { useOnboarding } from '../../hooks/useOnboarding';
import { useProviders } from '../../hooks/models/useProviders';
import { ZoneErrorBoundary } from '../common/ZoneErrorBoundary';

// Chargement dynamique différé (Lot 6 Fiche 19) pour alléger le bundle initial
const ClaudeChat = lazy(() => import('../../features/chat/ClaudeChat').then(m => ({ default: m.ClaudeChat })));
const ClaudeSettingsModal = lazy(() => import('../../features/settings/ClaudeSettingsModal').then(m => ({ default: m.ClaudeSettingsModal })));

function BuggyFallback({ message }: { message: string }): never {
  throw new Error(message);
}

export function ZyriconAppShell() {
  useVisualViewportHeight();
  const simulatedErrorZone = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('simulate_error')
    : null;
  const {
    activeView,
    setActiveView,
    messages,
    setMessages,
    setChatStatus,
    history,
    setHistory,
    isMobileSidebarOpen,
    setIsMobileSidebarOpen,
    isSettingsOpen,
    setIsSettingsOpen,
    setActiveSettingsTab,
    composerMode,
    setComposerMode,
    activeModel
  } = useApp();

  const { providers } = useProviders();
  const hasConversations = (history && history.length > 0) || messages.length > 0;
  const hasConfiguredProviders = providers.some(p => p.keyCount > 0 || p.status === 'READY' || p.status === 'CONFIGURED');
  const { shouldShowOnboarding, completeOnboarding, skipOnboarding } = useOnboarding(hasConversations, hasConfiguredProviders);

  const mobileDrawerRef = useRef<HTMLDivElement>(null);

  // Primitive universelle de calque : confinement mobile, arrière-plan inerte, Échap et restitution focus
  useOverlayFocus({
    isOpen: isMobileSidebarOpen,
    onClose: () => setIsMobileSidebarOpen(false),
    containerRef: mobileDrawerRef
  });

  // Régions d'annonces en direct conformes WCAG 4.1.3 & Règle U6
  const { statusAnnouncement, alertAnnouncement } = useLiveAnnouncements();

  const handleHeroSendMessage = (text: string, options?: { mode: 'chat' | 'code'; tools?: string[]; attachmentIds?: string[] }) => {
    const newConvId = crypto.randomUUID();
    const targetMode = options?.mode || composerMode;
    if (options?.mode) {
      setComposerMode(options.mode);
    }
    const firstLine = text.split('\n')[0].replace(/^[#*\- ]+/, '').trim();
    const topic = firstLine.length > 45 ? firstLine.slice(0, 45) + '…' : (firstLine || 'Nouvelle discussion');
    const newConvItem = {
      id: newConvId,
      topic,
      result: '',
      timestamp: Date.now(),
      mode: targetMode,
      workspace_id: null
    };
    setHistory(prev => [newConvItem, ...prev.filter(h => h.id !== newConvId)]);
    setMessages([{ role: 'user', content: text, timestamp: Date.now() }]);
    setChatStatus('loading');
    let preferredProviderId: string | undefined = undefined;
    if (activeModel && activeModel.includes('/')) {
      preferredProviderId = activeModel.split('/')[0];
    }
    agentClient.sendPrompt(text, {
      conversationId: newConvId,
      mode: targetMode,
      modelId: activeModel,
      preferredProviderId,
      attachmentIds: options?.attachmentIds
    });
    setActiveView('chat');
  };

  /** Le bouton "Personnaliser" de la sidebar ouvre les Paramètres sur l'onglet Compétences */
  const handleOpenPersonalize = () => {
    setActiveSettingsTab('skills');
    setIsSettingsOpen(true);
    setIsMobileSidebarOpen(false);
  };

  return (
    <div
      style={{
        height: 'var(--app-height, 100dvh)',
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        paddingLeft: 'env(safe-area-inset-left, 0px)',
        paddingRight: 'env(safe-area-inset-right, 0px)'
      }}
      className="w-screen bg-[var(--bg-app)] flex overflow-hidden font-sans select-none text-[var(--text-primary)] m-0 p-0 relative"
    >

      {/* ── Lien d'évitement / Skip link (WCAG 2.4.1 — À VALIDER, invisible au repos) ── */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-3 focus:py-1.5 focus:bg-[var(--bg-surface)] focus:text-[var(--text-primary)] focus:border focus:border-[var(--border-focus)] focus:rounded-[var(--radius-button)] focus:text-[13px] outline-none select-none transition-none"
      >
        Aller au contenu
      </a>

      {/* ── Régions d'annonces d'état en direct (WCAG 4.1.3 & Règle U6) ── */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {statusAnnouncement}
      </div>
      <div
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
      >
        {alertAnnouncement}
      </div>

      {/* ── Overlay mobile pour la sidebar ── */}
      {isMobileSidebarOpen && (
        <div
          data-overlay-backdrop="true"
          className="fixed inset-0 bg-black/70 z-40 md:hidden animate-in fade-in duration-150"
          onClick={() => setIsMobileSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar (~222px, repliable) ── */}
      <div
        ref={mobileDrawerRef}
        role={isMobileSidebarOpen ? 'dialog' : undefined}
        aria-modal={isMobileSidebarOpen ? 'true' : undefined}
        aria-label={isMobileSidebarOpen ? 'Menu de navigation' : undefined}
        className={`fixed md:relative inset-y-0 left-0 z-50 transition-all duration-200 ${
          isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <ZoneErrorBoundary
          zoneName="barre latérale"
          fallbackClass="h-full w-[222px] flex flex-col items-center justify-center p-4 bg-[var(--bg-sidebar)] border-r border-[var(--border-subtle)] select-none"
        >
          {simulatedErrorZone === 'sidebar' ? (
            <BuggyFallback message="Défaillance simulée de la barre latérale" />
          ) : (
            <ClaudeSidebar
              onOpenPersonalize={handleOpenPersonalize}
            />
          )}
        </ZoneErrorBoundary>
      </div>

      {/* ── Zone principale avec repère sémantique main (WCAG 1.3.1) ── */}
      <div className="flex-1 h-full flex flex-col min-w-0 overflow-hidden bg-[var(--bg-app)] relative">

        <ClaudeTopbar />

        <main id="main-content" tabIndex={-1} className="flex-1 min-h-0 flex flex-col overflow-hidden relative outline-none">
          <ZoneErrorBoundary zoneName="zone de conversation">
            {simulatedErrorZone === 'chat' ? (
              <BuggyFallback message="Défaillance simulée de la zone de discussion" />
            ) : shouldShowOnboarding ? (
              <OnboardingView onComplete={completeOnboarding} onSkip={skipOnboarding} />
            ) : activeView === 'home' ? (
              <ClaudeHero onSendMessage={handleHeroSendMessage} />
            ) : (
              <Suspense fallback={<div className="flex-1 bg-[var(--bg-app)]" />}>
                <ClaudeChat />
              </Suspense>
            )}
          </ZoneErrorBoundary>
        </main>

      </div>

      {/* ── Modale de Paramètres (Chargement différé à l'ouverture) ── */}
      {isSettingsOpen && (
        <Suspense fallback={null}>
          <ZoneErrorBoundary
            zoneName="modale des paramètres"
            fallbackClass="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
            onReset={() => setIsSettingsOpen(false)}
          >
            {simulatedErrorZone === 'settings' ? (
              <BuggyFallback message="Défaillance simulée de la modale des paramètres" />
            ) : (
              <ClaudeSettingsModal />
            )}
          </ZoneErrorBoundary>
        </Suspense>
      )}

    </div>
  );
}

