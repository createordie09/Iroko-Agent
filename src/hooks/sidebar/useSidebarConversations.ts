/**
 * useSidebarConversations — Hook de gestion des discussions dans la sidebar (Mission R4c)
 *
 * Gère :
 * 1. Renommage inline avec validation par Entrée et annulation par Échap.
 * 2. Duplication d'une discussion avec nouveaux UUIDs étanches.
 * 3. Sélection multiple et suppression groupée avec rétractation collective de 5 secondes.
 */
import React, { useState, useCallback } from 'react';
import { tokenService } from '../../services/security/TokenService';
import { HistoryItem } from '../../types';

export interface UseSidebarConversationsOptions {
  history: HistoryItem[];
  setHistory: React.Dispatch<React.SetStateAction<HistoryItem[]>>;
  activeView: string;
  loadConversation: (id: string) => Promise<void>;
  resetChat: () => void;
  scheduleUndoableDeletion: (options: any) => Promise<void>;
  setIsMobileSidebarOpen: (v: boolean) => void;
}

export function useSidebarConversations({
  history,
  setHistory,
  activeView,
  loadConversation,
  resetChat,
  scheduleUndoableDeletion,
  setIsMobileSidebarOpen
}: UseSidebarConversationsOptions) {
  const [editingConvId, setEditingConvId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // ── Renommage Inline ──
  const handleStartRename = useCallback((id: string, currentTopic: string) => {
    setEditingConvId(id);
    setEditingTitle(currentTopic || '');
  }, []);

  const handleCancelRename = useCallback(() => {
    setEditingConvId(null);
    setEditingTitle('');
  }, []);

  const handleSaveRename = useCallback(async (id: string) => {
    const trimmed = editingTitle.trim();
    setEditingConvId(null);
    if (!trimmed) return;

    const item = history.find(h => h.id === id);
    if (item && item.topic === trimmed) return;

    // Mise à jour optimiste dans l'UI
    setHistory(prev => prev.map(h => (h.id === id ? { ...h, topic: trimmed } : h)));

    try {
      await tokenService.fetch(`/api/conversations/${encodeURIComponent(id)}/title`, {
        method: 'PUT',
        body: JSON.stringify({ title: trimmed })
      });
    } catch (err) {
      console.error('[Sidebar] Échec de la mise à jour du titre :', err);
    }
  }, [editingTitle, history, setHistory]);

  // ── Duplication ──
  const handleDuplicateConversation = useCallback(async (id: string) => {
    try {
      const res = await tokenService.fetch(`/api/conversations/${encodeURIComponent(id)}/duplicate`, {
        method: 'POST'
      });
      const data = await res.json();
      if (data.conversation) {
        const newItem: HistoryItem = {
          id: data.conversation.id,
          topic: data.conversation.title,
          result: '',
          timestamp: data.conversation.created_at ? new Date(data.conversation.created_at).getTime() : Date.now(),
          mode: data.conversation.mode,
          workspace_id: data.conversation.workspace_id || null
        };
        setHistory(prev => [newItem, ...prev]);
        await loadConversation(data.conversation.id);
        setIsMobileSidebarOpen(false);
      }
    } catch (err) {
      console.error('[Sidebar] Échec de la duplication de la discussion :', err);
    }
  }, [setHistory, loadConversation, setIsMobileSidebarOpen]);

  // ── Suppression Unitaire ──
  const handleDeleteConversation = useCallback((e: React.MouseEvent, item: HistoryItem) => {
    e.stopPropagation();
    const wasActive = history[0]?.id === item.id && activeView === 'chat';
    const oldHistory = [...history];
    setHistory(prev => prev.filter(h => h.id !== item.id));
    if (wasActive) resetChat();

    scheduleUndoableDeletion({
      itemType: 'conversation',
      id: item.id,
      label: 'Discussion supprimée.',
      onRestore: () => {
        setHistory(oldHistory);
        if (wasActive) loadConversation(item.id);
      }
    });
  }, [history, activeView, setHistory, resetChat, scheduleUndoableDeletion, loadConversation]);

  // ── Sélection Multiple ──
  const handleToggleSelectionMode = useCallback(() => {
    setIsSelectionMode(prev => {
      if (prev) {
        setSelectedIds(new Set());
      }
      return !prev;
    });
  }, []);

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback((visibleIds: string[]) => {
    setSelectedIds(prev => {
      if (prev.size === visibleIds.length) {
        return new Set();
      }
      return new Set(visibleIds);
    });
  }, []);

  const handleBatchDelete = useCallback(() => {
    const idsToDelete = Array.from(selectedIds);
    if (idsToDelete.length === 0) return;

    const count = idsToDelete.length;
    const oldHistory = [...history];
    const wasActive = history[0] && idsToDelete.includes(history[0].id) && activeView === 'chat';

    setHistory(prev => prev.filter(h => !idsToDelete.includes(h.id)));
    if (wasActive) resetChat();

    setSelectedIds(new Set());
    setIsSelectionMode(false);

    scheduleUndoableDeletion({
      itemType: 'conversation',
      ids: idsToDelete,
      label: `${count} discussion${count > 1 ? 's' : ''} supprimée${count > 1 ? 's' : ''}.`,
      onRestore: () => {
        setHistory(oldHistory);
        if (wasActive) {
          loadConversation(oldHistory[0].id);
        }
      }
    });
  }, [selectedIds, history, activeView, setHistory, resetChat, scheduleUndoableDeletion, loadConversation]);

  // ── Épinglage / Désépinglage (Mission R4e) ──
  const handleTogglePin = useCallback(async (id: string, currentPinned?: boolean) => {
    const nextPinned = !currentPinned;
    const now = Date.now();

    // Mise à jour optimiste
    setHistory(prev => {
      let maxOrder = 0;
      prev.forEach(h => {
        if (h.pinned && typeof h.pinned_order === 'number' && h.pinned_order > maxOrder) {
          maxOrder = h.pinned_order;
        }
      });
      return prev.map(h => {
        if (h.id === id) {
          return {
            ...h,
            pinned: nextPinned,
            pinned_at: nextPinned ? now : undefined,
            pinned_order: nextPinned ? maxOrder + 1 : undefined
          };
        }
        return h;
      });
    });

    try {
      await tokenService.fetch(`/api/conversations/${encodeURIComponent(id)}/pin`, {
        method: 'PUT',
        body: JSON.stringify({ isPinned: nextPinned })
      });
    } catch (err) {
      console.error('[Sidebar] Échec de la mise à jour de l\'épinglage :', err);
    }
  }, [setHistory]);

  // ── Réorganisation des discussions épinglées (Monter / Descendre) ──
  const handleMovePin = useCallback(async (id: string, direction: 'up' | 'down') => {
    const pinnedItems = history
      .filter(h => Boolean(h.pinned))
      .sort((a, b) => (a.pinned_order ?? 0) - (b.pinned_order ?? 0) || (b.pinned_at ?? 0) - (a.pinned_at ?? 0));

    const currentIndex = pinnedItems.findIndex(h => h.id === id);
    if (currentIndex === -1) return;
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= pinnedItems.length) return;

    const newPinned = [...pinnedItems];
    const [moved] = newPinned.splice(currentIndex, 1);
    newPinned.splice(targetIndex, 0, moved);

    const idToOrder = new Map<string, number>();
    newPinned.forEach((item, idx) => {
      idToOrder.set(item.id, idx + 1);
    });

    setHistory(prev =>
      prev.map(h => {
        if (idToOrder.has(h.id)) {
          return { ...h, pinned_order: idToOrder.get(h.id) };
        }
        return h;
      })
    );

    try {
      await tokenService.fetch('/api/conversations/reorder-pins', {
        method: 'PUT',
        body: JSON.stringify({ orderedIds: newPinned.map(h => h.id) })
      });
    } catch (err) {
      console.error('[Sidebar] Échec de la réorganisation des épinglés :', err);
    }
  }, [history, setHistory]);

  return {
    editingConvId,
    editingTitle,
    setEditingTitle,
    isSelectionMode,
    selectedIds,
    handleStartRename,
    handleCancelRename,
    handleSaveRename,
    handleDuplicateConversation,
    handleDeleteConversation,
    handleToggleSelectionMode,
    handleToggleSelect,
    handleSelectAll,
    handleBatchDelete,
    handleTogglePin,
    handleMovePin
  };
}
