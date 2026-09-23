import crypto from 'crypto';
import path from 'path';
import { runtimeDatabase, DbMemoryItem } from '../storage/RuntimeDatabase.js';

// Motifs de détection stricte des secrets (§20, §26)
const SECRET_PATTERNS = [
  { name: 'Clé API OpenAI / Anthropic (sk-...)', regex: /sk-[a-zA-Z0-9_\-]{20,}/i },
  { name: 'Clé API Google (AIza...)', regex: /AIza[0-9A-Za-z\-_]{35}/ },
  { name: 'Jeton GitHub (ghp_... ou github_pat_...)', regex: /(?:ghp_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9_]{50,})/ },
  { name: 'Jeton Bearer', regex: /Bearer\s+[a-zA-Z0-9_\-\.]{20,}/i },
  { name: 'Clé privée (PEM)', regex: /-----BEGIN [A-Z ]+ PRIVATE KEY-----/ },
  { name: 'Jeton Slack', regex: /xox[baprs]-[0-9a-zA-Z]{10,}/ },
  { name: 'Mot de passe ou secret explicite', regex: /(?:password|secret|api_key|token|passwd|pwd)\s*[:=]\s*['"][^'"]{6,}['"]/i }
];

export function containsSecret(text: string): { hasSecret: boolean; reason?: string } {
  if (!text) return { hasSecret: false };

  for (const pattern of SECRET_PATTERNS) {
    if (pattern.regex.test(text)) {
      return {
        hasSecret: true,
        reason: `Détection de secret potentiel : ${pattern.name}. Refus formel de mémoriser des secrets ou informations confidentielles (clés API, jetons, mots de passe).`
      };
    }
  }

  return { hasSecret: false };
}

export function computeProjectHash(workspacePath: string): string {
  if (!workspacePath) return 'default';
  const normalized = path.resolve(workspacePath).toLowerCase().replace(/\\/g, '/');
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

export class ProjectMemoryManager {
  /**
   * Vérifie si la mémoire est activée globalement
   */
  public isEnabled(): boolean {
    return runtimeDatabase.isMemoryEnabled();
  }

  /**
   * Active ou désactive la mémoire
   */
  public setEnabled(enabled: boolean): void {
    runtimeDatabase.setMemoryEnabled(enabled);
  }

  /**
   * Enregistre un fait en mémoire avec contrôle anti-secret strict
   */
  public remember(params: {
    fact: string;
    scope?: 'global' | 'project';
    workspacePath?: string | null;
    category?: string;
    id?: string;
  }): DbMemoryItem {
    const check = containsSecret(params.fact);
    if (check.hasSecret) {
      throw new Error(check.reason || 'Refus formel de mémoriser des secrets.');
    }

    const scope = params.scope || 'project';
    const projectHash = scope === 'project' && params.workspacePath
      ? computeProjectHash(params.workspacePath)
      : null;

    return runtimeDatabase.saveMemory({
      id: params.id,
      scope,
      projectHash,
      category: params.category || 'general',
      fact: params.fact.trim()
    });
  }

  /**
   * Liste les mémoires avec filtres éventuels
   */
  public listMemories(params?: {
    scope?: 'global' | 'project';
    workspacePath?: string | null;
  }): DbMemoryItem[] {
    const projectHash = params?.workspacePath ? computeProjectHash(params.workspacePath) : null;
    return runtimeDatabase.listMemories(params?.scope, projectHash);
  }

  /**
   * Supprime une mémoire par son identifiant
   */
  public deleteMemory(id: string): boolean {
    return runtimeDatabase.deleteMemory(id);
  }

  /**
   * Efface toutes les mémoires (ne touche jamais aux conversations ni aux clés)
   */
  public clearAllMemories(params?: {
    scope?: 'global' | 'project';
    workspacePath?: string | null;
  }): number {
    const projectHash = params?.workspacePath ? computeProjectHash(params.workspacePath) : null;
    return runtimeDatabase.clearAllMemories(params?.scope, projectHash);
  }

  /**
   * Sélectionne les mémoires pertinentes pour le prompt système avec un budget strict de caractères (~1000 tokens / 4000 car)
   */
  public getRelevantMemoriesForPrompt(
    prompt: string,
    workspacePath: string | null,
    maxChars: number = 4000
  ): DbMemoryItem[] {
    if (!this.isEnabled()) {
      return [];
    }

    const projectHash = workspacePath ? computeProjectHash(workspacePath) : null;
    const allMemories = runtimeDatabase.listMemories(undefined, projectHash);

    if (allMemories.length === 0) {
      return [];
    }

    // Tokeniser le prompt pour scorer la pertinence
    const promptWords = new Set(
      prompt
        .toLowerCase()
        .replace(/[^\w\sàâäéèêëîïôöùûüç]/gi, ' ')
        .split(/\s+/)
        .filter((w) => w.length >= 3)
    );

    // Scorer chaque mémoire
    const scored = allMemories.map((mem) => {
      let score = 0;
      const memText = `${mem.category} ${mem.fact}`.toLowerCase();
      for (const word of promptWords) {
        if (memText.includes(word)) {
          score += 1;
        }
      }
      // Donner une légère priorité aux mémoires récentes et aux règles/décisions
      if (mem.category === 'rule' || mem.category === 'decision') {
        score += 0.5;
      }
      return { mem, score };
    });

    // Trier par score décroissant, puis date décroissante
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return new Date(b.mem.updated_at).getTime() - new Date(a.mem.updated_at).getTime();
    });

    // Accumuler dans la limite du budget de caractères
    const selected: DbMemoryItem[] = [];
    let currentLength = 0;

    for (const item of scored) {
      const itemLen = item.mem.fact.length + 30; // estimation avec balisage
      if (currentLength + itemLen <= maxChars) {
        selected.push(item.mem);
        currentLength += itemLen;
      }
    }

    return selected;
  }

  /**
   * Formate les mémoires sélectionnées pour insertion dans le prompt système
   */
  public formatMemoriesForPrompt(memories: DbMemoryItem[]): string {
    if (!memories || memories.length === 0) return '';

    const globals = memories.filter((m) => m.scope === 'global');
    const projects = memories.filter((m) => m.scope === 'project');

    const lines: string[] = ['<project_memory>'];

    if (globals.length > 0) {
      lines.push('[MÉMOIRE GLOBALE]');
      for (const m of globals) {
        lines.push(`- [${m.category}] ${m.fact}`);
      }
    }

    if (projects.length > 0) {
      if (globals.length > 0) lines.push('');
      lines.push('[MÉMOIRE DU PROJET ACTIF]');
      for (const m of projects) {
        lines.push(`- [${m.category}] ${m.fact}`);
      }
    }

    lines.push('</project_memory>');
    return lines.join('\n');
  }
}

export const projectMemoryManager = new ProjectMemoryManager();
