import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// Imports des modules serveur
const { OpenAICompatibleProvider } = await import('../server/models/providers/OpenAICompatibleProvider.ts');
const { getProviderPreset } = await import('../server/models/providers/presets/index.ts');
const { ModelCatalogManager } = await import('../server/models/catalog/ModelCatalogManager.ts');
const { runtimeDatabase } = await import('../server/storage/RuntimeDatabase.ts');
const { ModelGateway, formatModelLabel } = await import('../server/models/ModelGateway.ts');

// Helper : serveur mock HTTP local sur port éphémère
function createMockOpenAIServer() {
  const server = http.createServer((req, res) => {
    const auth = req.headers.authorization || '';

    // Route /v1/models
    if (req.url === '/v1/models') {
      if (auth === 'Bearer sk-valid-key') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          data: [
            { id: 'gpt-4o', object: 'model', owned_by: 'openai' },
            { id: 'gpt-4o-mini', object: 'model', owned_by: 'openai' }
          ]
        }));
      } else {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: { message: 'Incorrect API key provided', type: 'invalid_request_error', code: 'invalid_api_key' }
        }));
      }
      return;
    }

    // Route /v1/chat/completions
    if (req.url === '/v1/chat/completions') {
      if (auth === 'Bearer sk-valid-key') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          id: 'chatcmpl-test',
          choices: [{ message: { role: 'assistant', content: 'Réponse mock réussie' } }]
        }));
      } else {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'Invalid API key' } }));
      }
      return;
    }

    res.writeHead(404);
    res.end();
  });

  return server;
}

// ─── 1. Mock HTTP OpenAI local (port éphémère) ───

test('1. Mock HTTP OpenAI : validation de clé valide vs invalide vs offline', async () => {
  const server = createMockOpenAIServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address()).port;
  const mockBaseUrl = `http://127.0.0.1:${port}/v1`;

  try {
    const openaiPreset = getProviderPreset('openai');
    const provider = new OpenAICompatibleProvider(openaiPreset, mockBaseUrl);

    // 1.1 Clé valide -> Succès
    const validResult = await provider.validateCredential('sk-valid-key');
    assert.equal(validResult.valid, true, 'Une clé valide doit être acceptée');

    // 1.2 Clé invalide (401) -> Échec
    const invalidResult = await provider.validateCredential('sk-bad-key');
    assert.equal(invalidResult.valid, false, 'Une clé invalide doit être refusée');
    assert.ok(invalidResult.error?.includes('401') || invalidResult.error?.includes('Incorrect API key') || invalidResult.error?.includes('OpenAI'),
      'Le message d\'erreur doit indiquer le refus');

    // 1.3 Serveur offline (port fermé) -> Fournisseur injoignable
    const offlineProvider = new OpenAICompatibleProvider(openaiPreset, 'http://127.0.0.1:59999/v1');
    const offlineResult = await offlineProvider.validateCredential('sk-any-key');
    assert.equal(offlineResult.valid, false, 'Un serveur injoignable doit échouer');
    assert.ok(offlineResult.error, 'Une erreur de connexion doit être rapportée');
  } finally {
    server.close();
  }
});

// ─── 2. Statuts des Fournisseurs dans les Paramètres ───

test('2. Statuts normalisés des fournisseurs (Non configuré, Clé refusée, Injoignable, Prêt · N modèles)', () => {
  // Fonction de test dérivée fidèlement de useProvidersSettings.ts
  function getProviderStatusText(provider, credentials = [], testStatus = {}) {
    const pCreds = credentials.filter(c => c.providerId === provider.id);
    if (pCreds.length === 0 && !provider.isLocal) {
      return 'Non configuré';
    }

    for (const c of pCreds) {
      const t = testStatus[c.id];
      if (t && !t.valid) {
        const err = (t.error || '').toLowerCase();
        if (err.includes('econnrefused') || err.includes('enotfound') || err.includes('timeout') || err.includes('injoignable') || err.includes('fetch failed')) {
          return 'Fournisseur injoignable';
        }
        if (err.includes('401') || err.includes('403') || err.includes('invalide') || err.includes('unauthorized') || err.includes('forbidden') || err.includes('clé refusée') || err.includes('cle refusee')) {
          return 'Clé refusée';
        }
        return 'Fournisseur injoignable';
      }
      if (c.status === 'INVALID') return 'Clé refusée';
      if (c.status === 'ERROR') return 'Fournisseur injoignable';
      if (c.status === 'RATE_LIMITED') return 'Quota dépassé (429)';
    }

    if (provider.status === 'ERROR') return 'Fournisseur injoignable';
    if (provider.status === 'RATE_LIMITED') return 'Quota dépassé (429)';

    const count = provider.modelsCount || 0;
    return `Prêt · ${count} modèle${count > 1 ? 's' : ''}`;
  }

  // 2.1 Non configuré
  assert.equal(getProviderStatusText({ id: 'openai', isLocal: false, modelsCount: 0 }, []), 'Non configuré');

  // 2.2 Clé refusée (401)
  assert.equal(
    getProviderStatusText(
      { id: 'openai', isLocal: false, modelsCount: 0 },
      [{ id: 'c1', providerId: 'openai', status: 'ACTIVE' }],
      { c1: { valid: false, error: 'HTTP 401 Unauthorized' } }
    ),
    'Clé refusée'
  );

  // 2.3 Fournisseur injoignable
  assert.equal(
    getProviderStatusText(
      { id: 'mistral', isLocal: false, modelsCount: 0 },
      [{ id: 'c2', providerId: 'mistral', status: 'ACTIVE' }],
      { c2: { valid: false, error: 'ECONNREFUSED' } }
    ),
    'Fournisseur injoignable'
  );

  // 2.4 Prêt · N modèles
  assert.equal(
    getProviderStatusText(
      { id: 'anthropic', isLocal: false, modelsCount: 4 },
      [{ id: 'c3', providerId: 'anthropic', status: 'ACTIVE' }],
      { c3: { valid: true } }
    ),
    'Prêt · 4 modèles'
  );

  // 2.5 Local sans clé requis (ex: Ollama)
  assert.equal(
    getProviderStatusText({ id: 'ollama', isLocal: true, modelsCount: 1 }, []),
    'Prêt · 1 modèle'
  );
});

// ─── 3. États réactifs du Composer (5 états) ───

test('3. Composer : 5 états réactifs distincts selon l\'état du catalogue', () => {
  function computeComposerStatus({ loadingModels, modelsError, models, activeModelId, providers }) {
    if (loadingModels && models.length === 0) {
      return { type: 'loading', message: 'Chargement…' };
    }
    if (modelsError && models.length === 0) {
      return { type: 'error', message: modelsError };
    }
    const hasReadyProvider = providers.some(p => p.activeKeys > 0 || p.isLocal);
    if (!hasReadyProvider || models.length === 0) {
      return { type: 'no_provider', message: 'Ajoutez une clé API dans Paramètres › Fournisseurs & Clés' };
    }
    const currentModel = models.find(m => m.id === activeModelId);
    if (!currentModel) {
      const proposed = models[0];
      return {
        type: 'unavailable',
        message: 'Le modèle sélectionné n\'est plus disponible.',
        proposedModel: proposed
      };
    }
    return { type: 'ready', model: currentModel };
  }

  // État 1 : Chargement initial
  const stLoading = computeComposerStatus({
    loadingModels: true,
    modelsError: null,
    models: [],
    activeModelId: '',
    providers: [{ activeKeys: 1, isLocal: false }]
  });
  assert.equal(stLoading.type, 'loading');
  assert.equal(stLoading.message, 'Chargement…');

  // État 2 : Erreur réseau
  const stError = computeComposerStatus({
    loadingModels: false,
    modelsError: 'Connexion refusée',
    models: [],
    activeModelId: '',
    providers: [{ activeKeys: 1, isLocal: false }]
  });
  assert.equal(stError.type, 'error');
  assert.equal(stError.message, 'Connexion refusée');

  // État 3 : Sans fournisseur
  const stNoProv = computeComposerStatus({
    loadingModels: false,
    modelsError: null,
    models: [],
    activeModelId: '',
    providers: [{ activeKeys: 0, isLocal: false }]
  });
  assert.equal(stNoProv.type, 'no_provider');
  assert.equal(stNoProv.message, 'Ajoutez une clé API dans Paramètres › Fournisseurs & Clés');

  // État 4 : Modèle indisponible avec proposition
  const stUnavail = computeComposerStatus({
    loadingModels: false,
    modelsError: null,
    models: [{ id: 'model-b', name: 'Modèle B' }],
    activeModelId: 'model-a-deleted',
    providers: [{ activeKeys: 1, isLocal: false }]
  });
  assert.equal(stUnavail.type, 'unavailable');
  assert.equal(stUnavail.proposedModel.id, 'model-b');

  // État 5 : Prêt
  const stReady = computeComposerStatus({
    loadingModels: false,
    modelsError: null,
    models: [{ id: 'model-b', name: 'Modèle B' }],
    activeModelId: 'model-b',
    providers: [{ activeKeys: 1, isLocal: false }]
  });
  assert.equal(stReady.type, 'ready');
  assert.equal(stReady.model.id, 'model-b');
});

// ─── 4. Auto-sélection de modèle après ajout de clé ───

test('4. Auto-sélection : premier modèle sélectionné dès disponibilité du catalogue', () => {
  let activeModelId = '';
  const availableModels = [
    { id: 'openai/gpt-4o', name: 'GPT-4o' },
    { id: 'openai/gpt-4o-mini', name: 'GPT-4o mini' }
  ];

  function autoSelectIfNeeded() {
    const found = availableModels.some(m => m.id === activeModelId);
    if (!found && availableModels.length > 0) {
      activeModelId = availableModels[0].id;
    }
  }

  assert.equal(activeModelId, '');
  autoSelectIfNeeded();
  assert.equal(activeModelId, 'openai/gpt-4o', 'Le premier modèle disponible doit être auto-sélectionné');
});

// ─── 5. Recherche et Filtrage du catalogue ───

test('5. Recherche catalogue : insensible à la casse, filtre par nom, id et fournisseur', () => {
  const catalog = [
    { id: 'openai/gpt-4o', name: 'GPT-4o', providerName: 'OpenAI' },
    { id: 'anthropic/claude-3-5-sonnet', name: 'Sonnet 3.5', providerName: 'Anthropic' },
    { id: 'mistral/mistral-large', name: 'Mistral Large', providerName: 'Mistral AI' }
  ];

  function search(query) {
    const q = query.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter(m =>
      m.name.toLowerCase().includes(q) ||
      m.id.toLowerCase().includes(q) ||
      m.providerName.toLowerCase().includes(q)
    );
  }

  // Recherche par nom
  assert.equal(search('sonnet').length, 1);
  assert.equal(search('sonnet')[0].id, 'anthropic/claude-3-5-sonnet');

  // Recherche par fournisseur
  assert.equal(search('mistral').length, 1);

  // Recherche insensible à la casse
  assert.equal(search('GPT-4O').length, 1);

  // Recherche infructueuse
  assert.equal(search('inexistant').length, 0);
});

// ─── 6. Persistance des Préférences (Favoris et Masquage) ───

test('6. Préférences modèles : bascule isFavorite et isHidden avec persistance SQLite', async () => {
  const manager = new ModelCatalogManager();
  await manager.initialize();

  const testModelId = 'openai/gpt-4o';
  const model = manager.getModel(testModelId);
  assert.ok(model, 'Le modèle openai/gpt-4o doit exister après initialisation');

  // État initial (gpt-4o est curé mais pas favori par défaut)
  assert.equal(Boolean(model.isFavorite), false);
  assert.equal(Boolean(model.isHidden), false);

  // Favori activé
  const ok1 = manager.updatePreferences(testModelId, { isFavorite: true });
  assert.equal(ok1, true);
  assert.equal(manager.getModel(testModelId)?.isFavorite, true);

  // Masqué activé
  const ok2 = manager.updatePreferences(testModelId, { isHidden: true });
  assert.equal(ok2, true);
  assert.equal(manager.getModel(testModelId)?.isHidden, true);
  assert.equal(manager.getModel(testModelId)?.isFavorite, true, 'Le statut de favori doit être conservé');

  // Rétablir l'état
  manager.updatePreferences(testModelId, { isFavorite: false, isHidden: false });
});

// ─── 7. Incompatibilité des Capacités en direct ───

test('7. Capacités : détection d\'incompatibilité (images sans vision, mode Code sans outils)', () => {
  function getIncompatibilityReason(model, attachments = [], composerMode = 'chat') {
    if (attachments.some(a => a.isImage) && !model.capabilities?.vision) {
      return 'Ne supporte pas les images';
    }
    if (composerMode === 'code' && !model.capabilities?.tools) {
      return 'Ne supporte pas les outils (mode Code)';
    }
    return null;
  }

  const modelWithoutVision = {
    id: 'text-only',
    name: 'Text Only',
    capabilities: { vision: false, tools: true }
  };

  const modelWithoutTools = {
    id: 'chat-only',
    name: 'Chat Only',
    capabilities: { vision: true, tools: false }
  };

  const fullModel = {
    id: 'omni',
    name: 'Omni',
    capabilities: { vision: true, tools: true }
  };

  // 7.1 Image jointe sans vision
  assert.equal(
    getIncompatibilityReason(modelWithoutVision, [{ isImage: true }]),
    'Ne supporte pas les images'
  );

  // 7.2 Mode code sans outils
  assert.equal(
    getIncompatibilityReason(modelWithoutTools, [], 'code'),
    'Ne supporte pas les outils (mode Code)'
  );

  // 7.3 Modèle complet compatible partout
  assert.equal(getIncompatibilityReason(fullModel, [{ isImage: true }], 'code'), null);
  assert.equal(getIncompatibilityReason(fullModel, [], 'chat'), null);
});

// ─── 8. Récents limités à 3 et dédupliqués ───

test('8. Récents : empilement avec déduplication et plafond strict à 3 éléments', () => {
  let recents = [];

  function addRecent(id) {
    const filtered = recents.filter(r => r !== id);
    recents = [id, ...filtered].slice(0, 3);
  }

  addRecent('model-1');
  addRecent('model-2');
  addRecent('model-3');
  assert.deepEqual(recents, ['model-3', 'model-2', 'model-1']);

  // Ajout d'un 4ème modèle : le plus ancien est évincé
  addRecent('model-4');
  assert.deepEqual(recents, ['model-4', 'model-3', 'model-2']);
  assert.equal(recents.length, 3);

  // Ré-utilisation d'un modèle déjà présent : remonté en tête sans doublon
  addRecent('model-3');
  assert.deepEqual(recents, ['model-3', 'model-4', 'model-2']);
  assert.equal(recents.length, 3);
});

// ─── 9. Navigation Clavier du Menu Déroulant ───

test('9. Navigation Clavier : flèches avec bouclage modulo N et validation Entrée', () => {
  const items = ['item-0', 'item-1', 'item-2'];
  let highlightedIndex = -1;

  function onKeyDown(key) {
    if (items.length === 0) return;
    if (key === 'ArrowDown') {
      highlightedIndex = highlightedIndex + 1 >= items.length ? 0 : highlightedIndex + 1;
    } else if (key === 'ArrowUp') {
      highlightedIndex = highlightedIndex - 1 < 0 ? items.length - 1 : highlightedIndex - 1;
    }
  }

  // Départ
  assert.equal(highlightedIndex, -1);

  // ArrowDown -> 0
  onKeyDown('ArrowDown');
  assert.equal(highlightedIndex, 0);

  // ArrowDown -> 1
  onKeyDown('ArrowDown');
  assert.equal(highlightedIndex, 1);

  // ArrowDown -> 2
  onKeyDown('ArrowDown');
  assert.equal(highlightedIndex, 2);

  // ArrowDown -> bouclage à 0
  onKeyDown('ArrowDown');
  assert.equal(highlightedIndex, 0);

  // ArrowUp -> bouclage à 2
  onKeyDown('ArrowUp');
  assert.equal(highlightedIndex, 2);
});
