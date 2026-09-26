/**
 * useSidebarActiveTasks — Hook d'écoute et suivi des tâches actives en arrière-plan (Mission M8.3 P6, Lot 6)
 */
import { useState, useEffect } from 'react';
import { tokenService } from '../../services/security/TokenService';
import { agentClient } from '../../lib/agent-client';

export function useSidebarActiveTasks(): string[] {
  const [activeTaskConvIds, setActiveTaskConvIds] = useState<string[]>([]);

  useEffect(() => {
    let isMounted = true;

    // 1. Récupération sobre initiale (un seul appel HTTP au montage)
    const fetchActive = async () => {
      try {
        const res = await tokenService.fetch('/api/agent/active-tasks');
        if (res.ok && isMounted) {
          const data = await res.json();
          setActiveTaskConvIds(data.activeConversationIds || []);
        }
      } catch {}
    };

    fetchActive();

    // 2. Écoute réactive des événements WebSocket en direct (zéro polling tant que le WS est actif)
    const unsubscribeWs = agentClient.onEvent((event: any) => {
      if (event.type === 'agent_status_changed' && Array.isArray(event.activeConversationIds)) {
        if (isMounted) {
          setActiveTaskConvIds(event.activeConversationIds);
        }
      } else if (event.type === 'video_job_updated') {
        fetchActive();
      }
    });

    // 3. Sondage de repli : activé uniquement si le WebSocket est déconnecté (cadence lente 30s)
    let fallbackInterval: NodeJS.Timeout | null = null;
    const unsubscribeConn = agentClient.onConnectionChange((connected) => {
      if (connected) {
        if (fallbackInterval) {
          clearInterval(fallbackInterval);
          fallbackInterval = null;
        }
      } else {
        if (!fallbackInterval && isMounted) {
          fallbackInterval = setInterval(fetchActive, 30000);
        }
      }
    });

    return () => {
      isMounted = false;
      unsubscribeWs();
      unsubscribeConn();
      if (fallbackInterval) {
        clearInterval(fallbackInterval);
      }
    };
  }, []);

  return activeTaskConvIds;
}
