import { useRef, useState, useEffect } from 'react';
import { AgentEvent } from '../../../server/types/events';
import { applyEventToParts, MessagePart } from '../../../server/types/messageParts';

const IMMEDIATE_EVENTS = new Set(['tool_call_start', 'tool_call_result', 'artifact_created', 'artifact_updated']);

/**
 * Chronologie ordonnée de la réponse en cours (même réducteur que le serveur).
 * Les blocs de texte sont publiés par lots de 60 ms ; les étapes d'outils et artéfacts immédiatement.
 */
export function useLiveParts() {
  const [liveParts, setLiveParts] = useState<MessagePart[]>([]);
  const ref = useRef<MessagePart[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const publish = (immediate = false) => {
    if (immediate) {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      setLiveParts(ref.current);
      return;
    }
    if (timerRef.current) return;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setLiveParts(ref.current);
    }, 60);
  };

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const applyEvent = (event: AgentEvent) => {
    const next = applyEventToParts(ref.current, event);
    if (next === ref.current) return;
    ref.current = next;
    publish(IMMEDIATE_EVENTS.has(event.type));
  };

  const setParts = (parts: MessagePart[]) => {
    ref.current = parts;
    publish(true);
  };

  const reset = () => setParts([]);

  /** Blocs de la réponse à enregistrer ; ajoute le texte final s'il n'a pas été diffusé (ex. résumé seul) */
  const snapshot = (finalText?: string): MessagePart[] => {
    const parts = ref.current;
    if (finalText && parts.length > 0 && !parts.some(p => p.type === 'text')) {
      return applyEventToParts(parts, { type: 'message', role: 'assistant', content: finalText } as any);
    }
    return parts;
  };

  return { liveParts, applyEvent, setParts, reset, snapshot };
}
