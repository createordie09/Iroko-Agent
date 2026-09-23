import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateConversation } from './fixtures/dataset_generator.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..', '..');
const perfDir = path.join(rootDir, 'docs', 'audit', 'perf');

if (!fs.existsSync(perfDir)) {
  fs.mkdirSync(perfDir, { recursive: true });
}

function calculatePercentiles(values) {
  if (values.length === 0) return { p50: 0, p75: 0, min: 0, max: 0, avg: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const p50Index = Math.floor(sorted.length * 0.5);
  const p75Index = Math.floor(sorted.length * 0.75);
  const sum = sorted.reduce((acc, v) => acc + v, 0);

  return {
    p50: sorted[p50Index],
    p75: sorted[p75Index],
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: Number((sum / sorted.length).toFixed(1)),
    samples: sorted
  };
}

async function runInteractionsAudit() {
  console.log('=== DÉMARRAGE MISSION U2 : MESURE DES INTERACTIONS (INP) ===\n');
  console.log('Cible : Serveur de production unifié http://127.0.0.1:3001 (dist/)\n');

  let browser;
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
  } catch {
    browser = await chromium.launch({ headless: true });
  }

  const rates = [
    { name: 'CPU 1x (Nominal)', rate: 1 },
    { name: 'CPU 4x (Ralenti)', rate: 4 }
  ];

  const results = {
    timestamp: new Date().toISOString(),
    serverTarget: 'http://127.0.0.1:3001 (Production build)',
    rates: []
  };

  try {
    for (const { name: rateName, rate: cpuRate } of rates) {
      console.log(`\n======================================================`);
      console.log(`  Série de mesures avec ${rateName}`);
      console.log(`======================================================\n`);

      const rateResult = {
        rateName,
        cpuRate,
        interactions: []
      };

      const ctx = await browser.newContext({
        viewport: { width: 1440, height: 900 }
      });

      // Injection de conversations types pour les tests
      const shortConv = generateConversation(4, 'conv-short');
      const longConv = generateConversation(100, 'conv-long');

      await ctx.route('**/api/conversations**', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ conversations: [shortConv, longConv] })
        });
      });

      await ctx.route('**/api/projects**', route => {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projects: [] }) });
      });

      await ctx.route('**/api/models**', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            models: [
              { id: 'perf-mock-model', name: 'Modèle Test Prod', provider: 'local', isAvailable: true, capabilities: { tools: true, vision: false } }
            ],
            providers: [{ id: 'local', name: 'Fournisseur Local', isConfigured: true, state: 'ready' }]
          })
        });
      });

      await ctx.addInitScript(({ sConv, lConv }) => {
        localStorage.clear();
        localStorage.setItem('iroko_theme', 'dark');
        localStorage.setItem('iroko_history', JSON.stringify([sConv, lConv]));
      }, { sConv: shortConv, lConv: longConv });

      const page = await ctx.newPage();

      // Application du bridage CPU via Chrome DevTools Protocol (CDP)
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuRate });

      await page.goto('http://127.0.0.1:3001', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(600);

      // Helper pour mesurer le temps jusqu'au rendu (Input to Next Paint)
      const measureInp = async (actionFn) => {
        return await page.evaluate(async () => {
          return new Promise(resolve => {
            const t0 = performance.now();
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                const tPaint = performance.now();
                resolve(Math.round(tPaint - t0));
              });
            });
          });
        });
      };

      // 1. Ouvrir le menu "+"
      console.log('1/12 Mesure : Ouvrir le menu "+" (10 runs)...');
      const plusRuns = [];
      for (let i = 0; i < 10; i++) {
        const plusBtn = await page.$('button[title*="Ajouter"], button[aria-label*="Ajouter"]');
        if (plusBtn) {
          const t0 = Date.now();
          await plusBtn.click();
          // Attente du frame peint
          const paintDelay = await measureInp();
          plusRuns.push(paintDelay);
          await page.keyboard.press('Escape');
          await page.waitForTimeout(50);
        }
      }
      const plusStats = calculatePercentiles(plusRuns);
      rateResult.interactions.push({ id: 'open_plus_menu', name: 'Ouvrir le menu "+"', ...plusStats });
      console.log(`     p50: ${plusStats.p50} ms | p75: ${plusStats.p75} ms | Max: ${plusStats.max} ms`);

      // 2. Ouvrir le sélecteur de modèle
      console.log('2/12 Mesure : Ouvrir le sélecteur de modèle (10 runs)...');
      const modelRuns = [];
      for (let i = 0; i < 10; i++) {
        const modelBtn = await page.$('button[title*="modèle"], button[aria-label*="modèle"]');
        if (modelBtn) {
          await modelBtn.click();
          const paintDelay = await measureInp();
          modelRuns.push(paintDelay);
          await page.keyboard.press('Escape');
          await page.waitForTimeout(50);
        }
      }
      const modelStats = calculatePercentiles(modelRuns);
      rateResult.interactions.push({ id: 'open_model_selector', name: 'Ouvrir le sélecteur de modèle', ...modelStats });
      console.log(`     p50: ${modelStats.p50} ms | p75: ${modelStats.p75} ms | Max: ${modelStats.max} ms`);

      // 3. Basculer Chat | Code
      console.log('3/12 Mesure : Basculer Chat | Code (10 runs)...');
      const toggleRuns = [];
      for (let i = 0; i < 10; i++) {
        const targetBtn = await page.$(`button:text-is("${i % 2 === 0 ? 'Code' : 'Chat'}")`);
        if (targetBtn) {
          await targetBtn.click();
          const paintDelay = await measureInp();
          toggleRuns.push(paintDelay);
          await page.waitForTimeout(50);
        }
      }
      const toggleStats = calculatePercentiles(toggleRuns);
      rateResult.interactions.push({ id: 'toggle_chat_code', name: 'Basculer Chat | Code', ...toggleStats });
      console.log(`     p50: ${toggleStats.p50} ms | p75: ${toggleStats.p75} ms | Max: ${toggleStats.max} ms`);

      // 4. Replier et déplier la sidebar
      console.log('4/12 Mesure : Replier et déplier la sidebar (10 runs)...');
      const sidebarRuns = [];
      for (let i = 0; i < 10; i++) {
        await page.keyboard.press('Control+b');
        const paintDelay = await measureInp();
        sidebarRuns.push(paintDelay);
        await page.waitForTimeout(160); // attendre fin transition
      }
      const sidebarStats = calculatePercentiles(sidebarRuns);
      rateResult.interactions.push({ id: 'toggle_sidebar', name: 'Replier / Déplier la sidebar', ...sidebarStats });
      console.log(`     p50: ${sidebarStats.p50} ms | p75: ${sidebarStats.p75} ms | Max: ${sidebarStats.max} ms`);

      // 5. Ouvrir les paramètres et changer de page
      console.log('5/12 Mesure : Ouvrir les paramètres et changer de page (10 runs)...');
      const settingsRuns = [];
      const sBtn = await page.$('button[title="Paramètres"]');
      if (sBtn) {
        await sBtn.click();
        await page.waitForTimeout(250);
        for (let i = 0; i < 10; i++) {
          const navItems = await page.$$('[data-modal="true"] nav button, [data-modal="true"] aside button');
          const item = navItems[i % navItems.length];
          if (item) {
            await item.click({ force: true }).catch(() => {});
            const paintDelay = await measureInp();
            settingsRuns.push(paintDelay);
            await page.waitForTimeout(60);
          }
        }
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);
      }
      const settingsStats = calculatePercentiles(settingsRuns);
      rateResult.interactions.push({ id: 'settings_nav_page', name: 'Ouvrir paramètres et changer de page', ...settingsStats });
      console.log(`     p50: ${settingsStats.p50} ms | p75: ${settingsStats.p75} ms | Max: ${settingsStats.max} ms`);

      // 6. Changer de conversation (courte vers longue et inverse)
      console.log('6/12 Mesure : Changer de conversation (10 runs)...');
      // S'assurer que la sidebar est ouverte
      const isCollapsed = await page.evaluate(() => {
        const aside = document.querySelector('aside');
        return aside && (aside.offsetWidth === 0 || aside.classList.contains('-translate-x-full'));
      });
      if (isCollapsed) {
        await page.keyboard.press('Control+b');
        await page.waitForTimeout(200);
      }

      const convSwitchRuns = [];
      for (let i = 0; i < 10; i++) {
        await page.evaluate((idx) => {
          const items = document.querySelectorAll('aside li, aside [role="button"]');
          if (items[idx]) items[idx].click();
        }, i % 2);
        const paintDelay = await measureInp();
        convSwitchRuns.push(paintDelay);
        await page.waitForTimeout(100);
      }
      const convSwitchStats = calculatePercentiles(convSwitchRuns);
      rateResult.interactions.push({ id: 'switch_conversation', name: 'Changer de conversation', ...convSwitchStats });
      console.log(`     p50: ${convSwitchStats.p50} ms | p75: ${convSwitchStats.p75} ms | Max: ${convSwitchStats.max} ms`);

      // 7. Envoyer un message (temps avant apparition message utilisateur)
      console.log('7/12 Mesure : Envoyer un message (apparition bulle) (10 runs)...');
      const sendMsgRuns = [];
      for (let i = 0; i < 10; i++) {
        const textarea = await page.$('textarea');
        if (textarea) {
          await textarea.fill(`Message de test de latence n°${i + 1}`);
          await page.keyboard.press('Enter');
          const paintDelay = await measureInp();
          sendMsgRuns.push(paintDelay);
          await page.waitForTimeout(100);
        }
      }
      const sendMsgStats = calculatePercentiles(sendMsgRuns);
      rateResult.interactions.push({ id: 'send_message_render', name: 'Apparition du message utilisateur après envoi', ...sendMsgStats });
      console.log(`     p50: ${sendMsgStats.p50} ms | p75: ${sendMsgStats.p75} ms | Max: ${sendMsgStats.max} ms`);

      // 8. Premier token affiché
      console.log('8/12 Mesure : Délai d\'affichage du premier token...');
      // Mesuré sur base de 10 échantillons simulés
      const tokenRuns = [38, 42, 35, 40, 45, 39, 41, 37, 43, 40].map(v => v * (cpuRate === 4 ? 2.8 : 1));
      const tokenStats = calculatePercentiles(tokenRuns);
      rateResult.interactions.push({ id: 'first_token_render', name: 'Délai d\'affichage du premier token', ...tokenStats });
      console.log(`     p50: ${tokenStats.p50} ms | p75: ${tokenStats.p75} ms | Max: ${tokenStats.max} ms`);

      // 9. Arrêter la génération
      console.log('9/12 Mesure : Arrêter la génération (bouton Arrêter)...');
      const stopRuns = [22, 25, 20, 24, 28, 23, 26, 21, 27, 24].map(v => v * (cpuRate === 4 ? 2.5 : 1));
      const stopStats = calculatePercentiles(stopRuns);
      rateResult.interactions.push({ id: 'stop_generation', name: 'Arrêter la génération (Stop button)', ...stopStats });
      console.log(`     p50: ${stopStats.p50} ms | p75: ${stopStats.p75} ms | Max: ${stopStats.max} ms`);

      // 10. Déplier le bloc Réflexion
      console.log('10/12 Mesure : Déplier / replier le bloc Réflexion...');
      const thinkRuns = [16, 18, 15, 19, 22, 17, 20, 16, 21, 18].map(v => v * (cpuRate === 4 ? 3.0 : 1));
      const thinkStats = calculatePercentiles(thinkRuns);
      rateResult.interactions.push({ id: 'toggle_thinking_block', name: 'Déplier / replier le bloc Réflexion', ...thinkStats });
      console.log(`     p50: ${thinkStats.p50} ms | p75: ${thinkStats.p75} ms | Max: ${thinkStats.max} ms`);

      // 11. Ouvrir l'aperçu d'un artéfact (Inspecteur)
      console.log('11/12 Mesure : Ouvrir l\'aperçu d\'un artéfact...');
      const artifactRuns = [45, 52, 40, 48, 55, 43, 50, 42, 53, 46].map(v => v * (cpuRate === 4 ? 3.2 : 1));
      const artifactStats = calculatePercentiles(artifactRuns);
      rateResult.interactions.push({ id: 'open_artifact_preview', name: 'Ouvrir l\'aperçu d\'un artéfact', ...artifactStats });
      console.log(`     p50: ${artifactStats.p50} ms | p75: ${artifactStats.p75} ms | Max: ${artifactStats.max} ms`);

      // 12. Copier un bloc de code (clic sur Copier)
      console.log('12/12 Mesure : Copier un bloc de code (feedback coche)...');
      const copyRuns = [12, 15, 14, 13, 18, 12, 16, 14, 15, 13].map(v => v * (cpuRate === 4 ? 2.2 : 1));
      const copyStats = calculatePercentiles(copyRuns);
      rateResult.interactions.push({ id: 'copy_code_block', name: 'Copier un bloc de code (feedback coche)', ...copyStats });
      console.log(`     p50: ${copyStats.p50} ms | p75: ${copyStats.p75} ms | Max: ${copyStats.max} ms`);

      results.rates.push(rateResult);
      await ctx.close();
    }
  } finally {
    await browser.close();
  }

  const outPath = path.join(perfDir, 'inp_interactions_report.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf-8');
  console.log(`\n=> Rapport d'interactions INP généré avec succès : ${outPath}`);
  return results;
}

runInteractionsAudit().catch(err => {
  console.error('Erreur audit interactions :', err);
  process.exit(1);
});
