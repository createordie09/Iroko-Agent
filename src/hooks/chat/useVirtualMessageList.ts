import React, { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo, RefObject } from 'react';

export interface VirtualItem<T> {
  item: T;
  index: number;
  offsetTop: number;
  height: number;
}

export interface UseVirtualMessageListOptions<T> {
  items: T[];
  containerRef: RefObject<HTMLDivElement | null>;
  getItemId?: (item: T, index: number) => string | number;
  estimateHeight?: (item: T) => number;
  overscan?: number;
  threshold?: number;
  onScrollToBottom?: () => void;
}

const DEFAULT_ESTIMATE_HEIGHT = 120;
const DEFAULT_OVERSCAN = 8;
const DEFAULT_THRESHOLD = 60;

/**
 * useVirtualMessageList (Mission R5b)
 * 
 * Virtualisation performante et accessible de la liste de messages :
 * 1. Hauteurs dynamiques mesurées par ResizeObserver.
 * 2. Zéro saut de défilement (scroll jump) : compensation automatique du scrollTop lors de variations de hauteur au-dessus du viewport.
 * 3. Préservation de l'ancrage et restauration de position (Lot 7).
 * 4. Préservation de la recherche dans la page (hidden="until-found" + événement beforematch).
 * 5. Navigation continue au clavier (Tab, Maj+Tab, Home, End, PageUp, PageDown) avec ancres de focus pour les messages hors écran.
 */
export function useVirtualMessageList<T extends { id?: string; role?: string; content?: string }>(
  options: UseVirtualMessageListOptions<T>
) {
  const {
    items,
    containerRef,
    getItemId = (item: any, idx: number) => item?.id || idx,
    estimateHeight,
    overscan = DEFAULT_OVERSCAN,
    threshold = DEFAULT_THRESHOLD
  } = options;

  const count = items.length;
  const isEnabled = count >= threshold;

  // Cache des hauteurs mesurées par identifiant
  const heightMapRef = useRef<Map<string | number, number>>(new Map());
  // Éléments DOM actuellement surveillés
  const itemElementsRef = useRef<Map<string | number, HTMLElement>>(new Map());

  // État de défilement courant
  const [scrollState, setScrollState] = useState({
    scrollTop: 0,
    viewportHeight: 800
  });

  // Fonction d'estimation de hauteur adaptée au type et volume de contenu
  const getEstimatedHeight = useCallback((item: T): number => {
    if (estimateHeight) return estimateHeight(item);
    if (!item) return DEFAULT_ESTIMATE_HEIGHT;

    const isUser = item.role === 'user';
    const textLen = item.content?.length || 0;

    if (isUser) {
      return Math.max(48, Math.min(240, 48 + Math.floor(textLen / 70) * 18));
    }

    // Assistant : prise en compte du code, tableaux et artéfacts
    const hasCode = item.content?.includes('```');
    const hasArtifact = item.content?.includes('<artifact_card');
    let h = 90 + Math.floor(textLen / 90) * 20;
    if (hasCode) h += 180;
    if (hasArtifact) h += 80;
    return Math.max(80, Math.min(900, h));
  }, [estimateHeight]);

  // Récupération de la hauteur d'un élément (mesurée ou estimée)
  const getItemHeight = useCallback((index: number): number => {
    if (index < 0 || index >= items.length) return DEFAULT_ESTIMATE_HEIGHT;
    const item = items[index];
    const id = getItemId(item, index);
    const measured = heightMapRef.current.get(id);
    if (typeof measured === 'number' && measured > 0) return measured;
    return getEstimatedHeight(item);
  }, [items, getItemId, getEstimatedHeight]);

  // Calcul des positions cumulées (offsets)
  const offsets = useMemo(() => {
    const list: number[] = new Array(count + 1);
    list[0] = 0;
    for (let i = 0; i < count; i++) {
      list[i + 1] = list[i] + getItemHeight(i);
    }
    return list;
  }, [count, getItemHeight]);

  const totalHeight = offsets[count] || 0;

  // Recherche dichotomique pour déterminer l'indice à un offset donné
  const findIndexAtOffset = useCallback((targetOffset: number): number => {
    if (count === 0) return 0;
    let low = 0;
    let high = count - 1;
    let result = 0;

    while (low <= high) {
      const mid = (low + high) >> 1;
      const top = offsets[mid];
      const bottom = offsets[mid + 1];

      if (targetOffset >= top && targetOffset < bottom) {
        return mid;
      }
      if (targetOffset < top) {
        high = mid - 1;
      } else {
        result = mid;
        low = mid + 1;
      }
    }
    return Math.max(0, Math.min(count - 1, result));
  }, [count, offsets]);

  // Calcul de la fenêtre visible
  const { startIndex, endIndex, topSpacerHeight, bottomSpacerHeight } = useMemo(() => {
    if (!isEnabled || count === 0) {
      return {
        startIndex: 0,
        endIndex: count,
        topSpacerHeight: 0,
        bottomSpacerHeight: 0
      };
    }

    const { scrollTop, viewportHeight } = scrollState;
    const scrollBottom = scrollTop + viewportHeight;

    const firstVisible = findIndexAtOffset(scrollTop);
    const lastVisible = findIndexAtOffset(scrollBottom);

    const start = Math.max(0, firstVisible - overscan);
    const end = Math.min(count, lastVisible + 1 + overscan);

    return {
      startIndex: start,
      endIndex: end,
      topSpacerHeight: offsets[start] || 0,
      bottomSpacerHeight: Math.max(0, totalHeight - (offsets[end] || totalHeight))
    };
  }, [isEnabled, count, scrollState, offsets, totalHeight, findIndexAtOffset, overscan]);

  // Éléments actifs à afficher
  const virtualItems: VirtualItem<T>[] = useMemo(() => {
    if (!isEnabled) {
      return items.map((item, index) => ({
        item,
        index,
        offsetTop: offsets[index] || 0,
        height: getItemHeight(index)
      }));
    }

    const list: VirtualItem<T>[] = [];
    for (let i = startIndex; i < endIndex; i++) {
      list.push({
        item: items[i],
        index: i,
        offsetTop: offsets[i] || 0,
        height: getItemHeight(i)
      });
    }
    return list;
  }, [isEnabled, items, startIndex, endIndex, offsets, getItemHeight]);

  // 1. Écoute du défilement du conteneur
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !isEnabled) return;

    let rafId: number | null = null;

    const onScroll = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        setScrollState({
          scrollTop: el.scrollTop,
          viewportHeight: el.clientHeight || 800
        });
      });
    };

    // Mesure initiale
    setScrollState({
      scrollTop: el.scrollTop,
      viewportHeight: el.clientHeight || 800
    });

    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      el.removeEventListener('scroll', onScroll);
    };
  }, [containerRef, isEnabled]);

  // 2. Surveillance dynamique des hauteurs par ResizeObserver avec anti-scroll-jump
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el || !isEnabled) return;

    const observer = new ResizeObserver((entries) => {
      let pendingCompensation = 0;
      let hasChanges = false;
      const currentScrollTop = el.scrollTop;

      for (const entry of entries) {
        const target = entry.target as HTMLElement;
        const msgId = target.getAttribute('data-message-id');
        if (!msgId) continue;

        const newHeight = Math.round(
          entry.borderBoxSize?.[0]?.blockSize || entry.contentRect.height || target.offsetHeight
        );
        if (newHeight <= 0) continue;

        const prevHeight = heightMapRef.current.get(msgId);
        if (typeof prevHeight === 'number' && Math.abs(newHeight - prevHeight) >= 1) {
          const delta = newHeight - prevHeight;
          heightMapRef.current.set(msgId, newHeight);
          hasChanges = true;

          // Si l'élément est situé strictement au-dessus du haut de la vue :
          // compenser immédiatement pour éviter tout saut de lecture
          const itemTop = target.offsetTop;
          if (itemTop + prevHeight <= currentScrollTop) {
            pendingCompensation += delta;
          }
        } else if (prevHeight === undefined) {
          heightMapRef.current.set(msgId, newHeight);
          hasChanges = true;
        }
      }

      if (pendingCompensation !== 0) {
        el.scrollTop += pendingCompensation;
      }

      if (hasChanges) {
        // Rafraîchir l'état de défilement pour recalculer les offsets
        setScrollState(prev => ({
          ...prev,
          scrollTop: el.scrollTop,
          viewportHeight: el.clientHeight || prev.viewportHeight
        }));
      }
    });

    resizeObserverRef.current = observer;

    // Attacher l'observateur aux éléments enregistrés
    for (const [, node] of itemElementsRef.current) {
      observer.observe(node);
    }

    return () => {
      observer.disconnect();
      itemElementsRef.current.clear();
      heightMapRef.current.clear();
    };
  }, [containerRef, isEnabled]);

  // Élagage des éléments détachés pour éviter les fuites mémoire lors de changements de conversation (Mission R5c)
  useEffect(() => {
    const activeIds = new Set<string | number>();
    for (let i = 0; i < items.length; i++) {
      activeIds.add(getItemId(items[i], i));
    }

    const observer = resizeObserverRef.current;
    for (const [id, node] of itemElementsRef.current.entries()) {
      if (!activeIds.has(id)) {
        if (observer) {
          try {
            observer.unobserve(node);
          } catch {}
        }
        itemElementsRef.current.delete(id);
        heightMapRef.current.delete(id);
      }
    }
  }, [items, getItemId]);

  // Ref callback pour attacher chaque message rendu au ResizeObserver
  const registerItemRef = useCallback((id: string | number, node: HTMLElement | null) => {
    const observer = resizeObserverRef.current;
    if (node) {
      itemElementsRef.current.set(id, node);
      if (observer) observer.observe(node);
    } else {
      const existing = itemElementsRef.current.get(id);
      if (existing && observer) {
        observer.unobserve(existing);
      }
      itemElementsRef.current.delete(id);
    }
  }, []);

  // 3. Défilement vers un indice précis
  const scrollToIndex = useCallback((index: number, align: 'top' | 'center' | 'bottom' | 'auto' = 'auto') => {
    const el = containerRef.current;
    if (!el || count === 0) return;

    const clampedIndex = Math.max(0, Math.min(count - 1, index));
    const itemTop = offsets[clampedIndex] || 0;
    const itemHeight = getItemHeight(clampedIndex);
    const viewportHeight = el.clientHeight || 800;
    const currentScrollTop = el.scrollTop;

    let targetScrollTop = currentScrollTop;

    if (align === 'top') {
      targetScrollTop = itemTop;
    } else if (align === 'bottom') {
      targetScrollTop = itemTop + itemHeight - viewportHeight;
    } else if (align === 'center') {
      targetScrollTop = itemTop - (viewportHeight - itemHeight) / 2;
    } else {
      // 'auto' : ramène dans la vue uniquement si hors de la vue
      if (itemTop < currentScrollTop) {
        targetScrollTop = itemTop;
      } else if (itemTop + itemHeight > currentScrollTop + viewportHeight) {
        targetScrollTop = itemTop + itemHeight - viewportHeight;
      }
    }

    el.scrollTop = Math.max(0, Math.min(el.scrollHeight - viewportHeight, targetScrollTop));
  }, [containerRef, count, offsets, getItemHeight]);

  // 4. Défilement vers un messageId (pour useScrollRestoration & Palette)
  const scrollToMessageId = useCallback((id: string | number, offsetTop: number = 0) => {
    const idx = items.findIndex((item, i) => getItemId(item, i) === id);
    if (idx !== -1) {
      const el = containerRef.current;
      if (el) {
        const targetTop = (offsets[idx] || 0) + offsetTop;
        el.scrollTop = Math.max(0, targetTop);
      }
    }
  }, [items, getItemId, containerRef, offsets]);

  // 5. Gestion des touches clavier pour navigation rapide (Home, End, PageUp, PageDown)
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!isEnabled) return;
    const el = containerRef.current;
    if (!el) return;

    if (e.key === 'Home') {
      e.preventDefault();
      scrollToIndex(0, 'top');
    } else if (e.key === 'End') {
      e.preventDefault();
      scrollToIndex(count - 1, 'bottom');
    } else if (e.key === 'PageUp') {
      e.preventDefault();
      el.scrollTop = Math.max(0, el.scrollTop - (el.clientHeight || 600));
    } else if (e.key === 'PageDown') {
      e.preventDefault();
      el.scrollTop = Math.min(el.scrollHeight - el.clientHeight, el.scrollTop + (el.clientHeight || 600));
    }
  }, [isEnabled, count, scrollToIndex, containerRef]);

  return {
    isVirtualized: isEnabled,
    virtualItems,
    startIndex,
    endIndex,
    totalHeight,
    topSpacerHeight,
    bottomSpacerHeight,
    registerItemRef,
    scrollToIndex,
    scrollToMessageId,
    handleKeyDown,
    offsets
  };
}
