import { MediaProvider, ImageModelInfo, GenerateImageRequest, GenerateImageResult } from '../types';
import { SsrfGuard } from '../security/SsrfGuard';

export class OpenAIImageAdapter implements MediaProvider {
  public readonly id = 'openai';
  public readonly name = 'OpenAI / Compatible';

  public async listImageModels(): Promise<ImageModelInfo[]> {
    return [
      { id: 'dall-e-3', name: 'DALL-E 3', providerId: 'openai', supportsEdit: false, defaultAspectRatio: '1:1' },
      { id: 'dall-e-2', name: 'DALL-E 2', providerId: 'openai', supportsEdit: true, defaultAspectRatio: '1:1' },
      { id: 'gpt-image-1', name: 'GPT Image 1', providerId: 'openai', supportsEdit: true, defaultAspectRatio: '1:1' }
    ];
  }

  public async generateImage(
    request: GenerateImageRequest,
    apiKey?: string,
    options?: { baseUrl?: string }
  ): Promise<GenerateImageResult> {
    if (!apiKey) {
      throw new Error('Clé d\'API requise pour le fournisseur OpenAI.');
    }

    const baseUrl = (options?.baseUrl || 'https://api.openai.com').replace(/\/+$/, '');
    const model = request.model || 'dall-e-3';

    // Résolution de la dimension selon le ratio
    let size = '1024x1024';
    if (model === 'dall-e-3') {
      if (request.aspectRatio === '16:9' || request.aspectRatio === '3:2') {
        size = '1792x1024';
      } else if (request.aspectRatio === '9:16' || request.aspectRatio === '2:3') {
        size = '1024x1792';
      }
    } else if (model === 'dall-e-2') {
      if (request.aspectRatio === '512x512') {
        size = '512x512';
      }
    }

    const payload: any = {
      model,
      prompt: request.prompt,
      n: request.count || 1,
      size,
      response_format: 'b64_json'
    };

    const endpoint = `${baseUrl}/v1/images/generations`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000); // 120s timeout cahier §10

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
          if (errJson?.error?.message) {
            errDetail = errJson.error.message;
          }
        } catch {
          const errText = await response.text();
          if (errText) errDetail = errText;
        }

        if (response.status === 429) {
          throw new Error(`Quota ou limite de débit dépassée (429) : ${errDetail}`);
        } else if (response.status === 400 && errDetail.toLowerCase().includes('safety')) {
          throw new Error(`Refus de contenu / filtre de sécurité : ${errDetail}`);
        } else {
          throw new Error(`Erreur du fournisseur OpenAI : ${errDetail}`);
        }
      }

      const data = await response.json();
      const firstItem = data?.data?.[0];

      if (!firstItem) {
        throw new Error('Aucune image renvoyée par le fournisseur.');
      }

      let imageBuffer: Buffer;
      let mimeType = 'image/png';

      if (firstItem.b64_json) {
        imageBuffer = Buffer.from(firstItem.b64_json, 'base64');
        const validation = SsrfGuard.validateImageMagicBytes(imageBuffer);
        if (validation.valid && validation.detectedMime) {
          mimeType = validation.detectedMime;
        }
      } else if (firstItem.url) {
        // Sécurité SSRF stricte côté runtime
        const downloaded = await SsrfGuard.safeDownloadImage(firstItem.url, request.abortSignal);
        imageBuffer = downloaded.buffer;
        mimeType = downloaded.mimeType;
      } else {
        throw new Error('Format de réponse non reconnu (ni b64_json ni url).');
      }

      return {
        imageData: imageBuffer,
        mimeType,
        prompt: request.prompt,
        model,
        seed: request.seed,
        aspectRatio: request.aspectRatio || '1:1',
        revisedPrompt: firstItem.revised_prompt
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
