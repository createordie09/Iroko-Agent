import { URL } from 'url';

/**
 * Garde Réseau Runtime (docs/NETWORK.md, Cahier des charges §26)
 *
 * Intercepte et valide l'ensemble des requêtes réseau sortantes du runtime.
 * Toute requête sortant vers un domaine ou une adresse non répertoriée
 * dans la liste blanche stricte est immédiatement rejetée avec une erreur explicite.
 */
export class NetworkGuard {
  private static instance: NetworkGuard;
  private originalFetch: typeof globalThis.fetch | null = null;
  private dynamicAllowedHosts: Set<string> = new Set();
  private requestLog: Array<{ url: string; timestamp: string; allowed: boolean }> = [];

  // Destinations réseau fixes autorisées par le cahier des charges et docs/NETWORK.md
  private static readonly STATIC_ALLOWED_HOSTS: Set<string> = new Set([
    '127.0.0.1',
    'localhost',
    'api.anthropic.com',
    'api.openai.com',
    'generativelanguage.googleapis.com',
    'openrouter.ai',
    'api.cloudflare.com',
    'api.replicate.com',
    'queue.fal.run'
  ]);

  private constructor() {}

  public static getInstance(): NetworkGuard {
    if (!NetworkGuard.instance) {
      NetworkGuard.instance = new NetworkGuard();
    }
    return NetworkGuard.instance;
  }

  /**
   * Enregistre un hôte supplémentaire explicitement configuré par l'utilisateur
   * (ex: serveur d'inférence personnalisé, serveur MCP distant).
   */
  public allowCustomHost(hostOrUrl: string): void {
    try {
      if (hostOrUrl.startsWith('http://') || hostOrUrl.startsWith('https://')) {
        const parsed = new URL(hostOrUrl);
        this.dynamicAllowedHosts.add(parsed.hostname.toLowerCase());
      } else {
        const clean = hostOrUrl.split(':')[0].toLowerCase().trim();
        if (clean) this.dynamicAllowedHosts.add(clean);
      }
    } catch {
      // Ignorer les entrées invalides
    }
  }

  /**
   * Vérifie si une destination est autorisée selon la liste blanche.
   */
  public isDestinationAllowed(targetUrl: string | URL): { allowed: boolean; hostname: string; reason?: string } {
    let hostname = '';
    try {
      if (typeof targetUrl === 'string') {
        // Gérer les URL relatives ou sans protocole
        if (targetUrl.startsWith('/')) {
          return { allowed: true, hostname: '127.0.0.1' };
        }
        const parsed = new URL(targetUrl);
        hostname = parsed.hostname.toLowerCase();
      } else {
        hostname = targetUrl.hostname.toLowerCase();
      }
    } catch (err: any) {
      return {
        allowed: false,
        hostname: 'invalid',
        reason: `URL invalide : ${err.message}`
      };
    }

    // 1. Vérification contre la liste blanche statique
    if (NetworkGuard.STATIC_ALLOWED_HOSTS.has(hostname)) {
      return { allowed: true, hostname };
    }

    // 2. Vérification contre les sous-domaines autorisés (ex: *.fal.run)
    for (const allowed of NetworkGuard.STATIC_ALLOWED_HOSTS) {
      if (hostname.endsWith('.' + allowed)) {
        return { allowed: true, hostname };
      }
    }

    // 3. Vérification contre les hôtes dynamiques explicitement configurés
    if (this.dynamicAllowedHosts.has(hostname)) {
      return { allowed: true, hostname };
    }
    for (const custom of this.dynamicAllowedHosts) {
      if (hostname.endsWith('.' + custom)) {
        return { allowed: true, hostname };
      }
    }

    return {
      allowed: false,
      hostname,
      reason: `Hôte non autorisé ("${hostname}"). Conformément à docs/NETWORK.md, aucun trafic sortant externe non homologué n'est toléré.`
    };
  }

  /**
   * Installe le garde réseau global sur globalThis.fetch.
   */
  public install(): void {
    if (this.originalFetch) return; // Déjà installé

    this.originalFetch = globalThis.fetch;
    const self = this;

    globalThis.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
      let targetUrl = '';
      if (typeof input === 'string') {
        targetUrl = input;
      } else if (input instanceof URL) {
        targetUrl = input.toString();
      } else if (input && typeof (input as Request).url === 'string') {
        targetUrl = (input as Request).url;
      }

      const check = self.isDestinationAllowed(targetUrl);
      const timestamp = new Date().toISOString();

      self.requestLog.push({
        url: targetUrl,
        timestamp,
        allowed: check.allowed
      });

      // Garder les 200 dernières entrées du journal d'audit réseau
      if (self.requestLog.length > 200) {
        self.requestLog.shift();
      }

      if (!check.allowed) {
        const error = new Error(`[Garde Réseau] Accès réseau refusé vers "${check.hostname}". ${check.reason}`);
        (error as any).code = 'ERR_NETWORK_GUARD_BLOCKED';
        throw error;
      }

      return self.originalFetch!.call(this, input, init);
    };
  }

  /**
   * Désinstalle le garde réseau (restaure le fetch natif).
   */
  public uninstall(): void {
    if (this.originalFetch) {
      globalThis.fetch = this.originalFetch;
      this.originalFetch = null;
    }
  }

  /**
   * Retourne l'historique des requêtes interceptées par le garde réseau.
   */
  public getAuditLog(): ReadonlyArray<{ url: string; timestamp: string; allowed: boolean }> {
    return [...this.requestLog];
  }

  /**
   * Réinitialise le journal d'audit réseau.
   */
  public clearAuditLog(): void {
    this.requestLog = [];
  }
}

export const networkGuard = NetworkGuard.getInstance();
