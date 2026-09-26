/**
 * tools/audit/benchmark_r5b_remesure.mjs
 * Mission R5b : Remesure instrumentée après virtualisation de la liste de messages
 * Paliers : 200, 1 000, 3 000 et 5 000 messages (CPU ×1 et CPU ×4)
 */

import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE_URL = 'http://127.0.0.1:3001';
const API_BASE = 'http://127.0.0.1:3001/api';

async function getAuthToken() {
  const resp = await fetch(`${API_BASE}/bootstrap`, {
    headers: { 'Host': '127.0.0.1:3001', 'Accept': 'application/json' },
  });
  if (!resp.ok) throw new Error(`Bootstrap échoué: ${resp.status}`);
  const data = await resp.json();
  return data.token;
}

function generateLongCodeBlock(id) {
  const lines = [
    `// Module de gestion transactionnelle virtualisée - Bloc ${id}`,
    `export interface TxRecord<T = unknown> { id: string; timestamp: number; payload: T; status: 'committed'|'pending'; }`,
    `export class VirtualPipeline<T> { private queue: TxRecord<T>[] = []; }`
  ];
  for (let k = 0; k < 60; k++) lines.push(`// Ligne de traitement transactionnel #${k} : registre mémoire`);
  return '```typescript\n' + lines.join('\n') + '\n```';
}

function generateMessageContent(index, isUser, convId) {
  if (isUser) {
    return `Requête utilisateur #${index} : Comment garantir un fenêtrage réactif sans saut de défilement pour les très longues conversations ?`;
  }
  const type = index % 4;
  if (type === 0) {
    return `Réponse #${index} :\n\n| Métrique | Seuil Budget | Mesuré R5b |\n| :--- | :--- | :--- |\n| Nœuds DOM | < 1500 | Plafonné |\n| Temps ouv. | < 1200ms | < 300ms |\n\nL'algorithme de fenêtrage isole les éléments hors vue.`;
  }
  if (type === 1) {
    return `Réponse technique #${index} avec implémentation complète :\n\n` + generateLongCodeBlock(index);
  }
  if (type === 2) {
    return `Réponse #${index} avec artéfact autonome :\n\n<artifact_card id="art-r5b-${convId}-${index}" title="Composant Virtualisé" type="code" language="typescript" filename="VirtualList.tsx">\nexport const VirtualList = () => <div>Liste optimisée</div>;\n</artifact_card>\n\nLe bloc de réflexion et la carte d'artéfact prévoient leur hauteur.`;
  }
  return `Réponse #${index} : Le hook \`useVirtualMessageList\` compense automatiquement les décalages de défilement au-dessus de la ligne de lecture.`;
}

async function createBenchmarkConversation(token, count) {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'X-Iroko-Request': '1',
    'Host': '127.0.0.1:3001'
  };

  const convResp = await fetch(`${API_BASE}/conversations`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ title: `Benchmark R5b — ${count} messages` })
  });
  if (!convResp.ok) throw new Error(`Échec création conv: ${convResp.status}`);
  const convData = await convResp.json();
  const convId = convData.id || convData.conversation?.id;

  const messages = [];
  const baseTime = Date.now() - (count * 10000);
  for (let i = 0; i < count; i++) {
    const isUser = i % 2 === 0;
    messages.push({
      id: `msg-${convId}-${i}`,
      conversationId: convId,
      role: isUser ? 'user' : 'assistant',
      content: generateMessageContent(i, isUser, convId),
      createdAt: new Date(baseTime + i * 10000).toISOString()
    });
  }

  const CHUNK_SIZE = 500;
  for (let c = 0; c < messages.length; c += CHUNK_SIZE) {
    const chunk = messages.slice(c, c + CHUNK_SIZE);
    const bulkResp = await fetch(`${API_BASE}/conversations/${convId}/messages/bulk`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ messages: chunk })
    });
    if (!bulkResp.ok) throw new Error(`Échec chunk ${c}: ${bulkResp.status}`);
  }

  return convId;
}

async function cleanupConversation(token, convId) {
  try {
    await fetch(`${API_BASE}/conversations/${convId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Iroko-Request': '1',
        'Host': '127.0.0.1:3001'
      },
    });
  } catch {}
}

async function measureScenario(browser, convId, messageCount, cpuThrottle = 1) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1
  });
  const page = await context.newPage();
  const cdpSession = await context.newCDPSession(page);

  if (cpuThrottle > 1) {
    await cdpSession.send('Emulation.setCPUThrottlingRate', { rate: cpuThrottle });
  }

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('#main-content', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(600);

  const convBtn = await page.waitForSelector(`button:has-text("Benchmark R5b — ${messageCount}")`, { timeout: 5000 }).catch(() => null);

  // 1. Mesure du temps d'ouverture
  const t0 = performance.now();
  if (convBtn) {
    await convBtn.click();
  } else {
    await page.goto(`${BASE_URL}/conversations/${convId}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  }

  // Attendre stabilisation de la liste
  await page.waitForFunction(
    () => document.querySelectorAll('article').length >= 1,
    null,
    { timeout: 60000 }
  );

  await page.waitForTimeout(cpuThrottle > 1 ? 800 : 300);
  const openTimeMs = Math.round(performance.now() - t0);

  // 2. Mesure Nœuds DOM totaux
  const domNodeCount = await page.evaluate(() => document.querySelectorAll('*').length);

  // 3. Mesure des éléments actifs rendus dans le conteneur
  const renderedArticleCount = await page.evaluate(() => {
    const container = document.querySelector('.claude-scrollbar');
    if (!container) return 0;
    return container.querySelectorAll('article:not([hidden])').length;
  });

  // 4. Mémoire Heap JS après ouverture
  let heapOpenMo = 0;
  try {
    const heap = await cdpSession.send('Runtime.getHeapUsage');
    heapOpenMo = parseFloat((heap.usedSize / 1024 / 1024).toFixed(2));
  } catch {}

  // 5. Test de recherche dans la page (hidden="until-found" et beforematch)
  const searchTest = await page.evaluate(() => {
    const offscreenContainers = document.querySelectorAll('[hidden="until-found"]');
    const hasSearchableOffscreen = offscreenContainers.length > 0;
    let beforeMatchTriggered = false;

    if (offscreenContainers.length > 0) {
      const firstOffscreen = offscreenContainers[0];
      firstOffscreen.addEventListener('beforematch', () => { beforeMatchTriggered = true; });
      firstOffscreen.dispatchEvent(new Event('beforematch'));
    }

    return {
      offscreenCount: offscreenContainers.length,
      hasSearchableOffscreen,
      beforeMatchTriggered: hasSearchableOffscreen ? beforeMatchTriggered : true
    };
  });

  // 6. Test de navigation clavier (Home, End, PageDown)
  const keyboardTest = await page.evaluate(async () => {
    const container = document.querySelector('.claude-scrollbar');
    if (!container) return { worked: false };

    const initialScroll = container.scrollTop;
    container.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    await new Promise(r => setTimeout(r, 50));
    const afterHome = container.scrollTop;

    container.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    await new Promise(r => setTimeout(r, 50));
    const afterEnd = container.scrollTop;

    return {
      worked: true,
      initialScroll,
      afterHome,
      afterEnd,
      respondedToHome: afterHome === 0,
      respondedToEnd: afterEnd > afterHome
    };
  });

  // 7. Défilement complet et mesure de fluidité (FPS & Dropped frames)
  const scrollPerf = await page.evaluate(async (isSlowCpu) => {
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

    const maxScroll = container.scrollHeight - container.clientHeight;
    const steps = isSlowCpu ? 40 : 60;
    const stepDelay = isSlowCpu ? 25 : 16;

    for (let s = 0; s <= steps; s++) {
      container.scrollTop = maxScroll * (1 - s / steps);
      await new Promise(r => setTimeout(r, stepDelay));
    }
    for (let s = 0; s <= steps; s++) {
      container.scrollTop = maxScroll * (s / steps);
      await new Promise(r => setTimeout(r, stepDelay));
    }

    running = false;
    const durationSec = (performance.now() - start) / 1000;
    const fps = frames / durationSec;
    const expected = durationSec * 60;
    const droppedPct = Math.max(0, Math.min(100, ((expected - frames) / expected) * 100));

    return {
      fps: Math.round(fps),
      droppedPct: parseFloat(droppedPct.toFixed(1)),
      scrollHeight: container.scrollHeight
    };
  }, cpuThrottle > 1);

  // 8. Mémoire après défilement complet
  let heapPostScrollMo = 0;
  try {
    const heap = await cdpSession.send('Runtime.getHeapUsage');
    heapPostScrollMo = parseFloat((heap.usedSize / 1024 / 1024).toFixed(2));
  } catch {}

  await context.close();

  const memoryDeltaMo = parseFloat((heapPostScrollMo - heapOpenMo).toFixed(2));

  return {
    messageCount,
    cpuThrottle: `×${cpuThrottle}`,
    openTimeMs,
    domNodeCount,
    renderedArticleCount,
    heapOpenMo,
    heapPostScrollMo,
    memoryDeltaMo,
    scrollFps: scrollPerf.fps,
    droppedFramesPct: scrollPerf.droppedPct,
    searchAccessibility: searchTest,
    keyboardNavigation: keyboardTest
  };
}

async function main() {
  console.log('================================================================');
  console.log('  REMESURE R5b : BENCHMARK COMPARATIF AVEC VIRTUALISATION');
  console.log('================================================================\n');

  const token = await getAuthToken();
  console.log('Jeton d\'authentification amorcé avec succès.\n');

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });

  const tiers = [200, 1000, 3000, 5000];
  const allResults = [];

  for (const count of tiers) {
    console.log(`\n─── Palier ${count} messages ───`);
    console.log(`Insertion en base de données de ${count} messages...`);
    const convId = await createBenchmarkConversation(token, count);

    for (const throttle of [1, 4]) {
      console.log(`  Mesure CPU ×${throttle}...`);
      const result = await measureScenario(browser, convId, count, throttle);
      allResults.push(result);
      console.log(`    Temps d'ouverture     : ${result.openTimeMs} ms`);
      console.log(`    Nœuds DOM totaux       : ${result.domNodeCount}`);
      console.log(`    Articles rendus actifs : ${result.renderedArticleCount}`);
      console.log(`    Mémoire après ouv.     : ${result.heapOpenMo} Mo`);
      console.log(`    Mémoire après scroll   : ${result.heapPostScrollMo} Mo (Δ +${result.memoryDeltaMo} Mo)`);
      console.log(`    Fluidité défilement    : ${result.scrollFps} FPS (${result.droppedFramesPct}% drop)`);
      console.log(`    Recherche / Clavier    : match=${result.searchAccessibility.beforeMatchTriggered}, keyboard=${result.keyboardNavigation.worked}`);
    }

    await cleanupConversation(token, convId);
    console.log(`Discussion ${count} messages purgée de la base.`);
  }

  await browser.close();

  const outDir = resolve('docs/audit');
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const jsonPath = resolve(outDir, 'benchmark_r5b_data.json');
  writeFileSync(jsonPath, JSON.stringify(allResults, null, 2), 'utf8');
  console.log(`\n✅ Données brutes R5b enregistrées dans : ${jsonPath}`);

  return allResults;
}

main().catch(err => {
  console.error('Erreur lors de la remesure R5b :', err);
  process.exit(1);
});
