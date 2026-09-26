import React, { useState } from 'react';
import { agentClient } from '../../lib/agent-client';
import { tokenService } from '../../services/security/TokenService';
import { attachmentService } from '../../services/attachments/AttachmentService';
import { EditModalData } from '../../features/chat/modals/EditMessageModal';
import { useUndoDeletion } from '../useUndoDeletion';

export interface UseChatMessageActionsOptions {
  conversationId: string;
  activeModel: string;
  composerMode: 'chat' | 'code';
  messages: any[];
  setMessages: React.Dispatch<React.SetStateAction<any[]>>;
  setChatStatus: (status: any) => void;
  resetStreamBuffer: () => void;
  setThinkingLogs: React.Dispatch<React.SetStateAction<string[]>>;
  setToolExecutions: React.Dispatch<React.SetStateAction<any[]>>;
  setErrorMessage: React.Dispatch<React.SetStateAction<string | null>>;
  loadArtifacts: () => Promise<void>;
  setAttachmentsMap: React.Dispatch<React.SetStateAction<Record<string, any>>>;
}

export function useChatMessageActions({
  conversationId,
  activeModel,
  composerMode,
  messages,
  setMessages,
  setChatStatus,
  resetStreamBuffer,
  setThinkingLogs,
  setToolExecutions,
  setErrorMessage,
  loadArtifacts,
  setAttachmentsMap
}: UseChatMessageActionsOptions) {
  const { scheduleUndoableDeletion } = useUndoDeletion();
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [deleteConfirmMessage, setDeleteConfirmMessage] = useState<{ message: any; index: number } | null>(null);
  const [isDeletingMessage, setIsDeletingMessage] = useState(false);
  const [editModalData, setEditModalData] = useState<EditModalData | null>(null);
  const [isCheckingImpact, setIsCheckingImpact] = useState(false);

  const handleSendMessage = (
    text: string, 
    options?: { mode?: 'chat' | 'code'; tools?: string[]; attachmentIds?: string[]; comparisonModelBId?: string }
  ) => {
    const userMsg = { 
      id: crypto.randomUUID(),
      role: 'user' as const, 
      content: text, 
      timestamp: Date.now(),
      metadata: options?.attachmentIds && options.attachmentIds.length > 0 ? { attachmentIds: options.attachmentIds } : undefined
    };
    setMessages(prev => [...prev, userMsg]);
    setChatStatus('loading');
    setThinkingLogs([]); // Zéro log inventé : alimenté uniquement par les flux réels du provider
    setToolExecutions([]);
    resetStreamBuffer();
    setErrorMessage(null);

    if (options?.attachmentIds) {
      for (const id of options.attachmentIds) {
        attachmentService.getAttachment(id).then(att => {
          setAttachmentsMap(prev => ({ ...prev, [id]: att }));
        }).catch(() => {});
      }
    }

    if (options?.comparisonModelBId) {
      tokenService.fetch(`/api/conversations/${encodeURIComponent(conversationId)}/compare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: text,
          modelAId: activeModel,
          modelBId: options.comparisonModelBId
        })
      }).then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          if (data.assistantMessage) {
            setMessages(prev => {
              const filtered = prev.filter(m => m.id !== data.assistantMessage.id);
              return [...filtered, data.assistantMessage];
            });
          }
        }
        setChatStatus('idle');
      }).catch((err) => {
        console.error('Erreur comparaison de modèles', err);
        setChatStatus('idle');
      });
      return;
    }

    let preferredProviderId: string | undefined = undefined;
    if (activeModel && activeModel.includes('/')) {
      preferredProviderId = activeModel.split('/')[0];
    }

    agentClient.sendPrompt(text, {
      conversationId,
      modelId: activeModel,
      preferredProviderId,
      mode: options?.mode || composerMode,
      attachmentIds: options?.attachmentIds
    });
  };

  const handleRetry = () => {
    const lastUser = [...messages].reverse().find(m => m.role === 'user');
    if (lastUser) {
      handleSendMessage(lastUser.content);
    }
  };

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleDeleteMessage = (msg: any, index: number) => {
    setDeleteConfirmMessage(null);
    if (!msg?.id) {
      setMessages(prev => prev.filter((_, i) => i !== index));
      return;
    }
    const oldMessages = [...messages];
    setMessages(prev => prev.filter((_, i) => i !== index));
    scheduleUndoableDeletion({
      itemType: 'message',
      id: msg.id,
      label: 'Message supprimé.',
      onRestore: () => {
        setMessages(oldMessages);
        loadArtifacts();
      },
      onPurge: () => {
        loadArtifacts();
      }
    });
  };

  const handleStartEdit = async (msg: any, index: number) => {
    setIsCheckingImpact(true);
    let impact = undefined;
    try {
      if (msg.id && conversationId) {
        const res = await tokenService.fetch(`/api/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(msg.id)}/impact`);
        if (res.ok) {
          impact = await res.json();
        }
      }
    } catch {} finally {
      setIsCheckingImpact(false);
    }

    setEditModalData({
      message: msg,
      index,
      content: msg.content,
      impact: impact || {
        subsequentCount: Math.max(0, messages.length - index - 1),
        filesWereModified: false,
        modifiedFiles: []
      }
    });
  };

  const handleConfirmEdit = async () => {
    if (!editModalData) return;
    const { message, index, content } = editModalData;
    const newText = content.trim();
    if (!newText) return;

    try {
      if (message.id && conversationId) {
        await tokenService.fetch(`/api/conversations/${encodeURIComponent(conversationId)}/truncate-from/${encodeURIComponent(message.id)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ includeTarget: true })
        });
      }
      setMessages(prev => prev.slice(0, index));
      setEditModalData(null);
      handleSendMessage(newText);
    } catch (err) {
      console.error('Erreur lors de la modification/troncature :', err);
    }
  };

  const handleRegenerateFrom = async (assistantIndex: number) => {
    const priorUser = [...messages.slice(0, assistantIndex)].reverse().find(m => m.role === 'user');
    if (!priorUser) return;

    const assistantMsg = messages[assistantIndex];
    try {
      if (assistantMsg?.id && conversationId) {
        await tokenService.fetch(`/api/conversations/${encodeURIComponent(conversationId)}/truncate-from/${encodeURIComponent(assistantMsg.id)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ includeTarget: true })
        });
      }
      setMessages(prev => prev.slice(0, assistantIndex));
      handleSendMessage(priorUser.content);
    } catch (err) {
      console.error('Erreur lors de la régénération :', err);
    }
  };

  const handleContinue = (interruptedMsg: any, index: number) => {
    const priorUser = [...messages.slice(0, index)].reverse().find(m => m.role === 'user');
    const originalPrompt = interruptedMsg?.metadata?.prompt || priorUser?.content || '';
    const partialText = interruptedMsg?.content || '';

    const continuationPrompt = `Continuez votre réponse précédente exactement à partir de l'endroit où elle a été interrompue, sans répéter ce qui a déjà été produit.\n\nDemande initiale\u00A0: ${originalPrompt}\n\nTexte partiel déjà produit\u00A0:\n« ${partialText} »`;

    handleSendMessage(continuationPrompt);
  };

  return {
    copiedIndex,
    setCopiedIndex,
    deleteConfirmMessage,
    setDeleteConfirmMessage,
    isDeletingMessage,
    editModalData,
    setEditModalData,
    isCheckingImpact,
    handleSendMessage,
    handleRetry,
    handleCopy,
    handleDeleteMessage,
    handleStartEdit,
    handleConfirmEdit,
    handleRegenerateFrom,
    handleContinue
  };
}
