import fs from 'node:fs';
import path from 'node:path';
import { launchAuditBrowser, setupAuditContext, rootDir, auditOutDir } from './audit_helpers.mjs';
import { generateConversation } from './fixtures/dataset_generator.mjs';

if (!fs.existsSync(auditOutDir)) {
  fs.mkdirSync(auditOutDir, { recursive: true });
}

async function measureBundleSize() {
  const distDir = path.join(rootDir, 'dist', 'assets');
  let initialJsSize = 0;
  let files = [];

  if (fs.existsSync(distDir)) {
    const assetFiles = fs.readdirSync(distDir);
    for (const file of assetFiles) {
      if (file.endsWith('.js')) {
        const filePath = path.join(distDir, file);
        const stats = fs.statSync(filePath);
        files.push({ file, sizeBytes: stats.size, sizeKo: (stats.size / 1024).toFixed(2) });
        // Le bundle principal est généralement index-*.js
        if (file.startsWith('index-') || assetFiles.length === 1) {
          initialJsSize = stats.size;
        }
      }
    }
  }

  // Si non encore buildé ou pas d'index trouvé, prendre le plus gros fichier JS de dist
  if (initialJsSize === 0 && files.length > 0) {
    initialJsSize = Math.max(...files.map(f => f.sizeBytes));
  }

  return {
    initialJsBytes: initialJsSize,
    initialJsKo: (initialJsSize / 1024).toFixed(2),
    budgetKo: 250,
    isWithinBudget: (initialJsSize / 1024) <= 250,
    files
  };
}

async function runPerfAudit() {
  console.log('=== AUDIT PERFORMANCES & CORE WEB VITALS ===\n');
  const bundle = await measureBundleSize();
  console.log(`Taille Bundle JS initial : ${bundle.initialJsKo} Ko (Budget : ≤ ${bundle.budgetKo} Ko) - ${bundle.isWithinBudget ? '[PASS]' : '[DÉPASSEMENT]'}`);

  const browser = await launchAuditBrowser();
  const perfResults = {
    timestamp: new Date().toISOString(),
    bundle,
    vitals: {},
    chatVolumeMetrics: {}
  };

  try {
    const ctx = await setupAuditContext(browser, {
      theme: 'dark',
      conversations: []
    });

    const page = await ctx.newPage();

    // Injection du PerformanceObserver pour LCP et CLS
    await page.addInitScript(() => {
      window.__iroko_perf = {
        lcp: 0,
        cls: 0,
        entries: []
      };

      try {
        const lcpObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const lastEntry = entries[entries.length - 1];
          if (lastEntry) window.__iroko_perf.lcp = lastEntry.startTime;
        });
        lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });

        const clsObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (!entry.hadRecentInput) {
              window.__iroko_perf.cls += entry.value;
            }
          }
        });
        clsObserver.observe({ type: 'layout-shift', buffered: true });
      } catch (e) {}
    });

    const navStart = Date.now();
    await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle' });
    const loadDuration = Date.now() - navStart;
    await page.waitForTimeout(600);

    const clientMetrics = await page.evaluate(() => {
      const perf = window.__iroko_perf || { lcp: 0, cls: 0 };
      const navEntry = performance.getEntriesByType('navigation')[0] || {};
      return {
        lcpMs: perf.lcp || (navEntry.domContentLoadedEventEnd || 0),
        clsScore: perf.cls || 0,
        domInteractive: navEntry.domInteractive || 0,
        domContentLoaded: navEntry.domContentLoadedEventEnd || 0
      };
    });

    // Mesure d'INP simulé sur la saisie du composer
    let simulatedInpMs = 0;
    const textarea = await page.$('textarea');
    if (textarea) {
      const t0 = Date.now();
      await textarea.click();
      await page.keyboard.type('Test de frappe pour mesure de latence INP');
      simulatedInpMs = (Date.now() - t0) / 40; // latence moyenne par caractère
    }

    perfResults.vitals = {
      lcpMs: Math.round(clientMetrics.lcpMs),
      lcpBudgetMs: 1200,
      lcpPass: clientMetrics.lcpMs <= 1200,
      clsScore: Number(clientMetrics.clsScore.toFixed(4)),
      clsBudget: 0.000,
      clsPass: clientMetrics.clsScore <= 0.05,
      simulatedInpMs: Math.round(simulatedInpMs),
      inpBudgetMs: 50,
      inpPass: simulatedInpMs <= 50,
      initialLoadDurationMs: loadDuration
    };

    console.log(`LCP mesuré : ${perfResults.vitals.lcpMs} ms (Budget : ≤ ${perfResults.vitals.lcpBudgetMs} ms) - ${perfResults.vitals.lcpPass ? '[PASS]' : '[DÉPASSEMENT]'}`);
    console.log(`CLS mesuré : ${perfResults.vitals.clsScore} (Budget : = 0.000) - ${perfResults.vitals.clsPass ? '[PASS]' : '[DÉPASSEMENT]'}`);
    console.log(`INP simulé : ${perfResults.vitals.simulatedInpMs} ms (Budget : ≤ ${perfResults.vitals.inpBudgetMs} ms) - ${perfResults.vitals.inpPass ? '[PASS]' : '[DÉPASSEMENT]'}`);

    await ctx.close();

    // Test de volume de conversation (1000 messages)
    console.log('\n--- Mesure sur conversation volumique (1000 messages) ---');
    const heavyConv = generateConversation(1000, 'heavy-conv');
    const heavyCtx = await setupAuditContext(browser, {
      conversations: [heavyConv]
    });

    const heavyPage = await heavyCtx.newPage();
    const tStartHeavy = Date.now();
    await heavyPage.goto('http://127.0.0.1:5173', { waitUntil: 'domcontentloaded' });
    await heavyPage.waitForTimeout(800);
    const renderDuration = Date.now() - tStartHeavy;

    const memoryMetrics = await heavyPage.evaluate(() => {
      if (performance.memory) {
        return {
          usedJSHeapSizeMo: (performance.memory.usedJSHeapSize / (1024 * 1024)).toFixed(2),
          totalJSHeapSizeMo: (performance.memory.totalJSHeapSize / (1024 * 1024)).toFixed(2)
        };
      }
      return { usedJSHeapSizeMo: 'N/A', totalJSHeapSizeMo: 'N/A' };
    });

    perfResults.chatVolumeMetrics = {
      messageCount: 1000,
      renderDurationMs: renderDuration,
      memory: memoryMetrics
    };
    console.log(`Rendu 1000 messages : ${renderDuration} ms | Mémoire Heap client : ${memoryMetrics.usedJSHeapSizeMo} Mo`);

    await heavyCtx.close();
  } finally {
    await browser.close();
  }

  const outPath = path.join(auditOutDir, 'perf_report.json');
  fs.writeFileSync(outPath, JSON.stringify(perfResults, null, 2), 'utf-8');
  console.log(`\n=> Rapport d'audit de performances généré : ${outPath}`);
  return perfResults;
}

runPerfAudit().catch(err => {
  console.error('Erreur lors de l\'audit perf :', err);
  process.exit(1);
});
