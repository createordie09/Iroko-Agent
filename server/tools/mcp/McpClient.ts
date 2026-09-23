// server/tools/mcp/McpClient.ts
// Cahier §15, §19, §26 : Client MCP Multi-Transports (stdio, Streamable HTTP, SSE)

import cp, { ChildProcess } from 'child_process';
import { ProcessManager } from '../terminal/ProcessManager';
import { PrivacyFilter } from '../../security/PrivacyFilter';

export interface McpServerConfig {
  id?: string;
  name: string;
  type: 'stdio' | 'streamable-http' | 'sse' | 'http';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  enabled?: boolean;
  disabledTools?: string[];
  initTimeoutMs?: number;
}

export interface McpToolDefinition {
  name: string;
  description?: string;
  inputSchema: Record<string, any>;
}

export interface McpResourceDefinition {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export class McpClient {
  private process: ChildProcess | null = null;
  private messageId = 0;
  private pendingRequests: Map<number, {
    resolve: (res: any) => void;
    reject: (err: any) => void;
    timer: NodeJS.Timeout;
  }> = new Map();
  private buffer = '';
  private ssePostUrl: string | null = null;
  private sseAbortController: AbortController | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private intentionalDisconnect = false;
  private initTimeoutMs: number;

  public tools: McpToolDefinition[] = [];
  public resources: McpResourceDefinition[] = [];
  public status: 'connected' | 'connecting' | 'disconnected' | 'error' = 'disconnected';
  public error?: string;

  constructor(public readonly config: McpServerConfig) {
    this.initTimeoutMs = config.initTimeoutMs || 5000;
  }

  public async connect(): Promise<void> {
    this.intentionalDisconnect = false;
    this.status = 'connecting';
    this.error = undefined;
    this.buffer = '';

    try {
      if (this.config.type === 'stdio') {
        await this.connectStdio();
      } else if (this.config.type === 'streamable-http' || this.config.type === 'http') {
        await this.connectStreamableHttp();
      } else if (this.config.type === 'sse') {
        await this.connectSse();
      } else {
        throw new Error(`Type de transport MCP non supporté : ${this.config.type}`);
      }

      this.reconnectAttempts = 0;
      this.status = 'connected';
    } catch (err: any) {
      this.status = 'error';
      this.error = err.message || String(err);
      throw err;
    }
  }

  // --- Transport 1 : stdio ---
  private async connectStdio(): Promise<void> {
    if (!this.config.command) {
      throw new Error(`Aucune commande spécifiée pour le serveur stdio "${this.config.name}"`);
    }

    const sanitizedEnv = ProcessManager.getSanitizedEnv(this.config.env);
    const isWindows = process.platform === 'win32';
    const isCmdOrBat = isWindows && (this.config.command.endsWith('.cmd') || this.config.command.endsWith('.bat'));

    const proc = cp.spawn(this.config.command, this.config.args || [], {
      env: sanitizedEnv,
      shell: isCmdOrBat,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    this.process = proc;

    proc.stdout?.on('data', (data: Buffer) => {
      if (this.process !== proc) return;
      this.buffer += data.toString('utf-8');
      const lines = this.buffer.split('\n');
      this.buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const message = JSON.parse(trimmed);
          this.handleMessage(message);
        } catch {
          // Ignorer lignes de log non-JSON du serveur
        }
      }
    });

    proc.stderr?.on('data', (data: Buffer) => {
      if (this.process !== proc) return;
      const text = data.toString('utf-8').trim();
      const masked = PrivacyFilter.maskSecretsForLogs(text);
      console.warn(`[MCP:${this.config.name} STDERR]`, masked);
    });

    proc.on('error', (err) => {
      if (this.process !== proc) return;
      console.error(`[MCP:${this.config.name}] Erreur processus :`, err.message);
      this.status = 'error';
      this.error = err.message;
      for (const [, req] of this.pendingRequests) {
        clearTimeout(req.timer);
        req.reject(new Error(`Erreur processus MCP: ${err.message}`));
      }
      this.pendingRequests.clear();
    });

    proc.on('exit', (code) => {
      if (this.process !== proc) return;
      console.log(`[MCP:${this.config.name}] Processus terminé (code ${code})`);
      this.process = null;
      for (const [, req] of this.pendingRequests) {
        clearTimeout(req.timer);
        req.reject(new Error(`Processus MCP terminé (code ${code})`));
      }
      this.pendingRequests.clear();
      if (!this.intentionalDisconnect && this.status === 'connected') {
        this.status = 'disconnected';
        this.scheduleReconnect();
      }
    });

    // Initialisation MCP
    await this.initializeProtocol();
  }

  // --- Transport 2 : Streamable HTTP ---
  private async connectStreamableHttp(): Promise<void> {
    if (!this.config.url) {
      throw new Error(`Aucune URL spécifiée pour le serveur MCP "${this.config.name}"`);
    }

    // Tester la connectivité et initialiser le protocole via POST
    await this.initializeProtocol();
  }

  // --- Transport 3 : SSE (Server-Sent Events) ---
  private async connectSse(): Promise<void> {
    if (!this.config.url) {
      throw new Error(`Aucune URL spécifiée pour le serveur MCP SSE "${this.config.name}"`);
    }

    this.sseAbortController = new AbortController();
    const headers: Record<string, string> = {
      'Accept': 'text/event-stream',
      ...(this.config.headers || {})
    };

    const res = await fetch(this.config.url, {
      method: 'GET',
      headers,
      signal: this.sseAbortController.signal
    });

    if (!res.ok) {
      throw new Error(`Échec de connexion SSE (${res.status} ${res.statusText})`);
    }

    // Écouter le flux SSE en arrière-plan
    this.readSseStream(res);

    // Initialiser le protocole
    await this.initializeProtocol();
  }

  private async readSseStream(res: Response): Promise<void> {
    if (!res.body) return;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let sseBuffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split('\n');
        sseBuffer = lines.pop() || '';

        let currentEvent = 'message';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          if (trimmed.startsWith('event:')) {
            currentEvent = trimmed.slice(6).trim();
          } else if (trimmed.startsWith('data:')) {
            const dataStr = trimmed.slice(5).trim();
            if (currentEvent === 'endpoint') {
              // L'événement 'endpoint' fournit l'URL pour les POSTs
              try {
                this.ssePostUrl = new URL(dataStr, this.config.url).toString();
              } catch {
                this.ssePostUrl = dataStr;
              }
            } else {
              try {
                const message = JSON.parse(dataStr);
                this.handleMessage(message);
              } catch {}
            }
          }
        }
      }
    } catch (err: any) {
      if (!this.intentionalDisconnect) {
        console.warn(`[MCP:${this.config.name}] Flux SSE interrompu :`, err.message);
        this.status = 'disconnected';
        this.scheduleReconnect();
      }
    }
  }

  // --- Initialisation du protocole JSON-RPC MCP ---
  private async initializeProtocol(): Promise<void> {
    const timeout = this.initTimeoutMs;
    const initResponse = await this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'iroko-agent',
        version: '1.0.0'
      }
    }, timeout);

    // Notification 'notifications/initialized'
    this.sendNotification('notifications/initialized');

    // Découverte des outils (tools/list)
    try {
      const toolsResponse = await this.sendRequest('tools/list', {}, timeout);
      this.tools = Array.isArray(toolsResponse?.tools) ? toolsResponse.tools : [];
    } catch (err: any) {
      console.warn(`[MCP:${this.config.name}] Impossible de lister les outils :`, err.message);
      this.tools = [];
    }

    // Découverte des ressources (resources/list)
    try {
      const resourcesResponse = await this.sendRequest('resources/list', {}, timeout);
      this.resources = Array.isArray(resourcesResponse?.resources) ? resourcesResponse.resources : [];
    } catch {
      this.resources = [];
    }
  }

  // --- Reconnexion avec backoff exponentiel ---
  private scheduleReconnect(): void {
    if (this.intentionalDisconnect) return;
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.warn(`[MCP:${this.config.name}] Nombre maximal de tentatives de reconnexion atteint (${this.maxReconnectAttempts}).`);
      return;
    }

    const delayMs = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 16000);
    this.reconnectAttempts++;
    console.log(`[MCP:${this.config.name}] Reconnexion dans ${delayMs}ms (tentative ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);

    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(() => {});
    }, delayMs);
  }

  // --- Envoi de requêtes & notifications JSON-RPC ---
  public async sendRequest(method: string, params: Record<string, any> = {}, timeoutMs = 20000): Promise<any> {
    const id = ++this.messageId;

    if (this.config.type === 'stdio') {
      return this.sendStdioRequest(id, method, params, timeoutMs);
    } else {
      return this.sendHttpRequest(id, method, params, timeoutMs);
    }
  }

  private sendStdioRequest(id: number, method: string, params: Record<string, any>, timeoutMs: number): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.process?.stdin || this.process.killed) {
        return reject(new Error(`Serveur MCP stdio "${this.config.name}" non connecté`));
      }

      const timer = setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Délai d'attente dépassé (${timeoutMs}ms) pour l'appel MCP "${method}"`));
        }
      }, timeoutMs);

      this.pendingRequests.set(id, { resolve, reject, timer });

      const msg = JSON.stringify({
        jsonrpc: '2.0',
        id,
        method,
        params
      }) + '\n';

      try {
        this.process.stdin.write(msg);
      } catch (err: any) {
        clearTimeout(timer);
        this.pendingRequests.delete(id);
        reject(err);
      }
    });
  }

  private async sendHttpRequest(id: number, method: string, params: Record<string, any>, timeoutMs: number): Promise<any> {
    const targetUrl = (this.config.type === 'sse' && this.ssePostUrl) ? this.ssePostUrl : this.config.url!;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      ...(this.config.headers || {})
    };

    try {
      const res = await fetch(targetUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id,
          method,
          params
        }),
        signal: controller.signal
      });

      clearTimeout(timer);

      if (!res.ok) {
        throw new Error(`Erreur HTTP serveur MCP (${res.status} ${res.statusText})`);
      }

      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await res.json();
        if (data.error) {
          throw new Error(data.error.message || 'Erreur MCP JSON-RPC');
        }
        return data.result;
      }

      // Si le serveur répond avec un flux SSE en réponse au POST
      const text = await res.text();
      try {
        const parsed = JSON.parse(text);
        if (parsed.error) throw new Error(parsed.error.message || 'Erreur MCP');
        return parsed.result;
      } catch {
        return { content: [{ type: 'text', text }] };
      }
    } catch (err: any) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        throw new Error(`Délai d'attente dépassé (${timeoutMs}ms) pour l'appel MCP "${method}"`);
      }
      throw err;
    }
  }

  public sendNotification(method: string, params?: Record<string, any>): void {
    const msgObj = {
      jsonrpc: '2.0',
      method,
      params
    };

    if (this.config.type === 'stdio' && this.process?.stdin && !this.process.killed) {
      try {
        this.process.stdin.write(JSON.stringify(msgObj) + '\n');
      } catch {}
    } else if (this.config.url) {
      const targetUrl = (this.config.type === 'sse' && this.ssePostUrl) ? this.ssePostUrl : this.config.url;
      fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(this.config.headers || {}) },
        body: JSON.stringify(msgObj)
      }).catch(() => {});
    }
  }

  private handleMessage(message: any): void {
    if (message.id !== undefined && this.pendingRequests.has(message.id)) {
      const { resolve, reject, timer } = this.pendingRequests.get(message.id)!;
      clearTimeout(timer);
      this.pendingRequests.delete(message.id);

      if (message.error) {
        reject(new Error(message.error.message || 'Erreur MCP JSON-RPC'));
      } else {
        resolve(message.result);
      }
    }
  }

  public async callTool(toolName: string, args: unknown): Promise<any> {
    return this.sendRequest('tools/call', {
      name: toolName,
      arguments: args
    });
  }

  public async readResource(uri: string): Promise<any> {
    return this.sendRequest('resources/read', { uri });
  }

  public disconnect(): void {
    this.intentionalDisconnect = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    for (const [, req] of this.pendingRequests) {
      clearTimeout(req.timer);
      req.reject(new Error('Serveur MCP déconnecté'));
    }
    this.pendingRequests.clear();

    if (this.sseAbortController) {
      this.sseAbortController.abort();
      this.sseAbortController = null;
    }

    // Arrêt garanti de tout l'arbre de processus pour stdio (L8)
    const oldProcess = this.process;
    this.process = null;
    if (oldProcess) {
      oldProcess.removeAllListeners();
      try {
        oldProcess.stdin?.destroy();
        oldProcess.stdout?.destroy();
        oldProcess.stderr?.destroy();
      } catch {}
      if (oldProcess.pid) {
        ProcessManager.killProcessTree(oldProcess.pid);
        try {
          oldProcess.kill('SIGKILL');
        } catch {}
      }
      try {
        oldProcess.unref();
      } catch {}
    }

    this.status = 'disconnected';
  }
}
