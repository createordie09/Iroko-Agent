import React, { useState } from 'react';
import { ChevronRight, ChevronDown, Check, X, Loader2 } from 'lucide-react';
import type { MessagePart } from '../../../server/types/messageParts';

export type ToolPart = Extract<MessagePart, { type: 'tool' }>;

const VERBS: Record<string, { running: string; done: string }> = {
  web_search: { running: 'Recherche en cours', done: 'Recherche effectuée' },
  read_file: { running: 'Lecture en cours', done: 'Lecture' },
  write_file: { running: 'Écriture en cours', done: 'Écriture' },
  edit_file: { running: 'Modification en cours', done: 'Modification' },
  execute_command: { running: 'Exécution en cours', done: 'Exécution' },
  verify_project: { running: 'Vérification en cours', done: 'Vérification' },
  create_artifact: { running: 'Création du document en cours', done: 'Document créé' },
  update_artifact: { running: 'Mise à jour du document en cours', done: 'Document mis à jour' },
  request_code_mode: { running: 'Demande du mode Code', done: 'Mode Code proposé' }
};

function toolLabel(part: ToolPart): string {
  const verbs = VERBS[part.tool];
  if (!verbs) return part.tool;
  return part.status === 'running' ? verbs.running : verbs.done;
}

function toolSubject(part: ToolPart): string {
  const input = (part.input && typeof part.input === 'object' ? part.input : {}) as Record<string, unknown>;
  const candidate = input.query ?? input.path ?? input.file_path ?? input.command ?? input.title ?? input.name ?? input.url;
  return typeof candidate === 'string' ? candidate : '';
}

function stringify(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function formatDuration(ms?: number): string {
  if (ms === undefined) return '';
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
}

export function ToolStep({ part }: { key?: React.Key; part: ToolPart }) {
  const [open, setOpen] = useState(false);
  const subject = toolSubject(part);
  const hasDetails = part.input !== undefined || part.result !== undefined || Boolean(part.error);

  return (
    <div className="border-l border-[var(--border-modal)] pl-3 py-0.5" data-tool-step={part.tool} data-tool-status={part.status}>
      <button
        type="button"
        onClick={() => hasDetails && setOpen(prev => !prev)}
        aria-expanded={open}
        className="flex items-center gap-2 text-[12.5px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer select-none max-w-full text-left"
      >
        {part.status === 'running' ? (
          <Loader2 className="w-3 h-3 shrink-0 animate-spin" aria-hidden="true" />
        ) : part.status === 'success' ? (
          <Check className="w-3 h-3 shrink-0" aria-hidden="true" />
        ) : (
          <X className="w-3 h-3 shrink-0" aria-hidden="true" />
        )}
        <span className="text-[var(--text-primary)] shrink-0">{toolLabel(part)}</span>
        {subject && <span className="font-mono truncate min-w-0">{subject}</span>}
        {part.status !== 'running' && part.durationMs !== undefined && (
          <span className="text-[11px] text-[var(--text-tertiary)] shrink-0">{formatDuration(part.durationMs)}</span>
        )}
        {hasDetails && (open ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronRight className="w-3 h-3 shrink-0" />)}
      </button>
      {open && (
        <div className="mt-1.5 space-y-1.5 text-[12px] text-[var(--text-secondary)]">
          {part.input !== undefined && (
            <div>
              <div className="text-[11px] text-[var(--text-tertiary)]">Entrée</div>
              <pre className="font-mono whitespace-pre-wrap break-words max-h-48 overflow-y-auto claude-scrollbar">{stringify(part.input)}</pre>
            </div>
          )}
          {part.error ? (
            <div>
              <div className="text-[11px] text-[var(--text-tertiary)]">Erreur</div>
              <pre className="font-mono whitespace-pre-wrap break-words max-h-48 overflow-y-auto claude-scrollbar">{part.error}</pre>
            </div>
          ) : (
            part.result !== undefined && (
              <div>
                <div className="text-[11px] text-[var(--text-tertiary)]">Résultat</div>
                <pre className="font-mono whitespace-pre-wrap break-words max-h-48 overflow-y-auto claude-scrollbar">{stringify(part.result)}</pre>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
