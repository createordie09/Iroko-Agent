import { VideoProvider, VideoModelInfo, GenerateVideoRequest, VideoJobStatus } from '../videoTypes';

export function createMinimalMp4Buffer(): Buffer {
  const ftyp = Buffer.from([
    0x00, 0x00, 0x00, 0x18,
    0x66, 0x74, 0x79, 0x70,
    0x69, 0x73, 0x6f, 0x6d,
    0x00, 0x00, 0x02, 0x00,
    0x69, 0x73, 0x6f, 0x6d,
    0x6d, 0x70, 0x34, 0x31
  ]);

  const moov = Buffer.from([
    0x00, 0x00, 0x00, 0x10,
    0x6d, 0x6f, 0x6f, 0x76,
    0x00, 0x00, 0x00, 0x08,
    0x6d, 0x76, 0x68, 0x64
  ]);

  const mdat = Buffer.from([
    0x00, 0x00, 0x00, 0x20,
    0x6d, 0x64, 0x61, 0x74,
    0x00, 0x01, 0x02, 0x03,
    0x04, 0x05, 0x06, 0x07,
    0x08, 0x09, 0x0a, 0x0b,
    0x0c, 0x0d, 0x0e, 0x0f,
    0x10, 0x11, 0x12, 0x13,
    0x14, 0x15, 0x16, 0x17
  ]);

  return Buffer.concat([ftyp, moov, mdat]);
}

interface MockJobState {
  externalId: string;
  prompt: string;
  duration: number;
  aspectRatio: string;
  pollCount: number;
  status: VideoJobStatus;
  cancelled: boolean;
  createdAt: number;
}

export class MockVideoAdapter implements VideoProvider {
  public readonly id = 'mock';
  public readonly name = 'Fournisseur Vidéo de Test (Mock)';

  private jobs: Map<string, MockJobState> = new Map();

  public async listVideoModels(): Promise<VideoModelInfo[]> {
    return [
      {
        id: 'mock-video-v1',
        name: 'Mock Video 720p',
        providerId: 'mock',
        maxDurationSeconds: 10,
        supportedRatios: ['16:9', '9:16', '1:1'],
        supportsStartImage: true
      }
    ];
  }

  public async createVideoJob(
    request: GenerateVideoRequest
  ): Promise<{ externalJobId: string; pollUrl?: string; initialStatus?: VideoJobStatus }> {
    const externalJobId = `mock_job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    this.jobs.set(externalJobId, {
      externalId: externalJobId,
      prompt: request.prompt,
      duration: request.duration || 5,
      aspectRatio: request.aspectRatio || '16:9',
      pollCount: 0,
      status: 'queued',
      cancelled: false,
      createdAt: Date.now()
    });

    return {
      externalJobId,
      pollUrl: `/mock/poll/${externalJobId}`,
      initialStatus: 'queued'
    };
  }

  public async pollVideoJob(
    externalJobId: string
  ): Promise<{
    status: VideoJobStatus;
    progress?: number;
    videoBuffer?: Buffer;
    downloadUrl?: string;
    mimeType?: string;
    error?: string;
  }> {
    const job = this.jobs.get(externalJobId);
    if (!job) {
      // Pour simuler la reprise après redémarrage quand le job existe en DB mais pas dans la mémoire du mock
      return {
        status: 'completed',
        progress: 100,
        videoBuffer: createMinimalMp4Buffer(),
        mimeType: 'video/mp4'
      };
    }

    if (job.cancelled) {
      return {
        status: 'cancelled',
        error: 'Génération vidéo annulée.'
      };
    }

    job.pollCount++;

    if (job.pollCount === 1) {
      job.status = 'processing';
      return {
        status: 'processing',
        progress: 45
      };
    }

    if (job.pollCount === 2) {
      job.status = 'processing';
      return {
        status: 'processing',
        progress: 85
      };
    }

    job.status = 'completed';
    return {
      status: 'completed',
      progress: 100,
      videoBuffer: createMinimalMp4Buffer(),
      mimeType: 'video/mp4'
    };
  }

  public async cancelVideoJob(externalJobId: string): Promise<boolean> {
    const job = this.jobs.get(externalJobId);
    if (job) {
      job.cancelled = true;
      job.status = 'cancelled';
      return true;
    }
    return false;
  }
}
