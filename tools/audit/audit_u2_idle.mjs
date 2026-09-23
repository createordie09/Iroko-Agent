/**
 * audit_u2_idle.mjs — Section 6 : Repos et runtime
 * CPU à vide, latence API locale p50/p95, comportement reconnexion
 * Production : http://127.0.0.1:3001
 */

import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const BASE_URL = 'http://127.0.0.1:3001';
const API_BASE = 'http://127.0.0.1:3001/api';

async function measureIdleCPU() {
  // Mesurer la latence CPU à vide via CDP Performance
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const cdpSession = await context.newCDPSession(page);

  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 20000 });

  // Attendre stabilisation
  await page.waitForTimeout(3000);

  // Métriques CDP Performance avant
  await cdpSession.send('Performance.enable');
  const before = await cdpSession.send('Performance.getMetrics');
  
  await page.waitForTimeout(5000); // Observer 5 secondes à vide
  
  const after = await cdpSession.send('Performance.getMetrics');

  function getMetric(metrics, name) {
    return metrics.metrics.find(m => m.name === name)?.value || 0;
  }

  const taskDurationBefore = getMetric(before, 'TaskDuration');
  const taskDurationAfter = getMetric(after, 'TaskDuration');
  const scriptDurationBefore = getMetric(before, 'ScriptDuration');
  const scriptDurationAfter = getMetric(after, 'ScriptDuration');

  const taskDurationIdle5s = (taskDurationAfter - taskDurationBefore) * 1000; // en ms
  const scriptDurationIdle5s = (scriptDurationAfter - scriptDurationBefore) * 1000;

  // Compter les timers actifs et intervals
  const timersInfo = await page.evaluate(() => {
    // On ne peut pas énumérer les timers natifs directement,
    // mais on peut mesurer les long tasks pendant l'idle
    const start = performance.now();
    let tasks = 0;
    const observer = new PerformanceObserver((list) => {
      tasks += list.getEntries().length;
    });
    try { observer.observe({ type: 'longtask', buffered: false }); } catch(e) {}
    return { observed: true };
  });

  await page.waitForTimeout(3000);

  // Heap usage à vide
  let heapIdleMo = null;
  try {
    const heap = await cdpSession.send('Runtime.getHeapUsage');
    heapIdleMo = (heap.usedSize / 1024 / 1024).toFixed(2);
  } catch(e) {}

  await browser.close();

  return {
    taskDurationIdle5sSec: (taskDurationIdle5s / 1000).toFixed(3),
    scriptDurationIdle5sSec: (scriptDurationIdle5s / 1000).toFixed(3),
    cpuUtilizationEstimate_pct: ((taskDurationIdle5s / 5000) * 100).toFixed(1),
    heapIdleMo,
  };
}

async function measureApiLatency() {
  let token = null;
  try {
    const bootResp = await fetch(`${API_BASE}/bootstrap`);
    if (bootResp.ok) {
      const bootData = await bootResp.json();
      token = bootData.token;
    }
  } catch (e) {}

  const endpoints = [
    { path: '/api/conversations', method: 'GET', label: 'GET /api/conversations' },
    { path: '/api/models', method: 'GET', label: 'GET /api/models' },
    { path: '/api/providers', method: 'GET', label: 'GET /api/providers' },
  ];

  const results = [];

  for (const endpoint of endpoints) {
    const latencies = [];
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    for (let i = 0; i < 10; i++) {
      const t0 = Date.now();
      try {
        const resp = await fetch(`${BASE_URL}${endpoint.path}`, {
          method: endpoint.method,
          headers,
        });
        const dt = Date.now() - t0;
        if (resp.ok) latencies.push(dt);
      } catch (e) {
        // skip
      }
    }
    latencies.sort((a, b) => a - b);
    const p50 = latencies[Math.floor(latencies.length * 0.5)] || null;
    const p95 = latencies[Math.floor(latencies.length * 0.95)] || null;
    results.push({
      endpoint: endpoint.label,
      samples: latencies.length,
      p50,
      p95,
      min: latencies[0] || null,
      max: latencies[latencies.length - 1] || null,
    });
    console.log(`  ${endpoint.label} → p50=${p50}ms p95=${p95}ms`);
  }

  return results;
}

async function measureTimersAndPolls() {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  // Intercepter les requêtes réseau pour détecter les polls
  const networkRequests = [];
  page.on('request', req => {
    const url = req.url();
    if (url.includes('127.0.0.1')) {
      networkRequests.push({ url, method: req.method(), time: Date.now() });
    }
  });

  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(2000);

  const t0 = Date.now();
  // Observer 10 secondes à vide
  await page.waitForTimeout(10000);
  const elapsed = Date.now() - t0;

  // Filtrer les requêtes pendant l'observation (après le chargement initial)
  const observedRequests = networkRequests.filter(r => r.time > t0);

  // WebSocket info
  const wsInfo = await page.evaluate(() => {
    // Détecter si WebSocket est actif
    return {
      hasWebSocket: typeof WebSocket !== 'undefined',
      note: 'Impossible d\'énumérer les WS actifs sans monkey-patching',
    };
  });

  await browser.close();

  return {
    observationPeriodMs: elapsed,
    networkRequestsDuringIdle: observedRequests.length,
    networkRequests: observedRequests.map(r => ({
      url: r.url.replace(BASE_URL, ''),
      method: r.method,
    })),
    pollsPerMinute: Math.round(observedRequests.length / (elapsed / 60000)),
    webSocketInfo: wsInfo,
  };
}

async function run() {
  console.log('=== Audit U2 — Section 6 : Repos et runtime ===\n');

  // 1. CPU à vide
  console.log('1. CPU à vide (5 secondes d\'observation)...');
  let idleCPU = null;
  try {
    idleCPU = await measureIdleCPU();
    console.log(`   TaskDuration idle 5s: ${idleCPU.taskDurationIdle5sSec}s`);
    console.log(`   ScriptDuration idle 5s: ${idleCPU.scriptDurationIdle5sSec}s`);
    console.log(`   CPU utilisation estimée: ${idleCPU.cpuUtilizationEstimate_pct}%`);
    console.log(`   Heap à vide: ${idleCPU.heapIdleMo} Mo`);
  } catch (e) {
    console.log(`   ERREUR: ${e.message}`);
    idleCPU = { error: e.message };
  }

  // 2. Latence API
  console.log('\n2. Latence API locale (10 appels par endpoint)...');
  let apiLatency = null;
  try {
    apiLatency = await measureApiLatency();
  } catch (e) {
    console.log(`   ERREUR: ${e.message}`);
    apiLatency = [{ error: e.message }];
  }

  // 3. Timers et polls
  console.log('\n3. Timers et requêtes réseau à vide (10 secondes)...');
  let timers = null;
  try {
    timers = await measureTimersAndPolls();
    console.log(`   Requêtes réseau pendant l'idle: ${timers.networkRequestsDuringIdle}`);
    console.log(`   Polls par minute estimés: ${timers.pollsPerMinute}`);
    if (timers.networkRequests.length > 0) {
      timers.networkRequests.forEach(r => console.log(`   → ${r.method} ${r.url}`));
    }
  } catch (e) {
    console.log(`   ERREUR: ${e.message}`);
    timers = { error: e.message };
  }

  const report = {
    timestamp: new Date().toISOString(),
    idleCPU,
    apiLatency,
    timersAndPolls: timers,
    reconnectionBehavior: {
      note: 'La reconnexion WebSocket ne peut pas être testée automatiquement sans interrompre le serveur. Comportement observable manuellement via DevTools Network.',
      serverFile: 'server/index.ts — chercher logique reconnexion SSE/WS',
    }
  };

  writeFileSync('docs/audit/perf/idle_report.json', JSON.stringify(report, null, 2));
  console.log('\n✅ Rapport enregistré : docs/audit/perf/idle_report.json');
}

run().catch(err => { console.error('ERREUR:', err); process.exit(1); });
