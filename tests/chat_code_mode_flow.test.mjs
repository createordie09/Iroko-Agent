// tests/chat_code_mode_flow.test.mjs
// Phase 1 — Parcours Chat / Code fluide : le modèle propose le passage en mode Code via un outil dédié,
// l'interface affiche un bouton « Passer en mode Code et continuer ».

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const { toolRegistry } = await import('../server/tools/ToolRegistry.ts');
const { PermissionEngine } = await import('../server/permissions/PermissionEngine.ts');
const { AgentLoop } = await import('../server/runtime/AgentLoop.ts');
const { Planner } = await import('../server/runtime/Planner.ts');
const { runtimeDatabase } = await import('../server/storage/RuntimeDatabase.ts');
const { modelRouter } = await import('../server/models/router/ModelRouter.ts');

function context(conversationMode, events = []) {
  return {
    workspacePath: process.cwd(),
    sessionId: 'test-mode-flow',
    conversationMode,
    permissionEngine: new PermissionEngine(),
    emitEvent: (e) => events.push(e)
  };
}

test('Mode Chat — request_code_mode et les artéfacts sont proposés, les outils de code ne le sont pas', () => {
  const names = toolRegistry.getDefinitionsForModel('execute', 'chat').map(t => t.name);
  assert.ok(names.includes('request_code_mode'));
  assert.ok(names.includes('create_artifact'), 'Créer un artéfact ne nécessite pas le mode Code');
  for (const codeOnly of ['write_file', 'edit_file', 'execute_command', 'git_commit', 'read_file']) {
    assert.ok(!names.includes(codeOnly), `${codeOnly} doit être réservé au mode Code`);
  }
});

test('Mode Code — request_code_mode n\'est pas proposé, les outils de code le sont', () => {
  const names = toolRegistry.getDefinitionsForModel('execute', 'code').map(t => t.name);
  assert.ok(!names.includes('request_code_mode'));
  assert.ok(names.includes('write_file'));
  assert.ok(names.includes('create_artifact'));
});

test('request_code_mode — émet l\'événement de proposition avec la raison', async () => {
  const events = [];
  const result = await toolRegistry.executeTool('request_code_mode', { reason: 'créer le fichier dans le projet' }, context('chat', events));
  assert.equal(result.success, true);
  const suggestion = events.find(e => e.type === 'mode_switch_suggested');
  assert.ok(suggestion, 'Événement mode_switch_suggested attendu');
  assert.equal(suggestion.reason, 'créer le fichier dans le projet');
});

test('request_code_mode — raison vide refusée', async () => {
  const events = [];
  const result = await toolRegistry.executeTool('request_code_mode', { reason: '   ' }, context('chat', events));
  assert.equal(result.success, false);
  assert.ok(!events.some(e => e.type === 'mode_switch_suggested'));
});

test('Mode Chat — un outil de code appelé quand même renvoie vers request_code_mode', async () => {
  const result = await toolRegistry.executeTool('write_file', { path: 'x.txt', content: 'x' }, context('chat'));
  assert.equal(result.success, false);
  assert.ok(String(result.error).includes('request_code_mode'));
});

test('Mode Chat — le prompt système ne renvoie plus vers le sélecteur et autorise les artéfacts', async () => {
  const id = crypto.randomUUID();
  runtimeDatabase.saveConversation(id, 'Prompt Chat');
  const provider = modelRouter.getProvider('mock');
  const original = provider.generateStream;
  let system = '';
  provider.generateStream = async function* (request) {
    system = String(request.messages.find(m => m.role === 'system')?.content || '');
    yield { type: 'text_delta', text: 'Ok.' };
  };
  try {
    await new AgentLoop().run('Bonjour', context('chat'), new Planner(() => {}), {
      preferredProviderId: 'mock', modelId: 'mock/test', conversationId: id, conversationMode: 'chat'
    });
  } finally {
    provider.generateStream = original;
  }
  assert.ok(system.includes('MODE CHAT ACTIF'));
  assert.ok(system.includes('request_code_mode'));
  assert.ok(system.includes('ne nécessite PAS le mode Code'));
  assert.ok(!system.includes('via le sélecteur'), 'Plus de renvoi vers le sélecteur');
});

test('Interface — bouton « Passer en mode Code et continuer » branché sur l\'événement', () => {
  const component = read('src/features/chat/ModeSwitchSuggestion.tsx');
  assert.ok(component.includes('Passer en mode Code et continuer'));
  assert.ok(component.includes('role="status"'));
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(component), 'Aucune couleur en dur');

  const hook = read('src/hooks/chat/useChatAgentEvents.ts');
  assert.ok(hook.includes("case 'mode_switch_suggested'"));

  const chat = read('src/features/chat/ClaudeChat.tsx');
  assert.ok(chat.includes('<ModeSwitchSuggestion'));
  assert.ok(chat.includes("setComposerMode('code')"));
  assert.ok(chat.includes("{ mode: 'code' }"));
});

test('Filet de sécurité — détection d\'un modèle qui annonce le mode Code sans appeler l\'outil', async () => {
  const { impliesCodeModeNeed } = await import('../server/runtime/ModeSwitch.ts');
  assert.equal(impliesCodeModeNeed('Pour lister les fichiers, je dois passer en mode Code. Je vous propose de basculer.'), true);
  assert.equal(impliesCodeModeNeed('Je vous propose de passer en mode Code pour lister les fichiers.'), true);
  assert.equal(impliesCodeModeNeed('Le mode Code est nécessaire pour modifier le projet.'), true);
  assert.equal(impliesCodeModeNeed('Il faut le mode Code pour exécuter les tests.'), true);
  assert.equal(impliesCodeModeNeed('Voici le fichier demandé, créé comme artéfact.'), false);
  assert.equal(impliesCodeModeNeed('Bonjour ! Comment puis-je vous aider ?'), false);
  assert.equal(impliesCodeModeNeed(''), false);
  assert.equal(impliesCodeModeNeed(undefined), false);
});

test('Filet de sécurité — AgentLoop émet la proposition quand le modèle l\'annonce sans appeler l\'outil', async () => {
  const id = crypto.randomUUID();
  runtimeDatabase.saveConversation(id, 'Filet');
  const provider = modelRouter.getProvider('mock');
  const original = provider.generateStream;
  provider.generateStream = async function* () {
    yield { type: 'text_delta', text: 'Pour lister ces fichiers, je dois passer en mode Code. Je vous le propose.' };
  };
  const events = [];
  try {
    await new AgentLoop().run('Liste les fichiers de src', context('chat', events), new Planner(() => {}), {
      preferredProviderId: 'mock', modelId: 'mock/test', conversationId: id, conversationMode: 'chat'
    });
  } finally {
    provider.generateStream = original;
  }
  assert.equal(events.filter(e => e.type === 'mode_switch_suggested').length, 1);
  assert.ok(events.some(e => e.type === 'completed'));
});

test('Filet de sécurité — pas de doublon en mode Code ni quand une réponse normale est donnée', async () => {
  const provider = modelRouter.getProvider('mock');
  const original = provider.generateStream;
  const run = async (mode, text) => {
    const id = crypto.randomUUID();
    runtimeDatabase.saveConversation(id, 'Sans doublon');
    provider.generateStream = async function* () { yield { type: 'text_delta', text }; };
    const events = [];
    await new AgentLoop().run('Test', context(mode, events), new Planner(() => {}), {
      preferredProviderId: 'mock', modelId: 'mock/test', conversationId: id, conversationMode: mode
    });
    return events.filter(e => e.type === 'mode_switch_suggested').length;
  };
  try {
    assert.equal(await run('chat', 'Voici ma réponse, sans besoin particulier.'), 0);
    assert.equal(await run('code', 'Il faut passer en mode Code.'), 0);
  } finally {
    provider.generateStream = original;
  }
});
