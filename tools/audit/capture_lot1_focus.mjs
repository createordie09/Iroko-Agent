/**
 * tools/audit/capture_lot1_focus.mjs
 * Script de capture visuelle des états de focus et des nouveaux tokens du Lot 1.
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const outDir = path.resolve('docs/audit/a11y/captures_lot1');
const artifactDir = 'C:\\Users\\DELL\\.gemini\\antigravity\\brain\\d7d76e62-85aa-46ae-912e-623108e41281';

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

(async () => {
  let browser;
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
  } catch (e) {
    browser = await chromium.launch({ headless: true });
  }

  const setupCtx = async (ctx) => {
    await ctx.route('**/api/conversations', route => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ conversations: [] })
    }));
    await ctx.route('**/api/projects', route => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ projects: [] })
    }));
    await ctx.route('**/api/providers', route => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ providers: [], defaultProvider: null, fallbackPolicy: null, defaultStrategy: null })
    }));
    await ctx.route('**/api/models*', route => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ models: [], total: 0, view: 'short', provider: null, defaultModel: null })
    }));
    await ctx.addInitScript(() => {
      localStorage.removeItem('iroko_history');
      localStorage.removeItem('iroko_projects');
      localStorage.removeItem('iroko_active_model');
      localStorage.removeItem('iroko_recent_models');
      localStorage.setItem('iroko_theme', 'dark');
      localStorage.setItem('iroko_font', 'serif');
    });
  };

  // 1. Capture Desktop 1440px - Vue globale nouveaux tokens
  console.log('1. Capture Desktop 1440px avec nouveaux tokens...');
  const ctx1440 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await setupCtx(ctx1440);
  const p1440 = await ctx1440.newPage();
  await p1440.goto('http://127.0.0.1:5173');
  await p1440.waitForSelector('textarea', { timeout: 10000 });
  await p1440.waitForTimeout(500);

  const path1440 = path.join(outDir, 'lot1_1440_accueil_sombre.png');
  await p1440.screenshot({ path: path1440 });
  fs.copyFileSync(path1440, path.join(artifactDir, 'lot1_1440_accueil_sombre.png'));

  // 2. Capture Focus Composer (champ actif : bordure #767470, aucun outline)
  console.log('2. Capture Focus Composer...');
  await p1440.click('textarea');
  await p1440.waitForTimeout(300);
  const pathFocusComposer = path.join(outDir, 'lot1_focus_composer.png');
  await p1440.screenshot({ path: pathFocusComposer });
  fs.copyFileSync(pathFocusComposer, path.join(artifactDir, 'lot1_focus_composer.png'));

  // 3. Capture Focus Bouton (+ Nouveau ou Paramètres au clavier avec Tab)
  console.log('3. Capture Focus Bouton clavier (:focus-visible 2px solid #ededeb)...');
  await p1440.keyboard.press('Tab');
  await p1440.waitForTimeout(200);
  // Naviguer au clavier vers un bouton
  for (let i = 0; i < 4; i++) {
    await p1440.keyboard.press('Tab');
    await p1440.waitForTimeout(100);
  }
  const pathFocusBtn = path.join(outDir, 'lot1_focus_bouton.png');
  await p1440.screenshot({ path: pathFocusBtn });
  fs.copyFileSync(pathFocusBtn, path.join(artifactDir, 'lot1_focus_bouton.png'));
  await ctx1440.close();

  // 4. Capture Mobile 375px - Vue globale & Focus Composer
  console.log('4. Capture Mobile 375px...');
  const ctx375 = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true });
  await setupCtx(ctx375);
  const p375 = await ctx375.newPage();
  await p375.goto('http://127.0.0.1:5173');
  await p375.waitForSelector('textarea', { timeout: 10000 });
  await p375.waitForTimeout(500);

  const path375 = path.join(outDir, 'lot1_375_accueil_sombre.png');
  await p375.screenshot({ path: path375 });
  fs.copyFileSync(path375, path.join(artifactDir, 'lot1_375_accueil_sombre.png'));

  await p375.click('textarea');
  await p375.waitForTimeout(300);
  const path375Focus = path.join(outDir, 'lot1_375_focus_composer.png');
  await p375.screenshot({ path: path375Focus });
  fs.copyFileSync(path375Focus, path.join(artifactDir, 'lot1_375_focus_composer.png'));
  await ctx375.close();

  // 5. Capture Focus Recherche Sidebar
  console.log('5. Capture Focus Recherche Sidebar...');
  const ctxSidebar = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctxSidebar.route('**/api/conversations', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({
      conversations: [{ id: 'conv-test-1', topic: 'Discussion test', createdAt: Date.now() }]
    })
  }));
  await ctxSidebar.route('**/api/projects', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ projects: [] })
  }));
  await ctxSidebar.route('**/api/providers', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ providers: [], defaultProvider: null, fallbackPolicy: null, defaultStrategy: null })
  }));
  await ctxSidebar.route('**/api/models*', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ models: [], total: 0, view: 'short', provider: null, defaultModel: null })
  }));
  await ctxSidebar.addInitScript(() => {
    localStorage.setItem('iroko_theme', 'dark');
    localStorage.setItem('iroko_font', 'serif');
  });

  const pSidebar = await ctxSidebar.newPage();
  await pSidebar.goto('http://127.0.0.1:5173');
  await pSidebar.waitForSelector('button[title="Filtrer les discussions"]', { timeout: 10000 });
  const filterBtn = await pSidebar.$('button[title="Filtrer les discussions"]');
  if (filterBtn) {
    await filterBtn.click();
    await pSidebar.waitForTimeout(300);
    const searchInput = await pSidebar.$('input[data-search="true"]');
    if (searchInput) {
      await searchInput.click();
      await pSidebar.waitForTimeout(300);
      const pathSearchFocus = path.join(outDir, 'lot1_focus_recherche_sidebar.png');
      await pSidebar.screenshot({ path: pathSearchFocus });
      fs.copyFileSync(pathSearchFocus, path.join(artifactDir, 'lot1_focus_recherche_sidebar.png'));
    }
  }
  await ctxSidebar.close();

  await browser.close();
  console.log('Captures terminées avec succès dans docs/audit/a11y/captures_lot1/ et dans l\'artifact directory.');
})();
