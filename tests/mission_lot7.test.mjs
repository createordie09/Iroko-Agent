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
