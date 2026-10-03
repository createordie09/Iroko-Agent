// tests/conversation_memory.test.mjs
// Phase 0 — Mémoire de la conversation : le modèle reçoit les échanges précédents de la discussion.

import test from 'node:test';
import assert from 'node:assert/strict';

const { runtimeDatabase } = await import('../server/storage/RuntimeDatabase.ts');
const {
  buildConversationHistory,
  buildContinuityNote,
  historyBudgetTokens
} = await import('../server/runtime/ConversationHistory.ts');
const { AgentLoop } = await import('../server/runtime/AgentLoop.ts');
const { Planner } = await import('../server/runtime/Planner.ts');
const { PermissionEngine } = await import('../server/permissions/PermissionEngine.ts');
const { modelRouter } = await import('../server/models/router/ModelRouter.ts');

function newConversation(title = 'Mémoire') {
  const id = crypto.randomUUID();
  runtimeDatabase.saveConversation(id, title);
  return id;
}

function add(conversationId, role, content, metadata) {
  runtimeDatabase.addMessage({ id: crypto.randomUUID(), conversationId, role, content, metadata });
}

test('Mémoire — l\'historique reprend les échanges dans l\'ordre et exclut le tour en cours', () => {
  const id = newConversation();
  add(id, 'user', 'Génère-moi un fichier .md', { mode: 'chat' });
  add(id, 'assistant', 'Passe en mode Code, s\'il te plaît.', { mode: 'chat' });
  add(id, 'user', 'c\'est bon vas-y', { mode: 'code' });

  const history = buildConversationHistory({ conversationId: id, currentPrompt: 'c\'est bon vas-y', contextWindow: 128000 });

  assert.deepEqual(history.messages.map(m => m.role), ['user', 'assistant']);
  assert.equal(history.messages[0].content, 'Génère-moi un fichier .md');
  assert.equal(history.omittedCount, 0);
  assert.equal(history.previousMode, 'chat');
});

test('Mémoire — messages vides, notices système et messages consécutifs de même rôle', () => {
  const id = newConversation();
  add(id, 'user', 'Premier envoi sans réponse', { mode: 'chat' });
  add(id, 'user', 'Deuxième envoi', { mode: 'chat' });
  add(id, 'assistant', '', { mode: 'chat' });
  add(id, 'system', 'Contexte résumé', { systemNotice: 'context_summarized' });
  add(id, 'assistant', 'Réponse utile', { mode: 'chat' });
  add(id, 'user', 'Question actuelle');

  const history = buildConversationHistory({ conversationId: id, currentPrompt: 'Question actuelle', contextWindow: 128000 });

  assert.deepEqual(history.messages.map(m => m.role), ['user', 'assistant']);
  assert.ok(history.messages[0].content.includes('Premier envoi sans réponse'));
  assert.ok(history.messages[0].content.includes('Deuxième envoi'));
  assert.equal(history.messages[1].content, 'Réponse utile');
});

test('Mémoire — budget de jetons : les échanges les plus récents sont conservés et le reste est signalé', () => {
  const id = newConversation();
  const long = 'x'.repeat(8000); // ≈ 2000 jetons
  for (let i = 0; i < 6; i++) {
    add(id, 'user', `Question ${i} ${long}`, { mode: 'chat' });
    add(id, 'assistant', `Réponse ${i} ${long}`, { mode: 'chat' });
  }
  add(id, 'user', 'Dernière question');

  const history = buildConversationHistory({ conversationId: id, currentPrompt: 'Dernière question', contextWindow: 8192 });

  assert.ok(history.omittedCount > 0, 'Des échanges anciens doivent être écartés');
  assert.equal(history.messages[0].role, 'user', 'L\'historique conservé commence par l\'utilisateur');
  assert.ok(history.messages[history.messages.length - 1].content.startsWith('Réponse 5'), 'Le plus récent est conservé');
  assert.ok(historyBudgetTokens(8192) >= 2000);
  assert.ok(historyBudgetTokens(1_000_000) <= 60000);
});

test('Mémoire — discussion sans passé ou inconnue : historique vide', () => {
  const id = newConversation();
  add(id, 'user', 'Premier message');
  assert.equal(buildConversationHistory({ conversationId: id, currentPrompt: 'Premier message', contextWindow: 128000 }).messages.length, 0);
  assert.equal(buildConversationHistory({ conversationId: 'inconnue', currentPrompt: 'x', contextWindow: 128000 }).messages.length, 0);
  assert.equal(buildConversationHistory({ currentPrompt: 'x', contextWindow: 128000 }).messages.length, 0);
});

test('Mémoire — note de continuité : changement de mode et échanges omis', () => {
  const modeChange = buildContinuityNote({ messages: [], omittedCount: 0, previousMode: 'chat' }, 'code');
  assert.ok(modeChange.includes('du mode Chat au mode Code'));
  assert.ok(modeChange.includes('sans la lui faire répéter'));
  assert.equal(buildContinuityNote({ messages: [], omittedCount: 0, previousMode: 'code' }, 'code'), '');
  assert.ok(buildContinuityNote({ messages: [], omittedCount: 3 }, 'chat').includes('3 échange(s)'));
});

test('Mémoire — le modèle reçoit réellement l\'historique et la note de changement de mode (AgentLoop)', async () => {
  const id = newConversation('Passage en mode Code');
  add(id, 'user', 'Génère-moi un fichier .md avec ce code', { mode: 'chat' });
  add(id, 'assistant', 'Je peux le faire en mode Code, bascule via le sélecteur.', { mode: 'chat' });
  add(id, 'user', 'c\'est bon vas-y maintenant', { mode: 'chat' });

  const provider = modelRouter.getProvider('mock');
  const original = provider.generateStream;
  let received = null;
  provider.generateStream = async function* (request) {
    received = request.messages.map(m => ({ role: m.role, content: m.content }));
    yield { type: 'text_delta', text: 'Compris.' };
  };

  try {
    const events = [];
    // L'historique est marqué « code » : le tour courant en mode chat doit signaler le changement de mode
    add(id, 'assistant', 'Fichier créé.', { mode: 'code' });
    add(id, 'user', 'merci, ajoute un titre', { mode: 'chat' });
    await new AgentLoop().run('merci, ajoute un titre', {
      workspacePath: process.cwd(),
      sessionId: 'test-memoire',
      conversationMode: 'chat',
      permissionEngine: new PermissionEngine(),
      emitEvent: (e) => events.push(e)
    }, new Planner(() => {}), {
      preferredProviderId: 'mock',
      modelId: 'mock/test',
      conversationId: id,
      conversationMode: 'chat'
    });

    assert.ok(received, 'Le modèle doit avoir été appelé');
    const roles = received.map(m => m.role);
    assert.deepEqual(roles, ['system', 'user', 'assistant', 'user', 'assistant', 'user']);
    assert.ok(received[1].content.includes('Génère-moi un fichier .md'), 'La demande initiale est transmise au modèle');
    assert.ok(received[2].content.includes('mode Code'));
    assert.ok(received[3].content.includes('c\'est bon vas-y maintenant'));
    assert.equal(received[received.length - 1].content, 'merci, ajoute un titre', 'Le tour courant n\'est pas dupliqué');
    assert.ok(String(received[0].content).includes('du mode Code au mode Chat'), 'La note de changement de mode est dans le prompt système');
  } finally {
    provider.generateStream = original;
  }
});
