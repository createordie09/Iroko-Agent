import React from 'react';
import { ShieldAlert, ShieldCheck, X } from 'lucide-react';
import { PermissionRequest } from '../../../server/types/events';

export interface PermissionPromptProps {
  request: PermissionRequest;
  onRespond: (approved: boolean, scope: 'once' | 'session' | 'workspace') => void;
}

export function PermissionPrompt({ request, onRespond }: PermissionPromptProps) {
  return (
    <div className="fixed inset-0 bg-black/70 z-[200] flex items-center justify-center p-4">
      <div
        className="bg-[#111111] border border-[#1f1f1f] max-w-md w-full overflow-hidden flex flex-col"
        style={{ boxShadow: 'none' }}
      >
        {/* En-tête */}
        <div className="flex items-start justify-between gap-4 px-4 py-3 border-b border-[#1f1f1f]">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-[#8a8a8a]" />
            <h3 className="text-[14px] font-semibold text-white">Autorisation requise</h3>
            <span className="text-[12px] text-[#8a8a8a] font-mono">{request.level}</span>
          </div>
          <button
            type="button"
            onClick={() => onRespond(false, 'once')}
            className="btn-ghost px-1 py-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Corps */}
        <div className="px-4 py-3 space-y-3">
          <p className="text-[13px] text-[#8a8a8a]">
            Outil : <span className="font-mono text-white">{request.tool}</span>
          </p>
          <p className="text-[14px] text-white leading-relaxed">{request.description}</p>

          {request.details && (
            <div className="bg-[#0a0a0a] border border-[#1f1f1f] p-3 font-mono text-[12px] text-[#8a8a8a] overflow-x-auto">
              {request.details.command && (
                <div><span className="text-[#555555]">$ </span><span className="text-white">{request.details.command}</span></div>
              )}
              {request.details.path && (
                <div><span className="text-[#555555]">Cible : </span><span className="text-white">{request.details.path}</span></div>
              )}
            </div>
          )}

          <p className="text-[12px] text-[#555555]">
            L'agent demande votre accord avant d'effectuer cette modification.
          </p>
        </div>

        {/* Actions */}
        <div className="px-4 py-3 border-t border-[#1f1f1f] flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => onRespond(false, 'once')}
            className="btn-ghost text-[13px]"
          >
            Refuser
          </button>
          <button
            type="button"
            onClick={() => onRespond(true, 'once')}
            className="send-btn"
            style={{ width: 'auto', padding: '0 12px', fontSize: 13 }}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span className="ml-1.5">Autoriser une fois</span>
          </button>
          <button
            type="button"
            onClick={() => onRespond(true, 'session')}
            className="btn-ghost text-[13px]"
          >
            Pour la session
          </button>
        </div>
      </div>
    </div>
  );
}
