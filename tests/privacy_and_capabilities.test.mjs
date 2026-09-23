import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// Isolation stricte : initialiser IROKO_DATA_DIR avant tout import du runtime
const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'iroko-priv-test-'));
process.env.IROKO_DATA_DIR = testDataDir;

const { ToolRegistry } = await import('../server/tools/ToolRegistry.js');
const { PrivacyFilter } = await import('../server/security/PrivacyFilter.js');
const { runtimeDatabase } = await import('../server/storage/RuntimeDatabase.js');
const { KeyPoolManager } = await import('../server/models/keys/KeyPoolManager.js');
const { networkGuard } = await import('../server/security/NetworkGuard.js');

test('MISSION L13 - Capacités & ToolRegistry (§6, §26)', async (t) => {
  const registry = new ToolRegistry();

  await t.test('Le ToolRegistry est la source unique de vérité', () => {
    const tools = registry.getAllToolsStatus();
    assert.ok(tools.length >= 18, `Au moins 18 outils enregistrés, trouvé: ${tools.length}`);

    const toolNames = tools.map(t => t.name);
    assert.ok(toolNames.includes('read_file'));
    assert.ok(toolNames.includes('write_file'));
    assert.ok(toolNames.includes('execute_command'));
    assert.ok(toolNames.includes('git_status'));
    assert.ok(toolNames.includes('verify_project'));
    assert.ok(toolNames.includes('remember_fact'));
  });

  await t.test('Interrupteur on/off d\'outil avec persistance', async () => {
    const initialCount = registry.getEnabledToolsCount();
    assert.ok(initialCount > 0);

    // Désactiver 'write_file'
    registry.setToolEnabled('write_file', false);
    assert.equal(registry.isToolEnabled('write_file'), false);
    assert.equal(registry.getEnabledToolsCount(), initialCount - 1);

    // Vérifier l'exclusion des définitions envoyées au modèle
    const modelDefs = registry.getDefinitionsForModel();
    const hasWriteFile = modelDefs.some(d => d.name === 'write_file');
    assert.equal(hasWriteFile, false, 'write_file ne doit pas être transmis au modèle');

    // Vérifier le blocage à l'exécution
    const mockContext = {
      workspacePath: process.cwd(),
      permissionEngine: { requestPermission: async () => true },
      emitEvent: () => {}
    };
    const execResult = await registry.executeTool('write_file', { path: 'test.txt', content: 'hello' }, mockContext);
    assert.equal(execResult.success, false);
    assert.ok(execResult.error?.includes('désactivé'));

    // Réactiver 'write_file'
    registry.setToolEnabled('write_file', true);
    assert.equal(registry.isToolEnabled('write_file'), true);
    assert.equal(registry.getEnabledToolsCount(), initialCount);

    const modelDefsAfter = registry.getDefinitionsForModel();
    assert.ok(modelDefsAfter.some(d => d.name === 'write_file'), 'write_file doit être réactivé dans les définitions');
  });

  await t.test('Statut et raison pour outil dépendant d\'un service', () => {
    const lspStatus = registry.getToolStatus('get_diagnostics');
    assert.ok(lspStatus);
    assert.equal(typeof lspStatus.available, 'boolean');

    const unknownStatus = registry.getToolStatus('non_existent_tool');
    assert.equal(unknownStatus, null);
  });
});

test('MISSION L13 - Filtre de Secrets & Caviardage (PrivacyFilter)', async (t) => {
  await t.test('Détection haute confiance des secrets', () => {
    // Clé PEM
    const pem = '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0...\n-----END RSA PRIVATE KEY-----';
    assert.ok(PrivacyFilter.detectSecrets(pem).hasSecret);
    assert.ok(PrivacyFilter.detectSecrets(pem).detectedTypes.includes('PEM_PRIVATE_KEY'));

    // Clé OpenAI
    const openaiKey = 'sk-proj-abc123def456ghi789jkl01234567890';
    assert.ok(PrivacyFilter.detectSecrets(openaiKey).hasSecret);

    // Clé Anthropic
    const anthropicKey = 'sk-ant-api03-abcdef1234567890abcdef1234567890';
    assert.ok(PrivacyFilter.detectSecrets(anthropicKey).hasSecret);

    // Clé Google
    const googleKey = 'AIzaSyA1234567890abcdefghijklmnopqrstuv';
    assert.ok(PrivacyFilter.detectSecrets(googleKey).hasSecret);

    // Jeton GitHub
    const ghKey = 'ghp_1234567890abcdef1234567890abcdef1234';
    assert.ok(PrivacyFilter.detectSecrets(ghKey).hasSecret);

    // Jeton Bearer
    const bearer = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.t-IDcSemACt8x4iTMCda8Yhe3iZaWbvV5XKSTbuAn0M';
    assert.ok(PrivacyFilter.detectSecrets(bearer).hasSecret);
  });

  await t.test('Masquage avant envoi au modèle (haute confiance uniquement)', () => {
    const promptWithKey = 'Utilise la clé sk-ant-api03-abcdef1234567890abcdef1234567890 pour appeler le service.';
    const masked = PrivacyFilter.maskSecretsForModel(promptWithKey);
    assert.ok(!masked.includes('sk-ant-api03-abcdef1234567890abcdef1234567890'));
    assert.ok(masked.includes('sk-••••••••'));

    const pem = '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0...\n-----END RSA PRIVATE KEY-----';
    const maskedPem = PrivacyFilter.maskSecretsForModel(pem);
    assert.ok(!maskedPem.includes('MIIEowIBAAKCAQEA0'));
    assert.ok(maskedPem.includes('[CLÉ PRIVÉE MASQUÉE]'));
  });

  await t.test('Masquage dans les journaux et logs', () => {
    const logLine = 'Erreur avec password="SuperSecretPassword123" et token="ghp_1234567890abcdef1234567890abcdef1234"';
    const masked = PrivacyFilter.maskSecretsForLogs(logLine);
    assert.ok(!masked.includes('SuperSecretPassword123'));
    assert.ok(!masked.includes('ghp_1234567890abcdef1234567890abcdef1234'));
  });

  await t.test('ZÉRO faux positif sur le code légitime', () => {
    // UUID v4 légitime
    const uuid = '123e4567-e89b-12d3-a456-426614174000';
    assert.equal(PrivacyFilter.maskSecretsForModel(uuid), uuid, 'Les UUIDs ne doivent jamais être altérés');

    // Hachage Git SHA-1 légitime
    const gitHash = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
    assert.equal(PrivacyFilter.maskSecretsForModel(gitHash), gitHash, 'Les hachages Git ne doivent jamais être altérés');

    // Hachage SHA-256 légitime
    const sha256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    assert.equal(PrivacyFilter.maskSecretsForModel(sha256), sha256, 'Les hachages SHA-256 ne doivent jamais être altérés');

    // Données Base64 d'image ou code
    const base64Data = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    assert.equal(PrivacyFilter.maskSecretsForModel(base64Data), base64Data, 'Les données Base64 ne doivent jamais être altérées');

    // Code TypeScript avec identifiants courants
    const tsCode = `
      function authenticate(tokenManager: TokenManager) {
        const id = '123e4567-e89b-12d3-a456-426614174000';
        const commit = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
        return { id, commit };
      }
    `;
    assert.equal(PrivacyFilter.maskSecretsForModel(tsCode), tsCode, 'Le code source valide doit rester intact');
  });
});

test('MISSION L13 - Confidentialité locale & Purges réelles', async (t) => {
  await t.test('Dossier de données local résolu et non vide', () => {
    const dataDir = runtimeDatabase.getDataDirectory();
    assert.ok(dataDir && dataDir.length > 0);
    assert.ok(dataDir.includes('.iroko') || dataDir.includes('iroko'));
  });

  await t.test('Export complet des données au format JSON', () => {
    const exported = runtimeDatabase.exportAllData();
    assert.ok(exported);
    assert.ok(exported.exportedAt);
    assert.ok(Array.isArray(exported.conversations));
    assert.ok(Array.isArray(exported.memories));
    assert.ok(typeof exported.settings === 'object');
  });

  await t.test('Purge effective des conversations', () => {
    // Insérer une conversation de test
    const convId = 'test_conv_purge_' + Date.now();
    runtimeDatabase.saveConversation(convId, 'Test topic');
    runtimeDatabase.addMessage({
      id: 'msg_' + Date.now(),
      conversationId: convId,
      role: 'user',
      content: 'Hello'
    });

    // Vérifier l'existence
    const convsBefore = runtimeDatabase.listConversations();
    assert.ok(convsBefore.some(c => c.id === convId));

    // Purger
    const result = runtimeDatabase.clearAllConversations();
    assert.ok(result.deletedConversations >= 1);

    // Vérifier la suppression
    const convsAfter = runtimeDatabase.listConversations();
    assert.equal(convsAfter.length, 0);
  });

  await t.test('Purge des clés d\'API', () => {
    const keyPool = new KeyPoolManager();
    const count = keyPool.clearAllKeys();
    assert.equal(typeof count, 'number');
    assert.equal(keyPool.getAllKeysMasked().length, 0);
  });
});

test('MISSION L13 - Conformité Réseau & Anti-Dérive (docs/NETWORK.md)', async (t) => {
  await t.test('Le fichier docs/NETWORK.md existe et liste les destinations autorisées', () => {
    const networkMdPath = path.resolve(process.cwd(), 'docs/NETWORK.md');
    assert.ok(fs.existsSync(networkMdPath), 'docs/NETWORK.md doit exister');

    const content = fs.readFileSync(networkMdPath, 'utf8');
    assert.ok(content.includes('api.anthropic.com'));
    assert.ok(content.includes('api.openai.com'));
    assert.ok(content.includes('generativelanguage.googleapis.com'));
    assert.ok(content.includes('openrouter.ai'));
    assert.ok(content.toLowerCase().includes('zéro télémétrie'));
  });

  await t.test('Rejet des destinations suspectes, télémétrie ou Supabase via NetworkGuard', () => {
    assert.strictEqual(networkGuard.isDestinationAllowed('https://api.anthropic.com/v1/messages').allowed, true);
    assert.strictEqual(networkGuard.isDestinationAllowed('https://api.openai.com/v1/chat/completions').allowed, true);
    assert.strictEqual(networkGuard.isDestinationAllowed('http://localhost:11434/api/tags').allowed, true);
    assert.strictEqual(networkGuard.isDestinationAllowed('https://pqauyxkmxnpycjiegfob.supabase.co').allowed, false);
    assert.strictEqual(networkGuard.isDestinationAllowed('https://telemetry.iroko.dev/collect').allowed, false);
    assert.strictEqual(networkGuard.isDestinationAllowed('https://google-analytics.com/collect').allowed, false);
    assert.strictEqual(networkGuard.isDestinationAllowed('https://segment.io/v1/track').allowed, false);
  });

  try {
    fs.rmSync(testDataDir, { recursive: true, force: true });
  } catch {}
});
