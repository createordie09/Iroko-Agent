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

test('Mission Lot 5 - 2. Clavier virtuel, hauteur visualViewport et zones sûres (Point 2)', () => {
  // 2.1 Meta viewport : viewport-fit=cover et pas de interactive-widget=resizes-content
  const htmlPath = path.join(rootDir, 'index.html');
  const htmlContent = fs.readFileSync(htmlPath, 'utf-8');
  assert.ok(htmlContent.includes('viewport-fit=cover'), 'index.html doit déclarer viewport-fit=cover pour les zones sûres');
  assert.ok(!htmlContent.includes('interactive-widget=resizes-content'), 'Ne doit pas inclure interactive-widget=resizes-content pour préserver les gestes iOS');

  // 2.2 Hook useVisualViewportHeight
  const hookPath = path.join(rootDir, 'src', 'hooks', 'useVisualViewportHeight.ts');
  assert.ok(fs.existsSync(hookPath), 'src/hooks/useVisualViewportHeight.ts doit exister');
  const hookContent = fs.readFileSync(hookPath, 'utf-8');
  assert.ok(hookContent.includes('export function useVisualViewportHeight'), 'Doit exporter useVisualViewportHeight');
  assert.ok(hookContent.includes('window.visualViewport'), 'Doit écouter window.visualViewport');
  assert.ok(hookContent.includes('requestAnimationFrame'), 'Les mises à jour doivent être cadencées par requestAnimationFrame');
  assert.ok(hookContent.includes('--app-height'), 'Doit piloter la variable CSS --app-height');
  assert.ok(hookContent.includes('scrollIntoView'), 'Doit ramener le champ actif dans la vue au focus');

  // 2.3 Intégration dans ZyriconAppShell.tsx
  const shellPath = path.join(rootDir, 'src', 'components', 'layout', 'ZyriconAppShell.tsx');
  const shellContent = fs.readFileSync(shellPath, 'utf-8');
  assert.ok(shellContent.includes('useVisualViewportHeight()'), 'ZyriconAppShell doit appeler useVisualViewportHeight');
  assert.ok(shellContent.includes('--app-height'), 'ZyriconAppShell doit appliquer var(--app-height, 100dvh)');
  assert.ok(shellContent.includes('safe-area-inset-top'), 'ZyriconAppShell doit gérer safe-area-inset-top');
  assert.ok(shellContent.includes('safe-area-inset-bottom'), 'ZyriconAppShell doit gérer safe-area-inset-bottom');
  assert.ok(shellContent.includes('safe-area-inset-left'), 'ZyriconAppShell doit gérer safe-area-inset-left pour le paysage');
  assert.ok(shellContent.includes('safe-area-inset-right'), 'ZyriconAppShell doit gérer safe-area-inset-right pour le paysage');
});

test('Mission Lot 5 - 3. Cibles tactiles étendues à 44x44 px sous pointer: coarse (Point 3)', async () => {
  // 3.1 Définition CSS de .tap-target-24 et son extension sous pointer: coarse
  const cssPath = path.join(rootDir, 'src', 'index.css');
  const cssContent = fs.readFileSync(cssPath, 'utf-8');
  assert.ok(cssContent.includes('.tap-target-24'), 'index.css doit définir la classe utilitaire tap-target-24');
  assert.ok(cssContent.includes('min-width: 44px') && cssContent.includes('min-height: 44px'), 'tap-target-24::before doit atteindre 44x44 px sous pointer: coarse');

  // 3.2 Contrôles principaux équipés de la classe
  const composerPath = path.join(rootDir, 'src', 'components', 'composer', 'ClaudeComposer.tsx');
  const composerContent = fs.readFileSync(composerPath, 'utf-8');
  assert.ok(composerContent.includes('tap-target-24'), 'ClaudeComposer doit appliquer tap-target-24 sur ses contrôles');

  const sidebarPath = path.join(rootDir, 'src', 'components', 'layout', 'ClaudeSidebar.tsx');
  const sidebarContent = fs.readFileSync(sidebarPath, 'utf-8');
  assert.ok(sidebarContent.includes('tap-target-24'), 'ClaudeSidebar doit appliquer tap-target-24 sur ses contrôles');

  // 3.3 Test Playwright : calcul réel de la dimension du pseudo-élément ::before sous pointer: coarse
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
    await page.waitForSelector('.tap-target-24', { timeout: 10000 });

    const dimensions = await page.$eval('.tap-target-24', el => {
      const style = window.getComputedStyle(el, '::before');
      return {
        minWidth: parseFloat(style.minWidth) || 0,
        minHeight: parseFloat(style.minHeight) || 0
      };
    });

    assert.ok(dimensions.minWidth >= 44, `minWidth du pseudo-élément tactile doit être >= 44px (obtenu: ${dimensions.minWidth}px)`);
    assert.ok(dimensions.minHeight >= 44, `minHeight du pseudo-élément tactile doit être >= 44px (obtenu: ${dimensions.minHeight}px)`);

    await context.close();
  } finally {
    await browser.close();
  }
});


