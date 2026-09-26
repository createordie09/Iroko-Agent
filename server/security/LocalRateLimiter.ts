/**
 * Limiteur de fréquence local avec délai d'attente progressif (§ Cahier des Charges & Mission R3a).
 * 
 * Protection en profondeur sur 127.0.0.1 contre un processus local malveillant ou une boucle infinie de requêtes.
 * Contrairement à un bannissement définitif, un délai d'attente progressif (backoff) est appliqué :
 * le client reçoit HTTP 429 avec l'en-tête Retry-After et retrouve l'accès dès l'expiration du délai.
 */
export interface RateLimiterOptions {
  windowMs?: number;        // Fenêtre temporelle d'évaluation (défaut: 10 000 ms = 10s)
  maxRequests?: number;     // Nombre de requêtes autorisées avant bridage (défaut: 10)
  baseDelayMs?: number;     // Délai de pénalité initial (défaut: 1 000 ms = 1s)
  maxDelayMs?: number;      // Plafond maximal du délai progressif (défaut: 30 000 ms = 30s)
}

export interface RateLimitCheckResult {
  allowed: boolean;
  retryAfterSeconds: number;
  currentDelayMs: number;
  attemptsCount: number;
}

interface ClientTracking {
  timestamps: number[];
  blockedUntil: number;
  excessCount: number;
  lastDelayMs: number;
}

export class LocalRateLimiter {
  private readonly windowMs: number;
  private readonly maxRequests: number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly clients = new Map<string, ClientTracking>();

  constructor(options: RateLimiterOptions = {}) {
    this.windowMs = options.windowMs ?? 10000;
    this.maxRequests = options.maxRequests ?? 10;
    this.baseDelayMs = options.baseDelayMs ?? 1000;
    this.maxDelayMs = options.maxDelayMs ?? 30000;
  }

  /**
   * Vérifie si une requête est autorisée pour la clé client donnée (ex. IP locale).
   */
  public check(clientKey = '127.0.0.1'): RateLimitCheckResult {
    const now = Date.now();
    let tracking = this.clients.get(clientKey);

    if (!tracking) {
      tracking = {
        timestamps: [],
        blockedUntil: 0,
        excessCount: 0,
        lastDelayMs: 0
      };
      this.clients.set(clientKey, tracking);
    }

    // Élagage des horodatages antérieurs à la fenêtre glissante
    tracking.timestamps = tracking.timestamps.filter((t) => now - t < this.windowMs);

    // Si le client est actuellement dans sa période de temporisation progressive
    if (tracking.blockedUntil && now < tracking.blockedUntil) {
      const remainingMs = tracking.blockedUntil - now;
      const retryAfterSeconds = Math.max(1, Math.ceil(remainingMs / 1000));
      return {
        allowed: false,
        retryAfterSeconds,
        currentDelayMs: tracking.lastDelayMs,
        attemptsCount: tracking.timestamps.length
      };
    }

    // Enregistrement de la nouvelle tentative
    tracking.timestamps.push(now);

    // Si le volume reste sous le seuil autorisé
    if (tracking.timestamps.length <= this.maxRequests) {
      tracking.excessCount = 0;
      tracking.blockedUntil = 0;
      tracking.lastDelayMs = 0;
      return {
        allowed: true,
        retryAfterSeconds: 0,
        currentDelayMs: 0,
        attemptsCount: tracking.timestamps.length
      };
    }

    // Dépassement constaté : calcul du délai d'attente progressif
    tracking.excessCount++;
    // Calcul exponentiel doux : baseDelayMs * 1.5^(excessCount - 1)
    const delayMs = Math.min(
      Math.round(this.baseDelayMs * Math.pow(1.5, tracking.excessCount - 1)),
      this.maxDelayMs
    );
    tracking.lastDelayMs = delayMs;
    tracking.blockedUntil = now + delayMs;
    const retryAfterSeconds = Math.max(1, Math.ceil(delayMs / 1000));

    return {
      allowed: false,
      retryAfterSeconds,
      currentDelayMs: delayMs,
      attemptsCount: tracking.timestamps.length
    };
  }

  /**
   * Réinitialise le suivi d'un client ou de tous les clients.
   */
  public reset(clientKey?: string): void {
    if (clientKey) {
      this.clients.delete(clientKey);
    } else {
      this.clients.clear();
    }
  }

  /**
   * Retourne l'état courant d'un client sans incrémenter de requête.
   */
  public getStatus(clientKey = '127.0.0.1'): { isBlocked: boolean; retryAfterSeconds: number; attemptsCount: number } {
    const now = Date.now();
    const tracking = this.clients.get(clientKey);
    if (!tracking) {
      return { isBlocked: false, retryAfterSeconds: 0, attemptsCount: 0 };
    }
    const isBlocked = Boolean(tracking.blockedUntil && now < tracking.blockedUntil);
    const retryAfterSeconds = isBlocked ? Math.max(1, Math.ceil((tracking.blockedUntil - now) / 1000)) : 0;
    const activeAttempts = tracking.timestamps.filter((t) => now - t < this.windowMs).length;
    return { isBlocked, retryAfterSeconds, attemptsCount: activeAttempts };
  }
}
