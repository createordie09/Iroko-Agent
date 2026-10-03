// tests/audit_corrections.test.mjs
// Non-régression des corrections issues de l'audit (conversation active, moteur de test,
// fournisseurs locaux sans clé, route d'impact, doublons de routes, retry, reprise sur 401, modales).

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE_URL = 'http://127.0.0.1:3001';
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// Faux serveur Ollama local (compatible OpenAI) démarré AVANT l'import du routeur (lecture de OLLAMA_HOST)
let ollamaHits = 0;
const fakeOllama = http.createServer((req, res) => {
  if (req.url === '/api/tags') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ models: [{ name: 'llama3.2' }] }));
    return;
  }
  if (req.url === '/v1/chat/completions') {
    ollamaHits++;
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write('data: {"choices":[{"delta":{"content":"Réponse locale réelle"}}]}\n\n');
    res.write('data: [DONE]\n\n');
    res.end();
    return;
  }
  res.writeHead(404);
  res.end();
});
await new Promise(resolve => fakeOllama.listen(0, '127.0.0.1', resolve));
process.env.OLLAMA_HOST = `http://127.0.0.1:${fakeOllama.address().port}`;

const { modelRouter } = await import('../server/models/router/ModelRouter.ts');

test.after(() => fakeOllama.close());

async function auth() {
  const { token } = await (await fetch(`${BASE_URL}/api/bootstrap`)).json();
  return { Authorization: `Bearer ${token}`, 'X-Iroko-Request': '1', 'Content-Type': 'application/json' };
}

async function collect(stream) {
  let text = '';
  for await (const chunk of stream) {
    if (chunk.type === 'text_delta') text += chunk.text;
  }
  return text;
}

test('Correction 2 — hors environnement de test, aucune réponse fictive : erreur explicite sans clé', async () => {
  const saved = { NODE_ENV: process.env.NODE_ENV, IROKO_TEST_MODE: process.env.IROKO_TEST_MODE };
  const previousPolicy = modelRouter.getFallbackPolicy();
  delete process.env.NODE_ENV;
  delete process.env.IROKO_TEST_MODE;
  modelRouter.setFallbackPolicy({ enabled: false });
  try {
    await assert.rejects(
      collect(modelRouter.generateStream({ modelId: 'anthropic/claude-3.5-sonnet', messages: [{ role: 'user', content: 'Bonjour' }] }, 'anthropic')),
      /Aucun fournisseur d'IA disponible/
    );
  } finally {
    modelRouter.setFallbackPolicy(previousPolicy);
    process.env.NODE_ENV = saved.NODE_ENV;
    process.env.IROKO_TEST_MODE = saved.IROKO_TEST_MODE;
  }
});

test('Correction 3 — un fournisseur local sans clé (Ollama) est réellement appelé, jamais remplacé par le mock', async () => {
  const saved = { NODE_ENV: process.env.NODE_ENV, IROKO_TEST_MODE: process.env.IROKO_TEST_MODE };
  delete process.env.NODE_ENV;
  delete process.env.IROKO_TEST_MODE;
  try {
    const before = ollamaHits;
    const text = await collect(modelRouter.generateStream({ modelId: 'ollama/llama3.2', messages: [{ role: 'user', content: 'Bonjour' }] }, 'ollama'));
    assert.equal(text, 'Réponse locale réelle');
    assert.equal(ollamaHits, before + 1, 'Le serveur local doit avoir reçu la requête');
    assert.ok(!text.includes('Mode Test'), 'Aucune réponse du moteur de test');
  } finally {
    process.env.NODE_ENV = saved.NODE_ENV;
    process.env.IROKO_TEST_MODE = saved.IROKO_TEST_MODE;
  }
});

test('Correction 5 — GET /api/conversations/:id/messages/:mid/impact répond (plus masquée par la route générique)', async () => {
  const headers = await auth();
  const { conversation } = await (await fetch(`${BASE_URL}/api/conversations`, { method: 'POST', headers, body: JSON.stringify({ title: 'Impact' }) })).json();
  const ids = [];
  for (const content of ['un', 'deux', 'trois']) {
    const r = await fetch(`${BASE_URL}/api/conversations/${conversation.id}/messages`, { method: 'POST', headers, body: JSON.stringify({ role: 'user', content }) });
    ids.push((await r.json()).message.id);
  }
  const res = await fetch(`${BASE_URL}/api/conversations/${conversation.id}/messages/${ids[0]}/impact`, { headers });
  assert.equal(res.status, 200);
  const impact = await res.json();
  assert.equal(typeof impact.subsequentCount, 'number');

  // La route générique conserve son comportement pour l'identifiant seul
  const conv = await fetch(`${BASE_URL}/api/conversations/${conversation.id}`, { headers });
  assert.equal(conv.status, 200);
  // Un sous-chemin inconnu n'est plus interprété comme un identifiant de discussion
  const unknown = await fetch(`${BASE_URL}/api/conversations/${conversation.id}/inconnu`, { headers });
  assert.equal(unknown.status, 404);
});

test('Correction 13 — export PDF : discussion vide et corps vide renvoient 400 (et non 500)', async () => {
  const headers = await auth();
  const { conversation } = await (await fetch(`${BASE_URL}/api/conversations`, { method: 'POST', headers, body: JSON.stringify({ title: 'Vide' }) })).json();
  const getRes = await fetch(`${BASE_URL}/api/conversations/${conversation.id}/export/pdf`, { headers });
  assert.equal(getRes.status, 400);
  const postRes = await fetch(`${BASE_URL}/api/conversations/export-pdf`, { method: 'POST', headers, body: JSON.stringify({ title: 'x', messages: [] }) });
  assert.equal(postRes.status, 400);
});

test('Correction 13 — une seule définition des routes artéfacts de discussion', () => {
  const src = read('server/index.ts');
  const getDefs = src.split("pathname.endsWith('/artifacts') && req.method === 'GET'").length - 1;
  const postDefs = src.split("pathname.endsWith('/artifacts') && req.method === 'POST'").length - 1;
  assert.equal(getDefs, 1);
  assert.equal(postDefs, 1);
});

async function retryScenario() {
  const { default: WebSocket } = await import('ws');
  const headers = await auth();
  const convId = crypto.randomUUID();
  await fetch(`${BASE_URL}/api/conversations`, { method: 'POST', headers, body: JSON.stringify({ id: convId, title: 'Retry' }) });

  // D'autres suites redémarrent volontairement le daemon (tests de résilience) : on rejoue l'envoi
  // jusqu'à 4 fois si la connexion est coupée avant la fin de la tâche.
  async function sendPromptOnce(extra) {
    const headers = await auth();
    const { ticket } = await (await fetch(`${BASE_URL}/api/ws-ticket`, { method: 'POST', headers })).json();
    const ws = new WebSocket(`ws://127.0.0.1:3001/ws?ticket=${ticket}`);
    await new Promise((resolve, reject) => { ws.on('open', resolve); ws.on('error', reject); });
    const finished = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Délai dépassé')), 20000);
      ws.on('close', () => { clearTimeout(timer); reject(new Error('Connexion coupée')); });
      ws.on('message', (raw) => {
        const evt = JSON.parse(String(raw));
        if (evt.type === 'completed' || evt.type === 'error') {
          clearTimeout(timer);
          resolve(evt);
        }
      });
    });
    ws.send(JSON.stringify({ type: 'send_prompt', prompt: 'Bonjour retry', conversationId: convId, mode: 'chat', preferredProviderId: 'mock', modelId: 'mock/test', ...extra }));
    try {
      await finished;
    } finally {
      ws.close();
    }
  }

  async function sendPrompt(extra) {
    let lastError;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        await sendPromptOnce(extra);
        return;
      } catch (err) {
        lastError = err;
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    throw lastError;
  }

  // Cas d'erreur simulé : le message utilisateur est déjà le dernier enregistré
  await fetch(`${BASE_URL}/api/conversations/${convId}/messages`, { method: 'POST', headers, body: JSON.stringify({ role: 'user', content: 'Bonjour retry' }) });
  await sendPrompt({ retry: true });
  let data = await (await fetch(`${BASE_URL}/api/conversations/${convId}`, { headers })).json();
  assert.equal(data.messages.filter(m => m.role === 'user' && m.content === 'Bonjour retry').length, 1, 'Le retry ne doit pas dupliquer le message utilisateur');

  // Témoin : sans retry, un nouvel envoi est bien enregistré
  const before = data.messages.filter(m => m.role === 'user' && m.content === 'Bonjour retry').length;
  await sendPrompt({});
  data = await (await fetch(`${BASE_URL}/api/conversations/${convId}`, { headers })).json();
  assert.ok(data.messages.filter(m => m.role === 'user' && m.content === 'Bonjour retry').length > before);
}

test('Correction 14 — retry : le dernier message utilisateur déjà enregistré n\'est pas dupliqué', async () => {
  // D'autres suites purgent les discussions ou redémarrent le daemon : le scénario complet est rejoué si l'état a été effacé
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await retryScenario();
      return;
    } catch (err) {
      lastError = err;
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }
  throw lastError;
});

test('Correction 1 — plus aucune conversation active déduite de history[0]', () => {
  for (const rel of [
    'src/features/chat/ClaudeChat.tsx',
    'src/components/layout/ClaudeTopbar.tsx',
    'src/components/layout/ClaudeSidebar.tsx',
    'src/hooks/sidebar/useSidebarConversations.ts',
    'src/context/AppContext.tsx'
  ]) {
    assert.ok(!read(rel).includes('history[0]'), `${rel} ne doit plus utiliser history[0]`);
  }
  const ctx = read('src/context/AppContext.tsx');
  assert.ok(ctx.includes('activeConversationId'), 'AppContext expose activeConversationId');
});

test('Correction 4/11 — onboarding : test réel (y compris local), POST vérifié, aucune mention interdite', () => {
  const view = read('src/features/onboarding/OnboardingView.tsx');
  assert.ok(!view.includes('À VALIDER'));
  assert.ok(view.includes('saveRes.ok'), 'La réponse de l\'enregistrement de la clé doit être contrôlée');
  assert.ok(view.includes("selectedProvider.requiresKey ? apiKey.trim() : ''"), 'Le test doit aussi couvrir les fournisseurs locaux');
  assert.ok(!/Claude/.test(read('src/features/onboarding/onboardingData.ts')));
  assert.ok(!/anthropic\/claude/.test(read('src/context/AppContext.tsx')), 'Aucun modèle par défaut codé en dur');
});

test('Correction 6 — TokenService : reprise unique sur 401 après redémarrage du daemon', async () => {
  const { tokenService } = await import('../src/services/security/TokenService.ts');
  const originalFetch = globalThis.fetch;
  let bootstraps = 0;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    calls.push(u);
    if (u === '/api/bootstrap') {
      bootstraps++;
      return new Response(JSON.stringify({ token: `jeton-${bootstraps}`, workspace: '' }), { status: 200 });
    }
    const auth = init?.headers?.Authorization;
    if (auth === 'jeton-1' || auth === 'Bearer jeton-1') return new Response('{}', { status: 401 });
    return new Response('{"ok":true}', { status: 200 });
  };
  try {
    tokenService.invalidate();
    const res = await tokenService.fetch('/api/settings');
    assert.equal(res.status, 200);
    assert.equal(bootstraps, 2, 'Un seul ré-amorçage après le 401');
    await assert.rejects(
      (async () => {
        globalThis.fetch = async () => new Response('{"error":"Refusé par le serveur"}', { status: 400 });
        await tokenService.fetchChecked('/api/x', { method: 'POST' }, 'Repli');
      })(),
      /Refusé par le serveur/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Correction 10 — modales de message accessibles (dialog, focus piégé, Échap)', () => {
  for (const rel of ['src/features/chat/modals/DeleteMessageModal.tsx', 'src/features/chat/modals/EditMessageModal.tsx']) {
    const src = read(rel);
    assert.ok(src.includes('role="dialog"'));
    assert.ok(src.includes('aria-modal="true"'));
    assert.ok(src.includes('useOverlayFocus'));
  }
  assert.ok(!read('src/features/chat/modals/DeleteMessageModal.tsx').includes('irréversible'));
});

test('Correction 12 — une seule pile HTTP côté client (tokenService.fetch)', () => {
  assert.ok(!read('src/services/workspace/WorkspaceService.ts').includes('127.0.0.1:3001'));
  const art = read('src/services/artifacts/ArtifactService.ts');
  assert.ok(!/[^.]fetch\(/.test(art.replace(/tokenService\.fetch\(/g, '')), 'ArtifactService ne doit plus utiliser fetch brut');
  assert.ok(!/await fetch\(/.test(read('src/hooks/settings/useSkillsSettings.ts')));
});
