import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), '..', '..');

export function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(250);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, '127.0.0.1');
  });
}

export async function ensureServersRunning(isolatedDataDir) {
  const is3001 = await isPortOpen(3001);
  const is5173 = await isPortOpen(5173);

  if (is3001 && is5173) {
    return;
  }

  const lockDir = path.join(os.tmpdir(), 'iroko-test-bootstrap.lock');
  const statusFile = path.join(os.tmpdir(), 'iroko-test-supervisor-status.txt');
  const runnerPid = process.ppid || process.pid;

  let isLeader = false;

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      fs.mkdirSync(lockDir);
      fs.writeFileSync(path.join(lockDir, 'runner_pid.txt'), String(runnerPid));
      isLeader = true;
      break;
    } catch (err) {
      if (err.code === 'EEXIST') {
        // Vérifier si le verrou est orphelin
        try {
          const recordedPid = parseInt(fs.readFileSync(path.join(lockDir, 'runner_pid.txt'), 'utf8').trim(), 10);
          if (recordedPid) {
            try {
              process.kill(recordedPid, 0);
            } catch {
              // Le processus est mort : nettoyer le verrou orphelin
              fs.rmSync(lockDir, { recursive: true, force: true });
              continue;
            }
          }
        } catch {
          fs.rmSync(lockDir, { recursive: true, force: true });
          continue;
        }
        break; // Un autre processus valide détient le verrou
      }
      throw err;
    }
  }

  if (isLeader) {
    if (fs.existsSync(statusFile)) {
      try { fs.unlinkSync(statusFile); } catch {}
    }

    const resolvedDataDir = isolatedDataDir || process.env.IROKO_DATA_DIR || path.join(os.tmpdir(), 'iroko-default-data');
    if (!fs.existsSync(resolvedDataDir)) {
      try { fs.mkdirSync(resolvedDataDir, { recursive: true }); } catch {}
    }

    const supervisorScript = path.join(rootDir, 'tests', 'helpers', 'test_supervisor.js');
    const supProc = spawn(process.execPath, [
      supervisorScript,
      String(runnerPid),
      resolvedDataDir,
      statusFile
    ], {
      detached: true,
      stdio: 'ignore',
      cwd: rootDir
    });
    supProc.unref();
  }

  // Attendre que les deux ports soient ouverts (max 30 secondes)
  const maxWait = 30000;
  const start = Date.now();

  while (Date.now() - start < maxWait) {
    const [bOpen, vOpen] = await Promise.all([
      isPortOpen(3001),
      isPortOpen(5173)
    ]);

    if (bOpen && vOpen) {
      if (isLeader) {
        try { fs.rmSync(lockDir, { recursive: true, force: true }); } catch {}
      }
      return;
    }

    if (fs.existsSync(statusFile)) {
      const content = fs.readFileSync(statusFile, 'utf8');
      if (content.startsWith('ERROR:')) {
        throw new Error(`Échec du bootstrap des serveurs de test : ${content}`);
      }
    }

    await new Promise((r) => setTimeout(r, 150));
  }

  throw new Error('Délai dépassé (30s) en attente du démarrage des serveurs 3001 et 5173');
}
