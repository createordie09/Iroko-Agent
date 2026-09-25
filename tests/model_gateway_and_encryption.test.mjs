import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

// Charger les modules compilés/TS via dynamic import tsx
const { EncryptionService } = await import('../server/security/EncryptionService.ts');
const { ErrorClassifier } = await import('../server/models/errors/ErrorClassifier.ts');
const { KeyPoolManager } = await import('../server/models/keys/KeyPoolManager.ts');
const { ModelRouter } = await import('../server/models/router/ModelRouter.ts');
const { ModelGateway, formatModelLabel } = await import('../server/models/ModelGateway.ts');
const { AnthropicProvider } = await import('../server/models/providers/AnthropicProvider.ts');
const { OpenAIProvider } = await import('../server/models/providers/OpenAIProvider.ts');
const { GeminiProvider } = await import('../server/models/providers/GeminiProvider.ts');
const { LMStudioProvider } = await import('../server/models/providers/LMStudioProvider.ts');
const { OllamaProvider } = await import('../server/models/providers/OllamaProvider.ts');

test('1. Chiffrement : IV aléatoire unique de 12 octets à chaque chiffrement AES-256-GCM', () => {
  const encService = new EncryptionService();
  const secret = 'sk-ant-api03-test-secret-key-1234567890';

  const res1 = encService.encrypt(secret);
  const res2 = encService.encrypt(secret);

  // Les IV doivent être strictement différents
  assert.notEqual(res1.iv, res2.iv, 'Chaque chiffrement doit utiliser un nouvel IV aléatoire');
  assert.equal(res1.iv.length, 24, 'IV hex de 12 octets (24 caractères hex)');
  assert.notEqual(res1.encrypted, res2.encrypted, 'Deux chiffrements du même secret doivent donner deux cyphertexts différents');

  // Déchiffrement intègre
  const dec1 = encService.decrypt(res1);
  const dec2 = encService.decrypt(res2);
  assert.equal(dec1, secret);
  assert.equal(dec2, secret);
});

test('2. Chiffrement : Clé maîtresse située hors dépôt et hors dossier de données', () => {
  const masterKeyPath = path.resolve(EncryptionService.getMasterKeyPath());
  const cwd = path.resolve(process.cwd());
  const realDataDir = path.resolve(
    process.platform === 'win32' && process.env.APPDATA
      ? path.join(process.env.APPDATA, 'iroko')
      : path.join(os.homedir(), '.iroko')
  );
  const runtimeDataDir = process.env.IROKO_DATA_DIR ? path.resolve(process.env.IROKO_DATA_DIR) : null;

  const isSubpath = (parent, child) => {
    const rel = path.relative(parent, child);
    return !rel.startsWith('..') && !path.isAbsolute(rel);
  };

  // Doit être en dehors du dépôt
  assert.equal(isSubpath(cwd, masterKeyPath), false, 'La clé maîtresse ne doit pas être dans le dépôt');
  // Doit être en dehors du dossier de données
  assert.equal(isSubpath(realDataDir, masterKeyPath), false, 'La clé maîtresse ne doit pas être dans le dossier de données runtime');
  if (runtimeDataDir) {
    assert.equal(isSubpath(runtimeDataDir, masterKeyPath), false, 'La clé maîtresse ne doit pas être dans le dossier temporaire de test');
  }
  // Doit être dans .iroko_security
  assert.equal(masterKeyPath.includes('.iroko_security'), true, 'La clé maîtresse doit résider dans .iroko_security');
});

test('3. Chiffrement : Contrôle d\'intégrité strict (Auth Tag)', () => {
  const encService = new EncryptionService();
  const secret = 'super-secret-key-integrity';
  const enc = encService.encrypt(secret);

  // Altération du tag (maintien d'exactement 32 caractères hex)
  const badTag = (enc.authTag.startsWith('00') ? 'ff' : '00') + enc.authTag.slice(2);
  assert.throws(() => {
    encService.decrypt({
      encrypted: enc.encrypted,
      iv: enc.iv,
      authTag: badTag
    });
  });
});

test('4. Sécurité & Masquage : Clé jamais renvoyée en clair (masquage début/fin)', () => {
  const key1 = 'sk-ant-api03-abcdefghijklmnop1234';
  const masked1 = EncryptionService.maskKey(key1);
  assert.equal(masked1.startsWith('sk-••••'), true);
  assert.equal(masked1.endsWith('1234'), true);
  assert.equal(masked1.includes('abcdefghijklmnop'), false, 'Le corps du secret ne doit pas fuiter');

  const key2 = 'AIzaSyD-1234567890abcdef-ZZ99';
  const masked2 = EncryptionService.maskKey(key2);
  assert.equal(masked2.startsWith('••••'), true);
  assert.equal(masked2.endsWith('ZZ99'), true);
});

test('5. Pool de clés : Migration transparente des anciennes clés sans fuite en clair', async () => {
  const tempWorkspace = path.join(os.tmpdir(), `iroko_test_ws_${Date.now()}`);
  const tempIrokoDir = path.join(tempWorkspace, '.iroko');
  fs.mkdirSync(tempIrokoDir, { recursive: true });

  const tempRuntimeDir = path.join(os.tmpdir(), `iroko_test_runtime_${Date.now()}`);
  fs.mkdirSync(tempRuntimeDir, { recursive: true });

  // Créer un faux ancien fichier de clés chiffrées
  const encService = new EncryptionService();
  const legacySecret = 'sk-legacy-test-secret-9999';
  const encrypted = encService.encrypt(legacySecret);

  const legacyFile = path.join(tempIrokoDir, 'credentials.enc.json');
  fs.writeFileSync(legacyFile, JSON.stringify([{
    id: 'legacy-key-1',
    providerId: 'openai',
    label: 'Ancienne Clé',
    maskedKey: 'sk-••••9999',
    encryptedSecret: encrypted.encrypted,
    iv: encrypted.iv,
    authTag: encrypted.authTag,
    status: 'ACTIVE',
    enabled: true,
    priority: 1,
    failureCount: 0,
    successCount: 0
  }]));

  // Initialiser un KeyPoolManager pointant sur ce workspace
  const pool = new KeyPoolManager(tempRuntimeDir, tempWorkspace);

  const keys = pool.getAllKeysMasked();
  const migrated = keys.find(k => k.id === 'legacy-key-1');
  assert.ok(migrated, 'La clé legacy a été migrée');
  assert.equal(migrated.maskedKey.endsWith('9999'), true);
  assert.equal(migrated.encryptedSecret, '***REDACTED***', 'Les secrets chiffrés sont masqués dans getAllKeysMasked');

  // L'ancien fichier doit avoir été purgé du workspace
  assert.equal(fs.existsSync(legacyFile), false, 'L\'ancien fichier de clés du workspace doit être supprimé');

  // Nettoyage
  try {
    fs.rmSync(tempWorkspace, { recursive: true, force: true });
    fs.rmSync(tempRuntimeDir, { recursive: true, force: true });
  } catch {}
});

test('6. Classification d\'erreurs : 401/403 désactive la clé sans nouvelle tentative', () => {
  const err401 = new Error('HTTP 401: Invalid API Key');
  const class401 = ErrorClassifier.classify(err401);
  assert.equal(class401.category, 'AUTH_ERROR');
  assert.equal(class401.shouldDisableKey, true);
  assert.equal(class401.isRetryable, false);

  const err403 = new Error('HTTP 403: Forbidden - Permission denied');
  const class403 = ErrorClassifier.classify(err403);
  assert.equal(class403.category, 'AUTH_ERROR');
  assert.equal(class403.shouldDisableKey, true);
  assert.equal(class403.isRetryable, false);
});

test('7. Classification d\'erreurs : 429 déclenche rotation + cooldown exponentiel avec jitter', () => {
  const err429 = new Error('Rate limit exceeded (429: Too Many Requests)');
  
  const class1 = ErrorClassifier.classify(err429, 1);
  assert.equal(class1.category, 'RATE_LIMIT');
  assert.equal(class1.isRetryable, true);
  assert.equal(class1.shouldCooldown, true);
  assert.ok(class1.cooldownSeconds >= 30 && class1.cooldownSeconds <= 35, 'Cooldown 1er échec ~30s');

  const class2 = ErrorClassifier.classify(err429, 2);
  assert.ok(class2.cooldownSeconds >= 60 && class2.cooldownSeconds <= 65, 'Cooldown 2e échec ~60s');

  const class3 = ErrorClassifier.classify(err429, 3);
  assert.ok(class3.cooldownSeconds >= 120 && class3.cooldownSeconds <= 125, 'Cooldown 3e échec ~120s');
});

test('8. Pool de clés : Clé invalide (401) marquée INVALID et exclue de l\'acquisition', async () => {
  const tempDir = path.join(os.tmpdir(), `iroko_test_pool_${Date.now()}`);
  const pool = new KeyPoolManager(tempDir);

  const cred = await pool.addKey('anthropic', 'Clé Test Invalide', 'sk-ant-invalid-key-0000');
  assert.ok(cred.id);

  // Simuler échec 401
  pool.reportFailure(cred.id, new Error('401 Unauthorized: Invalid API Key'));

  // La clé ne doit plus pouvoir être acquise
  const acquisition = pool.acquireKey('anthropic');
  assert.equal(acquisition, null, 'Une clé INVALID (401) ne doit plus jamais être acquise');

  // Nettoyage
  try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
});

test('9. FormatModelLabel : Élimination du nom "Claude" dans le texte visible', () => {
  const model1 = formatModelLabel('anthropic/claude-3.5-sonnet');
  assert.equal(model1.name, 'Sonnet 3.5');
  assert.equal(model1.name.toLowerCase().includes('claude'), false, 'Le nom Claude ne doit pas apparaître dans le libellé visible');
  assert.equal(model1.id, 'anthropic/claude-3.5-sonnet', 'L\'identifiant technique reste inchangé');

  const model2 = formatModelLabel('claude-3-5-haiku-latest', 'Anthropic');
  assert.equal(model2.name, 'Haiku 3.5');
  assert.equal(model2.name.toLowerCase().includes('claude'), false);

  const model3 = formatModelLabel('openai/gpt-4o');
  assert.equal(model3.name, 'GPT-4o');

  const model4 = formatModelLabel('google/gemini-2.0-flash');
  assert.equal(model4.name, 'Gemini 2.0 Flash');
});

test('10. Découplage : Le cœur du runtime fonctionne avec tous les fournisseurs (OpenAI, Gemini, LM Studio, Ollama)', () => {
  const router = new ModelRouter();
  
  const providers = router.getAllProviders();
  const providerIds = providers.map(p => p.id);

  assert.ok(providerIds.includes('anthropic'), 'Anthropic enregistré');
  assert.ok(providerIds.includes('openai'), 'OpenAI enregistré');
  assert.ok(providerIds.includes('gemini'), 'Gemini enregistré');
  assert.ok(providerIds.includes('lmstudio'), 'LM Studio enregistré');
  assert.ok(providerIds.includes('ollama'), 'Ollama enregistré');
  assert.ok(providerIds.includes('custom'), 'Compatible OpenAI custom enregistré');
  assert.ok(providerIds.includes('mock'), 'Moteur de secours Mock enregistré');

  for (const p of providers) {
    assert.equal(typeof p.generateStream, 'function');
    assert.equal(typeof p.listModels, 'function');
    assert.equal(typeof p.validateCredential, 'function');
  }
});
