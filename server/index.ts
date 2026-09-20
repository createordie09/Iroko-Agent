import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import crypto from 'crypto';
import { AgentEvent, ClientMessage } from './types/events';
import { modelGateway } from './models/ModelGateway';
import { toolRegistry } from './tools/ToolRegistry';
import { PermissionEngine } from './permissions/PermissionEngine';
import { processManager } from './tools/terminal/ProcessManager';
import { AgentRuntime } from './runtime/AgentRuntime';
import { workspaceManager } from './workspace/WorkspaceManager';
import { mcpManager } from './tools/mcp/McpManager';

const PORT = parseInt(process.env.AGENT_PORT || '3001', 10);
const DEFAULT_WORKSPACE = process.env.WORKSPACE_PATH || process.cwd();

// Serveur HTTP de base pour le contrôle de santé et fallback
const server = http.createServer(async (req, res) => {
  // CORS headers pour le client React Vite
    res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  const readJson = async (): Promise<any> => {
    return new Promise((resolve, reject) => {
      let data = '';
      req.on('data', chunk => { data += chunk; });
      req.on('end', () => {
        try {
          resolve(data ? JSON.parse(data) : {});
        } catch (e) {
          reject(new Error('Corps de requête JSON invalide'));
        }
      });
      req.on('error', reject);
    });
  };

  if (pathname === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      runtime: 'iroko-code-agent',
      version: '1.0.0',
      workspace: DEFAULT_WORKSPACE,
      timestamp: Date.now()
    }));
    return;
  }

  if (pathname === '/models' && req.method === 'GET') {
    const providers = modelGateway.getAvailableProviders();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      providers,
      defaultProvider: modelGateway.getDefaultProvider().id
    }));
    return;
  }

  // Fournisseurs d'IA & Stratégie globale
  if (pathname === '/api/providers' && req.method === 'GET') {
    const providers = modelGateway.getAvailableProviders();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      providers,
      defaultProvider: modelGateway.getDefaultProvider(),
      fallbackPolicy: modelGateway.getFallbackPolicy(),
      defaultStrategy: modelGateway.router.getDefaultStrategy()
    }));
    return;
  }

  // Clés API enregistrées (toutes masquées)
  if (pathname === '/api/credentials' && req.method === 'GET') {
    const credentials = modelGateway.keyPool.getAllKeysMasked();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ credentials }));
    return;
  }

  // Ajout d'une nouvelle clé API
  if (pathname === '/api/credentials' && req.method === 'POST') {
    try {
      const body = await readJson();
      if (!body.providerId || !body.key) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'providerId et key sont requis.' }));
        return;
      }

      // Test préalable de validité si demandé
      let validation: any = { valid: true };
      if (body.testBeforeSave !== false) {
        validation = await modelGateway.testCredential(body.providerId, body.key);
        if (!validation.valid && !body.force) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: `La validation de la clé a échoué : ${validation.error}`,
            validation
          }));
          return;
        }
      }

      const credential = await modelGateway.keyPool.addKey(
        body.providerId,
        body.label || '',
        body.key,
        body.priority || 1
      );

      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, credential, validation }));
    } catch (err: any) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message || 'Erreur lors de l\'ajout de la clé' }));
    }
    return;
  }

  // Mise à jour d'une clé (label, priorité, activation, statut)
  if (pathname === '/api/credentials' && req.method === 'PATCH') {
    try {
      const body = await readJson();
      const id = body.id || parsedUrl.searchParams.get('id');
      if (!id) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'id de la clé requis' }));
        return;
      }

      const updated = modelGateway.keyPool.updateKey(id, {
        label: body.label,
        priority: body.priority,
        enabled: body.enabled,
        status: body.status
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: Boolean(updated), credential: updated }));
    } catch (err: any) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // Suppression d'une clé
  if (pathname === '/api/credentials' && req.method === 'DELETE') {
    try {
      const id = parsedUrl.searchParams.get('id');
      if (!id) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Paramètre id manquant' }));
        return;
      }

      const removed = modelGateway.keyPool.removeKey(id);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: removed }));
    } catch (err: any) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // Test de connexion d'une clé (soit nouvelle en clair, soit existante par id)
  if (pathname === '/api/credentials/test' && req.method === 'POST') {
    try {
      const body = await readJson();
      let rawKey = body.key;
      let providerId = body.providerId;

      if (!rawKey && body.id) {
        const found = modelGateway.keyPool.getAllKeysMasked().find(k => k.id === body.id);
        if (found) {
          providerId = found.providerId;
          rawKey = modelGateway.keyPool.getDecryptedKey(body.id);
        }
      }

      if (!rawKey || !providerId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'providerId et key (ou id) sont requis.' }));
        return;
      }

      const testResult = await modelGateway.testCredential(providerId, rawKey);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(testResult));
    } catch (err: any) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ valid: false, error: err.message }));
    }
    return;
  }

  // Modification de la politique de fallback et de la stratégie
  if (pathname === '/api/router/policy' && req.method === 'PUT') {
    try {
      const body = await readJson();
      if (body.fallbackPolicy) {
        modelGateway.setFallbackPolicy(body.fallbackPolicy);
      }
      if (body.defaultStrategy) {
        modelGateway.router.setDefaultStrategy(body.defaultStrategy);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        fallbackPolicy: modelGateway.getFallbackPolicy(),
        defaultStrategy: modelGateway.router.getDefaultStrategy()
      }));
    } catch (err: any) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (pathname === '/tools' && req.method === 'GET') {
    const tools = toolRegistry.getAllTools().map(t => ({
      name: t.name,
      description: t.description,
      category: t.category,
      permission: t.permission,
      parameters: t.parameters
    }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      total: tools.length,
      tools
    }));
    return;
  }

  if (pathname === '/workspace' && req.method === 'GET') {
    try {
      const meta = await workspaceManager.analyze(DEFAULT_WORKSPACE);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(meta));
    } catch (err: any) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message || 'Erreur lors de l\'analyse du workspace' }));
    }
    return;
  }

  if (pathname === '/mcp/servers' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      servers: mcpManager.listServers()
    }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Endpoint non trouvé' }));
});

// Serveur WebSocket pour le canal d'événements bidirectionnel
const wss = new WebSocketServer({ server, path: '/ws' });

interface ActiveSession {
  id: string;
  ws: WebSocket;
  workspacePath: string;
  status: 'idle' | 'running';
  permissionEngine: PermissionEngine;
  runtime: AgentRuntime;
}

const sessions = new Map<string, ActiveSession>();

wss.on('connection', (ws: WebSocket) => {
  const sessionId = crypto.randomUUID();
  const permissionEngine = new PermissionEngine();

  const sendEvent = (event: AgentEvent) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(event));
    }
  };

  const runtime = new AgentRuntime(sessionId, DEFAULT_WORKSPACE, permissionEngine, sendEvent);

  const session: ActiveSession = {
    id: sessionId,
    ws,
    workspacePath: DEFAULT_WORKSPACE,
    status: 'idle',
    permissionEngine,
    runtime
  };
  sessions.set(sessionId, session);

  console.log(`[Iroko Runtime] Nouvelle session connectée : ${sessionId}`);

  // Événement d'accueil initial
  sendEvent({
    type: 'connected',
    sessionId,
    workspacePath: session.workspacePath
  });

  sendEvent({
    type: 'status',
    status: 'idle',
    message: 'Iroko Code Agent prêt sur le workspace ' + path.basename(session.workspacePath)
  });

  ws.on('message', (rawData: string) => {
    try {
      const message = JSON.parse(rawData.toString()) as ClientMessage;

      switch (message.type) {
        case 'init_session': {
          if (message.workspacePath) {
            session.workspacePath = message.workspacePath;
          }
          sendEvent({
            type: 'status',
            status: 'idle',
            message: `Session réinitialisée sur ${session.workspacePath}`
          });
          break;
        }

        case 'send_prompt': {
          console.log(`[Iroko Runtime][${sessionId}] Lancement de la tâche : "${message.prompt}"`);
          session.runtime.runTask(message.prompt, message.mode).catch(err => {
            console.error(`[Iroko Runtime][${sessionId}] Erreur d'exécution de tâche :`, err);
            sendEvent({
              type: 'error',
              message: err.message || 'Erreur inattendue dans la boucle agentique',
              fatal: false
            });
          });
          break;
        }

        case 'permission_response': {
          console.log(`[Iroko Runtime][${sessionId}] Réponse de permission pour ${message.requestId}: ${message.approved ? 'ACCORDÉE' : 'REFUSÉE'} (${message.scope || 'once'})`);
          session.permissionEngine.resolvePermission(message.requestId, message.approved, message.scope);
          break;
        }

        case 'cancel_task': {
          console.log(`[Iroko Runtime][${sessionId}] Tâche annulée par l'utilisateur`);
          session.runtime.cancelTask();
          break;
        }
      }
    } catch (err: any) {
      console.error('[Iroko Runtime] Erreur de parsing du message client :', err);
      sendEvent({
        type: 'error',
        message: err?.message || 'Erreur interne du protocole WebSocket',
        fatal: false
      });
    }
  });

  ws.on('close', () => {
    console.log(`[Iroko Runtime] Session déconnectée : ${sessionId}`);
    sessions.delete(sessionId);
  });

  ws.on('error', (err) => {
    console.error(`[Iroko Runtime] Erreur WebSocket sur session ${sessionId} :`, err);
  });
});

server.listen(PORT, '0.0.0.0', async () => {
  console.log(`=======================================================`);
  console.log(`🚀 IROKO CODE AGENT RUNTIME v1.0.0 démarré avec succès !`);
  console.log(`📡 HTTP Healthcheck : http://localhost:${PORT}/health`);
  console.log(`⚡ WebSocket Stream : ws://localhost:${PORT}/ws`);
  console.log(`📂 Workspace actif  : ${DEFAULT_WORKSPACE}`);
  console.log(`=======================================================`);

  // Charger les serveurs MCP configurés dans le workspace
  await mcpManager.loadWorkspaceConfig(DEFAULT_WORKSPACE);
});

process.on('SIGINT', () => {
  console.log('\n[Iroko Runtime] Arrêt en cours...');
  mcpManager.cleanup();
  processManager.cleanup();
  wss.close();
  server.close(() => {
    console.log('[Iroko Runtime] Arrêté.');
    process.exit(0);
  });
});
