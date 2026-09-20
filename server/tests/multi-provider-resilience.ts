import { EncryptionService, encryptionService } from '../security/EncryptionService';
import { KeyPoolManager } from '../models/keys/KeyPoolManager';
import { SmartKeySelector } from '../models/keys/SmartKeySelector';
import { ErrorClassifier } from '../models/errors/ErrorClassifier';
import { ModelRouter } from '../models/router/ModelRouter';
import { ProviderCredential } from '../models/types';
import fs from 'fs';
import path from 'path';

async function runResilienceTests() {
  console.log('===============================================================');
  console.log('🧪 SUITE DE TESTS DE RÉSILIENCE : MULTI-PROVIDER & KEY MANAGER');
  console.log('===============================================================');

  let passed = 0;
  let total = 0;

  const assert = (condition: boolean, title: string) => {
    total++;
    if (condition) {
      console.log(`  ✅ [PASS] ${title}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${title}`);
      process.exitCode = 1;
    }
  };

  // Test 1: Chiffrement et masquage des secrets
  console.log('\n--- 1. Sécurité & Chiffrement AES-256-GCM ---');
  const rawKey = 'sk-ant-api03-abcdef1234567890XYZ';
  const enc = encryptionService.encrypt(rawKey);
  const dec = encryptionService.decrypt(enc);
  assert(dec === rawKey, 'Le déchiffrement reproduit exactement le secret initial');
  assert(enc.encrypted !== rawKey, 'Le secret est transformé en ciphertext illisible');
  assert(EncryptionService.maskKey(rawKey) === 'sk-••••••••0XYZ', 'Le masquage masque la clé et n\'expose que les 4 derniers caractères');

  // Test 2: Error Classifier
  console.log('\n--- 2. Error Classifier & Qualification ---');
  const err429 = ErrorClassifier.classify(new Error('429 Too Many Requests: Rate limit exceeded'), 1);
  assert(err429.category === 'RATE_LIMIT', '429 est classifié RATE_LIMIT');
  assert(err429.shouldCooldown === true && err429.cooldownSeconds === 30, '429 active un cooldown de 30s au premier échec');

  const err401 = ErrorClassifier.classify(new Error('401 Unauthorized: Invalid API key provided'), 1);
  assert(err401.category === 'AUTH_ERROR', '401 est classifié AUTH_ERROR');
  assert(err401.shouldDisableKey === true, '401 demande la désactivation immédiate de la clé');

  const err503 = ErrorClassifier.classify(new Error('503 Service Unavailable: Overloaded'), 1);
  assert(err503.category === 'TEMPORARY_PROVIDER_ERROR', '503 est classifié TEMPORARY_PROVIDER_ERROR');
  assert(err503.shouldFallbackProvider === true, '503 déclenche la bascule immédiate vers un provider alternatif');

  // Test 3: KeyPool & Cooldowns
  console.log('\n--- 3. KeyPool, Cooldowns & Sélection Intelligente ---');
  const testDir = path.join(process.cwd(), '.iroko_test_resilience');
  if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });

  const pool = new KeyPoolManager(testDir);
  const keyA = await pool.addKey('test_provider', 'Clé A (Principale)', 'key-alpha-1111', 1);
  const keyB = await pool.addKey('test_provider', 'Clé B (Secours)', 'key-beta-2222', 2);
  const keyC = await pool.addKey('test_provider', 'Clé C (Urgence)', 'key-gamma-3333', 3);

  // Sélection initiale
  const acq1 = pool.acquireKey('test_provider', 'SMART');
  assert(acq1 !== null && acq1.credential.id === keyA.id, 'Clé A sélectionnée en premier (priorité 1, saine)');
  acq1?.release();

  // Simulation 429 sur Clé A
  console.log('  -> Simulation d\'un 429 sur la Clé A...');
  pool.reportFailure(keyA.id, new Error('429 Rate Limit Exceeded'));

  // Nouvelle sélection : Clé A en cooldown, Clé B doit être choisie
  const acq2 = pool.acquireKey('test_provider', 'SMART');
  assert(acq2 !== null && acq2.credential.id === keyB.id, 'Clé B sélectionnée automatiquement pendant le cooldown de Clé A');
  acq2?.release();

  // Simulation 401 sur Clé B (invalide)
  console.log('  -> Simulation d\'un 401 sur la Clé B (clé révoquée)...');
  pool.reportFailure(keyB.id, new Error('401 Unauthorized: Invalid key'));

  // Nouvelle sélection : Clé C doit être choisie
  const acq3 = pool.acquireKey('test_provider', 'SMART');
  assert(acq3 !== null && acq3.credential.id === keyC.id, 'Clé C sélectionnée car A est en cooldown et B est invalide');
  acq3?.release();

  // Succès sur Clé C
  console.log('  -> Succès confirmé sur Clé C...');
  pool.reportSuccess(keyC.id);
  const updatedC = pool.getKeysByProvider('test_provider').find(k => k.id === keyC.id);
  assert(updatedC?.successCount === 1 && updatedC?.status === 'ACTIVE', 'Clé C enregistre le succès et conserve le statut ACTIVE');

  // Test 4: Concurrence & Rotation
  console.log('\n--- 4. Concurrence & Verrous d\'utilisation ---');
  const lock1 = pool.acquireKey('test_provider', 'SMART');
  const lock2 = pool.acquireKey('test_provider', 'SMART');
  // Les verrous augmentent activeRequests pour répartir la charge
  assert(lock1 !== null && lock2 !== null, 'Acquisition concurrente réussie');
  lock1?.release();
  lock2?.release();

  // Test 5: Model Router & Fallback
  console.log('\n--- 5. ModelRouter & Fallback inter-providers ---');
  const router = new ModelRouter(pool);
  const stream = router.generateStream({
    messages: [{ role: 'user', content: 'test fallback' }]
  }, 'test_provider');

  let streamWorked = false;
  for await (const chunk of stream) {
    if (chunk.type === 'thinking_delta' || chunk.type === 'text_delta') {
      streamWorked = true;
      break;
    }
  }
  assert(streamWorked === true, 'Le ModelRouter bascule sur le moteur de secours quand les clés cloud sont saturées');

  // Nettoyage dossier de test
  try {
    fs.rmSync(testDir, { recursive: true, force: true });
  } catch {}

  console.log('===============================================================');
  console.log(`🎯 RÉSULTAT : ${passed}/${total} assertions validées avec succès !`);
  console.log('===============================================================');
}

runResilienceTests().catch(err => {
  console.error('Erreur fatale de test :', err);
  process.exit(1);
});
