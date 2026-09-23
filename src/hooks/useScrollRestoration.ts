import { useLayoutEffect, useEffect, useRef, RefObject } from 'react';

export interface ScrollAnchor {
  messageId?: string;
  offsetTop: number;
  isAtBottom: boolean;
  scrollTop: number;
}

// Cache persistant en mémoire par conversationId
const memoryAnchorCache = new Map<string, ScrollAnchor>();

const SESSION_PREFIX = 'iroko_scroll_anchor_';

function getSessionAnchor(conversationId: string): ScrollAnchor | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(`${SESSION_PREFIX}${conversationId}`);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

function setSessionAnchor(conversationId: string, anchor: ScrollAnchor): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(`${SESSION_PREFIX}${conversationId}`, JSON.stringify(anchor));
  } catch {}
}

export interface UseScrollRestorationOptions {
  conversationId: string;
  messagesCount: number;
  isStreaming?: boolean;
}

/**
 * useScrollRestoration (Lot 7 — Fiche 23)
 * 
 * - Mémorise l'ancre de défilement (messageId + décalage offsetTop relatif au conteneur) par discussion.
 * - Restaure la position de défilement avant la peinture écran (useLayoutEffect) sans aucun saut ni flash visuel.
 * - Ouvre par défaut tout en bas (isAtBottom: true) si aucune ancre n'est enregistrée.
 */
export function useScrollRestoration(
  containerRef: RefObject<HTMLDivElement | null>,
  options: UseScrollRestorationOptions
) {
  const { conversationId, messagesCount, isStreaming = false } = options;
  const isRestoringRef = useRef(false);
  const prevConvIdRef = useRef<string | null>(null);

  // 1. Sauvegarde passive de l'ancre lors du défilement
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !conversationId) return;

    let rafId: number | null = null;

    const saveAnchor = () => {
      if (isRestoringRef.current || isStreaming) return;

      const scrollTop = el.scrollTop;
      const scrollHeight = el.scrollHeight;
      const clientHeight = el.clientHeight;
      const threshold = 48;
      const isAtBottom = scrollHeight - scrollTop - clientHeight <= threshold;

      if (isAtBottom) {
        const anchor: ScrollAnchor = {
          isAtBottom: true,
          offsetTop: 0,
          scrollTop
        };
        memoryAnchorCache.set(conversationId, anchor);
        setSessionAnchor(conversationId, anchor);
        return;
      }

      // Recherche du premier article visible dans la zone supérieure
      const articles = el.querySelectorAll<HTMLElement>('article[data-message-id]');
      let foundArticle: HTMLElement | null = null;
      let targetOffset = 0;

      for (let i = 0; i < articles.length; i++) {
        const article = articles[i];
        const relativeTop = article.offsetTop - scrollTop;
        // Le premier article dont le bas dépasse le haut du conteneur
        if (relativeTop + article.offsetHeight > 0) {
          foundArticle = article;
          targetOffset = relativeTop;
          break;
        }
      }

      const anchor: ScrollAnchor = {
        messageId: foundArticle ? foundArticle.getAttribute('data-message-id') || undefined : undefined,
        offsetTop: targetOffset,
        isAtBottom: false,
        scrollTop
      };

      memoryAnchorCache.set(conversationId, anchor);
      setSessionAnchor(conversationId, anchor);
    };

    const onScroll = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(saveAnchor);
    };

    el.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      el.removeEventListener('scroll', onScroll);
    };
  }, [containerRef, conversationId, isStreaming]);

  // 2. Restauration synchrone avant la peinture écran (useLayoutEffect)
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el || !conversationId || messagesCount === 0) return;

    // Détecter un changement de discussion
    const isNewConversation = prevConvIdRef.current !== conversationId;
    prevConvIdRef.current = conversationId;

    if (!isNewConversation) return;

    isRestoringRef.current = true;

    const savedAnchor = memoryAnchorCache.get(conversationId) || getSessionAnchor(conversationId);

    if (!savedAnchor || savedAnchor.isAtBottom) {
      // Ouverture en bas par défaut
      el.scrollTop = el.scrollHeight;
    } else if (savedAnchor.messageId) {
      // Restauration par ancrage messageId
      const targetElement = el.querySelector<HTMLElement>(`article[data-message-id="${savedAnchor.messageId}"]`);
      if (targetElement) {
        el.scrollTop = targetElement.offsetTop - savedAnchor.offsetTop;
      } else {
        // Repli déterministe sur le scrollTop enregistré
        el.scrollTop = savedAnchor.scrollTop;
      }
    } else {
      el.scrollTop = savedAnchor.scrollTop;
    }

    // Libérer le verrou de restauration dès la fin de frame
    requestAnimationFrame(() => {
      isRestoringRef.current = false;
    });
  }, [containerRef, conversationId, messagesCount]);
}
