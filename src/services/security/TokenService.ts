/**
 * Service de gestion sécurisée du jeton d'authentification en mémoire vive (§26).
 * Le jeton éphémère n'est JAMAIS consigné dans localStorage ni exposé dans les URLs.
 */
class TokenService {
  private token: string | null = null;
  private workspace: string = '';
  private bootstrapPromise: Promise<string> | null = null;

  /**
   * Amorçage sécurisé : appelle /api/bootstrap via le proxy same-origin de Vite
   */
  public async bootstrap(): Promise<string> {
    if (this.token) return this.token;
    if (this.bootstrapPromise) return this.bootstrapPromise;

    this.bootstrapPromise = (async () => {
      try {
        const res = await fetch('/api/bootstrap', {
          method: 'GET',
          headers: {
            'Accept': 'application/json'
          }
        });

        if (!res.ok) {
          throw new Error(`Échec d'amorçage runtime (HTTP ${res.status})`);
        }

        const data = await res.json();
        if (!data.token) {
          throw new Error('Jeton absent dans la réponse d\'amorçage');
        }

        this.token = data.token;
        this.workspace = data.workspace || '';
        return this.token;
      } finally {
        this.bootstrapPromise = null;
      }
    })();

    return this.bootstrapPromise;
  }

  /** Oublie le jeton en mémoire : le prochain appel ré-amorce auprès du daemon */
  public invalidate(): void {
    this.token = null;
  }

  public getToken(): string | null {
    return this.token;
  }

  public getWorkspace(): string {
    return this.workspace;
  }

  public setToken(token: string): void {
    this.token = token;
  }

  /**
   * Obtient un ticket WebSocket à usage unique (valable 30s) pour le handshake
   */
  public async getWsTicket(): Promise<string> {
    const requestTicket = async () => {
      const token = await this.bootstrap();
      return fetch('/api/ws-ticket', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Iroko-Request': '1',
          'Content-Type': 'application/json'
        }
      });
    };
    let res = await requestTicket();
    // Jeton périmé (redémarrage du daemon) : ré-amorçage unique puis nouvelle tentative
    if (res.status === 401) {
      this.invalidate();
      res = await requestTicket();
    }

    if (!res.ok) {
      throw new Error(`Impossible d'obtenir un ticket WebSocket (HTTP ${res.status})`);
    }

    const data = await res.json();
    return data.ticket;
  }

  /**
   * En-têtes d'authentification stricts pour les requêtes HTTP de l'agent
   */
  public async getHeaders(isWrite = false): Promise<Record<string, string>> {
    const token = await this.bootstrap();
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json'
    };
    if (isWrite) {
      headers['X-Iroko-Request'] = '1';
      headers['Content-Type'] = 'application/json';
    }
    return headers;
  }

  /**
   * Requête HTTP authentifiée simplifiée
   */
  public async fetch(url: string, init?: RequestInit): Promise<Response> {
    const isWrite = ['POST', 'PUT', 'PATCH', 'DELETE'].includes((init?.method || 'GET').toUpperCase());
    const authHeaders = await this.getHeaders(isWrite);
    const mergedHeaders = {
      ...authHeaders,
      ...(init?.headers as Record<string, string> || {})
    };

    const res = await fetch(url, {
      ...init,
      headers: mergedHeaders
    });
    // Jeton périmé (redémarrage du daemon par le superviseur) : ré-amorçage unique puis rejeu
    if (res.status === 401) {
      this.invalidate();
      const freshHeaders = await this.getHeaders(isWrite);
      return fetch(url, {
        ...init,
        headers: { ...freshHeaders, ...(init?.headers as Record<string, string> || {}) }
      });
    }
    return res;
  }

  /**
   * Requête authentifiée qui échoue explicitement si la réponse n'est pas un succès :
   * le message d'erreur du serveur (champ `error`) est repris, sinon le libellé de repli.
   */
  public async fetchChecked(url: string, init?: RequestInit, fallbackMessage = 'Action refusée par le runtime local.'): Promise<Response> {
    const res = await this.fetch(url, init);
    if (!res.ok) {
      let detail = '';
      try {
        const data = await res.clone().json();
        if (data && typeof data.error === 'string') detail = data.error;
      } catch {}
      throw new Error(detail || `${fallbackMessage} (HTTP ${res.status})`);
    }
    return res;
  }
}

export const tokenService = new TokenService();
