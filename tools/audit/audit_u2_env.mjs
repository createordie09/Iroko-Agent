import os from 'node:os';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..', '..');
const perfDir = path.join(rootDir, 'docs', 'audit', 'perf');

if (!fs.existsSync(perfDir)) {
  fs.mkdirSync(perfDir, { recursive: true });
}

async function getSystemAndBrowserInfo() {
  let browser;
  let browserVersion = 'Inconnu';
  let browserChannel = 'chromium';

  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    browserChannel = 'Microsoft Edge';
    browserVersion = browser.version();
  } catch {
    browser = await chromium.launch({ headless: true });
    browserChannel = 'Chromium';
    browserVersion = browser.version();
  } finally {
    if (browser) await browser.close();
  }

  const cpus = os.cpus();
  const envInfo = {
    osPlatform: os.platform(),
    osRelease: os.release(),
    osArch: os.arch(),
    totalMemoryGo: (os.totalmem() / (1024 ** 3)).toFixed(2),
    cpuModel: cpus[0]?.model || 'Inconnu',
    cpuCores: cpus.length,
    cpuSpeedMhz: cpus[0]?.speed || 0,
    nodeVersion: process.version,
    browserChannel,
    browserVersion,
    timestamp: new Date().toISOString()
  };

  fs.writeFileSync(path.join(perfDir, 'env_info.json'), JSON.stringify(envInfo, null, 2), 'utf-8');
  console.log('--- Environnement Matériel et Navigateur Détecté ---');
  console.log(`OS : ${envInfo.osPlatform} ${envInfo.osRelease} (${envInfo.osArch})`);
  console.log(`CPU : ${envInfo.cpuModel} (${envInfo.cpuCores} cœurs @ ${envInfo.cpuSpeedMhz} MHz)`);
  console.log(`RAM : ${envInfo.totalMemoryGo} Go`);
  console.log(`Navigateur : ${envInfo.browserChannel} v${envInfo.browserVersion}`);
  console.log(`Node.js : ${envInfo.nodeVersion}`);
  return envInfo;
}

getSystemAndBrowserInfo().catch(console.error);
