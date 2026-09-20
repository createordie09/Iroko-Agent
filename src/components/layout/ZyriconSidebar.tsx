import React from 'react';
import { 
  MessageSquare, Archive, Library, FolderPlus, Folder, 
  Plus, PanelLeft, Sparkles, Settings, X
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

export interface ZyriconSidebarProps {
  onOpenConfiguration: () => void;
  onOpenArchived: () => void;
  onOpenLibrary: () => void;
  onOpenNewProject: () => void;
}

export function ZyriconSidebar({
  onOpenConfiguration,
  onOpenArchived,
  onOpenLibrary,
  onOpenNewProject
}: ZyriconSidebarProps) {
  const {
    activeView,
    setActiveView,
    projects,
    activeProjectId,
    setActiveProjectId,
    resetChat,
    isSidebarCollapsed,
    setIsSidebarCollapsed,
    isMobileSidebarOpen,
    setIsMobileSidebarOpen
  } = useApp();

  const handleNewChat = () => {
    resetChat();
    setActiveView('chat');
    setIsMobileSidebarOpen(false);
  };

  const handleSelectView = (view: 'chat' | 'workspace') => {
    setActiveView(view);
    setIsMobileSidebarOpen(false);
  };

  /* ── Nav row : hauteur 36px, padding 16px, gap icône 8px, 0px radius ── */
  const navRow = (isActive: boolean, collapsed: boolean) =>
    `w-full flex items-center gap-2 px-4 text-[14px] transition-colors select-none cursor-pointer ${
      isActive
        ? 'nav-item-active'
        : 'text-[#8a8a8a] hover:text-white hover:bg-[#1a1a1a]'
    } ${collapsed ? 'justify-center px-0' : ''}`;

  return (
    <aside
      className={`h-full flex flex-col bg-[#0a0a0a] border-r border-[#1f1f1f] select-none shrink-0 transition-all duration-150 ${
        /* Sur desktop : respecte isSidebarCollapsed (w-14 ou w-60) */
        /* Sur mobile : affiché en tiroir plein écran ou masqué */
        isSidebarCollapsed ? 'w-14' : 'w-60'
      }`}
    >
      {/* ── Logo & réduction ── */}
      <div className="h-12 flex items-center justify-between px-4 border-b border-[#1f1f1f] shrink-0">
        <div className="flex items-center gap-2 overflow-hidden">
          <Sparkles className="w-4 h-4 text-white shrink-0" />
          {!isSidebarCollapsed && (
            <span className="text-[14px] font-semibold text-white">Iroko</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {/* Bouton fermeture mobile */}
          <button
            type="button"
            onClick={() => setIsMobileSidebarOpen(false)}
            className="btn-ghost p-1 md:hidden"
            title="Fermer le menu"
          >
            <X className="w-4 h-4" />
          </button>
          {/* Bouton replier desktop */}
          <button
            type="button"
            onClick={() => setIsSidebarCollapsed((prev: boolean) => !prev)}
            className="btn-ghost p-1 hidden md:inline-flex"
            title={isSidebarCollapsed ? 'Déplier' : 'Réduire'}
          >
            <PanelLeft className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Nouveau chat ── */}
      <div className="px-4 py-2 shrink-0">
        <button
          type="button"
          onClick={handleNewChat}
          style={{ height: 36 }}
          className={`w-full flex items-center gap-2 px-0 text-[13px] text-[#8a8a8a] hover:text-white hover:bg-[#1a1a1a] transition-colors ${
            isSidebarCollapsed ? 'justify-center' : ''
          }`}
          title="Nouveau chat"
        >
          <Plus className="w-4 h-4 shrink-0" />
          {!isSidebarCollapsed && <span>Nouveau chat</span>}
        </button>
      </div>

      {/* ── Navigation ── */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-2 space-y-0 scrollbar-hide">

        {/* Section Fonctionnalités */}
        {!isSidebarCollapsed && (
          <div className="text-[12px] text-[#555555] px-0 pt-2 pb-1">
            Fonctionnalités
          </div>
        )}

        {/* Chat */}
        <button
          type="button"
          onClick={() => handleSelectView('chat')}
          style={{ height: 36 }}
          className={navRow(activeView === 'chat', isSidebarCollapsed)}
          title="Chat"
        >
          <MessageSquare className="w-4 h-4 shrink-0" />
          {!isSidebarCollapsed && <span>Chat</span>}
        </button>

        {/* Historique */}
        <button
          type="button"
          onClick={() => {
            onOpenArchived();
            setIsMobileSidebarOpen(false);
          }}
          style={{ height: 36 }}
          className={navRow(false, isSidebarCollapsed)}
          title="Historique"
        >
          <Archive className="w-4 h-4 shrink-0" />
          {!isSidebarCollapsed && <span>Historique</span>}
        </button>

        {/* Ma voix & style (remplace Bibliothèque) */}
        <button
          type="button"
          onClick={() => {
            onOpenLibrary();
            setIsMobileSidebarOpen(false);
          }}
          style={{ height: 36 }}
          className={navRow(false, isSidebarCollapsed)}
          title="Ma voix"
        >
          <Library className="w-4 h-4 shrink-0" />
          {!isSidebarCollapsed && <span>Ma voix</span>}
        </button>

        {/* Section Espaces de travail */}
        {!isSidebarCollapsed && (
          <div className="text-[12px] text-[#555555] px-0 pt-4 pb-1">
            Espaces de travail
          </div>
        )}

        {/* Nouveau projet */}
        <button
          type="button"
          onClick={() => {
            onOpenNewProject();
            setIsMobileSidebarOpen(false);
          }}
          style={{ height: 36 }}
          className={navRow(false, isSidebarCollapsed)}
          title="Nouveau projet"
        >
          <FolderPlus className="w-4 h-4 shrink-0" />
          {!isSidebarCollapsed && <span>Nouveau projet</span>}
        </button>

        {/* Projets existants */}
        {projects.map(p => {
          const isSelected = p.id === activeProjectId && activeView === 'workspace';
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                setActiveProjectId(p.id);
                handleSelectView('workspace');
              }}
              style={{ height: 36 }}
              className={navRow(isSelected, isSidebarCollapsed)}
              title={p.name}
            >
              <Folder className="w-4 h-4 shrink-0" />
              {!isSidebarCollapsed && <span className="truncate">{p.name}</span>}
            </button>
          );
        })}
      </div>

      {/* ── Pied : lien "Passer à Iroko Pro" + Configuration ── */}
      {!isSidebarCollapsed && (
        <div className="px-4 py-4 border-t border-[#1f1f1f] space-y-0 shrink-0">
          <button
            type="button"
            className="w-full text-left text-[13px] text-[#8a8a8a] hover:text-white transition-colors py-1"
          >
            Passer à Iroko Pro
          </button>
          <button
            type="button"
            onClick={() => {
              onOpenConfiguration();
              setIsMobileSidebarOpen(false);
            }}
            style={{ height: 36 }}
            className={navRow(false, false)}
          >
            <Settings className="w-4 h-4 shrink-0" />
            <span>Configuration</span>
          </button>
        </div>
      )}

      {/* Collapsed pied */}
      {isSidebarCollapsed && (
        <div className="px-2 py-4 border-t border-[#1f1f1f] flex justify-center shrink-0">
          <button
            type="button"
            onClick={() => {
              onOpenConfiguration();
              setIsMobileSidebarOpen(false);
            }}
            className="btn-ghost p-2"
            title="Configuration"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      )}
    </aside>
  );
}
