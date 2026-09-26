import React from 'react';
import { AttachmentPublicInfo } from '../../services/attachments/AttachmentService';
import { ChatMessageItem } from './ChatMessageItem';
import { ActiveVideoJobCard } from './ActiveVideoJobCard';
import { LiveToolExecutions } from './LiveToolExecutions';
import { PermissionPrompt } from '../agent/PermissionPrompt';
import { tokenService } from '../../services/security/TokenService';

export interface ChatMessageListProps {
  messages: any[];
  virtualizer: {
    isVirtualized: boolean;
    virtualItems: Array<{ item: any; index: number; offsetTop: number; height: number }>;
    startIndex: number;
    endIndex: number;
    totalHeight: number;
    topSpacerHeight: number;
    bottomSpacerHeight: number;
    registerItemRef: (id: string | number, node: HTMLElement | null) => void;
    scrollToIndex: (index: number, align?: 'top' | 'center' | 'bottom' | 'auto') => void;
  };
  conversationFont: string;
  copiedIndex: number | null;
  chatStatus: string;
  isCheckingImpact: boolean;
  onCopy: (content: string, index: number) => void;
  onStartEdit: (msg: any, index: number) => void;
  onDeleteConfirm: (msg: any, index: number) => void;
  onRegenerateFrom: (index: number) => void;
  onContinue: (msg: any, index: number) => void;
  onOpenAttachmentPreview: (attId: string) => void;
  onOpenArtifact: (artifactId: string) => void;
  onRegenerateImage: (prompt: string) => void;
  attachmentsMap: Record<string, AttachmentPublicInfo>;
  toolExecutions: any[];
  activeVideoJobs: any[];
  handleCancelVideoJob: (jobId: string) => void;
  pendingPermission: any;
  handlePermissionResponse: (approved: boolean, scope: 'once' | 'session' | 'project' | 'reject') => void;
}

export function ChatMessageList({
  messages,
  virtualizer,
  conversationFont,
  copiedIndex,
  chatStatus,
  isCheckingImpact,
  onCopy,
  onStartEdit,
  onDeleteConfirm,
  onRegenerateFrom,
  onContinue,
  onOpenAttachmentPreview,
  onOpenArtifact,
  onRegenerateImage,
  attachmentsMap,
  toolExecutions,
  activeVideoJobs,
  handleCancelVideoJob,
  pendingPermission,
  handlePermissionResponse
}: ChatMessageListProps) {
  if (messages.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-[13px] text-[var(--text-secondary)]">
        Aucun message dans cette discussion.
      </div>
    );
  }

  const handleReuseArtifact = async (artifact: any) => {
    try {
      const res = await tokenService.fetch(`/api/artifacts/${encodeURIComponent(artifact.id)}/download`);
      if (!res.ok) return;
      const blob = await res.blob();
      const file = new File([blob], artifact.name, { type: artifact.mimeType || blob.type || 'image/png' });
      window.dispatchEvent(new CustomEvent('iroko:add-attachment', { detail: { file } }));
    } catch (err) {
      console.error('Failed to reuse artifact as attachment', err);
    }
  };

  return (
    <>
      {/* Index accessible et moteur de recherche natif pour les messages hors écran (hidden="until-found") */}
      {virtualizer.isVirtualized && (
        <div className="sr-only" aria-hidden="false">
          {messages.map((m, i) => {
            if (i >= virtualizer.startIndex && i < virtualizer.endIndex) return null;
            const isUser = m.role === 'user';
            const headingId = `offscreen-heading-${m.id || i}`;
            return (
              <div
                key={`offscreen-${m.id || i}`}
                // @ts-ignore hidden="until-found" standard HTML5 Chromium
                hidden="until-found"
                onBeforeMatch={() => virtualizer.scrollToIndex(i)}
              >
                <article
                  id={`msg-${m.id || i}`}
                  data-message-id={m.id || i}
                  aria-labelledby={headingId}
                >
                  <h3 id={headingId}>{isUser ? 'Vous avez dit\u00A0:' : 'Iroko a dit\u00A0:'}</h3>
                  <div>{m.content}</div>
                </article>
              </div>
            );
          })}
        </div>
      )}

      {/* Espaceur supérieur virtuel */}
      {virtualizer.isVirtualized && virtualizer.topSpacerHeight > 0 && (
        <div
          style={{ height: `${virtualizer.topSpacerHeight}px` }}
          aria-hidden="true"
          className="w-full select-none transition-none"
        />
      )}

      {/* Ancre de focus supérieure pour continuité clavier (Maj+Tab) */}
      {virtualizer.isVirtualized && virtualizer.startIndex > 0 && (
        <div
          tabIndex={0}
          aria-label="Faire défiler vers les messages précédents"
          onFocus={() => virtualizer.scrollToIndex(Math.max(0, virtualizer.startIndex - 8))}
          className="sr-only"
        />
      )}

      {/* Messages actifs rendus */}
      {virtualizer.virtualItems.map(({ item: msg, index: idx }) => (
        <div
          key={msg.id || idx}
          ref={(node) => virtualizer.registerItemRef(msg.id || idx, node)}
        >
          <ChatMessageItem
            msg={msg}
            index={idx}
            isOptimizedVisibility={idx < messages.length - 6}
            conversationFont={conversationFont}
            copiedIndex={copiedIndex}
            chatStatus={chatStatus}
            isCheckingImpact={isCheckingImpact}
            onCopy={onCopy}
            onStartEdit={onStartEdit}
            onDeleteConfirm={onDeleteConfirm}
            onRegenerateFrom={onRegenerateFrom}
            onContinue={onContinue}
            onOpenAttachmentPreview={onOpenAttachmentPreview}
            onOpenArtifact={onOpenArtifact}
            onRegenerateImage={onRegenerateImage}
            onReuseArtifactAsAttachment={handleReuseArtifact}
            attachmentsMap={attachmentsMap}
          />
        </div>
      ))}

      {/* Ancre de focus inférieure pour continuité clavier (Tab) */}
      {virtualizer.isVirtualized && virtualizer.endIndex < messages.length && (
        <div
          tabIndex={0}
          aria-label="Faire défiler vers les messages suivants"
          onFocus={() => virtualizer.scrollToIndex(Math.min(messages.length - 1, virtualizer.endIndex + 8))}
          className="sr-only"
        />
      )}

      {/* Espaceur inférieur virtuel */}
      {virtualizer.isVirtualized && virtualizer.bottomSpacerHeight > 0 && (
        <div
          style={{ height: `${virtualizer.bottomSpacerHeight}px` }}
          aria-hidden="true"
          className="w-full select-none transition-none"
        />
      )}

      {/* Outils en cours d'exécution */}
      <LiveToolExecutions executions={toolExecutions} />

      {/* Tâches vidéo en cours */}
      {activeVideoJobs.map(job => (
        <ActiveVideoJobCard
          key={job.id}
          job={job}
          onCancel={handleCancelVideoJob}
        />
      ))}

      {/* Demande de permission interactive */}
      {pendingPermission && (
        <div className="w-full my-3">
          <PermissionPrompt
            request={pendingPermission}
            onRespond={handlePermissionResponse}
          />
        </div>
      )}
    </>
  );
}
