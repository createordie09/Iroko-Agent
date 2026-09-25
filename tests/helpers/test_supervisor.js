import { spawn, execSync } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), '..', '..');

const runnerPid = parseInt(process.argv[2], 10);
let isolatedDataDir = process.argv[3];
const statusFile = process.argv[4];

if (!isolatedDataDir || isolatedDataDir === 'undefined') {
  isolatedDataDir = process.env.IROKO_DATA_DIR || path.join(os.tmpdir(), 'iroko-default-data');
}
if (!fs.existsSync(isolatedDataDir)) {
  try { fs.mkdirSync(isolatedDataDir, { recursive: true }); } catch {}
}

if (!runnerPid || isNaN(runnerPid)) {
  process.exit(1);
}

function isPortOpen(port) {
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

async function waitForPort(port, timeoutMs = 25000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isPortOpen(port)) return true;
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

let backendProc = null;
let viteProc = null;

const cleanup = () => {
  try {
    if (process.platform === 'win32') {
      if (backendProc?.pid) {
        try { execSync(`taskkill /pid ${backendProc.pid} /T /F`, { stdio: 'ignore' }); } catch {}
      }
      if (viteProc?.pid) {
        try { execSync(`taskkill /pid ${viteProc.pid} /T /F`, { stdio: 'ignore' }); } catch {}
      }
    } else {
      if (backendProc?.pid) {
        try { process.kill(-backendProc.pid, 'SIGKILL'); } catch {}
      }
      if (viteProc?.pid) {
        try { process.kill(-viteProc.pid, 'SIGKILL'); } catch {}
      }
    }
  } catch {}
  try {
    if (statusFile && fs.existsSync(statusFile)) {
      fs.unlinkSync(statusFile);
    }
  } catch {}
  process.exit(0);
};

// Arrêt automatique si le runner de test parent meurt
const heartbeat = setInterval(() => {
  try {
    process.kill(runnerPid, 0);
  } catch {
    clearInterval(heartbeat);
    cleanup();
  }
}, 300);

// Sécurité : durée de vie maximale de 10 minutes
setTimeout(cleanup, 600000).unref();

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('exit', cleanup);

async function start() {
  const is3001Open = await isPortOpen(3001);
  const is5173Open = await isPortOpen(5173);

  const backendLog = fs.openSync(path.join(os.tmpdir(), 'iroko-supervisor-backend.log'), 'w');
  const viteLog = fs.openSync(path.join(os.tmpdir(), 'iroko-supervisor-vite.log'), 'w');

  if (!is3001Open) {
    backendProc = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
      cwd: rootDir,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        IROKO_TEST_MODE: '1',
        IROKO_DATA_DIR: isolatedDataDir,
        PORT: '3001',
        AGENT_PORT: '3001',
        IROKO_PORT: '3001'
      },
      stdio: ['ignore', backendLog, backendLog]
    });
  }

  if (!is5173Open) {
    const viteBin = path.join(rootDir, 'node_modules', 'vite', 'bin', 'vite.js');
    viteProc = spawn(process.execPath, [viteBin, '--port', '5173', '--strictPort'], {
      cwd: rootDir,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        DISABLE_HMR: 'true'
      },
      stdio: ['ignore', viteLog, viteLog]
    });
  }

  const [bReady, vReady] = await Promise.all([
    waitForPort(3001),
    waitForPort(5173)
  ]);

  if (bReady && vReady) {
    if (statusFile) {
      fs.writeFileSync(statusFile, 'READY');
    }
  } else {
    if (statusFile) {
      fs.writeFileSync(statusFile, `ERROR: backend=${bReady}, vite=${vReady}`);
    }
    cleanup();
  }
}

start().catch((err) => {
  if (statusFile) {
    try { fs.writeFileSync(statusFile, `ERROR: ${err.message}`); } catch {}
  }
  cleanup();
});
