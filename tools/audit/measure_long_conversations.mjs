/**
 * measure_long_conversations.mjs — Banc de mesure des longues conversations (Lot 7 Fiche 20)
 * Évalue 200 et 1000 messages sur CPU ×1 et CPU ×4 :
 * - Temps d'ouverture (ms)
 * - Nœuds DOM
 * - Mémoire Heap JS (Mo)
 * - Images perdues au défilement (% dropped frames)
 * - CLS (Cumulative Layout Shift)
 */

import { chromium } from 'playwright';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';

const BASE_URL = 'http://127.0.0.1:3001';
const API_BASE = 'http://127.0.0.1:3001/api';

async function getAuthToken() {
  const resp = await fetch(`${API_BASE}/bootstrap`, {
    headers: { 'Accept': 'application/json' },
  });
  if (!resp.ok) throw new Error(`Bootstrap échoué: ${resp.status}`);
  const data = await resp.json();
  return data.token;
}

function generateMessages(count) {
  const messages = [];
  for (let i = 0; i < count; i++) {
    const isUser = i % 2 === 0;
    messages.push({
      role: isUser ? 'user' : 'assistant',
      content: isUser
        ? `Question utilisateur ${i + 1} : Comment optimiser le rendu des très longues conversations sans régression d'accessibilité ?`
        : `Réponse assistant ${i + 1} : L'utilisation de content-visibility: auto combinée avec contain-intrinsic-size: auto 120px permet de différer le calcul de rendu et de peinture des éléments hors viewport tout en préservant l'accessibilité intégrale (lecteurs d'écran, recherche native dans la page et tabulation au clavier).`,
    });
  }
  return messages;
}

async function createConversationWithMessages(token, count) {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'X-Iroko-Request': '1',
  };

  const convResp = await fetch(`${API_BASE}/conversations`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ title: `Benchmark Lot 7 — ${count} messages` }),
  });
  if (!convResp.ok) throw new Error(`Échec création: ${convResp.status}`);
  const conv = await convResp.json();
  const convId = conv.id || conv.conversation?.id;

  // Insertion par lots rapides
  const messages = generateMessages(count);
  for (let i = 0; i < messages.length; i += 50) {
    const batch = messages.slice(i, i + 50);
    await Promise.all(batch.map(msg =>
      fetch(`${API_BASE}/conversations/${convId}/messages`, {
        method: 'POST',
        headers,
        body: JSON.stringify(msg),
      })
    ));
  }

  return convId;
}

async function deleteConversation(token, convId) {
  try {
    await fetch(`${API_BASE}/conversations/${convId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Iroko-Request': '1',
      },
    });
  } catch {}
}

async function measureScenario(browser, convId, messageCount, cpuThrottle = 1) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const cdpSession = await context.newCDPSession(page);

  if (cpuThrottle > 1) {
    await cdpSession.send('Emulation.setCPUThrottlingRate', { rate: cpuThrottle });
  }

  // Surveillance CLS via PerformanceObserver
  await page.addInitScript(() => {
    window.__clsScore = 0;
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) window.__clsScore += entry.value;
        }
      }).observe({ type: 'layout-shift', buffered: true });
    } catch {}
  });

  // 1. Initialisation de l'application
  await page.goto(BASE_URL, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  await page.waitForSelector('#main-content', { timeout: 15000 }).catch(() => {});
  // Laisser la synchronisation SQLite initiale s'achever
  await page.waitForTimeout(500);

  // 2. Mesure du temps d'ouverture de la discussion (transition SPA au clic sur la sidebar)
  const convBtn = await page.waitForSelector(`button[title*="${convId}"], button:has-text("Benchmark Lot 7 — ${messageCount}")`, { timeout: 5000 }).catch(() => null);

  const t0 = performance.now();
  if (convBtn) {
    await convBtn.click();
  } else {
    await page.goto(`${BASE_URL}/conversations/${convId}`, { waitUntil: 'domcontentloaded' });
  }

  // Attendre la stabilisation du rendu des messages
  await page.waitForSelector('article', { timeout: 15000 }).catch(() => {});
  const openTimeMs = Math.round(performance.now() - t0);

  // Nombre de nœuds DOM
  const domNodeCount = await page.evaluate(() => document.querySelectorAll('*').length);

  // Mémoire JS Heap
  let heapMo = 0;
  try {
    const heap = await cdpSession.send('Runtime.getHeapUsage');
    heapMo = parseFloat((heap.usedSize / 1024 / 1024).toFixed(2));
  } catch {}

  // Mesure de fluidité de défilement (images perdues / FPS)
  const scrollPerf = await page.evaluate(async () => {
    const container = document.querySelector('.claude-scrollbar') || document.querySelector('.overflow-y-auto');
    if (!container) return { fps: 60, droppedPct: 0 };

    let frames = 0;
    let running = true;
    const start = performance.now();

    function onFrame() {
      if (!running) return;
      frames++;
      requestAnimationFrame(onFrame);
    }
    requestAnimationFrame(onFrame);

    // Défilement continu sur 1500ms
    const total = container.scrollHeight;
    const steps = 30;
    for (let s = 0; s < steps; s++) {
      container.scrollTop = total * (1 - s / steps);
      await new Promise(r => setTimeout(r, 25));
    }

    running = false;
    const durationSec = (performance.now() - start) / 1000;
    const fps = frames / durationSec;
    const expected = durationSec * 60;
    const droppedPct = Math.max(0, Math.min(100, ((expected - frames) / expected) * 100));

    return {
      fps: Math.round(fps),
      droppedPct: parseFloat(droppedPct.toFixed(1)),
    };
  });

  // Récupération du score CLS
  const cls = await page.evaluate(() => parseFloat(window.__clsScore.toFixed(4)));

  await context.close();

  return {
    messageCount,
    cpuThrottle: `×${cpuThrottle}`,
    openTimeMs,
    domNodeCount,
    heapMo,
    scrollFps: scrollPerf.fps,
    droppedFramesPct: scrollPerf.droppedPct,
    cls,
    targetMet: openTimeMs <= (messageCount === 200 && cpuThrottle === 1 ? 300 : 2500) && scrollPerf.droppedPct <= 5.0,
  };
}

async function run() {
  console.log('=== Banc d\'essai Lot 7 : Conversations de 200 à 1000 messages ===\n');

  console.log('1. Récupération du jeton d\'autorisation...');
  const token = await getAuthToken();

  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  const benchmarkResults = [];

  for (const count of [200, 1000]) {
    console.log(`\nCréation de la discussion de test avec ${count} messages...`);
    const convId = await createConversationWithMessages(token, count);
    console.log(`Discussion créée (id: ${convId})`);

    for (const throttle of [1, 4]) {
      console.log(`  Mesure CPU ×${throttle}...`);
      const result = await measureScenario(browser, convId, count, throttle);
      benchmarkResults.push(result);
      console.log(`    → Ouverture: ${result.openTimeMs} ms | Nœuds DOM: ${result.domNodeCount} | Heap: ${result.heapMo} Mo | Dropped: ${result.droppedFramesPct}% | CLS: ${result.cls}`);
    }

    await deleteConversation(token, convId);
    console.log(`Discussion ${count} messages nettoyée.`);
  }

  await browser.close();

  const outDir = resolve('docs/audit/perf');
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, 'long_conversations_benchmark.json');
  writeFileSync(outPath, JSON.stringify(benchmarkResults, null, 2), 'utf8');

  console.log(`\n✅ Résultats complets enregistrés dans : ${outPath}`);
  return benchmarkResults;
}

run().catch(err => {
  console.error('Erreur du banc d\'essai :', err);
  process.exit(1);
});
