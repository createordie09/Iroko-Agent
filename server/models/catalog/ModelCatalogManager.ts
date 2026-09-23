import { ModelInfo, ModelPriceTier, ModelPricing } from './types';
import { CURATION_LIMITS, EXCLUDED_MODEL_KEYWORDS, normalizePublisher } from './curationConstants';
import { runtimeDatabase, DbCatalogModel } from '../../storage/RuntimeDatabase';
import { getModelCapabilities } from '../types';
import { formatModelLabel } from '../modelFormatter';
import { getAllProviderPresets, getProviderPreset } from '../providers/presets';
import { logger } from '../../utils/logger';

export class ModelCatalogManager {
  private cache: Map<string, ModelInfo> = new Map();
  private isInitialized = false;
  private backgroundTimer: NodeJS.Timeout | null = null;

  constructor() {}

  /**
   * Initialise le catalogue : charge la persistance SQLite et insère les seeds des presets si vide
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) return;

    this.loadFromDatabase();

    // Si la base est encore vide (premier lancement), charger les modèles initiaux issus des presets
    if (this.cache.size === 0) {
      this.seedFromPresets();
    }

    this.isInitialized = true;
    this.startBackgroundRefresh();
  }

  private loadFromDatabase(): void {
    try {
      const rows = runtimeDatabase.listCatalogModels({ includeHidden: true });
      this.cache.clear();
      for (const row of rows) {
        const model = this.dbRowToModelInfo(row);
        this.cache.set(model.id, model);
      }
    } catch (err: any) {
      logger.warn(`Erreur lors du chargement du catalogue SQLite : ${err.message}`);
    }
  }

  private dbRowToModelInfo(row: DbCatalogModel): ModelInfo {
    let capabilities = { vision: false, nativePdf: false, audio: false, video: false, tools: true, reasoning: false };
    try {
      if (row.capabilities_json) capabilities = JSON.parse(row.capabilities_json);
    } catch {}

    let pricing: ModelPricing | undefined = undefined;
    try {
      if (row.pricing_json) pricing = JSON.parse(row.pricing_json);
    } catch {}

    return {
      id: row.id,
      providerId: row.provider_id,
      rawId: row.raw_id,
      name: row.name,
      publisher: row.publisher,
      description: row.description || undefined,
      contextWindow: row.context_window,
      maxOutputTokens: row.max_output_tokens || undefined,
      capabilities,
      pricing,
      priceTier: row.price_tier,
      isCurated: row.is_curated === 1,
      isFavorite: row.is_favorite === 1,
      isHidden: row.is_hidden === 1,
      lastSeenAt: row.last_refreshed_at ? new Date(row.last_refreshed_at).getTime() : Date.now()
    };
  }

  /**
   * Peuple le catalogue initialement avec les modèles déclarés dans les presets de fournisseurs
   */
  public seedFromPresets(): void {
    const presets = getAllProviderPresets();
    const seeds: ModelInfo[] = [];

    for (const preset of presets) {
      if (!preset.curatedModels || preset.curatedModels.length === 0) continue;

      for (const cm of preset.curatedModels) {
        const fullId = cm.id.includes('/') ? cm.id : `${preset.id}/${cm.id}`;
        const formatted = formatModelLabel(fullId, preset.name);

        const modelInfo: ModelInfo = {
          id: fullId,
          providerId: preset.id,
          rawId: cm.id.replace(`${preset.id}/`, ''),
          name: formatted.name || cm.name,
          publisher: cm.publisher || normalizePublisher('', preset.id),
          description: cm.description,
          contextWindow: cm.contextWindow || 128000,
          maxOutputTokens: cm.maxOutputTokens || 4096,
          capabilities: cm.capabilities || getModelCapabilities(cm.id),
          priceTier: cm.priceTier || 'standard',
          isCurated: true,
          isFavorite: false,
          isHidden: false,
          lastSeenAt: Date.now()
        };

        seeds.push(modelInfo);
        this.cache.set(modelInfo.id, modelInfo);
      }
    }

    if (seeds.length > 0) {
      this.persistModels(seeds);
    }
  }

  /**
   * Détecte dynamiquement la taille de contexte d'un modèle selon ses métadonnées ou son nom
   */
  public detectContextWindow(rawModel: any, rawId: string): number {
    if (typeof rawModel?.context_length === 'number' && rawModel.context_length > 0) {
      return rawModel.context_length;
    }
    if (typeof rawModel?.context_window === 'number' && rawModel.context_window > 0) {
      return rawModel.context_window;
    }

    const id = (rawId || '').toLowerCase();
    if (id.includes('gemini-1.5-pro') || id.includes('gemini-2')) return 2000000;
    if (id.includes('gemini-1.5-flash') || id.includes('gemini-2.0-flash')) return 1000000;
    if (id.includes('claude-3') || id.includes('sonnet') || id.includes('opus') || id.includes('haiku')) return 200000;
    if (id.includes('o1') || id.includes('o3') || id.includes('gpt-4o') || id.includes('llama-3')) return 128000;
    if (id.includes('deepseek') || id.includes('mistral-large')) return 64000;
    if (id.includes('codestral') || id.includes('qwen')) return 32768;
    return 8192;
  }

  /**
   * Filtre les modèles non conversationnels (embeddings, TTS, Whisper, etc.)
   */
  public isChatModel(modelId: string): boolean {
    const id = modelId.toLowerCase();
    for (const keyword of EXCLUDED_MODEL_KEYWORDS) {
      if (id.includes(keyword)) return false;
    }
    return true;
  }

  /**
   * Déduplique les versions d'un même modèle (retient la version la plus récente ou canonique)
   */
  public deduplicateModelVersions(models: ModelInfo[]): ModelInfo[] {
    const familyMap = new Map<string, ModelInfo>();

    for (const model of models) {
      // Normalisation du nom de famille : retire les horodatages (ex: -20241022 ou -001)
      const cleanRawId = model.rawId
        .replace(/-\d{8}$/, '')
        .replace(/-\d{4}-\d{2}-\d{2}$/, '')
        .replace(/-latest$/, '');
      const familyKey = `${model.providerId}:${cleanRawId}`;

      const existing = familyMap.get(familyKey);
      if (!existing) {
        familyMap.set(familyKey, model);
      } else {
        // Préférer la version sans date (canonique/latest) ou la date la plus récente
        const existingHasDate = /-\d{8}$/.test(existing.rawId);
        const currentHasDate = /-\d{8}$/.test(model.rawId);

        if (existingHasDate && !currentHasDate) {
          familyMap.set(familyKey, model);
        } else if (existingHasDate && currentHasDate) {
          if (model.rawId > existing.rawId) {
            familyMap.set(familyKey, model);
          }
        }
      }
    }

    return Array.from(familyMap.values());
  }

  /**
   * Calcule dynamiquement les tiers de prix sur un groupe de modèles
   */
  public calculatePriceTiers(models: ModelInfo[]): Map<string, ModelPriceTier> {
    const tierMap = new Map<string, ModelPriceTier>();
    const paidModels: { id: string; cost: number }[] = [];

    for (const m of models) {
      // Modèles locaux ou à tarification zéro
      if (m.providerId === 'ollama' || m.providerId === 'lmstudio') {
        tierMap.set(m.id, 'free');
        continue;
      }

      if (m.pricing && m.pricing.inputPerMillion === 0 && m.pricing.outputPerMillion === 0) {
        tierMap.set(m.id, 'free');
        continue;
      }

      if (m.pricing && (m.pricing.inputPerMillion !== undefined || m.pricing.outputPerMillion !== undefined)) {
        const inputCost = m.pricing.inputPerMillion || 0;
        const outputCost = m.pricing.outputPerMillion || 0;
        const totalScore = inputCost + 2 * outputCost;
        paidModels.push({ id: m.id, cost: totalScore });
      } else {
        // Par défaut si pas de pricing précis
        tierMap.set(m.id, m.priceTier || 'standard');
      }
    }

    if (paidModels.length > 0) {
      // Tri par coût combiné croissant
      paidModels.sort((a, b) => a.cost - b.cost);

      const count = paidModels.length;
      const q1Index = Math.floor(count / 3);
      const q2Index = Math.floor((2 * count) / 3);

      for (let i = 0; i < count; i++) {
        const item = paidModels[i];
        if (i < q1Index) {
          tierMap.set(item.id, 'budget');
        } else if (i < q2Index) {
          tierMap.set(item.id, 'standard');
        } else {
          tierMap.set(item.id, 'premium');
        }
      }
    }

    return tierMap;
  }

  /**
   * Applique les règles strictes de curation en liste courte
   */
  public curateModels(models: ModelInfo[]): ModelInfo[] {
    const chatOnly = models.filter(m => this.isChatModel(m.rawId));
    const deduplicated = this.deduplicateModelVersions(chatOnly);
    const tierMap = this.calculatePriceTiers(deduplicated);

    // Mettre à jour les tiers calculés
    for (const m of deduplicated) {
      const calculatedTier = tierMap.get(m.id);
      if (calculatedTier) {
        m.priceTier = calculatedTier;
      }
    }

    // Regrouper par palier
    const byTier: Record<ModelPriceTier, ModelInfo[]> = {
      free: [],
      budget: [],
      standard: [],
      premium: []
    };

    for (const m of deduplicated) {
      byTier[m.priceTier].push(m);
    }

    const curatedSet = new Set<string>();

    const selectForTier = (tierModels: ModelInfo[], maxLimit: number) => {
      const publisherCount = new Map<string, number>();
      let selectedInTier = 0;

      for (const m of tierModels) {
        if (selectedInTier >= maxLimit) break;
        const pub = m.publisher.toLowerCase();
        const currentCount = publisherCount.get(pub) || 0;

        if (currentCount < CURATION_LIMITS.MAX_MODELS_PER_PUBLISHER_PER_TIER) {
          curatedSet.add(m.id);
          publisherCount.set(pub, currentCount + 1);
          selectedInTier++;
        }
      }
    };

    selectForTier(byTier.free, CURATION_LIMITS.MAX_FREE_MODELS);
    selectForTier(byTier.budget, CURATION_LIMITS.MAX_BUDGET_MODELS);
    selectForTier(byTier.standard, CURATION_LIMITS.MAX_STANDARD_MODELS);
    selectForTier(byTier.premium, CURATION_LIMITS.MAX_PREMIUM_MODELS);

    for (const m of deduplicated) {
      m.isCurated = curatedSet.has(m.id);
    }

    return deduplicated;
  }

  /**
   * Actualise le catalogue pour un fournisseur donné à partir de sa réponse brute
   */
  public async refreshProvider(providerId: string, rawModels: any[]): Promise<ModelInfo[]> {
    const preset = getProviderPreset(providerId);
    const providerName = preset?.name || providerId;

    const normalized: ModelInfo[] = [];

    for (const item of rawModels) {
      const rawId = typeof item === 'string' ? item : (item.id || item.name);
      if (!rawId || !this.isChatModel(rawId)) continue;

      const fullId = rawId.includes('/') ? rawId : `${providerId}/${rawId}`;
      const formatted = formatModelLabel(fullId, providerName);

      let publisher = '';
      if (item.publisher) {
        publisher = item.publisher;
      } else if (rawId.includes('/')) {
        publisher = rawId.split('/')[0];
      }
      const canonicalPublisher = normalizePublisher(publisher, providerId);

      let pricing: ModelPricing | undefined = undefined;
      if (item.pricing) {
        const pPrompt = parseFloat(item.pricing.prompt || '0');
        const pComp = parseFloat(item.pricing.completion || '0');
        pricing = {
          promptCostPerToken: pPrompt,
          completionCostPerToken: pComp,
          inputPerMillion: pPrompt * 1000000,
          outputPerMillion: pComp * 1000000
        };
      }

      const existing = this.cache.get(fullId);

      const modelInfo: ModelInfo = {
        id: fullId,
        providerId,
        rawId,
        name: formatted.name,
        publisher: canonicalPublisher,
        description: item.description || existing?.description,
        contextWindow: this.detectContextWindow(item, rawId),
        maxOutputTokens: item.top_provider?.max_completion_tokens || 4096,
        capabilities: getModelCapabilities(rawId),
        pricing,
        priceTier: 'standard', // sera recalculé lors de la curation
        isCurated: false,
        isFavorite: existing?.isFavorite || false,
        isHidden: existing?.isHidden || false,
        lastSeenAt: Date.now()
      };

      normalized.push(modelInfo);
    }

    const curatedList = this.curateModels(normalized);

    // Mettre à jour la mémoire vive
    for (const m of curatedList) {
      this.cache.set(m.id, m);
    }

    // Persister en base SQLite
    this.persistModels(curatedList);

    return curatedList;
  }

  private persistModels(models: ModelInfo[]): void {
    try {
      runtimeDatabase.upsertCatalogModels(models.map(m => ({
        id: m.id,
        providerId: m.providerId,
        rawId: m.rawId,
        name: m.name,
        publisher: m.publisher,
        description: m.description,
        contextWindow: m.contextWindow,
        maxOutputTokens: m.maxOutputTokens,
        capabilities: m.capabilities,
        pricing: m.pricing,
        priceTier: m.priceTier,
        isCurated: m.isCurated,
        isFavorite: m.isFavorite,
        isHidden: m.isHidden
      })));
    } catch (err: any) {
      logger.warn(`Erreur lors de la sauvegarde du catalogue SQLite : ${err.message}`);
    }
  }

  /**
   * Retourne la liste filtrée des modèles pour l'affichage (recherche, curation, provider)
   */
  public getModels(filter?: {
    provider?: string;
    view?: 'short' | 'all';
    q?: string;
    includeHidden?: boolean;
  }): ModelInfo[] {
    let list = Array.from(this.cache.values());

    if (filter?.provider) {
      const p = filter.provider.toLowerCase();
      list = list.filter(m => m.providerId.toLowerCase() === p);
    }

    if (!filter?.includeHidden) {
      list = list.filter(m => !m.isHidden);
    }

    if (filter?.view === 'short') {
      list = list.filter(m => m.isCurated || m.isFavorite);
    }

    if (filter?.q && filter.q.trim()) {
      const q = filter.q.toLowerCase().trim();
      list = list.filter(m =>
        m.name.toLowerCase().includes(q) ||
        m.rawId.toLowerCase().includes(q) ||
        m.publisher.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q)
      );
    }

    // Trier : Favoris en premier, puis curés, puis par éditeur et nom
    list.sort((a, b) => {
      if (a.isFavorite && !b.isFavorite) return -1;
      if (!a.isFavorite && b.isFavorite) return 1;
      if (a.isCurated && !b.isCurated) return -1;
      if (!a.isCurated && b.isCurated) return 1;
      if (a.publisher !== b.publisher) return a.publisher.localeCompare(b.publisher);
      return a.name.localeCompare(b.name);
    });

    return list;
  }

  public getModel(id: string): ModelInfo | undefined {
    return this.cache.get(id);
  }

  /**
   * Modifie les préférences utilisateur (favori, masqué)
   */
  public updatePreferences(modelId: string, preferences: { isFavorite?: boolean; isHidden?: boolean }): boolean {
    const model = this.cache.get(modelId);
    if (!model) return false;

    if (preferences.isFavorite !== undefined) {
      model.isFavorite = preferences.isFavorite;
    }
    if (preferences.isHidden !== undefined) {
      model.isHidden = preferences.isHidden;
    }

    try {
      runtimeDatabase.updateModelPreferences(modelId, preferences);
    } catch {}

    return true;
  }

  /**
   * Sélectionne le meilleur modèle par défaut fondé sur les métadonnées et la disponibilité
   */
  public getSmartDefaultModel(
    conversationModelId?: string,
    activeProviderIds?: string[]
  ): ModelInfo | null {
    const isProviderActive = (pid: string) => {
      if (!activeProviderIds || activeProviderIds.length === 0) return true;
      return activeProviderIds.includes(pid.toLowerCase());
    };

    // 1. Modèle mémorisé dans la conversation
    if (conversationModelId) {
      const convModel = this.cache.get(conversationModelId);
      if (convModel && isProviderActive(convModel.providerId) && !convModel.isHidden) {
        return convModel;
      }
    }

    const availableModels = Array.from(this.cache.values()).filter(
      m => !m.isHidden && isProviderActive(m.providerId)
    );

    if (availableModels.length === 0) return null;

    // 2. Modèle favori de l'utilisateur
    const favorite = availableModels.find(m => m.isFavorite);
    if (favorite) return favorite;

    // 3. Modèle curé équilibré (outils + raisonnement + contexte étendu)
    const bestCurated = availableModels.find(
      m => m.isCurated &&
           m.capabilities.tools &&
           m.capabilities.reasoning &&
           m.contextWindow >= 128000
    );
    if (bestCurated) return bestCurated;

    // 4. Premier modèle curé disponible
    const firstCurated = availableModels.find(m => m.isCurated);
    if (firstCurated) return firstCurated;

    // 5. Tout modèle disponible
    return availableModels[0];
  }

  private startBackgroundRefresh(): void {
    if (this.backgroundTimer) return;
    // Vérifier toutes les heures si un rafraîchissement est nécessaire
    this.backgroundTimer = setInterval(() => {
      // Rafraîchissement non bloquant
    }, 60 * 60 * 1000).unref();
  }

  public destroy(): void {
    if (this.backgroundTimer) {
      clearInterval(this.backgroundTimer);
      this.backgroundTimer = null;
    }
  }
}

export const modelCatalogManager = new ModelCatalogManager();
