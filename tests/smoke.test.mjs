import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

test('Contrôle d\'intégrité des documents et références', () => {
  assert.ok(fs.existsSync('docs/PLAN_EXECUTION.md'), 'docs/PLAN_EXECUTION.md manquant');
  assert.ok(fs.existsSync('docs/FEATURES.md'), 'docs/FEATURES.md manquant');
  assert.ok(fs.existsSync('docs/ROADMAP.md'), 'docs/ROADMAP.md manquant');
  assert.ok(fs.existsSync('docs/UI_ARCHITECTURE.md'), 'docs/UI_ARCHITECTURE.md manquant');
});

test('Vérification de la présence des 5 captures de référence UI', () => {
  const refFiles = [
    '1920_accueil_sidebar_ouverte.png',
    '1920_accueil_sidebar_repliee.png',
    '1920_parametres.png',
    '375_accueil.png',
    '375_tiroir_ouvert.png'
  ];
  for (const f of refFiles) {
    const p = path.join('docs', 'ui-reference', f);
    assert.ok(fs.existsSync(p), `Référence UI manquante : ${f}`);
  }
});
