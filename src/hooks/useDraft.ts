import { useEffect, useRef, useCallback } from 'react';

export const DRAFT_STORAGE_PREFIX = 'iroko_draft_';
export const DRAFT_HOME_KEY = 'iroko_draft_home';
export const DRAFT_DEBOUNCE_MS = 400;
export const MAX_DRAFTS_COUNT = 50;
export const DRAFT_EXPIRATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 jours

export interface DraftEntry {
  text: string;
  updatedAt: number;
}

/**
 * Calcule la clé de stockage pour une conversation donnée.
 */
export function getDraftStorageKey(conversationId?: string): string {
  return conversationId ? `${DRAFT_STORAGE_PREFIX}${conversationId}` : DRAFT_HOME_KEY;
}

function getStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
    if (typeof localStorage !== 'undefined') {
      return localStorage;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Nettoie les brouillons expirés (> 30 jours) et limite le total à 50 brouillons les plus récents.
 */
export function pruneDrafts(): void {
  const storage = getStorage();
  if (!storage) return;

  try {
    const draftKeys: { key: string; updatedAt: number }[] = [];
    const now = Date.now();

    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && (key.startsWith(DRAFT_STORAGE_PREFIX) || key === DRAFT_HOME_KEY)) {
        try {
          const raw = storage.getItem(key);
          if (raw) {
            const parsed = JSON.parse(raw) as DraftEntry;
            if (now - (parsed.updatedAt || 0) > DRAFT_EXPIRATION_MS) {
              storage.removeItem(key);
            } else {
              draftKeys.push({ key, updatedAt: parsed.updatedAt || 0 });
            }
          }
        } catch {
          // Entrée corrompue, on la retire
          storage.removeItem(key);
        }
      }
    }

    // Si plus de 50 brouillons, supprimer les plus anciens
    if (draftKeys.length > MAX_DRAFTS_COUNT) {
      draftKeys.sort((a, b) => a.updatedAt - b.updatedAt);
      const toRemove = draftKeys.slice(0, draftKeys.length - MAX_DRAFTS_COUNT);
      for (const item of toRemove) {
        storage.removeItem(item.key);
      }
    }
  } catch {
    // Silencieux en cas de restriction de stockage
  }
}

/**
 * Supprime tous les brouillons stockés en localStorage (utilisé lors des purges de confidentialité).
 */
export function clearAllDrafts(): void {
  const storage = getStorage();
  if (!storage) return;

  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && (key.startsWith(DRAFT_STORAGE_PREFIX) || key === DRAFT_HOME_KEY)) {
        keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) {
      storage.removeItem(key);
    }
  } catch {}
}

/**
 * Hook useDraft (Règles UX U1, U8, U9 / Lot 5)
 * 
 * - Sauvegarde différée à 400 ms en localStorage sous `iroko_draft_<id>` ou `iroko_draft_home`.
 * - Restauration automatique au montage et au changement de discussion.
 * - Effacement immédiat à l'envoi du message via `clearDraft()`.
 * - Nettoyage borné à 50 brouillons et 30 jours de rétention.
 * - Ne persiste jamais les pièces jointes.
 */
export function useDraft(
  conversationId: string | undefined,
  value: string,
  setValue: (val: string) => void
): {
  clearDraft: () => void;
} {
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeKeyRef = useRef(getDraftStorageKey(conversationId));
  const isRestoringRef = useRef(false);

  const currentKey = getDraftStorageKey(conversationId);

  // 1. Restauration au montage et lors du basculement de discussion
  useEffect(() => {
    activeKeyRef.current = currentKey;
    isRestoringRef.current = true;

    const storage = getStorage();
    if (storage) {
      try {
        const raw = storage.getItem(currentKey);
        if (raw) {
          const parsed = JSON.parse(raw) as DraftEntry;
          if (parsed && typeof parsed.text === 'string') {
            const age = Date.now() - (parsed.updatedAt || 0);
            if (age <= DRAFT_EXPIRATION_MS) {
              setValue(parsed.text);
            } else {
              storage.removeItem(currentKey);
              setValue('');
            }
          } else {
            setValue('');
          }
        } else {
          setValue('');
        }
      } catch {
        setValue('');
      }
    }

    // Nettoyage périodique des brouillons périmés
    pruneDrafts();

    const t = setTimeout(() => {
      isRestoringRef.current = false;
    }, 50);

    return () => clearTimeout(t);
  }, [currentKey, setValue]);

  // 2. Écriture différée de 400 ms
  useEffect(() => {
    // Ne pas écraser pendant la restauration
    if (isRestoringRef.current) return;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      const storage = getStorage();
      if (!storage) return;

      const trimmed = value.trim();
      const storageKey = activeKeyRef.current;

      try {
        if (!trimmed) {
          storage.removeItem(storageKey);
        } else {
          const entry: DraftEntry = {
            text: value,
            updatedAt: Date.now()
          };
          storage.setItem(storageKey, JSON.stringify(entry));
          pruneDrafts();
        }
      } catch {}
    }, DRAFT_DEBOUNCE_MS);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [value]);

  // 3. Effacement immédiat lors de l'envoi
  const clearDraft = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    const storageKey = activeKeyRef.current;
    const storage = getStorage();
    if (storage) {
      try {
        storage.removeItem(storageKey);
      } catch {}
    }
  }, []);

  return { clearDraft };
}
