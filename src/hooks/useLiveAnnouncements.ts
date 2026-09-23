import { useState, useEffect, useRef } from 'react';
import { agentClient } from '../lib/agent-client';
import { AgentEvent } from '../../server/types/events';

export interface UseLiveAnnouncementsReturn {
  statusAnnouncement: string;
  alertAnnouncement: string;
  announceStatus: (text: string) => void;
  announceAlert: (text: string) => void;
}

/**
 * Hook de gestion des annonces d'accessibilité en direct (WCAG 4.1.3 & Règle U6) :
 * - Région role="status" : vide dès le chargement initial, ne change de texte
 *   QUE lors des transitions de phase ("Réflexion en cours…", "Génération en cours…",
 *   "Réponse terminée.", "Génération arrêtée."), jamais par token.
 * - Région role="alert" : vide au chargement, réservée aux erreurs ("Erreur : …")
 *   et aux demandes d'autorisation ("Autorisation requise : …") sans voler le focus.
 */
export function useLiveAnnouncements(): UseLiveAnnouncementsReturn {
  const [statusAnnouncement, setStatusAnnouncement] = useState<string>('');
  const [alertAnnouncement, setAlertAnnouncement] = useState<string>('');

  const currentPhaseRef = useRef<'idle' | 'thinking' | 'generating' | 'stopped'>('idle');

  useEffect(() => {
    const unsubEvents = agentClient.onEvent((event: AgentEvent) => {
      switch (event.type) {
        case 'thinking':
          if (currentPhaseRef.current !== 'thinking') {
            currentPhaseRef.current = 'thinking';
            setStatusAnnouncement('Réflexion en cours…');
          }
          break;

        case 'message':
          if (event.role === 'assistant' && currentPhaseRef.current !== 'generating') {
            currentPhaseRef.current = 'generating';
            setStatusAnnouncement('Génération en cours…');
          }
          break;

        case 'status':
          if (event.status === 'idle') {
            if (currentPhaseRef.current === 'thinking' || currentPhaseRef.current === 'generating') {
              currentPhaseRef.current = 'idle';
              setStatusAnnouncement('Réponse terminée.');
            }
          }
          break;

        case 'completed':
          if (currentPhaseRef.current === 'thinking' || currentPhaseRef.current === 'generating') {
            currentPhaseRef.current = 'idle';
            setStatusAnnouncement('Réponse terminée.');
          }
          break;

        case 'error':
          currentPhaseRef.current = 'idle';
          setAlertAnnouncement(`Erreur : ${event.message || 'Une erreur est survenue.'}`);
          break;

        case 'permission_required':
          if (event.request?.description || event.request?.tool) {
            setAlertAnnouncement(`Autorisation requise : ${event.request.description || event.request.tool}`);
          }
          break;
      }
    });

    // Écouteur personnalisé pour l'interruption volontaire par l'utilisateur
    const handleCancelled = () => {
      currentPhaseRef.current = 'stopped';
      setStatusAnnouncement('Génération arrêtée.');
    };

    window.addEventListener('iroko:task-cancelled', handleCancelled);

    return () => {
      unsubEvents();
      window.removeEventListener('iroko:task-cancelled', handleCancelled);
    };
  }, []);

  const announceStatus = (text: string) => {
    setStatusAnnouncement(text);
  };

  const announceAlert = (text: string) => {
    setAlertAnnouncement(text);
  };

  return {
    statusAnnouncement,
    alertAnnouncement,
    announceStatus,
    announceAlert
  };
}
