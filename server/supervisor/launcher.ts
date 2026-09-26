import path from 'node:path';
import { RuntimeWatchdog } from './RuntimeWatchdog';

const isDev = process.env.NODE_ENV !== 'production';
const targetScript = process.env.IROKO_SERVER_SCRIPT || (
  isDev
    ? path.resolve(process.cwd(), 'server/index.ts')
    : path.resolve(process.cwd(), 'dist-server/index.js')
);

const execArgv = targetScript.endsWith('.ts') ? ['--import', 'tsx'] : [];

const watchdog = new RuntimeWatchdog({
  targetScript,
  execArgv,
  cwd: process.cwd(),
  env: process.env,
  maxRestarts: 5,
  restartWindowMs: 60000,
  backoffMs: 250,
  onRestart: (entry) => {
    console.warn(`[WATCHDOG] Redémarrage détecté (${entry.reason}) à ${entry.timestamp}`);
  },
  onMaxRestartsExceeded: (err) => {
    console.error(`[WATCHDOG] Arrêt d'urgence : ${err.message}`);
    process.exit(1);
  }
});

watchdog.start().catch((err) => {
  console.error('[WATCHDOG] Erreur lors du lancement initial :', err);
  process.exit(1);
});

const cleanup = async () => {
  console.log('[WATCHDOG] Signal d\'arrêt reçu, interruption propre du superviseur...');
  await watchdog.stop();
  process.exit(0);
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
