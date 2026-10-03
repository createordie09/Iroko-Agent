import React from 'react';
import { agentClient } from './agent-client';
import { tokenService } from '../services/security/TokenService';

export interface DispatchPromptParams {
  text: string;
  conversationId: string;
  activeModel: string;
  mode: 'chat' | 'code';
  attachmentIds?: string[];
  comparisonModelBId?: string;
  retry?: boolean;
  setMessages: React.Dispatch<React.SetStateAction<any[]>>;
  setChatStatus: (status: 'idle' | 'loading' | 'success' | 'error') => void;
  setErrorMessage?: (message: string | null) => void;
}

/**
 * Point d'envoi unique d'un prompt (accueil et conversation) : comparaison de deux modèles
 * ou envoi WebSocket, avec retour d'erreur visible dans les deux cas.
 */
export function dispatchPrompt(params: DispatchPromptParams): void {
  const {
    text, conversationId, activeModel, mode, attachmentIds, comparisonModelBId, retry,
    setMessages, setChatStatus, setErrorMessage
  } = params;

  const fail = (message: string) => {
    setErrorMessage?.(message);
    setChatStatus('error');
  };

  if (comparisonModelBId) {
    tokenService.fetch(`/api/conversations/${encodeURIComponent(conversationId)}/compare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: text, modelAId: activeModel, modelBId: comparisonModelBId })
    }).then(async (res) => {
      if (!res.ok) {
        let detail = 'La comparaison des deux modèles a échoué.';
        try {
          const data = await res.json();
          if (data?.error) detail = data.error;
        } catch {}
        fail(detail);
        return;
      }
      const data = await res.json();
      if (data.assistantMessage) {
        setMessages(prev => {
          const filtered = prev.filter(m => m.id !== data.assistantMessage.id);
          return [...filtered, data.assistantMessage];
        });
      }
      setChatStatus('idle');
    }).catch((err) => {
      console.error('Erreur comparaison de modèles', err);
      fail('La comparaison des deux modèles a échoué\u00A0: runtime local injoignable.');
    });
    return;
  }

  const preferredProviderId = activeModel && activeModel.includes('/') ? activeModel.split('/')[0] : undefined;
  const sent = agentClient.sendPrompt(text, {
    conversationId,
    mode,
    modelId: activeModel,
    preferredProviderId,
    attachmentIds,
    retry
  });
  if (!sent) {
    fail('Le message n’a pas pu être envoyé\u00A0: connexion au runtime local interrompue.');
  }
}
