import React, { useState, useRef, useEffect } from 'react';
import { PanelLeft, ChevronDown, Settings, MoreHorizontal, FileText, Download } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export function ClaudeTopbar() {
  const {
    activeView,
    isSidebarCollapsed,
    setIsSidebarCollapsed,
    setIsMobileSidebarOpen,
    setIsSettingsOpen,
    history,
    messages
  } = useApp();

  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const isConversation = activeView === 'chat';
  const currentTitle = history[0]?.topic || 'Nouvelle discussion';

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsExportMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isExportMenuOpen) {
        setIsExportMenuOpen(false);
      }
    };
    if (isExportMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isExportMenuOpen]);

  const handleExportMarkdown = () => {
    let md = `# ${currentTitle}\n\n`;
    messages.forEach((m) => {
      const roleLabel = m.role === 'user' ? 'Utilisateur' : 'Assistant';
      md += `### ${roleLabel}\n\n${m.content}\n\n---\n\n`;
    });
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeTitle = currentTitle.replace(/[^a-zA-Z0-9à-ÿÀ-Ÿ_-]/g, '_').slice(0, 40);
    a.download = `${safeTitle || 'discussion'}_${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setIsExportMenuOpen(false);
  };

  const handleExportJson = () => {
    const data = {
      title: currentTitle,
      exportedAt: new Date().toISOString(),
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content
      }))
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeTitle = currentTitle.replace(/[^a-zA-Z0-9à-ÿÀ-Ÿ_-]/g, '_').slice(0, 40);
    a.download = `${safeTitle || 'discussion'}_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setIsExportMenuOpen(false);
  };

  return (
    <header
      className="h-12 w-full flex items-center justify-between px-4 select-none relative z-20 shrink-0 bg-transparent"
    >
      {/* ── Gauche : Déclencheur sidebar + Titre de conversation ── */}
      <div className="flex items-center gap-2 min-w-0">
        {/* Déclencheur Desktop quand repliée */}
        {isSidebarCollapsed && (
          <button
            type="button"
            onClick={() => setIsSidebarCollapsed(false)}
            className="hidden md:flex p-1.5 rounded-[6px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors"
            title="Ouvrir la barre latérale"
            aria-label="Ouvrir la barre latérale"
          >
            <PanelLeft className="w-4 h-4" />
          </button>
        )}

        {/* Déclencheur Mobile tiroir */}
        <button
          type="button"
          onClick={() => setIsMobileSidebarOpen(true)}
          className="md:hidden p-1.5 rounded-[6px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors"
          title="Ouvrir le menu"
          aria-label="Ouvrir le menu"
        >
          <PanelLeft className="w-4 h-4" />
        </button>

        {isConversation && (
          <div className="flex items-center gap-1.5 min-w-0">
            <div className="flex items-center gap-1.5 text-[14px] font-normal text-[var(--text-primary)] hover:text-white transition-colors max-w-sm truncate select-none">
              <span className="truncate">{currentTitle}</span>
            </div>

            {/* Menu d'export "…" (§ Mission M8.2) [À VALIDER] */}
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setIsExportMenuOpen(prev => !prev)}
                className="p-1 rounded-[6px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors"
                title="Options d'export"
                aria-label="Options d'export"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>

              {isExportMenuOpen && (
                <div className="absolute left-0 top-[calc(100%+4px)] w-56 bg-[var(--bg-surface)] border border-[var(--border-modal)] rounded-[8px] py-1 z-50">
                  <button
                    type="button"
                    onClick={handleExportMarkdown}
                    disabled={messages.length === 0}
                    className={`w-full px-3 py-1.5 text-left text-[13px] flex items-center gap-2 hover:bg-[var(--bg-surface-hover)] transition-colors ${
                      messages.length === 0 ? 'text-[var(--text-tertiary)] cursor-not-allowed' : 'text-[var(--text-primary)]'
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                    <span>Exporter en Markdown (.md)</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleExportJson}
                    disabled={messages.length === 0}
                    className={`w-full px-3 py-1.5 text-left text-[13px] flex items-center gap-2 hover:bg-[var(--bg-surface-hover)] transition-colors ${
                      messages.length === 0 ? 'text-[var(--text-tertiary)] cursor-not-allowed' : 'text-[var(--text-primary)]'
                    }`}
                  >
                    <Download className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                    <span>Exporter en JSON (.json)</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Droite : Engrenage Paramètres uniquement quand sidebar non accessible ──
          • Desktop : sidebar repliée (isSidebarCollapsed) → pas d'entrée Paramètres dans le pied de sidebar
          • Mobile : tiroir fermé (md:hidden) → pas d'entrée Paramètres dans le pied de sidebar
          Dans les deux cas l'engrenage est le seul point d'accès visible.
      ── */}
      <div className="flex items-center gap-2 ml-auto">
        {/* Engrenage desktop : visible uniquement si sidebar repliée */}
        {isSidebarCollapsed && (
          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            className="hidden md:flex p-1.5 rounded-[6px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors"
            title="Paramètres"
            aria-label="Ouvrir les paramètres"
          >
            <Settings className="w-4 h-4" />
          </button>
        )}

        {/* Engrenage mobile : visible uniquement sur petit écran (tiroir fermé par défaut) */}
        <button
          type="button"
          onClick={() => setIsSettingsOpen(true)}
          className="md:hidden p-1.5 rounded-[6px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors"
          title="Paramètres"
          aria-label="Ouvrir les paramètres"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}
