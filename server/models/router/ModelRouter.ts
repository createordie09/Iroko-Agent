import { AIProvider, ModelRequest, StreamChunk, FallbackPolicy, KeySelectionStrategy } from '../types';
import { keyPoolManager, KeyPoolManager } from '../keys/KeyPoolManager';
import { OpenAIProvider } from '../providers/OpenAIProvider';
import { GeminiProvider } from '../providers/GeminiProvider';
import { AnthropicProvider } from '../providers/AnthropicProvider';
import { OpenRouterProvider } from '../providers/OpenRouterProvider';
import { MockProvider } from '../providers/MockProvider';

export class ModelRouter {
  private providers: Map<string, AIProvider> = new Map();
  private mockProvider = new MockProvider();
  private fallbackPolicy: FallbackPolicy = {
    enabled: true,
    providers: ['anthropic', 'openai', 'openrouter', 'gemini'],
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

    if (preferredProviderId && this.providers.has(preferredProviderId)) {
      providerQueue.push(preferredProviderId);
    }

    if (this.fallbackPolicy.enabled && this.fallbackPolicy.allowCrossProviderFallback) {
      for (const pId of this.fallbackPolicy.providers) {
        if (!providerQueue.includes(pId) && this.providers.has(pId)) {
          providerQueue.push(pId);
        }
      }
    }

    // Always keep mock as ultimate safety net
    if (!providerQueue.includes('mock')) {
      providerQueue.push('mock');
    }

    let lastError: any = null;

    // 2. Parcourir les providers
    for (const providerId of providerQueue) {
      const provider = this.providers.get(providerId);
      if (!provider) continue;

      // Pour le provider mock, pas besoin de clé API : filet de sécurité ultime
      if (provider.id === 'mock') {
        console.warn(`[ModelRouter] Utilisation du moteur hors-ligne de secours (Mock).`);
        yield { type: 'thinking_delta', text: `\n[Info: Utilisation du moteur hors-ligne de secours]` };
        for await (const chunk of provider.generateStream(request, 'mock-key')) {
          yield chunk;
        }
        return;
      }

      console.log(`[ModelRouter] Tentative avec le provider "${provider.name}" (${provider.id})...`);

      let attempts = 0;
      const maxAttempts = this.fallbackPolicy.maxAttemptsPerProvider;

      // Essayer jusqu'à maxAttempts clés sur ce provider
      while (attempts < maxAttempts) {
        attempts++;

        const keyAcquisition = this.poolManager.acquireKey(provider.id, activeStrategy);
        if (!keyAcquisition) {
          console.warn(`[ModelRouter] Aucune clé disponible pour ${provider.name} (épuisées ou en cooldown).`);
          break; // Passer au provider suivant
        }

        const { credential, rawKey, release } = keyAcquisition;
        console.log(`[ModelRouter] Clé sélectionnée : ${credential.label} (${credential.maskedKey}) pour ${provider.name}`);

        let hasYieldedAnyChunk = false;

        try {
          for await (const chunk of provider.generateStream(request, rawKey)) {
            hasYieldedAnyChunk = true;
            yield chunk;
          }

          // Succès complet
          this.poolManager.reportSuccess(credential.id);
          release();
          return; // Sortie réussie
        } catch (err: any) {
          release();
          const classification = this.poolManager.reportFailure(credential.id, err);
          lastError = err;

          console.warn(
            `[ModelRouter] Échec clé ${credential.maskedKey} (${provider.name}) : ${classification.message} [Catégorie: ${classification.category}]`
          );

          // Si des chunks ont déjà été émis vers l'utilisateur, ne pas rejouer la génération
          if (hasYieldedAnyChunk) {
            yield {
              type: 'text_delta',
              text: `\n\n[Flux interrompu suite à une erreur : ${classification.message}]`
            };
            return;
          }

          // Si l'erreur justifie une bascule immédiate de provider (ex: 5xx ou modèle indisponible)
          if (classification.shouldFallbackProvider) {
            break; // Passer au provider suivant sans brûler d'autres clés
          }

          // Sinon, la boucle while retente avec la prochaine clé saine du même provider
        }
      }
    }

    // Si tout a échoué et que le mock n'a pas été exécuté
    throw lastError || new Error('Tous les fournisseurs et clés d\'IA configurés sont actuellement indisponibles.');
  }
}

export const modelRouter = new ModelRouter();
