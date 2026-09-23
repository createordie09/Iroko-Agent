import { test } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { CloudflareFluxAdapter } from '../server/media/adapters/CloudflareFluxAdapter.ts';
import { MockImageAdapter } from '../server/media/adapters/MockImageAdapter.ts';
import { SsrfGuard } from '../server/media/security/SsrfGuard.ts';
import { mediaGateway } from '../server/media/MediaGateway.ts';
import { toolRegistry } from '../server/tools/ToolRegistry.ts';
import { GenerateImageTool } from '../server/tools/media/generate_image.ts';
import { runtimeDatabase } from '../server/storage/RuntimeDatabase.ts';
import { ArtifactManager } from '../server/artifacts/ArtifactManager.ts';

// PNG 1x1 minimaliste valide
const VALID_1X1_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const VALID_1X1_PNG_BUFFER = Buffer.from(VALID_1X1_PNG_BASE64, 'base64');

// ─────────────────────────────────────────────────────────────
// 1. DÉCODAGE BASE64 FLUX-1-SCHNELL (CLOUDFLARE WORKERS AI)
// ─────────────────────────────────────────────────────────────

test('Mission M6 - 1. Décodage base64 Flux-1-Schnell depuis réponse JSON Cloudflare', async () => {
  // Lancer un serveur mock local simulant l'API Cloudflare Workers AI
  const mockServer = http.createServer((req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      const parsed = JSON.parse(body);
      assert.strictEqual(parsed.prompt, 'Un coucher de soleil minimaliste');
      assert.strictEqual(parsed.steps, 4);

      // Cloudflare renvoie un JSON contenant le champ image en base64
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        result: {
          image: VALID_1X1_PNG_BASE64
        }
      }));
    });
  });

  await new Promise((resolve) => mockServer.listen(0, '127.0.0.1', () => resolve()));
  const port = mockServer.address().port;

  try {
    const adapter = new CloudflareFluxAdapter();
    const result = await adapter.generateImage(
      {
        prompt: 'Un coucher de soleil minimaliste',
        aspectRatio: '1:1'
      },
      'fake-api-key',
      {
        baseUrl: `http://127.0.0.1:${port}`,
        accountId: 'test-account-id'
      }
    );

    assert.ok(result, 'Le résultat doit exister');
    assert.strictEqual(result.mimeType, 'image/png');
    assert.ok(Buffer.isBuffer(result.imageData), 'imageData doit être un Buffer binaire décodé');
    assert.strictEqual(result.imageData.length, VALID_1X1_PNG_BUFFER.length);
    assert.deepStrictEqual(result.imageData, VALID_1X1_PNG_BUFFER);
  } finally {
    mockServer.close();
  }
});

// ─────────────────────────────────────────────────────────────
// 2. ÉTAT DÉSACTIVÉ SOBRE SI FOURNISSEUR ABSENT
// ─────────────────────────────────────────────────────────────

test('Mission M6 - 2. Fournisseur absent => generate_image désactivé sobrement avec raison accessible', async () => {
  // Sauvegarder les réglages actuels
  const previousSettings = runtimeDatabase.getSetting('media_settings');

  try {
    // Forcer l'absence de fournisseur configuré
    runtimeDatabase.deleteSetting('media_settings');

    // 1. Vérification dans le ToolRegistry
    const avail = toolRegistry.isToolAvailable('generate_image');
    assert.strictEqual(avail.available, false, 'L\'outil doit être indisponible sans fournisseur');
    assert.ok(avail.reasonDisabled, 'Une raison accessible doit être fournie');
    assert.match(avail.reasonDisabled, /fournisseur/i, 'La raison doit mentionner le fournisseur manquant');

    // 2. Exécution directe de l'outil generate_image
    const tool = new GenerateImageTool();
    const mockContext = {
      workspacePath: os.tmpdir(),
      sessionId: 'test-session',
      permissionEngine: {},
      emitEvent: () => {}
    };

    const res = await tool.execute({ prompt: 'Un paysage' }, mockContext);
    assert.strictEqual(res.success, false, 'L\'exécution doit échouer proprement');
    assert.ok(res.error, 'Un message d\'erreur explicatif doit être renvoyé');
    assert.match(res.error, /fournisseur/i);
  } finally {
    if (previousSettings) {
      runtimeDatabase.setSetting('media_settings', previousSettings);
    }
  }
});

// ─────────────────────────────────────────────────────────────
// 3. PROTECTION SSRF ET REJET DES IP PRIVÉES / LOCALES
// ─────────────────────────────────────────────────────────────

test('Mission M6 - 3. Protection SSRF : filtrage strict des IP privées et loopback', () => {
  // Loopback
  assert.strictEqual(SsrfGuard.isPrivateOrLoopbackIp('127.0.0.1'), true);
  assert.strictEqual(SsrfGuard.isPrivateOrLoopbackIp('127.128.0.1'), true);
  assert.strictEqual(SsrfGuard.isPrivateOrLoopbackIp('::1'), true);
  assert.strictEqual(SsrfGuard.isPrivateOrLoopbackIp('::ffff:127.0.0.1'), true);

  // RFC 1918 Privé
  assert.strictEqual(SsrfGuard.isPrivateOrLoopbackIp('10.0.0.1'), true);
  assert.strictEqual(SsrfGuard.isPrivateOrLoopbackIp('10.255.255.255'), true);
  assert.strictEqual(SsrfGuard.isPrivateOrLoopbackIp('172.16.0.1'), true);
  assert.strictEqual(SsrfGuard.isPrivateOrLoopbackIp('172.31.255.255'), true);
  assert.strictEqual(SsrfGuard.isPrivateOrLoopbackIp('192.168.1.1'), true);
  assert.strictEqual(SsrfGuard.isPrivateOrLoopbackIp('192.168.254.254'), true);

  // Link-local
  assert.strictEqual(SsrfGuard.isPrivateOrLoopbackIp('169.254.1.1'), true);
  assert.strictEqual(SsrfGuard.isPrivateOrLoopbackIp('fe80::1'), true);

  // IP Publiques valides
  assert.strictEqual(SsrfGuard.isPrivateOrLoopbackIp('8.8.8.8'), false);
  assert.strictEqual(SsrfGuard.isPrivateOrLoopbackIp('1.1.1.1'), false);
  assert.strictEqual(SsrfGuard.isPrivateOrLoopbackIp('142.250.190.46'), false);
});

test('Mission M6 - 3b. Protection SSRF : safeDownloadImage refuse http://, loopback et local', async () => {
  // Rejet protocole non HTTPS
  await assert.rejects(
    () => SsrfGuard.safeDownloadImage('http://example.com/image.png'),
    /protocole non s.curis./i
  );

  // Rejet IP loopback littérale en HTTPS
  await assert.rejects(
    () => SsrfGuard.safeDownloadImage('https://127.0.0.1/image.png'),
    /priv.e ou locale/i
  );

  // Rejet IP privée RFC 1918 en HTTPS
  await assert.rejects(
    () => SsrfGuard.safeDownloadImage('https://192.168.1.50/image.png'),
    /priv.e ou locale/i
  );

  // Rejet localhost résolu via DNS
  await assert.rejects(
    () => SsrfGuard.safeDownloadImage('https://localhost/image.png'),
    /r.sout vers l.adresse IP priv.e ou locale/i
  );
});

test('Mission M6 - 3c. Validation Magic Bytes des images binaires', () => {
  // PNG valide
  const pngCheck = SsrfGuard.validateImageMagicBytes(VALID_1X1_PNG_BUFFER);
  assert.strictEqual(pngCheck.valid, true);
  assert.strictEqual(pngCheck.detectedMime, 'image/png');

  // JPEG valide
  const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
  const jpegCheck = SsrfGuard.validateImageMagicBytes(jpegBuffer);
  assert.strictEqual(jpegCheck.valid, true);
  assert.strictEqual(jpegCheck.detectedMime, 'image/jpeg');

  // WEBP valide
  const webpBuffer = Buffer.from('RIFF....WEBPVP8 ', 'ascii');
  const webpCheck = SsrfGuard.validateImageMagicBytes(webpBuffer);
  assert.strictEqual(webpCheck.valid, true);
  assert.strictEqual(webpCheck.detectedMime, 'image/webp');

  // Donnée corrompue ou injection HTML/JS
  const htmlBuffer = Buffer.from('<script>alert("hack")</script>');
  const htmlCheck = SsrfGuard.validateImageMagicBytes(htmlBuffer);
  assert.strictEqual(htmlCheck.valid, false);
  assert.ok(htmlCheck.error);
});

// ─────────────────────────────────────────────────────────────
// 4. ANNULATION ET TIMEOUT VIA ABORTSIGNAL
// ─────────────────────────────────────────────────────────────

test('Mission M6 - 4. Annulation par AbortSignal interrompt la génération', async () => {
  const adapter = new MockImageAdapter();
  const controller = new AbortController();

  // Annuler immédiatement
  controller.abort();

    await assert.rejects(
      () => adapter.generateImage({
        prompt: 'Un chat dormant sous la pluie',
        abortSignal: controller.signal
      }),
      /interrompue|annul/i
    );
  });

  // ─────────────────────────────────────────────────────────────
  // 5. SAUVEGARDE ET RECHARGEMENT DES MÉTADONNÉES DANS SQLITE
  // ─────────────────────────────────────────────────────────────

  test('Mission M6 - 5. Persistance et restitution fidèle des métadonnées d\'artéfacts images', () => {
    const testConvId = `conv_test_meta_${Date.now()}`;
    const testArtId = `art_test_meta_${Date.now()}`;
    const metadata = {
      prompt: 'Un baobab majestueux au crépuscule',
      model: 'flux-1-schnell',
      seed: 98765,
      aspectRatio: '16:9',
      isGeneratedImage: true
    };

    try {
      // Créer la conversation dans la base
      runtimeDatabase.saveConversation(testConvId, 'Test M6 Métadonnées');

      // Enregistrer l'artéfact avec métadonnées
      runtimeDatabase.recordArtifact({
        id: testArtId,
        conversationId: testConvId,
        name: 'baobab-sunset.png',
        title: 'Un baobab majestueux',
        mimeType: 'image/png',
        size: 1024,
        filePath: path.join(os.tmpdir(), 'baobab-sunset.png'),
        metadata
      });

      // 1. Relecture directe par ID
      const loaded = runtimeDatabase.getArtifact(testArtId);
      assert.ok(loaded, 'L\'artéfact doit être retrouvé');
      assert.strictEqual(loaded.name, 'baobab-sunset.png');
      assert.deepStrictEqual(loaded.metadata, metadata, 'Les métadonnées doivent correspondre exactement');

      // 2. Relecture via la liste des artéfacts de conversation
      const list = runtimeDatabase.listArtifacts(testConvId);
      assert.strictEqual(list.length, 1);
      assert.deepStrictEqual(list[0].metadata, metadata);
    } finally {
      // Nettoyage
      runtimeDatabase.deleteConversation(testConvId);
    }
  });

  // ─────────────────────────────────────────────────────────────
  // 6. SUPPRESSION PHYSIQUE DES FICHIERS LORS DE LA PURGE CONVERSATION
  // ─────────────────────────────────────────────────────────────

  test('Mission M6 - 6. Suppression physique des fichiers d\'artéfacts sur disque', () => {
    const testConvId = `conv_cleanup_${Date.now()}`;
    const testArtId = `art_cleanup_${Date.now()}`;

    // Créer la conversation dans la base pour respecter la contrainte de clé étrangère
    runtimeDatabase.saveConversation(testConvId, 'Test Cleanup');

    // Créer un artéfact via ArtifactManager
    const manager = ArtifactManager.getInstance();
    const artifact = manager.createArtifact({
      conversationId: testConvId,
      filename: 'test-image.png',
      contentBuffer: VALID_1X1_PNG_BUFFER,
      mimeType: 'image/png',
      title: 'Image Test Cleanup'
    });

    const filePath = artifact.versions[0]?.filePath;
    assert.ok(filePath, 'Le chemin du fichier doit être défini');
    assert.ok(fs.existsSync(filePath), 'Le fichier doit exister sur disque avant suppression');

    // Supprimer les artéfacts de la conversation via RuntimeDatabase
    runtimeDatabase.deleteConversationArtifacts(testConvId);

    // Vérifier que le fichier et le dossier de conversation sont supprimés
    assert.strictEqual(fs.existsSync(filePath), false, 'Le fichier physique doit avoir été supprimé');
  });

// ─────────────────────────────────────────────────────────────
// 7. GÉNÉRATION BOUT EN BOUT AVEC FOURNISSEUR ET REGISTRY
// ─────────────────────────────────────────────────────────────

test('Mission M6 - 7. Génération bout en bout : MediaGateway, ToolRegistry et GenerateImageTool', async () => {
  const previousSettings = runtimeDatabase.getSetting('media_settings');

  try {
    // 1. Configurer le fournisseur Mock
    mediaGateway.saveSettings({
      activeProviderId: 'mock',
      activeModelId: 'mock-1x1',
      apiKey: 'mock-key'
    });

    assert.strictEqual(mediaGateway.hasConfiguredProvider(), true);

    // 2. Vérifier la disponibilité dans le registry
    const avail = toolRegistry.isToolAvailable('generate_image');
    assert.strictEqual(avail.available, true);

    // 3. Exécuter l'outil generate_image
    const tool = new GenerateImageTool();
    const testConvId = `conv_e2e_${Date.now()}`;
    runtimeDatabase.saveConversation(testConvId, 'Test E2E');
    let emittedEvent = null;

    const mockContext = {
      workspacePath: os.tmpdir(),
      sessionId: 'session-e2e',
      conversationId: testConvId,
      permissionEngine: {},
      emitEvent: (evt) => { emittedEvent = evt; }
    };

    const res = await tool.execute({
      prompt: 'Une pyramide dorée',
      aspect_ratio: '16:9'
    }, mockContext);

    assert.strictEqual(res.success, true);
    assert.ok(res.data?.artifactId);
    assert.strictEqual(res.data?.mimeType, 'image/png');
    assert.ok(emittedEvent, 'Un événement artifact_created doit avoir été émis');
    assert.strictEqual(emittedEvent.type, 'artifact_created');
    assert.strictEqual(emittedEvent.artifact.id, res.data.artifactId);
    assert.strictEqual(emittedEvent.artifact.metadata?.prompt, 'Une pyramide dorée');
    assert.strictEqual(emittedEvent.artifact.metadata?.aspectRatio, '16:9');

    // 4. Nettoyage
    runtimeDatabase.deleteConversationArtifacts(testConvId);
  } finally {
    if (previousSettings) {
      runtimeDatabase.setSetting('media_settings', previousSettings);
    } else {
      runtimeDatabase.deleteSetting('media_settings');
    }
  }
});
