import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Plus, SlidersHorizontal, PanelLeft, Settings, ListFilter, CheckSquare, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useUndoDeletion } from '../../hooks/useUndoDeletion';
import { tokenService } from '../../services/security/TokenService';
import { agentClient } from '../../lib/agent-client';
import { SidebarDiscussionItem } from '../sidebar/SidebarDiscussionItem';
import { SidebarFilterBar } from '../sidebar/SidebarFilterBar';
import { useSidebarConversations } from '../../hooks/sidebar/useSidebarConversations';

const HISTORY_PAGE_SIZE = 10;

export interface ClaudeSidebarProps {
  onOpenPersonalize: () => void;
}

export function ClaudeSidebar({ onOpenPersonalize }: ClaudeSidebarProps) {
  const {
    activeView, setActiveView, projects, activeProjectId, setActiveProjectId,
    resetChat, isSidebarCollapsed, setIsSidebarCollapsed, setIsMobileSidebarOpen,
    setIsSettingsOpen, history, setHistory, loadConversation
  } = useApp();
  const { scheduleUndoableDeletion } = useUndoDeletion();

  const {
    editingConvId, editingTitle, setEditingTitle, isSelectionMode, selectedIds,
    handleStartRename, handleCancelRename, handleSaveRename, handleDuplicateConversation,
    handleDeleteConversation, handleToggleSelectionMode, handleToggleSelect,
    handleSelectAll, handleBatchDelete, handleTogglePin, handleMovePin
  } = useSidebarConversations({
    history, setHistory, activeView, loadConversation, resetChat, scheduleUndoableDeletion, setIsMobileSidebarOpen
  });

  const sidebarRef = useRef<HTMLElement>(null);
  const filterBtnRef = useRef<HTMLButtonElement>(null);
  const prevCollapsedRef = useRef(isSidebarCollapsed);

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
  const [showAll, setShowAll] = useState(false);
  const [ftsMatchedConvIds, setFtsMatchedConvIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!searchQuery.trim()) { setFtsMatchedConvIds(new Set()); return; }
    const timer = setTimeout(async () => {
      try {
        const res = await tokenService.fetch(`/api/search?q=${encodeURIComponent(searchQuery.trim())}`);
        if (res.ok) {
          const data = await res.json();
          setFtsMatchedConvIds(new Set<string>((data.results || []).map((r: any) => r.conversationId)));
        }
      } catch {}
    }, 150);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Tâches actives en arrière-plan (Mission M8.3 P6, Optimisation Réseau Lot 6 Fiche 22) [À VALIDER]
  const [activeTaskConvIds, setActiveTaskConvIds] = useState<string[]>([]);
  useEffect(() => {
    let isMounted = true;
    const fetchActive = async () => {
      try {
        const res = await tokenService.fetch('/api/agent/active-tasks');
        if (res.ok && isMounted) setActiveTaskConvIds((await res.json()).activeConversationIds || []);
      } catch {}
    };
    fetchActive();
    const unsubscribeWs = agentClient.onEvent((event: any) => {
      if (event.type === 'agent_status_changed' && Array.isArray(event.activeConversationIds) && isMounted) {
        setActiveTaskConvIds(event.activeConversationIds);
      } else if (event.type === 'video_job_updated') fetchActive();
    });
    let fallbackInterval: NodeJS.Timeout | null = null;
    const unsubscribeConn = agentClient.onConnectionChange(connected => {
      if (connected && fallbackInterval) { clearInterval(fallbackInterval); fallbackInterval = null; }
      else if (!connected && !fallbackInterval && isMounted) fallbackInterval = setInterval(fetchActive, 30000);
    });
    return () => { isMounted = false; unsubscribeWs(); unsubscribeConn(); if (fallbackInterval) clearInterval(fallbackInterval); };
  }, []);

  const pinnedHistory = useMemo(() => {
    return history
      .filter(item => Boolean(item.pinned))
      .sort((a, b) => (a.pinned_order ?? 0) - (b.pinned_order ?? 0) || (b.pinned_at ?? 0) - (a.pinned_at ?? 0));
  }, [history]);

  const visiblePinnedHistory = useMemo(() => {
    if (!searchQuery.trim()) return pinnedHistory;
    return pinnedHistory.filter(item => {
      const matchesFts = ftsMatchedConvIds.has(item.id);
      const matchesTopic = item.topic.toLowerCase().includes(searchQuery.trim().toLowerCase());
      return matchesFts || matchesTopic;
    });
  }, [pinnedHistory, searchQuery, ftsMatchedConvIds]);

  const filteredHistory = useMemo(() => {
    return history.filter(item => {
      // Les discussions épinglées sont affichées dans la section Épinglés (sauf en filtre explicite "Épinglées")
      if (filterMode !== 'pinned' && item.pinned) return false;
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

  const visibleHistory = showAll ? filteredHistory : filteredHistory.slice(0, HISTORY_PAGE_SIZE);
  const hasMore = filteredHistory.length > HISTORY_PAGE_SIZE;

  const handleNewChat = () => {
    resetChat();
    setActiveView('home');
    setIsMobileSidebarOpen(false);
  };

  const hasPinnedDiscussions = visiblePinnedHistory.length > 0;
  const hasPinnedItems = hasPinnedDiscussions || projects.length > 0;

  return (
    <aside
      ref={sidebarRef}
      inert={isSidebarCollapsed ? true : undefined}
      className={`h-full flex flex-col bg-[var(--bg-sidebar)] border-r border-[var(--border-subtle)] select-none shrink-0 transition-all duration-200 ${
        isSidebarCollapsed ? 'w-0 -translate-x-full overflow-hidden opacity-0' : 'w-[222px] translate-x-0 opacity-100'
      }`}
      style={{ width: isSidebarCollapsed ? 0 : 222 }}
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

      {/* ── Navigation : Personnaliser → Paramètres Compétences ── */}
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
          <div data-section="pinned">
            <div className="text-[12px] text-[var(--text-secondary)] px-2.5 pb-1 font-normal">Épinglés</div>
            <div className="space-y-0.5">
              {projects.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => { setActiveProjectId(p.id); setActiveView('chat'); setIsMobileSidebarOpen(false); }}
                  className={`w-full flex items-center gap-2 px-2.5 h-[28px] rounded-[var(--radius-item)] text-[13px] text-left transition-colors group ${
                    p.id === activeProjectId && activeView === 'chat' ? 'bg-[var(--bg-active)] text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)]'
                  }`}
                  title={p.name}
                  aria-label={p.name}
                >
                  <span className="w-1 h-1 rounded-full bg-[var(--text-tertiary)] shrink-0 group-hover:bg-[var(--text-secondary)]" />
                  <span className="truncate mask-fade-right">{p.name}</span>
                </button>
              ))}
              {visiblePinnedHistory.map((item, index) => (
                <SidebarDiscussionItem
                  key={`pinned-${item.id}`}
                  item={item}
                  isActive={history[0]?.id === item.id && activeView === 'chat'}
                  isRunning={activeTaskConvIds.includes(item.id)}
                  isEditing={editingConvId === item.id}
                  editingTitle={editingTitle}
                  setEditingTitle={setEditingTitle}
                  onSaveRename={handleSaveRename}
                  onCancelRename={handleCancelRename}
                  onStartRename={handleStartRename}
                  onDuplicate={handleDuplicateConversation}
                  onDelete={handleDeleteConversation}
                  onSelect={() => { loadConversation(item.id); setIsMobileSidebarOpen(false); }}
                  isSelectionMode={isSelectionMode}
                  isSelected={selectedIds.has(item.id)}
                  onToggleSelect={handleToggleSelect}
                  onTogglePin={handleTogglePin}
                  onMovePin={handleMovePin}
                  canMoveUp={index > 0}
                  canMoveDown={index < visiblePinnedHistory.length - 1}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Section Discussions : masquée à l'état neuf ── */}
        {history.length > 0 && (
          <div>
            <div className="flex items-center justify-between px-2.5 pb-1">
              <span className="text-[12px] text-[var(--text-secondary)] font-normal">Discussions</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleToggleSelectionMode}
                  className={`p-0.5 rounded transition-colors tap-target-24 ${
                    isSelectionMode ? 'text-[var(--text-primary)] bg-[var(--bg-surface-hover)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                  title={isSelectionMode ? 'Quitter la sélection' : 'Sélectionner des discussions'}
                  aria-label={isSelectionMode ? 'Quitter la sélection' : 'Sélectionner des discussions'}
                >
                  <CheckSquare className="w-3.5 h-3.5" />
                </button>
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
            </div>

            {/* ── Barre d'actions de sélection multiple ── */}
            {isSelectionMode && (
              <div className="flex items-center justify-between px-2 py-1 mb-1 text-[11px] bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[var(--radius-item)]">
                <button
                  type="button"
                  onClick={() => handleSelectAll(visibleHistory.map(h => h.id))}
                  className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors tap-target-24"
                >
                  {selectedIds.size === visibleHistory.length && visibleHistory.length > 0 ? 'Désélectionner' : 'Tout sélectionner'}
                </button>
                <div className="flex items-center gap-2">
                  <span className="text-[var(--text-muted)] font-mono">{selectedIds.size}</span>
                  <button
                    type="button"
                    disabled={selectedIds.size === 0}
                    onClick={handleBatchDelete}
                    className={`flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded tap-target-24 transition-colors ${
                      selectedIds.size > 0 ? 'text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer' : 'text-[var(--text-tertiary)] cursor-not-allowed opacity-50'
                    }`}
                    title="Supprimer les discussions sélectionnées"
                    aria-label={`Supprimer ${selectedIds.size} discussion(s)`}
                  >
                    <Trash2 className="w-3 h-3 text-[var(--text-secondary)]" />
                    <span>Supprimer</span>
                  </button>
                </div>
              </div>
            )}

            {/* ── Filtre Tout / Chat / Code / Épinglées & Recherche (Ctrl+K) : sidebar-search-input, token --font-size-search ── */}
            {isFilterOpen && (
              <SidebarFilterBar
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                filterMode={filterMode}
                setFilterMode={setFilterMode}
                setShowAll={setShowAll}
                onClose={() => {
                  setIsFilterOpen(false);
                  filterBtnRef.current?.focus();
                }}
              />
            )}

            <div className="space-y-0.5">
              {visibleHistory.map(item => (
                <SidebarDiscussionItem
                  key={item.id}
                  item={item}
                  isActive={history[0]?.id === item.id && activeView === 'chat'}
                  isRunning={activeTaskConvIds.includes(item.id)}
                  isEditing={editingConvId === item.id}
                  editingTitle={editingTitle}
                  setEditingTitle={setEditingTitle}
                  onSaveRename={handleSaveRename}
                  onCancelRename={handleCancelRename}
                  onStartRename={handleStartRename}
                  onDuplicate={handleDuplicateConversation}
                  onDelete={handleDeleteConversation}
                  onSelect={() => { loadConversation(item.id); setIsMobileSidebarOpen(false); }}
                  isSelectionMode={isSelectionMode}
                  isSelected={selectedIds.has(item.id)}
                  onToggleSelect={handleToggleSelect}
                  onTogglePin={handleTogglePin}
                />
              ))}

              {filteredHistory.length === 0 && (
                <div className="px-2.5 py-2 text-[12px] text-[var(--text-secondary)]">Aucune discussion</div>
              )}

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

      {/* ── Pied de sidebar : Paramètres ── */}
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
