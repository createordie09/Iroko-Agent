import { MediaProvider, ImageModelInfo, GenerateImageRequest, GenerateImageResult, MediaSettings } from './types';
import { OpenAIImageAdapter } from './adapters/OpenAIImageAdapter';
import { GoogleImageAdapter } from './adapters/GoogleImageAdapter';
import { CloudflareFluxAdapter } from './adapters/CloudflareFluxAdapter';
import { MockImageAdapter } from './adapters/MockImageAdapter';
import { runtimeDatabase } from '../storage/RuntimeDatabase';
import { encryptionService } from '../security/EncryptionService';
import { logger } from '../utils/logger';

export class MediaGateway {
  private static instance: MediaGateway;
  private providers: Map<string, MediaProvider> = new Map();

  private constructor() {
    this.registerProvider(new OpenAIImageAdapter());
    this.registerProvider(new GoogleImageAdapter());
    this.registerProvider(new CloudflareFluxAdapter());
    this.registerProvider(new MockImageAdapter());
  }

  public static getInstance(): MediaGateway {
    if (!MediaGateway.instance) {
      MediaGateway.instance = new MediaGateway();
    }
    return MediaGateway.instance;
  }

  public registerProvider(provider: MediaProvider): void {
    this.providers.set(provider.id, provider);
  }

  public getProvider(id: string): MediaProvider | undefined {
    return this.providers.get(id);
  }

  public listProviders(): Array<{ id: string; name: string }> {
    return Array.from(this.providers.values()).map(p => ({
      id: p.id,
      name: p.name
    }));
  }

  /**
   * Récupère la configuration des médias persistée en base locale.
   */
  public getSettings(): MediaSettings {
    const raw = runtimeDatabase.getSetting('media_settings') as any;
    if (raw && typeof raw === 'object') {
      let decryptedKey: string | undefined = undefined;
      if (raw.encryptedKey && raw.iv && raw.authTag) {
        try {
          decryptedKey = encryptionService.decrypt({
            encrypted: raw.encryptedKey,
            iv: raw.iv,
            authTag: raw.authTag
          });
        } catch (err) {
          logger.warn(`Impossible de déchiffrer la clé média : ${err}`);
        }
      }

      return {
        activeProviderId: raw.activeProviderId || '',
        activeModelId: raw.activeModelId || '',
        apiKey: decryptedKey,
        accountId: raw.accountId,
        baseUrl: raw.baseUrl
      };
    }

    return {
      activeProviderId: '',
      activeModelId: ''
    };
  }

  /**
   * Enregistre la configuration des médias avec chiffrement de la clé API.
   */
  public saveSettings(settings: {
    activeProviderId: string;
    activeModelId: string;
    apiKey?: string;
    accountId?: string;
    baseUrl?: string;
  }): void {
    let encryptedKeyData: any = undefined;

    if (settings.apiKey && settings.apiKey.trim()) {
      const encrypted = encryptionService.encrypt(settings.apiKey.trim());
      encryptedKeyData = {
        encryptedKey: encrypted.encrypted,
        iv: encrypted.iv,
        authTag: encrypted.authTag
      };
    }

    runtimeDatabase.setSetting('media_settings', {
      activeProviderId: settings.activeProviderId,
      activeModelId: settings.activeModelId,
      accountId: settings.accountId,
      baseUrl: settings.baseUrl,
      ...encryptedKeyData
    });
  }

  /**
   * Vérifie si un fournisseur est configuré et prêt à générer des images.
   */
  public hasConfiguredProvider(): boolean {
    const settings = this.getSettings();
    if (!settings.activeProviderId) return false;

    // Le mock fonctionne sans clé
    if (settings.activeProviderId === 'mock') return true;

    // Pour les autres, une clé est nécessaire
    if (!settings.apiKey) return false;

    // Pour Cloudflare, l'identifiant de compte est également requis
    if (settings.activeProviderId === 'cloudflare' && !settings.accountId && !process.env.CLOUDFLARE_ACCOUNT_ID) {
      return false;
    }

    return true;
  }

  /**
   * Retourne la liste des modèles pour le fournisseur actif ou spécifié.
   */
  public async listModels(providerId?: string): Promise<ImageModelInfo[]> {
    const targetId = providerId || this.getSettings().activeProviderId;
    if (!targetId) return [];

    const provider = this.getProvider(targetId);
    if (!provider) return [];

    try {
      return await provider.listImageModels();
    } catch {
      return [];
    }
  }

  /**
   * Génère une image via le fournisseur configuré.
   */
  public async generateImage(request: GenerateImageRequest): Promise<GenerateImageResult> {
    const settings = this.getSettings();
    const providerId = settings.activeProviderId;

    if (!providerId) {
      throw new Error('Aucun fournisseur de génération d\'images configuré dans Paramètres › Fournisseurs & Clés.');
    }

    const provider = this.getProvider(providerId);
    if (!provider) {
      throw new Error(`Fournisseur d'images "${providerId}" non reconnu.`);
    }

    // Préparation de la requête avec le modèle configuré si non spécifié
    const req: GenerateImageRequest = {
      ...request,
      model: request.model || settings.activeModelId
    };

    return await provider.generateImage(req, settings.apiKey, {
      baseUrl: settings.baseUrl,
      accountId: settings.accountId
    });
  }
}

export const mediaGateway = MediaGateway.getInstance();
