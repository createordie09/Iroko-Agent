import { VideoProvider, VideoModelInfo, GenerateVideoRequest, VideoJobStatus } from '../videoTypes';
import { SsrfGuard } from '../security/SsrfGuard';

/**
 * Adaptateur Google Veo via l'API Gemini / Vertex AI (§10, §26).
 */
export class GoogleVideoAdapter implements VideoProvider {
  public readonly id = 'google';
  public readonly name = 'Google Veo (Gemini / Vertex AI)';

  public async listVideoModels(): Promise<VideoModelInfo[]> {
    return [
      {
        id: 'veo-2.0-generate-001',
        name: 'Veo 2.0 (Google DeepMind)',
        providerId: 'google',
        maxDurationSeconds: 10,
        supportedRatios: ['16:9', '9:16', '1:1'],
        supportsStartImage: true
      }
    ];
  }

  public async createVideoJob(
    request: GenerateVideoRequest,
    apiKey?: string,
    options?: { baseUrl?: string }
  ): Promise<{ externalJobId: string; pollUrl?: string; initialStatus?: VideoJobStatus }> {
    if (!apiKey) {
      throw new Error('Clé d\'API Google AI / Gemini requise pour Veo.');
    }

    const model = request.model || 'veo-2.0-generate-001';
    const baseUrl = (options?.baseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '');
    const endpoint = `${baseUrl}/models/${model}:predictLongRunning?key=${encodeURIComponent(apiKey)}`;

    const payload: any = {
      instances: [
        {
          prompt: request.prompt
        }
      ],
      parameters: {
        aspectRatio: request.aspectRatio || '16:9',
        durationSeconds: request.duration || 5,
        personGeneration: 'ALLOW_ADULT'
      }
    };

    if (request.startImage) {
      payload.instances[0].image = {
        bytesBase64Encoded: request.startImage.startsWith('data:') 
          ? request.startImage.split(',')[1] 
          : request.startImage
      };
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Erreur Google Veo (${response.status}) : ${errText}`);
    }

    const data = await response.json();
    const opName = data.name || data.id;
    if (!opName) {
      throw new Error('Identifiant d\'opération manquant dans la réponse de Google Veo.');
    }

    return {
      externalJobId: opName,
      pollUrl: `${baseUrl}/${opName}?key=${encodeURIComponent(apiKey)}`,
      initialStatus: 'queued'
    };
  }

  public async pollVideoJob(
    externalJobId: string,
    apiKey?: string,
    options?: { baseUrl?: string; pollUrl?: string }
  ): Promise<{
    status: VideoJobStatus;
    progress?: number;
    videoBuffer?: Buffer;
    downloadUrl?: string;
    mimeType?: string;
    error?: string;
  }> {
    const baseUrl = (options?.baseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '');
    const url = options?.pollUrl || `${baseUrl}/${externalJobId}?key=${encodeURIComponent(apiKey || '')}`;

    const response = await fetch(url);
    if (!response.ok) {
      const errText = await response.text();
      return {
        status: 'failed',
        error: `Erreur d'interrogation Veo (${response.status}) : ${errText}`
      };
    }

    const data = await response.json();

    if (data.error) {
      return {
        status: 'failed',
        error: data.error.message || JSON.stringify(data.error)
      };
    }

    if (!data.done) {
      // Opération encore en cours
      const metadata = data.metadata || {};
      const progress = metadata.progressPercent || 50;
      return {
        status: 'processing',
        progress
      };
    }

    // Terminé : extraction de la vidéo
    const responseData = data.response;
    const generateVideoResponse = responseData?.generateVideoResponse;
    const videoObj = generateVideoResponse?.generatedSamples?.[0]?.video || responseData?.video;

    if (videoObj?.bytesBase64Encoded) {
      const buf = Buffer.from(videoObj.bytesBase64Encoded, 'base64');
      const check = SsrfGuard.validateVideoMagicBytes(buf);
      return {
        status: 'completed',
        progress: 100,
        videoBuffer: buf,
        mimeType: check.valid ? check.detectedMime : 'video/mp4'
      };
    }

    if (videoObj?.uri) {
      return {
        status: 'completed',
        progress: 100,
        downloadUrl: videoObj.uri,
        mimeType: 'video/mp4'
      };
    }

    return {
      status: 'failed',
      error: 'Aucune donnée vidéo trouvée dans le résultat Veo.'
    };
  }

  public async cancelVideoJob(
    externalJobId: string,
    apiKey?: string,
    options?: { baseUrl?: string }
  ): Promise<boolean> {
    try {
      const baseUrl = (options?.baseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '');
      const url = `${baseUrl}/${externalJobId}:cancel?key=${encodeURIComponent(apiKey || '')}`;
      const res = await fetch(url, { method: 'POST' });
      return res.ok;
    } catch {
      return false;
    }
  }
}
