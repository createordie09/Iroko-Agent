import { ErrorCategory, ProviderErrorClassification } from '../types';

export class ErrorClassifier {
  /**
   * Analyse et classifie une erreur levée par un fournisseur d'IA
   */
  public static classify(error: unknown, failureCount = 1): ProviderErrorClassification {
    const rawMessage = error instanceof Error ? error.message : String(error);
    const lower = rawMessage.toLowerCase();

    // 1. Détection par code de statut HTTP
    const statusMatch = rawMessage.match(/\b(401|402|403|404|408|429|500|502|503|504)\b/);
    const statusCode = statusMatch ? parseInt(statusMatch[1], 10) : undefined;

    // 2. AUTH_ERROR (401 / Invalid Key)
    if (
      statusCode === 401 ||
      lower.includes('invalid api key') ||
      lower.includes('incorrect api key') ||
      lower.includes('invalid_api_key') ||
      lower.includes('unauthorized') ||
      lower.includes('authentication error') ||
      lower.includes('api_key_invalid')
    ) {
      return {
        category: 'AUTH_ERROR',
        isRetryable: false,
        shouldCooldown: false,
        shouldDisableKey: true,
        shouldFallbackProvider: false,
        message: 'Clé API invalide ou révoquée par le fournisseur.',
        statusCode: statusCode || 401
      };
    }

    // 3. QUOTA_EXHAUSTED (402 / Quota / Solde insuffisant)
    if (
      statusCode === 402 ||
      lower.includes('insufficient_quota') ||
      lower.includes('quota exceeded') ||
      lower.includes('exceeded your current quota') ||
      lower.includes('billing') ||
      lower.includes('credit balance is too low') ||
      lower.includes('credits_exhausted')
    ) {
      return {
        category: 'QUOTA_EXHAUSTED',
        isRetryable: false,
        shouldCooldown: false,
        shouldDisableKey: true,
        shouldFallbackProvider: false,
        message: 'Quota mensuel ou crédits de la clé API épuisés.',
        statusCode: statusCode || 402
      };
    }

    // 4. RATE_LIMIT (429 / Trop de requêtes)
    if (
      statusCode === 429 ||
      lower.includes('rate limit') ||
      lower.includes('too many requests') ||
      lower.includes('rate_limit_exceeded') ||
      lower.includes('resource_exhausted') ||
      lower.includes('tokens per minute') ||
      lower.includes('requests per minute')
    ) {
      // Cooldown progressif selon le nombre d'échecs consécutifs
      const cooldownSeconds = this.calculateCooldownSeconds(failureCount);
      return {
        category: 'RATE_LIMIT',
        isRetryable: true,
        shouldCooldown: true,
        cooldownSeconds,
        shouldDisableKey: false,
        shouldFallbackProvider: false,
        message: `Limite de débit (429) atteinte. Cooldown de ${cooldownSeconds}s activé.`,
        statusCode: statusCode || 429
      };
    }

    // 5. TEMPORARY_PROVIDER_ERROR (500, 502, 503, 504 / Panne temporaire)
    if (
      (statusCode && statusCode >= 500 && statusCode <= 504) ||
      lower.includes('overloaded') ||
      lower.includes('service unavailable') ||
      lower.includes('internal server error') ||
      lower.includes('bad gateway') ||
      lower.includes('gateway timeout')
    ) {
      return {
        category: 'TEMPORARY_PROVIDER_ERROR',
        isRetryable: true,
        shouldCooldown: true,
        cooldownSeconds: 20,
        shouldDisableKey: false,
        shouldFallbackProvider: true,
        message: 'Erreur temporaire du serveur fournisseur (5xx). Bascule immédiate.',
        statusCode: statusCode || 503
      };
    }

    // 6. NETWORK_ERROR (Timeout, déconnexion réseau)
    if (
      statusCode === 408 ||
      lower.includes('timeout') ||
      lower.includes('econnreset') ||
      lower.includes('etimedout') ||
      lower.includes('network') ||
      lower.includes('fetch failed')
    ) {
      return {
        category: 'NETWORK_ERROR',
        isRetryable: true,
        shouldCooldown: true,
        cooldownSeconds: 15,
        shouldDisableKey: false,
        shouldFallbackProvider: false,
        message: 'Erreur réseau ou délai d\'attente dépassé.',
        statusCode: statusCode || 408
      };
    }

    // 7. CONTEXT_LIMIT (Dépassement de fenêtre de contexte)
    if (
      lower.includes('maximum context length') ||
      lower.includes('context_length_exceeded') ||
      lower.includes('prompt is too long') ||
      lower.includes('token count exceeds')
    ) {
      return {
        category: 'CONTEXT_LIMIT',
        isRetryable: false,
        shouldCooldown: false,
        shouldDisableKey: false,
        shouldFallbackProvider: false,
        message: 'La requête dépasse la taille de contexte maximale acceptée par le modèle.',
        statusCode: statusCode || 400
      };
    }

    // 8. MODEL_UNAVAILABLE (Modèle inconnu ou non accessible avec ce compte)
    if (
      statusCode === 404 ||
      lower.includes('model not found') ||
      lower.includes('does not exist') ||
      lower.includes('model_not_found')
    ) {
      return {
        category: 'MODEL_UNAVAILABLE',
        isRetryable: false,
        shouldCooldown: false,
        shouldDisableKey: false,
        shouldFallbackProvider: true,
        message: 'Le modèle demandé n\'est pas disponible chez ce fournisseur.',
        statusCode: statusCode || 404
      };
    }

    // 9. Par défaut : Erreur inconnue
    return {
      category: 'UNKNOWN',
      isRetryable: true,
      shouldCooldown: false,
      shouldDisableKey: false,
      shouldFallbackProvider: false,
      message: rawMessage || 'Erreur inconnue lors de l\'appel IA.',
      statusCode
    };
  }

  private static calculateCooldownSeconds(failureCount: number): number {
    if (failureCount <= 1) return 30;
    if (failureCount === 2) return 60;
    if (failureCount === 3) return 120;
    return 300; // 5 minutes max
  }
}
