/**
 * UndoDeletionContext — Contexte global de suppression différée avec annulation (Mission R4b)
 *
 * Gère l'état du bandeau discret "X supprimé. Annuler." pendant 5 secondes.
 * Permet d'annuler immédiatement ou de laisser la purge réelle s'exécuter.
 */
import React, { createContext, useContext, useState, useRef, useEffect, ReactNode, useCallback } from 'react';
import { deletionService, DeletableType } from '../services/deletion/DeletionService';

export interface ActiveDeletionState {
  itemType: DeletableType;
  id: string;
  label: string;
  onRestore?: () => void;
  onPurge?: () => void;
}

export interface ScheduleDeletionOptions {
  itemType: DeletableType;
  id: string;
  label?: string;
  onRestore?: () => void;
  onPurge?: () => void;
  durationMs?: number;
}

export interface UndoDeletionContextValue {
  activeDeletion: ActiveDeletionState | null;
  scheduleUndoableDeletion: (options: ScheduleDeletionOptions) => Promise<void>;
  cancelActiveDeletion: () => Promise<void>;
  isItemPending: (itemType: DeletableType, id: string) => boolean;
}

const defaultLabels: Record<DeletableType, string> = {
  conversation: 'Discussion supprimée.',
  message: 'Message supprimé.',
  memory: 'Élément de mémoire supprimé.',
  skill: 'Compétence supprimée.'
};

const UndoDeletionContext = createContext<UndoDeletionContextValue | null>(null);

export function UndoDeletionProvider({ children }: { children: ReactNode }) {
  const [activeDeletion, setActiveDeletion] = useState<ActiveDeletionState | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const pendingSetRef = useRef<Set<string>>(new Set());

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const scheduleUndoableDeletion = useCallback(async (options: ScheduleDeletionOptions) => {
    // Si une suppression était déjà en cours d'affichage, déclencher son onPurge
    if (activeDeletion && activeDeletion.onPurge) {
      activeDeletion.onPurge();
    }
    clearTimer();

    const durationMs = options.durationMs ?? 5000;
    const label = options.label || defaultLabels[options.itemType] || 'Élément supprimé.';
    const itemKey = `${options.itemType}:${options.id}`;

    pendingSetRef.current.add(itemKey);

    const newState: ActiveDeletionState = {
      itemType: options.itemType,
      id: options.id,
      label,
      onRestore: options.onRestore,
      onPurge: options.onPurge
    };
    setActiveDeletion(newState);

    try {
      await deletionService.schedulePendingDeletion(options.itemType, options.id, durationMs);
    } catch (err) {
      console.error('[UndoDeletion] Erreur lors de la planification serveur :', err);
    }

    timerRef.current = setTimeout(() => {
      pendingSetRef.current.delete(itemKey);
      if (options.onPurge) {
        options.onPurge();
      }
      setActiveDeletion(null);
    }, durationMs);
  }, [activeDeletion]);

  const cancelActiveDeletion = useCallback(async () => {
    if (!activeDeletion) return;
    clearTimer();

    const current = activeDeletion;
    const itemKey = `${current.itemType}:${current.id}`;
    pendingSetRef.current.delete(itemKey);
    setActiveDeletion(null);

    try {
      await deletionService.cancelPendingDeletion(current.itemType, current.id);
    } catch (err) {
      console.error('[UndoDeletion] Erreur lors de l\'annulation serveur :', err);
    }

    if (current.onRestore) {
      current.onRestore();
    }
  }, [activeDeletion]);

  const isItemPending = useCallback((itemType: DeletableType, id: string): boolean => {
    return pendingSetRef.current.has(`${itemType}:${id}`);
  }, []);

  useEffect(() => {
    return () => {
      clearTimer();
    };
  }, []);

  return (
    <UndoDeletionContext.Provider
      value={{
        activeDeletion,
        scheduleUndoableDeletion,
        cancelActiveDeletion,
        isItemPending
      }}
    >
      {children}
    </UndoDeletionContext.Provider>
  );
}

export function useUndoDeletion() {
  const ctx = useContext(UndoDeletionContext);
  if (!ctx) {
    throw new Error('useUndoDeletion doit être utilisé au sein de UndoDeletionProvider');
  }
  return ctx;
}
