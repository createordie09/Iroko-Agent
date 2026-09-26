import fs from 'node:fs';

const mode = process.argv[2];
const pidFile = process.argv[3];

if (pidFile) {
  try {
    fs.writeFileSync(pidFile, String(process.pid), 'utf8');
  } catch {}
}

if (mode === 'crash') {
  process.exit(1);
}

// Maintient le processus en vie jusqu'à terminaison par le superviseur
const interval = setInterval(() => {}, 1000);

process.on('SIGTERM', () => {
  clearInterval(interval);
  process.exit(0);
});
