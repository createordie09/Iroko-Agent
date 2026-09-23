import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  Plus, Code2, SlidersHorizontal, PanelLeft, Settings, ListFilter, Search, X
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { tokenService } from '../../services/security/TokenService';
import { agentClient } from '../../lib/agent-client';

const HISTORY_PAGE_SIZE = 10;

export interface ClaudeSidebarProps {
  onOpenPersonalize: () => void;
}

export function ClaudeSidebar({ onOpenPersonalize }: ClaudeSidebarProps) {
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
    history,
    setHistory
  } = useApp();

  const sidebarRef = useRef<HTMLElement>(null);
  const filterBtnRef = useRef<HTMLButtonElement>(null);
  const prevCollapsedRef = useRef(isSidebarCollapsed);

  // Focus transfer au bouton de repli lorsque la sidebar est repliée
  useEffect(() => {
    if (!prevCollapsedRef.current && isSidebarCollapsed) {
      if (sidebarRef.current && sidebarRef.current.contains(document.activeElement)) {
        setTimeout(() => {
          const toggleBtn = document.querySelector('button[title="Ouvrir la barre latérale"]') as HTMLButtonElement | null;
          toggleBtn?.focus();
        }, 0);
      }
    }
    prevCollapsedRef.current = isSidebarCollapsed;
  }, [isSidebarCollapsed]);

  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filterMode, setFilterMode] = useState<'all' | 'chat' | 'code' | 'pinned'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  /** Afficher toute la liste (true) ou seulement les 10 premières (false) */
  const [showAll, setShowAll] = useState(false);

  // Recherche plein texte FTS5 (Mission M8.3 P2)
  const [ftsMatchedConvIds, setFtsMatchedConvIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!searchQuery.trim()) {
      setFtsMatchedConvIds(new Set());
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await tokenService.fetch(`/api/search?q=${encodeURIComponent(searchQuery.trim())}`);
        if (res.ok) {
          const data = await res.json();
          const ids = new Set<string>((data.results || []).map((r: any) => r.conversationId));
          setFtsMatchedConvIds(ids);
        }
      } catch {}
    }, 150);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Tâches actives en arrière-plan (Mission M8.3 P6, Optimisation Réseau Lot 6 Fiche 22) [À VALIDER]
  const [activeTaskConvIds, setActiveTaskConvIds] = useState<string[]>([]);

  useEffect(() => {
    let isMounted = true;

    // 1. Récupération sobre initiale (un seul appel HTTP au montage)
    const fetchActive = async () => {
      try {
        const res = await tokenService.fetch('/api/agent/active-tasks');
        if (res.ok && isMounted) {
          const data = await res.json();
          setActiveTaskConvIds(data.activeConversationIds || []);
        }
      } catch {}
    };

    fetchActive();

    // 2. Écoute réactive des événements WebSocket en direct (zéro polling tant que le WS est actif)
    const unsubscribeWs = agentClient.onEvent((event: any) => {
      if (event.type === 'agent_status_changed' && Array.isArray(event.activeConversationIds)) {
        if (isMounted) {
          setActiveTaskConvIds(event.activeConversationIds);
        }
      } else if (event.type === 'video_job_updated') {
        fetchActive();
      }
    });

    // 3. Sondage de repli : activé uniquement si le WebSocket est déconnecté (cadence lente 30s)
    let fallbackInterval: NodeJS.Timeout | null = null;
    const unsubscribeConn = agentClient.onConnectionChange((connected) => {
      if (connected) {
        if (fallbackInterval) {
          clearInterval(fallbackInterval);
          fallbackInterval = null;
        }
      } else {
        if (!fallbackInterval && isMounted) {
          fallbackInterval = setInterval(fetchActive, 30000);
        }
      }
    });

    return () => {
      isMounted = false;
      unsubscribeWs();
      unsubscribeConn();
      if (fallbackInterval) {
        clearInterval(fallbackInterval);
      }
    };
  }, []);

  const filteredHistory = useMemo(() => {
    return history.filter(item => {
      if (searchQuery.trim()) {
        const matchesFts = ftsMatchedConvIds.has(item.id);
        const matchesTopic = item.topic.toLowerCase().includes(searchQuery.trim().toLowerCase());
        if (!matchesFts && !matchesTopic) return false;
      }
      if (filterMode === 'chat') return !item.mode || item.mode === 'chat';
      if (filterMode === 'code') return item.mode === 'code';
      if (filterMode === 'pinned') return !!item.pinned;
      return true;
    });
  }, [history, filterMode, searchQuery, ftsMatchedConvIds]);

  /** Slice affiché selon l'état dépliage */
  const visibleHistory = showAll
    ? filteredHistory
    : filteredHistory.slice(0, HISTORY_PAGE_SIZE);

  const hasMore = filteredHistory.length > HISTORY_PAGE_SIZE;

  const handleNewChat = () => {
    resetChat();
    setActiveView('chat');
    setIsMobileSidebarOpen(false);
  };

  const hasPinnedItems = projects.length > 0;

  return (
    <aside
      ref={sidebarRef}
      inert={isSidebarCollapsed ? true : undefined}
      className={`h-full flex flex-col bg-[var(--bg-sidebar)] border-r border-[var(--border-subtle)] select-none shrink-0 transition-all duration-200 ${
        isSidebarCollapsed ? 'w-0 -translate-x-full overflow-hidden opacity-0' : 'w-[222px] translate-x-0 opacity-100'
      }`}
      style={{
        width: isSidebarCollapsed ? 0 : 222
      }}
    >
      {/* ── En-tête ── */}
      <div className="h-12 flex items-center justify-between px-3 shrink-0">
        <div className="flex items-center gap-2 overflow-hidden">
          <button
            type="button"
            onClick={() => setIsSidebarCollapsed(true)}
            className="p-1 rounded-[6px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors tap-target-24"
            title="Réduire la barre latérale"
            aria-label="Réduire la barre latérale"
          >
            <PanelLeft className="w-4 h-4" />
          </button>
          <span className="font-serif text-[17px] text-[var(--text-primary)] font-medium tracking-tight select-none">
            Iroko
          </span>
        </div>
      </div>

      {/* ── Action principale : + Nouveau ── */}
      <div className="px-2 pt-1 pb-1 shrink-0">
        <button
          type="button"
          onClick={handleNewChat}
          className={`w-full flex items-center gap-2 px-2.5 h-[32px] rounded-[var(--radius-button)] text-[14px] font-normal transition-colors ${
            activeView === 'chat' && history.length === 0
              ? 'bg-[var(--bg-surface-hover)] text-[var(--text-primary)]'
              : 'text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'
          }`}
          title="Nouvelle discussion"
        >
          <Plus className="w-4 h-4 text-[var(--text-secondary)] shrink-0" />
          <span>Nouveau</span>
        </button>
      </div>

      {/* ── Navigation : Personnaliser → ouvre Paramètres onglet Compétences ── */}
      <div className="px-2 py-0.5 space-y-0.5 shrink-0">
        <button
          type="button"
          onClick={onOpenPersonalize}
          className="w-full flex items-center gap-2 px-2.5 h-[32px] rounded-[var(--radius-button)] text-[14px] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors"
          title="Personnaliser — ouvre Paramètres › Compétences"
        >
          <SlidersHorizontal className="w-4 h-4 text-[var(--text-secondary)] shrink-0" />
          <span className="font-normal">Personnaliser</span>
        </button>
      </div>

      {/* ── Liste avec scroll ── */}
      <nav aria-label="Navigation" className="flex-1 overflow-y-auto claude-scrollbar px-2 pt-2 space-y-3 scrollbar-hide hover:scrollbar-default">

        {/* ── Section Épinglés : masquée si vide ── */}
        {hasPinnedItems && (
          <div>
            <div className="text-[12px] text-[var(--text-secondary)] px-2.5 pb-1 font-normal">
              Épinglés
            </div>
            <div className="space-y-0.5">
              {projects.map(p => {
                const isSelected = p.id === activeProjectId && activeView === 'chat';
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setActiveProjectId(p.id);
                      setActiveView('chat');
                      setIsMobileSidebarOpen(false);
                    }}
                    className={`w-full flex items-center gap-2 px-2.5 h-[28px] rounded-[var(--radius-item)] text-[13px] text-left transition-colors group ${
                      isSelected ? 'bg-[var(--bg-active)] text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)]'
                    }`}
                    title={p.name}
                    aria-label={p.name}
                  >
                    <span className="w-1 h-1 rounded-full bg-[var(--text-tertiary)] shrink-0 group-hover:bg-[var(--text-secondary)]" />
                    <span className="truncate mask-fade-right">{p.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Section Discussions : masquée à l'état neuf ── */}
        {history.length > 0 && (
          <div>
            <div className="flex items-center justify-between px-2.5 pb-1">
              <span className="text-[12px] text-[var(--text-secondary)] font-normal">Discussions</span>
              <button
                ref={filterBtnRef}
                type="button"
                onClick={() => setIsFilterOpen(prev => !prev)}
                className={`p-0.5 rounded transition-colors tap-target-24 ${
                  isFilterOpen || filterMode !== 'all' ? 'text-[var(--text-primary)] bg-[var(--bg-surface-hover)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
                title="Filtrer les discussions"
                aria-label="Filtrer les discussions"
              >
                <ListFilter className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* ── Filtre Tout / Chat / Code / Épinglées & Recherche (Ctrl+K) ── */}
            {isFilterOpen && (
              <div className="space-y-1.5 px-2.5 pb-1.5 pt-0.5">
                <div data-field-container="true" className="flex items-center gap-1.5 bg-[var(--bg-surface)] border border-[var(--border-modal)] rounded-[6px] px-2 py-1">
                  <Search className="w-3 h-3 text-[var(--text-secondary)] shrink-0" />
                  <input
                    data-search="true"
                    type="text"
                    value={searchQuery}
                    onChange={e => { setSearchQuery(e.target.value); setShowAll(true); }}
                    onKeyDown={e => {
                      if (e.key === 'Escape') {
                        e.stopPropagation();
                        setIsFilterOpen(false);
                        filterBtnRef.current?.focus();
                      }
                    }}
                    placeholder="Rechercher..."
                    className="w-full bg-transparent text-[var(--font-size-search,12px)] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] outline-none sidebar-search-input"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] tap-target-24"
                      title="Effacer la recherche"
                      aria-label="Effacer la recherche"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-1">
                {(['all', 'chat', 'code', 'pinned'] as const).map((mode) => {
                  const labels: Record<string, string> = {
                    all: 'Tout',
                    chat: 'Chat',
                    code: 'Code',
                    pinned: 'Épinglées'
                  };
                  const active = filterMode === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => { setFilterMode(mode); setShowAll(false); }}
                      aria-pressed={active}
                      className={`text-[11px] px-1.5 py-0.5 rounded transition-colors tap-target-24 ${
                        active ? 'bg-[var(--bg-active)] text-[var(--text-primary)] font-medium' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'
                      }`}
                    >
                      {labels[mode]}
                    </button>
                  );
                })}
                </div>
              </div>
            )}

            <div className="space-y-0.5">
              {visibleHistory.map(item => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setHistory(prev => [item, ...prev.filter(h => h.id !== item.id)]);
                    setActiveView('chat');
                    setIsMobileSidebarOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-2.5 h-[28px] rounded-[var(--radius-item)] text-[13px] text-left text-[var(--text-muted)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)] transition-colors group"
                  title={item.topic}
                  aria-label={item.topic || 'Discussion'}
                >
                  {activeTaskConvIds.includes(item.id) ? (
                    <span
                      className="w-2 h-2 rounded-full bg-[var(--text-secondary)] shrink-0"
                      aria-label="Tâche en cours d'exécution"
                      title="Tâche en cours d'exécution"
                    />
                  ) : item.mode === 'code' ? (
                    <Code2 className="w-3 h-3 text-[var(--text-secondary)] shrink-0" aria-label="Mode Code" />
                  ) : (
                    <span className="w-1 h-1 rounded-full bg-[var(--text-tertiary)] shrink-0 group-hover:bg-[var(--text-secondary)]" />
                  )}
                  <span className="truncate mask-fade-right leading-none">{item.topic}</span>
                </button>
              ))}

              {filteredHistory.length === 0 && (
                <div className="px-2.5 py-2 text-[12px] text-[var(--text-secondary)]">
                  Aucune discussion
                </div>
              )}

              {/* ── Tout afficher / Afficher moins ── */}
              {hasMore && (
                <button
                  type="button"
                  onClick={() => setShowAll(prev => !prev)}
                  className="w-full text-left text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-2.5 pt-1.5 pb-1 transition-colors"
                >
                  {showAll ? 'Afficher moins' : 'Tout afficher'}
                </button>
              )}
            </div>
          </div>
        )}
      </nav>

      {/* ── Pied de sidebar : Paramètres (entrée principale) ── */}
      <div className="p-2 border-t border-[var(--border-subtle)] shrink-0 bg-[var(--bg-sidebar)]">
        <button
          type="button"
          onClick={() => setIsSettingsOpen(true)}
          className="w-full flex items-center gap-2 px-2.5 h-[36px] rounded-[var(--radius-button)] text-[14px] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer"
          title="Paramètres"
        >
          <Settings className="w-4 h-4 text-[var(--text-secondary)] shrink-0" />
          <span className="font-normal">Paramètres</span>
        </button>
      </div>
    </aside>
  );
}
