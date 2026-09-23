import { test } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { videoGateway } from '../server/media/VideoGateway.ts';
import { MockVideoAdapter, createMinimalMp4Buffer } from '../server/media/adapters/MockVideoAdapter.ts';
import { SsrfGuard } from '../server/media/security/SsrfGuard.ts';
import { toolRegistry } from '../server/tools/ToolRegistry.ts';
import { GenerateVideoTool } from '../server/tools/media/generate_video.ts';
import { runtimeDatabase } from '../server/storage/RuntimeDatabase.ts';
import { artifactManager } from '../server/artifacts/ArtifactManager.ts';

// ─────────────────────────────────────────────────────────────
// 1. CYCLE COMPLET DE GÉNÉRATION VIDÉO (MOCK ADAPTER)
// ─────────────────────────────────────────────────────────────

test('Mission M7 - 1. Cycle complet de génération vidéo avec MockVideoAdapter', async () => {
  // Configurer le mock provider
  videoGateway.saveSettings({
    activeProviderId: 'mock',
    activeModelId: 'mock-video-v1',
    timeoutMs: 30000
  });

  const convId = 'test-conv-' + Date.now();
  runtimeDatabase.saveConversation(convId, 'Test Conversation', os.tmpdir());

  const jobRecord = await videoGateway.createVideoJob({
    prompt: 'Un voilier naviguant dans un coucher de soleil',
    duration: 5,
    aspectRatio: '16:9'
  }, convId);
  const jobId = jobRecord.id;

  assert.ok(jobId, 'Un jobId doit être renvoyé');

  let job = videoGateway.getJob(jobId);
  assert.ok(job, 'Le job doit être enregistré');
  assert.ok(['queued', 'processing'].includes(job.status), `Statut initial attendu: queued ou processing, obtenu: ${job.status}`);

  // Attendre la fin du polling asynchrone (MockVideoAdapter prend ~300ms)
  let waited = 0;
  while (job && job.status !== 'completed' && job.status !== 'failed' && waited < 5000) {
    await new Promise(r => setTimeout(r, 100));
    waited += 100;
    job = videoGateway.getJob(jobId);
  }

  assert.strictEqual(job.status, 'completed', 'Le job doit atteindre le statut completed');
  assert.ok(job.artifactId, 'Un artifactId doit être présent sur le job terminé');

  // Vérifier la création de l'artéfact
  const artifact = artifactManager.getArtifact(job.artifactId);
  assert.ok(artifact, 'L\'artéfact doit être enregistré dans ArtifactManager');
  assert.strictEqual(artifact.mimeType, 'video/mp4');

  const fileInfo = artifactManager.getArtifactFilePath(job.artifactId);
  assert.ok(fileInfo && fs.existsSync(fileInfo.filePath), 'Le fichier MP4 physique doit exister sur le disque');

  // Vérifier les magic bytes MP4 (ftyp)
  const header = fs.readFileSync(fileInfo.filePath).slice(4, 8).toString('ascii');
  assert.strictEqual(header, 'ftyp', 'Les octets 4..8 du fichier doivent contenir la signature ftyp');
});

// ─────────────────────────────────────────────────────────────
// 2. ANNULATION PROPRE D'UN JOB EN COURS
// ─────────────────────────────────────────────────────────────

test('Mission M7 - 2. Annulation propre d\'un job de génération vidéo', async () => {
  videoGateway.saveSettings({
    activeProviderId: 'mock',
    activeModelId: 'mock-video-v1',
    timeoutMs: 30000
  });

  const convId = 'test-conv-cancel-' + Date.now();
  runtimeDatabase.saveConversation(convId, 'Test Conversation', os.tmpdir());

  const jobRecord = await videoGateway.createVideoJob({
    prompt: 'Une vidéo à annuler',
    duration: 5,
    aspectRatio: '1:1'
  }, convId);
  const jobId = jobRecord.id;

  // Annulation immédiate
  const cancelled = await videoGateway.cancelJob(jobId);
  assert.strictEqual(cancelled, true, 'L\'annulation doit réussir');

  const job = videoGateway.getJob(jobId);
  assert.strictEqual(job.status, 'cancelled', 'Le statut du job doit être cancelled');
});

// ─────────────────────────────────────────────────────────────
// 3. PERSISTANCE SQLITE ET REPRISE APRÈS REDÉMARRAGE
// ─────────────────────────────────────────────────────────────

test('Mission M7 - 3. Persistance SQLite et reprise après redémarrage (resumePendingJobs)', async () => {
  const convId = 'test-conv-resume-' + Date.now();
  runtimeDatabase.saveConversation(convId, 'Test Conversation', os.tmpdir());
  const testJobId = 'job-resume-' + Date.now();

  // Créer un job en base SQLite avec statut queued simulant un job interrompu
  runtimeDatabase.createVideoJob({
    id: testJobId,
    conversationId: convId,
    providerId: 'mock',
    modelId: 'mock-video-v1',
    prompt: 'Vidéo persistée avant crash',
    duration: 5,
    aspectRatio: '16:9',
    status: 'queued',
    externalJobId: 'mock-ext-' + Date.now()
  });

  // Reprise automatique des jobs
  await videoGateway.resumePendingJobs();

  // Attendre que la boucle de polling reprenne et termine le job
  let waited = 0;
  let job = videoGateway.getJob(testJobId);
  while (job && job.status !== 'completed' && job.status !== 'failed' && waited < 5000) {
    await new Promise(r => setTimeout(r, 100));
    waited += 100;
    job = videoGateway.getJob(testJobId);
  }

  assert.strictEqual(job.status, 'completed', 'Le job repris doit être mené à terme jusqu\'à completed');
  assert.ok(job.artifactId, 'Un artéfact doit être généré');
});

// ─────────────────────────────────────────────────────────────
// 4. TIMEOUT DE JOB DÉPASSÉ
// ─────────────────────────────────────────────────────────────

test('Mission M7 - 4. Délai d\'attente maximal dépassé (Timeout)', async () => {
  // Configurer un timeout de 50ms, plus court que la génération mock (qui prend ~250ms)
  videoGateway.saveSettings({
    activeProviderId: 'mock',
    activeModelId: 'mock-video-v1',
    timeoutMs: 50
  });

  const convId = 'test-conv-timeout-' + Date.now();
  runtimeDatabase.saveConversation(convId, 'Test Conversation', os.tmpdir());

  const jobRecord = await videoGateway.createVideoJob({
    prompt: 'Vidéo avec timeout court',
    duration: 10,
    aspectRatio: '16:9'
  }, convId);
  const jobId = jobRecord.id;

  // Attendre l'expiration
  let waited = 0;
  let job = videoGateway.getJob(jobId);
  while (job && job.status !== 'failed' && waited < 3000) {
    await new Promise(r => setTimeout(r, 50));
    waited += 50;
    job = videoGateway.getJob(jobId);
  }

  assert.strictEqual(job.status, 'failed', 'Le job doit échouer suite au timeout');
  assert.match(job.error || '', /délai|timeout/i, 'Le message d\'erreur doit expliciter le timeout');
});

// ─────────────────────────────────────────────────────────────
// 5. STREAMING SÉCURISÉ & REQUÊTES RANGE HTTP 206
// ─────────────────────────────────────────────────────────────

test('Mission M7 - 5. Requêtes HTTP Range (206 Partial Content) & Streaming de métadonnées', async () => {
  // 1. Créer un artéfact vidéo factice
  const minimalMp4 = createMinimalMp4Buffer();
  const rangeConvId = 'range-test-conv-' + Date.now();
  runtimeDatabase.saveConversation(rangeConvId, 'Test Range Conversation', os.tmpdir());

  const artifact = artifactManager.createArtifact({
    conversationId: rangeConvId,
    filename: 'test-range.mp4',
    contentBuffer: minimalMp4,
    mimeType: 'video/mp4',
    title: 'Test Range Video'
  });

  // 2. Générer un ticket court
  const ticket = videoGateway.createStreamTicket(artifact.id);
  assert.ok(ticket, 'Un ticket de streaming doit être délivré');

  // 3. Simuler un mini serveur HTTP utilisant le flux de streaming
  const server = http.createServer((req, res) => {
    const parsedUrl = new URL(req.url, 'http://127.0.0.1');
    const t = parsedUrl.searchParams.get('ticket');
    const artId = parsedUrl.pathname.replace('/stream/', '');

    if (!t || !videoGateway.verifyStreamTicket(t, artId)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Ticket invalide ou expiré' }));
      return;
    }

    const fileInfo = artifactManager.getArtifactFilePath(artId);
    const stat = fs.statSync(fileInfo.filePath);
    const totalSize = stat.size;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;

      const chunkSize = (end - start) + 1;
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${totalSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': 'video/mp4'
      });
      fs.createReadStream(fileInfo.filePath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': totalSize,
        'Content-Type': 'video/mp4'
      });
      fs.createReadStream(fileInfo.filePath).pipe(res);
    }
  });

  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;

  try {
    // Requête HTTP Range sur les 16 premiers octets
    const options = {
      hostname: '127.0.0.1',
      port,
      path: `/stream/${artifact.id}?ticket=${ticket}`,
      method: 'GET',
      headers: {
        'Range': 'bytes=0-15'
      }
    };

    const res = await new Promise((resolve, reject) => {
      const req = http.request(options, (res) => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: Buffer.concat(chunks)
        }));
      });
      req.on('error', reject);
      req.end();
    });

    assert.strictEqual(res.statusCode, 206, 'Le code HTTP doit être 206 Partial Content');
    assert.strictEqual(res.headers['accept-ranges'], 'bytes');
    assert.strictEqual(res.headers['content-range'], `bytes 0-15/${minimalMp4.length}`);
    assert.strictEqual(res.data.length, 16, 'La longueur des données reçues doit être de 16 octets');
    assert.deepStrictEqual(res.data, minimalMp4.slice(0, 16), 'Les données reçues doivent correspondre aux 16 premiers octets');
  } finally {
    server.close();
  }
});

// ─────────────────────────────────────────────────────────────
// 6. REJET DE TICKET INVALIDE OU EXPIRÉ (403)
// ─────────────────────────────────────────────────────────────

test('Mission M7 - 6. Rejet de ticket de streaming expiré ou invalide', async () => {
  const artifactId = 'art-test-' + Date.now();
  const ticket = videoGateway.createStreamTicket(artifactId);

  // 1. Ticket valide pour cet artifact
  assert.strictEqual(videoGateway.verifyStreamTicket(ticket, artifactId), true);

  // 2. Ticket pour un mauvais artifactId
  assert.strictEqual(videoGateway.verifyStreamTicket(ticket, 'autre-artifact'), false);

  // 3. Faux ticket
  assert.strictEqual(videoGateway.verifyStreamTicket('faux-ticket-1234', artifactId), false);
});

// ─────────────────────────────────────────────────────────────
// 7. AUTORISATION INTERACTIVE MEDIUM REFUSÉE => ZÉRO APPEL SORTANT
// ─────────────────────────────────────────────────────────────

test('Mission M7 - 7. Autorisation interactive MEDIUM refusée => aucun appel sortant', async () => {
  videoGateway.saveSettings({
    activeProviderId: 'mock',
    activeModelId: 'mock-video-v1'
  });

  const tool = new GenerateVideoTool();

  let permissionRequested = false;
  const mockPermissionEngine = {
    requestPermission: async (tool, level, description, details) => {
      permissionRequested = true;
      assert.strictEqual(level, 'MEDIUM', 'L\'outil generate_video doit être de niveau MEDIUM');
      assert.ok(details?.provider, 'Le fournisseur doit être mentionné');
      assert.ok(details?.model, 'Le modèle doit être mentionné');
      return false; // Refus par l'utilisateur
    }
  };

  const mockContext = {
    workspacePath: os.tmpdir(),
    sessionId: 'test-session-refusal',
    conversationId: 'test-session-refusal',
    permissionEngine: mockPermissionEngine,
    emitEvent: () => {}
  };

  const initialJobsCount = videoGateway.listJobs().length;

  const result = await tool.execute({
    prompt: 'Une vidéo refusée',
    duration: 5,
    aspectRatio: '16:9'
  }, mockContext);

  assert.strictEqual(permissionRequested, true, 'La permission interactive doit avoir été demandée');
  assert.strictEqual(result.success, false, 'L\'outil doit renvoyer un échec');
  assert.match(result.error, /refusée/i, 'L\'erreur doit mentionner le refus d\'autorisation');

  const afterJobsCount = videoGateway.listJobs().length;
  assert.strictEqual(afterJobsCount, initialJobsCount, 'Aucun job vidéo ne doit avoir été créé lors d\'un refus');
});

// ─────────────────────────────────────────────────────────────
// 8. SÉCURITÉ SSRF STRICTE SUR LES VIDÉOS DISTANTES
// ─────────────────────────────────────────────────────────────

test('Mission M7 - 8. Rejet SSRF sur URL distante privée ou protocole HTTP non sécurisé', async () => {
  const tmpFile = path.join(os.tmpdir(), `test-ssrf-${Date.now()}.mp4`);

  // 1. Rejet protocole non-HTTPS
  await assert.rejects(
    async () => {
      await SsrfGuard.safeStreamDownloadVideo('http://127.0.0.1:8080/evil.mp4', tmpFile);
    },
    /HTTPS/i,
    'Un protocole HTTP non chiffré doit être immédiatement rejeté'
  );

  // 2. Rejet métadonnées cloud / loopback
  await assert.rejects(
    async () => {
      await SsrfGuard.safeStreamDownloadVideo('https://127.0.0.1/evil.mp4', tmpFile);
    },
    /privée|interdite|bloquée|invalide/i,
    'L\'adresse de bouclage doit être bloquée par SsrfGuard'
  );

  if (fs.existsSync(tmpFile)) {
    fs.unlinkSync(tmpFile);
  }
});
