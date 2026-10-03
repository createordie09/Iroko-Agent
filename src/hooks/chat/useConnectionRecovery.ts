import { useEffect, useRef } from 'react';

export interface UseConnectionRecoveryOptions {
  runtimeConnected: boolean;
  chatStatus: 'idle' | 'loading' | 'success' | 'error';
  setChatStatus: (status: 'idle' | 'loading' | 'success' | 'error') => void;
  setErrorMessage: (message: string | null) => void;
  setChatError: (message: string | null) => void;
  activeConversationId: string | null;
  loadConversation: (id: string) => Promise<void>;
}

/**
 * Coupure du runtime pendant une génération : état d'erreur explicite, puis rechargement
 * de la discussion persistée à la reconnexion (le daemon termine la tâche côté serveur).
 */
export function useConnectionRecovery({
  runtimeConnected,
  chatStatus,
  setChatStatus,
  setErrorMessage,
  setChatError,
  activeConversationId,
  loadConversation
}: UseConnectionRecoveryOptions) {
  const connectionDroppedRef = useRef(false);

  useEffect(() => {
    if (!runtimeConnected) {
      if (chatStatus === 'loading') {
        connectionDroppedRef.current = true;
        setErrorMessage('Connexion au runtime local interrompue pendant la génération. Reconnexion en cours…');
        setChatStatus('error');
      }
      return;
    }
    if (connectionDroppedRef.current) {
      connectionDroppedRef.current = false;
      setErrorMessage(null);
      setChatError(null);
      setChatStatus('idle');
      if (activeConversationId) loadConversation(activeConversationId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runtimeConnected]);
}
