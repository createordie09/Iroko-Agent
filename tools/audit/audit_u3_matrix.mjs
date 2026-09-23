/**
 * audit_u3_matrix.mjs — Section 1 : Matrice États × Fenêtres
 * Mesure 9 viewports (320px à 2560px + paysage 844x390)
 * Débordement horizontal, cibles tactiles, safe areas, tiroir sidebar,
 * largeur de lecture, modale sur mobile, analyse clavier virtuel & visualViewport
 * Production : http://127.0.0.1:3001
 */

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, join } from 'path';

const BASE_URL = 'http://127.0.0.1:3001';
const SCREENSHOTS_DIR = resolve('docs/audit/responsive/screenshots');

if (!existsSync(SCREENSHOTS_DIR)) {
  mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

const VIEWPORTS = [
  { width: 320, height: 568, name: '320x568 (Mobile Ultra-Compact - iPhone SE 1)' },
  { width: 375, height: 667, name: '375x667 (Mobile Compact Standard - iPhone SE 2/3)' },
  { width: 390, height: 844, name: '390x844 (Mobile Moderne - iPhone 12/13/14)' },
  { width: 844, height: 390, name: '844x390 (Mobile Paysage)' },
  { width: 768, height: 1024, name: '768x1024 (Tablette Portrait)' },
  { width: 1024, height: 768, name: '1024x768 (Tablette Paysage / Petit Laptop)' },
  { width: 1440, height: 900, name: '1440x900 (Laptop Standard)' },
  { width: 1920, height: 1080, name: '1920x1080 (Desktop Full HD)' },
  { width: 2560, height: 1440, name: '2560x1440 (Desktop QHD)' }
];

async function runMatrixAudit() {
  console.log('=== AUDIT U3 : SECTION 1 — MATRICE ÉTATS × FENÊTRES ===\n');

  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  const matrixReport = {
    timestamp: new Date().toISOString(),
    viewports: [],
    virtualKeyboardAnalysis: {},
    drawerAnalysis: {},
    modalMobileAnalysis: {},
    readingWidthAnalysis: {}
  };

  // 1. Audit pour chaque viewport
  for (const vp of VIEWPORTS) {
    process.stdout.write(`Vérification viewport [${vp.width}x${vp.height}] ${vp.name}... `);

    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      userAgent: vp.width <= 768 
        ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1'
        : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0'
    });

    const page = await context.newPage();
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(500);

    // Détection de débordement horizontal
    const overflowCheck = await page.evaluate(() => {
      const root = document.documentElement;
      const body = document.body;
      const scrollW = Math.max(root.scrollWidth, body ? body.scrollWidth : 0);
      const innerW = window.innerWidth;
      return {
        scrollWidth: scrollW,
        innerWidth: innerW,
        hasOverflow: scrollW > innerW + 1 // tolérance 1px subpixel
      };
    });

    // Cibles interactives (WCAG 2.2 AA : 24x24 px ; visé tactile : 44x44 px)
    const targetsCheck = await page.evaluate((isMobile) => {
      const interactive = Array.from(document.querySelectorAll('button, a, input, select, textarea, [role="button"]'));
      let below24 = 0;
      let below44 = 0;
      const examplesBelow24 = [];
      const examplesBelow44 = [];

      for (const el of interactive) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0 || window.getComputedStyle(el).display === 'none') continue;

        if (rect.width < 24 || rect.height < 24) {
          below24++;
          if (examplesBelow24.length < 5) {
            examplesBelow24.push({
              tag: el.tagName.toLowerCase(),
              title: el.getAttribute('title') || el.getAttribute('aria-label') || el.textContent.trim().slice(0, 25),
              w: Math.round(rect.width),
              h: Math.round(rect.height)
            });
          }
        } else if (rect.width < 44 || rect.height < 44) {
          below44++;
          if (examplesBelow44.length < 5) {
            examplesBelow44.push({
              tag: el.tagName.toLowerCase(),
              title: el.getAttribute('title') || el.getAttribute('aria-label') || el.textContent.trim().slice(0, 25),
              w: Math.round(rect.width),
              h: Math.round(rect.height)
            });
          }
        }
      }

      return {
        totalChecked: interactive.length,
        below24,
        below44,
        examplesBelow24,
        examplesBelow44
      };
    }, vp.width <= 768);

    // Éléments trop proches (< 8px de distance)
    const proximityCheck = await page.evaluate(() => {
      const interactive = Array.from(document.querySelectorAll('button:not([disabled]), a, input, textarea'));
      const closePairs = [];
      for (let i = 0; i < interactive.length; i++) {
        const r1 = interactive[i].getBoundingClientRect();
        if (r1.width === 0 || r1.height === 0) continue;
        for (let j = i + 1; j < interactive.length; j++) {
          const r2 = interactive[j].getBoundingClientRect();
          if (r2.width === 0 || r2.height === 0) continue;
          // Calcul de la distance euclidienne des centres ou bords
          const dx = Math.max(0, Math.max(r1.left - r2.right, r2.left - r1.right));
          const dy = Math.max(0, Math.max(r1.top - r2.bottom, r2.top - r1.bottom));
          const dist = Math.hypot(dx, dy);
          if (dist > 0 && dist < 8) {
            closePairs.push({
              el1: interactive[i].getAttribute('title') || interactive[i].tagName,
              el2: interactive[j].getAttribute('title') || interactive[j].tagName,
              dist: Math.round(dist)
            });
            if (closePairs.length >= 3) break;
          }
        }
        if (closePairs.length >= 3) break;
      }
      return { count: closePairs.length, examples: closePairs };
    });

    // Capture d'écran
    const ssName = `${vp.width}x${vp.height}.png`;
    const ssPath = join(SCREENSHOTS_DIR, ssName);
    await page.screenshot({ path: ssPath, fullPage: false });

    // Enregistrement résultat
    matrixReport.viewports.push({
      width: vp.width,
      height: vp.height,
      name: vp.name,
      hasOverflow: overflowCheck.hasOverflow,
      scrollWidth: overflowCheck.scrollWidth,
      innerWidth: overflowCheck.innerWidth,
      touchTargets: targetsCheck,
      proximity: proximityCheck,
      screenshot: `screenshots/${ssName}`
    });

    console.log(`[PASS] Débordement: ${overflowCheck.hasOverflow ? 'OUI (Anomalie)' : 'NON'} | Cibles <24px: ${targetsCheck.below24} | Cibles <44px: ${targetsCheck.below44}`);
    await context.close();
  }

  // 2. Audit approfondi du tiroir de la sidebar sur mobile (375x667)
  console.log('\n2. Audit comportement tiroir mobile (375x667)...');
  {
    const context = await browser.newContext({ viewport: { width: 375, height: 667 } });
    const page = await context.newPage();
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    // Bouton ouverture tiroir
    const openDrawerBtn = await page.$('button[title="Ouvrir le menu"]');
    const drawerTests = {
      openButtonFound: Boolean(openDrawerBtn),
      drawerOpensOnClick: false,
      overlayPresent: false,
      overlayHasAriaHidden: false,
      backgroundInert: false,
      escapeClosesDrawer: false,
      overlayClickClosesDrawer: false
    };

    if (openDrawerBtn) {
      await openDrawerBtn.click();
      await page.waitForTimeout(300);

      const drawerVisible = await page.evaluate(() => {
        const sidebar = document.querySelector('.fixed.md\\:relative');
        if (!sidebar) return false;
        const rect = sidebar.getBoundingClientRect();
        return rect.left >= 0 && rect.width > 0;
      });
      drawerTests.drawerOpensOnClick = drawerVisible;

      // Overlay
      const overlayInfo = await page.evaluate(() => {
        const overlay = document.querySelector('.fixed.inset-0.bg-black\\/70');
        if (!overlay) return null;
        return {
          exists: true,
          ariaHidden: overlay.getAttribute('aria-hidden'),
          role: overlay.getAttribute('role')
        };
      });
      drawerTests.overlayPresent = Boolean(overlayInfo);
      drawerTests.overlayHasAriaHidden = overlayInfo?.ariaHidden === 'true';

      // Vérifier si le contenu d'arrière-plan est inerte (attribut inert ou aria-hidden)
      const isMainInert = await page.evaluate(() => {
        const main = document.querySelector('.flex-1.h-full.flex.flex-col');
        return main ? (main.hasAttribute('inert') || main.getAttribute('aria-hidden') === 'true') : false;
      });
      drawerTests.backgroundInert = isMainInert;

      // Capture tiroir ouvert
      await page.screenshot({ path: join(SCREENSHOTS_DIR, '375_tiroir_ouvert_audit.png') });

      // Test fermeture via Échap
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      const closedByEsc = await page.evaluate(() => {
        const sidebar = document.querySelector('.fixed.md\\:relative');
        if (!sidebar) return true;
        const rect = sidebar.getBoundingClientRect();
        return rect.right <= 0;
      });
      drawerTests.escapeClosesDrawer = closedByEsc;

      // Si non fermé par Échap, tester fermeture par clic overlay
      if (!closedByEsc) {
        await page.evaluate(() => {
          const overlay = document.querySelector('.fixed.inset-0.bg-black\\/70');
          if (overlay) overlay.click();
        });
        await page.waitForTimeout(300);
        const closedByOverlay = await page.evaluate(() => {
          const sidebar = document.querySelector('.fixed.md\\:relative');
          if (!sidebar) return true;
          const rect = sidebar.getBoundingClientRect();
          return rect.right <= 0;
        });
        drawerTests.overlayClickClosesDrawer = closedByOverlay;
      }
    }

    matrixReport.drawerAnalysis = drawerTests;
    console.log(`   Ouverture tiroir : ${drawerTests.drawerOpensOnClick ? 'OK' : 'ÉCHEC'}`);
    console.log(`   Overlay présent : ${drawerTests.overlayPresent ? 'OK' : 'ABSENT'}`);
    console.log(`   Arrière-plan inerte (inert/aria-hidden) : ${drawerTests.backgroundInert ? 'OUI' : 'NON (Risque A11y)'}`);
    console.log(`   Fermeture Échap : ${drawerTests.escapeClosesDrawer ? 'OUI' : 'NON'}`);
    await context.close();
  }

  // 3. Audit Modale sur mobile (375x667)
  console.log('\n3. Audit modale paramètres sur mobile (375x667)...');
  {
    const context = await browser.newContext({ viewport: { width: 375, height: 667 } });
    const page = await context.newPage();
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    // Ouvrir paramètres via raccourci
    await page.keyboard.press('Control+,');
    await page.waitForTimeout(400);

    const modalCheck = await page.evaluate(() => {
      const modal = document.querySelector('[data-modal="true"]');
      if (!modal) return null;
      const rect = modal.getBoundingClientRect();
      const winW = window.innerWidth;
      const winH = window.innerHeight;
      return {
        modalWidth: Math.round(rect.width),
        modalHeight: Math.round(rect.height),
        windowWidth: winW,
        windowHeight: winH,
        isFullScreen: rect.width >= winW - 16 && rect.height >= winH - 32,
        hasOverflowX: modal.scrollWidth > modal.clientWidth,
        hasOverflowY: modal.scrollHeight > modal.clientHeight
      };
    });

    if (modalCheck) {
      await page.screenshot({ path: join(SCREENSHOTS_DIR, '375_parametres_modal.png') });
    }

    matrixReport.modalMobileAnalysis = modalCheck || { error: 'Modale non ouverte via Control+,' };
    console.log(`   Modale mobile : ${modalCheck ? `${modalCheck.modalWidth}x${modalCheck.modalHeight}px (Plein écran: ${modalCheck.isFullScreen ? 'OUI' : 'NON'})` : 'Non détectée'}`);
    await context.close();
  }

  // 4. Audit Largeur de lecture sur Desktop (1440px et 2560px)
  console.log('\n4. Audit largeur de lecture & centrage sur grand écran (1440px & 2560px)...');
  {
    const context = await browser.newContext({ viewport: { width: 2560, height: 1440 } });
    const page = await context.newPage();
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    const layout2560 = await page.evaluate(() => {
      const hero = document.querySelector('.hero-title, h1, [class*="Newsreader"]');
      const composer = document.querySelector('textarea')?.closest('[class*="max-w-"]');
      const sidebar = document.querySelector('nav, [class*="bg-\\[var\\(--bg-sidebar\\)\\]"]');

      return {
        composerMaxWidth: composer ? window.getComputedStyle(composer).maxWidth : null,
        composerWidth: composer ? Math.round(composer.getBoundingClientRect().width) : null,
        sidebarWidth: sidebar ? Math.round(sidebar.getBoundingClientRect().width) : null,
        windowWidth: window.innerWidth,
        readingWidthCharsEst: composer ? Math.round(composer.getBoundingClientRect().width / 8) : null // ~8px par char
      };
    });

    await page.screenshot({ path: join(SCREENSHOTS_DIR, '2560x1440_layout.png') });

    matrixReport.readingWidthAnalysis = layout2560;
    console.log(`   Composer max-width sur 2560px : ${layout2560.composerMaxWidth} (${layout2560.composerWidth}px, ~${layout2560.readingWidthCharsEst} car.)`);
    console.log(`   Sidebar width sur 2560px : ${layout2560.sidebarWidth}px`);
    await context.close();
  }

  // 5. Analyse Clavier Virtuel & Safe Areas (Code statique + DOM)
  console.log('\n5. Analyse Clavier Virtuel, Meta Viewport et Safe-Areas...');
  {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    const codeCheck = await page.evaluate(() => {
      // 1. Meta viewport
      const metaVp = document.querySelector('meta[name="viewport"]')?.getAttribute('content') || '';
      const hasInteractiveWidget = metaVp.includes('interactive-widget');
      const hasViewportFit = metaVp.includes('viewport-fit');
      const isZoomDisabled = metaVp.includes('user-scalable=no') || metaVp.includes('maximum-scale=1');

      // 2. Unités dvh
      const appShell = document.querySelector('[class*="100dvh"], [style*="100dvh"]');
      const usesDvh = Boolean(appShell);

      // 3. Tailles de police des inputs (doit être >= 16px sur mobile pour éviter auto-zoom iOS)
      const inputs = Array.from(document.querySelectorAll('input, textarea'));
      const fontSizes = inputs.map(i => ({
        tag: i.tagName.toLowerCase(),
        fontSize: window.getComputedStyle(i).fontSize,
        fontSizePx: parseFloat(window.getComputedStyle(i).fontSize)
      }));
      const hasSub16pxInputs = fontSizes.some(f => f.fontSizePx < 16);

      // 4. Safe-area-inset
      const styleSheets = Array.from(document.styleSheets);
      let usesSafeArea = false;
      try {
        for (const sheet of styleSheets) {
          for (const rule of sheet.cssRules || []) {
            if (rule.cssText && rule.cssText.includes('safe-area-inset')) {
              usesSafeArea = true;
              break;
            }
          }
          if (usesSafeArea) break;
        }
      } catch (e) {}

      // 5. VisualViewport listeners
      return {
        metaViewport: metaVp,
        hasInteractiveWidget,
        hasViewportFit,
        isZoomDisabled,
        usesDvh,
        inputFontSizes: fontSizes.slice(0, 5),
        hasSub16pxInputs,
        usesSafeArea
      };
    });

    matrixReport.virtualKeyboardAnalysis = codeCheck;
    console.log(`   Meta viewport: "${codeCheck.metaViewport}"`);
    console.log(`   interactive-widget présent: ${codeCheck.hasInteractiveWidget ? 'OUI' : 'NON (Clavier peut masquer composer sur Android)'}`);
    console.log(`   viewport-fit=cover: ${codeCheck.hasViewportFit ? 'OUI' : 'NON (Safe-areas désactivées sur iPhone)'}`);
    console.log(`   Zoom désactivé (user-scalable=no): ${codeCheck.isZoomDisabled ? 'OUI (INTERDIT)' : 'NON (Conforme)'}`);
    console.log(`   Utilise 100dvh: ${codeCheck.usesDvh ? 'OUI' : 'NON'}`);
    console.log(`   Inputs < 16px (auto-zoom iOS): ${codeCheck.hasSub16pxInputs ? 'OUI (Anomalie iOS)' : 'NON'}`);
    await context.close();
  }

  await browser.close();

  const outPath = resolve('docs/audit/responsive/matrix_report.json');
  writeFileSync(outPath, JSON.stringify(matrixReport, null, 2), 'utf8');
  console.log(`\n✅ Rapport Matrice enregistré : ${outPath}`);
}

runMatrixAudit().catch(err => {
  console.error('ERREUR:', err);
  process.exit(1);
});
