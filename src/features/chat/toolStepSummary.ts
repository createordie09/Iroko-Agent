import type { MessagePart } from '../../../server/types/messageParts';

export type ToolPart = Extract<MessagePart, { type: 'tool' }>;

export interface DiffLine {
  kind: 'removed' | 'added';
  text: string;
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

/**
 * Résumé d'une ligne d'une étape terminée, calculé uniquement à partir du résultat réel de l'outil.
 * Renvoie une chaîne vide lorsque le résultat n'offre rien de fiable à résumer.
 */
export function summarizeToolResult(part: ToolPart): string {
  if (part.status === 'running') return '';
  if (part.status === 'error') return part.error ? part.error.split('\n')[0].slice(0, 120) : 'Échec';
  const result = asRecord(part.result);

  switch (part.tool) {
    case 'web_search':
      return typeof result.count === 'number' ? plural(result.count, 'résultat', 'résultats') : '';
    case 'search_text':
      return typeof result.totalMatches === 'number' ? plural(result.totalMatches, 'occurrence', 'occurrences') : '';
    case 'read_file': {
      if (typeof result.startLine === 'number' && typeof result.endLine === 'number') {
        const count = result.endLine - result.startLine + 1;
        return count > 0 ? plural(count, 'ligne lue', 'lignes lues') : '';
      }
      return '';
    }
    case 'write_file':
      return result.status === 'created' ? 'Fichier créé' : result.status === 'overwritten' ? 'Fichier remplacé' : '';
    case 'edit_file':
      return result.status === 'modified' ? 'Fichier modifié' : '';
    case 'execute_command':
      return typeof result.exitCode === 'number' ? `Code de sortie ${result.exitCode}` : '';
    default:
      return '';
  }
}

/** Lignes de différence réelles d'une modification de fichier (contenu remplacé / contenu de remplacement) */
export function buildEditDiff(part: ToolPart, maxLines = 40): DiffLine[] {
  if (part.tool !== 'edit_file' || part.status !== 'success') return [];
  const input = asRecord(part.input);
  const before = typeof input.targetContent === 'string' ? input.targetContent : null;
  const after = typeof input.replacementContent === 'string' ? input.replacementContent : null;
  if (before === null || after === null) return [];

  const lines: DiffLine[] = [
    ...before.split('\n').map(text => ({ kind: 'removed' as const, text })),
    ...after.split('\n').map(text => ({ kind: 'added' as const, text }))
  ];
  return lines.slice(0, maxLines);
}
