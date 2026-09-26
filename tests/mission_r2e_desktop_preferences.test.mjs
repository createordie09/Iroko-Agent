import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

test('MISSION R2e — 1. Démarrage automatique au niveau Electron et persistance SQLite', async () => {
  const { runtimeDatabase } = await import('../server/storage/RuntimeDatabase.ts');

  // Par défaut, le réglage launch_on_startup doit être absent ou falsy (désactivé par défaut)
  runtimeDatabase.deleteSetting('launch_on_startup');
  assert.equal(runtimeDatabase.getSetting('launch_on_startup'), null, 'Le réglage launch_on_startup doit être absent initialement');

  // Vérification de la prise en charge native dans electron/main.ts
  const electronMain = fs.readFileSync(path.join(ROOT_DIR, 'electron', 'main.ts'), 'utf8');
  assert.ok(electronMain.includes('setLoginItemSettings'), 'electron/main.ts doit utiliser l\'API native setLoginItemSettings');
  assert.ok(electronMain.includes('getLoginItemSettings'), 'electron/main.ts doit utiliser l\'API native getLoginItemSettings');
  assert.ok(electronMain.includes('set-auto-launch'), 'electron/main.ts doit exposer le gestionnaire IPC set-auto-launch');

  // Simulation d'activation par l'utilisateur
  runtimeDatabase.setSetting('launch_on_startup', true);
  assert.equal(runtimeDatabase.getSetting('launch_on_startup'), true, 'Le réglage doit être persisté dans SQLite à true');
});

test('MISSION R2e — 2. Fermeture par défaut inchangée et réduction en zone de notification', async () => {
  const { runtimeDatabase } = await import('../server/storage/RuntimeDatabase.ts');

  // Par défaut, minimize_to_tray est absent ou false
  runtimeDatabase.deleteSetting('minimize_to_tray');
  assert.equal(runtimeDatabase.getSetting('minimize_to_tray'), null, 'Le réglage minimize_to_tray doit être absent initialement');

  const electronMain = fs.readFileSync(path.join(ROOT_DIR, 'electron', 'main.ts'), 'utf8');

  // Comportement par défaut inchangé : fermeture fenêtre arrête le runtime
  assert.ok(electronMain.includes('closeToTray && !isQuitting'), 'La réduction ne doit s\'appliquer que si closeToTray est actif');
  assert.ok(electronMain.includes('shutdownFn'), 'L\'arrêt ordonné du runtime doit être appelé si closeToTray est inactif');

  // Menu de notification sobre : Ouvrir Iroko / Quitter
  assert.ok(electronMain.includes('Ouvrir Iroko'), 'Le menu de la zone de notification doit proposer d\'ouvrir Iroko');
  assert.ok(electronMain.includes('Quitter'), 'Le menu de la zone de notification doit proposer de quitter');
  assert.ok(electronMain.includes('Tray'), 'electron/main.ts doit instancier la classe Tray native');
});

test('MISSION R2e — 3. Zéro capacité simulée : désactivation explicite hors bureau ou plateforme sans tray', () => {
  const hookSource = fs.readFileSync(path.join(ROOT_DIR, 'src', 'hooks', 'settings', 'useDesktopSettings.ts'), 'utf8');
  assert.ok(hookSource.includes('canAutoLaunch'), 'Le hook doit évaluer la capacité réelle de démarrage automatique');
  assert.ok(hookSource.includes('canTray'), 'Le hook doit évaluer le support réel de la zone de notification');

  const sectionSource = fs.readFileSync(path.join(ROOT_DIR, 'src', 'features', 'settings', 'pages', 'DesktopPreferencesSection.tsx'), 'utf8');

  // Raison explicite si non supporté ou mode web
  assert.ok(
    sectionSource.includes("Disponible uniquement dans l'application de bureau Iroko"),
    'Le texte d\'aide doit expliciter la raison pour le mode web sans simuler l\'action'
  );

  // Absence de pointer-events-none sur les éléments désactivés (Règle d\'or accessibilité)
  assert.ok(!sectionSource.includes('pointer-events-none'), 'Aucun pointer-events-none ne doit être appliqué sur le switch');

  // Réduire dans la zone de notification visible uniquement si le système d'exploitation le permet proprement (R2e.2)
  assert.ok(sectionSource.includes('{canTray && ('), 'La section tray ne doit être rendue que si le système le supporte proprement');
});

test('MISSION R2e — 4. Respect du design system, des tokens et de l\'étiquette [À VALIDER]', () => {
  const sectionSource = fs.readFileSync(path.join(ROOT_DIR, 'src', 'features', 'settings', 'pages', 'DesktopPreferencesSection.tsx'), 'utf8');

  // Zéro couleur d'accent vive (Règle permanente 3)
  assert.ok(!/bg-blue|bg-indigo|bg-purple|bg-emerald|text-blue|text-indigo|text-purple/.test(sectionSource), 'Aucune couleur d\'accent vive admise');

  // Respect des tokens CSS
  assert.ok(sectionSource.includes('var(--bg-app)'), 'Doit utiliser le token --bg-app');
  assert.ok(sectionSource.includes('var(--bg-active)'), 'Doit utiliser le token --bg-active');
  assert.ok(sectionSource.includes('var(--text-primary)'), 'Doit utiliser le token --text-primary');
  assert.ok(sectionSource.includes('var(--border-subtle)'), 'Doit utiliser le token --border-subtle');

  // Balise [À VALIDER]
  assert.ok(sectionSource.includes('[À VALIDER]'), 'Le bloc doit porter l\'étiquette de validation visuelle');

  // Accessibilité du switch (WCAG 4.1.2)
  assert.ok(sectionSource.includes('role="switch"'), 'Les contrôles doivent être déclarés role="switch"');
  assert.ok(sectionSource.includes('aria-checked'), 'L\'état doit être transmis via aria-checked');
});

test('MISSION R2e — 5. Intégration modulaire dans PreferencesPage et maintien du plafond de 400 lignes', () => {
  const pageSource = fs.readFileSync(path.join(ROOT_DIR, 'src', 'features', 'settings', 'pages', 'PreferencesPage.tsx'), 'utf8');
  assert.ok(pageSource.includes('DesktopPreferencesSection'), 'PreferencesPage doit intégrer DesktopPreferencesSection');

  const lines = pageSource.split('\n').length;
  assert.ok(lines < 400, `PreferencesPage doit rester strictement sous 400 lignes (actuel : ${lines})`);

  const hookLines = fs.readFileSync(path.join(ROOT_DIR, 'src', 'hooks', 'settings', 'useDesktopSettings.ts'), 'utf8').split('\n').length;
  assert.ok(hookLines < 400, `useDesktopSettings doit rester strictement sous 400 lignes (actuel : ${hookLines})`);

  const sectionLines = fs.readFileSync(path.join(ROOT_DIR, 'src', 'features', 'settings', 'pages', 'DesktopPreferencesSection.tsx'), 'utf8').split('\n').length;
  assert.ok(sectionLines < 400, `DesktopPreferencesSection doit rester strictement sous 400 lignes (actuel : ${sectionLines})`);
});
