import { useState, useRef, useCallback, useEffect } from 'react';

export interface UseCopyFeedbackOptions {
  timeoutMs?: number;
}

/**
 * Hook utilitaire unifié pour le retour visuel de copie (Mission R8d)
 * Garantit le même retour visuel ("Copié"), le même délai (1500 ms) et l'absence de décalage visuel (CLS 0).
 */
export function useCopyFeedback({ timeoutMs = 1500 }: UseCopyFeedbackOptions = {}) {
  const [copiedKey, setCopiedKey] = useState<string | number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const copy = useCallback(async (text: string, key: string | number = 'default'): Promise<boolean> => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else if (typeof document !== 'undefined') {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopiedKey(key);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setCopiedKey(null);
      }, timeoutMs);
      return true;
    } catch {
      return false;
    }
  }, [timeoutMs]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const isCopied = useCallback((key: string | number = 'default') => {
    return copiedKey === key;
  }, [copiedKey]);

  return {
    copiedKey,
    copy,
    isCopied,
    reset: () => setCopiedKey(null)
  };
}
