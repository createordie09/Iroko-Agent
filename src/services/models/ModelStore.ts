import { FormattedModel } from '../../lib/models';
import { tokenService } from '../security/TokenService';
import { agentClient } from '../../lib/agent-client';

export interface ProviderItem {
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

export type ComposerModelStatus = 
  | { type: 'loading'; message: string }
  | { type: 'no_provider'; message: string }
  | { type: 'error'; message: string; onRetry: () => void }
  | { type: 'unavailable'; message: string; proposedModel: FormattedModel; onAcceptProposal: () => void }
  | { type: 'ready'; model: FormattedModel };

export interface ModelStoreState {
  providers: ProviderItem[];
  models: FormattedModel[];
  allModels: FormattedModel[];
  activeModelId: string;
  recentModelIds: string[];
  loadingProviders: boolean;
  loadingModels: boolean;
  providersError: string | null;
  modelsError: string | null;
  lastUpdated: number;
}

const RECENT_MODELS_KEY = 'iroko_recent_models';
const ACTIVE_MODEL_KEY = 'iroko_active_model';

class ModelStoreService {
  private state: ModelStoreState;
  private listeners: Set<() => void> = new Set();
  private isInitialized = false;
  private unsubscribeWs: (() => void) | null = null;

  constructor() {
    let savedRecents: string[] = [];
    try {
      const stored = localStorage.getItem(RECENT_MODELS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) savedRecents = parsed.slice(0, 3);
      }
    } catch {}

    let savedActive = '';
    try {
      savedActive = localStorage.getItem(ACTIVE_MODEL_KEY) || '';
    } catch {}

    this.state = {
      providers: [],
      models: [],
      allModels: [],
      activeModelId: savedActive,
      recentModelIds: savedRecents,
      loadingProviders: false,
      loadingModels: false,
      providersError: null,
      modelsError: null,
      lastUpdated: 0
    };
  }

  public init(): void {
    if (this.isInitialized) return;
    this.isInitialized = true;

    // Écoute réactive des événements WebSocket émis par le backend
    this.unsubscribeWs = agentClient.onEvent((event) => {
      if (event.type === 'providers_changed') {
        this.fetchProviders();
        this.fetchModels();
      } else if (event.type === 'catalog_updated') {
        this.fetchModels();
      }
    });

    // Chargement initial
    this.fetchProviders();
    this.fetchModels();
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    if (!this.isInitialized) {
      this.init();
    }
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getState(): ModelStoreState {
    return this.state;
  }

  private notify(): void {
    this.state.lastUpdated = Date.now();
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (e) {
        console.error('[ModelStore] Erreur dans un abonné :', e);
      }
    }
  }

  public async fetchProviders(): Promise<void> {
    this.state.loadingProviders = true;
    this.state.providersError = null;
    this.notify();

    try {
      const res = await tokenService.fetch('/api/providers');
      if (!res.ok) {
        throw new Error(`Erreur réseau (${res.status})`);
      }
      const data = await res.json();
      if (Array.isArray(data.providers)) {
        this.state.providers = data.providers.filter((p: any) => p.id !== 'mock');
      }
    } catch (err: any) {
      this.state.providersError = err?.message || 'Erreur de chargement des fournisseurs';
    } finally {
      this.state.loadingProviders = false;
      this.notify();
    }
  }

  public async fetchModels(conversationId?: string): Promise<void> {
    this.state.loadingModels = true;
    this.state.modelsError = null;
    this.notify();

    try {
      const convParam = conversationId ? `&conversationId=${encodeURIComponent(conversationId)}` : '';
      const [shortRes, allRes] = await Promise.all([
        tokenService.fetch(`/api/models?view=short${convParam}`).then(r => r.json()),
        tokenService.fetch(`/api/models?view=all${convParam}`).then(r => r.json()).catch(() => ({ models: [] }))
      ]);

      const availableModels: FormattedModel[] = Array.isArray(shortRes.models) ? shortRes.models : [];
      const fullCatalog: FormattedModel[] = Array.isArray(allRes.models) ? allRes.models : [];

      this.state.models = availableModels;
      this.state.allModels = fullCatalog;

      // Auto-sélection intelligente si aucun modèle actif ou si le modèle sélectionné n'est plus disponible
      const currentActive = this.state.activeModelId;
      const foundInAvailable = availableModels.some(m => m.id === currentActive);

      if (!foundInAvailable && availableModels.length > 0) {
        const smartDefault = shortRes.defaultModel;
        const targetModel = (smartDefault && availableModels.some(m => m.id === smartDefault.id))
          ? smartDefault.id
          : availableModels[0].id;

        this.setActiveModel(targetModel, false);
      }
    } catch (err: any) {
      this.state.modelsError = err?.message || 'Erreur de chargement du catalogue';
    } finally {
      this.state.loadingModels = false;
      this.notify();
    }
  }

  public setActiveModel(modelId: string, updateRecents = true): void {
    if (!modelId) return;
    this.state.activeModelId = modelId;

    try {
      localStorage.setItem(ACTIVE_MODEL_KEY, modelId);
    } catch {}

    if (updateRecents) {
      const filtered = this.state.recentModelIds.filter(id => id !== modelId);
      const updated = [modelId, ...filtered].slice(0, 3);
      this.state.recentModelIds = updated;
      try {
        localStorage.setItem(RECENT_MODELS_KEY, JSON.stringify(updated));
      } catch {}
    }

    this.notify();
  }

  public async toggleFavorite(modelId: string): Promise<boolean> {
    const target = this.state.allModels.find(m => m.id === modelId) || this.state.models.find(m => m.id === modelId);
    const nextState = !target?.isFavorite;

    try {
      const res = await tokenService.fetch('/api/models/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId, isFavorite: nextState })
      });
      if (res.ok) {
        await this.fetchModels();
        return true;
      }
    } catch {}
    return false;
  }

  public async toggleHide(modelId: string): Promise<boolean> {
    const target = this.state.allModels.find(m => m.id === modelId) || this.state.models.find(m => m.id === modelId);
    const nextState = !target?.isHidden;

    try {
      const res = await tokenService.fetch('/api/models/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId, isHidden: nextState })
      });
      if (res.ok) {
        await this.fetchModels();
        return true;
      }
    } catch {}
    return false;
  }

  public async refreshCatalog(providerId?: string): Promise<void> {
    try {
      await tokenService.fetch('/api/models/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId })
      });
      await this.fetchProviders();
      await this.fetchModels();
    } catch {}
  }

  public getComposerStatus(): ComposerModelStatus {
    const { loadingModels, modelsError, models, activeModelId, providers } = this.state;

    // 1. En cours de chargement initial
    if (loadingModels && models.length === 0) {
      return {
        type: 'loading',
        message: 'Chargement…'
      };
    }

    // 2. Erreur réseau lors du chargement
    if (modelsError && models.length === 0) {
      return {
        type: 'error',
        message: modelsError,
        onRetry: () => this.fetchModels()
      };
    }

    // 3. Sans fournisseur configuré ou aucun modèle disponible
    const hasReadyProvider = providers.some(p => p.activeKeys > 0 || p.isLocal);
    if (!hasReadyProvider || models.length === 0) {
      return {
        type: 'no_provider',
        message: 'Ajoutez une clé API dans Paramètres › Fournisseurs & Clés'
      };
    }

    // 4. Modèle actuellement sélectionné
    const currentModel = models.find(m => m.id === activeModelId);
    if (!currentModel) {
      // Modèle indisponible avec proposition
      const proposed = models[0];
      return {
        type: 'unavailable',
        message: 'Le modèle sélectionné n\'est plus disponible.',
        proposedModel: proposed,
        onAcceptProposal: () => this.setActiveModel(proposed.id)
      };
    }

    // 5. Prêt
    return {
      type: 'ready',
      model: currentModel
    };
  }
}

export const modelStore = new ModelStoreService();
