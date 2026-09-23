import { VideoProvider, VideoModelInfo, GenerateVideoRequest, VideoJobStatus } from '../videoTypes';

/**
 * Adaptateur Replicate pour la génération de vidéo (Luma Ray, Kling, Wan, CogVideoX, etc.).
 */
export class ReplicateVideoAdapter implements VideoProvider {
  public readonly id = 'replicate';
  public readonly name = 'Replicate Video';

  public async listVideoModels(): Promise<VideoModelInfo[]> {
    return [
      {
        id: 'minimax/video-01',
        name: 'Minimax Video-01',
        providerId: 'replicate',
        maxDurationSeconds: 6,
        supportedRatios: ['16:9', '9:16', '1:1'],
        supportsStartImage: true
      },
      {
        id: 'kwaivgi/kling-v1.6-standard',
        name: 'Kling v1.6 Standard',
        providerId: 'replicate',
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
      throw new Error('Jeton d\'API Replicate (API Token) requis.');
    }

    const model = request.model || 'minimax/video-01';
    const baseUrl = (options?.baseUrl || 'https://api.replicate.com/v1').replace(/\/+$/, '');
    const endpoint = `${baseUrl}/models/${model}/predictions`;

    const inputPayload: any = {
      prompt: request.prompt,
      prompt_optimizer: true
    };

    if (request.startImage) {
      inputPayload.first_frame_image = request.startImage;
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ input: inputPayload })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Erreur Replicate (${response.status}) : ${errText}`);
    }

    const data = await response.json();
    return {
      externalJobId: data.id,
      pollUrl: data.urls?.get || `${baseUrl}/predictions/${data.id}`,
      initialStatus: data.status === 'starting' ? 'queued' : 'processing'
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
    const baseUrl = (options?.baseUrl || 'https://api.replicate.com/v1').replace(/\/+$/, '');
    const url = options?.pollUrl || `${baseUrl}/predictions/${externalJobId}`;

    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });

    if (!response.ok) {
      const errText = await response.text();
      return {
        status: 'failed',
        error: `Erreur d'interrogation Replicate (${response.status}) : ${errText}`
      };
    }

    const data = await response.json();

    if (data.status === 'failed') {
      return {
        status: 'failed',
        error: data.error || 'Échec de la génération vidéo sur Replicate.'
      };
    }

    if (data.status === 'canceled') {
      return {
        status: 'cancelled',
        error: 'Génération vidéo annulée.'
      };
    }

    if (data.status === 'succeeded') {
      const output = data.output;
      const downloadUrl = typeof output === 'string' ? output : (Array.isArray(output) ? output[0] : null);
      if (!downloadUrl) {
        return {
          status: 'failed',
          error: 'Aucune URL de vidéo retournée par Replicate.'
        };
      }

      return {
        status: 'completed',
        progress: 100,
        downloadUrl,
        mimeType: 'video/mp4'
      };
    }

    return {
      status: data.status === 'starting' ? 'queued' : 'processing',
      progress: data.status === 'processing' ? 50 : 10
    };
  }

  public async cancelVideoJob(
    externalJobId: string,
    apiKey?: string,
    options?: { baseUrl?: string }
  ): Promise<boolean> {
    try {
      const baseUrl = (options?.baseUrl || 'https://api.replicate.com/v1').replace(/\/+$/, '');
      const url = `${baseUrl}/predictions/${externalJobId}/cancel`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
