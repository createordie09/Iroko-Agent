import React from 'react';

export interface EditModalData {
  message: any;
  index: number;
  content: string;
  impact?: {
    subsequentCount: number;
    filesWereModified: boolean;
    modifiedFiles: string[];
  };
}

export interface EditMessageModalProps {
  data: EditModalData | null;
  onChangeContent: (content: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

export function EditMessageModal({
  data,
  onChangeContent,
  onCancel,
  onConfirm
}: EditMessageModalProps) {
  if (!data) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-[var(--bg-modal)] border border-[var(--border-modal)] rounded-[10px] max-w-lg w-full p-4 space-y-3 animate-in fade-in zoom-in-95 duration-150">
        <div className="text-[14px] font-semibold text-[var(--text-primary)]">
          Modifier et renvoyer le message
        </div>
        
        {data.impact && data.impact.subsequentCount > 0 && (
          <div className="p-2.5 rounded-[6px] bg-[var(--bg-user-bubble)] border border-[var(--border-modal)] text-[12px] text-[var(--text-secondary)] space-y-1">
            <div>
              Modifier ce message supprimera les <span className="text-[var(--text-primary)] font-medium">{data.impact.subsequentCount}</span> message(s) suivant(s) de cette discussion.
            </div>
            {data.impact.filesWereModified && (
              <div className="text-[var(--text-muted)] pt-1">
                ⚠️ Attention&nbsp;: <span className="font-medium text-[var(--text-primary)]">{data.impact.modifiedFiles.length} fichier(s)</span> ont été modifiés par l'agent depuis ce message en mode Code ({data.impact.modifiedFiles.slice(0, 3).join(', ')}{data.impact.modifiedFiles.length > 3 ? '…' : ''}). Ces modifications déjà écrites sur le disque ne seront pas automatiquement annulées.
              </div>
            )}
          </div>
        )}

        <div>
          <textarea
            value={data.content}
            onChange={e => onChangeContent(e.target.value)}
            rows={4}
            className="w-full bg-[var(--bg-app)] border border-[var(--border-modal)] rounded-[6px] p-2.5 text-[13px] text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-focus)] resize-none"
            placeholder="Modifiez votre message…"
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 rounded-[6px] text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!data.content.trim()}
            className="px-3 py-1.5 rounded-[6px] text-[12px] bg-[var(--text-primary)] text-[var(--bg-app)] hover:bg-white font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            Confirmer et renvoyer
          </button>
        </div>
      </div>
    </div>
  );
}
