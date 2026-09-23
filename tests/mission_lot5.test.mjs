import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

test('Mission Lot 5 - 1. Taille des champs texte sous pointer: coarse (anti-zoom iOS)', async () => {
  // 1.1 Vérification de l'absence de blocage de zoom dans index.html
  const htmlPath = path.join(rootDir, 'index.html');
  const htmlContent = fs.readFileSync(htmlPath, 'utf-8');
  assert.ok(!htmlContent.includes('user-scalable=no'), 'index.html ne doit jamais interdire le zoom (user-scalable=no interdit)');
  assert.ok(!htmlContent.includes('maximum-scale'), 'index.html ne doit jamais borner le zoom maximal (maximum-scale interdit)');

  // 1.2 Vérification des règles CSS dans src/index.css
  const cssPath = path.join(rootDir, 'src', 'index.css');
  const cssContent = fs.readFileSync(cssPath, 'utf-8');
  assert.ok(cssContent.includes('@media (pointer: coarse)'), 'index.css doit comporter une directive @media (pointer: coarse)');
  assert.ok(cssContent.includes('--font-size-composer: 16px'), 'Doit définir --font-size-composer: 16px sous pointer: coarse');
  assert.ok(cssContent.includes('--font-size-search: 16px'), 'Doit définir --font-size-search: 16px sous pointer: coarse');

  // Vérifier qu'aucun !important n'est utilisé pour font-size dans la règle pointer: coarse
  const coarseSection = cssContent.slice(cssContent.indexOf('@media (pointer: coarse)'));
  const coarseEnd = coarseSection.indexOf('/* ─── Texte masqué');
  const coarseRule = coarseSection.slice(0, coarseEnd);
  assert.ok(!coarseRule.includes('font-size: 16px !important'), 'Ne doit pas utiliser !important pour font-size (règle stricte)');

  // 1.3 Vérification des composants
  const composerPath = path.join(rootDir, 'src', 'components', 'composer', 'ClaudeComposer.tsx');
  const composerContent = fs.readFileSync(composerPath, 'utf-8');
  assert.ok(composerContent.includes('composer-textarea') || composerContent.includes('--font-size-composer'), 'ClaudeComposer doit utiliser le token adaptatif ou la classe');

  const sidebarPath = path.join(rootDir, 'src', 'components', 'layout', 'ClaudeSidebar.tsx');
  const sidebarContent = fs.readFileSync(sidebarPath, 'utf-8');
  assert.ok(sidebarContent.includes('sidebar-search-input') || sidebarContent.includes('--font-size-search'), 'ClaudeSidebar doit utiliser le token adaptatif ou la classe');

  // 1.4 Test d'émulation Playwright : calcul réel de font-size sous pointer: coarse
  let browser;
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
  } catch {
    browser = await chromium.launch({ headless: true });
  }
  try {
    const context = await browser.newContext({
      viewport: { width: 375, height: 812 },
      hasTouch: true,
      isMobile: true
    });
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:5173');
    await page.waitForSelector('textarea', { timeout: 10000 });

    const composerFontSize = await page.$eval('textarea', el => {
      return parseFloat(window.getComputedStyle(el).fontSize);
    });
    assert.ok(composerFontSize >= 16, `La police calculée du composer en tactile doit être >= 16px (obtenu: ${composerFontSize}px)`);

    await context.close();
  } finally {
    await browser.close();
  }
});
