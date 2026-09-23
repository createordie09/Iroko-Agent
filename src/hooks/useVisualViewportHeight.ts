import { useState, useEffect } from 'react';

/**
 * Hook useVisualViewportHeight (Règles UX U1, U8 / Lot 5)
 * 
 * Pilote la hauteur de la vue applicative selon window.visualViewport
 * pour que le clavier virtuel ne masque jamais le composer sur mobile.
 * 
 * - Met à jour la variable CSS `--app-height` sur document.documentElement
 *   cadencée par requestAnimationFrame (évite les recalculs de style excessifs).
 * - Repli élégant sur 100dvh si window.visualViewport n'est pas disponible.
 * - Ramène automatiquement le champ de texte actif dans la vue lors du focus.
 */
export function useVisualViewportHeight(): string {
  const [appHeight, setAppHeight] = useState<string>('100dvh');

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let rafId: number | null = null;

    const updateHeight = () => {
      if (rafId !== null) return;

      rafId = requestAnimationFrame(() => {
        rafId = null;
        const vv = window.visualViewport;
        if (vv) {
          const heightPx = `${Math.round(vv.height)}px`;
          document.documentElement.style.setProperty('--app-height', heightPx);
          setAppHeight(heightPx);
        } else {
          document.documentElement.style.setProperty('--app-height', '100dvh');
          setAppHeight('100dvh');
        }
      });
    };

    // Initialisation immédiate
    updateHeight();

    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener('resize', updateHeight);
      vv.addEventListener('scroll', updateHeight);
    }
    window.addEventListener('resize', updateHeight);

    // Recentrage automatique du champ actif dans le viewport au focus
    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      const isTextInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      if (isTextInput) {
        // Double cadencement : rAF immédiat + délai 120ms le temps que le clavier virtuel achève son animation
        requestAnimationFrame(() => {
          target.scrollIntoView({ block: 'nearest', behavior: 'auto' });
        });
        setTimeout(() => {
          target.scrollIntoView({ block: 'nearest', behavior: 'auto' });
        }, 120);
      }
    };

    document.addEventListener('focusin', handleFocusIn, { passive: true });

    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      if (vv) {
        vv.removeEventListener('resize', updateHeight);
        vv.removeEventListener('scroll', updateHeight);
      }
      window.removeEventListener('resize', updateHeight);
      document.removeEventListener('focusin', handleFocusIn);
    };
  }, []);

  return appHeight;
}
