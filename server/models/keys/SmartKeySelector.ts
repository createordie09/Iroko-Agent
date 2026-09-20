import { ProviderCredential, KeySelectionStrategy } from '../types';

export class SmartKeySelector {
  /**
   * Sélectionne la meilleure clé selon la stratégie configurée et l'état de santé
   */
  public static selectKey(
    candidates: ProviderCredential[],
    strategy: KeySelectionStrategy = 'SMART'
  ): ProviderCredential | null {
    const now = Date.now();

    // 1. Filtrer les clés éligibles
    const eligibleKeys = candidates.filter(key => {
      if (!key.enabled) return false;
      if (key.status === 'INVALID' || key.status === 'DISABLED' || key.status === 'QUOTA_EXHAUSTED') {
        return false;
      }

      // Si la clé est en cooldown, vérifier si le délai est expiré
      if (key.cooldownUntil && key.cooldownUntil > now) {
        return false;
      }

      return true;
    });

    if (eligibleKeys.length === 0) {
      return null;
    }

    // Si une seule clé est disponible
    if (eligibleKeys.length === 1) {
      return eligibleKeys[0];
    }

    // 2. Application de la stratégie de sélection
    switch (strategy) {
      case 'PRIORITY':
        // Priorité stricte (1 > 2 > 3), puis santé, puis moins sollicitée
        return [...eligibleKeys].sort((a, b) => {
          if (a.priority !== b.priority) return a.priority - b.priority;
          if (b.healthScore !== a.healthScore) return b.healthScore - a.healthScore;
          return a.activeRequests - b.activeRequests;
        })[0];

      case 'ROUND_ROBIN':
        // Rotation équitable : celle dont le lastUsedAt est le plus ancien
        return [...eligibleKeys].sort((a, b) => {
          const aTime = a.lastUsedAt || 0;
          const bTime = b.lastUsedAt || 0;
          return aTime - bTime;
        })[0];

      case 'HEALTHIEST':
        // Score de santé le plus élevé en priorité
        return [...eligibleKeys].sort((a, b) => {
          if (b.healthScore !== a.healthScore) return b.healthScore - a.healthScore;
          return a.activeRequests - b.activeRequests;
        })[0];

      case 'LEAST_RECENTLY_USED':
        return [...eligibleKeys].sort((a, b) => (a.lastUsedAt || 0) - (b.lastUsedAt || 0))[0];

      case 'SMART':
      default:
        // SMART : pondère la santé, la concurrence active, la priorité et la rotation
        return [...eligibleKeys].sort((a, b) => {
          // Si une clé a un score de santé critique (< 50) par rapport à une saine, privilégier la saine
          const aHealthy = a.healthScore >= 70;
          const bHealthy = b.healthScore >= 70;
          if (aHealthy && !bHealthy) return -1;
          if (!aHealthy && bHealthy) return 1;

          // Moins de requêtes concurrentes actives (répartition de charge)
          if (a.activeRequests !== b.activeRequests) {
            return a.activeRequests - b.activeRequests;
          }

          // Priorité configurée
          if (a.priority !== b.priority) {
            return a.priority - b.priority;
          }

          // Moindre sollicitation temporelle (rotation douce)
          const aTime = a.lastUsedAt || 0;
          const bTime = b.lastUsedAt || 0;
          return aTime - bTime;
        })[0];
    }
  }
}
