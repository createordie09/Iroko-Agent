/**
 * audit_u2_load.mjs — Section 4 : Chargement à froid
 * Mesure LCP, CLS, TBT via PerformanceObserver + CDP
 * Analyse bundle dist/assets/
 * Vérifie polices, font-display, CSS
 * Production : http://127.0.0.1:3001
 */

import { chromium } from 'playwright';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { resolve, join } from 'path';

const BASE_URL = 'http://127.0.0.1:3001';
const DIST_ASSETS = resolve('dist/assets');
const RUNS = 5;

async function measureLoadMetrics(browser, cpuThrottle = 1) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

  const cdpSession = await page.context().newCDPSession(page);

  // Throttling CPU
  if (cpuThrottle > 1) {
    await cdpSession.send('Emulation.setCPUThrottlingRate', { rate: cpuThrottle });
  }

  // Collecter les métriques web vitals via PerformanceObserver
  await page.addInitScript(() => {
    window.__perfMetrics = { lcp: null, cls: 0, fcp: null, tbt: 0 };

    // LCP
    try {
      new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const last = entries[entries.length - 1];
        if (last) window.__perfMetrics.lcp = last.startTime;
      }).observe({ type: 'largest-contentful-paint', buffered: true });
    } catch (e) {}

    // CLS
    try {
      let clsValue = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) clsValue += entry.value;
        }
        window.__perfMetrics.cls = clsValue;
      }).observe({ type: 'layout-shift', buffered: true });
    } catch (e) {}

    // FCP
    try {
      new PerformanceObserver((list) => {
        const entry = list.getEntriesByName('first-contentful-paint')[0];
        if (entry) window.__perfMetrics.fcp = entry.startTime;
      }).observe({ type: 'paint', buffered: true });
    } catch (e) {}

    // TBT : somme des tâches longues (blocking time = durée - 50ms)
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const blockingTime = entry.duration - 50;
          if (blockingTime > 0) window.__perfMetrics.tbt += blockingTime;
        }
      }).observe({ type: 'longtask', buffered: true });
    } catch (e) {}
  });

  const t0 = Date.now();
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
  const navTime = Date.now() - t0;

  // Attendre que LCP se stabilise
  await page.waitForTimeout(2000);

  const metrics = await page.evaluate(() => window.__perfMetrics);

  // Timing navigation API
  const navTiming = await page.evaluate(() => {
    const [entry] = performance.getEntriesByType('navigation');
    if (!entry) return null;
    return {
      domContentLoaded: entry.domContentLoadedEventEnd,
      loadEvent: entry.loadEventEnd,
      ttfb: entry.responseStart - entry.requestStart,
    };
  });

  // JS Heap memory
  let jsHeapMo = null;
  try {
    const heapInfo = await cdpSession.send('Runtime.getHeapUsage');
    jsHeapMo = (heapInfo.usedSize / 1024 / 1024).toFixed(2);
  } catch (e) {}

  // Compter les nœuds DOM
  const domNodeCount = await page.evaluate(() => document.querySelectorAll('*').length);

  await context.close();

  return {
    cpuThrottle,
    navTime,
    lcp: metrics.lcp ? Math.round(metrics.lcp) : null,
    fcp: metrics.fcp ? Math.round(metrics.fcp) : null,
    cls: parseFloat((metrics.cls || 0).toFixed(4)),
    tbt: Math.round(metrics.tbt || 0),
    domContentLoaded: navTiming ? Math.round(navTiming.domContentLoaded) : null,
    loadEvent: navTiming ? Math.round(navTiming.loadEvent) : null,
    ttfb: navTiming ? Math.round(navTiming.ttfb) : null,
    jsHeapMo: jsHeapMo,
    domNodeCount,
  };
}

function analyzeBundleAssets() {
  const results = [];
  let jsTotal = 0, cssTotal = 0, fontTotal = 0, imageTotal = 0, otherTotal = 0;

  try {
    const files = readdirSync(DIST_ASSETS);
    for (const f of files) {
      const fp = join(DIST_ASSETS, f);
      const size = statSync(fp).size;
      const ext = f.split('.').pop().toLowerCase();
      const entry = { file: f, sizeBytes: size, sizeKo: (size / 1024).toFixed(1) };

      if (ext === 'js') { jsTotal += size; entry.type = 'JS'; }
      else if (ext === 'css') { cssTotal += size; entry.type = 'CSS'; }
      else if (['woff', 'woff2', 'ttf', 'otf'].includes(ext)) { fontTotal += size; entry.type = 'FONT'; }
      else if (['png', 'jpg', 'jpeg', 'svg', 'ico', 'webp'].includes(ext)) { imageTotal += size; entry.type = 'IMAGE'; }
      else { otherTotal += size; entry.type = 'OTHER'; }

      results.push(entry);
    }
  } catch (e) {
    return { error: e.message };
  }

  results.sort((a, b) => b.sizeBytes - a.sizeBytes);

  return {
    files: results,
    totalJs_Ko: (jsTotal / 1024).toFixed(1),
    totalCss_Ko: (cssTotal / 1024).toFixed(1),
    totalFonts_Ko: (fontTotal / 1024).toFixed(1),
    totalImages_Ko: (imageTotal / 1024).toFixed(1),
    totalOther_Ko: (otherTotal / 1024).toFixed(1),
    totalAll_Ko: ((jsTotal + cssTotal + fontTotal + imageTotal + otherTotal) / 1024).toFixed(1),
    budgetJs_Ko: 250,
    budgetExceeded: (jsTotal / 1024) > 250,
    budgetExceededBy_Ko: ((jsTotal / 1024) - 250).toFixed(1),
  };
}

function analyzeFontDisplay() {
  const cssPath = join(DIST_ASSETS, readdirSync(DIST_ASSETS).find(f => f.endsWith('.css')) || '');
  try {
    const css = readFileSync(cssPath, 'utf8');
    const fontFaceBlocks = [...css.matchAll(/@font-face\s*\{([^}]+)\}/g)].map(m => m[1]);
    const results = fontFaceBlocks.map(block => {
      const family = (block.match(/font-family:\s*([^;]+)/) || [])[1]?.trim();
      const display = (block.match(/font-display:\s*([^;]+)/) || [])[1]?.trim() || 'auto (non spécifié)';
      const src = block.includes('woff2') ? 'local woff2' : block.includes('woff') ? 'local woff' : 'non-local';
      return { family, display, src };
    });
    return {
      fontFaceCount: results.length,
      fonts: results,
      hasSwap: results.some(f => f.display === 'swap'),
      hasBlock: results.some(f => f.display === 'block'),
      hasAuto: results.some(f => f.display.includes('auto')),
    };
  } catch (e) {
    return { error: e.message };
  }
}

function checkLazyLoading() {
  // Vérifier si la modale paramètres est chargée en dynamique (import() dans le bundle)
  try {
    const jsFile = readdirSync(DIST_ASSETS).find(f => f.endsWith('.js') && f.startsWith('index'));
    if (!jsFile) return { error: 'Pas de fichier JS index trouvé' };
    const js = readFileSync(join(DIST_ASSETS, jsFile), 'utf8');

    // Recherche de chunks dynamiques (import() crée des __vitePreload ou des dynamic chunks)
    const dynamicChunks = js.match(/import\s*\([^)]+\)/g) || [];
    const hasDynamicModal = js.includes('ClaudeSettingsModal') && dynamicChunks.length > 0;

    // Chercher si ClaudeSettingsModal est dans le bundle initial ou séparé
    const settingsInBundle = js.includes('ClaudeSettingsModal');
    const syntaxHighlightLibs = ['highlight.js', 'shiki', 'prism', 'hljs'].filter(lib => js.toLowerCase().includes(lib));

    return {
      dynamicImportsCount: dynamicChunks.length,
      settingsModalInInitialBundle: settingsInBundle,
      syntaxHighlightLibsDetected: syntaxHighlightLibs,
      note: settingsInBundle ? 'La modale Paramètres est dans le bundle initial (pas de lazy loading)' : 'La modale Paramètres est chargée séparément (lazy)',
    };
  } catch (e) {
    return { error: e.message };
  }
}

async function run() {
  console.log('=== Audit U2 — Section 4 : Chargement à froid ===\n');

  // 1. Analyse bundle
  console.log('1. Analyse des assets dist/...');
  const bundle = analyzeBundleAssets();
  console.log(`   JS total: ${bundle.totalJs_Ko} Ko (budget: ${bundle.budgetJs_Ko} Ko, dépassé: ${bundle.budgetExceeded ? 'OUI +' + bundle.budgetExceededBy_Ko + ' Ko' : 'NON'})`);
  console.log(`   CSS total: ${bundle.totalCss_Ko} Ko`);
  console.log(`   Polices total: ${bundle.totalFonts_Ko} Ko`);

  // 2. Polices
  console.log('\n2. Analyse font-display...');
  const fonts = analyzeFontDisplay();
  console.log(`   ${fonts.fontFaceCount ?? 0} @font-face trouvés`);
  if (fonts.fonts) fonts.fonts.forEach(f => console.log(`   → ${f.family}: font-display: ${f.display} (${f.src})`));

  // 3. Lazy loading
  console.log('\n3. Vérification lazy loading...');
  const lazy = checkLazyLoading();
  console.log(`   ${lazy.note || lazy.error}`);
  console.log(`   Librairies coloration syntaxique détectées: ${lazy.syntaxHighlightLibsDetected?.join(', ') || 'aucune standard'}`);

  // 4. Mesures Playwright — CPU 1x
  console.log('\n4. Mesures chargement à froid (CPU 1x)...');
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  const runs1x = [];
  for (let i = 0; i < RUNS; i++) {
    process.stdout.write(`   run ${i+1}/${RUNS}...`);
    const r = await measureLoadMetrics(browser, 1);
    runs1x.push(r);
    console.log(` LCP=${r.lcp}ms FCP=${r.fcp}ms CLS=${r.cls} TBT=${r.tbt}ms TTFB=${r.ttfb}ms`);
  }

  // 5. Mesures Playwright — CPU 4x
  console.log('\n5. Mesures chargement à froid (CPU 4x)...');
  const runs4x = [];
  for (let i = 0; i < RUNS; i++) {
    process.stdout.write(`   run ${i+1}/${RUNS}...`);
    const r = await measureLoadMetrics(browser, 4);
    runs4x.push(r);
    console.log(` LCP=${r.lcp}ms FCP=${r.fcp}ms CLS=${r.cls} TBT=${r.tbt}ms TTFB=${r.ttfb}ms`);
  }

  await browser.close();

  function stats(arr, key) {
    const vals = arr.map(r => r[key]).filter(v => v !== null).sort((a, b) => a - b);
    if (!vals.length) return { p50: null, p75: null, min: null, max: null };
    const p50 = vals[Math.floor(vals.length * 0.5)];
    const p75 = vals[Math.floor(vals.length * 0.75)];
    return { p50, p75, min: vals[0], max: vals[vals.length - 1] };
  }

  const report = {
    timestamp: new Date().toISOString(),
    bundle,
    fonts,
    lazyLoading: lazy,
    measurements: {
      cpu1x: {
        runs: runs1x,
        stats: {
          lcp: stats(runs1x, 'lcp'),
          fcp: stats(runs1x, 'fcp'),
          cls: stats(runs1x, 'cls'),
          tbt: stats(runs1x, 'tbt'),
          ttfb: stats(runs1x, 'ttfb'),
          domNodeCount: stats(runs1x, 'domNodeCount'),
        }
      },
      cpu4x: {
        runs: runs4x,
        stats: {
          lcp: stats(runs4x, 'lcp'),
          fcp: stats(runs4x, 'fcp'),
          cls: stats(runs4x, 'cls'),
          tbt: stats(runs4x, 'tbt'),
          ttfb: stats(runs4x, 'ttfb'),
        }
      }
    }
  };

  writeFileSync('docs/audit/perf/load_report.json', JSON.stringify(report, null, 2));
  console.log('\n✅ Rapport enregistré : docs/audit/perf/load_report.json');

  console.log('\n=== Résumé ===');
  console.log(`LCP CPU1x p50: ${report.measurements.cpu1x.stats.lcp.p50}ms (seuil bon: ≤2500ms)`);
  console.log(`LCP CPU4x p50: ${report.measurements.cpu4x.stats.lcp.p50}ms`);
  console.log(`CLS CPU1x p50: ${report.measurements.cpu1x.stats.cls.p50} (seuil: ≤0.1)`);
  console.log(`TBT CPU1x p50: ${report.measurements.cpu1x.stats.tbt.p50}ms (seuil bon: ≤200ms)`);
  console.log(`TBT CPU4x p50: ${report.measurements.cpu4x.stats.tbt.p50}ms`);
}

run().catch(err => { console.error('ERREUR:', err); process.exit(1); });
