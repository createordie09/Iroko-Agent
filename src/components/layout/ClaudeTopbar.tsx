import React from 'react';
import { PanelLeft, ChevronDown, Share, X, Settings } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export interface ClaudeTopbarProps {
  onOpenUpgrade?: () => void;
}

export function ClaudeTopbar({ onOpenUpgrade }: ClaudeTopbarProps) {
  const {
    activeView,
    isSidebarCollapsed,
    setIsSidebarCollapsed,
    setIsSettingsOpen,
    history
  } = useApp();

  const isConversation = activeView === 'chat';
  const currentTitle = history[2]?.topic || 'Nouvelle discussion';

  return (
    <div
      className="h-12 w-full flex items-center justify-between px-4 select-none relative z-20 shrink-0 bg-transparent"
    >
      {/* ── Gauche : Déclencheur sidebar + Titre de conversation (en chat) ── */}
      <div className="flex items-center gap-2 min-w-0">
        {isSidebarCollapsed && (
          <button
            type="button"
            onClick={() => setIsSidebarCollapsed(false)}
            className="p-1.5 rounded-[6px] text-[#878684] hover:text-[#ededeb] hover:bg-[#242423] transition-colors"
            title="Ouvrir la barre latérale"
          >
            <PanelLeft className="w-4 h-4" />
          </button>
        )}

        {isConversation && (
          <div className="flex items-center gap-1.5 text-[14px] font-normal text-[#ededeb] cursor-pointer hover:text-white transition-colors max-w-sm truncate">
            <span className="truncate">{currentTitle}</span>
            <ChevronDown className="w-3.5 h-3.5 text-[#878684] shrink-0" />
          </div>
        )}
      </div>

      {/* ── Centre : Forfait Free · Mettre à niveau (Captures 1, 3 et 4) ── */}
      <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1.5 text-[12px] text-[#878684] select-none">
        <span>Forfait Free</span>
        <span>·</span>
        <button
          type="button"
          onClick={() => setIsSettingsOpen(true)}
          className="text-[#ededeb] hover:text-white underline underline-offset-2 transition-colors cursor-pointer"
        >
          Mettre à niveau
        </button>
      </div>

      {/* ── Droite : Actions ghost (Partager ou Profil/Paramètres) ── */}
      <div className="flex items-center gap-2">
        {isConversation ? (
          <button
            type="button"
            className="btn-ghost px-2 py-1 text-[13px] gap-1.5 border border-[#2d2d2b] bg-[#1a1a19] hover:bg-[#242423] text-[#ededeb]"
            title="Partager"
          >
            <Share className="w-3.5 h-3.5" />
            <span>Partager</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            className="p-1.5 rounded-full text-[#878684] hover:text-[#ededeb] hover:bg-[#242423] transition-colors"
            title="Paramètres"
          >
            <Settings className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
