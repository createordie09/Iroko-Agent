import { URL } from 'url';
import { SearchResultItem, SearchQueryOptions, SearchProviderInfo, WebSearchPermission } from './types';
import { SEARCH_PRESETS, getSearchPreset } from './SearchPresets';
import { searchTracker } from './SearchTracker';
import { keyPoolManager, KeyPoolManager } from '../models/keys/KeyPoolManager';
import { runtimeDatabase, RuntimeDatabase } from '../storage/RuntimeDatabase';
import { logger } from '../utils/logger';

export class SearchGateway {
  private static instance: SearchGateway;
  private keyPool: KeyPoolManager;
  private db: RuntimeDatabase;
  private mockHandler: ((query: string, options?: SearchQueryOptions) => Promise<SearchResultItem[]>) | null = null;
  private mockEnabled = false;

  private constructor() {
    this.keyPool = keyPoolManager;
    this.db = runtimeDatabase;
  }

  public static getInstance(): SearchGateway {
    if (!SearchGateway.instance) {
      SearchGateway.instance = new SearchGateway();
    }
    return SearchGateway.instance;
  }

  public getPermission(): WebSearchPermission {
    try {
      const val = this.db.getSetting('web_search_permission');
      if (val === 'auto' || val === 'disabled') return val;
      return 'ask';
    } catch {
      return 'ask';
    }
  }

  public setPermission(perm: WebSearchPermission): void {
    this.db.setSetting('web_search_permission', perm);
  }

  public getActiveProviderId(): string | null {
    try {
      const saved = this.db.getSetting('active_search_provider');
      if (typeof saved === 'string' && saved) return saved;
    } catch {}

    // Par défaut, retourner le premier fournisseur disposant d'une clé active
    for (const preset of SEARCH_PRESETS) {
      if (preset.id === 'mock_search' && this.mockEnabled) return preset.id;
      const keys = this.keyPool.getKeysByProvider(preset.id);
      if (keys.some(k => k.enabled && k.status !== 'INVALID')) {
        return preset.id;
      }
    }
    return null;
  }

  public setActiveProviderId(id: string): void {
    this.db.setSetting('active_search_provider', id);
  }

  public hasConfiguredProvider(): boolean {
    if (this.mockEnabled) return true;
    for (const preset of SEARCH_PRESETS) {
      if (preset.id === 'mock_search') continue;
      const keys = this.keyPool.getKeysByProvider(preset.id);
      if (keys.some(k => k.enabled && k.status !== 'INVALID')) {
        return true;
      }
      if (preset.id === 'custom_search') {
        const customUrl = this.db.getSetting('custom_search_url') as string;
        if (customUrl && customUrl.trim().length > 0) return true;
      }
    }
    return false;
  }

  public listProviders(): SearchProviderInfo[] {
    const isTest = process.env.NODE_ENV === 'test' || process.env.IROKO_TEST_MODE === '1';
    const presets = isTest ? SEARCH_PRESETS : SEARCH_PRESETS.filter(p => p.id !== 'mock_search');
    const activeId = this.getActiveProviderId();
    return presets.map(preset => {
      const keys = this.keyPool.getKeysByProvider(preset.id);
      const hasKey = keys.length > 0;
      const maskedKey = hasKey ? keys[0].maskedKey : undefined;

      let status: 'NOT_CONFIGURED' | 'CONFIGURED' | 'READY' | 'ERROR' = 'NOT_CONFIGURED';
      if (preset.id === 'mock_search') {
        status = this.mockEnabled ? 'READY' : 'NOT_CONFIGURED';
      } else if (preset.id === 'custom_search') {
        const customUrl = (this.db.getSetting('custom_search_url') as string) || '';
        status = customUrl.trim().length > 0 ? 'READY' : 'NOT_CONFIGURED';
      } else if (hasKey) {
        const active = keys.find(k => k.enabled && k.status !== 'INVALID');
        status = active ? 'READY' : 'ERROR';
      }

      return {
        id: preset.id,
        name: preset.name,
        description: preset.description,
        baseUrl: preset.baseUrl,
        isLocal: preset.isLocal,
        requiresKey: preset.requiresKey,
        docsUrl: preset.docsUrl,
        hasKey,
        maskedKey,
        status
      };
    });
  }

  public enableMock(enabled: boolean, handler?: (query: string, options?: SearchQueryOptions) => Promise<SearchResultItem[]>): void {
    this.mockEnabled = enabled;
    if (handler) {
      this.mockHandler = handler;
    }
  }

  /**
   * Exécute une recherche web via le fournisseur actif avec post-traitement déterministe.
   */
  public async search(query: string, options: SearchQueryOptions = {}): Promise<SearchResultItem[]> {
    if (this.getPermission() === 'disabled') {
      throw new Error('La recherche web est désactivée dans les paramètres.');
    }

    const trimmedQuery = query ? query.trim() : '';
    if (!trimmedQuery) {
      return [];
    }

    const providerId = this.getActiveProviderId();
    if (!providerId) {
      throw new Error('Aucun fournisseur de recherche configuré.');
    }

    let rawResults: SearchResultItem[] = [];

    if (this.mockEnabled || providerId === 'mock_search') {
      if (this.mockHandler) {
        rawResults = await this.mockHandler(trimmedQuery, options);
      } else {
        rawResults = this.getDefaultMockResults(trimmedQuery);
      }
    } else if (providerId === 'brave') {
      rawResults = await this.searchBrave(trimmedQuery, options);
    } else if (providerId === 'tavily') {
      rawResults = await this.searchTavily(trimmedQuery, options);
    } else if (providerId === 'custom_search') {
      rawResults = await this.searchCustom(trimmedQuery, options);
    } else {
      throw new Error(`Fournisseur de recherche non reconnu : "${providerId}".`);
    }

    // Post-traitement déterministe obligatoire (Point 2) :
    // 1. Ordre conservé tel que renvoyé par le fournisseur
    // 2. Déduplication par domaine (1 résultat par domaine hôte)
    // 3. Troncature du snippet à ~300 caractères
    // 4. Plafond strict de 8 résultats
    const seenDomains = new Set<string>();
    const deduplicated: SearchResultItem[] = [];
    const maxResults = Math.min(options.count || 8, 8);

    for (const item of rawResults) {
      if (!item.url) continue;
      let domain = '';
      try {
        domain = new URL(item.url).hostname.toLowerCase();
      } catch {
        continue; // URL invalide ignorée
      }

      if (seenDomains.has(domain)) {
        continue; // Déduplication par domaine
      }
      seenDomains.add(domain);

      const snippet = item.snippet ? item.snippet.slice(0, 300).trim() : '';
      deduplicated.push({
        url: item.url,
        title: item.title || domain,
        snippet,
        publishedDate: item.publishedDate,
        source: item.source || providerId
      });

      if (deduplicated.length >= maxResults) {
        break;
      }
    }

    // Enregistrer les URLs retournées dans le SearchTracker pour web_fetch
    searchTracker.addUrls(deduplicated.map(r => r.url));

    return deduplicated;
  }

  private async searchBrave(query: string, options: SearchQueryOptions): Promise<SearchResultItem[]> {
    const keys = this.keyPool.getKeysByProvider('brave');
    const active = keys.find(k => k.enabled && k.status !== 'INVALID');
    if (!active) {
      throw new Error('Aucune clé API configurée pour Brave Search.');
    }
    const apiKey = this.keyPool.getDecryptedKey(active.id);
    if (!apiKey) {
      throw new Error('Impossible de déchiffrer la clé API Brave Search.');
    }

    const count = Math.min(options.count || 8, 8);
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`;

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'GET',
        headers: {
          'X-Subscription-Token': apiKey,
          'Accept': 'application/json'
        }
      });
    } catch (err: any) {
      throw new Error(`Échec de connexion à Brave Search : ${err.message}`);
    }

    if (!res.ok) {
      this.handleHttpError(res.status, 'Brave Search');
    }

    const data: any = await res.json();
    const results: SearchResultItem[] = [];
    const webResults = data?.web?.results || [];

    for (const item of webResults) {
      results.push({
        url: item.url,
        title: item.title,
        snippet: item.description || '',
        publishedDate: item.page_age,
        source: 'brave'
      });
    }

    return results;
  }

  private async searchTavily(query: string, options: SearchQueryOptions): Promise<SearchResultItem[]> {
    const keys = this.keyPool.getKeysByProvider('tavily');
    const active = keys.find(k => k.enabled && k.status !== 'INVALID');
    if (!active) {
      throw new Error('Aucune clé API configurée pour Tavily.');
    }
    const apiKey = this.keyPool.getDecryptedKey(active.id);
    if (!apiKey) {
      throw new Error('Impossible de déchiffrer la clé API Tavily.');
    }

    const count = Math.min(options.count || 8, 8);
    const url = 'https://api.tavily.com/search';

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          api_key: apiKey,
          query,
          max_results: count
        })
      });
    } catch (err: any) {
      throw new Error(`Échec de connexion à Tavily : ${err.message}`);
    }

    if (!res.ok) {
      this.handleHttpError(res.status, 'Tavily');
    }

    const data: any = await res.json();
    const results: SearchResultItem[] = [];
    const tavilyResults = data?.results || [];

    for (const item of tavilyResults) {
      results.push({
        url: item.url,
        title: item.title,
        snippet: item.content || '',
        publishedDate: item.published_date,
        source: 'tavily'
      });
    }

    return results;
  }

  private async searchCustom(query: string, options: SearchQueryOptions): Promise<SearchResultItem[]> {
    const customUrl = (this.db.getSetting('custom_search_url') as string) || '';
    if (!customUrl.trim()) {
      throw new Error('URL de recherche personnalisée non configurée.');
    }

    const keys = this.keyPool.getKeysByProvider('custom_search');
    const headers: Record<string, string> = { 'Accept': 'application/json' };
    if (keys.length > 0 && keys[0].enabled) {
      const key = this.keyPool.getDecryptedKey(keys[0].id);
      if (key) {
        headers['Authorization'] = `Bearer ${key}`;
      }
    }

    const count = Math.min(options.count || 8, 8);
    const delim = customUrl.includes('?') ? '&' : '?';
    const targetUrl = `${customUrl}${delim}q=${encodeURIComponent(query)}&count=${count}`;

    let res: Response;
    try {
      res = await fetch(targetUrl, { method: 'GET', headers });
    } catch (err: any) {
      throw new Error(`Échec de connexion au service de recherche personnalisé : ${err.message}`);
    }

    if (!res.ok) {
      this.handleHttpError(res.status, 'Recherche personnalisée');
    }

    const data: any = await res.json();
    const list = Array.isArray(data) ? data : data?.results || [];
    return list.map((item: any) => ({
      url: item.url,
      title: item.title || '',
      snippet: item.snippet || item.content || item.description || '',
      publishedDate: item.publishedDate || item.published_date,
      source: 'custom_search'
    }));
  }

  private handleHttpError(statusCode: number, providerName: string): never {
    if (statusCode === 401 || statusCode === 403) {
      throw new Error(`Clé API invalide ou expirée pour ${providerName}.`);
    }
    if (statusCode === 429) {
      throw new Error(`Quota de requêtes de recherche atteint pour ${providerName}. Veuillez réessayer ultérieurement.`);
    }
    if (statusCode === 400) {
      throw new Error(`Requête de recherche invalide auprès de ${providerName}.`);
    }
    throw new Error(`Erreur du service de recherche ${providerName} (code HTTP ${statusCode}).`);
  }

  private getDefaultMockResults(query: string): SearchResultItem[] {
    return [
      {
        url: 'https://developer.mozilla.org/fr/docs/Web/JavaScript',
        title: 'JavaScript - MDN Web Docs',
        snippet: `Documentation de référence pour JavaScript (${query}) par MDN. Guide complet pour les développeurs web modernes.`,
        source: 'mock_search'
      },
      {
        url: 'https://fr.wikipedia.org/wiki/JavaScript',
        title: 'JavaScript — Wikipédia',
        snippet: 'JavaScript est un langage de programmation de scripts principalement employé dans les pages web interactives.',
        source: 'mock_search'
      },
      {
        url: 'https://nodejs.org/fr',
        title: 'Node.js — Environnement d\'exécution JavaScript',
        snippet: 'Node.js est un environnement d\'exécution JavaScript asynchrone orienté événements bâti sur le moteur V8 de Chrome.',
        source: 'mock_search'
      }
    ];
  }
}

export const searchGateway = SearchGateway.getInstance();
