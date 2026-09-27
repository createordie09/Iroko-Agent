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

async function waitForPort(port, timeoutMs = 40000) {
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
  try {
    const cf = path.join(os.tmpdir(), 'iroko-test-clients.json');
    if (fs.existsSync(cf)) {
      fs.unlinkSync(cf);
    }
  } catch {}
  process.exit(0);
};

const clientsFile = path.join(os.tmpdir(), 'iroko-test-clients.json');

// Arrêt automatique si tous les runners de test et clients parents meurent
const heartbeat = setInterval(() => {
  let hasLivingClient = false;

  // 1. Vérifier si des clients enregistrés sont encore vivants
  try {
    if (fs.existsSync(clientsFile)) {
      const clients = JSON.parse(fs.readFileSync(clientsFile, 'utf8'));
      if (Array.isArray(clients) && clients.length > 0) {
        const stillAlive = [];
        for (const p of clients) {
          try {
            process.kill(p, 0);
            stillAlive.push(p);
          } catch {}
        }
        if (stillAlive.length > 0) {
          hasLivingClient = true;
          try { fs.writeFileSync(clientsFile, JSON.stringify(stillAlive)); } catch {}
        }
      }
    }
  } catch {}

  // 2. Vérifier le runnerPid initial
  if (!hasLivingClient && runnerPid) {
    try {
      process.kill(runnerPid, 0);
      hasLivingClient = true;
    } catch {}
  }

  if (!hasLivingClient) {
    clearInterval(heartbeat);
    cleanup();
  }
}, 500);

// Sécurité : durée de vie maximale de 10 minutes
setTimeout(cleanup, 600000).unref();

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('exit', cleanup);

async function start() {
  const is3001Open = await isPortOpen(3001);
  const is5173Open = await isPortOpen(5173);

  if (!is3001Open) {
    const compiledServer = path.join(rootDir, 'dist-server', 'index.js');
    const serverArgs = fs.existsSync(compiledServer)
      ? [compiledServer]
      : ['--import', 'tsx', 'server/index.ts'];

    let backendErr = '';
    backendProc = spawn(process.execPath, serverArgs, {
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
      stdio: ['ignore', 'ignore', 'pipe']
    });
    backendProc.stderr?.on('data', (d) => { backendErr += d.toString(); });
    backendProc.on('exit', (code) => {
      if (code !== 0 && code !== null && statusFile) {
        try { fs.writeFileSync(statusFile, `ERROR: backend a quitté avec le code ${code} : ${backendErr.slice(0, 500)}`); } catch {}
      }
    });
  }

  if (!is5173Open) {
    const viteBin = path.join(rootDir, 'node_modules', 'vite', 'bin', 'vite.js');
    let viteErr = '';
    viteProc = spawn(process.execPath, [viteBin, '--port', '5173', '--strictPort'], {
      cwd: rootDir,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        DISABLE_HMR: 'true'
      },
      stdio: ['ignore', 'ignore', 'pipe']
    });
    viteProc.stderr?.on('data', (d) => { viteErr += d.toString(); });
    viteProc.on('exit', (code) => {
      if (code !== 0 && code !== null && statusFile) {
        try { fs.writeFileSync(statusFile, `ERROR: vite a quitté avec le code ${code} : ${viteErr.slice(0, 500)}`); } catch {}
      }
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
