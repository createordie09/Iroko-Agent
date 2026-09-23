import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

test('Mission Lot 4 - 1. Regroupement des tokens (useStreamBuffer & <= 20 fps)', () => {
  const hookPath = path.join(rootDir, 'src', 'hooks', 'useStreamBuffer.ts');
  assert.ok(fs.existsSync(hookPath), 'src/hooks/useStreamBuffer.ts doit exister');

  const hookContent = fs.readFileSync(hookPath, 'utf-8');
  assert.ok(hookContent.includes('export function useStreamBuffer'), 'Doit exporter useStreamBuffer');
  assert.ok(hookContent.includes('requestAnimationFrame'), 'Doit utiliser requestAnimationFrame pour cadencer les rendus');
  assert.ok(hookContent.includes('minInterval = 50') || hookContent.includes('50'), 'Doit imposer une cadence maximale de 20 fps (50 ms minimum)');
  assert.ok(hookContent.includes('document.hidden'), 'Doit vérifier document.hidden pour les onglets en arrière-plan');
  assert.ok(hookContent.includes('flushImmediately'), 'Doit exposer flushImmediately pour vider immédiatement le tampon');
  assert.ok(hookContent.includes('appendDelta'), 'Doit exposer appendDelta pour ajouter des jetons au tampon');

  // Vérification de l'intégration dans ClaudeChat.tsx
  const chatPath = path.join(rootDir, 'src', 'features', 'chat', 'ClaudeChat.tsx');
  const chatContent = fs.readFileSync(chatPath, 'utf-8');
  assert.ok(chatContent.includes("useStreamBuffer"), 'ClaudeChat.tsx doit importer et utiliser useStreamBuffer');
  assert.ok(chatContent.includes('appendStreamDelta'), 'ClaudeChat.tsx doit alimenter le flux via appendStreamDelta');
  assert.ok(chatContent.includes('flushStreamImmediately'), 'ClaudeChat.tsx doit appeler flushStreamImmediately en fin de tâche');
  assert.ok(chatContent.includes('resetStreamBuffer'), 'ClaudeChat.tsx doit réinitialiser le tampon via resetStreamBuffer');
});
