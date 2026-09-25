/**
 * tests/setup_test_env.js
 * Préchargement global Node.js pour toutes les suites de tests.
 * Garantit l'isolation stricte des données et le bootstrap automatique des serveurs 3001/5173.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ensureServersRunning } from './helpers/ensure_servers.js';

// 1. Déclarer formellement l'environnement de test
process.env.NODE_ENV = 'test';
process.env.IROKO_TEST_MODE = '1';

// 2. Gestion unifiée du répertoire de données temporaire pour l'ensemble de la session de test
const runnerPid = process.ppid || process.pid;
const sessionFile = path.join(os.tmpdir(), 'iroko-test-session.json');

if (!process.env.IROKO_DATA_DIR) {
  let sharedDir = null;
  if (fs.existsSync(sessionFile)) {
    try {
      const sess = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
      if (sess.runnerPid) {
        try {
          process.kill(sess.runnerPid, 0);
          if (sess.dataDir && fs.existsSync(sess.dataDir)) {
            sharedDir = sess.dataDir;
          }
        } catch {}
      }
    } catch {}
  }

  if (!sharedDir) {
    sharedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'iroko-test-run-'));
    try {
      fs.writeFileSync(sessionFile, JSON.stringify({ runnerPid, dataDir: sharedDir }));
    } catch {}
  }

  process.env.IROKO_DATA_DIR = sharedDir;

  const cleanup = () => {
    try {
      if (fs.existsSync(sessionFile)) {
        try {
          const sess = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
          if (sess.runnerPid === runnerPid) {
            fs.unlinkSync(sessionFile);
          }
        } catch {}
      }
    } catch {}
  };

  process.on('exit', cleanup);
  process.on('SIGINT', () => { cleanup(); process.exit(130); });
  process.on('SIGTERM', () => { cleanup(); process.exit(143); });
}

// 3. Amorce automatique des serveurs runtime (3001) et client Vite (5173)
await ensureServersRunning(process.env.IROKO_DATA_DIR);
