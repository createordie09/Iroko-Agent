import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..', '..');
const auditDir = path.join(rootDir, 'docs', 'audit');

console.log('====================================================');
console.log('       ORCHESTRATION GLOBALE DES AUDITS UX (U0)    ');
console.log('====================================================\n');

const scripts = [
  { name: 'Accessibilité WCAG 2.2 AA (axe-core)', file: 'tools/audit/audit_a11y.mjs' },
  { name: 'Performances & Core Web Vitals', file: 'tools/audit/audit_perf.mjs' },
  { name: 'Responsive & Matrice Viewports', file: 'tools/audit/audit_responsive.mjs' },
  { name: 'Parcours des Tâches Clés UX', file: 'tools/audit/audit_tasks.mjs' }
];

const auditResults = {
  startedAt: new Date().toISOString(),
  scripts: []
};

for (const s of scripts) {
  console.log(`\n>>> Lancement de : ${s.name}...`);
  const t0 = Date.now();
  try {
    execSync(`node ${s.file}`, {
      cwd: rootDir,
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'test', IROKO_TEST_MODE: '1' }
    });
    const dur = Date.now() - t0;
    auditResults.scripts.push({ name: s.name, status: 'PASS', durationMs: dur });
  } catch (err) {
    const dur = Date.now() - t0;
    auditResults.scripts.push({ name: s.name, status: 'ERROR', durationMs: dur, error: err.message });
  }
}

// Lecture et consolidation des rapports
let a11yData = {}, perfData = {}, responsiveData = {}, tasksData = {};
try { a11yData = JSON.parse(fs.readFileSync(path.join(auditDir, 'a11y_report.json'), 'utf-8')); } catch {}
try { perfData = JSON.parse(fs.readFileSync(path.join(auditDir, 'perf_report.json'), 'utf-8')); } catch {}
try { responsiveData = JSON.parse(fs.readFileSync(path.join(auditDir, 'responsive_report.json'), 'utf-8')); } catch {}
try { tasksData = JSON.parse(fs.readFileSync(path.join(auditDir, 'tasks_report.json'), 'utf-8')); } catch {}

const summary = {
  completedAt: new Date().toISOString(),
  overview: {
    a11y: {
      totalStatesTested: a11yData.totalStatesTested || 0,
      passedStates: a11yData.passedStates || 0,
      statesWithViolations: a11yData.statesWithViolations || 0
    },
    perf: {
      bundleSizeKo: perfData.bundle?.initialJsKo || 'N/A',
      bundleWithinBudget: perfData.bundle?.isWithinBudget ?? false,
      lcpMs: perfData.vitals?.lcpMs || 'N/A',
      clsScore: perfData.vitals?.clsScore || 'N/A',
      inpMs: perfData.vitals?.simulatedInpMs || 'N/A'
    },
    responsive: {
      totalTested: responsiveData.totalViewportsTested || 0,
      passed: responsiveData.passedViewports || 0
    },
    tasks: {
      totalTasks: tasksData.tasks?.length || 0,
      allSucceeded: tasksData.tasks?.every(t => t.success) ?? false
    }
  },
  executions: auditResults.scripts
};

fs.writeFileSync(path.join(auditDir, 'summary.json'), JSON.stringify(summary, null, 2), 'utf-8');

// Génération de la synthèse Markdown
const mdContent = `# Synthèse Consolidée des Audits UX 2026 (\`docs/audit/AUDIT_SUMMARY.md\`)

Document d'état des lieux initial généré automatiquement par \`npm run audit:all\` à la date du **${new Date().toLocaleString('fr-FR')}**.

---

## 1. Accessibilité (axe-core / WCAG 2.2 AA)
- **États testés** : ${summary.overview.a11y.totalStatesTested} (15 états × Thème Sombre & Thème Clair).
- **États 100% conformes sans violation** : ${summary.overview.a11y.passedStates}.
- **États avec constats identifiés pour U1+** : ${summary.overview.a11y.statesWithViolations}.
- Détails complets disponibles dans [\`docs/audit/a11y_report.json\`](./a11y_report.json).

## 2. Performances & Core Web Vitals
- **Taille Bundle JS initial** : ${summary.overview.perf.bundleSizeKo} Ko (Budget : ≤ 250 Ko) — ${summary.overview.perf.bundleWithinBudget ? 'Conforme' : 'Dépassement'}.
- **LCP (Largest Contentful Paint)** : ${summary.overview.perf.lcpMs} ms (Budget : ≤ 1200 ms).
- **CLS (Cumulative Layout Shift)** : ${summary.overview.perf.clsScore} (Budget : = 0.000).
- **INP (Interaction to Next Paint simulé)** : ${summary.overview.perf.inpMs} ms (Budget : ≤ 50 ms).
- Détails complets disponibles dans [\`docs/audit/perf_report.json\`](./perf_report.json).

## 3. Responsive & Viewports
- **Viewports testés** : ${summary.overview.responsive.totalTested} (de 320×568 à 2560×1440).
- **Résolutions sans débordement horizontal** : ${summary.overview.responsive.passed} / ${summary.overview.responsive.totalTested}.
- Captures d'écran archivées dans [\`docs/audit/screenshots/responsive/\`](./screenshots/responsive/).
- Détails complets dans [\`docs/audit/responsive_report.json\`](./responsive_report.json).

## 4. Parcours des Tâches Clés
- **Tâches évaluées** : ${summary.overview.tasks.totalTasks} / 5.
- **Statut d'exécution de bout en bout** : ${summary.overview.tasks.allSucceeded ? 'Succès 100%' : 'Erreurs identifiées'}.
- Détails complets dans [\`docs/audit/tasks_report.json\`](./tasks_report.json).
`;

fs.writeFileSync(path.join(auditDir, 'AUDIT_SUMMARY.md'), mdContent, 'utf-8');

console.log('\n====================================================');
console.log('   SYNTHÈSE GLOBALE GÉNÉRÉE : docs/audit/summary.json');
console.log('   RAPPORT MARKDOWN : docs/audit/AUDIT_SUMMARY.md');
console.log('====================================================\n');
