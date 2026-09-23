import { MediaProvider, ImageModelInfo, GenerateImageRequest, GenerateImageResult } from '../types';
import { SsrfGuard } from '../security/SsrfGuard';

export class GoogleImageAdapter implements MediaProvider {
  public readonly id = 'google';
  public readonly name = 'Google Imagen';

  public async listImageModels(): Promise<ImageModelInfo[]> {
    return [
      { id: 'imagen-3.0-generate-002', name: 'Imagen 3', providerId: 'google', supportsEdit: false, defaultAspectRatio: '1:1' },
      { id: 'imagen-3.0-fast-generate-001', name: 'Imagen 3 Fast', providerId: 'google', supportsEdit: false, defaultAspectRatio: '1:1' }
    ];
  }

  public async generateImage(
    request: GenerateImageRequest,
    apiKey?: string,
    options?: { baseUrl?: string }
  ): Promise<GenerateImageResult> {
    if (!apiKey) {
      throw new Error('Clé d\'API requise pour le fournisseur Google Imagen.');
    }

    const model = request.model || 'imagen-3.0-generate-002';
    const baseUrl = (options?.baseUrl || 'https://generativelanguage.googleapis.com').replace(/\/+$/, '');
    const endpoint = `${baseUrl}/v1beta/models/${model}:predict?key=${encodeURIComponent(apiKey)}`;

    let aspectRatio = '1:1';
    if (request.aspectRatio === '16:9' || request.aspectRatio === '9:16' || request.aspectRatio === '4:3' || request.aspectRatio === '3:4') {
      aspectRatio = request.aspectRatio;
    }

    const payload = {
      instances: [
        {
          prompt: request.prompt
        }
      ],
      parameters: {
        sampleCount: request.count || 1,
        aspectRatio,
        personGeneration: 'ALLOW_ADULT',
        outputMimeType: 'image/jpeg'
      }
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);

    if (request.abortSignal) {
      request.abortSignal.addEventListener('abort', () => controller.abort());
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let errDetail = `Code HTTP ${response.status}`;
        try {
          const errJson = await response.json();
          if (errJson?.error?.message) {
            errDetail = errJson.error.message;
          }
        } catch {
          const errText = await response.text();
          if (errText) errDetail = errText;
        }

        if (response.status === 429) {
          throw new Error(`Quota ou limite de débit dépassée (429) : ${errDetail}`);
        } else if (errDetail.toLowerCase().includes('safety') || errDetail.toLowerCase().includes('block')) {
          throw new Error(`Refus de contenu / filtre de sécurité Google : ${errDetail}`);
        } else {
          throw new Error(`Erreur du fournisseur Google Imagen : ${errDetail}`);
        }
      }

      const data = await response.json();
      const firstPrediction = data?.predictions?.[0];

      if (!firstPrediction?.bytesBase64Encoded) {
        throw new Error('Aucune donnée image renvoyée par Google Imagen.');
      }

      const imageBuffer = Buffer.from(firstPrediction.bytesBase64Encoded, 'base64');
      const validation = SsrfGuard.validateImageMagicBytes(imageBuffer);
      const mimeType = (validation.valid && validation.detectedMime) || firstPrediction.mimeType || 'image/jpeg';

      return {
        imageData: imageBuffer,
        mimeType,
        prompt: request.prompt,
        model,
        seed: request.seed,
        aspectRatio
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
