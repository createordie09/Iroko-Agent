/**
 * tests/setup_test_env.js
 * Préchargement global Node.js pour toutes les suites de tests.
 * Garantit qu'aucun test ne peut s'exécuter sur le dossier de données réel.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// 1. Déclarer formellement l'environnement de test
process.env.NODE_ENV = 'test';
process.env.IROKO_TEST_MODE = '1';

// 2. Créer un répertoire de données temporaire et isolé pour l'ensemble de la session de test
if (!process.env.IROKO_DATA_DIR) {
  const isolatedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'iroko-test-run-'));
  process.env.IROKO_DATA_DIR = isolatedDir;

  // Nettoyage automatique du dossier temporaire lors de la fin du processus de test
  const cleanup = () => {
    try {
      if (fs.existsSync(isolatedDir)) {
        fs.rmSync(isolatedDir, { recursive: true, force: true });
      }
    } catch {}
  };

  process.on('exit', cleanup);
  process.on('SIGINT', () => { cleanup(); process.exit(130); });
  process.on('SIGTERM', () => { cleanup(); process.exit(143); });
}
