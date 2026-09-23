import React from 'react';
import { ShieldAlert, ShieldCheck, X } from 'lucide-react';
import { PermissionRequest } from '../../../server/types/events';

export interface PermissionPromptProps {
  request: PermissionRequest;
  onRespond: (approved: boolean, scope: 'once' | 'session' | 'project' | 'reject') => void;
}

export function PermissionPrompt({ request, onRespond }: PermissionPromptProps) {
  const isCritical = request.level === 'CRITICAL';

  return (
    <div
      className="w-full bg-[var(--bg-sidebar)] border border-[var(--border-modal)] rounded-[8px] overflow-hidden my-3 select-none"
      style={{ boxShadow: 'none' }}
    >
      {/* En-tête sobre */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border-subtle)] bg-[var(--bg-app)]">
        <div className="flex items-center gap-2">
          <ShieldAlert className={`w-4 h-4 ${isCritical ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`} />
          <h3 className="text-[13px] font-medium text-[var(--text-primary)]">
            Autorisation requise
          </h3>
          <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--bg-active)]">
            {request.level}
          </span>
        </div>
        <button
          type="button"
          onClick={() => onRespond(false, 'reject')}
          className="p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors rounded"
          title="Refuser"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Corps */}
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-2 text-[12px] text-[var(--text-secondary)]">
          <span>Outil{'\u00A0'}:</span>
          <span className="font-mono text-[var(--text-primary)] bg-[var(--bg-surface)] px-1.5 py-0.5 rounded border border-[var(--bg-active)]">
            {request.tool}
          </span>
        </div>

        <p className="text-[13px] text-[var(--text-primary)] leading-relaxed">
          {request.description}
        </p>

        {request.details && (
          <div className="bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded p-3 font-mono text-[12px] text-[var(--text-muted)] overflow-x-auto space-y-1">
            {request.details.command && (
              <div>
                <span className="text-[var(--text-placeholder)] select-none">$ </span>
                <span className="text-[var(--text-primary)]">{request.details.command}</span>
              </div>
            )}
            {request.details.path && (
              <div>
                <span className="text-[var(--text-placeholder)]">Cible{'\u00A0'}: </span>
                <span className="text-[var(--text-primary)]">{request.details.path}</span>
              </div>
            )}
          </div>
        )}

        <p className="text-[11px] text-[var(--text-placeholder)]">
          {isCritical
            ? 'Cette commande est classée CRITIQUE. Elle ne peut être exécutée qu\'avec votre confirmation explicite.'
            : 'Choisissez la portée de votre décision pour cette action.'}
        </p>
      </div>

      {/* 4 Choix formels */}
      <div className="px-4 py-3 border-t border-[var(--border-subtle)] bg-[var(--bg-app)] flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => onRespond(false, 'reject')}
          className="px-3 py-1.5 rounded-[6px] text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] border border-[var(--bg-active)] transition-colors"
        >
          Refuser
        </button>

        <button
          type="button"
          onClick={() => onRespond(true, 'once')}
          className="px-3 py-1.5 rounded-[6px] text-[12px] text-[var(--text-primary)] bg-[var(--bg-active)] hover:opacity-90 transition-colors flex items-center gap-1.5"
        >
          <ShieldCheck className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
          <span>Une fois</span>
        </button>

        <button
          type="button"
          onClick={() => onRespond(true, 'session')}
          className="px-3 py-1.5 rounded-[6px] text-[12px] text-[var(--text-primary)] hover:bg-[var(--bg-surface)] border border-[var(--bg-active)] transition-colors"
        >
          Pour la session
        </button>

        {!isCritical && (
          <button
            type="button"
            onClick={() => onRespond(true, 'project')}
            className="px-3 py-1.5 rounded-[6px] text-[12px] text-[var(--text-primary)] hover:bg-[var(--bg-surface)] border border-[var(--bg-active)] transition-colors"
            title="Mémoriser durablement pour ce projet (hors workspace)"
          >
            Toujours pour ce projet
          </button>
        )}
      </div>
    </div>
  );
}
