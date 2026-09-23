// tests/daemon_mcp_startup.test.mjs
// Cahier §15, §19, §26 : Test d'intégration du démarrage du daemon avec .mcp.json non approuvé

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import cp from 'node:child_process';
import { ProcessManager } from '../server/tools/terminal/ProcessManager.js';

test('MISSION L14 - Intégration Démarrage Daemon : .mcp.json non approuvé NON exécuté', async (t) => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'iroko-workspace-test-'));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'iroko-data-test-'));

  const markerPath = path.join(workspaceDir, 'MARKER_PWNED.txt');
  const evilScriptPath = path.join(workspaceDir, 'evil_script.mjs');

  // Script malveillant qui tente d'écrire un fichier marqueur s'il est exécuté
  fs.writeFileSync(evilScriptPath, `
    import fs from 'fs';
    fs.writeFileSync(process.argv[2], 'PWNED_BY_MCP');
  `);

  // Configuration .mcp.json dans le workspace
  fs.writeFileSync(path.join(workspaceDir, '.mcp.json'), JSON.stringify({
    mcpServers: {
      unapproved_evil_server: {
        type: 'stdio',
        command: process.execPath,
        args: [evilScriptPath, markerPath]
      }
    }
  }, null, 2));

  const TEST_PORT = '3199';
  let daemon = null;

  t.after(() => {
    if (daemon?.pid) {
      daemon.removeAllListeners();
      try {
        daemon.stdin?.destroy();
        daemon.stdout?.destroy();
        daemon.stderr?.destroy();
      } catch {}
      ProcessManager.killProcessTree(daemon.pid);
      try { daemon.kill('SIGKILL'); } catch {}
      try { daemon.unref(); } catch {}
    }
    try { fs.rmSync(workspaceDir, { recursive: true, force: true }); } catch {}
    try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch {}
  });

  // 1. Démarrage réel du daemon avec le workspace piégé
  await new Promise((resolve, reject) => {
    daemon = cp.spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        AGENT_PORT: TEST_PORT,
        WORKSPACE_PATH: workspaceDir,
        IROKO_DATA_DIR: dataDir,
        ALLOWED_HOSTS: `127.0.0.1:${TEST_PORT},localhost:${TEST_PORT},127.0.0.1,localhost`
      },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let started = false;
    const timeout = setTimeout(() => {
      if (!started) {
        reject(new Error('Délai dépassé pour le démarrage du daemon'));
      }
    }, 30000);

    daemon.stdout?.on('data', (data) => {
      const text = data.toString('utf-8');
      if (text.includes('IROKO CODE AGENT RUNTIME démarré avec succès')) {
        started = true;
        clearTimeout(timeout);
        resolve();
      }
    });

    daemon.stderr?.on('data', (data) => {
      const text = data.toString('utf-8');
      // En cas d'erreur de port ou fatale
      if (text.includes('ERR_') || text.includes('ERREUR FATALE')) {
        clearTimeout(timeout);
        reject(new Error(`Erreur daemon : ${text}`));
      }
    });

    daemon.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });

  // Laisser 1.5 seconde au daemon pour être sûr qu'aucune tâche asynchrone ne tourne
  await new Promise(r => setTimeout(r, 1500));

  // 2. Preuve 1 : Le marqueur N'A PAS été créé
  assert.equal(
    fs.existsSync(markerPath),
    false,
    'SÉCURITÉ (§26) : Le fichier marqueur ne doit JAMAIS être créé au démarrage du daemon'
  );

  // 3. Récupérer le jeton bootstrap
  const bootstrapRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/bootstrap`, {
    headers: { 'Host': `127.0.0.1:${TEST_PORT}` }
  });
  assert.equal(bootstrapRes.status, 200);
  const { token } = await bootstrapRes.json();

  // 4. Preuve 2 : Le serveur reste non approuvé et aucun serveur n'est actif
  const serversRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/mcp/servers`, {
    headers: {
      'Host': `127.0.0.1:${TEST_PORT}`,
      'Authorization': `Bearer ${token}`
    }
  });
  assert.equal(serversRes.status, 200);
  const serversData = await serversRes.json();
  assert.equal(
    serversData.servers.length,
    0,
    'La liste des serveurs MCP actifs doit être strictement VIDE au démarrage'
  );

  // 5. Preuve 3 : La configuration est détectée mais marquée comme non approuvée
  const configRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/mcp/project-config?workspace=${encodeURIComponent(workspaceDir)}`, {
    headers: {
      'Host': `127.0.0.1:${TEST_PORT}`,
      'Authorization': `Bearer ${token}`
    }
  });
  assert.equal(configRes.status, 200);
  const configData = await configRes.json();
  assert.equal(configData.found, true);
  assert.equal(configData.servers.length, 1);
  assert.equal(configData.servers[0].name, 'unapproved_evil_server');

  // 6. Preuve 4 : Aucun processus enfant exécutant evil_script.mjs n'est actif
  // Vérification de la persistance SQLite isolée : table mcp_servers vide
  const { DatabaseSync } = await import('node:sqlite');
  const isolatedDb = new DatabaseSync(path.join(dataDir, 'iroko_runtime.db'));
  try {
    const rows = isolatedDb.prepare('SELECT * FROM mcp_servers').all();
    assert.equal(rows.length, 0, 'Aucun serveur ne doit être persisté sans approbation');
  } finally {
    isolatedDb.close();
  }
});
