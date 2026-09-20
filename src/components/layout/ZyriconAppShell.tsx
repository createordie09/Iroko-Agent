import React, { useState } from 'react';
import { ClaudeSidebar } from './ClaudeSidebar';
import { ClaudeTopbar } from './ClaudeTopbar';
import { ClaudeHero } from '../../features/home/ClaudeHero';
import { ClaudeChat } from '../../features/chat/ClaudeChat';
import { CodeWorkspace } from '../../features/workspace/CodeWorkspace';
import { TasksWorkspace } from '../../features/tasks/TasksWorkspace';
import { ClaudeSettingsModal } from '../../features/settings/ClaudeSettingsModal';
import { useApp } from '../../context/AppContext';
import { X } from 'lucide-react';
import { agentClient } from '../../lib/agent-client';

export function ZyriconAppShell() {
  const {
    activeView,
    setActiveView,
    messages,
    setMessages,
    setChatStatus,
    isMobileSidebarOpen,
    setIsMobileSidebarOpen,
    createProject,
    persona,
    setPersona
  } = useApp();

  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [showLibraryModal, setShowLibraryModal]       = useState(false);
  const [newProjectName, setNewProjectName]           = useState('');

  const handleHeroSendMessage = (text: string, options?: { mode: 'chat' | 'code'; tools?: string[] }) => {
    setMessages([{ role: 'user', content: text, timestamp: Date.now() }]);
    setChatStatus('loading');
    agentClient.sendPrompt(text);
    if (options?.mode === 'code') {
      setActiveView('workspace');
    } else {
      setActiveView('chat');
    }
  };

  return (
    <div className="w-screen h-[100dvh] bg-[var(--bg-app)] flex overflow-hidden font-sans select-none text-[var(--text-primary)] m-0 p-0 relative">
      
      {/* ── Overlay mobile pour la sidebar ── */}
      {isMobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/70 z-40 md:hidden animate-in fade-in duration-150"
          onClick={() => setIsMobileSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar Claude (~222px, repliable en douceur) ── */}
      <div
        className={`fixed md:relative inset-y-0 left-0 z-50 transition-all duration-200 ${
          isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <ClaudeSidebar
          onOpenNewProject={() => setShowNewProjectModal(true)}
          onOpenLibrary={() => setShowLibraryModal(true)}
        />
      </div>

      {/* ── Zone principale plein écran ── */}
      <div className="flex-1 h-full flex flex-col min-w-0 overflow-hidden bg-[var(--bg-app)] relative">
        
        {/* Header minimaliste et discret (Captures 1, 3 et 4) */}
        <ClaudeTopbar />

        {/* Espace de contenu dynamique */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden relative">
          {activeView === 'home' && messages.length === 0 ? (
            <ClaudeHero onSendMessage={handleHeroSendMessage} />
          ) : activeView === 'chat' ? (
            <ClaudeChat />
          ) : activeView === 'workspace' ? (
            <CodeWorkspace />
          ) : activeView === 'tasks' ? (
            <TasksWorkspace />
          ) : (
            <ClaudeHero onSendMessage={handleHeroSendMessage} />
          )}
        </div>

      </div>

      {/* ── Modale de Paramètres Claude (Capture 2) ── */}
      <ClaudeSettingsModal />

      {/* ── Modale : Nouveau projet ── */}
      {showNewProjectModal && (
        <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[#1a1a19] border border-[#2d2d2b] rounded-[var(--radius-modal)] p-5">
            <h3 className="text-[14px] font-semibold text-[#ededeb] mb-1">Nouveau projet</h3>
            <p className="text-[12px] text-[#878684] mb-4">Créez un espace de travail dans Iroko.</p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!newProjectName.trim()) return;
                await createProject(newProjectName.trim());
                setNewProjectName('');
                setShowNewProjectModal(false);
              }}
            >
              <input
                type="text"
                value={newProjectName}
                onChange={e => setNewProjectName(e.target.value)}
                placeholder="Ex : Oria Projet, SaaS App..."
                autoFocus
                className="w-full bg-[#151515] border border-[#2d2d2b] rounded-[6px] px-3 py-2 text-[13px] text-[#ededeb] placeholder:text-[#6a6967] focus:outline-none focus:border-[#444] mb-4"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewProjectModal(false)}
                  className="btn-ghost text-[12px]"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={!newProjectName.trim()}
                  className="px-3.5 py-1.5 bg-[#ededeb] text-[#151515] hover:bg-white text-[12px] font-medium rounded-[6px] transition-colors"
                >
                  Créer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modale : Personnaliser (Ma Voix & Style) ── */}
      {showLibraryModal && (
        <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#1a1a19] border border-[#2d2d2b] rounded-[var(--radius-modal)] p-5">
            <div className="flex items-center justify-between pb-3 border-b border-[#242423] mb-4">
              <h3 className="text-[14px] font-semibold text-[#ededeb]">Personnaliser : Ma Voix & Style</h3>
              <button
                type="button"
                onClick={() => setShowLibraryModal(false)}
                className="p-1 rounded text-[#878684] hover:text-[#ededeb]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-[12px] text-[#878684] block mb-1">Secteur / Domaine</label>
                <input
                  type="text"
                  value={persona.secteur}
                  onChange={e => setPersona({ ...persona, secteur: e.target.value })}
                  className="w-full bg-[#151515] border border-[#2d2d2b] rounded-[6px] px-3 py-1.5 text-[13px] text-[#ededeb] focus:outline-none focus:border-[#444]"
                />
              </div>
              <div>
                <label className="text-[12px] text-[#878684] block mb-1">Style de rédaction</label>
                <input
                  type="text"
                  value={persona.style}
                  onChange={e => setPersona({ ...persona, style: e.target.value })}
                  className="w-full bg-[#151515] border border-[#2d2d2b] rounded-[6px] px-3 py-1.5 text-[13px] text-[#ededeb] focus:outline-none focus:border-[#444]"
                />
              </div>
              <div>
                <label className="text-[12px] text-[#878684] block mb-1">Mots à bannir</label>
                <input
                  type="text"
                  value={persona.motsAEviter}
                  onChange={e => setPersona({ ...persona, motsAEviter: e.target.value })}
                  className="w-full bg-[#151515] border border-[#2d2d2b] rounded-[6px] px-3 py-1.5 text-[13px] text-[#ededeb] focus:outline-none focus:border-[#444]"
                />
              </div>
              <div className="flex justify-end pt-3">
                <button
                  type="button"
                  onClick={() => setShowLibraryModal(false)}
                  className="px-4 py-1.5 bg-[#ededeb] text-[#151515] hover:bg-white text-[12px] font-medium rounded-[6px] transition-colors"
                >
                  Enregistrer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
