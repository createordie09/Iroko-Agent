import React, { useRef } from 'react';
import { useOverlayFocus } from '../../../hooks/useOverlayFocus';

export interface DeleteMessageModalProps {
  isOpen: boolean;
  isDeleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DeleteMessageModal({
  isOpen,
  isDeleting,
  onCancel,
  onConfirm
}: DeleteMessageModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useOverlayFocus({
    isOpen,
    onClose: () => { if (!isDeleting) onCancel(); },
    containerRef,
    initialFocusRef: cancelRef
  });

  if (!isOpen) return null;

  return (
    <div data-overlay-backdrop="true" className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4">
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-message-title"
        aria-describedby="delete-message-desc"
        tabIndex={-1}
        data-modal="true"
        className="bg-[var(--bg-modal)] border border-[var(--border-modal)] rounded-[10px] max-w-md w-full p-4 space-y-3 animate-in fade-in zoom-in-95 duration-150 outline-none">
        <div id="delete-message-title" className="text-[14px] font-semibold text-[var(--text-primary)]">
          Supprimer le message
        </div>
        <p id="delete-message-desc" className="text-[12px] text-[var(--text-secondary)] leading-relaxed">
          Voulez-vous vraiment supprimer ce message de la discussion&nbsp;? Vous pourrez annuler cette suppression pendant quelques secondes.
        </p>
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={isDeleting}
            className="px-3 py-1.5 rounded-[6px] text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="px-3 py-1.5 rounded-[6px] text-[12px] bg-[var(--bg-active)] text-[var(--text-primary)] hover:opacity-90 border border-[var(--border-composer)] transition-colors cursor-pointer"
          >
            {isDeleting ? 'Suppression…' : 'Supprimer'}
          </button>
        </div>
      </div>
    </div>
  );
}
