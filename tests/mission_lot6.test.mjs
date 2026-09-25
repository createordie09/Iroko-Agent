import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
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

test('Mission Lot 6 - 3. Remplacement du sondage actif par événement WebSocket (Point 3)', async () => {
  // 3.1 Déclaration de l'événement agent_status_changed dans les types serveur
  const eventsTypes = fs.readFileSync(path.join(rootDir, 'server', 'types', 'events.ts'), 'utf-8');
  assert.ok(eventsTypes.includes("type: 'agent_status_changed'"), 'server/types/events.ts doit déclarer agent_status_changed');

  // 3.2 Implémentation et diffusion dans server/index.ts
  const serverIndex = fs.readFileSync(path.join(rootDir, 'server', 'index.ts'), 'utf-8');
  assert.ok(serverIndex.includes('function broadcastActiveTasksStatus('), 'server/index.ts doit comporter broadcastActiveTasksStatus');
  assert.ok(serverIndex.includes("type: 'agent_status_changed'"), 'broadcastActiveTasksStatus doit diffuser l\'événement');

  // 3.3 IrokoAgentClient fournit isConnected()
  const agentClientCode = fs.readFileSync(path.join(rootDir, 'src', 'lib', 'agent-client.ts'), 'utf-8');
  assert.ok(agentClientCode.includes('public isConnected(): boolean'), 'IrokoAgentClient doit exposer la méthode isConnected()');

  // 3.4 ClaudeSidebar écoute agent_status_changed et ne fait plus de polling actif régulier
  const sidebarCode = fs.readFileSync(path.join(rootDir, 'src', 'components', 'layout', 'ClaudeSidebar.tsx'), 'utf-8');
  assert.ok(sidebarCode.includes("event.type === 'agent_status_changed'"), 'ClaudeSidebar doit écouter agent_status_changed');
  assert.ok(!sidebarCode.includes('setInterval(fetchActive, 3000)'), 'ClaudeSidebar ne doit plus poller active-tasks toutes les 3s');
  assert.ok(!sidebarCode.includes('setInterval(fetchActive, 2500)'), 'ClaudeSidebar ne doit plus poller active-tasks toutes les 2.5s');
});

test('Mission Lot 6 - 4. Allègement du bundle initial et imports dynamiques (Point 4)', async () => {
  // 4.1 ZyriconAppShell implémente le chargement dynamique via lazy / Suspense
  const shellCode = fs.readFileSync(path.join(rootDir, 'src', 'components', 'layout', 'ZyriconAppShell.tsx'), 'utf-8');
  assert.ok(shellCode.includes("const ClaudeSettingsModal = lazy("), 'ZyriconAppShell doit charger ClaudeSettingsModal avec lazy()');
  assert.ok(shellCode.includes("const ClaudeChat = lazy("), 'ZyriconAppShell doit charger ClaudeChat avec lazy()');
  assert.ok(shellCode.includes("<Suspense"), 'ZyriconAppShell doit envelopper les composants différés avec Suspense');

  // 4.2 Vérification des chunks générés dans dist/assets/
  const distAssetsDir = path.join(rootDir, 'dist', 'assets');
  if (!fs.existsSync(distAssetsDir)) {
    try {
      execSync('npm run build:client', { cwd: rootDir, stdio: 'ignore' });
    } catch {}
  }
  assert.ok(fs.existsSync(distAssetsDir), 'Le dossier dist/assets doit exister (exécuter "npm run build" au préalable ou passer par "npm test")');
  const files = fs.readdirSync(distAssetsDir);

  const modalChunk = files.find(f => f.startsWith('ClaudeSettingsModal') && f.endsWith('.js'));
  assert.ok(modalChunk, 'Un chunk séparé pour ClaudeSettingsModal doit exister dans dist/assets');

  const chatChunk = files.find(f => f.startsWith('ClaudeChat') && f.endsWith('.js'));
  assert.ok(chatChunk, 'Un chunk séparé pour ClaudeChat doit exister dans dist/assets');

  const mainChunk = files.find(f => f.startsWith('index') && f.endsWith('.js'));
  assert.ok(mainChunk, 'Le chunk initial index.js doit exister');
  const mainChunkStat = fs.statSync(path.join(distAssetsDir, mainChunk));
  const mainChunkKo = mainChunkStat.size / 1024;
  assert.ok(mainChunkKo < 450, `Le chunk initial (${mainChunkKo.toFixed(1)} Ko) doit être strictement inférieur à 450 Ko`);
});



