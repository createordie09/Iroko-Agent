export type VideoJobStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface VideoModelInfo {
  id: string;
  name: string;
  providerId: string;
  maxDurationSeconds?: number;
  supportedRatios?: string[];
  supportsStartImage?: boolean;
}

export interface GenerateVideoRequest {
  prompt: string;
  duration?: number; // secondes (ex: 5)
  aspectRatio?: string; // '16:9' | '9:16' | '1:1'
  startImage?: string; // chemin local, data URL ou URL
  model?: string;
  abortSignal?: AbortSignal;
}

export interface VideoJobRecord {
  id: string;
  conversationId: string;
  providerId: string;
  modelId: string;
  prompt: string;
  duration: number;
  aspectRatio: string;
  status: VideoJobStatus;
  progress?: number; // 0..100
  artifactId?: string;
  videoFilePath?: string;
  mimeType?: string;
  size?: number;
  error?: string;
  externalJobId?: string;
  pollUrl?: string;
  metadata?: any;
  createdAt: string;
  updatedAt: string;
}

export interface VideoProvider {
  id: string;
  name: string;
  listVideoModels(): Promise<VideoModelInfo[]>;
  createVideoJob(
    request: GenerateVideoRequest,
    apiKey?: string,
    options?: { baseUrl?: string; timeoutMs?: number }
  ): Promise<{ externalJobId: string; pollUrl?: string; initialStatus?: VideoJobStatus }>;
  pollVideoJob(
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
  }>;
  cancelVideoJob?(
    externalJobId: string,
    apiKey?: string,
    options?: { baseUrl?: string }
  ): Promise<boolean>;
}

export interface VideoSettings {
  activeProviderId: string;
  activeModelId: string;
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number; // par défaut 600000 (10 min)
  maxVideoBytes?: number; // par défaut 200 Mo
}
