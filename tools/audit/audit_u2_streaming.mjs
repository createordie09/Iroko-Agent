import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MockAuditProvider } from './fixtures/mock_provider.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..', '..');
const perfDir = path.join(rootDir, 'docs', 'audit', 'perf');

async function runStreamingPerfAudit() {
  console.log('=== DÉMARRAGE MISSION U2 : AUDIT DU STREAMING & RECALCULS ===\n');

  const configs = [
    { speedName: 'lent (20 tok/s)', speed: 'slow', length: 500 },
    { speedName: 'moyen (60 tok/s)', speed: 'medium', length: 5000 },
    { speedName: 'rapide (120 tok/s)', speed: 'fast', length: 20000 }
  ];

  const streamingReport = {
    timestamp: new Date().toISOString(),
    architecturalFindings: {
      markdownReparsingPerToken: true,
      codeHighlightingPerToken: true,
      autoscrollForcesReflow: true,
      autoscrollSmoothConflict: true,
      evidence: [
        'FormattedMessage (ClaudeChat.tsx:25) appelle parseMarkdownBlocks(content) à chaque token',
        'CodeBlock (CodeBlock.tsx:230) exécute renderMonochromeCode sans useMemo à chaque rendu',
        'ClaudeChat.tsx:340-347 useEffect([currentAssistantStream]) lit .scrollHeight et déclenche scrollTo({ behavior: "smooth" }) à chaque token'
      ]
    },
    scenarios: []
  };

  let browser;
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
  } catch {
    browser = await chromium.launch({ headless: true });
  }

  try {
    for (const cfg of configs) {
      console.log(`\n--- Test Streaming : Débit ${cfg.speedName} | Longueur ${cfg.length} tokens ---`);

      // Démarrage du faux fournisseur sur port dédié
      const mockProvider = new MockAuditProvider({
        speed: cfg.speed,
        length: cfg.length,
        withThinking: false
      });
      const port = await mockProvider.start();

      const ctx = await browser.newContext({
        viewport: { width: 1440, height: 900 }
      });

      await ctx.route('**/api/conversations**', route => {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ conversations: [] }) });
      });

      await ctx.route('**/api/models**', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            models: [
              { id: 'stream-perf-model', name: `Modèle ${cfg.speedName}`, provider: 'local', isAvailable: true, capabilities: { tools: true } }
            ]
          })
        });
      });

      const page = await ctx.newPage();

      // Injection de l'écouteur de Long Tasks et Long Animation Frames
      await page.addInitScript(() => {
        window.__iroko_long_tasks = [];
        window.__iroko_dom_mutations = 0;

        try {
          const obs = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              window.__iroko_long_tasks.push({
                name: entry.name,
                duration: entry.duration,
                startTime: entry.startTime
              });
            }
          });
          obs.observe({ entryTypes: ['longtask'] });
        } catch (e) {}

        const mutObs = new MutationObserver(() => {
          window.__iroko_dom_mutations++;
        });
        mutObs.observe(document.documentElement, { childList: true, subtree: true });
      });

      await page.goto('http://127.0.0.1:3001', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(400);

      // Simulation de flux
      const t0 = Date.now();
      const textarea = await page.$('textarea');
      if (textarea) {
        await textarea.fill(`Génère une réponse structurée de ${cfg.length} tokens.`);
        await page.keyboard.press('Enter');
      }

      // Observation pendant une fraction représentative du flux pour ne pas bloquer les 20 000 tokens
      const sampleDuration = Math.min(cfg.length * (cfg.speed === 'fast' ? 10 : cfg.speed === 'slow' ? 50 : 20), 4000);
      await page.waitForTimeout(sampleDuration);

      const metrics = await page.evaluate(() => {
        const domNodesCount = document.querySelectorAll('*').length;
        const longTasks = window.__iroko_long_tasks || [];
        const mutations = window.__iroko_dom_mutations || 0;
        let memoryUsedMo = 'N/A';
        if (performance.memory) {
          memoryUsedMo = (performance.memory.usedJSHeapSize / (1024 * 1024)).toFixed(2);
        }

        return {
          domNodesCount,
          longTasksCount: longTasks.length,
          longTasksTotalDurationMs: Math.round(longTasks.reduce((acc, t) => acc + t.duration, 0)),
          mutationsCount: mutations,
          memoryUsedMo
        };
      });

      const durationMs = Date.now() - t0;
      const scenarioResult = {
        config: cfg,
        actualObservationDurationMs: durationMs,
        ...metrics,
        estimatedThreadTimePerTokenMs: (metrics.longTasksTotalDurationMs / (durationMs / 50)).toFixed(2)
      };

      streamingReport.scenarios.push(scenarioResult);
      console.log(`     Nœuds DOM : ${metrics.domNodesCount} | Tâches longues (>50ms) : ${metrics.longTasksCount} (${metrics.longTasksTotalDurationMs} ms)`);
      console.log(`     Mutations DOM : ${metrics.mutationsCount} | Mémoire Heap : ${metrics.memoryUsedMo} Mo`);

      await ctx.close();
      await mockProvider.stop();
    }
  } finally {
    await browser.close();
  }

  const outPath = path.join(perfDir, 'streaming_perf_report.json');
  fs.writeFileSync(outPath, JSON.stringify(streamingReport, null, 2), 'utf-8');
  console.log(`\n=> Rapport d'audit de streaming généré avec succès : ${outPath}`);
  return streamingReport;
}

runStreamingPerfAudit().catch(err => {
  console.error('Erreur audit streaming perf :', err);
  process.exit(1);
});
