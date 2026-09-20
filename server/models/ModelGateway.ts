import { ModelRequest, StreamChunk, KeySelectionStrategy, FallbackPolicy, CredentialValidationResult } from './types';
import { modelRouter, ModelRouter } from './router/ModelRouter';
import { keyPoolManager, KeyPoolManager } from './keys/KeyPoolManager';

export class ModelGateway {
  public readonly router: ModelRouter;
  public readonly keyPool: KeyPoolManager;

  constructor() {
    this.router = modelRouter;
    this.keyPool = keyPoolManager;
  }

  public getAvailableProviders(): Array<{ id: string; name: string; keyCount: number; activeKeys: number }> {
    return this.router.getAllProviders().map(p => {
      const keys = this.keyPool.getKeysByProvider(p.id);
      const activeKeys = keys.filter(k => k.enabled && k.status === 'ACTIVE').length;
      return {
        id: p.id,
        name: p.name,
        keyCount: keys.length,
        activeKeys: p.id === 'mock' ? 1 : activeKeys
      };
    });
  }

  public getDefaultProvider(): { id: string; name: string } {
    const list = this.getAvailableProviders();
    // Préférer le premier provider disposant de clés actives
    const best = list.find(p => p.id !== 'mock' && p.activeKeys > 0);
    if (best) return best;
    const firstNonMock = list.find(p => p.id !== 'mock');
    return firstNonMock || { id: 'mock', name: 'Iroko Mock Engine (Offline)' };
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
