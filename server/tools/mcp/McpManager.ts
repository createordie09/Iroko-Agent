import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { IrokoTool, ToolContext, ToolResult } from '../types';
import { toolRegistry } from '../ToolRegistry';

export interface McpServerConfig {
  name: string;
  type: 'stdio' | 'sse';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  enabled?: boolean;
}

export interface McpToolDefinition {
  name: string;
  description?: string;
  inputSchema: Record<string, any>;
}

export interface McpServerInfo {
  name: string;
  type: 'stdio' | 'sse';
  status: 'connected' | 'disconnected' | 'error';
  toolCount: number;
  tools: string[];
  error?: string;
}

class McpClient {
  private process: ChildProcess | null = null;
  private messageId = 0;
  private pendingRequests: Map<number, { resolve: (res: any) => void; reject: (err: any) => void; timer: NodeJS.Timeout }> = new Map();
  private buffer = '';
  public tools: McpToolDefinition[] = [];
  public status: 'connected' | 'disconnected' | 'error' = 'disconnected';
  public error?: string;

  constructor(public readonly config: McpServerConfig) {}

  public async connect(): Promise<void> {
    if (this.config.type !== 'stdio') {
      this.status = 'error';
      this.error = 'Le transport SSE distant sera supporté avec fetch stream';
      return;
    }

    if (!this.config.command) {
      this.status = 'error';
      this.error = 'Aucune commande spécifiée pour le serveur MCP stdio';
      return;
    }

    try {
      this.process = spawn(this.config.command, this.config.args || [], {
        env: { ...process.env, ...(this.config.env || {}) },
        shell: process.platform === 'win32',
        stdio: ['pipe', 'pipe', 'pipe']
      });

      this.process.stdout?.on('data', (data: Buffer) => {
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
            // Ignorer lignes de log non JSON
          }
        }
      });

      this.process.stderr?.on('data', (data: Buffer) => {
        console.warn(`[MCP:${this.config.name} STDERR]`, data.toString('utf-8').trim());
      });

      this.process.on('error', (err) => {
        console.error(`[MCP:${this.config.name}] Erreur processus :`, err.message);
        this.status = 'error';
        this.error = err.message;
      });

      this.process.on('exit', (code) => {
        console.log(`[MCP:${this.config.name}] Processus terminé avec le code ${code}`);
        this.status = 'disconnected';
      });

      // 1. Initialiser le serveur
      await this.sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'iroko-agent',
          version: '1.0.0'
        }
      });

      // Notification initialized
      this.sendNotification('notifications/initialized');

      // 2. Découvrir la liste des outils
      const toolsResponse = await this.sendRequest('tools/list', {});
      this.tools = (toolsResponse?.tools || []) as McpToolDefinition[];
      this.status = 'connected';
      console.log(`[MCP:${this.config.name}] Connecté avec succès (${this.tools.length} outils découverts).`);
    } catch (err: any) {
      this.status = 'error';
      this.error = err.message || String(err);
      console.error(`[MCP:${this.config.name}] Échec d'initialisation :`, this.error);
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

  public sendNotification(method: string, params?: Record<string, any>): void {
    if (!this.process?.stdin || this.process.killed) return;
    const msg = JSON.stringify({
      jsonrpc: '2.0',
      method,
      params
    }) + '\n';
    this.process.stdin.write(msg);
  }

  public sendRequest(method: string, params: Record<string, any>, timeoutMs = 20000): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.process?.stdin || this.process.killed) {
        return reject(new Error(`Serveur MCP "${this.config.name}" non connecté`));
      }

      const id = ++this.messageId;
      const timer = setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Timeout (${timeoutMs}ms) lors de l'appel MCP "${method}"`));
        }
      }, timeoutMs);

      this.pendingRequests.set(id, { resolve, reject, timer });

      const msg = JSON.stringify({
        jsonrpc: '2.0',
        id,
        method,
        params
      }) + '\n';

      this.process.stdin.write(msg);
    });
  }

  public async callTool(toolName: string, args: unknown): Promise<any> {
    return this.sendRequest('tools/call', {
      name: toolName,
      arguments: args
    });
  }

  public disconnect(): void {
    for (const [, req] of this.pendingRequests) {
      clearTimeout(req.timer);
      req.reject(new Error('Serveur MCP déconnecté'));
    }
    this.pendingRequests.clear();

    if (this.process && !this.process.killed) {
      this.process.kill();
      this.process = null;
    }
    this.status = 'disconnected';
  }
}

export class McpManager {
  private clients: Map<string, McpClient> = new Map();
  private registeredToolNames: Set<string> = new Set();

  public async addServer(config: McpServerConfig): Promise<McpServerInfo> {
    if (this.clients.has(config.name)) {
      await this.removeServer(config.name);
    }

    const client = new McpClient(config);
    this.clients.set(config.name, client);

    if (config.enabled !== false) {
      await client.connect();
      this.registerClientTools(client);
    }

    return this.getServerInfo(config.name)!;
  }

  public async removeServer(name: string): Promise<boolean> {
    const client = this.clients.get(name);
    if (!client) return false;

    client.disconnect();
    this.clients.delete(name);

    // Supprimer les outils de ce serveur dans le registre
    for (const tool of client.tools) {
      const toolKey = `mcp_${name}_${tool.name}`;
      this.registeredToolNames.delete(toolKey);
      // Remarque: le ToolRegistry garde une Map interne
    }

    return true;
  }

  public listServers(): McpServerInfo[] {
    return Array.from(this.clients.keys()).map(name => this.getServerInfo(name)!);
  }

  public getServerInfo(name: string): McpServerInfo | undefined {
    const client = this.clients.get(name);
    if (!client) return undefined;

    return {
      name: client.config.name,
      type: client.config.type,
      status: client.status,
      toolCount: client.tools.length,
      tools: client.tools.map(t => t.name),
      error: client.error
    };
  }

  private registerClientTools(client: McpClient): void {
    for (const mcpTool of client.tools) {
      const toolName = `mcp_${client.config.name}_${mcpTool.name}`;
      if (this.registeredToolNames.has(toolName)) continue;

      const proxyTool: IrokoTool = {
        name: toolName,
        description: `[Serveur MCP: ${client.config.name}] ${mcpTool.description || mcpTool.name}`,
        category: 'mcp',
        permission: 'LOW',
        parameters: mcpTool.inputSchema || { type: 'object', properties: {} },
        execute: async (input: unknown, _context: ToolContext): Promise<ToolResult> => {
          try {
            const res = await client.callTool(mcpTool.name, input);
            return {
              success: true,
              data: res?.content || res
            };
          } catch (err: any) {
            return {
              success: false,
              error: `Erreur outil MCP "${toolName}" : ${err.message || String(err)}`
            };
          }
        }
      };

      toolRegistry.register(proxyTool);
      this.registeredToolNames.add(toolName);
    }
  }

  /**
   * Charge la configuration MCP du projet depuis mcp.json ou .iroko/mcp.json
   */
  public async loadWorkspaceConfig(workspacePath: string): Promise<void> {
    const candidatePaths = [
      path.join(workspacePath, '.iroko', 'mcp.json'),
      path.join(workspacePath, 'mcp.json')
    ];

    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        try {
          const raw = fs.readFileSync(p, 'utf-8');
          const data = JSON.parse(raw);
          const servers = data.mcpServers || {};

          for (const [name, cfg] of Object.entries<any>(servers)) {
            await this.addServer({
              name,
              type: cfg.type || 'stdio',
              command: cfg.command,
              args: cfg.args,
              env: cfg.env,
              url: cfg.url,
              enabled: cfg.enabled !== false
            });
          }
          console.log(`[McpManager] Configuration MCP chargée depuis ${p}`);
          break;
        } catch (err: any) {
          console.warn(`[McpManager] Impossible de lire le fichier de configuration MCP ${p} :`, err.message);
        }
      }
    }
  }

  public cleanup(): void {
    for (const client of this.clients.values()) {
      client.disconnect();
    }
    this.clients.clear();
  }
}

export const mcpManager = new McpManager();
