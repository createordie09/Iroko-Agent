import React, { useState } from 'react';
import { ChevronRight, ChevronDown, Check, X, Loader2, Circle } from 'lucide-react';
import type { MessagePart } from '../../../server/types/messageParts';
import { FormattedMessage } from './FormattedMessage';
import { ArtifactCard } from './ArtifactCard';
import { ToolStep } from './ToolStep';

export interface MessagePartsProps {
  parts: MessagePart[];
  conversationFont: string;
  /** Réponse en cours : le dernier bloc est encore alimenté */
  isStreaming?: boolean;
  onOpenArtifact?: (artifactId: string) => void;
  onRegenerateImage?: (prompt: string) => void;
  onReuseArtifactAsAttachment?: (artifact: any) => void;
}

function formatThinkingDuration(ms?: number): string {
  if (ms === undefined) return '';
  const seconds = Math.max(1, Math.round(ms / 1000));
  return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

function ThinkingPart({ text, active, durationMs }: { key?: React.Key; text: string; active: boolean; durationMs?: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        aria-expanded={open}
        className="flex items-center gap-1.5 text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors select-none cursor-pointer"
      >
        <span className={active ? 'animate-pulse' : ''}>{active ? 'Réflexion en cours…' : durationMs !== undefined ? `Réflexion · ${formatThinkingDuration(durationMs)}` : 'Réflexion'}</span>
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
      </button>
      {open && (
        <div className="mt-2 pl-3 border-l border-[var(--border-subtle)] text-[13px] text-[var(--text-secondary)] leading-relaxed font-sans whitespace-pre-wrap max-h-60 overflow-y-auto claude-scrollbar">
          {text}
        </div>
      )}
    </div>
  );
}

const PERMISSION_STATUS_LABEL: Record<string, string> = {
  pending: 'En attente de votre réponse',
  approved: 'Autorisée',
  denied: 'Refusée',
  expired: 'Expirée, refusée par défaut'
};

function PermissionPart({ part }: { key?: React.Key; part: Extract<MessagePart, { type: 'permission' }> }) {
  return (
    <div className="border-l border-[var(--border-modal)] pl-3 py-0.5 text-[12.5px]" data-permission-part="true" data-permission-status={part.status}>
      <div className="flex items-center gap-2 text-[var(--text-secondary)]">
        {part.status === 'approved' ? <Check className="w-3 h-3 shrink-0" aria-hidden="true" />
          : part.status === 'pending' ? <Loader2 className="w-3 h-3 shrink-0 animate-spin" aria-hidden="true" />
          : <X className="w-3 h-3 shrink-0" aria-hidden="true" />}
        <span className="text-[var(--text-primary)]">Autorisation</span>
        <span>{PERMISSION_STATUS_LABEL[part.status]}</span>
      </div>
      <div className="mt-0.5 text-[var(--text-secondary)]">{part.description}</div>
      {part.target && <div className="font-mono text-[12px] text-[var(--text-secondary)] truncate">{part.target}</div>}
    </div>
  );
}

const MARKER_LABEL: Record<string, string> = {
  cancelled: 'Réponse arrêtée par vous',
  interrupted: 'Réponse interrompue',
  failed: 'La tâche a échoué'
};

function EndMarkerPart({ part }: { key?: React.Key; part: Extract<MessagePart, { type: 'marker' }> }) {
  return (
    <div className="flex items-center gap-3 select-none" data-end-marker={part.kind} role="separator" aria-label={MARKER_LABEL[part.kind]}>
      <div className="h-[1px] bg-[var(--border-modal)] flex-1" />
      <span className="text-[12px] text-[var(--text-secondary)] text-center">
        {MARKER_LABEL[part.kind]}
        {part.detail ? <span className="text-[var(--text-tertiary)]"> · {part.detail}</span> : null}
      </span>
      <div className="h-[1px] bg-[var(--border-modal)] flex-1" />
    </div>
  );
}

function PlanPart({ steps }: { key?: React.Key; steps: Array<{ id: string; title: string; status: string }> }) {
  const done = steps.filter(step => step.status === 'completed').length;
  return (
    <div className="border-l border-[var(--border-modal)] pl-3 py-0.5" data-plan-part="true">
      <div className="text-[12px] text-[var(--text-tertiary)] mb-1">Plan · {done} sur {steps.length}</div>
      <ul className="space-y-1">
        {steps.map(step => (
          <li key={step.id} className="flex items-start gap-2 text-[13px]" data-plan-status={step.status}>
            <span className="mt-[3px] shrink-0 text-[var(--text-secondary)]" aria-hidden="true">
              {step.status === 'completed' ? <Check className="w-3 h-3" />
                : step.status === 'failed' ? <X className="w-3 h-3" />
                : step.status === 'in_progress' ? <Loader2 className="w-3 h-3 animate-spin" />
                : <Circle className="w-3 h-3" />}
            </span>
            <span className={step.status === 'completed' ? 'text-[var(--text-secondary)] line-through' : 'text-[var(--text-primary)]'}>
              {step.title}
            </span>
            <span className="sr-only">
              {step.status === 'completed' ? 'terminée' : step.status === 'failed' ? 'échec' : step.status === 'in_progress' ? 'en cours' : 'à faire'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Chronologie d'une réponse : réflexion, texte, étapes d'outils et artéfacts dans leur ordre réel */
export function MessageParts({
  parts, conversationFont, isStreaming, onOpenArtifact, onRegenerateImage, onReuseArtifactAsAttachment
}: MessagePartsProps) {
  const lastIndex = parts.length - 1;
  return (
    <div className="space-y-3" data-message-parts="true">
      {parts.map((part, i) => {
        const isLast = i === lastIndex;
        switch (part.type) {
          case 'thinking':
            return <ThinkingPart key={part.id} text={part.text} active={Boolean(isStreaming) && isLast && part.durationMs === undefined} durationMs={part.durationMs} />;
          case 'text':
            return (
              <div
                key={part.id}
                className={`text-[15px] sm:text-[15.5px] text-[var(--text-primary)] leading-[1.5] ${
                  conversationFont === 'serif' ? 'font-serif' : 'font-sans'
                }`}
                style={{
                  fontFamily: conversationFont === 'serif' ? 'var(--font-serif)' : 'var(--font-sans)',
                  letterSpacing: '-0.005em'
                }}
              >
                <FormattedMessage content={part.text} isStreaming={Boolean(isStreaming) && isLast} />
              </div>
            );
          case 'tool':
            return <ToolStep key={part.id} part={part} />;
          case 'marker':
            return <EndMarkerPart key={part.id} part={part} />;
          case 'permission':
            return <PermissionPart key={part.id} part={part} />;
          case 'plan':
            return <PlanPart key={part.id} steps={part.steps} />;
          case 'artifact':
            return (
              <ArtifactCard
                key={part.id}
                artifact={{
                  id: part.artifactId,
                  name: part.name,
                  title: part.title || part.name,
                  mimeType: part.mimeType,
                  currentVersion: part.version,
                  version: part.version,
                  size: part.size,
                  metadata: part.metadata
                } as any}
                onOpen={onOpenArtifact}
                onRegenerate={onRegenerateImage}
                onReuseAsAttachment={onReuseArtifactAsAttachment}
              />
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
