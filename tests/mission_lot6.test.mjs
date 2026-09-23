import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runLintFr } from '../scripts/lint_fr.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

test('Mission Lot 6 - 1. Typographie française et script lint:fr (Point 1)', async () => {
  // 1.1 Le script npm run lint:fr existe dans package.json
  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf-8'));
  assert.ok(pkg.scripts['lint:fr'], 'package.json doit comporter le script "lint:fr"');

  // 1.2 Le linter de typographie française doit passer avec 0 violation
  const lintResult = runLintFr({ exitOnError: false });
  assert.strictEqual(lintResult, true, 'npm run lint:fr doit détecter 0 violation sur le code source');

  // 1.3 Vérification ciblée des espaces insécables (\u00A0) dans les composants clés
  const composerCode = fs.readFileSync(path.join(rootDir, 'src', 'components', 'composer', 'ClaudeComposer.tsx'), 'utf-8');
  assert.ok(composerCode.includes("Comment puis-je vous aider aujourd'hui\\u00A0?"), 'ClaudeComposer doit comporter une espace insécable avant ?');
  assert.ok(composerCode.includes("Limite dépassée\\u00A0:"), 'ClaudeComposer doit comporter une espace insécable avant :');

  const privacyCode = fs.readFileSync(path.join(rootDir, 'src', 'features', 'settings', 'pages', 'PrivacyPage.tsx'), 'utf-8');
  assert.ok(privacyCode.includes("toutes les discussions{'\\u00A0'}?"), 'PrivacyPage doit comporter une espace insécable avant ?');
  assert.ok(privacyCode.includes("Copié{'\\u00A0'}!"), 'PrivacyPage doit comporter une espace insécable avant !');
  assert.ok(privacyCode.includes("Iroko{'\\u00A0'}:"), 'PrivacyPage doit comporter une espace insécable avant :');

  const storageCode = fs.readFileSync(path.join(rootDir, 'src', 'features', 'settings', 'pages', 'StorageBreakdownSection.tsx'), 'utf-8');
  assert.ok(storageCode.includes("«{'\\u00A0'}"), 'StorageBreakdownSection doit comporter une espace insécable après «');
  assert.ok(storageCode.includes("{'\\u00A0'}»{'\\u00A0'}?"), 'StorageBreakdownSection doit comporter une espace insécable avant » et ?');
});

test('Mission Lot 6 - 2. Terminologie "Discussion" et Glossaire UX (Point 2)', async () => {
  // 2.1 ClaudeComposer.tsx utilise "discussion" et non "conversation" dans l'alerte de verrou
  const composerCode = fs.readFileSync(path.join(rootDir, 'src', 'components', 'composer', 'ClaudeComposer.tsx'), 'utf-8');
  assert.ok(composerCode.includes("une autre discussion détient le verrou"), 'ClaudeComposer doit utiliser "discussion" pour le verrou');
  assert.ok(!composerCode.includes("une autre conversation détient le verrou"), 'ClaudeComposer ne doit plus contenir "conversation" pour le verrou');

  // 2.2 PreferencesPage.tsx utilise "Police de la discussion"
  const prefCode = fs.readFileSync(path.join(rootDir, 'src', 'features', 'settings', 'pages', 'PreferencesPage.tsx'), 'utf-8');
  assert.ok(prefCode.includes("Police de la discussion"), 'PreferencesPage doit afficher "Police de la discussion"');
  assert.ok(!prefCode.includes("Police de la conversation"), 'PreferencesPage ne doit plus afficher "Police de la conversation"');

  // 2.3 docs/UX_STANDARDS.md intègre le Glossaire Normé
  const uxStandards = fs.readFileSync(path.join(rootDir, 'docs', 'UX_STANDARDS.md'), 'utf-8');
  assert.ok(uxStandards.includes("## 11. Glossaire Normé de Microcopie"), 'docs/UX_STANDARDS.md doit comporter la section Glossaire Normé');
  assert.ok(uxStandards.includes("**Discussion**"), 'Le glossaire doit définir "Discussion"');
  assert.ok(uxStandards.includes("**Dossier**"), 'Le glossaire doit définir "Dossier"');
  assert.ok(uxStandards.includes("**Projet**"), 'Le glossaire doit définir "Projet"');
  assert.ok(uxStandards.includes("**Artéfact**"), 'Le glossaire doit définir "Artéfact"');
});

