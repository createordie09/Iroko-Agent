export interface ImageModelInfo {
  id: string;
  name: string;
  providerId: string;
  supportsEdit?: boolean;
  defaultAspectRatio?: string;
}

export interface GenerateImageRequest {
  prompt: string;
  aspectRatio?: string; // '1:1' | '16:9' | '9:16' | '4:3' | '3:2' etc.
  count?: number;
  seed?: number;
  model?: string;
  abortSignal?: AbortSignal;
  inputImageBuffer?: Buffer; // pour édition si supportée
  inputImageMime?: string;
}

export interface GenerateImageResult {
  imageData: Buffer;
  mimeType: string; // 'image/png' | 'image/jpeg' | 'image/webp'
  prompt: string;
  model: string;
  seed?: number;
  aspectRatio?: string;
  revisedPrompt?: string;
}

export interface MediaProvider {
  id: string;
  name: string;
  listImageModels(): Promise<ImageModelInfo[]>;
  generateImage(
    request: GenerateImageRequest,
    apiKey?: string,
    options?: { baseUrl?: string; accountId?: string }
  ): Promise<GenerateImageResult>;
}

export interface MediaSettings {
  activeProviderId: string;
  activeModelId: string;
  apiKey?: string;
  accountId?: string; // spécifique Cloudflare Workers AI
  baseUrl?: string;
}
