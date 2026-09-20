import React from 'react';
import { 
  Plus, Code2, SlidersHorizontal, PanelLeft, Download, Settings, ChevronDown, ListFilter
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

export interface ClaudeSidebarProps {
  onOpenNewProject: () => void;
  onOpenLibrary: () => void;
}

export function ClaudeSidebar({ onOpenNewProject, onOpenLibrary }: ClaudeSidebarProps) {
  const {
    activeView,
    setActiveView,
    projects,
    activeProjectId,
    setActiveProjectId,
    resetChat,
    isSidebarCollapsed,
    setIsSidebarCollapsed,
    setIsMobileSidebarOpen,
    setIsSettingsOpen,
    history
  } = useApp();

  const handleNewChat = () => {
    resetChat();
    setActiveView('chat');
    setIsMobileSidebarOpen(false);
  };

  const handleOpenWorkspace = () => {
    setActiveView('workspace');
    setIsMobileSidebarOpen(false);
  };

  const handleOpenPersonalize = () => {
    onOpenLibrary();
    setIsMobileSidebarOpen(false);
  };

  return (
    <aside
      className={`h-full flex flex-col bg-[var(--bg-sidebar)] border-r border-[var(--border-subtle)] select-none shrink-0 transition-all duration-200 ${
        isSidebarCollapsed ? 'w-0 -translate-x-full overflow-hidden opacity-0' : 'w-[222px] translate-x-0 opacity-100'
      }`}
      style={{
        width: isSidebarCollapsed ? 0 : 222,
        backgroundColor: '#181817',
        borderColor: '#242423'
      }}
    >
      {/* ── En-tête : Icône de repli + nom "Iroko" en serif (Capture 3) ── */}
      <div className="h-12 flex items-center justify-between px-3 shrink-0">
        <div className="flex items-center gap-2 overflow-hidden">
          <button
            type="button"
            onClick={() => setIsSidebarCollapsed(true)}
            className="p-1 rounded-[6px] text-[#878684] hover:text-[#ededeb] hover:bg-[#242423] transition-colors"
            title="Réduire la barre latérale"
          >
            <PanelLeft className="w-4 h-4" />
          </button>
          <span className="font-serif text-[17px] text-[#ededeb] font-medium tracking-tight select-none">
            Iroko
          </span>
        </div>
      </div>

      {/* ── Action principale : + Nouveau (Ligne de ~30-34px) ── */}
      <div className="px-2 pt-1 pb-1 shrink-0">
        <button
          type="button"
          onClick={handleNewChat}
          className={`w-full flex items-center gap-2 px-2.5 h-[32px] rounded-[var(--radius-button)] text-[14px] font-normal transition-colors ${
            activeView === 'chat' && history.length === 0
              ? 'bg-[#242423] text-[#ededeb]'
              : 'text-[#ededeb] hover:bg-[#242423]'
          }`}
          title="Nouvelle discussion"
        >
          <Plus className="w-4 h-4 text-[#878684] shrink-0" />
          <span>Nouveau</span>
        </button>
      </div>

      {/* ── Navigation : Code & Personnaliser ── */}
      <div className="px-2 py-0.5 space-y-0.5 shrink-0">
        <button
          type="button"
          onClick={handleOpenWorkspace}
          className={`w-full flex items-center justify-between px-2.5 h-[32px] rounded-[var(--radius-button)] text-[14px] transition-colors ${
            activeView === 'workspace'
              ? 'bg-[#242423] text-[#ededeb]'
              : 'text-[#ededeb] hover:bg-[#242423]'
          }`}
        >
          <div className="flex items-center gap-2 truncate">
            <Code2 className="w-4 h-4 text-[#878684] shrink-0" />
            <span className="truncate font-normal">Code</span>
          </div>
          <span className="text-[11px] text-[#878684] hover:text-[#ededeb] underline underline-offset-2 shrink-0">
            Mettre à niveau
          </span>
        </button>

        <button
          type="button"
          onClick={handleOpenPersonalize}
          className="w-full flex items-center gap-2 px-2.5 h-[32px] rounded-[var(--radius-button)] text-[14px] text-[#ededeb] hover:bg-[#242423] transition-colors"
        >
          <SlidersHorizontal className="w-4 h-4 text-[#878684] shrink-0" />
          <span className="font-normal">Personnaliser</span>
        </button>
      </div>

      {/* ── Liste avec scroll fin visible au survol ── */}
      <div className="flex-1 overflow-y-auto claude-scrollbar px-2 pt-2 space-y-3 scrollbar-hide hover:scrollbar-default">
        {/* ── Section Épinglés ── */}
        <div>
          <div className="text-[12px] text-[#878684] px-2.5 pb-1 font-normal">
            Épinglés
          </div>
          <div className="space-y-0.5">
            {projects.slice(0, 4).map(p => {
              const isSelected = p.id === activeProjectId && activeView === 'workspace';
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setActiveProjectId(p.id);
                    setActiveView('workspace');
                    setIsMobileSidebarOpen(false);
                  }}
                  className={`w-full flex items-center gap-2 px-2.5 h-[28px] rounded-[var(--radius-item)] text-[13px] text-left transition-colors group ${
                    isSelected ? 'bg-[#2b2a29] text-[#ededeb]' : 'text-[#c4c3be] hover:bg-[#242423] hover:text-[#ededeb]'
                  }`}
                  title={p.name}
                >
                  <span className="w-1 h-1 rounded-full bg-[#585755] shrink-0 group-hover:bg-[#878684]" />
                  <span className="truncate mask-fade-right">{p.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Section Discussions et tâches ── */}
        <div>
          <div className="flex items-center justify-between px-2.5 pb-1">
            <span className="text-[12px] text-[#878684] font-normal">Discussions et tâches</span>
            <button
              type="button"
              className="text-[#878684] hover:text-[#ededeb] p-0.5 rounded transition-colors"
              title="Filtrer les discussions"
            >
              <ListFilter className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-0.5">
            {history.map(item => {
              const isActive = activeView === 'chat';
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveView('chat');
                    setIsMobileSidebarOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-2.5 h-[28px] rounded-[var(--radius-item)] text-[13px] text-left text-[#c4c3be] hover:bg-[#242423] hover:text-[#ededeb] transition-colors group"
                  title={item.topic}
                >
                  <span className="w-1 h-1 rounded-full bg-[#585755] shrink-0 group-hover:bg-[#878684]" />
                  <span className="truncate mask-fade-right leading-none">{item.topic}</span>
                </button>
              );
            })}

            <button
              type="button"
              onClick={handleNewChat}
              className="w-full text-left text-[12px] text-[#878684] hover:text-[#ededeb] px-2.5 pt-1.5 pb-1 transition-colors"
            >
              Tout afficher
            </button>
          </div>
        </div>
      </div>

      {/* ── Pied de sidebar fixé (Capture 3) ── */}
      <div className="h-12 border-t border-[var(--border-subtle)] px-3 flex items-center justify-between shrink-0 bg-[var(--bg-sidebar)]">
        {/* Avatar + Nom + Forfait Free */}
        <div className="flex items-center gap-2 min-w-0 cursor-pointer" onClick={() => setIsSettingsOpen(true)}>
          <div className="w-6 h-6 rounded-full bg-[#2c2b2a] text-[#ededeb] flex items-center justify-center text-[12px] font-medium shrink-0 border border-[#383837]">
            M
          </div>
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[13px] font-medium text-[#ededeb] truncate">Marion</span>
            <span className="text-[12px] text-[#878684] truncate">Free</span>
            <ChevronDown className="w-3 h-3 text-[#878684] shrink-0" />
          </div>
        </div>

        {/* Actions à droite : Export / Settings */}
        <div className="flex items-center gap-1 text-[#878684]">
          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            className="p-1 rounded hover:text-[#ededeb] hover:bg-[#242423] transition-colors"
            title="Paramètres"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
