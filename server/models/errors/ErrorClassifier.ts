import { ErrorCategory, ProviderErrorClassification } from '../types';

export class ErrorClassifier {
  /**
   * Analyse et classifie une erreur levée par un fournisseur d'IA
   */
  public static classify(error: unknown, failureCount = 1): ProviderErrorClassification {
    const rawMessage = error instanceof Error ? error.message : String(error);
    const lower = rawMessage.toLowerCase();

    // 1. Détection par code de statut HTTP
    const statusMatch = rawMessage.match(/\b(400|401|402|403|404|408|429|500|502|503|504)\b/);
    const statusCode = statusMatch ? parseInt(statusMatch[1], 10) : undefined;

    // 2. AUTH_ERROR (401 / 403 / Clé invalide / Révoquée / Interdite)
    // Règle stricte : la clé est immédiatement désactivée, aucune nouvelle tentative
    if (
      statusCode === 401 ||
      statusCode === 403 ||
      lower.includes('invalid api key') ||
      lower.includes('incorrect api key') ||
      lower.includes('invalid_api_key') ||
      lower.includes('unauthorized') ||
      lower.includes('authentication error') ||
      lower.includes('api_key_invalid') ||
      lower.includes('forbidden') ||
      lower.includes('permission_denied')
    ) {
      return {
        category: 'AUTH_ERROR',
        isRetryable: false,
        shouldCooldown: false,
        shouldDisableKey: true,
        shouldFallbackProvider: false,
        message: 'Clé API invalide ou accès refusé (401/403). Clé désactivée sans nouvelle tentative.',
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
    // Rotation transparente vers la clé suivante + cooldown exponentiel avec jitter
    if (
      statusCode === 429 ||
      lower.includes('rate limit') ||
      lower.includes('too many requests') ||
      lower.includes('rate_limit_exceeded') ||
      lower.includes('resource_exhausted') ||
      lower.includes('tokens per minute') ||
      lower.includes('requests per minute')
    ) {
      const cooldownSeconds = this.calculateCooldownWithJitter(failureCount);
      return {
        category: 'RATE_LIMIT',
        isRetryable: true,
        shouldCooldown: true,
        cooldownSeconds,
        shouldDisableKey: false,
        shouldFallbackProvider: false,
        message: `Limite de débit (429) atteinte. Cooldown exponentiel de ${cooldownSeconds}s activé.`,
        statusCode: 429
      };
    }

    // 5. TEMPORARY_PROVIDER_ERROR (500, 502, 503, 504 / Panne temporaire du fournisseur)
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
        message: 'Erreur temporaire du serveur fournisseur (5xx). Repli automatique.',
        statusCode: statusCode || 503
      };
    }

    // 6. NETWORK_ERROR (Timeout, déconnexion réseau, fetch failed)
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
        message: 'Erreur de connexion réseau ou délai d\'attente dépassé.',
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
        statusCode: 404
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

  /**
   * Calcul d'un cooldown exponentiel avec jitter aléatoire pour éviter les tempêtes de requêtes
   * Base: 30s, échec 1: ~30-35s, échec 2: ~60-65s, échec 3: ~120-125s, max 900s (15 min).
   */
  public static calculateCooldownWithJitter(failureCount: number): number {
    const base = 30;
    const exponent = Math.max(0, Math.min(failureCount - 1, 5));
    const exponentialValue = base * Math.pow(2, exponent);
    const jitter = Math.floor(Math.random() * 6); // 0 à 5 secondes de gigue
    return Math.min(900, exponentialValue + jitter);
  }
}
