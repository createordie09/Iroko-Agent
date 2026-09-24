import { tokenService } from '../security/TokenService';

export interface ImageProviderOption {
  id: string;
  name: string;
}

export interface ImageModelOption {
  id: string;
  name: string;
  providerId: string;
  supportsEdit?: boolean;
  defaultAspectRatio?: string;
}

export interface MediaSettingsData {
  activeProviderId: string;
  activeModelId: string;
  hasKey: boolean;
  maskedKey: string | null;
  accountId?: string;
  baseUrl?: string;
  isConfigured: boolean;
}

export interface VideoProviderOption {
  id: string;
  name: string;
}

export interface VideoModelOption {
  id: string;
  name: string;
  providerId: string;
  defaultDuration?: number;
  supportedDurations?: number[];
  supportedAspectRatios?: string[];
}

export interface VideoSettingsData {
  activeProviderId: string;
  activeModelId: string;
  hasKey: boolean;
  maskedKey: string | null;
  timeoutMs?: number;
  isConfigured: boolean;
}

export interface VideoJobData {
  id: string;
  conversationId: string;
  providerId: string;
  modelId: string;
  prompt: string;
  duration: number;
  aspectRatio: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress?: number;
  error?: string;
  artifactId?: string;
  createdAt: number;
  updatedAt: number;
}

class MediaService {
  private async fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
    return tokenService.fetch(url, options);
  }

  public async getProviders(): Promise<ImageProviderOption[]> {
    try {
      const res = await this.fetchWithAuth('/api/media/providers');
      if (!res.ok) return [];
      return await res.json();
    } catch {
      return [];
    }
  }

  public async getModels(providerId?: string): Promise<ImageModelOption[]> {
    try {
      const url = providerId ? `/api/media/models?providerId=${encodeURIComponent(providerId)}` : '/api/media/models';
      const res = await this.fetchWithAuth(url);
      if (!res.ok) return [];
      return await res.json();
    } catch {
      return [];
    }
  }

  public async getSettings(): Promise<MediaSettingsData | null> {
    try {
      const res = await this.fetchWithAuth('/api/media/settings');
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  public async saveSettings(settings: {
    activeProviderId: string;
    activeModelId: string;
    apiKey?: string;
    accountId?: string;
    baseUrl?: string;
  }): Promise<{ success: boolean; isConfigured: boolean; error?: string }> {
    try {
      const res = await this.fetchWithAuth('/api/media/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      if (!res.ok) {
        const err = await res.json();
        return { success: false, isConfigured: false, error: err.error || 'Erreur d\'enregistrement' };
      }
      return await res.json();
    } catch (err: any) {
      return { success: false, isConfigured: false, error: err.message };
    }
  }

  public async generateImage(params: {
    prompt: string;
    aspectRatio?: string;
    count?: number;
    seed?: number;
    model?: string;
    conversationId?: string;
  }): Promise<{ success: boolean; artifact?: any; error?: string }> {
    try {
      const res = await this.fetchWithAuth('/api/media/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });
      if (!res.ok) {
        const err = await res.json();
        return { success: false, error: err.error || 'Erreur de génération' };
      }
      return await res.json();
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public async getVideoProviders(): Promise<VideoProviderOption[]> {
    try {
      const res = await this.fetchWithAuth('/api/media/video/providers');
      if (!res.ok) return [];
      return await res.json();
    } catch {
      return [];
    }
  }

  public async getVideoModels(providerId?: string): Promise<VideoModelOption[]> {
    try {
      const url = providerId ? `/api/media/video/models?providerId=${encodeURIComponent(providerId)}` : '/api/media/video/models';
      const res = await this.fetchWithAuth(url);
      if (!res.ok) return [];
      return await res.json();
    } catch {
      return [];
    }
  }

  public async getVideoSettings(): Promise<VideoSettingsData | null> {
    try {
      const res = await this.fetchWithAuth('/api/media/video/settings');
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  public async saveVideoSettings(settings: {
    activeProviderId: string;
    activeModelId: string;
    apiKey?: string;
    timeoutMs?: number;
  }): Promise<{ success: boolean; isConfigured: boolean; error?: string }> {
    try {
      const res = await this.fetchWithAuth('/api/media/video/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      if (!res.ok) {
        const err = await res.json();
        return { success: false, isConfigured: false, error: err.error || 'Erreur d\'enregistrement' };
      }
      return await res.json();
    } catch (err: any) {
      return { success: false, isConfigured: false, error: err.message };
    }
  }

  public async getVideoJobs(conversationId?: string): Promise<VideoJobData[]> {
    try {
      const url = conversationId ? `/api/media/video/jobs?conversationId=${encodeURIComponent(conversationId)}` : '/api/media/video/jobs';
      const res = await this.fetchWithAuth(url);
      if (!res.ok) return [];
      return await res.json();
    } catch {
      return [];
    }
  }

  public async cancelVideoJob(jobId: string): Promise<boolean> {
    try {
      const res = await this.fetchWithAuth(`/api/media/video/jobs/${encodeURIComponent(jobId)}/cancel`, {
        method: 'POST'
      });
      if (!res.ok) return false;
      const data = await res.json();
      return Boolean(data.success);
    } catch {
      return false;
    }
  }

  public async getVideoStreamTicket(artifactId: string): Promise<string | null> {
    try {
      const res = await this.fetchWithAuth('/api/media/video/ticket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artifactId })
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.ticket || null;
    } catch {
      return null;
    }
  }
}

export const mediaService = new MediaService();
