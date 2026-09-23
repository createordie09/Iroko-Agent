import { VideoProvider, VideoModelInfo, GenerateVideoRequest, VideoJobStatus } from '../videoTypes';

/**
 * Adaptateur fal.ai pour la génération de vidéo (Luma Dream Machine, Hunyuan, Fast SV3D, etc.).
 */
export class FalVideoAdapter implements VideoProvider {
  public readonly id = 'fal';
  public readonly name = 'fal.ai Video';

  public async listVideoModels(): Promise<VideoModelInfo[]> {
    return [
      {
        id: 'fal-ai/hunyuan-video',
        name: 'Hunyuan Video (Tencent)',
        providerId: 'fal',
        maxDurationSeconds: 5,
        supportedRatios: ['16:9', '9:16', '1:1'],
        supportsStartImage: true
      },
      {
        id: 'fal-ai/luma-dream-machine',
        name: 'Luma Dream Machine',
        providerId: 'fal',
        maxDurationSeconds: 5,
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
      throw new Error('Clé d\'API fal.ai (FAL_KEY) requise.');
    }

    const model = request.model || 'fal-ai/hunyuan-video';
    const baseUrl = (options?.baseUrl || 'https://queue.fal.run').replace(/\/+$/, '');
    const endpoint = `${baseUrl}/${model}`;

    const payload: any = {
      prompt: request.prompt,
      aspect_ratio: request.aspectRatio || '16:9'
    };

    if (request.startImage) {
      payload.image_url = request.startImage;
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Key ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Erreur fal.ai (${response.status}) : ${errText}`);
    }

    const data = await response.json();
    const requestId = data.request_id;
    if (!requestId) {
      throw new Error('Identifiant request_id manquant dans la réponse fal.ai.');
    }

    return {
      externalJobId: `${model}:::${requestId}`,
      pollUrl: data.status_url || `${baseUrl}/${model}/requests/${requestId}/status`,
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
    const parts = externalJobId.split(':::');
    const model = parts[0];
    const requestId = parts[1] || parts[0];

    const baseUrl = (options?.baseUrl || 'https://queue.fal.run').replace(/\/+$/, '');
    const statusUrl = options?.pollUrl || `${baseUrl}/${model}/requests/${requestId}/status`;

    const response = await fetch(statusUrl, {
      headers: { 'Authorization': `Key ${apiKey}` }
    });

    if (!response.ok) {
      const errText = await response.text();
      return {
        status: 'failed',
        error: `Erreur d'interrogation fal.ai (${response.status}) : ${errText}`
      };
    }

    const data = await response.json();

    if (data.status === 'ERROR') {
      return {
        status: 'failed',
        error: data.error || 'Erreur lors de la génération vidéo sur fal.ai.'
      };
    }

    if (data.status === 'IN_QUEUE') {
      return {
        status: 'queued',
        progress: 10
      };
    }

    if (data.status === 'IN_PROGRESS') {
      const logs = data.logs || [];
      return {
        status: 'processing',
        progress: 50
      };
    }

    if (data.status === 'COMPLETED') {
      // Récupérer le résultat final
      const resultUrl = `${baseUrl}/${model}/requests/${requestId}`;
      const resResult = await fetch(resultUrl, {
        headers: { 'Authorization': `Key ${apiKey}` }
      });
      if (!resResult.ok) {
        return {
          status: 'failed',
          error: `Impossible de récupérer le résultat fal.ai (${resResult.status}).`
        };
      }
      const resJson = await resResult.json();
      const videoUrl = resJson.video?.url || resJson.video_url || resJson.output;

      if (!videoUrl) {
        return {
          status: 'failed',
          error: 'Aucune URL de vidéo retournée dans le résultat fal.ai.'
        };
      }

      return {
        status: 'completed',
        progress: 100,
        downloadUrl: videoUrl,
        mimeType: 'video/mp4'
      };
    }

    return {
      status: 'processing',
      progress: 30
    };
  }

  public async cancelVideoJob(
    externalJobId: string,
    apiKey?: string,
    options?: { baseUrl?: string }
  ): Promise<boolean> {
    try {
      const parts = externalJobId.split(':::');
      const model = parts[0];
      const requestId = parts[1] || parts[0];
      const baseUrl = (options?.baseUrl || 'https://queue.fal.run').replace(/\/+$/, '');
      const cancelUrl = `${baseUrl}/${model}/requests/${requestId}/cancel`;
      const res = await fetch(cancelUrl, {
        method: 'POST',
        headers: { 'Authorization': `Key ${apiKey}` }
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
