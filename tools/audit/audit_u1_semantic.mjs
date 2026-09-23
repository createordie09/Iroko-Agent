import fs from 'node:fs';
import path from 'node:path';
import { launchAuditBrowser, setupAuditContext, rootDir } from './audit_helpers.mjs';
import { generateConversation } from './fixtures/dataset_generator.mjs';

const outDir = path.join(rootDir, 'docs', 'audit', 'a11y');

async function runSemanticAudit() {
  console.log('=== DÉMARRAGE MISSION U1 : AUDIT SÉMANTIQUE ET ARIA ===\n');
  const browser = await launchAuditBrowser();

  const semanticFindings = {
    timestamp: new Date().toISOString(),
    documentChecks: {},
    landmarks: {},
    headingHierarchy: [],
    iconButtonsAccessibleNames: [],
    ariaStates: {},
    inspecteurTabs: {},
    disabledButtonsReason: []
  };

  try {
    const ctx = await setupAuditContext(browser, {
      theme: 'dark',
      viewport: { width: 1440, height: 900 },
      conversations: [
        generateConversation(4, 'conv-active')
      ]
    });

    const page = await ctx.newPage();
    await page.goto('http://127.0.0.1:5173', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(400);

    // 1. Contrôles au niveau du document
    const docMeta = await page.evaluate(() => {
      const htmlLang = document.documentElement.getAttribute('lang');
      const title = document.title;
      return { htmlLang, title };
    });
    semanticFindings.documentChecks = {
      lang: docMeta.htmlLang,
      hasLangFr: docMeta.htmlLang === 'fr',
      title: docMeta.title,
      proof: 'MESURÉ'
    };
    console.log(`Document lang: "${docMeta.htmlLang}" | title: "${docMeta.title}"`);

    // 2. Repères sémantiques HTML5 (Landmarks)
    const landmarks = await page.evaluate(() => {
      return {
        hasNav: Boolean(document.querySelector('nav')),
        hasMain: Boolean(document.querySelector('main')),
        hasAside: Boolean(document.querySelector('aside')),
        hasHeader: Boolean(document.querySelector('header')),
        navCount: document.querySelectorAll('nav').length,
        mainCount: document.querySelectorAll('main').length,
        asideCount: document.querySelectorAll('aside').length
      };
    });
    semanticFindings.landmarks = { ...landmarks, proof: 'OBSERVÉ' };
    console.log(`Landmarks: nav=${landmarks.navCount}, main=${landmarks.mainCount}, aside=${landmarks.asideCount}`);

    // 3. Hiérarchie des titres (h1 à h6)
    const headings = await page.evaluate(() => {
      const hList = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"]'));
      return hList.map(h => ({
        tag: h.tagName.toLowerCase(),
        level: h.getAttribute('aria-level') || h.tagName.slice(1),
        text: h.textContent.trim().slice(0, 40)
      }));
    });
    semanticFindings.headingHierarchy = headings;
    console.log(`Titres détectés : ${headings.length}`);

    // 4. Noms accessibles sur tous les boutons à icône seule
    const iconButtons = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const results = [];
      for (const b of btns) {
        // Bouton contenant un SVG
        const hasSvg = Boolean(b.querySelector('svg'));
        const text = (b.textContent || '').trim();
        const ariaLabel = b.getAttribute('aria-label');
        const title = b.getAttribute('title');
        const accessibleName = ariaLabel || title || text;

        if (hasSvg && text.length === 0) {
          results.push({
            accessibleName: accessibleName || 'SANS_NOM_ACCESSIBLE',
            hasAriaLabel: Boolean(ariaLabel),
            hasTitle: Boolean(title),
            hasText: false,
            status: Boolean(accessibleName) ? 'CONFORME' : 'VIOLATION_NOM_MANQUANT'
          });
        }
      }
      return results;
    });
    semanticFindings.iconButtonsAccessibleNames = iconButtons;
    const missingNames = iconButtons.filter(b => b.status === 'VIOLATION_NOM_MANQUANT');
    console.log(`Boutons d'icône analysés : ${iconButtons.length} | Sans nom accessible : ${missingNames.length}`);

    // 5. Arbre d'accessibilité via CDP
    try {
      const cdp = await ctx.newCDPSession(page);
      const axTree = await cdp.send('Accessibility.getFullAXTree');
      const treePath = path.join(outDir, 'accessibility_tree_snapshot.json');
      fs.writeFileSync(treePath, JSON.stringify(axTree, null, 2), 'utf-8');
      console.log(`Arbre d'accessibilité archivé dans : ${treePath}`);
    } catch (e) {
      console.log('Capture AXTree CDP ignorée ou non supportée');
    }

    // 6. Examen des boutons désactivés et raisons accessibles
    const disabledButtons = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button[disabled], button[aria-disabled="true"]'));
      return btns.map(b => ({
        label: b.getAttribute('aria-label') || b.getAttribute('title') || b.textContent.trim().slice(0, 30),
        disabled: b.disabled,
        ariaDisabled: b.getAttribute('aria-disabled'),
        titleReason: b.getAttribute('title') || b.getAttribute('aria-description') || 'AUCUNE_RAISON_FOURNIE'
      }));
    });
    semanticFindings.disabledButtonsReason = disabledButtons;

    await ctx.close();
  } finally {
    await browser.close();
  }

  const reportPath = path.join(outDir, 'semantic_results.json');
  fs.writeFileSync(reportPath, JSON.stringify(semanticFindings, null, 2), 'utf-8');
  console.log(`\n=> Résultats de l'audit sémantique enregistrés dans : ${reportPath}`);
  return semanticFindings;
}

runSemanticAudit().catch(err => {
  console.error('Erreur audit sémantique :', err);
  process.exit(1);
});
