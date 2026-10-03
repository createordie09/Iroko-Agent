import type { AgentEvent } from './events';

/**
 * Blocs ordonnés d'une réponse d'assistant (réflexion, texte, appel d'outil, artéfact).
 * La même fonction pure construit les blocs côté serveur (enregistrement dans le message)
 * et côté client (affichage en direct) : le direct et le rechargement donnent donc la même chronologie.
 */
export type ToolPartStatus = 'running' | 'success' | 'error';

export interface ArtifactPartData {
  artifactId: string;
  name: string;
  title?: string;
  mimeType: string;
  version: number;
  size: number;
  metadata?: any;
}

export type MessagePart =
  | { id: string; type: 'thinking'; text: string; startedAt: number; durationMs?: number }
  | { id: string; type: 'text'; text: string }
  | {
      id: string;
      type: 'tool';
      callId: string;
      tool: string;
      input: unknown;
      status: ToolPartStatus;
      result?: unknown;
      error?: string;
      startedAt: number;
      durationMs?: number;
    }
  | ({ id: string; type: 'artifact' } & ArtifactPartData);

/** Taille maximale d'une chaîne conservée dans un bloc (les contenus de fichiers peuvent être très longs) */
export const PART_MAX_STRING = 1500;
/** Taille maximale, après sérialisation, d'une entrée ou d'un résultat d'outil conservé dans un bloc */
export const PART_MAX_JSON = 4000;

/** Réduit une valeur (entrée ou résultat d'outil) pour l'enregistrer dans un bloc sans gonfler le message */
export function compactForPart(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') {
    return value.length > PART_MAX_STRING ? `${value.slice(0, PART_MAX_STRING)}… [${value.length - PART_MAX_STRING} caractères omis]` : value;
  }
  if (value === null || typeof value !== 'object') return value;
  if (depth >= 4) return '[…]';
  if (Array.isArray(value)) {
    const items = value.slice(0, 30).map(v => compactForPart(v, depth + 1));
    if (value.length > 30) items.push(`[… ${value.length - 30} éléments omis]`);
    return items;
  }
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    out[key] = compactForPart(v, depth + 1);
  }
  try {
    const json = JSON.stringify(out);
    if (json.length > PART_MAX_JSON) return `${json.slice(0, PART_MAX_JSON)}… [tronqué]`;
  } catch {
    return '[non sérialisable]';
  }
  return out;
}

/** Ferme la réflexion en cours (si le dernier bloc en est une) en enregistrant sa durée réelle */
function closeThinking(parts: MessagePart[], now: number): MessagePart[] {
  const last = parts[parts.length - 1];
  if (last && last.type === 'thinking' && last.durationMs === undefined) {
    return [...parts.slice(0, -1), { ...last, durationMs: Math.max(0, now - last.startedAt) }];
  }
  return parts;
}

let partCounter = 0;
function newPartId(prefix: string): string {
  partCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${partCounter}`;
}

/**
 * Applique un événement d'agent à la liste de blocs et renvoie la nouvelle liste (la liste reçue n'est pas modifiée).
 * Les événements sans lien avec la chronologie de la réponse laissent la liste inchangée (même référence).
 */
export function applyEventToParts(parts: MessagePart[], event: AgentEvent, now: number = Date.now()): MessagePart[] {
  switch (event.type) {
    case 'thinking': {
      if (typeof event.content !== 'string' || event.content.length === 0) return parts;
      const last = parts[parts.length - 1];
      if (last && last.type === 'thinking') {
        return [...parts.slice(0, -1), { ...last, text: last.text + event.content }];
      }
      return [...parts, { id: newPartId('thinking'), type: 'thinking', text: event.content, startedAt: now }];
    }

    case 'message': {
      if (event.role !== 'assistant' || typeof event.content !== 'string' || event.content.length === 0) return parts;
      const last = parts[parts.length - 1];
      if (last && last.type === 'text') {
        return [...parts.slice(0, -1), { ...last, text: last.text + event.content }];
      }
      return [...closeThinking(parts, now), { id: newPartId('text'), type: 'text', text: event.content }];
    }

    case 'tool_call_start': {
      if (parts.some(p => p.type === 'tool' && p.callId === event.callId)) return parts;
      return [
        ...closeThinking(parts, now),
        {
          id: newPartId('tool'),
          type: 'tool',
          callId: event.callId,
          tool: event.tool,
          input: compactForPart(event.input),
          status: 'running',
          startedAt: now
        }
      ];
    }

    case 'tool_call_result': {
      let found = false;
      const next = parts.map(p => {
        if (p.type === 'tool' && p.callId === event.callId) {
          found = true;
          return {
            ...p,
            status: (event.success ? 'success' : 'error') as ToolPartStatus,
            result: compactForPart(event.result),
            error: event.error,
            durationMs: Math.max(0, now - p.startedAt)
          };
        }
        return p;
      });
      return found ? next : parts;
    }

    case 'artifact_created':
    case 'artifact_updated': {
      const a = event.artifact;
      if (!a || !a.id) return parts;
      const data: ArtifactPartData = {
        artifactId: a.id,
        name: a.name,
        title: a.title,
        mimeType: a.mimeType,
        version: a.version,
        size: a.size,
        metadata: a.metadata
      };
      const existingIndex = parts.findIndex(p => p.type === 'artifact' && p.artifactId === a.id);
      if (existingIndex >= 0) {
        const next = [...parts];
        next[existingIndex] = { ...(parts[existingIndex] as any), ...data };
        return next;
      }
      return [...closeThinking(parts, now), { id: newPartId('artifact'), type: 'artifact', ...data }];
    }

    default:
      return parts;
  }
}

/** Indique si le message d'assistant enregistré contient une chronologie en blocs exploitable */
export function hasMessageParts(metadata: any): metadata is { parts: MessagePart[] } {
  return Boolean(metadata) && Array.isArray(metadata.parts) && metadata.parts.length > 0;
}
