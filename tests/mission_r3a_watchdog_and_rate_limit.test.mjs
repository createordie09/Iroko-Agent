import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { RuntimeWatchdog } from '../server/supervisor/RuntimeWatchdog.ts';
import { LocalRateLimiter } from '../server/security/LocalRateLimiter.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const FIXTURE_PATH = path.join(ROOT_DIR, 'tests', 'fixtures', 'crash_target.js');

test('MISSION R3a — 1. Simulation d\'un plantage du runtime suivie d\'un redémarrage automatique observé', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'iroko-watchdog-test-'));
  const pidFile = path.join(tempDir, 'active_pid.txt');

  const watchdog = new RuntimeWatchdog({
    targetScript: FIXTURE_PATH,
    args: ['run', pidFile],
    dataDir: tempDir,
    maxRestarts: 5,
    restartWindowMs: 60000,
    backoffMs: 100
  });

  try {
    await watchdog.start();

    // Attente de l'enregistrement du PID initial
    let pid1 = null;
    for (let i = 0; i < 40; i++) {
      if (fs.existsSync(pidFile)) {
        try {
          const raw = fs.readFileSync(pidFile, 'utf8').trim();
          if (raw) { pid1 = parseInt(raw, 10); break; }
        } catch {}
      }
      await new Promise(r => setTimeout(r, 50));
    }

    assert.ok(pid1, 'Le processus enfant supervisé doit avoir démarré et écrit son PID');
    assert.equal(watchdog.getChild()?.pid, pid1, 'Le PID du processus enfant doit correspondre');

    // Simulation du plantage : processus tué
    if (process.platform === 'win32') {
      try { execSync(`taskkill /pid ${pid1} /T /F`, { stdio: 'ignore' }); } catch {}
    } else {
      try { process.kill(pid1, 'SIGKILL'); } catch {}
    }

    // Attente du redémarrage automatique observé
    let pid2 = null;
    for (let i = 0; i < 40; i++) {
      if (watchdog.getRestarts().length > 0) {
        const currentChild = watchdog.getChild();
        if (currentChild && currentChild.pid && currentChild.pid !== pid1) {
          pid2 = currentChild.pid;
          break;
        }
      }
      await new Promise(r => setTimeout(r, 100));
    }

    assert.ok(pid2, 'Le superviseur doit avoir relancé un nouveau processus enfant');
    assert.notEqual(pid2, pid1, 'Le nouveau processus doit avoir un PID distinct');

    const restarts = watchdog.getRestarts();
    assert.equal(restarts.length, 1, 'Exactement un redémarrage doit être consigné');
    assert.ok(restarts[0].timestamp, 'L\'horodatage ISO doit être présent');
    assert.ok(restarts[0].reason, 'La raison du redémarrage doit être renseignée');

    // Vérification de la persistance sur disque
    const diskRestarts = RuntimeWatchdog.getRestartsFromDisk(tempDir);
    assert.equal(diskRestarts.length, 1, 'Le journal sur disque doit contenir le redémarrage');
    assert.equal(diskRestarts[0].timestamp, restarts[0].timestamp);
  } finally {
    await watchdog.stop();
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
  }
});

test('MISSION R3a — 2. Dépassement de la limite de redémarrages qui s\'arrête proprement (anti-boucle infinie)', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'iroko-watchdog-limit-'));
  let maxExceededTriggered = false;

  const watchdog = new RuntimeWatchdog({
    targetScript: FIXTURE_PATH,
    args: ['crash'], // Quitte immédiatement avec le code 1
    dataDir: tempDir,
    maxRestarts: 3,
    restartWindowMs: 5000,
    backoffMs: 25,
    onMaxRestartsExceeded: () => {
      maxExceededTriggered = true;
    }
  });

  try {
    await watchdog.start();

    // Attente que le superviseur atteigne le plafond de 3 redémarrages et stoppe
    for (let i = 0; i < 60; i++) {
      if (!watchdog.isSupervising()) break;
      await new Promise(r => setTimeout(r, 50));
    }

    assert.equal(watchdog.isSupervising(), false, 'Le superviseur doit s\'être arrêté');
    assert.equal(maxExceededTriggered, true, 'Le callback onMaxRestartsExceeded doit avoir été déclenché');
    assert.equal(watchdog.getChild(), null, 'Aucun sous-processus ne doit subsister');

    const restarts = watchdog.getRestarts();
    assert.ok(restarts.length >= 3, 'Au moins 3 redémarrages rapprochés doivent être journalisés');
    for (const r of restarts) {
      assert.equal(r.exitCode, 1, 'Chaque redémarrage doit indiquer le code de sortie 1');
    }
  } finally {
    await watchdog.stop();
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
  }
});

test('MISSION R3a — 3. Limiteur de fréquence local : délai d\'attente progressif sans blocage définitif', async () => {
  const limiter = new LocalRateLimiter({
    windowMs: 1500,
    maxRequests: 3,
    baseDelayMs: 200,
    maxDelayMs: 2000
  });

  // 1. Les 3 premières requêtes passent sans délai
  const r1 = limiter.check('client-a');
  const r2 = limiter.check('client-a');
  const r3 = limiter.check('client-a');
  assert.equal(r1.allowed, true);
  assert.equal(r2.allowed, true);
  assert.equal(r3.allowed, true);

  // 2. La 4ème requête dépasse la limite : bloquée avec délai progressif
  const r4 = limiter.check('client-a');
  assert.equal(r4.allowed, false, 'La 4ème requête doit être refusée');
  assert.ok(r4.retryAfterSeconds >= 1, 'retryAfterSeconds doit être au moins de 1 seconde');
  assert.equal(r4.currentDelayMs, 200, 'Le délai initial doit être de 200ms');

  // 3. Une requête immédiate supplémentaire reste bloquée
  const r5 = limiter.check('client-a');
  assert.equal(r5.allowed, false);

  // 4. Après écoulement du délai progressif (260ms), le client est débloqué mais le dépassement suivant applique une pénalité progressive
  await new Promise(r => setTimeout(r, 260));
  const r6 = limiter.check('client-a');
  assert.equal(r6.allowed, false, 'La requête suivante dans la fenêtre subit un délai accru');
  assert.ok(r6.currentDelayMs > 200, 'Le délai d\'attente doit augmenter progressivement');

  // 5. Après expiration de la fenêtre (1600ms sans trafic), le client retrouve son accès plein (zéro blocage définitif)
  await new Promise(r => setTimeout(r, 1600));
  const r7 = limiter.check('client-a');
  assert.equal(r7.allowed, true, 'Après expiration de la fenêtre, le client doit être autorisé sans blocage définitif');
});

test('MISSION R3a — 4. Intégration du code dans server/index.ts : limitation bootstrap et handshakes WebSocket', () => {
  const serverIndex = fs.readFileSync(path.join(ROOT_DIR, 'server', 'index.ts'), 'utf8');

  assert.ok(serverIndex.includes('bootstrapRateLimiter'), 'server/index.ts doit déclarer et utiliser bootstrapRateLimiter');
  assert.ok(serverIndex.includes('wsRateLimiter'), 'server/index.ts doit déclarer et utiliser wsRateLimiter');
  assert.ok(serverIndex.includes('HTTP/1.1 429 Too Many Requests'), 'server/index.ts doit renvoyer 429 en cas de limitation');
  assert.ok(serverIndex.includes('Retry-After'), 'server/index.ts doit inclure l\'en-tête Retry-After');
  assert.ok(serverIndex.includes('RuntimeWatchdog.getRestartsFromDisk'), 'server/index.ts doit exposer les redémarrages dans le diagnostic');
});

test('MISSION R3a — 5. Consultation des redémarrages dans Diagnostic et persistance', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'iroko-diag-test-'));
  try {
    const fakeRestarts = [
      { timestamp: '2026-09-26T10:00:00.000Z', exitCode: 1, signal: null, reason: 'Sortie anormale code 1' },
      { timestamp: '2026-09-26T10:01:00.000Z', exitCode: null, signal: 'SIGTERM', reason: 'Interrompu par signal SIGTERM' }
    ];
    fs.writeFileSync(path.join(tempDir, 'watchdog_restarts.json'), JSON.stringify(fakeRestarts));

    const retrieved = RuntimeWatchdog.getRestartsFromDisk(tempDir);
    assert.equal(retrieved.length, 2, 'Deux redémarrages doivent être lus depuis le disque');
    assert.equal(retrieved[0].exitCode, 1);
    assert.equal(retrieved[1].signal, 'SIGTERM');

    // Vérification de la présence du champ dans l'interface et le hook
    const hookCode = fs.readFileSync(path.join(ROOT_DIR, 'src', 'hooks', 'settings', 'usePrivacySettings.ts'), 'utf8');
    assert.ok(hookCode.includes('restarts?: Array<{'), 'Le hook doit intégrer le typage des redémarrages');

    const privacyPageCode = fs.readFileSync(path.join(ROOT_DIR, 'src', 'features', 'settings', 'pages', 'PrivacyPage.tsx'), 'utf8');
    assert.ok(privacyPageCode.includes('Redémarrages superviseur'), 'PrivacyPage doit afficher les redémarrages superviseur');
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
  }
});

test('MISSION R3a — 6. Vérification HTTP réseau : requêtes rapprochées déclenchant 429 et Retry-After', async () => {
  const http = await import('node:http');
  const limiter = new LocalRateLimiter({
    windowMs: 5000,
    maxRequests: 3,
    baseDelayMs: 500
  });

  const testServer = http.createServer((req, res) => {
    const check = limiter.check('127.0.0.1');
    if (!check.allowed) {
      res.writeHead(429, {
        'Content-Type': 'application/json',
        'Retry-After': String(check.retryAfterSeconds)
      });
      res.end(JSON.stringify({ error: 'Trop de requêtes d\'amorçage', retryAfter: check.retryAfterSeconds }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ token: 'test-token-valide' }));
  });

  await new Promise((resolve) => testServer.listen(0, '127.0.0.1', resolve));
  const address = testServer.address();
  const testPort = typeof address === 'object' && address ? address.port : 0;

  try {
    for (let i = 0; i < 3; i++) {
      const res = await fetch(`http://127.0.0.1:${testPort}/`);
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.token, 'test-token-valide');
    }

    // 4ème requête : doit renvoyer 429
    const blockedRes = await fetch(`http://127.0.0.1:${testPort}/`);
    assert.equal(blockedRes.status, 429, 'Le serveur doit renvoyer HTTP 429');
    assert.equal(blockedRes.headers.get('Retry-After'), '1', 'L\'en-tête Retry-After doit être présent');
    const blockedJson = await blockedRes.json();
    assert.ok(blockedJson.error.includes('Trop de requêtes'));
  } finally {
    await new Promise((resolve) => testServer.close(resolve));
  }
});
