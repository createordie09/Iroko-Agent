import { MediaProvider, ImageModelInfo, GenerateImageRequest, GenerateImageResult } from '../types';

/**
 * Image PNG 1x1 valide en base64 pour tests et environnement hors-ligne.
 */
const MINIMAL_VALID_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

export class MockImageAdapter implements MediaProvider {
  public readonly id = 'mock';
  public readonly name = 'Générateur de Test (Hors-ligne)';

  public async listImageModels(): Promise<ImageModelInfo[]> {
    return [
      {
        id: 'mock-image-v1',
        name: 'Générateur Simulé',
        providerId: 'mock',
        supportsEdit: true,
        defaultAspectRatio: '1:1'
      }
    ];
  }

  public async generateImage(
    request: GenerateImageRequest
  ): Promise<GenerateImageResult> {
    if (request.abortSignal?.aborted) {
      throw new Error('Génération d\'image interrompue par l\'utilisateur.');
    }

    // Petite pause simulant le traitement
    await new Promise(r => setTimeout(r, 100));

    const imageBuffer = Buffer.from(MINIMAL_VALID_PNG_BASE64, 'base64');

    return {
      imageData: imageBuffer,
      mimeType: 'image/png',
      prompt: request.prompt,
      model: request.model || 'mock-image-v1',
      seed: request.seed ?? 42,
      aspectRatio: request.aspectRatio || '1:1',
      revisedPrompt: `Image générée pour le prompt : "${request.prompt}"`
    };
  }
}
