import { URL } from 'url';

export class SearchTracker {
  private static instance: SearchTracker;
  // Ensemble d'URLs normalisées autorisées
  private allowedUrls: Set<string> = new Set();
  // URLs associées par conversation
  private conversationUrls: Map<string, Set<string>> = new Map();

  private constructor() {}

  public static getInstance(): SearchTracker {
    if (!SearchTracker.instance) {
      SearchTracker.instance = new SearchTracker();
    }
    return SearchTracker.instance;
  }

  /**
   * Normalise une URL pour comparaison stricte (minuscules pour domaine, suppression des fragments et slashs finaux).
   */
  public normalizeUrl(rawUrl: string): string {
    try {
      const parsed = new URL(rawUrl.trim());
      // Protocole en minuscules, hôte en minuscules
      let clean = `${parsed.protocol}//${parsed.hostname.toLowerCase()}`;
      if (parsed.port) {
        clean += `:${parsed.port}`;
      }
      let pathname = parsed.pathname;
      if (pathname.length > 1 && pathname.endsWith('/')) {
        pathname = pathname.slice(0, -1);
      }
      clean += pathname;
      if (parsed.search) {
        clean += parsed.search;
      }
      return clean;
    } catch {
      return rawUrl.trim().toLowerCase();
    }
  }

  /**
   * Enregistre une ou plusieurs URLs autorisées (ex: issues de résultats de recherche).
   */
  public addUrls(urls: string[], conversationId?: string): void {
    for (const url of urls) {
      if (!url) continue;
      const normalized = this.normalizeUrl(url);

      if (this.allowedUrls.size >= 500 && !this.allowedUrls.has(normalized)) {
        const oldest = this.allowedUrls.values().next().value;
        if (oldest) this.allowedUrls.delete(oldest);
      }
      this.allowedUrls.add(normalized);

      if (conversationId) {
        if (!this.conversationUrls.has(conversationId)) {
          if (this.conversationUrls.size >= 50) {
            const oldestConv = this.conversationUrls.keys().next().value;
            if (oldestConv) this.conversationUrls.delete(oldestConv);
          }
          this.conversationUrls.set(conversationId, new Set());
        }
        const set = this.conversationUrls.get(conversationId)!;
        if (set.size >= 50 && !set.has(normalized)) {
          const first = set.values().next().value;
          if (first) set.delete(first);
        }
        set.add(normalized);
      }
    }
  }

  /**
   * Extrait et enregistre automatiquement les URLs fournies par l'utilisateur dans son message.
   */
  public registerUrlsFromUserPrompt(prompt: string, conversationId?: string): string[] {
    if (!prompt) return [];
    const urlRegex = /https?:\/\/[^\s<>"'()]+/gi;
    const matches = prompt.match(urlRegex) || [];
    this.addUrls(matches, conversationId);
    return matches;
  }

  /**
   * Vérifie si une URL est autorisée (vue dans un résultat web_search ou le message de l'utilisateur).
   */
  public isUrlAllowed(rawUrl: string, conversationId?: string): boolean {
    const normalized = this.normalizeUrl(rawUrl);
    if (this.allowedUrls.has(normalized)) {
      return true;
    }
    if (conversationId && this.conversationUrls.has(conversationId)) {
      if (this.conversationUrls.get(conversationId)!.has(normalized)) {
        return true;
      }
    }

    // Tolérer aussi sans paramètre de requête si l'URL de base est présente
    const urlWithoutQuery = normalized.split('?')[0];
    for (const allowed of this.allowedUrls) {
      if (allowed.split('?')[0] === urlWithoutQuery) {
        return true;
      }
    }

    return false;
  }

  /**
   * Réinitialise les URLs enregistrées (usage tests / purge de conversation).
   */
  public clear(conversationId?: string): void {
    if (conversationId) {
      this.conversationUrls.delete(conversationId);
    } else {
      this.allowedUrls.clear();
      this.conversationUrls.clear();
    }
  }
}

export const searchTracker = SearchTracker.getInstance();
