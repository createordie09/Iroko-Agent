// tests/tool_step_summary.test.mjs
// Phase 3 — Résumés d'étapes et différences de fichiers calculés à partir des résultats réels.

import test from 'node:test';
import assert from 'node:assert/strict';

const { summarizeToolResult, buildEditDiff } = await import('../src/features/chat/toolStepSummary.ts');

const tool = (name, over = {}) => ({ id: 'p', type: 'tool', callId: 'c', tool: name, input: {}, status: 'success', startedAt: 0, ...over });

test('Résumé — recherche, lecture, commande à partir du résultat réel', () => {
  assert.equal(summarizeToolResult(tool('web_search', { result: { count: 5 } })), '5 résultats');
  assert.equal(summarizeToolResult(tool('web_search', { result: { count: 1 } })), '1 résultat');
  assert.equal(summarizeToolResult(tool('read_file', { result: { startLine: 1, endLine: 120 } })), '120 lignes lues');
  assert.equal(summarizeToolResult(tool('execute_command', { result: { exitCode: 0 } })), 'Code de sortie 0');
  assert.equal(summarizeToolResult(tool('write_file', { result: { status: 'created' } })), 'Fichier créé');
});

test('Résumé — rien d\'inventé sans résultat exploitable, erreur sur la première ligne', () => {
  assert.equal(summarizeToolResult(tool('web_search', { status: 'running' })), '');
  assert.equal(summarizeToolResult(tool('web_search', { result: undefined })), '');
  assert.equal(summarizeToolResult(tool('outil_inconnu', { result: { a: 1 } })), '');
  assert.equal(summarizeToolResult(tool('read_file', { status: 'error', error: 'Introuvable\nsuite' })), 'Introuvable');
});

test('Différence — lignes retirées puis ajoutées d\'une modification réussie uniquement', () => {
  const part = tool('edit_file', { input: { targetContent: 'a\nb', replacementContent: 'c' } });
  assert.deepEqual(buildEditDiff(part), [
    { kind: 'removed', text: 'a' }, { kind: 'removed', text: 'b' }, { kind: 'added', text: 'c' }
  ]);
  assert.deepEqual(buildEditDiff({ ...part, status: 'error' }), []);
  assert.deepEqual(buildEditDiff(tool('read_file', { input: { targetContent: 'a', replacementContent: 'b' } })), []);
  assert.equal(buildEditDiff(tool('edit_file', { input: { targetContent: 'x\n'.repeat(100), replacementContent: 'y' } })).length, 40);
});
