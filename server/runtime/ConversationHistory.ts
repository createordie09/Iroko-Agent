import { runtimeDatabase } from '../storage/RuntimeDatabase';
import { ModelMessage } from '../models/types';
import { PrivacyFilter } from '../security/PrivacyFilter';

export type ConversationMode = 'chat' | 'code';

export interface ConversationHistory {
  /** Échanges antérieurs (alternance utilisateur / assistant, du plus ancien au plus récent) */
  messages: ModelMessage[];
  /** Nombre de messages plus anciens écartés faute de place dans le budget de jetons */
  omittedCount: number;
  /** Mode (Chat / Code) du dernier échange enregistré, si connu */
  previousMode?: ConversationMode;
}

export interface BuildHistoryOptions {
  conversationId?: string;
  /** Prompt du tour en cours : déjà enregistré en base, il ne doit pas être dupliqué dans l'historique */
  currentPrompt: string;
  /** Fenêtre de contexte du modèle (en jetons) */
  contextWindow: number;
  /** Masquer les secrets avant envoi au modèle (réglage « mask_secrets_before_model ») */
  maskSecrets?: boolean;
}

const MIN_HISTORY_TOKENS = 2000;
const MAX_HISTORY_TOKENS = 60000;
const HISTORY_SHARE_OF_WINDOW = 0.4;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Part de la fenêtre de contexte réservée à l'historique de la discussion */
export function historyBudgetTokens(contextWindow: number): number {
  const budget = Math.floor(contextWindow * HISTORY_SHARE_OF_WINDOW);
  return Math.max(MIN_HISTORY_TOKENS, Math.min(MAX_HISTORY_TOKENS, budget));
}

function parseMetadata(raw: string | null): Record<string, any> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Reconstruit l'historique d'une discussion pour le modèle à partir de la base locale.
 * Seuls les échanges réels (texte utilisateur, réponse finale de l'assistant) sont repris :
 * les messages vides, les notices système et les réponses en cours de génération sont ignorés.
 */
export function buildConversationHistory(options: BuildHistoryOptions): ConversationHistory {
  const empty: ConversationHistory = { messages: [], omittedCount: 0 };
  if (!options.conversationId) return empty;

  let stored;
  try {
    stored = runtimeDatabase.getConversation(options.conversationId);
  } catch {
    return empty;
  }
  if (!stored || stored.messages.length === 0) return empty;

  const rows = [...stored.messages];

  // Le prompt du tour en cours est déjà enregistré : on le retire de l'historique
  const last = rows[rows.length - 1];
  if (last && last.role === 'user' && last.content === options.currentPrompt) {
    rows.pop();
  }

  let previousMode: ConversationMode | undefined;
  const turns: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  for (const row of rows) {
    if (row.role !== 'user' && row.role !== 'assistant') continue;
    const metadata = parseMetadata(row.metadata);
    if (metadata.systemNotice) continue;

    if (metadata.mode === 'chat' || metadata.mode === 'code') {
      previousMode = metadata.mode;
    }

    let content = row.content || '';
    // Comparaison de deux modèles : seule la réponse retenue par l'utilisateur fait partie de la discussion
    if (!content && metadata.comparison?.selectedModel) {
      const chosen = metadata.comparison[metadata.comparison.selectedModel];
      if (chosen && typeof chosen.content === 'string') content = chosen.content;
    }
    content = content.trim();
    if (!content) continue;

    if (row.role === 'user' && Array.isArray(metadata.attachmentIds) && metadata.attachmentIds.length > 0) {
      content += `\n[${metadata.attachmentIds.length} pièce(s) jointe(s) à ce message, contenu non rechargé]`;
    }
    if (row.role === 'user' && options.maskSecrets) {
      content = PrivacyFilter.maskSecretsForModel(content);
    }

    // Fusion des messages consécutifs de même rôle (ex. envoi resté sans réponse) pour garder une alternance valide
    const previous = turns[turns.length - 1];
    if (previous && previous.role === row.role) {
      previous.content += `\n\n${content}`;
    } else {
      turns.push({ role: row.role, content });
    }
  }

  // Budget de jetons : on conserve les échanges les plus récents
  const budget = historyBudgetTokens(options.contextWindow);
  let used = 0;
  let startIndex = turns.length;
  for (let i = turns.length - 1; i >= 0; i--) {
    const cost = estimateTokens(turns[i].content);
    if (used + cost > budget && startIndex < turns.length) break;
    used += cost;
    startIndex = i;
  }

  // Une réponse ne reste jamais sans la question qui la précède : on remonte d'un échange si besoin
  if (startIndex > 0 && startIndex < turns.length && turns[startIndex].role === 'assistant') {
    startIndex--;
  }

  let kept = turns.slice(startIndex);
  // La première intervention conservée doit être celle de l'utilisateur
  while (kept.length > 0 && kept[0].role !== 'user') kept = kept.slice(1);

  const omittedCount = turns.length - kept.length;
  return {
    messages: kept.map(t => ({ role: t.role, content: t.content })),
    omittedCount,
    previousMode
  };
}

/** Mention de continuité ajoutée au prompt système lorsque l'historique est tronqué ou que le mode a changé */
export function buildContinuityNote(history: ConversationHistory, currentMode: ConversationMode): string {
  const parts: string[] = [];

  if (history.omittedCount > 0) {
    parts.push(`${history.omittedCount} échange(s) plus ancien(s) de cette discussion ne sont pas repris ci-dessous faute de place.`);
  }

  if (history.previousMode && history.previousMode !== currentMode) {
    const label = (m: ConversationMode) => (m === 'code' ? 'Code' : 'Chat');
    parts.push(
      `L'utilisateur vient de passer du mode ${label(history.previousMode)} au mode ${label(currentMode)}. ` +
      `Les échanges précédents de la discussion restent d'actualité : si tu lui avais demandé ce changement de mode, ` +
      `exécute maintenant la tâche demandée plus haut sans la lui faire répéter.`
    );
  }

  return parts.length > 0 ? `\n\nCONTINUITÉ DE LA DISCUSSION : ${parts.join(' ')}` : '';
}
