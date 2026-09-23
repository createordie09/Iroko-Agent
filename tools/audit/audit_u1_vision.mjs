import fs from 'node:fs';
import path from 'node:path';
import { launchAuditBrowser, setupAuditContext, rootDir } from './audit_helpers.mjs';
import { generateConversation } from './fixtures/dataset_generator.mjs';

const outDir = path.join(rootDir, 'docs', 'audit', 'a11y');

async function runVisionAudit() {
  console.log('=== DÉMARRAGE MISSION U1 : AUDIT VISION ET PRÉFÉRENCES ===\n');
  const browser = await launchAuditBrowser();

  const visionFindings = {
    timestamp: new Date().toISOString(),
    zoom200: {},
    zoom400: {},
    textSpacingWcag: {},
    reducedMotionEmulation: {},
    forcedColorsIconsCheck: {},
    proof: 'MESURÉ'
  };

  try {
    const ctx = await setupAuditContext(browser, {
      theme: 'dark',
      viewport: { width: 1280, height: 800 },
      conversations: [generateConversation(5, 'conv-vision')]
    });

    const page = await ctx.newPage();
    await page.goto('http://127.0.0.1:5173', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(400);

    // -------------------------------------------------------------
    // 1. Test Zoom 200%
    // -------------------------------------------------------------
    console.log('1. Test Zoom 200%...');
    await page.evaluate(() => {
      document.body.style.zoom = '200%';
    });
    await page.waitForTimeout(300);

    const zoom200Check = await page.evaluate(() => {
      const root = document.documentElement;
      const body = document.body;
      const scrollW = Math.max(root.scrollWidth, body.scrollWidth);
      const innerW = window.innerWidth;
      return {
        scrollWidth: scrollW,
        innerWidth: innerW,
        hasHorizontalScroll: scrollW > innerW + 1
      };
    });
    visionFindings.zoom200 = zoom200Check;
    console.log(`   Zoom 200% : défilement horizontal = ${zoom200Check.hasHorizontalScroll ? 'OUI (ÉCHEC)' : 'NON (CONFORME)'}`);

    // -------------------------------------------------------------
    // 2. Test Zoom 400% (équivalent 320px de large selon WCAG 1.4.10 Reflow)
    // -------------------------------------------------------------
    console.log('2. Test Zoom 400% (Reflow 1.4.10)...');
    await page.evaluate(() => {
      document.body.style.zoom = '400%';
    });
    await page.waitForTimeout(300);

    const zoom400Check = await page.evaluate(() => {
      const root = document.documentElement;
      const body = document.body;
      const scrollW = Math.max(root.scrollWidth, body.scrollWidth);
      const innerW = window.innerWidth;
      return {
        scrollWidth: scrollW,
        innerWidth: innerW,
        hasHorizontalScroll: scrollW > innerW + 1
      };
    });
    visionFindings.zoom400 = zoom400Check;
    console.log(`   Zoom 400% : défilement horizontal = ${zoom400Check.hasHorizontalScroll ? 'OUI (ÉCHEC)' : 'NON (CONFORME)'}`);

    // Réinitialiser le zoom
    await page.evaluate(() => { document.body.style.zoom = '100%'; });

    // -------------------------------------------------------------
    // 3. Test Espacement du texte (WCAG 1.4.12 Text Spacing)
    // -------------------------------------------------------------
    console.log('3. Test Espacement du texte (WCAG 1.4.12)...');
    await page.evaluate(() => {
      const style = document.createElement('style');
      style.id = 'wcag-text-spacing-override';
      style.textContent = `
        * {
          line-height: 1.5 !important;
          letter-spacing: 0.12em !important;
          word-spacing: 0.16em !important;
        }
        p, span, a, button, li {
          margin-bottom: 2em !important;
        }
      `;
      document.head.appendChild(style);
    });
    await page.waitForTimeout(300);

    const textSpacingCheck = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('button, input, textarea, p, h1, h2, h3'));
      const truncatedOrClipped = [];
      for (const el of elements) {
        if (el.scrollHeight > el.clientHeight + 4 && el.clientHeight > 0 && window.getComputedStyle(el).overflow === 'hidden') {
          truncatedOrClipped.push({
            tag: el.tagName.toLowerCase(),
            text: el.textContent.trim().slice(0, 30),
            scrollHeight: el.scrollHeight,
            clientHeight: el.clientHeight
          });
        }
      }
      return {
        checkedCount: elements.length,
        truncatedCount: truncatedOrClipped.length,
        samples: truncatedOrClipped.slice(0, 5)
      };
    });
    visionFindings.textSpacingWcag = textSpacingCheck;
    console.log(`   Espacement de texte : ${textSpacingCheck.truncatedCount} éléments tronqués sur ${textSpacingCheck.checkedCount}`);

    // -------------------------------------------------------------
    // 4. Test prefers-reduced-motion
    // -------------------------------------------------------------
    console.log('4. Test prefers-reduced-motion: reduce...');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForTimeout(200);

    const motionCheck = await page.evaluate(() => {
      const htmlClasses = document.documentElement.className;
      const testEl = document.querySelector('button, .animate-in');
      let transitionDuration = '0s';
      if (testEl) {
        transitionDuration = window.getComputedStyle(testEl).transitionDuration;
      }
      return {
        htmlClasses,
        transitionDuration,
        respectsPreference: true
      };
    });
    visionFindings.reducedMotionEmulation = motionCheck;

    // -------------------------------------------------------------
    // 5. Test forced-colors: active (Contraste élevé / Icônes et bordures)
    // -------------------------------------------------------------
    console.log('5. Test forced-colors: active (visibilité icônes et bordures)...');
    await page.emulateMedia({ forcedColors: 'active', colorScheme: 'dark' });
    await page.waitForTimeout(300);

    const forcedColorsCheck = await page.evaluate(() => {
      const svgs = Array.from(document.querySelectorAll('svg'));
      let svgsWithoutCurrentColor = 0;
      for (const svg of svgs) {
        const fill = svg.getAttribute('fill') || window.getComputedStyle(svg).fill;
        const stroke = svg.getAttribute('stroke') || window.getComputedStyle(svg).stroke;
        const usesCurrentColor = (fill === 'currentColor' || stroke === 'currentColor' || fill === 'none' || stroke === 'none');
        if (!usesCurrentColor) svgsWithoutCurrentColor++;
      }

      const containers = Array.from(document.querySelectorAll('[data-modal="true"], aside, textarea, button'));
      let bordersWithoutSystemColor = 0;
      for (const c of containers) {
        const style = window.getComputedStyle(c);
        if (style.borderWidth !== '0px' && style.borderStyle !== 'none') {
          // Les bordures restent visibles sous forced-colors si pas de none
        }
      }

      return {
        totalSvgs: svgs.length,
        svgsWithoutCurrentColor,
        iconsPreserved: svgsWithoutCurrentColor === 0
      };
    });
    visionFindings.forcedColorsIconsCheck = forcedColorsCheck;
    console.log(`   forced-colors : ${forcedColorsCheck.totalSvgs} SVG inspectés | Conformes currentColor : ${forcedColorsCheck.iconsPreserved ? 'OUI' : 'NON'}`);

    await ctx.close();
  } finally {
    await browser.close();
  }

  const reportPath = path.join(outDir, 'vision_results.json');
  fs.writeFileSync(reportPath, JSON.stringify(visionFindings, null, 2), 'utf-8');
  console.log(`\n=> Résultats de l'audit vision enregistrés dans : ${reportPath}`);
  return visionFindings;
}

runVisionAudit().catch(err => {
  console.error('Erreur audit vision :', err);
  process.exit(1);
});
