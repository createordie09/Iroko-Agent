import { tokenService } from '../security/TokenService';

export interface AttachmentPublicInfo {
  id: string;
  conversationId: string;
  name: string;
  size: number;
  mimeType: string;
  detectedType: string;
  sha256: string;
  createdAt: string;
}

export interface AttachmentPreviewResult {
  preview: {
    type: 'text' | 'document' | 'spreadsheet' | 'image' | 'archive' | 'audio' | 'video' | 'binary';
    content?: string;
    truncated?: boolean;
    pageCount?: number;
    sheetNames?: string[];
    entries?: Array<{ name: string; size: number; isDirectory: boolean }>;
    metadata?: Record<string, any>;
    error?: string;
  };
  attachment: AttachmentPublicInfo;
}

export class AttachmentService {
  public async uploadAttachment(
    conversationId: string,
    file: File,
    onProgress?: (percent: number) => void
  ): Promise<AttachmentPublicInfo> {
    const token = await tokenService.getToken();

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const url = `/api/attachments?conversationId=${encodeURIComponent(conversationId)}&filename=${encodeURIComponent(file.name)}`;

      xhr.open('POST', url, true);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.setRequestHeader('X-Iroko-Request', '1');
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');

      if (xhr.upload && onProgress) {
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percent = Math.round((event.loaded / event.total) * 100);
            onProgress(percent);
          }
        };
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            resolve(data.attachment);
          } catch (e) {
            reject(new Error('Réponse serveur invalide'));
          }
        } else {
          try {
            const data = JSON.parse(xhr.responseText);
            reject(new Error(data.error || `Erreur serveur (${xhr.status})`));
          } catch {
            reject(new Error(`Erreur de téléversement (${xhr.status})`));
          }
        }
      };

      xhr.onerror = () => {
        reject(new Error('Échec de la connexion réseau lors du téléversement'));
      };

      xhr.send(file);
    });
  }

  public async getAttachment(id: string): Promise<AttachmentPublicInfo> {
    const res = await tokenService.fetch(`/api/attachments/${encodeURIComponent(id)}`);
    if (!res.ok) {
      throw new Error(`Pièce jointe introuvable (${res.status})`);
    }
    const data = await res.json();
    return data.attachment;
  }

  public async getAttachmentPreview(id: string): Promise<AttachmentPreviewResult> {
    const res = await tokenService.fetch(`/api/attachments/${encodeURIComponent(id)}/preview`);
    if (!res.ok) {
      throw new Error(`Aperçu indisponible (${res.status})`);
    }
    return res.json();
  }

  public async listAttachments(conversationId: string): Promise<AttachmentPublicInfo[]> {
    const res = await tokenService.fetch(`/api/conversations/${encodeURIComponent(conversationId)}/attachments`);
    if (!res.ok) {
      return [];
    }
    const data = await res.json();
    return data.attachments || [];
  }

  public async deleteAttachment(id: string): Promise<boolean> {
    const res = await tokenService.fetch(`/api/attachments/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
    if (!res.ok) return false;
    const data = await res.json();
    return Boolean(data.success);
  }
}

export const attachmentService = new AttachmentService();
