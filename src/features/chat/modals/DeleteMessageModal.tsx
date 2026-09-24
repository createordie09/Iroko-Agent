import React from 'react';

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
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-[var(--bg-modal)] border border-[var(--border-modal)] rounded-[10px] max-w-md w-full p-4 space-y-3 animate-in fade-in zoom-in-95 duration-150">
        <div className="text-[14px] font-semibold text-[var(--text-primary)]">
          Supprimer le message
        </div>
        <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">
          Voulez-vous vraiment supprimer ce message de la discussion&nbsp;? Cette action est irréversible dans la base locale.
        </p>
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
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
