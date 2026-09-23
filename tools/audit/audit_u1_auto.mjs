import fs from 'node:fs';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { launchAuditBrowser, setupAuditContext, rootDir } from './audit_helpers.mjs';
import { generateConversation } from './fixtures/dataset_generator.mjs';

const outDir = path.join(rootDir, 'docs', 'audit', 'a11y');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

// -------------------------------------------------------------
// 1. Matrice des contrastes basée sur les tokens de src/index.css
// -------------------------------------------------------------
function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  const bigint = parseInt(clean, 16);
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255
  };
}

function getLuminance(r, g, b) {
  const a = [r, g, b].map(v => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

function getContrastRatio(hex1, hex2) {
  const rgb1 = hexToRgb(hex1);
  const rgb2 = hexToRgb(hex2);
  const lum1 = getLuminance(rgb1.r, rgb1.g, rgb1.b);
  const lum2 = getLuminance(rgb2.r, rgb2.g, rgb2.b);
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  return Number(((brightest + 0.05) / (darkest + 0.05)).toFixed(2));
}

function analyzeTokenContrastMatrix() {
  // Tokens extraits de src/index.css
  const themes = {
    dark: {
      bgApp: '#151515',
      bgSidebar: '#181817',
      bgSurface: '#20201f',
      bgModal: '#1a1a19',
      borderSubtle: '#252524',
      borderActive: '#ededeb',
      borderFocusField: '#72706c',
      textPrimary: '#ededeb',
      textSecondary: '#bcbab5',
      textTertiary: '#959390',
      textDisabled: '#403f3e',
      textPlaceholder: '#959390'
    },
    light: {
      bgApp: '#ffffff',
      bgSidebar: '#fbfbfa',
      bgSurface: '#f4f4f2',
      bgModal: '#ffffff',
      borderSubtle: '#e8e8e5',
      borderActive: '#1a1a19',
      textPrimary: '#1a1a19',
      textSecondary: '#585755',
      textTertiary: '#878684',
      textDisabled: '#b0afa9',
      textPlaceholder: '#878684'
    }
  };

  const results = [];

  for (const [themeName, t] of Object.entries(themes)) {
    const pairs = [
      { role: 'Texte principal sur Fond App', fg: t.textPrimary, bg: t.bgApp, min: 4.5 },
      { role: 'Texte secondaire sur Fond App', fg: t.textSecondary, bg: t.bgApp, min: 4.5 },
      { role: 'Texte tertiaire / aide 12px sur Fond App', fg: t.textTertiary, bg: t.bgApp, min: 4.5 },
      { role: 'Placeholder composer sur Fond Surface', fg: t.textPlaceholder, bg: t.bgSurface, min: 4.5 },
      { role: 'Texte secondaire sur Fond Sidebar', fg: t.textSecondary, bg: t.bgSidebar, min: 4.5 },
      { role: 'Texte tertiaire sur Fond Sidebar', fg: t.textTertiary, bg: t.bgSidebar, min: 4.5 },
      { role: 'Texte désactivé sur Fond App', fg: t.textDisabled, bg: t.bgApp, min: 4.5, isExemptFromWcag: true },
      { role: 'Texte désactivé sur Fond Surface', fg: t.textDisabled, bg: t.bgSurface, min: 4.5, isExemptFromWcag: true },
      { role: 'Bordure active de focus sur Fond App', fg: t.borderActive, bg: t.bgApp, min: 3.0 },
      { role: 'Bordure active de focus sur Fond Surface', fg: t.borderActive, bg: t.bgSurface, min: 3.0 },
      { role: 'Bordure subtile séparateur sur Fond App', fg: t.borderSubtle, bg: t.bgApp, min: 3.0, isNonTextComponent: true }
    ];

    for (const p of pairs) {
      const ratio = getContrastRatio(p.fg, p.bg);
      const passes = ratio >= p.min;
      results.push({
        theme: themeName,
        role: p.role,
        fg: p.fg,
        bg: p.bg,
        ratio,
        requiredMin: p.min,
        status: passes ? 'CONFORME' : (p.isExemptFromWcag ? 'ÉXEMPTÉ_DISAB' : 'ÉCHEC'),
        impact: passes ? 'AUCUN' : (p.isExemptFromWcag ? 'INFORMATIF' : 'CRITIQUE')
      });
    }
  }

  return results;
}

// -------------------------------------------------------------
// 2. Mesure précise des tailles de cibles interactives
// -------------------------------------------------------------
async function measureInteractiveTargets(page, viewportName) {
  return await page.evaluate((vpName) => {
    const selector = 'button, a, input, select, textarea, [role="button"], [role="tab"], [role="switch"]';
    const elements = Array.from(document.querySelectorAll(selector));
    const items = [];

    for (const el of elements) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue; // Masqué

      const label = el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent.trim().slice(0, 35) || el.tagName.toLowerCase();
      const width = Math.round(rect.width);
      const height = Math.round(rect.height);

      let status = 'CONFORME';
      if (width < 24 || height < 24) {
        status = 'ÉCHEC_CRITIQUE_24PX'; // Échec formel WCAG 2.2 AA (critère 2.5.8)
      } else if (width < 44 || height < 44) {
        status = 'AVERTISSEMENT_TACTILE_44PX'; // Recommandation tactile AAA / ergonomique 2.5.5
      }

      items.push({
        viewport: vpName,
        tag: el.tagName.toLowerCase(),
        label: label.replace(/\s+/g, ' '),
        width,
        height,
        status
      });
    }

    return items;
  }, viewportName);
}

// -------------------------------------------------------------
// 3. Exécution axe-core multi-matrices & forced-colors
// -------------------------------------------------------------
async function runAutoA11yAudit() {
  console.log('=== DÉMARRAGE MISSION U1 : AUDIT AUTOMATISÉ ===\n');

  // Matrice des contrastes
  console.log('1. Calcul de la matrice des contrastes des tokens...');
  const contrastMatrix = analyzeTokenContrastMatrix();
  const contrastFailures = contrastMatrix.filter(c => c.status === 'ÉCHEC');
  console.log(`   Tokens analysés : ${contrastMatrix.length} couples | Échecs identifiés : ${contrastFailures.length}`);

  const browser = await launchAuditBrowser();

  const VIEWPORTS = [
    { width: 320, height: 568, name: '320' },
    { width: 768, height: 1024, name: '768' },
    { width: 1440, height: 900, name: '1440' }
  ];

  const STATES = [
    'home_pristine',
    'chat_active',
    'settings_open'
  ];

  const THEMES = ['dark', 'light'];
  const axeResultsSummary = [];
  const targetMeasurements = [];

  try {
    for (const vp of VIEWPORTS) {
      for (const theme of THEMES) {
        for (const state of STATES) {
          process.stdout.write(`2. axe-core sur [${state}] [${theme}] [${vp.name}px]... `);

          const convs = (state === 'chat_active') ? [generateConversation(5, 'conv-u1')] : [];
          const ctx = await setupAuditContext(browser, {
            theme,
            viewport: { width: vp.width, height: vp.height },
            conversations: convs
          });

          const page = await ctx.newPage();
          await page.goto('http://127.0.0.1:5173', { waitUntil: 'domcontentloaded' });
          await page.waitForTimeout(350);

          if (state === 'settings_open') {
            const btn = await page.$('button[title="Paramètres"]');
            if (btn) {
              await btn.click().catch(() => {});
              await page.waitForTimeout(300);
            }
          }

          // Mesure des cibles interactives pour 375 (approché à 320/768) et 1440
          if (vp.name === '320' || vp.name === '1440') {
            const targets = await measureInteractiveTargets(page, vp.name);
            targetMeasurements.push(...targets);
          }

          // Exécution axe-core
          const axeResults = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
            .analyze();

          axeResultsSummary.push({
            state,
            theme,
            viewport: vp.name,
            forcedColors: false,
            violationsCount: axeResults.violations.length,
            violations: axeResults.violations.map(v => ({
              id: v.id,
              impact: v.impact,
              description: v.description,
              nodesCount: v.nodes.length,
              targets: v.nodes.map(n => n.target)
            }))
          });

          console.log(`${axeResults.violations.length} violation(s)`);
          await ctx.close();
        }
      }
    }

    // Test avec forced-colors: active
    console.log('\n3. Analyse avec forced-colors: active (mode Contraste Élevé)...');
    const forcedCtx = await setupAuditContext(browser, {
      theme: 'dark',
      viewport: { width: 1440, height: 900 }
    });
    const forcedPage = await forcedCtx.newPage();
    await forcedPage.emulateMedia({ forcedColors: 'active', colorScheme: 'dark' });
    await forcedPage.goto('http://127.0.0.1:5173', { waitUntil: 'domcontentloaded' });
    await forcedPage.waitForTimeout(400);

    const forcedAxe = await new AxeBuilder({ page: forcedPage })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();

    axeResultsSummary.push({
      state: 'home_pristine',
      theme: 'forced-colors-active',
      viewport: '1440',
      forcedColors: true,
      violationsCount: forcedAxe.violations.length,
      violations: forcedAxe.violations.map(v => ({
        id: v.id,
        impact: v.impact,
        description: v.description,
        nodesCount: v.nodes.length,
        targets: v.nodes.map(n => n.target)
      }))
    });
    console.log(`   forced-colors: active terminé : ${forcedAxe.violations.length} violation(s)`);
    await forcedCtx.close();

  } finally {
    await browser.close();
  }

  // Enregistrement des résultats bruts
  const autoReport = {
    timestamp: new Date().toISOString(),
    contrastMatrix,
    contrastFailures,
    axeResultsSummary,
    targetMeasurements
  };

  const rawPath = path.join(outDir, 'auto_results.json');
  fs.writeFileSync(rawPath, JSON.stringify(autoReport, null, 2), 'utf-8');
  console.log(`\n=> Résultats bruts enregistrés dans : ${rawPath}`);
  return autoReport;
}

runAutoA11yAudit().catch(err => {
  console.error('Erreur audit auto :', err);
  process.exit(1);
});
