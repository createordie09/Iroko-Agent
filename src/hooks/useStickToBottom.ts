import { useState, useRef, useEffect, useCallback, RefObject } from 'react';
import { AnimationsMode } from '../context/AppContext';

/**
 * Utilitaire unique pour déterminer le comportement de défilement (règle UX Lot 4).
 * Lit le réglage Animations de l'application ET matchMedia("(prefers-reduced-motion: reduce)").
 * 
 * - Si mouvement réduit actif : toujours 'auto'.
 * - Si action utilisateur explicite (ex. clic sur "Revenir en bas") : 'smooth'.
 * - En streaming automatique ou mise à jour de contenu : toujours 'auto' (évite les reflows continus).
 */
export function getScrollBehavior(
  animations?: AnimationsMode,
  userTriggered: boolean = false
): ScrollBehavior {
  const isReducedMotion =
    animations === 'reduced' ||
    (typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);

  if (isReducedMotion) {
    return 'auto';
  }

  // Défilement animé réservé exclusivement aux actions explicites de l'utilisateur
  if (userTriggered) {
    return 'smooth';
  }

  return 'auto';
}

export interface UseStickToBottomOptions {
  contentDependencies?: any[];
  isStreaming?: boolean;
  animations?: AnimationsMode;
}

/**
 * Hook useStickToBottom
 * 
 * Gère le défilement conversationnel sécurisé :
 * 1. isAtBottom (seuil strict de 48 px) mis à jour par des écouteurs passifs (scroll, wheel, touchmove).
 * 2. Le suivi automatique n'est actif QUE si l'utilisateur est en bas.
 *    Dès qu'il remonte, le suivi ne le ramène jamais de force.
 * 3. Pendant le streaming : behavior 'auto' et cadencement par requestAnimationFrame.
 * 4. Bouton "Revenir en bas" disponible dès que l'utilisateur est remonté et que du contenu arrive.
 */
export function useStickToBottom(
  scrollRef: RefObject<HTMLDivElement | null>,
  options: UseStickToBottomOptions = {}
) {
  const { contentDependencies = [], isStreaming = false, animations } = options;

  const [isAtBottom, setIsAtBottom] = useState(true);
  const isAtBottomRef = useRef(true);
  const rafIdRef = useRef<number | null>(null);
  const lastScrollTopRef = useRef(0);
  const touchStartYRef = useRef(0);

  // Détection du bas de page avec seuil strict de 48 px
  const checkAtBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const threshold = 48;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;

    if (atBottom !== isAtBottomRef.current) {
      isAtBottomRef.current = atBottom;
      setIsAtBottom(atBottom);
    }
  }, [scrollRef]);

  // Écouteurs passifs de défilement, molette et toucher
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const onScroll = () => {
      checkAtBottom();
      lastScrollTopRef.current = el.scrollTop;
    };

    const onWheel = (e: WheelEvent) => {
      // Si l'utilisateur donne un coup de molette vers le haut (deltaY < 0), désactiver immédiatement le suivi
      if (e.deltaY < 0) {
        isAtBottomRef.current = false;
        setIsAtBottom(false);
      }
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        touchStartYRef.current = e.touches[0].clientY;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        const delta = e.touches[0].clientY - touchStartYRef.current;
        // Glissement vers le bas sur écran tactile = remonter dans l'historique
        if (delta > 10) {
          isAtBottomRef.current = false;
          setIsAtBottom(false);
        }
      }
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    el.addEventListener('wheel', onWheel, { passive: true });
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: true });

    return () => {
      el.removeEventListener('scroll', onScroll);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, [scrollRef, checkAtBottom]);

  // Suivi automatique conditionnel lors de l'arrivée de nouveau contenu
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    // Règle d'or : le suivi automatique n'est actif QUE si l'utilisateur est déjà en bas.
    // Dès qu'il est remonté, il n'est jamais ramené de force !
    if (!isAtBottomRef.current) {
      return;
    }

    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
    }

    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null;
      if (!scrollRef.current || !isAtBottomRef.current) return;
      const behavior = getScrollBehavior(animations, false); // toujours 'auto'
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior
      });
    });
  }, contentDependencies); // eslint-disable-line react-hooks/exhaustive-deps

  // Action explicite de l'utilisateur pour revenir en bas
  const scrollToBottom = useCallback((userTriggered: boolean = true) => {
    const el = scrollRef.current;
    if (!el) return;

    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }

    const behavior = getScrollBehavior(animations, userTriggered);
    el.scrollTo({
      top: el.scrollHeight,
      behavior
    });

    isAtBottomRef.current = true;
    setIsAtBottom(true);
  }, [scrollRef, animations]);

  // Afficher le bouton quand l'utilisateur est remonté et qu'il y a du streaming ou du contenu
  const showScrollButton = !isAtBottom;

  return {
    isAtBottom,
    scrollToBottom,
    showScrollButton,
    getScrollBehavior: (userTriggered?: boolean) => getScrollBehavior(animations, userTriggered)
  };
}
