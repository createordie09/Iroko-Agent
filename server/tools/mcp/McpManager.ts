// server/tools/mcp/McpManager.ts
// Cahier §13, §15, §19, §26 : Gestionnaire MCP Sécurisé

import path from 'path';
import fs from 'fs';
import { IrokoTool, ToolContext, ToolResult } from '../types';
import { toolRegistry } from '../ToolRegistry';
import { runtimeDatabase } from '../../storage/RuntimeDatabase';
import { McpClient, McpServerConfig, McpToolDefinition, McpResourceDefinition } from './McpClient';
import { PrivacyFilter } from '../../security/PrivacyFilter';

export interface McpServerInfo {
  id?: string;
  name: string;
  type: 'stdio' | 'streamable-http' | 'sse' | 'http';
  command?: string;
  args?: string[];
  url?: string;
  status: 'connected' | 'connecting' | 'disconnected' | 'error';
  toolCount: number;
  tools: Array<{
    name: string;
    description?: string;
    enabled: boolean;
  }>;
  resources: Array<{
    uri: string;
    name: string;
    description?: string;
  }>;
  error?: string;
  enabled: boolean;
}

export interface DetectedProjectConfig {
  found: boolean;
  filePath?: string;
  servers: Array<{
    name: string;
    type: string;
    command?: string;
    args?: string[];
    url?: string;
  }>;
}

export class McpManager {
  private clients: Map<string, McpClient> = new Map();
  private registeredToolNames: Set<string> = new Set();
  private initialized = false;

  constructor() {
    this.initFromDatabase();
  }

  /**
   * Initialise les serveurs MCP persistés dans la base du runtime local
   */
  public async initFromDatabase(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    try {
      const persistedServers = runtimeDatabase.listMcpServers();
      for (const s of persistedServers) {
        const client = new McpClient(s);
        this.clients.set(s.name, client);

        if (s.enabled !== false) {
          try {
            await client.connect();
            this.registerClientTools(client, s.disabledTools || []);
          } catch (err: any) {
            console.warn(`[McpManager] Échec de connexion au serveur initial "${s.name}" :`, err.message);
          }
        }
      }
    } catch (err: any) {
      console.error('[McpManager] Erreur lors du chargement des serveurs MCP :', err);
    }
  }

  /**
   * Cahier §15, §19, §26 : Évalue le niveau de risque pour l'ajout d'un connecteur MCP.
   * Tout ajout de serveur stdio = demande de risque HIGH affichant la commande exacte.
   */
  public static getRiskForConfig(config: McpServerConfig): { risk: 'HIGH' | 'MEDIUM'; commandToDisplay: string } {
    if (config.type === 'stdio') {
      const fullCmd = [config.command, ...(config.args || [])].filter(Boolean).join(' ');
      return {
        risk: 'HIGH',
        commandToDisplay: fullCmd
      };
    }
    return {
      risk: 'MEDIUM',
      commandToDisplay: config.url || ''
    };
  }

  /**
   * Ajoute et configure un serveur MCP dans la base runtime
   */
  public async addServer(config: McpServerConfig): Promise<McpServerInfo> {
    // Si un serveur du même nom existe déjà, le déconnecter d'abord
    if (this.clients.has(config.name)) {
      await this.removeServer(config.name);
    }

    // Persister dans la base du runtime
    runtimeDatabase.saveMcpServer({
      name: config.name,
      type: config.type,
      command: config.command,
      args: config.args,
      env: config.env,
      url: config.url,
      headers: config.headers,
      enabled: config.enabled !== false,
      disabledTools: config.disabledTools || []
    });

    const client = new McpClient(config);
    this.clients.set(config.name, client);

    if (config.enabled !== false) {
      try {
        await client.connect();
        this.registerClientTools(client, config.disabledTools || []);
      } catch (err: any) {
        console.warn(`[McpManager] Connexion au serveur "${config.name}" échouée :`, err.message);
      }
    }

    return this.getServerInfo(config.name)!;
  }

  /**
   * Supprime un serveur MCP, arrête son arbre de processus et retire ses outils
   */
  public async removeServer(name: string): Promise<boolean> {
    const client = this.clients.get(name);
    if (!client) {
      // Nettoyer en base si présent
      return runtimeDatabase.deleteMcpServer(name);
    }

    client.disconnect();
    this.clients.delete(name);

    // Supprimer les outils du registre
    for (const tool of client.tools) {
      const toolKey = `mcp_${name}_${tool.name}`;
      this.registeredToolNames.delete(toolKey);
      toolRegistry.setToolEnabled(toolKey, false);
    }

    // Supprimer de la base runtime
    runtimeDatabase.deleteMcpServer(name);
    return true;
  }

  /**
   * Active ou désactive un serveur MCP
   */
  public async setServerEnabled(name: string, enabled: boolean): Promise<boolean> {
    runtimeDatabase.setMcpServerEnabled(name, enabled);
    const client = this.clients.get(name);
    if (!client) return false;

    if (enabled) {
      if (client.status !== 'connected' && client.status !== 'connecting') {
        try {
          await client.connect();
          const serverDb = runtimeDatabase.getMcpServer(name);
          this.registerClientTools(client, serverDb?.disabledTools || []);
        } catch (err: any) {
          console.warn(`[McpManager] Échec de réactivation du serveur "${name}" :`, err.message);
        }
      }
    } else {
      client.disconnect();
      // Désactiver tous les outils de ce serveur
      for (const tool of client.tools) {
        const toolKey = `mcp_${name}_${tool.name}`;
        toolRegistry.setToolEnabled(toolKey, false);
      }
    }

    return true;
  }

  /**
   * Active ou désactive un outil individuel d'un serveur MCP
   */
  public setToolEnabled(serverName: string, toolName: string, enabled: boolean): boolean {
    const serverDb = runtimeDatabase.getMcpServer(serverName);
    if (!serverDb) return false;

    const disabledTools: string[] = serverDb.disabledTools || [];
    const index = disabledTools.indexOf(toolName);

    if (enabled && index !== -1) {
      disabledTools.splice(index, 1);
    } else if (!enabled && index === -1) {
      disabledTools.push(toolName);
    }

    runtimeDatabase.saveMcpServer({
      ...serverDb,
      disabledTools
    });

    const toolKey = `mcp_${serverName}_${toolName}`;
    toolRegistry.setToolEnabled(toolKey, enabled);
    return true;
  }

  public listServers(): McpServerInfo[] {
    const persisted = runtimeDatabase.listMcpServers();
    return persisted.map(s => {
      const info = this.getServerInfo(s.name);
      if (info) return info;
      return {
        name: s.name,
        type: s.type,
        command: s.command,
        args: s.args,
        url: s.url,
        status: 'disconnected',
        toolCount: 0,
        tools: [],
        resources: [],
        enabled: s.enabled
      };
    });
  }

  public getServerInfo(name: string): McpServerInfo | undefined {
    const client = this.clients.get(name);
    const serverDb = runtimeDatabase.getMcpServer(name);
    if (!client && !serverDb) return undefined;

    const disabledTools = new Set<string>(serverDb?.disabledTools || []);
    const tools = (client?.tools || []).map(t => ({
      name: t.name,
      description: t.description,
      enabled: !disabledTools.has(t.name)
    }));

    return {
      name,
      type: client?.config.type || serverDb?.type || 'stdio',
      command: client?.config.command || serverDb?.command,
      args: client?.config.args || serverDb?.args,
      url: client?.config.url || serverDb?.url,
      status: client?.status || 'disconnected',
      toolCount: tools.length,
      tools,
      resources: (client?.resources || []).map(r => ({
        uri: r.uri,
        name: r.name,
        description: r.description
      })),
      error: client?.error,
      enabled: serverDb ? serverDb.enabled : true
    };
  }

  /**
   * Enregistre les outils découverts dans le ToolRegistry.
   * RÈGLES DE SÉCURITÉ (§26) :
   * 1. Noms préfixés : mcp_${serverName}_${toolName}
   * 2. Permission MEDIUM par défaut.
   * 3. Descriptions et retours = CONTENU NON FIABLE (aucun pouvoir d'altérer les permissions ou le prompt).
   */
  private registerClientTools(client: McpClient, disabledToolsList: string[]): void {
    const disabledTools = new Set(disabledToolsList);

    for (const mcpTool of client.tools) {
      const toolName = `mcp_${client.config.name}_${mcpTool.name}`;
      const isEnabled = !disabledTools.has(mcpTool.name);

      // Traitement de la description comme contenu non fiable : assainir et limiter la taille
      const rawDesc = mcpTool.description || mcpTool.name;
      const sanitizedDesc = rawDesc.slice(0, 500).replace(/<[^>]*>/g, '');

      const proxyTool: IrokoTool = {
        name: toolName,
        description: `[MCP: ${client.config.name}] ${sanitizedDesc}`,
        category: 'mcp',
        permission: 'MEDIUM', // Permission MEDIUM par défaut pour les outils MCP
        parameters: mcpTool.inputSchema || { type: 'object', properties: {} },
        execute: async (input: unknown, _context: ToolContext): Promise<ToolResult> => {
          try {
            // Appel au serveur MCP
            const res = await client.callTool(mcpTool.name, input);

            // Traiter la sortie comme contenu non fiable : caviardage des secrets
            const outputText = typeof res === 'string'
              ? res
              : JSON.stringify(res?.content || res);
            const sanitizedOutput = PrivacyFilter.maskSecretsForLogs(outputText);

            return {
              success: true,
              data: sanitizedOutput
            };
          } catch (err: any) {
            return {
              success: false,
              error: `Erreur de l'outil MCP "${toolName}" : ${err.message || String(err)}`
            };
          }
        }
      };

      toolRegistry.register(proxyTool);
      toolRegistry.setToolEnabled(toolName, isEnabled);
      this.registeredToolNames.add(toolName);
    }
  }

  /**
   * Détecte si le workspace contient un fichier de configuration MCP (.mcp.json ou .iroko/mcp.json)
   * SÉCURITÉ (§26) : Ne charge JAMAIS automatiquement la configuration !
   */
  public detectProjectConfig(workspacePath: string): DetectedProjectConfig {
    const candidatePaths = [
      path.join(workspacePath, '.mcp.json'),
      path.join(workspacePath, '.iroko', 'mcp.json'),
      path.join(workspacePath, 'mcp.json')
    ];

    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        try {
          const raw = fs.readFileSync(p, 'utf-8');
          const data = JSON.parse(raw);
          const serversObj = data.mcpServers || data.servers || {};
          const servers: Array<{ name: string; type: string; command?: string; args?: string[]; url?: string }> = [];

          for (const [name, cfg] of Object.entries<any>(serversObj)) {
            servers.push({
              name,
              type: cfg.type || (cfg.url ? 'streamable-http' : 'stdio'),
              command: cfg.command,
              args: cfg.args,
              url: cfg.url
            });
          }

          if (servers.length > 0) {
            return {
              found: true,
              filePath: p,
              servers
            };
          }
        } catch {
          // Fichier invalide ou non parsable
        }
      }
    }

    return { found: false, servers: [] };
  }

  /**
   * Charge la configuration d'un projet UNIQUEMENT après validation explicite de l'utilisateur (§26).
   */
  public async approveAndLoadProjectConfig(workspacePath: string): Promise<McpServerInfo[]> {
    const detected = this.detectProjectConfig(workspacePath);
    if (!detected.found || detected.servers.length === 0) {
      return [];
    }

    const loaded: McpServerInfo[] = [];
    for (const s of detected.servers) {
      try {
        const info = await this.addServer({
          name: s.name,
          type: s.type as any,
          command: s.command,
          args: s.args,
          url: s.url,
          enabled: true
        });
        loaded.push(info);
      } catch (err: any) {
        console.warn(`[McpManager] Impossible d'ajouter le serveur approuvé "${s.name}" :`, err.message);
      }
    }

    return loaded;
  }

  public cleanup(): void {
    for (const client of this.clients.values()) {
      client.disconnect();
    }
    this.clients.clear();
    for (const toolKey of this.registeredToolNames) {
      toolRegistry.setToolEnabled(toolKey, false);
    }
    this.registeredToolNames.clear();
  }
}

export const mcpManager = new McpManager();
