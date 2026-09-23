import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

test('Mission Lot 7 - 1. Optimisation content-visibility: auto sur les messages (Point 1)', async () => {
  // 1.1 Règle CSS dans src/index.css
  const indexCss = fs.readFileSync(path.join(rootDir, 'src', 'index.css'), 'utf-8');
  assert.ok(indexCss.includes('.message-content-visibility'), 'src/index.css doit définir .message-content-visibility');
  assert.ok(indexCss.includes('content-visibility: auto'), 'La classe doit spécifier content-visibility: auto');
  assert.ok(indexCss.includes('contain-intrinsic-size: auto 120px'), 'La classe doit spécifier contain-intrinsic-size: auto 120px');

  // 1.2 Application conditionnelle dans ClaudeChat.tsx (sauf les 6 derniers messages)
  const chatCode = fs.readFileSync(path.join(rootDir, 'src', 'features', 'chat', 'ClaudeChat.tsx'), 'utf-8');
  assert.ok(chatCode.includes('idx < activeMessages.length - 6'), 'ClaudeChat doit exclure les 6 derniers messages');
  assert.ok(chatCode.includes('message-content-visibility'), 'ClaudeChat doit appliquer la classe message-content-visibility');
  assert.ok(chatCode.includes('data-message-id='), 'Les messages doivent disposer d\'un identifiant d\'ancrage');
});

test('Mission Lot 7 - 2. Mesures de performance 200 et 1000 messages & proposition de conception (Point 2)', async () => {
  // 2.1 Fichier de benchmark généré
  const benchmarkPath = path.join(rootDir, 'docs', 'audit', 'perf', 'long_conversations_benchmark.json');
  assert.ok(fs.existsSync(benchmarkPath), 'long_conversations_benchmark.json doit exister');
  const data = JSON.parse(fs.readFileSync(benchmarkPath, 'utf-8'));
  assert.equal(data.length, 4, 'Le benchmark doit comporter 4 scénarios (200 et 1000 messages à CPU ×1 et ×4)');

  for (const entry of data) {
    assert.ok(entry.droppedFramesPct <= 5.0, `Images perdues (${entry.droppedFramesPct}%) doivent être <= 5%`);
    assert.ok(entry.domNodeCount > 1000, 'Les messages réels doivent être rendus dans le DOM');
  }

  // 2.2 Branchement loadConversation dans AppContext et Sidebar
  const appContextCode = fs.readFileSync(path.join(rootDir, 'src', 'context', 'AppContext.tsx'), 'utf-8');
  assert.ok(appContextCode.includes('loadConversation'), 'AppContext doit définir et exposer loadConversation');
  assert.ok(appContextCode.includes('/conversations/'), 'AppContext doit détecter les routes /conversations/:id');

  const sidebarCode = fs.readFileSync(path.join(rootDir, 'src', 'components', 'layout', 'ClaudeSidebar.tsx'), 'utf-8');
  assert.ok(sidebarCode.includes('loadConversation(item.id)'), 'ClaudeSidebar doit appeler loadConversation');

  // 2.3 Proposition de conception en cas de cible d'ouverture manquée
  const propPath = path.join(rootDir, 'docs', 'audit', 'perf', 'PROPOSITION_CONCEPTION_VIRTUALISATION.md');
  assert.ok(fs.existsSync(propPath), 'PROPOSITION_CONCEPTION_VIRTUALISATION.md doit exister');
});
