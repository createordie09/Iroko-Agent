import fs from 'node:fs';
import path from 'node:path';
import { launchAuditBrowser, setupAuditContext, auditOutDir } from './audit_helpers.mjs';

const screenshotsDir = path.join(auditOutDir, 'screenshots', 'responsive');
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

const VIEWPORTS = [
  { width: 320, height: 568, name: '320x568 (Mobile Ultra-Compact - iPhone SE 1)' },
  { width: 375, height: 667, name: '375x667 (Mobile Compact Standard)' },
  { width: 390, height: 844, name: '390x844 (Mobile Moderne Standard)' },
  { width: 844, height: 390, name: '844x390 (Mobile Paysage)' },
  { width: 768, height: 1024, name: '768x1024 (Tablette Portrait)' },
  { width: 1024, height: 768, name: '1024x768 (Tablette Paysage / Petit Laptop)' },
  { width: 1440, height: 900, name: '1440x900 (Laptop Standard)' },
  { width: 1920, height: 1080, name: '1920x1080 (Desktop Full HD)' },
  { width: 2560, height: 1440, name: '2560x1440 (Desktop QHD)' }
];

async function runResponsiveAudit() {
  console.log('=== AUDIT RESPONSIVE & COMPORTEMENT TACTILE ===\n');
  const browser = await launchAuditBrowser();
  const report = {
    timestamp: new Date().toISOString(),
    totalViewportsTested: VIEWPORTS.length,
    passedViewports: 0,
    results: []
  };

  try {
    for (const vp of VIEWPORTS) {
      process.stdout.write(`Vérification viewport [${vp.width}x${vp.height}] ${vp.name}... `);

      const ctx = await setupAuditContext(browser, {
        viewport: { width: vp.width, height: vp.height }
      });

      const page = await ctx.newPage();
      await page.goto('http://127.0.0.1:5173', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(400);

      // 1. Détection de débordement horizontal
      const overflowCheck = await page.evaluate(() => {
        const root = document.documentElement;
        const body = document.body;
        const scrollW = Math.max(root.scrollWidth, body ? body.scrollWidth : 0);
        const innerW = window.innerWidth;
        return {
          scrollWidth: scrollW,
          innerWidth: innerW,
          hasOverflow: scrollW > innerW + 1 // tolérance de 1px subpixel
        };
      });

      // 2. Évaluation des cibles tactiles sur écrans mobiles / tablettes (<= 768px)
      let touchTargets = { totalChecked: 0, compliantCount: 0, smallTargets: [] };
      if (vp.width <= 768) {
        touchTargets = await page.evaluate(() => {
          const interactive = Array.from(document.querySelectorAll('button, a, input, select, textarea, [role="button"]'));
          const small = [];
          let compliant = 0;

          for (const el of interactive) {
            const rect = el.getBoundingClientRect();
            // Ignorer les éléments invisibles ou masqués
            if (rect.width === 0 || rect.height === 0) continue;

            const isCompliant = (rect.width >= 44 && rect.height >= 44) || (rect.width * rect.height >= 44 * 44);
            if (isCompliant) {
              compliant++;
            } else {
              small.push({
                tag: el.tagName.toLowerCase(),
                text: (el.textContent || '').trim().slice(0, 30),
                width: Math.round(rect.width),
                height: Math.round(rect.height)
              });
            }
          }

          return {
            totalChecked: interactive.length,
            compliantCount: compliant,
            smallTargets: small.slice(0, 5) // limiter à 5 exemples
          };
        });
      }

      // 3. Capture d'écran
      const ssPath = path.join(screenshotsDir, `${vp.width}x${vp.height}.png`);
      await page.screenshot({ path: ssPath });

      const isPass = !overflowCheck.hasOverflow;
      if (isPass) {
        report.passedViewports++;
        console.log(`[PASS] Débordement: NON`);
      } else {
        console.log(`[CONSTAT] Débordement détecté (${overflowCheck.scrollWidth}px > ${overflowCheck.innerWidth}px)`);
      }

      report.results.push({
        viewport: `${vp.width}x${vp.height}`,
        name: vp.name,
        overflow: overflowCheck,
        touchTargets: vp.width <= 768 ? touchTargets : 'N/A (Desktop)',
        screenshot: path.relative(auditOutDir, ssPath)
      });

      await ctx.close();
    }
  } finally {
    await browser.close();
  }

  const outPath = path.join(auditOutDir, 'responsive_report.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`\n=> Rapport d'audit responsive généré : ${outPath}`);
  console.log(`Viewports conformes (sans débordement) : ${report.passedViewports} / ${report.totalViewportsTested}`);
  return report;
}

runResponsiveAudit().catch(err => {
  console.error('Erreur lors de l\'audit responsive :', err);
  process.exit(1);
});
