/**
 * tools/audit/benchmark_r5c_leak_scenario.mjs
 * 
 * Mission R5c : Détection et mesure des fuites mémoire sur une session prolongée.
 * Scénario automatisé : 50 conversations consécutives avec échanges de messages réels
 * (via le fournisseur hors-ligne Mock déterministe) sans redémarrer le processus.
 * 
 * Mesure par points d'étape (toutes les 5 conversations) :
 * - Frontend : Heap JS utilisé (Mo) après GC forcé via CDP (HeapProfiler.collectGarbage)
 * - Frontend : Nœuds DOM totaux
 * - Runtime : Heap JS utilisé (Mo) et RSS (Mo) via /api/system/memory
 */

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '../..');

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3001';
const API_BASE = `${BASE_URL}/api`;
const TOTAL_CONVERSATIONS = parseInt(process.env.CONVERSATIONS_COUNT || '50', 10);
const MEASURE_INTERVAL = 5; // Mesure tous les 5 cycles
const OUTPUT_FILE = process.env.OUTPUT_FILE || 'benchmark_r5c_data.json';

async function getAuthToken() {
  const resp = await fetch(`${API_BASE}/bootstrap`, {
    headers: { 'Host': '127.0.0.1:3001', 'Accept': 'application/json' },
  });
  if (!resp.ok) throw new Error(`Bootstrap échoué: ${resp.status}`);
  const data = await resp.json();
  return data.token;
}

async function getRuntimeMemory(token) {
  try {
    const res = await fetch(`${API_BASE}/system/memory`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Host': '127.0.0.1:3001'
      }
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('[Benchmark] Erreur lecture métriques runtime :', err.message);
  }
  return null;
}

async function runScenario() {
  console.log(`\n===============================================================`);
  console.log(`🚀 MISSION R5c : Scénario 50 conversations consécutives`);
  console.log(`📡 URL Cible : ${BASE_URL}`);
  console.log(`🔄 Nombre de cycles : ${TOTAL_CONVERSATIONS}`);
  console.log(`===============================================================\n`);

  const token = await getAuthToken();
  console.log(`🔑 Jeton d'authentification obtenu.`);

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--enable-precise-memory-info',
      '--js-flags=--expose-gc',
      '--disable-background-timer-throttling'
    ]
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1
  });

  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);

  // Charger l'application
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('#main-content', { timeout: 15000 });
  await page.waitForTimeout(1000);

  const points = [];

  // Fonction de prise de mesure stabilisée
  async function takeMeasurement(cycleNum) {
    // 1. Déclencher un Garbage Collection forcé via CDP pour mesurer la mémoire résiduelle réelle
    try {
      await cdp.send('HeapProfiler.collectGarbage');
    } catch {}
    await page.waitForTimeout(250);

    // 2. Mesure Frontend
    const heap = await cdp.send('Runtime.getHeapUsage');
    const frontHeapMb = parseFloat((heap.usedSize / 1024 / 1024).toFixed(2));
    const domNodes = await page.evaluate(() => document.querySelectorAll('*').length);

    // 3. Mesure Runtime
    const runtimeMem = await getRuntimeMemory(token);

    const record = {
      iteration: cycleNum,
      timestamp: Date.now(),
      frontHeapMb,
      domNodes,
      runtimeRssMb: runtimeMem ? runtimeMem.rssMb : null,
      runtimeHeapUsedMb: runtimeMem ? runtimeMem.heapUsedMb : null
    };

    points.push(record);
    console.log(`📊 [Cycle ${String(cycleNum).padStart(2, ' ')}/${TOTAL_CONVERSATIONS}] Front Heap: ${frontHeapMb} Mo | DOM: ${domNodes} | Runtime Heap: ${record.runtimeHeapUsedMb} Mo | RSS: ${record.runtimeRssMb} Mo`);
    return record;
  }

  // Mesure initiale à 0 conversation
  console.log(`--- Mesure Initiale (T=0) ---`);
  await takeMeasurement(0);

  for (let k = 1; k <= TOTAL_CONVERSATIONS; k++) {
    // 1. Envoyer le 1er message depuis l'accueil ou le chat
    const composerTextarea = await page.waitForSelector('textarea:not([disabled])', { timeout: 15000 });
    const prompt1 = `Discussion ${k} : Demande initiale de calcul matriciel pour optimisation locale.`;
    await composerTextarea.fill(prompt1);

    const sendBtn1 = await page.waitForSelector('button[aria-label="Envoyer le message"]:not([disabled])', { timeout: 5000 });
    await sendBtn1.click();

    // Attendre que la réponse assistant arrive et que le statut repasse au repos
    await page.waitForFunction(
      () => {
        const composer = document.querySelector('textarea');
        const stopBtn = document.querySelector('button[aria-label="Arrêter la génération"]');
        const hasAssistant = Array.from(document.querySelectorAll('article h3')).some(h => h.textContent.includes('Iroko a dit'));
        return !stopBtn && composer !== null && !composer.disabled && hasAssistant;
      },
      null,
      { timeout: 20000 }
    );
    await page.waitForTimeout(150);

    // 2. Envoyer un 2ème message dans la même conversation
    const textarea2 = await page.waitForSelector('textarea:not([disabled])', { timeout: 15000 });
    const prompt2 = `Discussion ${k} : Précision sur les métriques de performance et gestion de la mémoire vive.`;
    await textarea2.fill(prompt2);

    const sendBtn2 = await page.waitForSelector('button[aria-label="Envoyer le message"]:not([disabled])', { timeout: 5000 });
    await sendBtn2.click();

    await page.waitForFunction(
      () => {
        const composer = document.querySelector('textarea');
        const stopBtn = document.querySelector('button[aria-label="Arrêter la génération"]');
        const assistantArticles = Array.from(document.querySelectorAll('article h3')).filter(h => h.textContent.includes('Iroko a dit'));
        return !stopBtn && composer !== null && !composer.disabled && assistantArticles.length >= 2;
      },
      null,
      { timeout: 20000 }
    );
    await page.waitForTimeout(150);

    // 3. Fermer la discussion en cliquant sur "+ Nouveau"
    const newChatBtn = await page.waitForSelector('button:has-text("Nouveau"), button[aria-label="Nouvelle discussion"]', { timeout: 5000 });
    await newChatBtn.click();

    // Attendre retour sur l'accueil (ClaudeHero)
    await page.waitForSelector('h1:has-text("Iroko Agent"), textarea:not([disabled])', { timeout: 10000 });
    await page.waitForTimeout(100);

    // Prise de mesure à intervalle régulier
    if (k % MEASURE_INTERVAL === 0 || k === TOTAL_CONVERSATIONS) {
      await takeMeasurement(k);
    }
  }

  await browser.close();

  // Enregistrer les données brutes
  const auditDir = resolve(rootDir, 'docs', 'audit');
  if (!existsSync(auditDir)) {
    mkdirSync(auditDir, { recursive: true });
  }

  const outputPath = resolve(auditDir, OUTPUT_FILE);
  writeFileSync(outputPath, JSON.stringify(points, null, 2), 'utf-8');
  console.log(`\n✅ Mesures enregistrées dans : ${outputPath}`);

  // Calcul des variations et pente
  const pStart = points[0];
  const pEnd = points[points.length - 1];
  const frontGrowth = pEnd.frontHeapMb - pStart.frontHeapMb;
  const runtimeGrowth = (pEnd.runtimeHeapUsedMb || 0) - (pStart.runtimeHeapUsedMb || 0);

  console.log(`\n--- Résumé de la session de 50 conversations ---`);
  console.log(`• Front Heap initial : ${pStart.frontHeapMb} Mo -> Final : ${pEnd.frontHeapMb} Mo (Delta : ${frontGrowth > 0 ? '+' : ''}${frontGrowth.toFixed(2)} Mo)`);
  console.log(`• Runtime Heap initial : ${pStart.runtimeHeapUsedMb} Mo -> Final : ${pEnd.runtimeHeapUsedMb} Mo (Delta : ${runtimeGrowth > 0 ? '+' : ''}${runtimeGrowth.toFixed(2)} Mo)`);
  console.log(`• Nœuds DOM : ${pStart.domNodes} -> ${pEnd.domNodes} (Delta : ${pEnd.domNodes - pStart.domNodes})`);

  return points;
}

runScenario().catch(err => {
  console.error('\n❌ Échec du benchmark R5c :', err);
  process.exit(1);
});
