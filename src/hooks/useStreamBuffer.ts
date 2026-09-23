import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * Hook useStreamBuffer
 * 
 * Regroupe les deltas de streaming dans un tampon et les applique à l'état réactif
 * à une cadence maîtrisée via requestAnimationFrame (ou 50ms quand l'onglet est masqué).
 * 
 * Objectif strict : <= 20 rendus par seconde quel que soit le débit de tokens (règle UX U7).
 */
export function useStreamBuffer() {
  const [streamContent, setStreamContent] = useState('');
  const bufferRef = useRef('');
  const displayedLengthRef = useRef(0);
  const rafIdRef = useRef<number | null>(null);
  const timeoutIdRef = useRef<NodeJS.Timeout | null>(null);
  const lastFlushTimeRef = useRef(0);

  const flush = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    if (timeoutIdRef.current !== null) {
      clearTimeout(timeoutIdRef.current);
      timeoutIdRef.current = null;
    }

    const currentText = bufferRef.current;
    if (currentText.length !== displayedLengthRef.current) {
      displayedLengthRef.current = currentText.length;
      lastFlushTimeRef.current = Date.now();
      setStreamContent(currentText);
    }
  }, []);

  const scheduleFlush = useCallback(() => {
    // Si un flush est déjà planifié, laisser le cycle actif consommer le tampon
    if (rafIdRef.current !== null || timeoutIdRef.current !== null) {
      return;
    }

    const now = Date.now();
    const elapsed = now - lastFlushTimeRef.current;
    // Cadence max de 20 rendus par seconde (50ms minimum entre deux affichages)
    const minInterval = 50;
    const delay = Math.max(0, minInterval - elapsed);

    const isHidden = typeof document !== 'undefined' && document.hidden;

    if (isHidden) {
      // Onglet en arrière-plan : temporisation à 50ms sans solliciter la boucle de rendu graphique
      timeoutIdRef.current = setTimeout(() => {
        timeoutIdRef.current = null;
        flush();
      }, Math.max(delay, 50));
    } else if (delay > 0) {
      // Écrêtage à 20 fps : attente du délai restant avant soumission à requestAnimationFrame
      timeoutIdRef.current = setTimeout(() => {
        timeoutIdRef.current = null;
        rafIdRef.current = requestAnimationFrame(() => {
          rafIdRef.current = null;
          flush();
        });
      }, delay);
    } else {
      // Soumission immédiate à la prochaine image d'animation du navigateur
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null;
        flush();
      });
    }
  }, [flush]);

  const appendDelta = useCallback((delta: string) => {
    if (!delta) return;
    bufferRef.current += delta;
    scheduleFlush();
  }, [scheduleFlush]);

  const flushImmediately = useCallback((): string => {
    flush();
    return bufferRef.current;
  }, [flush]);

  const reset = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    if (timeoutIdRef.current !== null) {
      clearTimeout(timeoutIdRef.current);
      timeoutIdRef.current = null;
    }
    bufferRef.current = '';
    displayedLengthRef.current = 0;
    lastFlushTimeRef.current = 0;
    setStreamContent('');
  }, []);

  // Détection du retour en premier plan et nettoyage des temporisations
  useEffect(() => {
    const onVisibilityChange = () => {
      if (typeof document !== 'undefined' && !document.hidden && bufferRef.current.length !== displayedLengthRef.current) {
        flush();
      }
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange);
    }
    return () => {
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
      if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current);
      if (timeoutIdRef.current !== null) clearTimeout(timeoutIdRef.current);
    };
  }, [flush]);

  return {
    streamContent,
    appendDelta,
    flushImmediately,
    reset,
    getBuffer: () => bufferRef.current,
    setStreamContent
  };
}
