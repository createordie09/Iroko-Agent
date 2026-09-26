import React, { useState, useEffect } from 'react';
import { Copy, Check, RotateCcw, Columns, ChevronDown, ChevronRight, CheckCircle2 } from 'lucide-react';
import { tokenService } from '../../services/security/TokenService';
import { FormattedMessage } from '../../features/chat/FormattedMessage';

export interface ComparisonModelResult {
  modelId: string;
  modelName: string;
  content: string;
  thinking?: string;
  startTime: number;
  endTime: number;
  status: 'streaming' | 'completed' | 'error';
  error?: string;
}

export interface ComparisonData {
  prompt: string;
  modelA: ComparisonModelResult;
  modelB: ComparisonModelResult;
  selectedModel: 'modelA' | 'modelB' | null;
  archivedModel: 'modelA' | 'modelB' | null;
}

export interface ComparisonMessageViewProps {
  msg: any;
  conversationId?: string;
  conversationFont?: string;
  onUpdateMessage?: (updatedMsg: any) => void;
}

/**
 * ComparisonMessageView — Vue comparative de deux modèles en parallèle (Mission R4d)
 *
 * Affichage bicolonne sur grand écran (md:grid-cols-2) et empilé sur mobile (grid-cols-1).
 * Chaque colonne a son propre statut, son contenu indépendant et ses actions propres
 * (copier, régénérer cette colonne, garder cette réponse).
 */
export function ComparisonMessageView({
  msg,
  conversationId,
  conversationFont = 'sans',
  onUpdateMessage
}: ComparisonMessageViewProps) {
  const initialComparison: ComparisonData = msg.metadata?.comparison || {
    prompt: '',
    modelA: { modelId: '', modelName: 'Modèle A', content: '', startTime: 0, endTime: 0, status: 'completed' },
    modelB: { modelId: '', modelName: 'Modèle B', content: '', startTime: 0, endTime: 0, status: 'completed' },
    selectedModel: null,
    archivedModel: null
  };

  const [comparison, setComparison] = useState<ComparisonData>(initialComparison);
  const [copiedCol, setCopiedCol] = useState<'modelA' | 'modelB' | null>(null);
  const [isRegenerating, setIsRegenerating] = useState<'modelA' | 'modelB' | null>(null);
  const [isSelecting, setIsSelecting] = useState<'modelA' | 'modelB' | null>(null);
  const [showThinkingA, setShowThinkingA] = useState(false);
  const [showThinkingB, setShowThinkingB] = useState(false);

  useEffect(() => {
    if (msg.metadata?.comparison) {
      setComparison(msg.metadata.comparison);
    }
  }, [msg.metadata?.comparison]);

  const effectiveConvId = conversationId || msg.conversationId;

  const handleCopy = (col: 'modelA' | 'modelB', text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopiedCol(col);
      setTimeout(() => setCopiedCol(null), 2000);
    }).catch(() => {});
  };

  const handleSelectResponse = async (choice: 'modelA' | 'modelB') => {
    if (!msg.id || !effectiveConvId) return;
    setIsSelecting(choice);
    try {
      const res = await tokenService.fetch(
        `/api/conversations/${encodeURIComponent(effectiveConvId)}/messages/${encodeURIComponent(msg.id)}/choose-response`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ choice })
        }
      );
      if (res.ok) {
        const data = await res.json();
        if (data.message) {
          if (data.message.metadata?.comparison) {
            setComparison(data.message.metadata.comparison);
          }
          if (onUpdateMessage) {
            onUpdateMessage(data.message);
          }
        }
      }
    } catch (err) {
      console.error('Erreur lors du choix de réponse', err);
    } finally {
      setIsSelecting(null);
    }
  };

  const handleRegenerateColumn = async (column: 'modelA' | 'modelB') => {
    if (!msg.id || !effectiveConvId || isRegenerating) return;
    setIsRegenerating(column);
    try {
      const res = await tokenService.fetch(
        `/api/conversations/${encodeURIComponent(effectiveConvId)}/messages/${encodeURIComponent(msg.id)}/regenerate-column`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ column })
        }
      );
      if (res.ok) {
        const data = await res.json();
        if (data.message) {
          if (data.message.metadata?.comparison) {
            setComparison(data.message.metadata.comparison);
          }
          if (onUpdateMessage) {
            onUpdateMessage(data.message);
          }
        }
      }
    } catch (err) {
      console.error('Erreur lors de la régénération de la colonne', err);
    } finally {
      setIsRegenerating(null);
    }
  };

  const renderColumn = (colKey: 'modelA' | 'modelB', data: ComparisonModelResult) => {
    const isSelected = comparison.selectedModel === colKey;
    const isArchived = comparison.selectedModel !== null && !isSelected;
    const isThisRegenerating = isRegenerating === colKey;
    const isCopied = copiedCol === colKey;
    const duration = data.endTime && data.startTime ? ((data.endTime - data.startTime) / 1000).toFixed(1) : null;
    const isThinkingOpen = colKey === 'modelA' ? showThinkingA : showThinkingB;
    const setThinkingOpen = colKey === 'modelA' ? setShowThinkingA : setShowThinkingB;

    return (
      <div
        data-comparison-column={colKey}
        data-selected-column={isSelected ? 'true' : undefined}
        data-archived-column={isArchived ? 'true' : undefined}
        className={`flex flex-col justify-between rounded-[8px] bg-[var(--bg-surface)] p-3 border transition-colors ${
          isSelected
            ? 'border-[var(--text-secondary)] ring-1 ring-[var(--text-secondary)]'
            : 'border-[var(--border-subtle)]'
        }`}
      >
        <div className="space-y-2.5">
          {/* En-tête de colonne */}
          <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)] text-[12px]">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="font-semibold text-[var(--text-primary)] truncate max-w-[160px]" title={data.modelName}>
                {data.modelName}
              </span>
              {isSelected && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[10px] text-[var(--text-primary)] font-medium">
                  <CheckCircle2 className="w-3 h-3 text-[var(--text-primary)]" aria-hidden="true" />
                  <span>Retenue</span>
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-tertiary)] shrink-0">
              {isThisRegenerating || data.status === 'streaming' ? (
                <span className="animate-pulse">En cours…</span>
              ) : duration ? (
                <span>{duration}{'\u00A0'}s</span>
              ) : null}
            </div>
          </div>

          {/* Réflexion dépliable */}
          {data.thinking && (
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setThinkingOpen(!isThinkingOpen)}
                className="flex items-center gap-1 text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer tap-target-24"
                aria-expanded={isThinkingOpen}
              >
                <span>Réflexion</span>
                {isThinkingOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              </button>
              {isThinkingOpen && (
                <div className="mt-1 pl-2 border-l border-[var(--border-subtle)] text-[12px] text-[var(--text-secondary)] font-sans whitespace-pre-wrap max-h-40 overflow-y-auto claude-scrollbar">
                  {data.thinking}
                </div>
              )}
            </div>
          )}

          {/* Contenu Markdown */}
          <div
            className={`text-[14px] text-[var(--text-primary)] leading-[1.5] ${
              conversationFont === 'serif' ? 'font-serif' : 'font-sans'
            }`}
          >
            {data.error ? (
              <div className="p-2 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[12px] text-[var(--text-secondary)]">
                {data.error}
              </div>
            ) : data.content ? (
              <FormattedMessage content={data.content} />
            ) : (
              <span className="text-[12px] text-[var(--text-tertiary)] italic">En attente de réponse…</span>
            )}
          </div>
        </div>

        {/* Pied d'actions autonome par colonne */}
        <div className="mt-3 pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between gap-1 select-none">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => handleCopy(colKey, data.content)}
              disabled={!data.content}
              className="p-1.5 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer tap-target-24 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Copier cette réponse"
              aria-label={`Copier la réponse de ${data.modelName}`}
            >
              {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            </button>

            <button
              type="button"
              onClick={() => handleRegenerateColumn(colKey)}
              disabled={isThisRegenerating}
              className="p-1.5 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer tap-target-24 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Régénérer cette colonne uniquement"
              aria-label={`Régénérer la colonne de ${data.modelName}`}
            >
              <RotateCcw className={`w-3.5 h-3.5 ${isThisRegenerating ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div>
            {isSelected ? (
              <span className="text-[11px] text-[var(--text-secondary)] font-medium px-2 py-1">
                Réponse active
              </span>
            ) : (
              <button
                type="button"
                onClick={() => handleSelectResponse(colKey)}
                disabled={isSelecting !== null || !data.content}
                className="tap-target-24 inline-flex items-center gap-1 px-2.5 py-1 rounded-[6px] bg-[var(--bg-app)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] text-[12px] text-[var(--text-primary)] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                title={isArchived ? "Choisir cette réponse à la place de l'autre" : "Garder cette réponse pour poursuivre la discussion"}
                aria-label={`Garder la réponse de ${data.modelName}`}
              >
                <Check className="w-3 h-3 text-[var(--text-secondary)]" aria-hidden="true" />
                <span>{isArchived ? 'Choisir à la place' : 'Garder cette réponse'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      data-model-comparison-view="true"
      className="w-full my-2 space-y-2 select-text"
    >
      <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-tertiary)] select-none">
        <Columns className="w-3.5 h-3.5" aria-hidden="true" />
        <span>Comparaison de deux modèles</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
        {renderColumn('modelA', comparison.modelA)}
        {renderColumn('modelB', comparison.modelB)}
      </div>
    </div>
  );
}
