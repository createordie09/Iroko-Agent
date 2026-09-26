import React, { useState } from 'react';
import { 
  ChevronRight, ChevronDown, Copy, Check, RotateCcw, 
  Trash2, Edit2, Paperclip, Play
} from 'lucide-react';
import { AttachmentPublicInfo } from '../../services/attachments/AttachmentService';
import { FormattedMessage } from './FormattedMessage';
import { ArtifactCard } from './ArtifactCard';
import { MessageSources } from './MessageSources';

export interface ChatMessageItemProps {
  key?: any;
  msg: any;
  index: number;
  isOptimizedVisibility: boolean;
  conversationFont: string;
  copiedIndex: number | null;
  chatStatus: string;
  isCheckingImpact: boolean;
  thinkingLogs?: string[];
  isThinkingOpen?: boolean;
  onToggleThinking?: () => void;
  onCopy: (content: string, index: number) => void;
  onStartEdit: (msg: any, index: number) => void;
  onDeleteConfirm: (msg: any, index: number) => void;
  onRegenerateFrom: (index: number) => void;
  onOpenAttachmentPreview: (attId: string) => void;
  onOpenArtifact: (artifactId: string) => void;
  onRegenerateImage: (prompt: string) => void;
  onReuseArtifactAsAttachment: (artifact: any) => void;
  onContinue?: (msg: any, index: number) => void;
  attachmentsMap: Record<string, AttachmentPublicInfo>;
}

export function ChatMessageItem({
  msg,
  index,
  isOptimizedVisibility,
  conversationFont,
  copiedIndex,
  chatStatus,
  isCheckingImpact,
  thinkingLogs,
  isThinkingOpen,
  onToggleThinking,
  onCopy,
  onStartEdit,
  onDeleteConfirm,
  onRegenerateFrom,
  onOpenAttachmentPreview,
  onOpenArtifact,
  onRegenerateImage,
  onReuseArtifactAsAttachment,
  onContinue,
  attachmentsMap
}: ChatMessageItemProps) {
  const [isLocalThinkingOpen, setIsLocalThinkingOpen] = useState(false);
  const messageThinking = msg.thinking || msg.metadata?.thinking || (msg.thinkingLogs ? (Array.isArray(msg.thinkingLogs) ? msg.thinkingLogs.join('') : msg.thinkingLogs) : undefined);

  if (msg.role === 'system') {
    return (
      <div className="flex items-center justify-center my-4 select-none" data-context-summarized="true">
        <div className="h-[1px] bg-[var(--border-modal)] flex-1 max-w-[120px]" />
        <span className="px-3 text-[12px] text-[var(--text-secondary)] font-sans">
          {msg.content || 'Contexte résumé'}
        </span>
        <div className="h-[1px] bg-[var(--border-modal)] flex-1 max-w-[120px]" />
      </div>
    );
  }

  const isUser = msg.role === 'user';
  const headingId = `msg-heading-${msg.id || index}`;

  return (
    <article
      aria-labelledby={headingId}
      id={`msg-${msg.id || index}`}
      data-message-id={msg.id || index}
      className={`w-full ${isOptimizedVisibility ? 'message-content-visibility' : ''}`}
    >
      <h3 id={headingId} className="sr-only">
        {isUser ? 'Vous avez dit\u00A0:' : 'Iroko a dit\u00A0:'}
      </h3>
      {isUser ? (
        /* Message utilisateur : bloc gris discret arrondi à droite (Capture 4) */
        <div className="flex flex-col items-end mb-6 space-y-1.5 group">
          <div
            data-user-bubble="true"
            className="max-w-[85%] bg-[var(--bg-user-bubble)] text-[var(--text-primary)] text-[14px] leading-[1.55] px-4 py-3"
            style={{
              backgroundColor: 'var(--border-subtle)',
              borderRadius: '14px'
            }}
          >
            {msg.content}
          </div>

          {/* Actions au survol sous le message utilisateur (Copier, Modifier, Supprimer) [À VALIDER] */}
          <div
            data-message-actions="true"
            className="flex items-center gap-1.5 pt-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity select-none"
          >
            <button
              type="button"
              onClick={() => onCopy(msg.content, index)}
              className="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] transition-colors cursor-pointer"
              title="Copier"
              aria-label="Copier le message"
            >
              {copiedIndex === index ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
            <button
              type="button"
              onClick={() => onStartEdit(msg, index)}
              disabled={chatStatus === 'loading' || isCheckingImpact}
              className="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              title="Modifier et renvoyer"
              aria-label="Modifier et renvoyer le message"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onDeleteConfirm(msg, index)}
              disabled={chatStatus === 'loading'}
              className="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              title="Supprimer"
              aria-label="Supprimer le message"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Pièces jointes rattachées au message utilisateur (§ Mission M2) */}
          {msg.attachments && msg.attachments.length > 0 && (
            <div className="flex flex-wrap justify-end gap-1.5 max-w-[85%]">
              {msg.attachments.map((attId: string) => (
                <button
                  key={attId}
                  type="button"
                  onClick={() => onOpenAttachmentPreview(attId)}
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-composer)] rounded-[6px] text-[12px] text-[var(--text-primary)] transition-colors cursor-pointer"
                  title="Cliquer pour afficher l'aperçu dans l'inspecteur"
                >
                  <Paperclip className="w-3 h-3 text-[var(--text-secondary)]" />
                  <span className="truncate max-w-[140px]">
                    {attachmentsMap[attId]?.name || 'Pièce jointe'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Réponse de l'assistant : texte directement sur le fond (Capture 4) */
        <div className="space-y-3 group">
          {/* ── Bloc de réflexion dépliable propre par message ── */}
          {messageThinking && (
            <div className="mb-3">
              <button
                type="button"
                onClick={() => setIsLocalThinkingOpen(prev => !prev)}
                className="flex items-center gap-1.5 text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors select-none cursor-pointer"
                aria-expanded={isLocalThinkingOpen}
              >
                <span>Réflexion</span>
                {isLocalThinkingOpen ? (
                  <ChevronDown className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                )}
              </button>

              {isLocalThinkingOpen && (
                <div
                  className="mt-2 pl-3 border-l border-[var(--border-subtle)] text-[13px] text-[var(--text-secondary)] leading-relaxed font-sans whitespace-pre-wrap max-h-60 overflow-y-auto claude-scrollbar animate-in fade-in duration-150"
                >
                  {messageThinking}
                </div>
              )}
            </div>
          )}

          {/* Texte principal de la réponse (Police serif ou sans selon réglage) */}
          <div
            className={`text-[15px] sm:text-[15.5px] text-[var(--text-primary)] leading-[1.5] ${
              conversationFont === 'serif' ? 'font-serif' : 'font-sans'
            }`}
            style={{
              fontFamily: conversationFont === 'serif' ? 'var(--font-serif)' : 'var(--font-sans)',
              letterSpacing: '-0.005em'
            }}
          >
            <FormattedMessage content={msg.content} />
          </div>

          {/* Artéfacts générés dans cette réponse */}
          {msg.metadata?.artifacts && msg.metadata.artifacts.length > 0 && (
            <div className="flex flex-col gap-2 pt-2">
              {msg.metadata.artifacts.map((art: any) => (
                <ArtifactCard
                  key={art.id}
                  artifact={art}
                  onOpen={onOpenArtifact}
                  onRegenerate={onRegenerateImage}
                  onReuseAsAttachment={onReuseArtifactAsAttachment}
                />
              ))}
            </div>
          )}

          {/* Sources de recherche citées (Mission N4) [VALIDÉ] */}
          {msg.metadata?.sources && msg.metadata.sources.length > 0 && (
            <MessageSources sources={msg.metadata.sources} />
          )}

          {/* Signalement sobre de message interrompu avec bouton Continuer (Mission R3c) [À VALIDER] */}
          {msg.metadata?.interrupted && (
            <div className="flex items-center gap-2 pt-1.5 select-none" data-interrupted-indicator="true">
              <span className="px-1.5 py-0.5 rounded-[var(--radius-button)] bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[11px] text-[var(--text-tertiary)] font-sans">
                Interrompu
              </span>
              {onContinue && (
                <button
                  type="button"
                  onClick={() => onContinue(msg, index)}
                  disabled={chatStatus === 'loading'}
                  className="tap-target-24 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[var(--radius-button)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] text-[12px] text-[var(--text-primary)] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Continuer la réponse à partir de ce point"
                  aria-label="Continuer la génération"
                >
                  <Play className="w-3 h-3 text-[var(--text-secondary)]" />
                  <span>Continuer</span>
                </button>
              )}
            </div>
          )}

          {/* Actions au survol sous la réponse (Copier, Régénérer, Supprimer) [À VALIDER] */}
          <div
            data-message-actions="true"
            className="flex items-center gap-1.5 pt-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity select-none"
          >
            <button
              type="button"
              onClick={() => onCopy(msg.content, index)}
              className="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] transition-colors cursor-pointer"
              title="Copier"
              aria-label="Copier la réponse"
            >
              {copiedIndex === index ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
            <button
              type="button"
              onClick={() => onRegenerateFrom(index)}
              disabled={chatStatus === 'loading'}
              className="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              title="Régénérer la réponse"
              aria-label="Régénérer la réponse"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onDeleteConfirm(msg, index)}
              disabled={chatStatus === 'loading'}
              className="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              title="Supprimer ce message"
              aria-label="Supprimer la réponse"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
