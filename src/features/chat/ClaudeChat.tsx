import React, { useRef, useEffect, useState, useMemo } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { ClaudeComposer } from '../../components/composer/ClaudeComposer';
import { agentClient } from '../../lib/agent-client';
import { formatModelLabel } from '../../lib/models';
import { PermissionPrompt } from '../agent/PermissionPrompt';
import { tokenService } from '../../services/security/TokenService';
import { attachmentService, AttachmentPreviewResult, AttachmentPublicInfo } from '../../services/attachments/AttachmentService';
import { useStreamBuffer } from '../../hooks/useStreamBuffer';
import { useStickToBottom } from '../../hooks/useStickToBottom';
import { useScrollRestoration } from '../../hooks/useScrollRestoration';
import { useChatAgentEvents } from '../../hooks/chat/useChatAgentEvents';
import { useChatMessageActions } from '../../hooks/chat/useChatMessageActions';
import { FormattedMessage } from './FormattedMessage';
import { ChatMessageItem } from './ChatMessageItem';
import { ChatInspectorPanel, InspectorTabType } from './ChatInspectorPanel';
import { ActiveVideoJobCard } from './ActiveVideoJobCard';
import { LiveToolExecutions } from './LiveToolExecutions';
import { DeleteMessageModal } from './modals/DeleteMessageModal';
import { EditMessageModal } from './modals/EditMessageModal';

export function ClaudeChat() {
  const {
    messages, setMessages, chatStatus, setChatStatus,
    conversationFont, activeModel, history,
    notificationsEnabled, composerMode, animations
  } = useApp();

  const conversationId = history[0]?.id || 'default_conversation';

  const {
    streamContent: currentAssistantStream,
    appendDelta: appendStreamDelta,
    flushImmediately: flushStreamImmediately,
    reset: resetStreamBuffer
  } = useStreamBuffer();

  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<InspectorTabType>(
    composerMode === 'code' ? 'diff' : 'artifacts'
  );
  const [selectedAttachmentId, setSelectedAttachmentId] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<AttachmentPreviewResult | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [attachmentsMap, setAttachmentsMap] = useState<Record<string, AttachmentPublicInfo>>({});
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);
  const [workspaceMeta, setWorkspaceMeta] = useState<any>(null);

  const {
    currentThinking,
    thinkingLogs, setThinkingLogs, isThinkingOpen, setIsThinkingOpen,
    planSteps, contextUsage, toolExecutions, setToolExecutions,
    artifacts, loadArtifacts, activeVideoJobs, handleCancelVideoJob,
    pendingPermission, setPendingPermission, changedFiles,
    errorMessage, setErrorMessage, ariaLiveSentence
  } = useChatAgentEvents({
    conversationId, notificationsEnabled, currentAssistantStream,
    appendStreamDelta, flushStreamImmediately, resetStreamBuffer,
    setMessages, setChatStatus, setInspectorOpen
  });

  const {
    copiedIndex, deleteConfirmMessage, setDeleteConfirmMessage,
    isDeletingMessage, editModalData, setEditModalData, isCheckingImpact,
    handleSendMessage, handleRetry, handleCopy, handleDeleteMessage,
    handleStartEdit, handleConfirmEdit, handleRegenerateFrom, handleContinue
  } = useChatMessageActions({
    conversationId, activeModel, composerMode, messages, setMessages,
    setChatStatus, resetStreamBuffer, setThinkingLogs, setToolExecutions,
    setErrorMessage, loadArtifacts, setAttachmentsMap
  });

  // Onglets disponibles selon le mode et le contenu réel (Mission M8.1)
  const availableTabs = useMemo(() => {
    const tabs: Array<{ id: InspectorTabType; label: string }> = [];

    if (selectedAttachmentId || previewData) {
      tabs.push({ id: 'preview', label: 'Aperçu' });
    }

    if (composerMode === 'code') {
      if (changedFiles.length > 0) {
        tabs.push({ id: 'diff', label: `Modifications (${changedFiles.length})` });
      }
      if (planSteps.length > 0) {
        tabs.push({ id: 'plan', label: `Plan (${planSteps.length})` });
      }
      if (artifacts.length > 0) {
        tabs.push({ id: 'artifacts', label: `Artéfacts (${artifacts.length})` });
      }
      if (toolExecutions.some(te => te.tool === 'execute_command')) {
        tabs.push({ id: 'terminal', label: 'Terminal' });
      }
      if (toolExecutions.some(te => te.tool === 'verify_project' || te.input?.command?.includes('test'))) {
        tabs.push({ id: 'tests', label: 'Tests' });
      }
      if (tabs.length === 0) {
        tabs.push({ id: 'artifacts', label: 'Artéfacts' });
      }
    } else {
      tabs.push({
        id: 'artifacts',
        label: artifacts.length > 0 ? `Artéfacts (${artifacts.length})` : 'Artéfacts'
      });
    }

    return tabs;
  }, [composerMode, selectedAttachmentId, previewData, changedFiles.length, planSteps.length, artifacts.length, toolExecutions]);

  useEffect(() => {
    if (availableTabs.length > 0 && !availableTabs.some(t => t.id === inspectorTab)) {
      setInspectorTab(availableTabs[0].id);
    }
  }, [availableTabs, inspectorTab]);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const { scrollToBottom, showScrollButton } = useStickToBottom(scrollContainerRef, {
    contentDependencies: [messages, currentAssistantStream],
    isStreaming: chatStatus === 'loading',
    animations
  });

  useScrollRestoration(scrollContainerRef, {
    conversationId,
    messagesCount: messages.length,
    isStreaming: chatStatus === 'loading'
  });

  useEffect(() => {
    tokenService.fetch('/workspace')
      .then(res => res.json())
      .then(data => setWorkspaceMeta(data))
      .catch(() => {});
  }, []);

  const handlePermissionResponse = (approved: boolean, scope: 'once' | 'session' | 'project' | 'reject') => {
    if (pendingPermission) {
      agentClient.respondPermission(pendingPermission.id, approved, scope);
      setPendingPermission(null);
    }
  };

  useEffect(() => {
    if (!selectedAttachmentId) {
      setPreviewData(null);
      return;
    }
    let isMounted = true;
    setIsPreviewLoading(true);
    attachmentService.getAttachmentPreview(selectedAttachmentId)
      .then(res => {
        if (isMounted) {
          setPreviewData(res);
          setIsPreviewLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setIsPreviewLoading(false);
        }
      });
    return () => { isMounted = false; };
  }, [selectedAttachmentId]);

  return (
    <div className="flex-1 h-full w-full flex overflow-hidden relative bg-[var(--bg-app)]">
      <div aria-live="polite" aria-atomic="false" className="sr-only">
        {ariaLiveSentence}
      </div>
      
      <div className="flex-1 h-full flex flex-col min-w-0 overflow-hidden relative">
        <div
          ref={scrollContainerRef}
          className="flex-1 min-h-0 overflow-y-auto claude-scrollbar px-4 sm:px-6 py-4"
        >
          <div className="max-w-[720px] mx-auto space-y-6 pb-28 pt-2">
            {messages.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-[13px] text-[var(--text-secondary)]">
                Aucun message dans cette discussion.
              </div>
            ) : (
              messages.map((msg, idx) => (
                <ChatMessageItem
                  key={msg.id || idx}
                  msg={msg}
                  index={idx}
                  isOptimizedVisibility={idx < messages.length - 6}
                  conversationFont={conversationFont}
                  copiedIndex={copiedIndex}
                  chatStatus={chatStatus}
                  isCheckingImpact={isCheckingImpact}
                  onCopy={handleCopy}
                  onStartEdit={handleStartEdit}
                  onDeleteConfirm={(m, i) => setDeleteConfirmMessage({ message: m, index: i })}
                  onRegenerateFrom={handleRegenerateFrom}
                  onContinue={handleContinue}
                  onOpenAttachmentPreview={(attId) => {
                    setSelectedAttachmentId(attId);
                    setInspectorTab('preview');
                    setInspectorOpen(true);
                  }}
                  onOpenArtifact={(artId) => {
                    setSelectedArtifactId(artId);
                    setInspectorTab('artifacts');
                    setInspectorOpen(true);
                  }}
                  onRegenerateImage={(prompt) => {
                    handleSendMessage(`Régénère l'image suivante\u00A0: ${prompt}`);
                  }}
                  onReuseArtifactAsAttachment={async (artifact) => {
                    try {
                      const res = await tokenService.fetch(`/api/artifacts/${encodeURIComponent(artifact.id)}/download`);
                      if (!res.ok) return;
                      const blob = await res.blob();
                      const file = new File([blob], artifact.name, { type: artifact.mimeType || blob.type || 'image/png' });
                      window.dispatchEvent(new CustomEvent('iroko:add-attachment', { detail: { file } }));
                    } catch (err) {
                      console.error('Failed to reuse artifact as attachment', err);
                    }
                  }}
                  attachmentsMap={attachmentsMap}
                />
              ))
            )}

            <LiveToolExecutions executions={toolExecutions} />

            {activeVideoJobs.map(job => (
              <ActiveVideoJobCard
                key={job.id}
                job={job}
                onCancel={handleCancelVideoJob}
              />
            ))}

            {pendingPermission && (
              <div className="w-full my-3">
                <PermissionPrompt
                  request={pendingPermission}
                  onRespond={handlePermissionResponse}
                />
              </div>
            )}

            {chatStatus === 'loading' && (
              <article aria-labelledby="assistant-stream-heading" className="space-y-3">
                <h3 id="assistant-stream-heading" className="sr-only">Iroko a dit{'\u00A0'}:</h3>
                {currentThinking ? (
                  <div className="mb-2">
                    <button
                      type="button"
                      onClick={() => setIsThinkingOpen(!isThinkingOpen)}
                      className="flex items-center gap-1.5 text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors select-none cursor-pointer"
                      aria-expanded={isThinkingOpen}
                    >
                      <span className={!currentAssistantStream ? "animate-pulse" : ""}>
                        {!currentAssistantStream ? "Réflexion en cours…" : "Réflexion"}
                      </span>
                      {isThinkingOpen ? (
                        <ChevronDown className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                      )}
                    </button>

                    {isThinkingOpen && (
                      <div
                        className="mt-2 pl-3 border-l border-[var(--border-subtle)] text-[13px] text-[var(--text-secondary)] leading-relaxed font-sans whitespace-pre-wrap max-h-60 overflow-y-auto claude-scrollbar animate-in fade-in duration-150"
                      >
                        {currentThinking}
                      </div>
                    )}
                  </div>
                ) : (
                  !currentAssistantStream && (
                    <div className="flex items-center gap-2 text-[13px] text-[var(--text-secondary)] animate-pulse">
                      <span>Réflexion en cours…</span>
                    </div>
                  )
                )}
                {currentAssistantStream && (
                  <div
                    className={`text-[15px] sm:text-[15.5px] text-[var(--text-primary)] leading-[1.5] ${
                      conversationFont === 'serif' ? 'font-serif' : 'font-sans'
                    }`}
                    style={{
                      fontFamily: conversationFont === 'serif' ? 'var(--font-serif)' : 'var(--font-sans)',
                      letterSpacing: '-0.005em'
                    }}
                  >
                    <FormattedMessage content={currentAssistantStream} isStreaming={true} />
                  </div>
                )}
              </article>
            )}

            {chatStatus === 'error' && (
              <div className="p-3 rounded-[8px] bg-[var(--bg-surface)] border border-[var(--border-modal)] text-[13px] text-[var(--text-secondary)] flex items-center justify-between">
                <span>{errorMessage || 'Une erreur est survenue lors de la communication avec le modèle.'}</span>
                <button
                  type="button"
                  onClick={handleRetry}
                  className="px-2.5 py-1 rounded bg-[var(--bg-active)] text-[var(--text-primary)] hover:opacity-90 text-[12px] transition-colors"
                >
                  Réessayer
                </button>
              </div>
            )}
          </div>
        </div>

        {showScrollButton && (
          <div className="absolute bottom-28 left-1/2 -translate-x-1/2 z-30 pointer-events-auto">
            <button
              type="button"
              onClick={() => scrollToBottom(true)}
              aria-label="Revenir en bas de la discussion"
              className="tap-target-24 flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-button)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] text-[12px] text-[var(--text-primary)] transition-colors select-none cursor-pointer"
            >
              <ChevronDown className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
              <span>Revenir en bas</span>
            </button>
          </div>
        )}

        <div className="w-full shrink-0 flex flex-col items-center px-4 pb-4 pt-1 bg-[var(--bg-app)] z-20">
          <ClaudeComposer
            onSend={handleSendMessage}
            onStop={() => agentClient.cancelTask()}
            isLoading={chatStatus === 'loading'}
            isConversation={true}
            conversationId={history[0]?.id}
            contextUsage={contextUsage}
          />

          <div className="w-full max-w-[720px] flex items-center justify-between text-[11px] text-[var(--text-tertiary)] pt-2 px-1 select-none">
            <span>Iroko est une IA et peut commettre des erreurs. Veuillez vérifier les réponses.</span>
            <span>{formatModelLabel(activeModel).name}</span>
          </div>
        </div>

      </div>

      <ChatInspectorPanel
        isOpen={inspectorOpen}
        onClose={() => setInspectorOpen(false)}
        inspectorTab={inspectorTab}
        setInspectorTab={setInspectorTab}
        availableTabs={availableTabs}
        workspaceMeta={workspaceMeta}
        previewData={previewData}
        isPreviewLoading={isPreviewLoading}
        artifacts={artifacts}
        selectedArtifactId={selectedArtifactId}
        onSelectArtifact={setSelectedArtifactId}
        onArtifactUpdated={loadArtifacts}
        changedFiles={changedFiles}
        planSteps={planSteps}
        toolExecutions={toolExecutions}
        onRunTests={() => handleSendMessage('Lance la vérification du projet')}
      />

      <DeleteMessageModal
        isOpen={Boolean(deleteConfirmMessage)}
        isDeleting={isDeletingMessage}
        onCancel={() => setDeleteConfirmMessage(null)}
        onConfirm={() => {
          if (deleteConfirmMessage) {
            handleDeleteMessage(deleteConfirmMessage.message, deleteConfirmMessage.index);
          }
        }}
      />

      <EditMessageModal
        data={editModalData}
        onChangeContent={(newContent) => {
          if (editModalData) {
            setEditModalData({ ...editModalData, content: newContent });
          }
        }}
        onCancel={() => setEditModalData(null)}
        onConfirm={handleConfirmEdit}
      />

    </div>
  );
}
