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
  private readonly baseUrl = 'http://127.0.0.1:3001';

  public static getInstance(): WorkspaceService {
    if (!WorkspaceService.instance) {
      WorkspaceService.instance = new WorkspaceService();
    }
    return WorkspaceService.instance;
  }

  private async getHeaders(): Promise<HeadersInit> {
    const token = await tokenService.getToken();
    return {
      'Content-Type': 'application/json',
      'X-Iroko-Request': '1',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    };
  }

  public async pickFolder(): Promise<{ cancelled: boolean; path?: string; name?: string; warning?: string; error?: string }> {
    const headers = await this.getHeaders();
    const res = await fetch(`${this.baseUrl}/api/workspaces/pick`, {
      method: 'POST',
      headers
    });
    return res.json();
  }

  public async cancelPick(): Promise<boolean> {
    const headers = await this.getHeaders();
    const res = await fetch(`${this.baseUrl}/api/workspaces/pick/cancel`, {
      method: 'POST',
      headers
    });
    const data = await res.json();
    return Boolean(data.success);
  }

  public async validatePath(pathStr: string): Promise<WorkspaceValidation> {
    const headers = await this.getHeaders();
    const res = await fetch(`${this.baseUrl}/api/workspaces/validate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ path: pathStr })
    });
    return res.json();
  }

  public async getRecentWorkspaces(): Promise<RecentWorkspace[]> {
    const headers = await this.getHeaders();
    const res = await fetch(`${this.baseUrl}/api/workspaces/recent`, {
      method: 'GET',
      headers
    });
    const data = await res.json();
    return data.recent || [];
  }

  public async openWorkspace(conversationId: string, pathStr?: string, isTemp = false): Promise<OpenWorkspaceResult> {
    const headers = await this.getHeaders();
    const res = await fetch(`${this.baseUrl}/api/workspaces/open`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ conversationId, path: pathStr, isTemp })
    });
    return res.json();
  }

  public async closeWorkspace(conversationId: string): Promise<boolean> {
    const headers = await this.getHeaders();
    const res = await fetch(`${this.baseUrl}/api/workspaces/close`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ conversationId })
    });
    const data = await res.json();
    return Boolean(data.success);
  }

  public async copyTempTo(conversationId: string, destinationPath: string): Promise<{ success: boolean; copiedFiles: number; totalBytes: number; error?: string }> {
    const headers = await this.getHeaders();
    const res = await fetch(`${this.baseUrl}/api/workspaces/temp/copy_to`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ conversationId, destinationPath })
    });
    return res.json();
  }
}

export const workspaceService = WorkspaceService.getInstance();
