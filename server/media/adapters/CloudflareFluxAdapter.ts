import { MediaProvider, ImageModelInfo, GenerateImageRequest, GenerateImageResult } from '../types';
import { SsrfGuard } from '../security/SsrfGuard';

/**
 * Adaptateur Cloudflare Workers AI avec Flux-1-Schnell.
 * Spécification §10, §26 : "la réponse est un JSON dont le champ image est du base64 : décode-le, ce n'est pas un binaire".
 */
export class CloudflareFluxAdapter implements MediaProvider {
  public readonly id = 'cloudflare';
  public readonly name = 'Cloudflare Workers AI (Flux-1-Schnell)';

  public async listImageModels(): Promise<ImageModelInfo[]> {
    return [
      {
        id: '@cf/black-forest-labs/flux-1-schnell',
        name: 'Flux 1 Schnell',
        providerId: 'cloudflare',
        supportsEdit: false,
        defaultAspectRatio: '1:1'
      }
    ];
  }

  public async generateImage(
    request: GenerateImageRequest,
    apiKey?: string,
    options?: { baseUrl?: string; accountId?: string }
  ): Promise<GenerateImageResult> {
    if (!apiKey) {
      throw new Error('Jeton d\'API (API Token) requis pour Cloudflare Workers AI.');
    }

    const accountId = options?.accountId || process.env.CLOUDFLARE_ACCOUNT_ID;
    if (!accountId) {
      throw new Error('Identifiant de compte Cloudflare (Account ID) requis.');
    }

    const model = request.model || '@cf/black-forest-labs/flux-1-schnell';
    const baseUrl = (options?.baseUrl || 'https://api.cloudflare.com/client/v4').replace(/\/+$/, '');
    const endpoint = `${baseUrl}/accounts/${accountId}/ai/run/${model}`;

    const payload: any = {
      prompt: request.prompt,
      steps: 4
    };

    if (request.seed !== undefined) {
      payload.seed = request.seed;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);

    if (request.abortSignal) {
      request.abortSignal.addEventListener('abort', () => controller.abort());
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let errDetail = `Code HTTP ${response.status}`;
        try {
          const errJson = await response.json();
          if (Array.isArray(errJson?.errors) && errJson.errors.length > 0) {
            errDetail = errJson.errors.map((e: any) => e.message || JSON.stringify(e)).join(', ');
          } else if (errJson?.messages) {
            errDetail = JSON.stringify(errJson.messages);
          }
        } catch {
          const errText = await response.text();
          if (errText) errDetail = errText;
        }

        if (response.status === 429) {
          throw new Error(`Quota ou limite Cloudflare dépassée (429) : ${errDetail}`);
        } else {
          throw new Error(`Erreur Cloudflare Workers AI : ${errDetail}`);
        }
      }

      // Conforme spécification : la réponse est un JSON avec le champ image en base64
      const data = await response.json();
      const base64Data = data?.result?.image || data?.image;

      if (!base64Data || typeof base64Data !== 'string') {
        throw new Error('Champ image base64 manquant dans la réponse JSON de Cloudflare Workers AI.');
      }

      const imageBuffer = Buffer.from(base64Data, 'base64');
      const validation = SsrfGuard.validateImageMagicBytes(imageBuffer);
      const mimeType = (validation.valid && validation.detectedMime) || 'image/jpeg';

      return {
        imageData: imageBuffer,
        mimeType,
        prompt: request.prompt,
        model,
        seed: request.seed,
        aspectRatio: request.aspectRatio || '1:1'
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error('Génération d\'image interrompue (délai de 120s dépassé ou annulation utilisateur).');
      }
      throw err;
    }
  }
}
