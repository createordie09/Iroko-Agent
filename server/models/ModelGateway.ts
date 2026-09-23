import { ModelRequest, StreamChunk, KeySelectionStrategy, FallbackPolicy, CredentialValidationResult, ModelInfo } from './types';
import { modelRouter, ModelRouter } from './router/ModelRouter';
import { keyPoolManager, KeyPoolManager } from './keys/KeyPoolManager';
import { modelCatalogManager, ModelCatalogManager } from './catalog/ModelCatalogManager';
import { getProviderPreset } from './providers/presets';
import { logger } from '../utils/logger';

export * from './modelFormatter';
import { FormattedModel, formatModelLabel } from './modelFormatter';

export interface ProviderInfo {
  id: string;
  name: string;
  description?: string;
  baseUrl?: string;
  requiresKey?: boolean;
  defaultModel?: string;
  keyCount: number;
  activeKeys: number;
  status: 'NOT_CONFIGURED' | 'CONFIGURED' | 'VALIDATING' | 'READY' | 'RATE_LIMITED' | 'ERROR';
  docsUrl?: string;
  isLocal: boolean;
  modelsCount: number;
}

export class ModelGateway {
  public readonly router: ModelRouter;
  public readonly keyPool: KeyPoolManager;
  public readonly catalog: ModelCatalogManager;

  constructor() {
    this.router = modelRouter;
    this.keyPool = keyPoolManager;
    this.catalog = modelCatalogManager;
    this.catalog.initialize().catch(() => {});
  }

  public getAvailableProviders(): ProviderInfo[] {
    return this.router.getAllProviders().map(p => {
      const keys = this.keyPool.getKeysByProvider(p.id);
      const activeKeys = keys.filter(k => k.enabled && k.status === 'ACTIVE').length;
      const preset = getProviderPreset(p.id);
      const catalogModels = this.catalog.getModels({ provider: p.id, view: 'all' });

      let status: 'NOT_CONFIGURED' | 'CONFIGURED' | 'VALIDATING' | 'READY' | 'RATE_LIMITED' | 'ERROR' = 'NOT_CONFIGURED';

      if (p.id === 'mock') {
        status = 'READY';
      } else if (preset?.isLocal) {
        status = 'READY';
      } else if (keys.length === 0) {
        status = 'NOT_CONFIGURED';
      } else if (activeKeys > 0) {
        status = 'READY';
      } else if (keys.some(k => k.status === 'RATE_LIMITED')) {
        status = 'RATE_LIMITED';
      } else if (keys.some(k => k.status === 'INVALID' || k.status === 'ERROR')) {
        status = 'ERROR';
      } else {
        status = 'CONFIGURED';
      }

      return {
        id: p.id,
        name: p.name,
        description: preset?.description,
        baseUrl: preset?.baseUrl,
        requiresKey: preset?.requiresKey !== false,
        defaultModel: preset?.defaultModel,
        keyCount: keys.length,
        activeKeys: p.id === 'mock' ? 1 : activeKeys,
        status,
        docsUrl: preset?.docsUrl,
        isLocal: preset?.isLocal || false,
        modelsCount: catalogModels.length
      };
    });
  }

  public getDefaultProvider(): { id: string; name: string } {
    const list = this.getAvailableProviders();
    // Préférer le premier provider disposant de clés actives
    const best = list.find(p => p.id !== 'mock' && p.activeKeys > 0);
    if (best) return best;
    const firstNonMock = list.find(p => p.id !== 'mock');
    return firstNonMock || { id: 'mock', name: 'Moteur hors-ligne' };
  }

  /**
   * Retourne la liste dynamique des modèles réels disponibles pour les fournisseurs connectés
   */
  public async getAvailableModels(): Promise<FormattedModel[]> {
    const providers = this.getAvailableProviders().filter(p => p.id !== 'mock');
    const connectedProviders = providers.filter(p => p.activeKeys > 0);

    if (connectedProviders.length === 0) {
      return [];
    }

    const models: FormattedModel[] = [];

    for (const pMeta of connectedProviders) {
      // 1. Consulter d'abord le catalogue curé pour ce provider
      const catalogModels = this.catalog.getModels({ provider: pMeta.id, view: 'short' });
      if (catalogModels.length > 0) {
        for (const cm of catalogModels) {
          models.push({
            id: cm.id,
            name: cm.name,
            note: cm.publisher || pMeta.name,
            providerId: cm.providerId,
            publisher: cm.publisher,
            contextWindow: cm.contextWindow,
            maxOutputTokens: cm.maxOutputTokens,
            capabilities: cm.capabilities,
            pricing: cm.pricing,
            priceTier: cm.priceTier,
            isCurated: cm.isCurated,
            isFavorite: cm.isFavorite,
            isHidden: cm.isHidden
          });
        }
      } else {
        // Fallback dynamique
        const provider = this.router.getProvider(pMeta.id);
        if (!provider) continue;

        try {
          const rawModels = await provider.listModels();
          for (const rawId of rawModels) {
            const fullId = rawId.includes('/') ? rawId : `${provider.id}/${rawId}`;
            models.push(formatModelLabel(fullId, provider.name));
          }
        } catch {}
      }
    }

    return models;
  }

  /**
   * Retourne la liste filtrée du catalogue de modèles (vue courte ou complète, filtre provider, recherche)
   */
  public getModels(filter?: {
    provider?: string;
    view?: 'short' | 'all';
    q?: string;
    includeHidden?: boolean;
  }): FormattedModel[] {
    const catalogModels = this.catalog.getModels(filter);
    return catalogModels.map(cm => ({
      id: cm.id,
      name: cm.name,
      note: cm.publisher || cm.providerId,
      providerId: cm.providerId,
      publisher: cm.publisher,
      contextWindow: cm.contextWindow,
      maxOutputTokens: cm.maxOutputTokens,
      capabilities: cm.capabilities,
      pricing: cm.pricing,
      priceTier: cm.priceTier,
      isCurated: cm.isCurated,
      isFavorite: cm.isFavorite,
      isHidden: cm.isHidden
    }));
  }

  /**
   * Déclenche un rafraîchissement du catalogue depuis les fournisseurs
   */
  public async refreshCatalog(providerId?: string): Promise<{ total: number; byProvider: Record<string, number> }> {
    const byProvider: Record<string, number> = {};
    let total = 0;

    const targets = providerId
      ? [this.router.getProvider(providerId)].filter(Boolean)
      : this.router.getAllProviders().filter(p => p.id !== 'mock');

    for (const provider of targets) {
      if (!provider) continue;
      try {
        const rawModels = await provider.listModels();
        const refreshed = await this.catalog.refreshProvider(provider.id, rawModels);
        byProvider[provider.id] = refreshed.length;
        total += refreshed.length;
      } catch (err: any) {
        logger.warn(`Erreur lors du rafraîchissement de ${provider.name} : ${err.message}`);
        byProvider[provider.id] = 0;
      }
    }

    return { total, byProvider };
  }

  /**
   * Met à jour les préférences (favori, masqué) d'un modèle
   */
  public updateModelPreferences(modelId: string, preferences: { isFavorite?: boolean; isHidden?: boolean }): boolean {
    return this.catalog.updatePreferences(modelId, preferences);
  }

  /**
   * Sélection intelligente du modèle par défaut selon les métadonnées et la disponibilité
   */
  public getSmartDefaultModel(conversationModelId?: string): FormattedModel | null {
    const activeProviders = this.getAvailableProviders()
      .filter(p => p.status === 'READY')
      .map(p => p.id);

    const best = this.catalog.getSmartDefaultModel(conversationModelId, activeProviders);
    if (!best) return null;

    return {
      id: best.id,
      name: best.name,
      note: best.publisher || best.providerId,
      providerId: best.providerId,
      publisher: best.publisher,
      contextWindow: best.contextWindow,
      maxOutputTokens: best.maxOutputTokens,
      capabilities: best.capabilities,
      pricing: best.pricing,
      priceTier: best.priceTier,
      isCurated: best.isCurated,
      isFavorite: best.isFavorite,
      isHidden: best.isHidden
    };
  }

  /**
   * Génération streamée avec résolution dynamique de provider et de clé saine
   */
  public async *generateStream(
    request: ModelRequest,
    preferredProviderId?: string,
    strategy?: KeySelectionStrategy
  ): AsyncIterable<StreamChunk> {
    yield* this.router.generateStream(request, preferredProviderId, strategy);
  }

  /**
   * Valide une clé API directement auprès du fournisseur
   */
  public async testCredential(providerId: string, rawKey: string): Promise<CredentialValidationResult> {
    const provider = this.router.getProvider(providerId);
    if (!provider) {
      return { valid: false, error: `Fournisseur inconnu : "${providerId}"` };
    }
    return provider.validateCredential(rawKey);
  }

  public getFallbackPolicy(): FallbackPolicy {
    return this.router.getFallbackPolicy();
  }

  public setFallbackPolicy(policy: Partial<FallbackPolicy>): void {
    this.router.setFallbackPolicy(policy);
  }
}

export const modelGateway = new ModelGateway();

