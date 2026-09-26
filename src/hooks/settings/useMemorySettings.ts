import { useState, useEffect } from 'react';
import { tokenService } from '../../services/security/TokenService';
import { useUndoDeletion } from '../useUndoDeletion';

export function useMemorySettings() {
  const { scheduleUndoableDeletion } = useUndoDeletion();
  const [memoryEnabled, setMemoryEnabled] = useState(true);
  const [memories, setMemories] = useState<any[]>([]);
  const [, setLoadingMemories] = useState(false);
  const [memoryScopeFilter, setMemoryScopeFilter] = useState<'all' | 'global' | 'project'>('all');
  const [showAddMemoryModal, setShowAddMemoryModal] = useState(false);
  const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null);
  const [memoryFactInput, setMemoryFactInput] = useState('');
  const [memoryScopeInput, setMemoryScopeInput] = useState<'global' | 'project'>('project');
  const [memoryCategoryInput, setMemoryCategoryInput] = useState('general');
  const [memoryError, setMemoryError] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [deletingMemoryId, setDeletingMemoryId] = useState<string | null>(null);

  const fetchMemoryData = async () => {
    setLoadingMemories(true);
    try {
      const [toggleRes, listRes] = await Promise.all([
        tokenService.fetch('/api/memory/toggle').then(r => r.json()).catch(() => ({ enabled: true })),
        tokenService.fetch('/api/memory').then(r => r.json()).catch(() => ({ memories: [] }))
      ]);
      if (typeof toggleRes?.enabled === 'boolean') {
        setMemoryEnabled(toggleRes.enabled);
      }
      if (Array.isArray(listRes?.memories)) {
        setMemories(listRes.memories);
      }
    } catch {} finally {
      setLoadingMemories(false);
    }
  };

  const handleToggleMemory = async (enabled: boolean) => {
    setMemoryEnabled(enabled);
    try {
      await tokenService.fetch('/api/memory/toggle', {
        method: 'PUT',
        body: JSON.stringify({ enabled })
      });
    } catch {}
  };

  const handleSaveMemoryItem = async () => {
    setMemoryError(null);
    if (!memoryFactInput.trim()) {
      setMemoryError('Le contenu ne peut pas être vide.');
      return;
    }

    try {
      const url = editingMemoryId ? `/api/memory/${editingMemoryId}` : '/api/memory';
      const method = editingMemoryId ? 'PUT' : 'POST';
      const res = await tokenService.fetch(url, {
        method,
        body: JSON.stringify({
          fact: memoryFactInput.trim(),
          scope: memoryScopeInput,
          category: memoryCategoryInput
        })
      });

      const data = await res.json();
      if (!res.ok) {
        setMemoryError(data.error || 'Erreur lors de l\'enregistrement.');
        return;
      }

      setShowAddMemoryModal(false);
      setEditingMemoryId(null);
      setMemoryFactInput('');
      fetchMemoryData();
    } catch (err: any) {
      setMemoryError(err.message || 'Erreur réseau.');
    }
  };

  const handleDeleteMemoryItem = (id: string) => {
    const oldMemories = [...memories];
    setMemories(prev => prev.filter(m => m.id !== id));
    scheduleUndoableDeletion({
      itemType: 'memory',
      id,
      label: 'Élément de mémoire supprimé.',
      onRestore: () => {
        setMemories(oldMemories);
      }
    });
  };

  const handleClearAllMemories = async () => {
    try {
      await tokenService.fetch('/api/memory', { method: 'DELETE' });
      setMemories([]);
      setShowClearConfirm(false);
    } catch {}
  };

  const handleExportMemories = async () => {
    try {
      const res = await tokenService.fetch('/api/memory/export');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `iroko-memories-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {}
  };

  useEffect(() => {
    fetchMemoryData();
  }, []);

  return {
    memoryEnabled,
    memories,
    memoryScopeFilter,
    setMemoryScopeFilter,
    showAddMemoryModal,
    setShowAddMemoryModal,
    editingMemoryId,
    setEditingMemoryId,
    memoryFactInput,
    setMemoryFactInput,
    memoryScopeInput,
    setMemoryScopeInput,
    memoryCategoryInput,
    setMemoryCategoryInput,
    memoryError,
    setMemoryError,
    showClearConfirm,
    setShowClearConfirm,
    deletingMemoryId,
    handleToggleMemory,
    handleSaveMemoryItem,
    handleDeleteMemoryItem,
    handleClearAllMemories,
    handleExportMemories
  };
}
