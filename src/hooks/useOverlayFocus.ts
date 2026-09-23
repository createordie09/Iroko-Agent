import React, { useEffect, useRef, RefObject } from 'react';

export interface UseOverlayFocusOptions {
  /** Indique si le calque (modale, tiroir, menu) est ouvert */
  isOpen: boolean;
  /** Fonction de fermeture appelée notamment sur appui de la touche Échap */
  onClose: () => void;
  /** Référence vers l'élément conteneur du calque */
  containerRef: RefObject<HTMLElement | null>;
  /** Référence optionnelle vers l'élément devant recevoir le focus initial */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** Référence optionnelle vers l'élément déclencheur auquel restituer le focus à la fermeture */
  restoreFocusRef?: RefObject<HTMLElement | null>;
  /** Déplacement automatique du focus vers le premier élément focusable à l'ouverture (défaut : true) */
  autoFocus?: boolean;
}

interface OverlayEntry {
  id: string;
  onClose: () => void;
  container: HTMLElement;
  triggerElement: HTMLElement | null;
  inertCleanups: Array<() => void>;
}

/** Pile globale des calques actifs pour gérer la fermeture hiérarchique au sommet */
const overlayStack: OverlayEntry[] = [];

const FOCUSABLE_SELECTOR = [
  'button:not([disabled]):not([aria-disabled="true"]):not([tabindex="-1"])',
  '[href]:not([tabindex="-1"])',
  'input:not([disabled]):not([type="hidden"]):not([tabindex="-1"])',
  'select:not([disabled]):not([tabindex="-1"])',
  'textarea:not([disabled]):not([tabindex="-1"])',
  '[tabindex]:not([tabindex="-1"])'
].join(', ');

/**
 * Primitive de gestion du focus et de confinement pour les calques (modales, tiroirs, menus)
 * Conforme WCAG 2.1.1, 2.1.2, 2.4.2, 2.4.3 et règles UX U1 / U2 :
 * - Mémorise l'élément déclencheur à l'ouverture.
 * - Rend inert les branches sœurs dans le DOM pour confiner nativement le focus sans boucle JS.
 * - Déplace le focus vers le premier élément interactif (ou conteneur tabindex="-1").
 * - Gère la touche Échap pour fermer uniquement le calque au sommet de la pile.
 * - Restitue le focus au déclencheur (ou au composer en repli) dès la fermeture ou démontage.
 */
export function useOverlayFocus({
  isOpen,
  onClose,
  containerRef,
  initialFocusRef,
  restoreFocusRef,
  autoFocus = true
}: UseOverlayFocusOptions) {
  const idRef = useRef<string>(`overlay-${Math.random().toString(36).slice(2, 9)}`);

  useEffect(() => {
    if (!isOpen) return;

    // 1. Mémoriser l'élément déclencheur
    const trigger = restoreFocusRef?.current || (document.activeElement as HTMLElement | null);

    const container = containerRef.current;
    if (!container) return;

    // 2. Rendre inert tout le reste de l'application (les frères de chaque ancêtre jusqu'au conteneur racine)
    const inertCleanups: Array<() => void> = [];
    let current: HTMLElement | null = container;

    while (current && current !== document.body && current.parentElement) {
      const parent = current.parentElement;
      const children = Array.from(parent.children) as HTMLElement[];

      for (const sibling of children) {
        if (
          sibling !== current &&
          !sibling.contains(container) &&
          !sibling.hasAttribute('data-overlay-ignore-inert') &&
          !sibling.hasAttribute('data-overlay-backdrop')
        ) {
          const alreadyInert = sibling.hasAttribute('inert');
          if (!alreadyInert) {
            sibling.setAttribute('inert', '');
            inertCleanups.push(() => {
              sibling.removeAttribute('inert');
            });
          }
        }
      }
      current = parent;
    }

    // 3. Enregistrer dans la pile des calques
    const entry: OverlayEntry = {
      id: idRef.current,
      onClose,
      container,
      triggerElement: trigger,
      inertCleanups
    };
    overlayStack.push(entry);

    // 4. Déplacer le focus vers le premier élément focusable
    let rafId: number | null = null;
    if (autoFocus) {
      rafId = requestAnimationFrame(() => {
        if (!containerRef.current) return;

        if (initialFocusRef?.current && document.contains(initialFocusRef.current)) {
          initialFocusRef.current.focus();
          return;
        }

        const focusables = (
          Array.from(containerRef.current.querySelectorAll(FOCUSABLE_SELECTOR)) as HTMLElement[]
        ).filter(el => el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0);

        if (focusables.length > 0) {
          focusables[0].focus();
        } else if (containerRef.current.tabIndex !== undefined && containerRef.current.tabIndex >= -1) {
          containerRef.current.focus();
        }
      });
    }

    // 5. Nettoyage dès que isOpen devient false ou au démontage
    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }

      const index = overlayStack.findIndex(e => e.id === idRef.current);
      if (index !== -1) {
        const [popped] = overlayStack.splice(index, 1);
        popped.inertCleanups.forEach(cleanup => cleanup());

        // Restituer le focus au déclencheur s'il existe encore dans le DOM
        const target = popped.triggerElement;
        if (target && document.contains(target)) {
          target.focus();
        } else {
          // Repli vers le composer ou le conteneur principal
          const composer = document.querySelector('textarea') as HTMLElement | null;
          if (composer && document.contains(composer)) {
            composer.focus();
          }
        }
      }
    };
  }, [isOpen, autoFocus, containerRef, initialFocusRef, restoreFocusRef, onClose]);

  // Gestion clavier : touche Échap et piégeage du Tab au sommet de la pile
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const topEntry = overlayStack[overlayStack.length - 1];
      if (!topEntry || topEntry.id !== idRef.current) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }

      if (e.key === 'Tab') {
        const container = containerRef.current;
        if (!container) return;

        const focusables = (
          Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)) as HTMLElement[]
        ).filter(el => el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0);

        if (focusables.length === 0) {
          e.preventDefault();
          return;
        }

        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;

        if (e.shiftKey) {
          if (active === first || !container.contains(active)) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (active === last || !container.contains(active)) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isOpen, onClose, containerRef]);
}

