import { tokenService } from '../security/TokenService';

export interface RecentWorkspace {
  path: string;
  name: string;
  last_opened_at: string;
}

export interface WorkspaceValidation {
  valid: boolean;
  canonicalPath?: string;
  name?: string;
  warning?: string;
  error?: string;
}

export interface OpenWorkspaceResult {
  success: boolean;
  path: string;
  name: string;
  isTemp?: boolean;
  warning?: string;
  metadata?: any;
  lock: {
    acquired: boolean;
    isReadOnly: boolean;
    holderConvId?: string;
    message?: string;
  };
  error?: string;
}

export class WorkspaceService {
  private static instance: WorkspaceService;

  public static getInstance(): WorkspaceService {
    if (!WorkspaceService.instance) {
      WorkspaceService.instance = new WorkspaceService();
    }
    return WorkspaceService.instance;
  }

  /**
   * Appel authentifié via la pile HTTP commune (jeton, reprise sur 401, même origine).
   * Une réponse d'erreur du serveur est rendue avec un champ `error` explicite.
   */
  private async request<T = any>(path: string, method: 'GET' | 'POST', body?: unknown): Promise<T> {
    const res = await tokenService.fetch(path, {
      method,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {})
    });
    let data: any;
    try {
      data = await res.json();
    } catch {
      throw new Error(`Réponse illisible du runtime local (HTTP ${res.status}).`);
    }
    if (!res.ok && data && typeof data === 'object' && !data.error) {
      data.error = `Requête refusée par le runtime local (HTTP ${res.status}).`;
    }
    return data as T;
  }

  public async pickFolder(): Promise<{ cancelled: boolean; path?: string; name?: string; warning?: string; error?: string }> {
    return this.request('/api/workspaces/pick', 'POST');
  }

  public async cancelPick(): Promise<boolean> {
    const data = await this.request('/api/workspaces/pick/cancel', 'POST');
    return Boolean(data.success);
  }

  public async validatePath(pathStr: string): Promise<WorkspaceValidation> {
    return this.request('/api/workspaces/validate', 'POST', { path: pathStr });
  }

  public async getRecentWorkspaces(): Promise<RecentWorkspace[]> {
    const data = await this.request('/api/workspaces/recent', 'GET');
    return data.recent || [];
  }

  public async openWorkspace(conversationId: string, pathStr?: string, isTemp = false): Promise<OpenWorkspaceResult> {
    return this.request('/api/workspaces/open', 'POST', { conversationId, path: pathStr, isTemp });
  }

  public async closeWorkspace(conversationId: string): Promise<boolean> {
    const data = await this.request('/api/workspaces/close', 'POST', { conversationId });
    return Boolean(data.success);
  }

  public async copyTempTo(conversationId: string, destinationPath: string): Promise<{ success: boolean; copiedFiles: number; totalBytes: number; error?: string }> {
    return this.request('/api/workspaces/temp/copy_to', 'POST', { conversationId, destinationPath });
  }
}

export const workspaceService = WorkspaceService.getInstance();
