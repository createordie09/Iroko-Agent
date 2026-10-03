// tests/message_parts.test.mjs
// Phase 2 — Chronologie ordonnée des réponses (réflexion, texte, outils, artéfacts).

import test from 'node:test';
import assert from 'node:assert/strict';

const { applyEventToParts, appendEndMarker, compactForPart, hasMessageParts } = await import('../server/types/messageParts.ts');
const { ActiveJobManager } = await import('../server/runtime/ActiveJobManager.ts');

const ev = (e) => ({ taskId: 't', sessionId: 's', timestamp: new Date().toISOString(), ...e });

function replay(events) {
  return events.reduce((parts, e, i) => applyEventToParts(parts, ev(e), 1000 + i * 100), []);
}

test('Parts — l\'ordre réel des blocs est conservé et le texte est regroupé', () => {
  const parts = replay([
    { type: 'thinking', content: 'Je ' },
    { type: 'thinking', content: 'réfléchis' },
    { type: 'message', role: 'assistant', content: 'Je lis ' },
    { type: 'message', role: 'assistant', content: 'le fichier.' },
    { type: 'tool_call_start', callId: 'c1', tool: 'read_file', input: { path: 'a.ts' } },
    { type: 'tool_call_result', callId: 'c1', tool: 'read_file', success: true, result: { ok: 1 } },
    { type: 'message', role: 'assistant', content: 'Terminé.' }
  ]);
  assert.deepEqual(parts.map(p => p.type), ['thinking', 'text', 'tool', 'text']);
  assert.equal(parts[0].text, 'Je réfléchis');
  assert.equal(parts[1].text, 'Je lis le fichier.');
  assert.equal(parts[2].status, 'success');
  assert.equal(parts[2].durationMs, 100);
  assert.equal(parts[3].text, 'Terminé.');
});

test('Parts — un échec d\'outil est marqué en erreur et un doublon de départ est ignoré', () => {
  const parts = replay([
    { type: 'tool_call_start', callId: 'c1', tool: 'execute_command', input: { command: 'x' } },
    { type: 'tool_call_start', callId: 'c1', tool: 'execute_command', input: { command: 'x' } },
    { type: 'tool_call_result', callId: 'c1', tool: 'execute_command', success: false, error: 'boom' }
  ]);
  assert.equal(parts.length, 1);
  assert.equal(parts[0].status, 'error');
  assert.equal(parts[0].error, 'boom');
});

test('Parts — un artéfact mis à jour garde sa position et passe à la nouvelle version', () => {
  const art = (version) => ({ id: 'a1', name: 'n.md', mimeType: 'text/markdown', version, size: 3 });
  const parts = replay([
    { type: 'artifact_created', artifact: art(1) },
    { type: 'message', role: 'assistant', content: 'ok' },
    { type: 'artifact_updated', artifact: art(2) }
  ]);
  assert.deepEqual(parts.map(p => p.type), ['artifact', 'text']);
  assert.equal(parts[0].version, 2);
});

test('Parts — la liste d\'origine n\'est pas modifiée et les événements sans rapport la laissent intacte', () => {
  const base = [];
  const next = applyEventToParts(base, ev({ type: 'message', role: 'assistant', content: 'a' }));
  assert.equal(base.length, 0);
  assert.equal(next.length, 1);
  assert.equal(applyEventToParts(next, ev({ type: 'status', status: 'idle' })), next);
});

test('Parts — les contenus volumineux sont réduits', () => {
  const big = compactForPart({ content: 'x'.repeat(10000) });
  assert.ok(JSON.stringify(big).length < 4200);
  assert.equal(hasMessageParts({ parts: [] }), false);
  assert.equal(hasMessageParts({ parts: [{}] }), true);
});

test('Parts — le gestionnaire de tâches enregistre la chronologie dans le message', async () => {
  const saved = [];
  const db = { updateMessageContent: (...args) => saved.push(args), updateTaskStatus() {} };
  const manager = new ActiveJobManager(db);
  const job = manager.registerJob({
    taskId: 't1', conversationId: 'c', prompt: 'p', mode: 'code', assistantMessageId: 'm1',
    runtime: { sessionId: 's', cancelTask() {} }
  });
  manager.handleEvent('c', ev({ type: 'message', role: 'assistant', content: 'Début ' }));
  manager.handleEvent('c', ev({ type: 'tool_call_start', callId: 'c1', tool: 'read_file', input: {} }));
  manager.handleEvent('c', ev({ type: 'tool_call_result', callId: 'c1', tool: 'read_file', success: true, result: {} }));
  manager.handleEvent('c', ev({ type: 'message', role: 'assistant', content: 'Fin' }));
  manager.handleEvent('c', ev({ type: 'completed', summary: 'Début Fin' }));
  const last = saved[saved.length - 1];
  assert.deepEqual(last[3].parts.map(p => p.type), ['text', 'tool', 'text']);
  assert.equal(job.parts.length, 3);

  // Reprise : un abonné tardif reçoit la chronologie déjà construite
  const job2 = manager.registerJob({
    taskId: 't2', conversationId: 'c2', prompt: 'p', mode: 'chat', assistantMessageId: 'm2',
    runtime: { sessionId: 's', cancelTask() {} }
  });
  manager.handleEvent('c2', ev({ type: 'message', role: 'assistant', content: 'Salut' }));
  let resume;
  manager.subscribe('c2', e => { if (e.type === 'task_resumed') resume = e; });
  assert.equal(resume.payload.parts[0].text, 'Salut');
  assert.ok(job2);
});

test('Parts — la durée de réflexion est celle mesurée entre le premier fragment et le bloc suivant', () => {
  const parts = replay([
    { type: 'thinking', content: 'a' },
    { type: 'thinking', content: 'b' },
    { type: 'message', role: 'assistant', content: 'Réponse' }
  ]);
  assert.equal(parts[0].text, 'ab');
  assert.equal(parts[0].startedAt, 1000);
  assert.equal(parts[0].durationMs, 200);
  const encours = replay([{ type: 'thinking', content: 'a' }]);
  assert.equal(encours[0].durationMs, undefined);
});

test('Parts — le plan reste un seul bloc, mis à jour sur place, à sa position d\'origine', () => {
  const step = (id, status) => ({ id, title: 'Étape ' + id, status });
  const parts = replay([
    { type: 'message', role: 'assistant', content: 'Voici le plan.' },
    { type: 'plan', steps: [step('1', 'in_progress'), step('2', 'pending')] },
    { type: 'tool_call_start', callId: 'c1', tool: 'read_file', input: {} },
    { type: 'plan', steps: [step('1', 'completed'), step('2', 'in_progress')] },
    { type: 'plan', steps: [] }
  ]);
  assert.deepEqual(parts.map(p => p.type), ['text', 'plan', 'tool']);
  assert.deepEqual(parts[1].steps.map(s => s.status), ['completed', 'in_progress']);
});

test('Parts — une demande d\'autorisation devient un bloc qui passe à la décision réelle', () => {
  const request = { id: 'r1', tool: 'execute_command', level: 'MEDIUM', description: 'Lancer les tests', details: { command: 'npm test', fingerprint: 'secret-interne', pattern: 'npm' }, timestamp: 1 };
  const pending = replay([
    { type: 'tool_call_start', callId: 'c1', tool: 'execute_command', input: {} },
    { type: 'permission_required', request }
  ]);
  assert.deepEqual(pending.map(p => p.type), ['tool', 'permission']);
  assert.equal(pending[1].status, 'pending');
  assert.equal(pending[1].target, 'npm test');
  assert.ok(!JSON.stringify(pending[1]).includes('secret-interne'));

  const denied = applyEventToParts(pending, ev({ type: 'permission_resolved', requestId: 'r1', outcome: 'denied' }));
  assert.equal(denied[1].status, 'denied');
  // Un événement de décision inconnu laisse la liste intacte
  assert.equal(applyEventToParts(denied, ev({ type: 'permission_resolved', requestId: 'inconnu', outcome: 'approved' })), denied);
});

test('Autorisations — le moteur notifie la réponse de l\'utilisateur et l\'expiration', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const { PermissionEngine } = await import('../server/permissions/PermissionEngine.ts');
  const engine = new PermissionEngine(fs.mkdtempSync(path.join(os.tmpdir(), 'iroko-perm-')));
  const decisions = [];
  engine.onDecision = (d) => decisions.push(d);

  const answered = engine.requestPermission('execute_command', 'MEDIUM', 'Test A', { command: 'echo a' }, (req) => {
    setTimeout(() => engine.resolvePermission(req.id, true, 'once'), 5);
  });
  assert.equal(await answered, true);
  assert.equal(decisions[0].outcome, 'approved');

  engine.timeoutMs = 20;
  const expired = engine.requestPermission('execute_command', 'MEDIUM', 'Test B', { command: 'echo b' }, () => {});
  assert.equal(await expired, false);
  assert.equal(decisions[1].outcome, 'expired');
});

test('Parts — une fin anormale ferme les étapes en cours et ajoute un marqueur unique', () => {
  const running = replay([
    { type: 'thinking', content: 'a' },
    { type: 'tool_call_start', callId: 'c1', tool: 'execute_command', input: {} },
    { type: 'permission_required', request: { id: 'r1', tool: 'execute_command', level: 'MEDIUM', description: 'x', timestamp: 1 } }
  ]);
  const closed = appendEndMarker(running, 'cancelled', undefined, 5000);
  assert.deepEqual(closed.map(p => p.type), ['thinking', 'tool', 'permission', 'marker']);
  assert.equal(closed[0].durationMs, 100);
  assert.equal(closed[1].status, 'error');
  assert.equal(closed[2].status, 'denied');
  assert.equal(closed[3].kind, 'cancelled');
  assert.equal(appendEndMarker(closed, 'failed'), closed);
});

test('Parts — arrêt d\'une tâche : le marqueur est enregistré avec le message', () => {
  const saved = [];
  const manager = new ActiveJobManager({ updateMessageContent: (...a) => saved.push(a), updateTaskStatus() {} });
  manager.registerJob({ taskId: 't9', conversationId: 'c9', prompt: 'p', mode: 'code', assistantMessageId: 'm9', runtime: { sessionId: 's', cancelTask() {} } });
  manager.handleEvent('c9', ev({ type: 'tool_call_start', callId: 'x', tool: 'execute_command', input: {} }));
  manager.cancelJob('c9');
  const parts = saved[saved.length - 1][3].parts;
  assert.deepEqual(parts.map(p => p.type), ['tool', 'marker']);
  assert.equal(parts[0].status, 'error');
  assert.equal(parts[1].kind, 'cancelled');
  assert.equal(saved[saved.length - 1][3].status, 'cancelled');
});

test('Parts — après un arrêt inattendu, la reprise de la base ajoute le marqueur', async () => {
  const { runtimeDatabase } = await import('../server/storage/RuntimeDatabase.ts');
  const convId = crypto.randomUUID();
  runtimeDatabase.saveConversation(convId, 'Reprise');
  const msgId = crypto.randomUUID();
  runtimeDatabase.addMessage({
    id: msgId, conversationId: convId, role: 'assistant', content: 'partiel',
    metadata: { status: 'generating', parts: [{ id: 't', type: 'tool', callId: 'c', tool: 'read_file', input: {}, status: 'running', startedAt: 1 }] }
  });
  const taskId = crypto.randomUUID();
  runtimeDatabase.recordTask({ id: taskId, sessionId: 's', conversationId: convId, prompt: 'p', status: 'running' });
  runtimeDatabase.recoverInterruptedGenerations();
  const stored = runtimeDatabase.getConversation(convId, true);
  const meta = JSON.parse(stored.messages.find(m => m.id === msgId).metadata);
  assert.equal(meta.parts[0].status, 'error');
  assert.equal(meta.parts[meta.parts.length - 1].kind, 'interrupted');
});
