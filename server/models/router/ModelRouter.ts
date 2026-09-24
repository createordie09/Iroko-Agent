import { AIProvider, ModelRequest, StreamChunk, FallbackPolicy, KeySelectionStrategy } from '../types';
import { keyPoolManager, KeyPoolManager } from '../keys/KeyPoolManager';
import { OpenAIProvider } from '../providers/OpenAIProvider';
import { GeminiProvider } from '../providers/GeminiProvider';
import { AnthropicProvider } from '../providers/AnthropicProvider';
import { OpenRouterProvider } from '../providers/OpenRouterProvider';
import { LMStudioProvider } from '../providers/LMStudioProvider';
import { OllamaProvider } from '../providers/OllamaProvider';
import { CustomOpenAIProvider } from '../providers/CustomOpenAIProvider';
import { OpenAICompatibleProvider } from '../providers/OpenAICompatibleProvider';
import { getProviderPreset } from '../providers/presets';
import { MockProvider } from '../providers/MockProvider';
import { logger } from '../../utils/logger';

export class ModelRouter {
  private providers: Map<string, AIProvider> = new Map();
  private mockProvider = new MockProvider();
  private fallbackPolicy: FallbackPolicy = {
    enabled: true,
    providers: [
      'anthropic', 'openai', 'gemini', 'openrouter',
      'mistral', 'groq', 'deepseek', 'xai', 'together',
      'ollama', 'lmstudio', 'custom'
    ],
    maxAttemptsPerProvider: 3,
    allowModelSubstitution: true,
    allowCrossProviderFallback: true
  };
  private defaultStrategy: KeySelectionStrategy = 'SMART';

  constructor(private poolManager: KeyPoolManager = keyPoolManager) {
    this.registerProvider(new AnthropicProvider());
    this.registerProvider(new OpenAIProvider());
    this.registerProvider(new GeminiProvider());
    this.registerProvider(new OpenRouterProvider());

    // Nouveaux fournisseurs gérés via presets OpenAI-compatibles
    const mistralPreset = getProviderPreset('mistral');
    if (mistralPreset) this.registerProvider(new OpenAICompatibleProvider(mistralPreset));

    const groqPreset = getProviderPreset('groq');
    if (groqPreset) this.registerProvider(new OpenAICompatibleProvider(groqPreset));

    const deepseekPreset = getProviderPreset('deepseek');
    if (deepseekPreset) this.registerProvider(new OpenAICompatibleProvider(deepseekPreset));

    const xaiPreset = getProviderPreset('xai');
    if (xaiPreset) this.registerProvider(new OpenAICompatibleProvider(xaiPreset));

    const togetherPreset = getProviderPreset('together');
    if (togetherPreset) this.registerProvider(new OpenAICompatibleProvider(togetherPreset));

    this.registerProvider(new LMStudioProvider());
    this.registerProvider(new OllamaProvider());
    this.registerProvider(new CustomOpenAIProvider());
    this.registerProvider(this.mockProvider);
  }

  public registerProvider(provider: AIProvider): void {
    this.providers.set(provider.id, provider);
  }

  public getProvider(id: string): AIProvider | undefined {
    return this.providers.get(id);
  }

  public getAllProviders(): AIProvider[] {
    return Array.from(this.providers.values());
  }

  public getFallbackPolicy(): FallbackPolicy {
    return { ...this.fallbackPolicy };
  }

  public setFallbackPolicy(policy: Partial<FallbackPolicy>): void {
    this.fallbackPolicy = { ...this.fallbackPolicy, ...policy };
  }

  public getDefaultStrategy(): KeySelectionStrategy {
    return this.defaultStrategy;
  }

  public setDefaultStrategy(strategy: KeySelectionStrategy): void {
    this.defaultStrategy = strategy;
  }

  /**
   * Route la requête à travers le pool de clés du provider cible avec gestion de cooldown et fallback
   */
  public async *generateStream(
    request: ModelRequest,
    preferredProviderId?: string,
    strategy?: KeySelectionStrategy
  ): AsyncIterable<StreamChunk> {
    const activeStrategy = strategy || this.defaultStrategy;

    // 1. Déterminer la liste ordonnée des providers à essayer
    const providerQueue: string[] = [];

    let targetProvider = preferredProviderId;
    if (!targetProvider && request.modelId && request.modelId.includes('/')) {
      const p = request.modelId.split('/')[0];
      if (this.providers.has(p)) {
        targetProvider = p;
      }
    }

    if (targetProvider && this.providers.has(targetProvider)) {
      providerQueue.push(targetProvider);
    }

    if (this.fallbackPolicy.enabled && this.fallbackPolicy.allowCrossProviderFallback) {
      for (const pId of this.fallbackPolicy.providers) {
        if (!providerQueue.includes(pId) && this.providers.has(pId)) {
          providerQueue.push(pId);
        }
      }
    }

    // Le mock ne doit intervenir en dernier recours QUE si l'utilisateur n'a configuré aucune clé
    const hasConfiguredKeys = this.poolManager.getAllKeys().some(k => k.enabled && k.status !== 'INVALID' && k.status !== 'QUOTA_EXHAUSTED');
    if (!hasConfiguredKeys && !providerQueue.includes('mock')) {
      providerQueue.push('mock');
    }

    let lastError: any = null;

    // 2. Parcourir les providers
    for (const providerId of providerQueue) {
      const provider = this.providers.get(providerId);
      if (!provider) continue;

      // Pour le provider mock, pas besoin de clé API : filet de secours
      if (provider.id === 'mock') {
        logger.warn('Utilisation du moteur hors-ligne de secours (Mock).');
        for await (const chunk of provider.generateStream(request, 'mock-key')) {
          yield chunk;
        }
        return;
      }

      let attempts = 0;
      const maxAttempts = this.fallbackPolicy.maxAttemptsPerProvider;

      // Essayer jusqu'à maxAttempts clés sur ce provider
      while (attempts < maxAttempts) {
        attempts++;

        const keyAcquisition = this.poolManager.acquireKey(provider.id, activeStrategy);
        if (!keyAcquisition) {
          // Aucun clé disponible pour ce provider (aucune configurée ou toutes en cooldown/invalides)
          break; // Passer au provider suivant
        }

        const { credential, rawKey, release } = keyAcquisition;
        logger.info(`Appel modèle avec clé ${credential.maskedKey} (${provider.name})`);

        let hasYieldedAnyChunk = false;

        try {
          for await (const chunk of provider.generateStream(request, rawKey)) {
            if (request.abortSignal?.aborted) {
              release();
              return;
            }
            hasYieldedAnyChunk = true;
            yield chunk;
          }

          if (request.abortSignal?.aborted) {
            release();
            return;
          }

          // Succès complet
          this.poolManager.reportSuccess(credential.id);
          release();
          return; // Sortie réussie sans erreur
        } catch (err: any) {
          release();
          if (request.abortSignal?.aborted || err.name === 'AbortError' || (err.message && err.message.toLowerCase().includes('abort'))) {
            logger.info(`Génération interrompue par l'utilisateur sur ${credential.maskedKey} (${provider.name})`);
            return;
          }

          const classification = this.poolManager.reportFailure(credential.id, err);
          lastError = err;

          logger.warn(
            `Échec clé ${credential.maskedKey} (${provider.name}) : ${classification.message} [${classification.category}]`
          );

          // Si des chunks ont déjà été émis vers l'utilisateur, ne pas rejouer la génération
          if (hasYieldedAnyChunk) {
            yield {
              type: 'text_delta',
              text: `\n\n[Flux interrompu : ${classification.message}]`
            };
            return;
          }

          // Si l'erreur justifie une bascule immédiate de provider (5xx ou modèle indisponible)
          if (classification.shouldFallbackProvider) {
            break; // Passer au provider suivant
          }

          // Pour 429 ou 401/403, la boucle while continue immédiatement avec la clé saine suivante
        }
      }
    }

    // Si tout a échoué
    throw lastError || new Error('Tous les fournisseurs et clés d\'IA configurés sont actuellement indisponibles.');
  }
}

export const modelRouter = new ModelRouter();
