import { tokenService } from '../security/TokenService';

export interface ArtifactVersionMeta {
  id: string;
  artifactId: string;
  version: number;
  size: number;
  filePath: string;
  createdAt: string;
}

export interface ArtifactPublicInfo {
  id: string;
  conversationId: string;
  messageId?: string | null;
  name: string;
  title?: string | null;
  mimeType: string;
  currentVersion: number;
  size: number;
  metadata?: any;
  createdAt: string;
  updatedAt: string;
  versions: ArtifactVersionMeta[];
  content?: string;
}

export class ArtifactService {
  private static instance: ArtifactService;

  public static getInstance(): ArtifactService {
    if (!ArtifactService.instance) {
      ArtifactService.instance = new ArtifactService();
    }
    return ArtifactService.instance;
  }

  public async listArtifacts(conversationId: string): Promise<ArtifactPublicInfo[]> {
    try {
      const res = await tokenService.fetch(`/api/conversations/${encodeURIComponent(conversationId)}/artifacts`);
      if (!res.ok) return [];
      const data = await res.json();
      // Le serveur retourne soit un tableau direct, soit { artifacts: [...] } (compatibilité)
      return Array.isArray(data) ? data : (data.artifacts || []);
    } catch {
      return [];
    }
  }

  public async getArtifact(id: string): Promise<ArtifactPublicInfo | null> {
    try {
      const res = await tokenService.fetch(`/api/artifacts/${encodeURIComponent(id)}`);
      if (!res.ok) return null;
      const data = await res.json();
      return data.artifact || null;
    } catch {
      return null;
    }
  }

  public async getArtifactVersion(id: string, version: number): Promise<{ version: ArtifactVersionMeta; content: string } | null> {
    try {
      const res = await tokenService.fetch(`/api/artifacts/${encodeURIComponent(id)}/versions/${version}`);
      if (!res.ok) return null;
      const data = await res.json();
      return data;
    } catch {
      return null;
    }
  }

  public async restoreVersion(id: string, version: number): Promise<ArtifactPublicInfo | null> {
    try {
      const res = await tokenService.fetch(`/api/artifacts/${encodeURIComponent(id)}/restore`, {
        method: 'POST',
        body: JSON.stringify({ version })
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.artifact || null;
    } catch {
      return null;
    }
  }

  public async downloadArtifact(id: string, filename: string, version?: number): Promise<boolean> {
    try {
      const url = version !== undefined
        ? `/api/artifacts/${encodeURIComponent(id)}/versions/${version}/download`
        : `/api/artifacts/${encodeURIComponent(id)}/download`;

      const res = await tokenService.fetch(url);

      if (!res.ok) return false;

      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
      return true;
    } catch {
      return false;
    }
  }

  public async downloadAllArtifacts(conversationId: string): Promise<boolean> {
    try {
      const url = `/api/conversations/${encodeURIComponent(conversationId)}/artifacts/download-all`;
      const res = await tokenService.fetch(url);
      if (!res.ok) return false;

      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `artefacts_${conversationId.substring(0, 12)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
      return true;
    } catch {
      return false;
    }
  }

  public async getArtifactPreview(id: string, version?: number): Promise<{
    previewType: 'text' | 'html' | 'svg' | 'image' | 'docx' | 'xlsx' | 'pptx' | 'pdf' | 'binary';
    text?: string;
    sheets?: Array<{ name: string; rows: any[][] }>;
    slides?: Array<{ title?: string; text: string }>;
    pageCount?: number;
    metadata?: Record<string, any>;
    error?: string;
  } | null> {
    try {
      const url = version !== undefined
        ? `/api/artifacts/${encodeURIComponent(id)}/preview?version=${version}`
        : `/api/artifacts/${encodeURIComponent(id)}/preview`;
      const res = await tokenService.fetch(url);
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }
}

export const artifactService = ArtifactService.getInstance();
