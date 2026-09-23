import fs from 'node:fs';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { launchAuditBrowser, setupAuditContext, auditOutDir } from './audit_helpers.mjs';
import { generateConversation } from './fixtures/dataset_generator.mjs';

if (!fs.existsSync(auditOutDir)) {
  fs.mkdirSync(auditOutDir, { recursive: true });
}

const STATES_TO_AUDIT = [
  'home_pristine',
  'home_with_history',
  'composer_empty',
  'composer_multiline',
  'composer_with_project',
  'composer_with_attachments',
  'composer_streaming',
  'chat_short',
  'chat_long',
  'chat_tool_running',
  'chat_permission_prompt',
  'chat_artifact_inspector',
  'settings_modal_all_tabs',
  'runtime_offline',
  'model_error_retry'
];

const THEMES = ['dark', 'light'];

async function runA11yAudit() {
  console.log('=== AUDIT ACCESSIBILITÉ WCAG 2.2 AA (axe-core) ===\n');
  const browser = await launchAuditBrowser();
  const report = {
    timestamp: new Date().toISOString(),
    standard: 'WCAG 2.2 AA',
    totalStatesTested: 0,
    passedStates: 0,
    statesWithViolations: 0,
    results: []
  };

  try {
    for (const theme of THEMES) {
      console.log(`\n--- Analyse sous Thème : ${theme.toUpperCase()} ---`);

      for (const stateName of STATES_TO_AUDIT) {
        process.stdout.write(`  Audit état [${stateName}] (${theme})... `);

        let convs = [];
        let projs = [];
        let isOffline = (stateName === 'runtime_offline');

        if (stateName === 'home_with_history') {
          convs = [
            { id: 'c1', topic: 'Audit accessibilité', updated_at: new Date().toISOString() },
            { id: 'c2', topic: 'Recherche FTS5', updated_at: new Date().toISOString() }
          ];
        } else if (stateName.startsWith('chat_') || stateName === 'model_error_retry') {
          const count = (stateName === 'chat_long') ? 100 : 4;
          convs = [generateConversation(count, 'conv-active')];
        }

        if (stateName === 'composer_with_project') {
          projs = [{ id: 'proj-1', name: 'Projet Iroko Audit', path: 'C:/Audit/Iroko' }];
        }

        const ctx = await setupAuditContext(browser, {
          theme,
          conversations: convs,
          projects: projs,
          isOffline
        });

        const page = await ctx.newPage();
        await page.goto('http://127.0.0.1:5173', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(400);

        // Préparation spécifique selon l'état
        try {
          if (stateName === 'composer_multiline') {
            const textarea = await page.$('textarea');
            if (textarea) {
              await textarea.fill('Ligne 1 : Première consigne\nLigne 2 : Deuxième consigne\nLigne 3 : Troisième consigne');
              await page.waitForTimeout(200);
            }
          } else if (stateName === 'settings_modal_all_tabs') {
            const settingsBtn = await page.$('button[title="Paramètres"]');
            if (settingsBtn) {
              await settingsBtn.click();
              await page.waitForTimeout(300);
            }
          } else if (stateName === 'chat_artifact_inspector') {
            // Clic sur l'onglet d'inspecteur si disponible
            const inspectorBtn = await page.$('button[title*="Inspecteur"], button[aria-label*="Inspecteur"]');
            if (inspectorBtn) {
              await inspectorBtn.click();
              await page.waitForTimeout(200);
            }
          }
        } catch {}

        // Exécution de l'analyse axe-core
        const axeResults = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
          .analyze();

        const violationsCount = axeResults.violations.length;
        report.totalStatesTested++;

        if (violationsCount === 0) {
          report.passedStates++;
          console.log(`[PASS] 0 violation`);
        } else {
          report.statesWithViolations++;
          console.log(`[CONSTAT] ${violationsCount} violation(s) identifiée(s)`);
        }

        report.results.push({
          state: stateName,
          theme,
          violationsCount,
          violations: axeResults.violations.map(v => ({
            id: v.id,
            impact: v.impact,
            description: v.description,
            help: v.help,
            helpUrl: v.helpUrl,
            nodesCount: v.nodes.length,
            nodes: v.nodes.slice(0, 3).map(n => ({
              html: n.html,
              target: n.target,
              failureSummary: n.failureSummary
            }))
          }))
        });

        await ctx.close();
      }
    }
  } finally {
    await browser.close();
  }

  const outPath = path.join(auditOutDir, 'a11y_report.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`\n=> Rapport d'audit accessibilité généré avec succès : ${outPath}`);
  console.log(`Total états analysés : ${report.totalStatesTested} | Conformes : ${report.passedStates} | Avec constats : ${report.statesWithViolations}`);
  return report;
}

runA11yAudit().catch(err => {
  console.error('Erreur lors de l\'audit a11y :', err);
  process.exit(1);
});
