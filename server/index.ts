import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import crypto from 'crypto';
import os from 'os';
import { AgentEvent, ClientMessage } from './types/events';
import { modelGateway } from './models/ModelGateway';
import { toolRegistry } from './tools/ToolRegistry';
import { PermissionEngine } from './permissions/PermissionEngine';
import { PermissionStore } from './permissions/PermissionStore';
import { processManager } from './tools/terminal/ProcessManager';
import { AgentRuntime } from './runtime/AgentRuntime';
import { workspaceManager } from './workspace/WorkspaceManager';
import { mcpManager } from './tools/mcp/McpManager';
import { skillManager } from './skills/SkillManager';
import fs from 'fs';
import { pluginManager } from './plugins/PluginManager';
import { runtimeDatabase } from './storage/RuntimeDatabase';
import { projectMemoryManager, containsSecret } from './memory/ProjectMemory';
import { attachmentManager } from './attachments/AttachmentManager';
import { AttachmentReader } from './attachments/AttachmentReader';
import { parseMultipartStream } from './attachments/multipart';
import { workspaceDialogPicker } from './workspace/WorkspaceDialogPicker';
import { WorkspaceValidator } from './workspace/WorkspaceValidator';
import { workspaceLockManager } from './workspace/WorkspaceLockManager';
import { tempWorkspaceManager } from './workspace/TempWorkspaceManager';
import { artifactManager } from './artifacts/ArtifactManager';
import { mediaGateway } from './media/MediaGateway';
import { videoGateway } from './media/VideoGateway';
import { searchGateway } from './search/SearchGateway';
import { networkGuard } from './security/NetworkGuard';
import { PrivacyFilter } from './security/PrivacyFilter';
import { logger } from './utils/logger';
import { LocalRateLimiter } from './security/LocalRateLimiter';
import { RuntimeWatchdog } from './supervisor/RuntimeWatchdog';
import { activeJobManager } from './runtime/ActiveJobManager';
import { deletionManager } from './storage/DeletionManager';
import { modelComparisonService } from './models/ModelComparisonService';

// Activation immédiate du Garde Réseau pour l'ensemble du runtime
networkGuard.install();

// Récupération automatique des tâches interrompues par arrêt brutal du runtime (Mission R3c)
try {
  const recovered = runtimeDatabase.recoverInterruptedGenerations();
  if (recovered.recoveredTasksCount > 0) {
    logger.info(`Récupération de ${recovered.recoveredTasksCount} tâche(s) interrompue(s) par arrêt précédent.`);
  }
} catch (err) {
  logger.warn('Erreur lors de la récupération des tâches interrompues', err);
}

const PORT = parseInt(process.env.AGENT_PORT || process.env.PORT || process.env.IROKO_PORT || '3001', 10);
const HOST = '127.0.0.1';
const DEFAULT_WORKSPACE = process.env.WORKSPACE_PATH || process.cwd();

export const permissionStore = PermissionStore.getInstance();

// Limiteurs de fréquence locaux avec délai d'attente progressif (Mission R3a)
export const bootstrapRateLimiter = new LocalRateLimiter({
  windowMs: 10000,
  maxRequests: 10,
  baseDelayMs: 1000,
  maxDelayMs: 30000
});

export const wsRateLimiter = new LocalRateLimiter({
  windowMs: 10000,
  maxRequests: 15,
  baseDelayMs: 1000,
  maxDelayMs: 30000
});

// Jeton éphémère d'authentification généré cryptographiquement au lancement (§26)
export const runtimeToken = crypto.randomBytes(32).toString('hex');

// Magasin en mémoire vive des tickets WebSocket éphémères à usage unique (validité 30s)
const wsTickets = new Map<string, { expiresAt: number }>();

// Nettoyage périodique des tickets expirés
setInterval(() => {
  const now = Date.now();
  for (const [t, data] of wsTickets.entries()) {
    if (data.expiresAt < now) wsTickets.delete(t);
  }
}, 10000).unref();

export interface ActiveSession {
  id: string;
  ws: WebSocket;
  workspacePath: string;
  status: 'idle' | 'running';
  permissionEngine: PermissionEngine;
  runtime: AgentRuntime;
  activeConvId?: string;
  activeTaskId?: string;
}

export const sessions = new Map<string, ActiveSession>();

export function broadcastWsEvent(event: any): void {
  const payload = JSON.stringify(event);
  for (const session of sessions.values()) {
    if (session.ws.readyState === WebSocket.OPEN) {
      session.ws.send(payload);
    }
  }
}

export function broadcastActiveTasksStatus(extra?: { conversationId?: string; status?: string }): void {
  const activeConvIds = new Set<string>();
  for (const sess of sessions.values()) {
    if ((sess.status === 'running' || sess.runtime?.isRunning()) && sess.activeConvId) {
      activeConvIds.add(sess.activeConvId);
    }
  }
  for (const job of activeJobManager.getAllActiveJobs()) {
    if (job.status === 'running') {
      activeConvIds.add(job.conversationId);
    }
  }
  try {
    const pendingJobs = runtimeDatabase.listPendingVideoJobs();
    for (const job of pendingJobs) {
      if (job.conversationId) {
        activeConvIds.add(job.conversationId);
      }
    }
  } catch {}

  broadcastWsEvent({
    type: 'agent_status_changed',
    activeConversationIds: Array.from(activeConvIds),
    runningCount: activeConvIds.size,
    timestamp: new Date().toISOString(),
    ...extra
  });
}


// Origines et Hosts autorisés configurables via environnement (pas codé en dur sur 5173)
const allowedOrigins = (process.env.ALLOWED_ORIGINS || `http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:${PORT},http://localhost:${PORT}`)
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const allowedHosts = (process.env.ALLOWED_HOSTS || `127.0.0.1:${PORT},localhost:${PORT},127.0.0.1:5173,localhost:5173,127.0.0.1,localhost`)
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

function isHostAllowed(hostHeader?: string): boolean {
  if (!hostHeader) return false;
  const cleanHost = hostHeader.toLowerCase().trim();
  return allowedHosts.some(h => cleanHost === h.toLowerCase());
}

function isOriginAllowed(originHeader?: string): boolean {
  if (!originHeader) return true; // Les requêtes sans Origin (ex. curl, scripts locaux) sont autorisées si elles ont le jeton
  return allowedOrigins.some(o => originHeader.toLowerCase().trim() === o.toLowerCase());
}

function verifyToken(req: http.IncomingMessage): boolean {
  const authHeader = req.headers.authorization;
  if (!authHeader) return false;
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') return false;
  return parts[1] === runtimeToken;
}

// Serveur HTTP durci
const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  const host = req.headers.host;

  // 1. Protection Anti-DNS Rebinding sur TOUTES les requêtes HTTP
  if (!isHostAllowed(host)) {
    logger.warn(`Requête rejetée : Host non autorisé (${host})`);
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Host non autorisé (protection DNS rebinding).' }));
    return;
  }

  // 2. Validation d'origine
  if (origin && !isOriginAllowed(origin)) {
    logger.warn(`Requête rejetée : Origine étrangère (${origin})`);
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Origine non autorisée.' }));
    return;
  }

  const parsedUrl = new URL(req.url || '/', `http://${host || '127.0.0.1:3001'}`);
  const pathname = parsedUrl.pathname;

  // 3. En-têtes de sécurité stricts (§26, § Mission M8.2)
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'microphone=(self)');
  res.setHeader('Content-Security-Policy', `default-src 'self'; connect-src 'self' http://127.0.0.1:${PORT} ws://127.0.0.1:${PORT} http://localhost:${PORT} ws://localhost:${PORT} http://127.0.0.1:5173 ws://127.0.0.1:5173 http://localhost:5173 ws://localhost:5173; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; script-src 'self' 'unsafe-inline'; frame-ancestors 'none';`);

  // 4. Traitement CORS sélectif (ZÉRO CORS * et ZÉRO CORS sur /api/bootstrap)
  if (pathname !== '/api/bootstrap' && origin && isOriginAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Iroko-Request');
    res.setHeader('Vary', 'Origin');
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Lecteur de corps JSON sécurisé avec plafond de taille strict (§26)
  const readJson = async (maxBytes = 1 * 1024 * 1024): Promise<any> => {
    return new Promise((resolve, reject) => {
      let size = 0;
      const chunks: Buffer[] = [];
      let tooLarge = false;

      req.on('data', chunk => {
        size += chunk.length;
        if (size > maxBytes) {
          tooLarge = true;
          req.destroy();
          const err: any = new Error('Payload trop volumineux');
          err.statusCode = 413;
          reject(err);
          return;
        }
        chunks.push(chunk);
      });

      req.on('end', () => {
        if (tooLarge) return;
        try {
          const raw = Buffer.concat(chunks).toString('utf-8');
          resolve(raw ? JSON.parse(raw) : {});
        } catch {
          const err: any = new Error('Corps de requête JSON invalide');
          err.statusCode = 400;
          reject(err);
        }
      });

      req.on('error', reject);
    });
  };

  // 4. Endpoint public : Healthcheck
  if (pathname === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      runtime: 'iroko-code-agent',
      version: '1.0.0',
      workspace: DEFAULT_WORKSPACE,
      timestamp: new Date().toISOString()
    }));
    return;
  }

  // 4b. Redirection de /code vers / (§ Mission M1)
  if (pathname === '/code') {
    res.writeHead(302, { 'Location': '/' });
    res.end();
    return;
  }

  // 5. Amorçage du jeton : GET /api/bootstrap (§26, §29, Mission R3a)
  // Strictement même origine ou client local, aucun CORS, X-Content-Type-Options: nosniff
  if ((pathname === '/api/bootstrap' || pathname === '/api/auth/bootstrap') && req.method === 'GET') {
    const secFetchSite = req.headers['sec-fetch-site'];
    if (secFetchSite && secFetchSite !== 'same-origin' && secFetchSite !== 'none') {
      logger.warn(`Bootstrap refusé : Sec-Fetch-Site non autorisé (${secFetchSite})`);
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Accès bootstrap restreint à la même origine.' }));
      return;
    }

    // Protection en profondeur locale : limite de fréquence avec délai progressif (Mission R3a)
    const clientIp = req.socket.remoteAddress || '127.0.0.1';
    const rateCheck = bootstrapRateLimiter.check(clientIp);
    if (!rateCheck.allowed) {
      logger.warn(`Amorçage temporairement limité pour ${clientIp} : réessai dans ${rateCheck.retryAfterSeconds}s`);
      res.writeHead(429, {
        'Content-Type': 'application/json',
        'Retry-After': String(rateCheck.retryAfterSeconds),
        'X-Content-Type-Options': 'nosniff'
      });
      res.end(JSON.stringify({
        error: 'Limite de fréquence locale dépassée sur l\'amorçage du jeton. Veuillez patienter avant de réessayer.',
        retryAfter: rateCheck.retryAfterSeconds
      }));
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'application/json',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
    });
    res.end(JSON.stringify({
      token: runtimeToken,
      workspace: DEFAULT_WORKSPACE
    }));
    return;
  }

  // 6. Pour tous les autres endpoints /api/ : Authentification par jeton obligatoire
  // Exception : streaming vidéo authentifié par ticket court dans l'URL (§26)
  if ((pathname.startsWith('/api/') || pathname === '/models' || pathname === '/tools' || pathname === '/workspace') && !pathname.startsWith('/api/media/video/stream/')) {
    if (!verifyToken(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Authentification requise (jeton invalide ou absent).' }));
      return;
    }
  }

  // 7. Pour les requêtes modifiant l'état : En-tête X-Iroko-Request: 1 obligatoire anti-CSRF
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method || '')) {
    const customHeader = req.headers['x-iroko-request'];
    if (customHeader !== '1') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'En-tête X-Iroko-Request: 1 obligatoire pour les opérations d\'écriture.' }));
      return;
    }
  }

  try {
    // 8. Délivrance de ticket WebSocket à usage unique : POST /api/ws-ticket
    if (pathname === '/api/ws-ticket' && req.method === 'POST') {
      const ticket = crypto.randomBytes(24).toString('hex');
      wsTickets.set(ticket, { expiresAt: Date.now() + 30000 }); // Valable 30s
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ticket, expiresInSeconds: 30 }));
      return;
    }

    // 9. Persistance Runtime : Conversations & Messages (§21, §29)
    if (pathname === '/api/conversations' && req.method === 'GET') {
      const conversations = runtimeDatabase.listConversations();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ conversations }));
      return;
    }

    if (pathname === '/api/conversations' && req.method === 'POST') {
      const body = await readJson(1 * 1024 * 1024);
      if (!body.title) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Le champ title est requis.' }));
        return;
      }
      const id = body.id || crypto.randomUUID();
      const conv = runtimeDatabase.saveConversation(
        id,
        body.title,
        body.workspacePath || DEFAULT_WORKSPACE,
        body.metadata,
        body.mode || 'chat',
        body.workspaceId || null
      );
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ conversation: conv }));
      return;
    }

    if (pathname.startsWith('/api/conversations/') && pathname.endsWith('/mode') && req.method === 'PUT') {
      const id = pathname.replace('/api/conversations/', '').replace('/mode', '').trim();
      const body = await readJson(64 * 1024);
      if (!body.mode || (body.mode !== 'chat' && body.mode !== 'code')) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Le champ mode doit être "chat" ou "code".' }));
        return;
      }
      const updated = runtimeDatabase.updateConversationMode(id, body.mode);
      if (!updated) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Conversation introuvable.' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, mode: body.mode }));
      return;
    }

    if (pathname.startsWith('/api/conversations/') && pathname.endsWith('/workspace') && req.method === 'PUT') {
      const id = pathname.replace('/api/conversations/', '').replace('/workspace', '').trim();
      const body = await readJson(64 * 1024);
      const updated = runtimeDatabase.updateConversationWorkspace(id, body.workspaceId || null);
      if (!updated) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Conversation introuvable.' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, workspaceId: body.workspaceId || null }));
      return;
    }

    if (pathname.startsWith('/api/conversations/') && pathname.endsWith('/title') && req.method === 'PUT') {
      const id = pathname.replace('/api/conversations/', '').replace('/title', '').trim();
      const body = await readJson(64 * 1024);
      if (!body.title || typeof body.title !== 'string' || !body.title.trim()) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Le champ title est requis.' }));
        return;
      }
      const updated = runtimeDatabase.updateConversationTitle(id, body.title.trim());
      if (!updated) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Conversation introuvable.' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, title: body.title.trim() }));
      return;
    }

    if (pathname.startsWith('/api/conversations/') && pathname.endsWith('/duplicate') && req.method === 'POST') {
      const id = pathname.replace('/api/conversations/', '').replace('/duplicate', '').trim();
      const duplicated = runtimeDatabase.duplicateConversation(id);
      if (!duplicated) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Conversation introuvable.' }));
        return;
      }
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        conversation: duplicated.conversation,
        messagesCount: duplicated.messages.length
      }));
      return;
    }

    if (pathname.startsWith('/api/conversations/') && pathname.endsWith('/attachments') && req.method === 'GET') {
      const convId = pathname.replace('/api/conversations/', '').replace('/attachments', '').trim();
      const list = attachmentManager.listAttachments(convId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ attachments: list.map(a => attachmentManager.toPublicInfo(a)) }));
      return;
    }

    // Routes artéfacts : AVANT le handler générique GET /api/conversations/:id (Missions M4 & M5)
    if (pathname.startsWith('/api/conversations/') && pathname.endsWith('/artifacts/download-all') && req.method === 'GET') {
      const convId = pathname.replace('/api/conversations/', '').replace('/artifacts/download-all', '').trim();
      try {
        const zipResult = await artifactManager.createZipArchive(convId);
        if (!zipResult || !fs.existsSync(zipResult.filePath)) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Aucun artéfact à archiver pour cette discussion.' }));
          return;
        }

        res.writeHead(200, {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="${encodeURIComponent(zipResult.filename)}"`,
          'X-Content-Type-Options': 'nosniff'
        });
        fs.createReadStream(zipResult.filePath).pipe(res);
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    if (pathname.startsWith('/api/conversations/') && pathname.endsWith('/artifacts') && req.method === 'GET') {
      const convId = pathname.replace('/api/conversations/', '').replace('/artifacts', '').trim();
      const list = artifactManager.listArtifacts(convId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(list));
      return;
    }

    if (pathname.startsWith('/api/conversations/') && pathname.endsWith('/artifacts') && req.method === 'POST') {
      const convId = pathname.replace('/api/conversations/', '').replace('/artifacts', '').trim();
      const body = await readJson(6 * 1024 * 1024);
      const { filename, content, title, mimeType } = body;
      if (!filename || content === undefined) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Les champs filename et content sont requis.' }));
        return;
      }
      try {
        const artifact = artifactManager.createArtifact({ conversationId: convId, filename, content, title, mimeType });
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ artifact: { ...artifact, content } }));
      } catch (err: any) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    if (pathname.startsWith('/api/conversations/') && pathname.endsWith('/active-task') && req.method === 'GET') {
      const convId = pathname.replace('/api/conversations/', '').replace('/active-task', '').trim();
      const job = activeJobManager.getActiveJob(convId);
      if (job && job.status === 'running') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          active: true,
          taskId: job.taskId,
          conversationId: convId,
          status: job.status,
          prompt: job.prompt,
          mode: job.mode,
          streamedText: job.streamedText,
          thinkingText: job.thinkingText,
          toolExecutions: job.toolExecutions,
          planSteps: job.planSteps
        }));
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ active: false }));
      }
      return;
    }

    if (pathname.startsWith('/api/conversations/') && req.method === 'GET') {
      const id = pathname.replace('/api/conversations/', '').trim();
      const data = runtimeDatabase.getConversation(id);
      if (!data) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Conversation introuvable.' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
      return;
    }

    // --- Suppressions Différées & Annulation (Mission R4b) ---
    if (pathname === '/api/deletions/pending' && req.method === 'POST') {
      const body = await readJson(64 * 1024);
      if (!body.itemType || !body.id) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'itemType et id sont requis.' }));
        return;
      }
      const durationMs = typeof body.durationMs === 'number' ? body.durationMs : 5000;
      const pending = deletionManager.scheduleDeletion(body.itemType, body.id, durationMs, body.metadata);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, pending }));
      return;
    }

    if (pathname === '/api/deletions/cancel' && req.method === 'POST') {
      const body = await readJson(64 * 1024);
      if (!body.itemType || !body.id) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'itemType et id sont requis.' }));
        return;
      }
      const restored = deletionManager.cancelDeletion(body.itemType, body.id);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, restored }));
      return;
    }

    if (pathname === '/api/deletions/purge' && req.method === 'POST') {
      const body = await readJson(64 * 1024);
      if (!body.itemType || !body.id) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'itemType et id sont requis.' }));
        return;
      }
      deletionManager.executePhysicalPurge(body.itemType, body.id);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, purged: true }));
      return;
    }

    if (pathname === '/api/deletions/pending' && req.method === 'GET') {
      const itemType = parsedUrl.searchParams.get('itemType') || undefined;
      const list = deletionManager.listPending(itemType);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ pendingDeletions: list }));
      return;
    }

    if (pathname.startsWith('/api/conversations/') && req.method === 'DELETE') {
      const id = pathname.replace('/api/conversations/', '').trim();
      const isPending = parsedUrl.searchParams.get('pending') === '1' || parsedUrl.searchParams.get('pending') === 'true';
      if (isPending) {
        const pending = deletionManager.scheduleDeletion('conversation', id, 5000);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, pending }));
        return;
      }
      attachmentManager.deleteConversationAttachments(id);
      const success = runtimeDatabase.deleteConversation(id);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success }));
      return;
    }

    // Comparaison de deux modèles en parallèle (Mission R4d)
    if (pathname.startsWith('/api/conversations/') && pathname.endsWith('/compare') && req.method === 'POST') {
      const parts = pathname.split('/');
      const convId = parts[3];
      const body = await readJson(64 * 1024);
      const { prompt, modelAId, modelBId } = body;
      if (!prompt || !modelAId || !modelBId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'prompt, modelAId et modelBId sont requis.' }));
        return;
      }

      // S'assurer que la conversation existe
      const existingConv = runtimeDatabase.getConversation(convId);
      if (!existingConv) {
        runtimeDatabase.saveConversation(convId, prompt.slice(0, 40), 'chat');
      }

      const userMsgId = crypto.randomUUID();
      const userMsg = runtimeDatabase.addMessage({
        id: userMsgId,
        conversationId: convId,
        role: 'user',
        content: prompt
      });

      const assistantMsgId = crypto.randomUUID();
      const initComparison = {
        prompt,
        modelA: {
          modelId: modelAId,
          modelName: modelAId,
          content: '',
          startTime: Date.now(),
          endTime: 0,
          status: 'streaming' as const
        },
        modelB: {
          modelId: modelBId,
          modelName: modelBId,
          content: '',
          startTime: Date.now(),
          endTime: 0,
          status: 'streaming' as const
        },
        selectedModel: null,
        archivedModel: null
      };

      const assistantMsg = runtimeDatabase.addMessage({
        id: assistantMsgId,
        conversationId: convId,
        role: 'assistant',
        content: '',
        metadata: { comparison: initComparison }
      });

      broadcastWsEvent({
        type: 'comparison_started',
        conversationId: convId,
        userMessage: userMsg,
        assistantMessage: assistantMsg
      });

      const comparisonResult = await modelComparisonService.runComparison(prompt, modelAId, modelBId, {
        conversationId: convId,
        onChunk: (column, delta) => {
          broadcastWsEvent({
            type: 'comparison_chunk',
            conversationId: convId,
            messageId: assistantMsgId,
            column,
            delta
          });
        }
      });

      runtimeDatabase.updateMessageContent(
        assistantMsgId,
        '',
        undefined,
        { comparison: comparisonResult }
      );

      const finalMsg = runtimeDatabase.getMessage(assistantMsgId);
      broadcastWsEvent({
        type: 'comparison_completed',
        conversationId: convId,
        messageId: assistantMsgId,
        comparison: comparisonResult
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        userMessage: userMsg,
        assistantMessage: finalMsg,
        comparison: comparisonResult
      }));
      return;
    }

    // Sélection de la réponse conservée ("Garder cette réponse", Mission R4d)
    if (pathname.startsWith('/api/conversations/') && pathname.includes('/messages/') && pathname.endsWith('/choose-response') && req.method === 'PUT') {
      const parts = pathname.split('/');
      const convId = parts[3];
      const msgId = parts[5];
      const body = await readJson(64 * 1024);
      const { choice } = body;
      if (choice !== 'modelA' && choice !== 'modelB') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Le choix doit être modelA ou modelB.' }));
        return;
      }

      const result = modelComparisonService.selectResponse(msgId, choice);
      if (!result.success) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Message introuvable ou ne contenant pas de comparaison.' }));
        return;
      }

      broadcastWsEvent({
        type: 'comparison_selection_changed',
        conversationId: convId,
        messageId: msgId,
        choice,
        message: result.message
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: result.message }));
      return;
    }

    // Régénération isolée d'une seule colonne de comparaison (Mission R4d)
    if (pathname.startsWith('/api/conversations/') && pathname.includes('/messages/') && pathname.endsWith('/regenerate-column') && req.method === 'POST') {
      const parts = pathname.split('/');
      const convId = parts[3];
      const msgId = parts[5];
      const body = await readJson(64 * 1024);
      const { column } = body;
      if (column !== 'modelA' && column !== 'modelB') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'La colonne doit être modelA ou modelB.' }));
        return;
      }

      const resRegen = await modelComparisonService.regenerateColumn(msgId, column, (delta) => {
        broadcastWsEvent({
          type: 'comparison_chunk',
          conversationId: convId,
          messageId: msgId,
          column,
          delta
        });
      });

      if (!resRegen.success) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Échec de la régénération de la colonne.' }));
        return;
      }

      const updatedMsg = runtimeDatabase.getMessage(msgId);
      broadcastWsEvent({
        type: 'comparison_column_regenerated',
        conversationId: convId,
        messageId: msgId,
        column,
        message: updatedMsg
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: updatedMsg, columnResult: resRegen.result }));
      return;
    }

    if (pathname.includes('/messages') && req.method === 'POST') {
      const parts = pathname.split('/');
      const convId = parts[3];
      const body = await readJson(2 * 1024 * 1024);
      if (!body.content || !body.role) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'content et role sont requis.' }));
        return;
      }
      const msg = runtimeDatabase.addMessage({
        id: body.id || crypto.randomUUID(),
        conversationId: convId,
        role: body.role,
        content: body.content,
        thinkingLogs: body.thinkingLogs,
        metadata: body.metadata
      });
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: msg }));
      return;
    }

    // Suppression d'un message avec nettoyage en cascade (Mission M8.3 P4, R4b)
    if (pathname.startsWith('/api/messages/') && req.method === 'DELETE') {
      const msgId = pathname.replace('/api/messages/', '').trim();
      const isPending = parsedUrl.searchParams.get('pending') === '1' || parsedUrl.searchParams.get('pending') === 'true';
      if (isPending) {
        const pending = deletionManager.scheduleDeletion('message', msgId, 5000);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, pending }));
        return;
      }
      const result = runtimeDatabase.deleteMessage(msgId);
      if (!result.success) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Message introuvable.' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return;
    }

    // Troncature de conversation après modification de message (Mission M8.3 P4)
    if (pathname.startsWith('/api/conversations/') && pathname.includes('/truncate-from/') && req.method === 'POST') {
      const parts = pathname.split('/');
      const convId = parts[3];
      const msgId = parts[5];
      const body = await readJson(64 * 1024).catch(() => ({}));
      const includeTarget = Boolean(body.includeTarget);

      const result = runtimeDatabase.truncateConversationFrom(convId, msgId, includeTarget);
      if (!result.success) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Conversation ou message introuvable.' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return;
    }

    // Impact avant troncature (nombre de messages et fichiers modifiés) (Mission M8.3 P4)
    if (pathname.startsWith('/api/conversations/') && pathname.includes('/messages/') && pathname.endsWith('/impact') && req.method === 'GET') {
      const parts = pathname.split('/');
      const convId = parts[3];
      const msgId = parts[5];
      const impact = runtimeDatabase.checkTruncateImpact(convId, msgId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(impact));
      return;
    }

    // Recherche Plein Texte FTS5 (Mission M8.3 P2)
    if (pathname === '/api/search' && req.method === 'GET') {
      const q = parsedUrl.searchParams.get('q') || '';
      const results = runtimeDatabase.searchFullText(q);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ query: q, results }));
      return;
    }

    // Tâches actives en arrière-plan et indicateur d'activité (Mission M8.3 P6)
    if (pathname === '/api/agent/active-tasks' && req.method === 'GET') {
      const activeConvIds = new Set<string>();

      for (const sess of sessions.values()) {
        if ((sess.status === 'running' || sess.runtime?.isRunning()) && sess.activeConvId) {
          activeConvIds.add(sess.activeConvId);
        }
      }

      for (const job of activeJobManager.getAllActiveJobs()) {
        if (job.status === 'running') {
          activeConvIds.add(job.conversationId);
        }
      }

      const pendingJobs = runtimeDatabase.listPendingVideoJobs();
      for (const job of pendingJobs) {
        if (job.conversationId) {
          activeConvIds.add(job.conversationId);
        }
      }

      const maxConcurrentTasksSetting = runtimeDatabase.getSetting('max_concurrent_tasks');
      const maxConcurrentTasks = maxConcurrentTasksSetting ? parseInt(String(maxConcurrentTasksSetting), 10) : 2;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        activeConversationIds: Array.from(activeConvIds),
        maxConcurrentTasks: isNaN(maxConcurrentTasks) ? 2 : maxConcurrentTasks,
        runningCount: activeConvIds.size
      }));
      return;
    }

    // 10. Migration unique localStorage vers Runtime (§21)
    if (pathname === '/api/migration/from-localstorage' && req.method === 'POST') {
      const body = await readJson(10 * 1024 * 1024); // 10 Mo pour l'import batch
      const result = runtimeDatabase.migrateFromLocalStorage(body);
      logger.info(`Migration localStorage exécutée : ${result.importedConversations} discussions, ${result.importedSettings} réglages`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, ...result }));
      return;
    }

    // 11. Paramètres & Réglages
    if (pathname === '/api/settings' && req.method === 'GET') {
      if (runtimeDatabase.getSetting('conversationFont') === 'serif') {
        runtimeDatabase.setSetting('conversationFont', 'sans');
      }
      const settings = runtimeDatabase.getAllSettings();
      if (!settings.conversationFont || settings.conversationFont === 'serif') {
        settings.conversationFont = 'sans';
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ settings }));
      return;
    }

    if ((pathname === '/api/settings/custom-instructions' || pathname === '/api/settings/custom_instructions') && req.method === 'GET') {
      const custom_instructions = (runtimeDatabase.getSetting('custom_instructions') as string) || '';
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ custom_instructions }));
      return;
    }

    if (pathname.startsWith('/api/settings/') && req.method === 'PUT') {
      const key = pathname.replace('/api/settings/', '').trim();
      const body = await readJson(512 * 1024);

      if (key === 'custom_instructions' || key === 'custom-instructions') {
        const text = typeof body.value === 'string' ? body.value : (typeof body.custom_instructions === 'string' ? body.custom_instructions : '');
        if (text.length > 4000) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Les instructions personnalisées ne peuvent pas dépasser 4000 caractères.' }));
          return;
        }
        if (containsSecret(text)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Les instructions personnalisées ne doivent pas contenir de secrets (clés API, mots de passe, certificats).' }));
          return;
        }
        runtimeDatabase.setSetting('custom_instructions', text);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, key: 'custom_instructions', value: text }));
        return;
      }

      runtimeDatabase.setSetting(key, body.value);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, key, value: body.value }));
      return;
    }

    // 12. Endpoints Modèles & Clés (Lot L2 & M10.2 : Model Gateway & Smart Key Pool & Catalogue)
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

    // Statut de disponibilité de la comparaison de deux modèles (Mission R4d)
    if (pathname === '/api/models/comparison-status' && req.method === 'GET') {
      const status = modelComparisonService.isComparisonAvailable();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(status));
      return;
    }

    if (pathname === '/api/models' && req.method === 'GET') {
      const providerParam = parsedUrl.searchParams.get('provider') || undefined;
      const viewParam = (parsedUrl.searchParams.get('view') as 'short' | 'all') || 'short';
      const qParam = parsedUrl.searchParams.get('q') || undefined;
      const convId = parsedUrl.searchParams.get('conversationId') || undefined;

      const availableProviders = modelGateway.getAvailableProviders();
      const connectedProviderIds = availableProviders.filter(p => p.id !== 'mock' && p.activeKeys > 0).map(p => p.id);
      const connectedCount = connectedProviderIds.length;

      let models: any[];
      if (!providerParam && !qParam && connectedCount === 0 && viewParam === 'short') {
        models = [];
      } else if (!providerParam && viewParam === 'short' && connectedCount > 0) {
        // En vue courte (sélecteur rapide du Composer), n'exposer que les modèles des fournisseurs connectés
        const allShort = modelGateway.getModels({
          view: 'short',
          q: qParam
        });
        models = allShort.filter(m => connectedProviderIds.includes(m.providerId));
      } else {
        models = modelGateway.getModels({
          provider: providerParam,
          view: viewParam,
          q: qParam
        });
      }

      const defaultModel = modelGateway.getSmartDefaultModel(convId);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        models,
        total: models.length,
        view: viewParam,
        provider: providerParam || null,
        defaultModel
      }));
      return;
    }

    if (pathname === '/api/models/refresh' && req.method === 'POST') {
      const body = await readJson(64 * 1024);
      const providerId = body?.providerId;
      const result = await modelGateway.refreshCatalog(providerId);

      broadcastWsEvent({
        type: 'catalog_updated',
        total: result.total,
        byProvider: result.byProvider,
        timestamp: new Date().toISOString()
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        refreshedCount: result.total,
        byProvider: result.byProvider,
        timestamp: new Date().toISOString()
      }));
      return;
    }

    if (pathname === '/api/models/preferences' && req.method === 'PUT') {
      const body = await readJson(64 * 1024);
      if (!body.modelId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Le champ modelId est requis.' }));
        return;
      }

      const updated = modelGateway.updateModelPreferences(body.modelId, {
        isFavorite: body.isFavorite,
        isHidden: body.isHidden
      });

      if (!updated) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Modèle introuvable dans le catalogue.' }));
        return;
      }

      broadcastWsEvent({
        type: 'catalog_updated',
        modelId: body.modelId,
        timestamp: new Date().toISOString()
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        modelId: body.modelId,
        preferences: { isFavorite: body.isFavorite, isHidden: body.isHidden }
      }));
      return;
    }

    if (pathname === '/api/credentials' && req.method === 'GET') {
      const credentials = modelGateway.keyPool.getAllKeysMasked();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ credentials }));
      return;
    }

    if (pathname === '/api/credentials' && req.method === 'POST') {
      const body = await readJson(10 * 1024 * 1024);
      if (!body.providerId || !body.key) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'providerId et key sont requis.' }));
        return;
      }
      const credential = await modelGateway.keyPool.addKey(
        body.providerId,
        body.label || '',
        body.key,
        body.priority || 1
      );

      // Synchroniser les outils de recherche au cas où c'est un fournisseur de recherche
      toolRegistry.syncSearchTools();

      // Diffuser le changement de provider
      broadcastWsEvent({
        type: 'providers_changed',
        providerId: body.providerId,
        action: 'added',
        timestamp: new Date().toISOString()
      });

      // Rafraîchir les modèles en arrière-plan
      modelGateway.refreshCatalog(body.providerId).then(res => {
        broadcastWsEvent({
          type: 'catalog_updated',
          providerId: body.providerId,
          total: res.total,
          timestamp: new Date().toISOString()
        });
      }).catch(() => {});

      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, credential }));
      return;
    }

    if (pathname === '/api/credentials/test' && req.method === 'POST') {
      const body = await readJson(1 * 1024 * 1024);
      let providerId = body.providerId;
      let rawKey = body.key;

      if (body.id && !rawKey) {
        const cred = modelGateway.keyPool.getAllKeysMasked().find(c => c.id === body.id);
        if (!cred) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ valid: false, error: 'Identifiant de clé introuvable.' }));
          return;
        }
        providerId = cred.providerId;
        rawKey = modelGateway.keyPool.getDecryptedKey(body.id);
      }

      if (!providerId || (!rawKey && providerId !== 'mock_search' && providerId !== 'custom_search')) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ valid: false, error: 'providerId et key (ou id existant) sont requis.' }));
        return;
      }

      // Validation pour les fournisseurs de recherche (Mission N3)
      if (providerId === 'mock_search' || providerId === 'custom_search') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ valid: true }));
        return;
      }

      if (providerId === 'brave') {
        try {
          const checkRes = await fetch('https://api.search.brave.com/res/v1/web/search?q=test&count=1', {
            method: 'GET',
            headers: {
              'X-Subscription-Token': rawKey,
              'Accept': 'application/json'
            }
          });
          if (checkRes.ok) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ valid: true }));
            return;
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ valid: false, error: 'Clé API Brave Search refusée.' }));
          return;
        } catch (err: any) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ valid: false, error: `Erreur de connexion : ${err.message}` }));
          return;
        }
      }

      if (providerId === 'tavily') {
        try {
          const checkRes = await fetch('https://api.tavily.com/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ api_key: rawKey, query: 'test', max_results: 1 })
          });
          if (checkRes.ok) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ valid: true }));
            return;
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ valid: false, error: 'Clé API Tavily refusée.' }));
          return;
        } catch (err: any) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ valid: false, error: `Erreur de connexion : ${err.message}` }));
          return;
        }
      }

      const result = await modelGateway.testCredential(providerId, rawKey);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return;
    }

    if (pathname === '/api/credentials' && req.method === 'DELETE') {
      const id = parsedUrl.searchParams.get('id');
      if (!id) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Paramètre id manquant' }));
        return;
      }
      const removed = modelGateway.keyPool.removeKey(id);

      if (removed) {
        toolRegistry.syncSearchTools();
        broadcastWsEvent({
          type: 'providers_changed',
          action: 'removed',
          timestamp: new Date().toISOString()
        });
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: removed }));
      return;
    }

    if (pathname === '/workspace' && req.method === 'GET') {
      const meta = await workspaceManager.analyze(DEFAULT_WORKSPACE);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(meta));
      return;
    }

    if ((pathname === '/tools' || pathname === '/api/tools') && req.method === 'GET') {
      const tools = toolRegistry.getAllToolsStatus();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        total: tools.length,
        enabledCount: toolRegistry.getEnabledToolsCount(),
        tools
      }));
      return;
    }

    if (pathname.startsWith('/api/tools/') && pathname.endsWith('/toggle') && req.method === 'PUT') {
      const toolName = pathname.replace('/api/tools/', '').replace('/toggle', '').trim();
      const body = await readJson(64 * 1024);
      const enabled = Boolean(body.enabled);
      toolRegistry.setToolEnabled(toolName, enabled);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, name: toolName, enabled }));
      return;
    }

    // Catégories d'outils groupées (pour le menu Outils du composer — M8.1)
    if (pathname === '/api/tools/categories' && req.method === 'GET') {
      const allTools = toolRegistry.getAllToolsStatus();
      
      // Catégories de base
      const baseDefs = [
        { id: 'filesystem', label: 'Fichiers', modes: ['code'], toolNames: ['list_dir', 'read_file', 'search_text', 'edit_file', 'write_file'] },
        { id: 'terminal', label: 'Terminal', modes: ['code'], toolNames: ['execute_command', 'start_process', 'stop_process', 'get_process_output', 'list_processes'] },
        { id: 'git', label: 'Git', modes: ['code'], toolNames: ['git_status', 'git_diff', 'git_log', 'git_add', 'git_commit', 'git_branch', 'git_create_branch'] },
        { id: 'testing', label: 'Vérification', modes: ['code'], toolNames: ['verify_project'] },
        { id: 'artifacts', label: 'Artéfacts', modes: ['chat', 'code'], toolNames: ['create_artifact', 'update_artifact', 'create_document', 'register_artifact'] },
        { id: 'images', label: 'Images', modes: ['chat', 'code'], toolNames: ['generate_image'] },
        { id: 'videos', label: 'Vidéos', modes: ['chat', 'code'], toolNames: ['generate_video'] }
      ];

      const categories = baseDefs.map(def => {
        const toolsInCat = allTools.filter(t => def.toolNames.includes(t.name) || (def.id === 'filesystem' && t.category === 'filesystem' && !def.toolNames.includes(t.name)));
        const total = toolsInCat.length;
        const enabled = toolsInCat.filter(t => t.enabled).length;
        return {
          id: def.id,
          name: def.label,
          modes: def.modes,
          total,
          enabled,
          isFullyEnabled: total > 0 && enabled === total
        };
      });

      // Serveurs MCP (un groupe par serveur MCP connecté ou configuré)
      try {
        const mcpServers = mcpManager.listServers();
        for (const s of mcpServers) {
          const sTools = s.tools || [];
          const total = sTools.length;
          const enabled = sTools.filter(t => t.enabled).length;
          categories.push({
            id: `mcp_${s.name}`,
            name: `MCP: ${s.name}`,
            modes: ['chat', 'code'],
            total,
            enabled,
            isFullyEnabled: total > 0 && enabled === total
          });
        }
      } catch {}

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ categories }));
      return;
    }

    // Basculer tous les outils d'une catégorie en un clic
    if (pathname.startsWith('/api/tools/category/') && pathname.endsWith('/toggle') && req.method === 'PUT') {
      const cat = decodeURIComponent(pathname.replace('/api/tools/category/', '').replace('/toggle', '').trim());
      const body = await readJson(64 * 1024);
      const enabled = Boolean(body.enabled);
      
      if (cat === 'images') {
        toolRegistry.setToolEnabled('generate_image', enabled);
      } else if (cat === 'videos') {
        toolRegistry.setToolEnabled('generate_video', enabled);
      } else if (cat.startsWith('mcp_')) {
        const sName = cat.replace('mcp_', '');
        try {
          const mcpServers = mcpManager.listServers();
          const s = mcpServers.find(srv => srv.name === sName);
          if (s) {
            for (const t of s.tools || []) {
              toolRegistry.setToolEnabled(t.name, enabled);
            }
          }
        } catch {}
      } else {
        const toolMap: Record<string, string[]> = {
          filesystem: ['list_dir', 'read_file', 'search_text', 'edit_file', 'write_file'],
          terminal: ['execute_command', 'start_process', 'stop_process', 'get_process_output', 'list_processes'],
          git: ['git_status', 'git_diff', 'git_log', 'git_add', 'git_commit', 'git_branch', 'git_create_branch'],
          testing: ['verify_project'],
          artifacts: ['create_artifact', 'update_artifact', 'create_document', 'register_artifact']
        };
        const targetTools = toolMap[cat] || [];
        for (const tName of targetTools) {
          toolRegistry.setToolEnabled(tName, enabled);
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, category: cat, enabled }));
      return;
    }


    // 13. Endpoints Permissions & Audit (Lot L5)
    if (pathname === '/api/permissions' && req.method === 'GET') {
      const workspace = parsedUrl.searchParams.get('workspace') || DEFAULT_WORKSPACE;
      const settings = permissionStore.getSettings();
      const rules = permissionStore.getProjectPermissions(workspace);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        mode: settings.mode,
        terminalTimeout: settings.terminalTimeout,
        fileTimeout: settings.fileTimeout,
        rules
      }));
      return;
    }

    if (pathname === '/api/permissions/mode' && req.method === 'PUT') {
      const body = await readJson(64 * 1024);
      if (!['ask', 'auto_edit', 'read_only'].includes(body.mode)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Mode invalide (attendu: ask | auto_edit | read_only).' }));
        return;
      }
      const updated = permissionStore.updateSettings({ mode: body.mode });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, settings: updated }));
      return;
    }

    if (pathname === '/api/permissions/terminal_timeout' && req.method === 'PUT') {
      const body = await readJson(64 * 1024);
      const timeout = parseInt(body.terminalTimeout, 10);
      if (isNaN(timeout) || timeout < 5000 || timeout > 600000) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Délai invalide (entre 5000ms et 600000ms).' }));
        return;
      }
      const updated = permissionStore.updateSettings({ terminalTimeout: timeout });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, settings: updated }));
      return;
    }

    if (pathname === '/api/permissions/file_timeout' && req.method === 'PUT') {
      const body = await readJson(64 * 1024);
      const timeout = parseInt(body.fileTimeout, 10);
      if (isNaN(timeout) || timeout < 5000 || timeout > 120000) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Délai invalide pour les fichiers (entre 5000ms et 120000ms).' }));
        return;
      }
      const updated = permissionStore.updateSettings({ fileTimeout: timeout });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, settings: updated }));
      return;
    }

    if (pathname.startsWith('/api/permissions/rules/') && req.method === 'DELETE') {
      const ruleId = pathname.replace('/api/permissions/rules/', '').trim();
      const workspace = parsedUrl.searchParams.get('workspace') || DEFAULT_WORKSPACE;
      const revoked = permissionStore.revokeProjectPermission(workspace, ruleId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: revoked }));
      return;
    }

    if (pathname === '/api/permissions/audit' && req.method === 'GET') {
      const limit = parseInt(parsedUrl.searchParams.get('limit') || '50', 10);
      const entries = permissionStore.getRecentAuditEntries(limit);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ entries }));
      return;
    }

    // 14. Mémoire de Projet & Préférences (§20)
    if (pathname === '/api/memory/toggle' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ enabled: projectMemoryManager.isEnabled() }));
      return;
    }

    if (pathname === '/api/memory/toggle' && (req.method === 'PUT' || req.method === 'POST')) {
      const body = await readJson(64 * 1024);
      const enabled = Boolean(body.enabled);
      projectMemoryManager.setEnabled(enabled);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, enabled }));
      return;
    }

    if (pathname === '/api/memory/export' && req.method === 'GET') {
      const scope = parsedUrl.searchParams.get('scope') as 'global' | 'project' | null;
      const workspace = parsedUrl.searchParams.get('workspace') || undefined;
      const memories = projectMemoryManager.listMemories({
        scope: scope || undefined,
        workspacePath: workspace
      });
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename="iroko-memories-export.json"'
      });
      res.end(JSON.stringify({
        version: '1.0',
        exportedAt: new Date().toISOString(),
        total: memories.length,
        memories
      }, null, 2));
      return;
    }

    if (pathname === '/api/memory' && req.method === 'GET') {
      const scope = parsedUrl.searchParams.get('scope') as 'global' | 'project' | null;
      const workspace = parsedUrl.searchParams.get('workspace') || undefined;
      const memories = projectMemoryManager.listMemories({
        scope: scope || undefined,
        workspacePath: workspace
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ memories }));
      return;
    }

    if (pathname === '/api/memory' && req.method === 'POST') {
      const body = await readJson(512 * 1024);
      if (!body.fact || typeof body.fact !== 'string' || !body.fact.trim()) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Le champ fact est requis.' }));
        return;
      }

      const secretCheck = containsSecret(body.fact);
      if (secretCheck.hasSecret) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: secretCheck.reason || 'Refus formel de mémoriser des secrets ou données sensibles.' }));
        return;
      }

      try {
        const memory = projectMemoryManager.remember({
          fact: body.fact,
          scope: body.scope || 'project',
          workspacePath: body.workspacePath || DEFAULT_WORKSPACE,
          category: body.category || 'general'
        });
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, memory }));
      } catch (err: any) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    if (pathname.startsWith('/api/memory/') && req.method === 'PUT') {
      const id = pathname.replace('/api/memory/', '').trim();
      const body = await readJson(512 * 1024);
      if (!body.fact || typeof body.fact !== 'string' || !body.fact.trim()) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Le champ fact est requis.' }));
        return;
      }

      const secretCheck = containsSecret(body.fact);
      if (secretCheck.hasSecret) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: secretCheck.reason || 'Refus formel de mémoriser des secrets ou données sensibles.' }));
        return;
      }

      try {
        const memory = projectMemoryManager.remember({
          id,
          fact: body.fact,
          scope: body.scope,
          workspacePath: body.workspacePath || DEFAULT_WORKSPACE,
          category: body.category
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, memory }));
      } catch (err: any) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    if (pathname.startsWith('/api/memory/') && req.method === 'DELETE') {
      const id = pathname.replace('/api/memory/', '').trim();
      const isPending = parsedUrl.searchParams.get('pending') === '1' || parsedUrl.searchParams.get('pending') === 'true';
      if (isPending) {
        const pending = deletionManager.scheduleDeletion('memory', id, 5000);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, pending }));
        return;
      }
      const success = projectMemoryManager.deleteMemory(id);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success }));
      return;
    }

    if (pathname === '/api/memory' && req.method === 'DELETE') {
      const scope = parsedUrl.searchParams.get('scope') as 'global' | 'project' | null;
      const workspace = parsedUrl.searchParams.get('workspace') || undefined;
      const count = projectMemoryManager.clearAllMemories({
        scope: scope || undefined,
        workspacePath: workspace
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, deletedCount: count }));
      return;
    }

    // 15. Confidentialité & Purges réelles (§26, Mission L13)
    if (pathname === '/api/privacy/info' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        dataDir: runtimeDatabase.getDataDirectory(),
        dbPath: runtimeDatabase.dbPath,
        stats: {
          conversationsCount: runtimeDatabase.listConversations().length,
          memoriesCount: runtimeDatabase.listMemories().length,
          credentialsCount: modelGateway.keyPool.getAllKeysMasked().length
        },
        maskModel: runtimeDatabase.getSetting('mask_secrets_before_model') !== 'false'
      }));
      return;
    }

    if (pathname === '/api/privacy/mask_model' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        enabled: runtimeDatabase.getSetting('mask_secrets_before_model') !== 'false'
      }));
      return;
    }

    if (pathname === '/api/privacy/mask_model' && (req.method === 'PUT' || req.method === 'POST')) {
      const body = await readJson(64 * 1024);
      const enabled = Boolean(body.enabled);
      runtimeDatabase.setSetting('mask_secrets_before_model', enabled ? 'true' : 'false');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, enabled }));
      return;
    }

    if (pathname === '/api/privacy/export' && req.method === 'GET') {
      const data = runtimeDatabase.exportAllData();
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename="iroko-data-export.json"'
      });
      res.end(JSON.stringify(data, null, 2));
      return;
    }

    if (pathname === '/api/privacy/conversations' && req.method === 'DELETE') {
      const result = runtimeDatabase.clearAllConversations();
      broadcastWsEvent({
        type: 'conversations_cleared'
      } as any);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, ...result }));
      return;
    }

    if (pathname === '/api/privacy/memory' && req.method === 'DELETE') {
      const count = runtimeDatabase.clearAllMemories();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, deletedCount: count }));
      return;
    }

    if (pathname === '/api/privacy/credentials' && req.method === 'DELETE') {
      const count = modelGateway.keyPool.clearAllKeys();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, deletedCount: count }));
      return;
    }

    // Volumes par catégorie de l'espace disque (Mission M8.3 P9)
    if (pathname === '/api/privacy/storage-breakdown' && req.method === 'GET') {
      const breakdown = runtimeDatabase.getStorageBreakdown();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(breakdown));
      return;
    }

    // Nettoyage sécurisé par catégorie d'espace disque (Mission M8.3 P9)
    if (pathname === '/api/privacy/storage-clean' && req.method === 'POST') {
      const body = await readJson(64 * 1024);
      if (!body.category) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Le champ category est requis.' }));
        return;
      }
      const result = runtimeDatabase.cleanStorage(body.category, Boolean(body.force));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return;
    }

    // 15b. Sauvegarde, Restauration & Diagnostic (§ Mission M8.2)
    if (pathname === '/api/dialog/save-backup' && req.method === 'POST') {
      const result = await workspaceDialogPicker.pickSaveFile(
        'Enregistrer la sauvegarde Iroko',
        `iroko_backup_${new Date().toISOString().slice(0, 10)}.zip`
      );
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return;
    }

    if (pathname === '/api/dialog/pick-backup' && req.method === 'POST') {
      const result = await workspaceDialogPicker.pickOpenFile(
        'Sélectionner une archive de sauvegarde Iroko (.zip)'
      );
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return;
    }

    if (pathname === '/api/backup' && req.method === 'POST') {
      const body = await readJson(64 * 1024);
      try {
        const targetPath = body.targetPath as string | undefined;
        const includeSecrets = Boolean(body.includeSecrets);
        const archivePath = await runtimeDatabase.createBackupArchive(targetPath, includeSecrets);
        const sizeBytes = fs.statSync(archivePath).size;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, archivePath, sizeBytes }));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    if (pathname === '/api/backup/download' && req.method === 'GET') {
      try {
        const includeSecrets = parsedUrl.searchParams.get('includeSecrets') === 'true';
        const tempArchive = path.join(os.tmpdir(), `iroko_backup_${Date.now()}.zip`);
        await runtimeDatabase.createBackupArchive(tempArchive, includeSecrets);
        const stat = fs.statSync(tempArchive);
        res.writeHead(200, {
          'Content-Type': 'application/zip',
          'Content-Length': stat.size,
          'Content-Disposition': `attachment; filename="iroko_backup_${new Date().toISOString().slice(0, 10)}.zip"`,
          'X-Content-Type-Options': 'nosniff'
        });
        const readStream = fs.createReadStream(tempArchive);
        readStream.pipe(res);
        readStream.on('close', () => {
          try { fs.unlinkSync(tempArchive); } catch {}
        });
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    if (pathname === '/api/restore' && req.method === 'POST') {
      const body = await readJson(64 * 1024);
      const archivePath = body.archivePath;
      if (!archivePath || typeof archivePath !== 'string') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Le paramètre archivePath est requis.' }));
        return;
      }
      try {
        const result = await runtimeDatabase.restoreFromBackup(archivePath);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err: any) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    if (pathname === '/api/diagnostic' && req.method === 'GET') {
      const anonymize = (str: string): string => {
        if (!str) return str;
        const home = os.homedir();
        const username = os.userInfo?.()?.username;
        let out = str;
        if (home) out = out.split(home).join('~');
        if (username && username.length > 2) out = out.split(username).join('user');
        return out;
      };

      try {
        const dbSize = fs.existsSync(runtimeDatabase.dbPath) ? fs.statSync(runtimeDatabase.dbPath).size : 0;
        const schemaVersion = runtimeDatabase.getSchemaVersion();
        const providers = modelGateway.getAvailableProviders().map(p => p.name || p.id);
        const mcpServers = mcpManager.listServers().map(s => ({ name: s.name, status: s.status }));
        const recentErrors = runtimeDatabase.getRecentErrors(20).map(e => ({
          timestamp: e.timestamp,
          message: anonymize(PrivacyFilter.maskSecretsForModel(typeof e.message === 'string' ? e.message : JSON.stringify(e.message)))
        }));
        const dataDir = anonymize(runtimeDatabase.dataDir);
        const watchdogRestarts = RuntimeWatchdog.getRestartsFromDisk(runtimeDatabase.dataDir);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          appVersion: '1.0.0',
          nodeVersion: process.version,
          platform: `${process.platform} ${process.arch} (${os.release()})`,
          runtimePort: PORT,
          database: {
            sizeBytes: dbSize,
            schemaVersion
          },
          connectedProviders: providers,
          mcpServers,
          recentErrors,
          dataDir,
          restarts: watchdogRestarts,
          corruptionIncident: runtimeDatabase.getCorruptionIncident()
        }));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // 16. Connecteurs MCP (Cahier §15, §19, §26, Mission L14)
    if (pathname === '/api/mcp/servers' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ servers: mcpManager.listServers() }));
      return;
    }

    if (pathname === '/api/mcp/servers' && req.method === 'POST') {
      const body = await readJson(64 * 1024);
      try {
        const server = await mcpManager.addServer(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, server }));
      } catch (err: any) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    if (pathname.startsWith('/api/mcp/servers/') && pathname.endsWith('/toggle') && req.method === 'PUT') {
      const name = decodeURIComponent(pathname.replace('/api/mcp/servers/', '').replace('/toggle', '').trim());
      const body = await readJson(64 * 1024);
      const success = await mcpManager.setServerEnabled(name, Boolean(body.enabled));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success }));
      return;
    }

    if (pathname.startsWith('/api/mcp/servers/') && pathname.includes('/tools/') && pathname.endsWith('/toggle') && req.method === 'PUT') {
      const parts = pathname.replace('/api/mcp/servers/', '').split('/');
      const serverName = decodeURIComponent(parts[0]);
      const toolName = decodeURIComponent(parts[2]);
      const body = await readJson(64 * 1024);
      const success = mcpManager.setToolEnabled(serverName, toolName, Boolean(body.enabled));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success }));
      return;
    }

    if (pathname.startsWith('/api/mcp/servers/') && req.method === 'DELETE') {
      const name = decodeURIComponent(pathname.replace('/api/mcp/servers/', '').trim());
      const success = await mcpManager.removeServer(name);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success }));
      return;
    }

    if (pathname === '/api/mcp/project-config' && req.method === 'GET') {
      const workspace = parsedUrl.searchParams.get('workspace') || DEFAULT_WORKSPACE;
      const config = mcpManager.detectProjectConfig(workspace);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(config));
      return;
    }

    if (pathname === '/api/mcp/approve-project-config' && req.method === 'POST') {
      const workspace = parsedUrl.searchParams.get('workspace') || DEFAULT_WORKSPACE;
      const loaded = await mcpManager.approveAndLoadProjectConfig(workspace);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, loaded }));
      return;
    }

    // 17. Compétences / Skills (Cahier §13, §15, Mission L14)
    if (pathname === '/api/skills' && req.method === 'GET') {
      const workspace = parsedUrl.searchParams.get('workspace') || DEFAULT_WORKSPACE;
      await skillManager.init(workspace);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ skills: skillManager.listSkills() }));
      return;
    }

    if (pathname.startsWith('/api/skills/') && pathname.endsWith('/toggle') && req.method === 'PUT') {
      const name = decodeURIComponent(pathname.replace('/api/skills/', '').replace('/toggle', '').trim());
      const body = await readJson(64 * 1024);
      const success = skillManager.setSkillEnabled(name, Boolean(body.enabled));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success }));
      return;
    }

    if (pathname === '/api/skills/scan' && req.method === 'POST') {
      const body = await readJson(64 * 1024);
      try {
        const scan = skillManager.scanSkillDirectory(body.dirPath);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, scan }));
      } catch (err: any) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    if (pathname === '/api/skills/import' && req.method === 'POST') {
      const body = await readJson(64 * 1024);
      try {
        const result = await skillManager.importSkillFromDirectory(body.dirPath, {
          isSystem: Boolean(body.isSystem),
          autoEnable: Boolean(body.autoEnable)
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          skill: result,
          scanReport: result.scanReport,
          warnings: result.warnings
        }));
      } catch (err: any) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    if (pathname.startsWith('/api/skills/') && req.method === 'PUT') {
      const name = decodeURIComponent(pathname.replace('/api/skills/', '').trim());
      const body = await readJson(64 * 1024);
      const skill = skillManager.updateSkill(name, body);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, skill }));
      return;
    }

    if (pathname.startsWith('/api/skills/') && req.method === 'DELETE') {
      const name = decodeURIComponent(pathname.replace('/api/skills/', '').trim());
      const isPending = parsedUrl.searchParams.get('pending') === '1' || parsedUrl.searchParams.get('pending') === 'true';
      if (isPending) {
        const existing = skillManager.getSkill(name);
        if (existing?.isSystem) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Impossible de supprimer une compétence système.' }));
          return;
        }
        const pending = deletionManager.scheduleDeletion('skill', name, 5000);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, pending }));
        return;
      }
      try {
        const success = skillManager.deleteSkill(name);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success }));
      } catch (err: any) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
      return;
    }

    // 18. Plugins (Cahier §11, §13, §15, Mission L15d)
    if (pathname === '/api/plugins' && req.method === 'GET') {
      const plugins = pluginManager.listPlugins();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ plugins }));
      return;
    }

    if (pathname === '/api/plugins/validate' && req.method === 'POST') {
      const body = await readJson(1024 * 1024);
      const report = pluginManager.validatePlugin(body);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(report));
      return;
    }

    if (pathname === '/api/plugins/install' && req.method === 'POST') {
      const body = await readJson(1024 * 1024);
      const result = pluginManager.installPlugin(body);
      res.writeHead(result.success ? 200 : 400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return;
    }

    if (pathname.startsWith('/api/plugins/') && pathname.endsWith('/export') && req.method === 'GET') {
      const id = decodeURIComponent(pathname.replace('/api/plugins/', '').replace('/export', '').trim());
      const pkg = pluginManager.exportPlugin(id);
      if (!pkg) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Plugin "${id}" introuvable.` }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(pkg));
      return;
    }

    if (pathname.startsWith('/api/plugins/') && pathname.endsWith('/toggle') && req.method === 'PUT') {
      const id = decodeURIComponent(pathname.replace('/api/plugins/', '').replace('/toggle', '').trim());
      const body = await readJson(64 * 1024);
      const result = body.enabled
        ? await pluginManager.activatePlugin(id)
        : await pluginManager.deactivatePlugin(id);
      res.writeHead(result.success ? 200 : 400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return;
    }

    if (pathname.startsWith('/api/plugins/') && req.method === 'DELETE') {
      const id = decodeURIComponent(pathname.replace('/api/plugins/', '').trim());
      const success = await pluginManager.deletePlugin(id);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success }));
      return;
    }

    // 19. Pièces Jointes & Fichiers (M2, Cahier §26)
    if (pathname === '/api/attachments' && req.method === 'POST') {
      const contentType = req.headers['content-type'] || '';
      let conversationId = parsedUrl.searchParams.get('conversationId') || (req.headers['x-conversation-id'] as string);
      let filename = parsedUrl.searchParams.get('filename') || (req.headers['x-filename'] as string);
      let messageId = parsedUrl.searchParams.get('messageId') || (req.headers['x-message-id'] as string) || undefined;
      let fileStream: any = req;

      if (contentType.includes('multipart/form-data')) {
        const parsed = await parseMultipartStream(req);
        if (parsed.fields.conversationId) conversationId = parsed.fields.conversationId;
        if (parsed.fields.messageId) messageId = parsed.fields.messageId;
        if (parsed.file) {
          filename = filename || parsed.file.filename;
          fileStream = parsed.file.stream;
        }
      }

      if (!conversationId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'conversationId est requis.' }));
        return;
      }

      if (!filename) {
        filename = 'fichier_' + Date.now();
      }

      try {
        const attachment = await attachmentManager.saveStream(conversationId, filename, fileStream, messageId);
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ attachment: attachmentManager.toPublicInfo(attachment) }));
      } catch (err: any) {
        const isQuota = err.message?.includes('Quota') || err.message?.includes('volumineux') || err.message?.includes('limite');
        const isForbidden = err.message?.includes('interdit') || err.message?.includes('exécutable');
        const statusCode = err.statusCode || (isQuota ? 413 : isForbidden ? 400 : 400);
        res.writeHead(statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message || 'Erreur lors du téléversement de la pièce jointe' }));
      }
      return;
    }

    if (pathname.startsWith('/api/attachments/') && pathname.endsWith('/preview') && req.method === 'GET') {
      const id = pathname.replace('/api/attachments/', '').replace('/preview', '').trim();
      const att = attachmentManager.getAttachment(id);
      if (!att) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Pièce jointe introuvable.' }));
        return;
      }
      const preview = await AttachmentReader.readAttachment(att);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ preview, attachment: attachmentManager.toPublicInfo(att) }));
      return;
    }

    if (pathname.startsWith('/api/attachments/') && req.method === 'GET') {
      const id = pathname.replace('/api/attachments/', '').trim();
      const att = attachmentManager.getAttachment(id);
      if (!att) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Pièce jointe introuvable.' }));
        return;
      }

      const isRaw = parsedUrl.searchParams.get('raw') === '1' || parsedUrl.searchParams.get('download') === '1';
      if (isRaw && att.filePath && fs.existsSync(att.filePath)) {
        res.writeHead(200, {
          'Content-Type': att.mimeType || 'application/octet-stream',
          'Content-Disposition': `inline; filename="${encodeURIComponent(att.name)}"`,
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'private, max-age=3600'
        });
        fs.createReadStream(att.filePath).pipe(res);
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ attachment: attachmentManager.toPublicInfo(att) }));
      return;
    }

    if (pathname.startsWith('/api/attachments/') && req.method === 'DELETE') {
      const id = pathname.replace('/api/attachments/', '').trim();
      const success = attachmentManager.deleteAttachment(id);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success }));
      return;
    }

    // --- Workspaces (Mission M3) ---
    if (pathname === '/api/workspaces/pick' && req.method === 'POST') {
      try {
        const result = await workspaceDialogPicker.pickFolder();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ cancelled: true, error: err.message }));
      }
      return;
    }

    if (pathname === '/api/workspaces/pick/cancel' && req.method === 'POST') {
      const success = workspaceDialogPicker.cancelPicker();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success }));
      return;
    }

    if (pathname === '/api/workspaces/validate' && req.method === 'POST') {
      const body = await readJson(64 * 1024);
      const validation = WorkspaceValidator.validate(body.path);
      if (!validation.valid) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(validation));
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(validation));
      }
      return;
    }

    if (pathname === '/api/workspaces/recent' && req.method === 'GET') {
      const limit = parseInt(parsedUrl.searchParams.get('limit') || '5', 10);
      const recent = runtimeDatabase.listRecentWorkspaces(limit);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ recent }));
      return;
    }

    if (pathname === '/api/workspaces/open' && req.method === 'POST') {
      const body = await readJson(64 * 1024);
      const { conversationId, isTemp } = body;

      if (!conversationId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Le champ conversationId est requis.' }));
        return;
      }

      // Vérifier si une tâche est active sur cette conversation
      const runningTask = Array.from(sessions.values()).find(
        s => s.status === 'running' && s.activeConvId === conversationId
      );
      if (runningTask) {
        res.writeHead(409, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Une tâche est en cours d\'exécution. Veuillez arrêter la tâche avant de changer de dossier.' }));
        return;
      }

      if (isTemp) {
        const tempPath = tempWorkspaceManager.getOrCreateTempWorkspace(conversationId);
        const lock = workspaceLockManager.acquireLock(tempPath, conversationId);
        const metadata = await workspaceManager.analyze(tempPath);

        runtimeDatabase.saveConversation(
          conversationId,
          'Nouvelle discussion',
          tempPath,
          undefined,
          'code',
          'temp'
        );

        for (const s of sessions.values()) {
          if (s.activeConvId === conversationId) {
            s.workspacePath = tempPath;
            s.runtime.workspacePath = tempPath;
            s.permissionEngine.clear();
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          path: tempPath,
          name: 'Espace temporaire',
          isTemp: true,
          metadata,
          lock
        }));
        return;
      }

      const requestedPath = body.path || body.workspacePath;

      if (!requestedPath) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ valid: false, error: 'Le chemin de dossier est requis.' }));
        return;
      }

      const validation = WorkspaceValidator.validate(requestedPath);
      if (!validation.valid || !validation.canonicalPath) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ valid: false, error: validation.error || 'Dossier invalide.' }));
        return;
      }

      const canonicalPath = validation.canonicalPath;
      const folderName = validation.name || path.basename(canonicalPath);

      runtimeDatabase.recordRecentWorkspace(canonicalPath, folderName);
      const lock = workspaceLockManager.acquireLock(canonicalPath, conversationId);
      const metadata = await workspaceManager.analyze(canonicalPath);

      runtimeDatabase.saveConversation(
        conversationId,
        'Nouvelle discussion',
        canonicalPath,
        undefined,
        'code',
        folderName
      );

      for (const s of sessions.values()) {
        if (s.activeConvId === conversationId) {
          s.workspacePath = canonicalPath;
          s.runtime.workspacePath = canonicalPath;
          s.permissionEngine.clear();
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        path: canonicalPath,
        name: folderName,
        warning: validation.warning,
        metadata,
        lock
      }));
      return;
    }

    if (pathname === '/api/workspaces/close' && req.method === 'POST') {
      const body = await readJson(64 * 1024);
      const { conversationId } = body;
      if (!conversationId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Le champ conversationId est requis.' }));
        return;
      }

      workspaceLockManager.releaseLock(conversationId);
      runtimeDatabase.updateConversationWorkspace(conversationId, null);

      for (const s of sessions.values()) {
        if (s.activeConvId === conversationId) {
          s.workspacePath = DEFAULT_WORKSPACE;
          s.runtime.workspacePath = DEFAULT_WORKSPACE;
          s.permissionEngine.clear();
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
      return;
    }

    if (pathname === '/api/workspaces/temp/copy_to' && req.method === 'POST') {
      const body = await readJson(64 * 1024);
      const { conversationId, destinationPath } = body;
      if (!conversationId || !destinationPath) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'conversationId et destinationPath sont requis.' }));
        return;
      }

      try {
        const result = tempWorkspaceManager.copyTo(conversationId, destinationPath);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, ...result }));
      } catch (err: any) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // --- Artéfacts (Mission M4) ---
    if (pathname.startsWith('/api/conversations/') && pathname.endsWith('/artifacts') && req.method === 'GET') {
      const convId = pathname.replace('/api/conversations/', '').replace('/artifacts', '').trim();
      const list = artifactManager.listArtifacts(convId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(list));
      return;
    }

    if (pathname.startsWith('/api/conversations/') && pathname.endsWith('/artifacts') && req.method === 'POST') {
      const convId = pathname.replace('/api/conversations/', '').replace('/artifacts', '').trim();
      const body = await readJson(6 * 1024 * 1024); // 6 Mo max
      const { filename, content, title, mimeType } = body;
      if (!filename || content === undefined) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Les champs filename et content sont requis.' }));
        return;
      }
      try {
        const artifact = artifactManager.createArtifact({ conversationId: convId, filename, content, title, mimeType });
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ artifact: { ...artifact, content } }));
      } catch (err: any) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    if (pathname.startsWith('/api/artifacts/') && pathname.includes('/download') && req.method === 'GET') {
      const parts = pathname.split('/');
      const id = parts[3];
      let version: number | undefined;
      if (parts[4] === 'versions' && parts[5]) {
        version = parseInt(parts[5], 10);
      }
      const fileInfo = artifactManager.getArtifactFilePath(id, version);
      if (!fileInfo || !fs.existsSync(fileInfo.filePath)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Fichier d\'artéfact introuvable.' }));
        return;
      }

      res.writeHead(200, {
        'Content-Type': fileInfo.mimeType || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(fileInfo.filename)}"`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, max-age=3600'
      });
      fs.createReadStream(fileInfo.filePath).pipe(res);
      return;
    }

    if (pathname.startsWith('/api/artifacts/') && pathname.includes('/versions/') && req.method === 'GET') {
      const parts = pathname.split('/');
      const id = parts[3];
      const verNum = parseInt(parts[5], 10);
      try {
        const content = artifactManager.getArtifactContent(id, verNum);
        const verMeta = runtimeDatabase.getArtifactVersion(id, verNum);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ version: verMeta, content }));
      } catch (err: any) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    if (pathname.startsWith('/api/artifacts/') && pathname.endsWith('/restore') && req.method === 'POST') {
      const id = pathname.replace('/api/artifacts/', '').replace('/restore', '').trim();
      const body = await readJson(64 * 1024);
      if (!body.version) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Le champ version est requis.' }));
        return;
      }
      try {
        const updated = artifactManager.restoreVersion(id, Number(body.version));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ artifact: updated }));
      } catch (err: any) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    if (pathname.startsWith('/api/artifacts/') && pathname.endsWith('/preview') && req.method === 'GET') {
      const parts = pathname.split('/');
      const id = parts[3];
      const urlObj = new URL(req.url || '', `http://${req.headers.host}`);
      const verParam = urlObj.searchParams.get('version');
      const version = verParam ? parseInt(verParam, 10) : undefined;

      try {
        const preview = await artifactManager.extractArtifactPreview(id, version);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(preview));
      } catch (err: any) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    if (pathname.startsWith('/api/artifacts/') && pathname.endsWith('/view-html') && req.method === 'GET') {
      const parts = pathname.split('/');
      const id = parts[3];
      const fileInfo = artifactManager.getArtifactFilePath(id);
      if (!fileInfo || !fs.existsSync(fileInfo.filePath)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Artéfact introuvable.' }));
        return;
      }

      const htmlContent = fs.readFileSync(fileInfo.filePath, 'utf-8');
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none';",
        'X-Content-Type-Options': 'nosniff'
      });
      res.end(htmlContent);
      return;
    }

    if (pathname.startsWith('/api/artifacts/') && req.method === 'GET') {
      const id = pathname.replace('/api/artifacts/', '').trim();
      const artifact = artifactManager.getArtifact(id);
      if (!artifact) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Artéfact introuvable.' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ artifact }));
      return;
    }

    // --- Passerelle Recherche Web (Mission N3) ---
    if (pathname === '/api/search/providers' && req.method === 'GET') {
      const providers = searchGateway.listProviders();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        providers,
        permission: searchGateway.getPermission(),
        activeProviderId: searchGateway.getActiveProviderId(),
        isConfigured: searchGateway.hasConfiguredProvider()
      }));
      return;
    }

    if (pathname === '/api/search/settings' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        permission: searchGateway.getPermission(),
        activeProviderId: searchGateway.getActiveProviderId(),
        customUrl: (runtimeDatabase.getSetting('custom_search_url') as string) || '',
        isConfigured: searchGateway.hasConfiguredProvider()
      }));
      return;
    }

    if (pathname === '/api/search/settings' && req.method === 'POST') {
      const body = await readJson(64 * 1024);
      if (body.permission) {
        searchGateway.setPermission(body.permission);
      }
      if (body.activeProviderId !== undefined) {
        searchGateway.setActiveProviderId(body.activeProviderId);
      }
      if (body.customUrl !== undefined) {
        runtimeDatabase.setSetting('custom_search_url', body.customUrl);
        if (body.customUrl) {
          networkGuard.allowCustomHost(body.customUrl);
        }
      }
      toolRegistry.syncSearchTools();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        permission: searchGateway.getPermission(),
        activeProviderId: searchGateway.getActiveProviderId(),
        isConfigured: searchGateway.hasConfiguredProvider()
      }));
      return;
    }

    // --- Passerelle Média & Génération d'Images (Mission M6) ---
    if (pathname === '/api/media/providers' && req.method === 'GET') {
      const providers = mediaGateway.listProviders();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(providers));
      return;
    }

    if (pathname === '/api/media/models' && req.method === 'GET') {
      const providerId = parsedUrl.searchParams.get('providerId') || undefined;
      const models = await mediaGateway.listModels(providerId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(models));
      return;
    }

    if (pathname === '/api/media/settings' && req.method === 'GET') {
      const settings = mediaGateway.getSettings();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        activeProviderId: settings.activeProviderId,
        activeModelId: settings.activeModelId,
        hasKey: Boolean(settings.apiKey),
        maskedKey: settings.apiKey ? (settings.apiKey.slice(0, 3) + '...' + settings.apiKey.slice(-4)) : null,
        accountId: settings.accountId,
        baseUrl: settings.baseUrl,
        isConfigured: mediaGateway.hasConfiguredProvider()
      }));
      return;
    }

    if (pathname === '/api/media/settings' && req.method === 'POST') {
      const body = await readJson(64 * 1024);
      mediaGateway.saveSettings({
        activeProviderId: body.activeProviderId || '',
        activeModelId: body.activeModelId || '',
        apiKey: body.apiKey,
        accountId: body.accountId,
        baseUrl: body.baseUrl
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, isConfigured: mediaGateway.hasConfiguredProvider() }));
      return;
    }

    if (pathname === '/api/media/generate' && req.method === 'POST') {
      const body = await readJson(64 * 1024);
      const { prompt, aspectRatio, count, seed, model, conversationId } = body;
      if (!prompt) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Le champ prompt est requis.' }));
        return;
      }

      try {
        const result = await mediaGateway.generateImage({
          prompt,
          aspectRatio,
          count,
          seed,
          model
        });

        let ext = '.png';
        if (result.mimeType === 'image/jpeg') ext = '.jpg';
        else if (result.mimeType === 'image/webp') ext = '.webp';

        const slug = prompt
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 30) || 'image';
        const filename = `${slug}-${Date.now().toString(36)}${ext}`;
        const title = prompt.length > 50 ? prompt.slice(0, 47) + '...' : prompt;

        const artifact = artifactManager.createArtifact({
          conversationId: conversationId || 'default_conversation',
          filename,
          contentBuffer: result.imageData,
          mimeType: result.mimeType,
          title,
          metadata: {
            prompt: result.prompt,
            model: result.model,
            seed: result.seed,
            aspectRatio: result.aspectRatio,
            revisedPrompt: result.revisedPrompt,
            isGeneratedImage: true
          }
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, artifact }));
      } catch (err: any) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // --- Passerelle Média & Génération de Vidéos (Mission M7) ---
    if (pathname === '/api/media/video/providers' && req.method === 'GET') {
      const providers = videoGateway.listProviders();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(providers));
      return;
    }

    if (pathname === '/api/media/video/models' && req.method === 'GET') {
      const providerId = parsedUrl.searchParams.get('providerId') || undefined;
      const models = await videoGateway.listModels(providerId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(models));
      return;
    }

    if (pathname === '/api/media/video/settings' && req.method === 'GET') {
      const settings = videoGateway.getSettings();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        activeProviderId: settings.activeProviderId,
        activeModelId: settings.activeModelId,
        hasKey: Boolean(settings.apiKey),
        maskedKey: settings.apiKey ? (settings.apiKey.slice(0, 3) + '...' + settings.apiKey.slice(-4)) : null,
        timeoutMs: settings.timeoutMs,
        isConfigured: videoGateway.hasConfiguredProvider()
      }));
      return;
    }

    if (pathname === '/api/media/video/settings' && req.method === 'POST') {
      const body = await readJson(64 * 1024);
      videoGateway.saveSettings({
        activeProviderId: body.activeProviderId || '',
        activeModelId: body.activeModelId || '',
        apiKey: body.apiKey,
        timeoutMs: body.timeoutMs
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, isConfigured: videoGateway.hasConfiguredProvider() }));
      return;
    }

    if (pathname === '/api/media/video/jobs' && req.method === 'GET') {
      const convId = parsedUrl.searchParams.get('conversationId') || undefined;
      const jobs = videoGateway.listJobs(convId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(jobs));
      return;
    }

    if (pathname.startsWith('/api/media/video/jobs/') && pathname.endsWith('/cancel') && req.method === 'POST') {
      const jobId = pathname.replace('/api/media/video/jobs/', '').replace('/cancel', '').trim();
      const cancelled = videoGateway.cancelJob(jobId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: cancelled }));
      return;
    }

    if (pathname === '/api/media/video/ticket' && req.method === 'POST') {
      const body = await readJson(64 * 1024);
      const { artifactId } = body;
      if (!artifactId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Le champ artifactId est requis.' }));
        return;
      }
      const ticket = videoGateway.createStreamTicket(artifactId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ticket, expiresInSeconds: 300 }));
      return;
    }

    if (pathname.startsWith('/api/media/video/stream/') && req.method === 'GET') {
      const artifactId = pathname.replace('/api/media/video/stream/', '').split('?')[0].trim();
      const ticket = parsedUrl.searchParams.get('ticket');

      if (!ticket || !videoGateway.verifyStreamTicket(ticket, artifactId)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Ticket de streaming vidéo invalide ou expiré.' }));
        return;
      }

      const fileInfo = artifactManager.getArtifactFilePath(artifactId);
      if (!fileInfo || !fs.existsSync(fileInfo.filePath)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Artéfact vidéo introuvable.' }));
        return;
      }

      const stat = fs.statSync(fileInfo.filePath);
      const totalSize = stat.size;
      const mimeType = fileInfo.mimeType || 'video/mp4';
      const range = req.headers.range;

      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;

        if (isNaN(start) || start >= totalSize || end >= totalSize || start > end) {
          res.writeHead(416, {
            'Content-Range': `bytes */${totalSize}`,
            'Content-Type': 'application/json'
          });
          res.end(JSON.stringify({ error: 'Plage demandée non satisfaisable.' }));
          return;
        }

        const chunkSize = (end - start) + 1;
        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${totalSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkSize,
          'Content-Type': mimeType,
          'X-Content-Type-Options': 'nosniff'
        });
        fs.createReadStream(fileInfo.filePath, { start, end }).pipe(res);
      } else {
        res.writeHead(200, {
          'Content-Length': totalSize,
          'Content-Type': mimeType,
          'Accept-Ranges': 'bytes',
          'X-Content-Type-Options': 'nosniff'
        });
        fs.createReadStream(fileInfo.filePath).pipe(res);
      }
      return;
    }

    // Service de fichiers statiques avec repli SPA (§ Mission M8.2)
    if (req.method === 'GET' && !pathname.startsWith('/api/') && !pathname.startsWith('/ws') && pathname !== '/health') {
      const distDir = path.resolve(process.cwd(), 'dist');

      // 1. Validation de sécurité : interdiction absolue de traversée de chemin
      if (
        pathname.includes('..') ||
        pathname.includes('%2e%2e') ||
        pathname.includes('%2E%2E') ||
        /\/\.\./.test(pathname) ||
        /\\\.\./.test(pathname)
      ) {
        logger.warn(`Tentative de traversée de chemin rejetée : ${pathname}`);
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Traversée de chemin interdite.' }));
        return;
      }

      // 2. Interdiction des fichiers cachés
      if (/(?:^|\/)\.[^/]+/.test(pathname)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Fichier non trouvé.' }));
        return;
      }

      // 3. Résolution du fichier demandé dans dist/
      const cleanRelativePath = pathname.replace(/^\/+/, '');
      const candidatePath = path.resolve(distDir, cleanRelativePath);

      // Confinement strict : candidatePath doit être à l'intérieur de distDir
      if (!candidatePath.startsWith(distDir)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Accès non autorisé.' }));
        return;
      }

      let filePathToServe: string | null = null;
      let isSpaFallback = false;

      if (cleanRelativePath && fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile()) {
        filePathToServe = candidatePath;
      } else {
        // Repli SPA vers dist/index.html
        const indexPath = path.join(distDir, 'index.html');
        if (fs.existsSync(indexPath)) {
          filePathToServe = indexPath;
          isSpaFallback = true;
        }
      }

      if (filePathToServe) {
        const ext = path.extname(filePathToServe).toLowerCase();
        const mimeTypes: Record<string, string> = {
          '.html': 'text/html; charset=utf-8',
          '.js': 'application/javascript; charset=utf-8',
          '.mjs': 'application/javascript; charset=utf-8',
          '.css': 'text/css; charset=utf-8',
          '.json': 'application/json; charset=utf-8',
          '.woff2': 'font/woff2',
          '.woff': 'font/woff',
          '.ttf': 'font/ttf',
          '.svg': 'image/svg+xml',
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.gif': 'image/gif',
          '.webp': 'image/webp',
          '.ico': 'image/x-icon',
          '.txt': 'text/plain; charset=utf-8'
        };

        const contentType = mimeTypes[ext] || 'application/octet-stream';
        const stat = fs.statSync(filePathToServe);

        res.writeHead(200, {
          'Content-Type': contentType,
          'Content-Length': stat.size,
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
          'Referrer-Policy': 'no-referrer',
          'Permissions-Policy': 'microphone=(self)',
          'Cache-Control': isSpaFallback ? 'no-cache' : 'public, max-age=31536000, immutable'
        });
        fs.createReadStream(filePathToServe).pipe(res);
        return;
      }
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Endpoint introuvable.' }));
  } catch (err: any) {
    if (!res.headersSent) {
      const statusCode = err.statusCode || 500;
      res.writeHead(statusCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message || 'Erreur interne du serveur' }));
    }
  }
});

// Serveur WebSocket avec validation stricte du ticket de handshake (§26)
const wss = new WebSocketServer({ 
  noServer: true
});

server.on('upgrade', (req, socket, head) => {
  const host = req.headers.host;
  const origin = req.headers.origin;

  // 1. Validation Host et Origin au handshake WS
  if (!isHostAllowed(host) || (origin && !isOriginAllowed(origin))) {
    logger.warn(`Handshake WebSocket refusé : Host (${host}) ou Origin (${origin}) non autorisé`);
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
    socket.destroy();
    return;
  }

  // 1b. Protection en profondeur locale : limite de fréquence avec délai progressif sur les connexions WS (Mission R3a)
  const clientIp = req.socket.remoteAddress || '127.0.0.1';
  const wsRateCheck = wsRateLimiter.check(clientIp);
  if (!wsRateCheck.allowed) {
    logger.warn(`Handshake WebSocket temporairement limité pour ${clientIp} : réessai dans ${wsRateCheck.retryAfterSeconds}s`);
    socket.write(`HTTP/1.1 429 Too Many Requests\r\nRetry-After: ${wsRateCheck.retryAfterSeconds}\r\nConnection: close\r\n\r\n`);
    socket.destroy();
    return;
  }

  // 2. Extraction et validation du ticket (à usage unique, valable 30s)
  const parsedUrl = new URL(req.url || '/', `http://${host || '127.0.0.1:3001'}`);
  let ticket = parsedUrl.searchParams.get('ticket');

  // Si pas dans l'URL, vérifier dans le sous-protocole Sec-WebSocket-Protocol
  const protocols = req.headers['sec-websocket-protocol']?.split(',').map(s => s.trim()) || [];
  const ticketProto = protocols.find(p => p.startsWith('ticket.'));
  if (ticketProto) {
    ticket = ticketProto.replace('ticket.', '');
  }

  if (!ticket || !wsTickets.has(ticket)) {
    logger.warn('Handshake WebSocket refusé : ticket absent ou invalide');
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  const ticketData = wsTickets.get(ticket)!;
  wsTickets.delete(ticket); // Usage unique immédiat !

  if (Date.now() > ticketData.expiresAt) {
    logger.warn('Handshake WebSocket refusé : ticket expiré');
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});

// Raccordement de l'émetteur d'événements de la passerelle vidéo aux WebSockets connectés
videoGateway.setEventEmitter((event: any) => {
  const payload = JSON.stringify(event);
  for (const session of sessions.values()) {
    if (session.ws.readyState === WebSocket.OPEN) {
      session.ws.send(payload);
    }
  }
  broadcastActiveTasksStatus();
});

wss.on('connection', (ws: WebSocket) => {
  const sessionId = crypto.randomUUID();
  const permissionEngine = new PermissionEngine(DEFAULT_WORKSPACE, permissionStore);

  let activeTaskId: string | undefined;
  let activeConvId: string | undefined;

  const sendEvent = (event: AgentEvent) => {
    if (ws.readyState === WebSocket.OPEN) {
      const enrichedEvent: AgentEvent = {
        ...event,
        sessionId,
        taskId: activeTaskId || event.taskId,
        timestamp: new Date().toISOString()
      };
      ws.send(JSON.stringify(enrichedEvent));
    }
  };

  const emitRuntimeEvent = (event: AgentEvent) => {
    const enrichedEvent: AgentEvent = {
      ...event,
      sessionId,
      taskId: activeTaskId || event.taskId,
      timestamp: new Date().toISOString()
    };

    try {
      runtimeDatabase.recordEvent({
        id: crypto.randomUUID(),
        sessionId,
        taskId: activeTaskId,
        eventType: event.type,
        payload: event
      });

      if (event.type === 'tool_call_start' && activeTaskId) {
        runtimeDatabase.recordToolCall({
          id: event.callId,
          taskId: activeTaskId,
          toolName: event.tool,
          arguments: event.input,
          status: 'running'
        });
      } else if (event.type === 'tool_call_result' && activeTaskId) {
        runtimeDatabase.recordToolCall({
          id: event.callId,
          taskId: activeTaskId,
          toolName: event.tool,
          arguments: {},
          status: event.success ? 'completed' : 'failed',
          result: event.result ?? event.error
        });
      }
    } catch {}

    if (activeConvId) {
      activeJobManager.handleEvent(activeConvId, enrichedEvent);
    } else {
      sendEvent(enrichedEvent);
    }
  };

  const runtime = new AgentRuntime(sessionId, DEFAULT_WORKSPACE, permissionEngine, emitRuntimeEvent);

  const session: ActiveSession = {
    id: sessionId,
    ws,
    workspacePath: DEFAULT_WORKSPACE,
    status: 'idle',
    permissionEngine,
    runtime
  };
  sessions.set(sessionId, session);

  logger.info('Nouvelle session WebSocket établie', { sessionId });

  sendEvent({
    type: 'connected',
    sessionId,
    workspacePath: session.workspacePath
  });

  sendEvent({
    type: 'status',
    status: 'idle',
    message: 'Iroko Code Agent prêt sur ' + path.basename(session.workspacePath)
  });

  broadcastActiveTasksStatus();

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
            message: `Session initialisée sur ${session.workspacePath}`
          });
          break;
        }

        case 'subscribe_conversation': {
          if (message.conversationId) {
            activeConvId = message.conversationId;
            activeJobManager.subscribe(activeConvId, sendEvent);
          }
          break;
        }

        case 'send_prompt': {
          // Vérification du plafond de tâches simultanées (Mission M8.3 P6)
          const maxConcurrentSetting = runtimeDatabase.getSetting('max_concurrent_tasks');
          const maxConcurrent = maxConcurrentSetting ? parseInt(String(maxConcurrentSetting), 10) : 2;
          const limit = isNaN(maxConcurrent) ? 2 : maxConcurrent;

          let runningCount = activeJobManager.getRunningCount();
          for (const s of sessions.values()) {
            if (s.id !== sessionId && (s.status === 'running' || s.runtime?.isRunning())) {
              runningCount++;
            }
          }
          if (runningCount >= limit) {
            sendEvent({
              type: 'error',
              message: `Plafond de tâches simultanées atteint (${runningCount}/${limit}). Veuillez attendre la fin d'une tâche en cours ou ajuster la limite.`,
              fatal: false
            });
            return;
          }

          activeTaskId = crypto.randomUUID();
          activeConvId = message.conversationId || crypto.randomUUID();
          session.activeTaskId = activeTaskId;
          session.activeConvId = activeConvId;
          session.status = 'running';
          broadcastActiveTasksStatus({ conversationId: activeConvId, status: 'running' });
          logger.info(`Lancement de la tâche : "${message.prompt}"`, { sessionId, taskId: activeTaskId });

          // Résolution du niveau de réflexion configuré (§22, §37)
          const persistedThinking = runtimeDatabase.getSetting('thinking_level');
          const effectiveThinkingLevel = message.thinkingLevel || persistedThinking || 'medium';

          let preferredProviderId = message.preferredProviderId;
          if (!preferredProviderId && message.modelId) {
            const parts = message.modelId.split('/');
            if (parts.length > 1) preferredProviderId = parts[0];
          }

          let convMode: 'chat' | 'code' = message.mode === 'code' ? 'code' : 'chat';

          // S'assurer impérativement que la conversation existe en base avant toute insertion de message ou tâche (§21, §29)
          let convData = runtimeDatabase.getConversation(activeConvId);
          if (!convData) {
            const firstLine = message.prompt.split('\n')[0].replace(/^[#*\- ]+/, '').trim();
            const autoTitle = firstLine.length > 45 ? firstLine.slice(0, 45) + '…' : (firstLine || 'Nouvelle discussion');
            runtimeDatabase.saveConversation(activeConvId, autoTitle, undefined, undefined, convMode);
            convData = runtimeDatabase.getConversation(activeConvId);
          } else {
            if (message.mode && (message.mode === 'chat' || message.mode === 'code') && message.mode !== convData.conversation.mode) {
              runtimeDatabase.updateConversationMode(activeConvId, message.mode);
              convMode = message.mode;
            } else {
              convMode = convData.conversation.mode === 'code' ? 'code' : 'chat';
            }
          }

          try {
            runtimeDatabase.addMessage({
              id: crypto.randomUUID(),
              conversationId: activeConvId,
              role: 'user',
              content: message.prompt
            });

            // Titre automatique de la conversation dès le premier échange si générique (§22)
            if (convData && (convData.conversation.title === 'Nouvelle discussion' || !convData.conversation.title)) {
              const firstLine = message.prompt.split('\n')[0].replace(/^[#*\- ]+/, '').trim();
              const autoTitle = firstLine.length > 45 ? firstLine.slice(0, 45) + '…' : firstLine;
              if (autoTitle) {
                runtimeDatabase.saveConversation(activeConvId, autoTitle, convData.conversation.workspace_path || undefined);
              }
            }
          } catch (convErr) {
            logger.warn('Impossible d\'enregistrer le message utilisateur en base', convErr);
          }

          if (convData) {
            // Gestion du dossier de travail : dossier existant ou espace temporaire en mode Code
            if (convData.conversation.workspace_path) {
              session.workspacePath = convData.conversation.workspace_path;
              session.runtime.workspacePath = convData.conversation.workspace_path;
            } else if (convMode === 'code') {
              const tempPath = tempWorkspaceManager.getOrCreateTempWorkspace(activeConvId);
              session.workspacePath = tempPath;
              session.runtime.workspacePath = tempPath;
              runtimeDatabase.saveConversation(activeConvId, convData.conversation.title, tempPath, undefined, 'code', 'temp');
              workspaceLockManager.acquireLock(tempPath, activeConvId);
            }
          }

          // Mission R3c : Création immédiate du message assistant en base avec statut generating et interrupted: true
          const assistantMessageId = crypto.randomUUID();
          try {
            runtimeDatabase.addMessage({
              id: assistantMessageId,
              conversationId: activeConvId,
              role: 'assistant',
              content: '',
              metadata: {
                taskId: activeTaskId,
                status: 'generating',
                interrupted: true,
                canContinue: true,
                prompt: message.prompt
              }
            });
          } catch (err) {
            logger.warn('Impossible d\'enregistrer le message assistant initial en base', err);
          }

          runtimeDatabase.recordTask({
            id: activeTaskId,
            sessionId,
            conversationId: activeConvId,
            prompt: message.prompt,
            status: 'running',
            mode: convMode
          });

          // Enregistrement du job actif découplé avec abonnement du WebSocket courant
          const currentJob = activeJobManager.registerJob({
            taskId: activeTaskId,
            conversationId: activeConvId,
            prompt: message.prompt,
            mode: convMode,
            assistantMessageId,
            runtime: session.runtime,
            initialSubscriber: sendEvent
          });

          session.runtime.runTask(message.prompt, {
            taskId: activeTaskId,
            preferredProviderId,
            modelId: message.modelId,
            thinkingLevel: effectiveThinkingLevel,
            thinkingBudget: message.thinkingBudget,
            conversationId: activeConvId,
            conversationMode: convMode,
            attachmentIds: message.attachmentIds
          })
            .then(() => {
              if (currentJob.status === 'running') {
                activeJobManager.finishJob(currentJob, 'completed');
              }
            })
            .catch(err => {
              logger.error('Erreur d\'exécution de tâche', err, { sessionId, taskId: activeTaskId });
              if (currentJob.status === 'running') {
                activeJobManager.finishJob(currentJob, 'failed');
              }
              emitRuntimeEvent({
                type: 'error',
                message: err.message || 'Erreur inattendue dans la boucle agentique',
                fatal: false
              });
            })
            .finally(() => {
              const finishedConvId = activeConvId;
              session.activeTaskId = undefined;
              session.activeConvId = undefined;
              session.status = 'idle';
              broadcastActiveTasksStatus({ conversationId: finishedConvId, status: 'idle' });
            });
          break;
        }

        case 'permission_response': {
          logger.info(`Réponse de permission pour ${message.requestId}: ${message.approved ? 'ACCORDÉE' : 'REFUSÉE'}`, { sessionId });
          session.permissionEngine.resolvePermission(message.requestId, message.approved, message.scope);
          break;
        }

        case 'cancel_task': {
          logger.info('Tâche annulée par l\'utilisateur', { sessionId, taskId: activeTaskId });
          if (activeConvId) {
            activeJobManager.cancelJob(activeConvId);
          } else {
            session.runtime.cancelTask();
          }
          broadcastActiveTasksStatus({ conversationId: activeConvId, status: 'cancelled' });
          break;
        }
      }
    } catch (err: any) {
      logger.error('Erreur de parsing du message WebSocket', err, { sessionId });
      sendEvent({
        type: 'error',
        message: err?.message || 'Erreur interne du protocole WebSocket',
        fatal: false
      });
    }
  });

  ws.on('close', () => {
    logger.info('Session WebSocket fermée', { sessionId });
    if (activeConvId) {
      activeJobManager.unsubscribe(activeConvId, sendEvent);
    }
    sessions.delete(sessionId);
    broadcastActiveTasksStatus();
  });

  ws.on('error', (err) => {
    logger.error('Erreur WebSocket', err, { sessionId });
  });
});

// Écoute strictement sur 127.0.0.1 avec message clair en cas de port occupé
server.on('error', (err: any) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ ERREUR FATALE : Le port ${PORT} est déjà utilisé sur 127.0.0.1.`);
    console.error(`Arrêtez le processus en cours d'exécution ou modifiez la variable AGENT_PORT.`);
    process.exit(1);
  } else {
    console.error(`\n❌ Erreur serveur runtime :`, err);
    process.exit(1);
  }
});

server.listen(PORT, HOST, async () => {
  logger.info(`=======================================================`);
  logger.info(`🚀 IROKO CODE AGENT RUNTIME démarré avec succès !`);
  logger.info(`📡 Liaison réseau stricte : http://${HOST}:${PORT}`);
  logger.info(`🔒 Authentification : jeton éphémère actif en mémoire`);
  logger.info(`💾 Persistance locale   : SQLite (${runtimeDatabase.dbPath})`);
  logger.info(`📂 Workspace actif      : ${DEFAULT_WORKSPACE}`);
  logger.info(`=======================================================`);

  // Reprise des jobs vidéo en attente après redémarrage (§10, §26)
  try {
    await videoGateway.resumePendingJobs();
  } catch (err: any) {
    logger.warn('Avertissement lors de la reprise des jobs vidéo', err);
  }

  // Purge immédiate au démarrage des suppressions différées expirées (Mission R4b)
  try {
    const purgeReport = deletionManager.purgeExpiredOnStartup();
    if (purgeReport.count > 0) {
      logger.info(`Purge de ${purgeReport.count} élément(s) dont le délai de rétractation a expiré hors ligne.`);
    }
  } catch (err: any) {
    logger.warn('Avertissement lors de la purge des suppressions expirées au démarrage', err);
  }
});

export const handleShutdown = (exitProcess = true): Promise<void> => {
  return new Promise((resolve) => {
    logger.info('Arrêt du runtime en cours...');
    deletionManager.clearAllTimers();
    mcpManager.cleanup();
    processManager.terminateAll();
    processManager.cleanup();
    wss.close();
    server.close(() => {
      runtimeDatabase.close();
      logger.info('Runtime arrêté proprement.');
      if (exitProcess) {
        process.exit(0);
      } else {
        resolve();
      }
    });
  });
};

process.on('SIGINT', () => handleShutdown(true));
process.on('SIGTERM', () => handleShutdown(true));

export { server, wss, runtimeDatabase };

