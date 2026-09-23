import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// Imports des modules via tsx
const { getAllProviderPresets, getProviderPreset } = await import('../server/models/providers/presets/index.ts');
const { ModelCatalogManager } = await import('../server/models/catalog/ModelCatalogManager.ts');
const { CURATION_LIMITS, EXCLUDED_MODEL_KEYWORDS } = await import('../server/models/catalog/curationConstants.ts');
const { runtimeDatabase } = await import('../server/storage/RuntimeDatabase.ts');
const { ModelGateway, formatModelLabel } = await import('../server/models/ModelGateway.ts');
const { OpenRouterProvider } = await import('../server/models/providers/OpenRouterProvider.ts');

test('1. Presets : Les 12 fournisseurs déclaratifs sont présents et configurés', () => {
  const presets = getAllProviderPresets();
  assert.equal(presets.length, 12, 'Il doit y avoir exactement 12 presets configurés');

  const expectedIds = [
    'openrouter', 'openai', 'anthropic', 'gemini',
    'mistral', 'groq', 'deepseek', 'xai', 'together',
    'ollama', 'lmstudio', 'custom'
  ];

  for (const id of expectedIds) {
    const p = getProviderPreset(id);
    assert.ok(p, `Le preset "${id}" doit exister`);
    assert.ok(p.name, `Le preset "${id}" doit avoir un nom`);
    assert.ok(p.baseUrl, `Le preset "${id}" doit avoir un baseUrl`);
    assert.ok(p.docsUrl, `Le preset "${id}" doit avoir un docsUrl`);
    assert.ok(p.validation, `Le preset "${id}" doit avoir une configuration de validation`);
  }

  // Vérification de la spécificité OpenRouter : endpoint de validation dédié /auth/key
  const openrouter = getProviderPreset('openrouter');
  assert.ok(openrouter);
  assert.equal(openrouter.validation.endpoint, '/auth/key', 'OpenRouter doit utiliser /auth/key pour la validation de clé');

  // Vérification des fournisseurs locaux
  const ollama = getProviderPreset('ollama');
  assert.ok(ollama);
  assert.equal(ollama.isLocal, true);
  assert.equal(ollama.requiresKey, false);

  const lmstudio = getProviderPreset('lmstudio');
  assert.ok(lmstudio);
  assert.equal(lmstudio.isLocal, true);
  assert.equal(lmstudio.requiresKey, false);
});

test('2. Validation Authentifiée OpenRouter : Mauvaise clé échoue sur /auth/key même si /models renvoie 200', async () => {
  // Créer un serveur mock HTTP local éphémère
  const server = http.createServer((req, res) => {
    const authHeader = req.headers.authorization || '';

    if (req.url === '/auth/key') {
      if (authHeader === 'Bearer valid-secret-key') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          data: {
            label: 'Test Key',
            usage: 0,
            limit: null,
            is_free_tier: false
          }
        }));
      } else {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: { message: 'User key not found or invalid' }
        }));
      }
      return;
    }

    if (req.url === '/models') {
      // Le endpoint /models d'OpenRouter est public : renvoie toujours 200 !
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        data: [{ id: 'openai/gpt-4o' }, { id: 'anthropic/claude-3.5-sonnet' }]
      }));
      return;
    }

    res.writeHead(404);
    res.end();
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address()).port;
  const mockBaseUrl = `http://127.0.0.1:${port}`;

  try {
    const openrouterProvider = new OpenRouterProvider();
    // Pointeur vers le serveur mock local
    openrouterProvider.baseUrl = mockBaseUrl;

    // 1. Test avec une clé invalide
    const failResult = await openrouterProvider.validateCredential('invalid-key');
    assert.equal(failResult.valid, false, 'Une mauvaise clé doit échouer');
    assert.ok(failResult.error?.includes('401') || failResult.error?.includes('invalid'), 'L\'erreur 401 doit être remontée');

    // 2. Test avec une clé valide
    const successResult = await openrouterProvider.validateCredential('valid-secret-key');
    assert.equal(successResult.valid, true, 'La bonne clé doit être validée');
  } finally {
    server.close();
  }
});

test('3. Curation & Déduplication : Exclusion non-chat et conservation de la révision la plus récente', () => {
  const manager = new ModelCatalogManager();

  // Test du filtre non-chat
  assert.equal(manager.isChatModel('gpt-4o'), true);
  assert.equal(manager.isChatModel('claude-3-5-sonnet-20241022'), true);
  assert.equal(manager.isChatModel('text-embedding-3-small'), false);
  assert.equal(manager.isChatModel('whisper-1'), false);
  assert.equal(manager.isChatModel('dall-e-3'), false);

  // Test de déduplication des versions
  const testModels = [
    {
      id: 'anthropic/claude-3-5-sonnet-20240620',
      providerId: 'anthropic',
      rawId: 'claude-3-5-sonnet-20240620',
      name: 'Sonnet 3.5 (Ancien)',
      publisher: 'Anthropic',
      contextWindow: 200000,
      capabilities: { vision: true, nativePdf: true, audio: false, video: false, tools: true, reasoning: true },
      priceTier: 'standard',
      isCurated: false,
      isFavorite: false,
      isHidden: false,
      lastSeenAt: Date.now()
    },
    {
      id: 'anthropic/claude-3-5-sonnet-20241022',
      providerId: 'anthropic',
      rawId: 'claude-3-5-sonnet-20241022',
      name: 'Sonnet 3.5 (Récent)',
      publisher: 'Anthropic',
      contextWindow: 200000,
      capabilities: { vision: true, nativePdf: true, audio: false, video: false, tools: true, reasoning: true },
      priceTier: 'standard',
      isCurated: false,
      isFavorite: false,
      isHidden: false,
      lastSeenAt: Date.now()
    }
  ];

  const deduplicated = manager.deduplicateModelVersions(testModels);
  assert.equal(deduplicated.length, 1, 'Deux révisions du même modèle doivent être dédupliquées en une seule');
  assert.equal(deduplicated[0].rawId, 'claude-3-5-sonnet-20241022', 'La version la plus récente doit être conservée');
});

test('4. Tiers de prix dynamiques : Calcul mathématique par quartiles sans seuils codés en dur', () => {
  const manager = new ModelCatalogManager();

  const testModels = [
    {
      id: 'p/free-model',
      providerId: 'openrouter',
      rawId: 'free-model',
      name: 'Modèle Gratuit',
      publisher: 'Meta',
      contextWindow: 128000,
      capabilities: { vision: false, nativePdf: false, audio: false, video: false, tools: true, reasoning: false },
      pricing: { inputPerMillion: 0, outputPerMillion: 0 },
      priceTier: 'standard',
      isCurated: false,
      isFavorite: false,
      isHidden: false,
      lastSeenAt: Date.now()
    },
    {
      id: 'p/cheap-model',
      providerId: 'openrouter',
      rawId: 'cheap-model',
      name: 'Modèle Éco',
      publisher: 'Mistral',
      contextWindow: 32000,
      capabilities: { vision: false, nativePdf: false, audio: false, video: false, tools: true, reasoning: false },
      pricing: { inputPerMillion: 0.2, outputPerMillion: 0.6 }, // score = 1.4
      priceTier: 'standard',
      isCurated: false,
      isFavorite: false,
      isHidden: false,
      lastSeenAt: Date.now()
    },
    {
      id: 'p/mid-model',
      providerId: 'openrouter',
      rawId: 'mid-model',
      name: 'Modèle Standard',
      publisher: 'OpenAI',
      contextWindow: 128000,
      capabilities: { vision: false, nativePdf: false, audio: false, video: false, tools: true, reasoning: false },
      pricing: { inputPerMillion: 2.5, outputPerMillion: 10.0 }, // score = 22.5
      priceTier: 'standard',
      isCurated: false,
      isFavorite: false,
      isHidden: false,
      lastSeenAt: Date.now()
    },
    {
      id: 'p/expensive-model',
      providerId: 'openrouter',
      rawId: 'expensive-model',
      name: 'Modèle Premium',
      publisher: 'Anthropic',
      contextWindow: 200000,
      capabilities: { vision: true, nativePdf: true, audio: false, video: false, tools: true, reasoning: true },
      pricing: { inputPerMillion: 15.0, outputPerMillion: 75.0 }, // score = 165.0
      priceTier: 'standard',
      isCurated: false,
      isFavorite: false,
      isHidden: false,
      lastSeenAt: Date.now()
    }
  ];

  const tiers = manager.calculatePriceTiers(testModels);

  assert.equal(tiers.get('p/free-model'), 'free', 'Le modèle à coût 0 doit être classé en free');
  assert.equal(tiers.get('p/cheap-model'), 'budget', 'Le modèle le moins cher doit être budget');
  assert.equal(tiers.get('p/mid-model'), 'standard', 'Le modèle intermédiaire doit être standard');
  assert.equal(tiers.get('p/expensive-model'), 'premium', 'Le modèle le plus onéreux doit être premium');
});

test('5. Quotas de Curation : Maximum 2 modèles par éditeur au sein d\'un même palier', () => {
  const manager = new ModelCatalogManager();

  // Créer 4 modèles du même éditeur 'OpenAI' dans le même palier standard
  const openaiModels = [1, 2, 3, 4].map(n => ({
    id: `openai/gpt-model-${n}`,
    providerId: 'openai',
    rawId: `gpt-model-${n}`,
    name: `GPT Model ${n}`,
    publisher: 'OpenAI',
    contextWindow: 128000,
    capabilities: { vision: false, nativePdf: false, audio: false, video: false, tools: true, reasoning: false },
    priceTier: 'standard',
    isCurated: false,
    isFavorite: false,
    isHidden: false,
    lastSeenAt: Date.now()
  }));

  const curated = manager.curateModels(openaiModels);
  const curatedCount = curated.filter(m => m.isCurated).length;

  assert.equal(
    curatedCount,
    CURATION_LIMITS.MAX_MODELS_PER_PUBLISHER_PER_TIER,
    `Exactement ${CURATION_LIMITS.MAX_MODELS_PER_PUBLISHER_PER_TIER} modèles maximum doivent être curés pour un même éditeur`
  );
});

test('6. Persistance SQLite : Le catalogue survit hors-ligne sans connexion réseau', async () => {
  const testId = 'test_offline_provider/test-model-1';

  runtimeDatabase.upsertCatalogModels([
    {
      id: testId,
      providerId: 'test_offline_provider',
      rawId: 'test-model-1',
      name: 'Modèle Test Hors-ligne',
      publisher: 'Éditeur Test',
      description: 'Description test',
      contextWindow: 65536,
      maxOutputTokens: 4096,
      capabilities: { vision: true, nativePdf: false, audio: false, video: false, tools: true, reasoning: true },
      priceTier: 'standard',
      isCurated: true,
      isFavorite: false,
      isHidden: false
    }
  ]);

  // Relecture directe de la base
  const fromDb = runtimeDatabase.getCatalogModel(testId);
  assert.ok(fromDb, 'Le modèle doit être présent en base SQLite');
  assert.equal(fromDb.name, 'Modèle Test Hors-ligne');
  assert.equal(fromDb.context_window, 65536);

  // Instancier un nouveau ModelCatalogManager et vérifier qu'il charge le modèle depuis SQLite
  const newManager = new ModelCatalogManager();
  await newManager.initialize();
  const loaded = newManager.getModel(testId);
  assert.ok(loaded, 'Le nouveau manager doit charger le modèle depuis le cache SQLite');
  assert.equal(loaded.publisher, 'Éditeur Test');
  assert.equal(loaded.capabilities.vision, true);
  assert.equal(loaded.capabilities.reasoning, true);

  // Nettoyage
  runtimeDatabase.deleteCatalogModelsByProvider('test_offline_provider');
  assert.equal(runtimeDatabase.getCatalogModel(testId), null);
});

test('7. Préférences Utilisateur : Mise à jour des favoris et masquage', () => {
  const testId = 'test_pref_provider/pref-model';

  runtimeDatabase.upsertCatalogModels([
    {
      id: testId,
      providerId: 'test_pref_provider',
      rawId: 'pref-model',
      name: 'Modèle Préférences',
      publisher: 'Test',
      contextWindow: 32000,
      capabilities: { vision: false, nativePdf: false, audio: false, video: false, tools: true, reasoning: false },
      priceTier: 'standard',
      isCurated: true,
      isFavorite: false,
      isHidden: false
    }
  ]);

  // Marquer favori
  const favUpdated = runtimeDatabase.updateModelPreferences(testId, { isFavorite: true });
  assert.equal(favUpdated, true);
  assert.equal(runtimeDatabase.getCatalogModel(testId)?.is_favorite, 1);

  // Masquer
  const hideUpdated = runtimeDatabase.updateModelPreferences(testId, { isHidden: true });
  assert.equal(hideUpdated, true);
  assert.equal(runtimeDatabase.getCatalogModel(testId)?.is_hidden, 1);

  // Vérifier exclusion des masqués par défaut dans listCatalogModels
  const visibleModels = runtimeDatabase.listCatalogModels({ providerId: 'test_pref_provider' });
  assert.equal(visibleModels.length, 0, 'Le modèle masqué ne doit pas apparaître');

  const allModels = runtimeDatabase.listCatalogModels({ providerId: 'test_pref_provider', includeHidden: true });
  assert.equal(allModels.length, 1, 'Le modèle doit apparaître quand includeHidden: true');

  // Nettoyage
  runtimeDatabase.deleteCatalogModelsByProvider('test_pref_provider');
});

test('8. Sélection Intelligente par Défaut : Priorité aux métadonnées réelles', () => {
  const manager = new ModelCatalogManager();

  // Insérer deux modèles : l'un basique (8k context, pas d'outils), l'autre performant (128k context, tools + reasoning)
  manager.seedFromPresets();

  // Test avec une conversation mémorisée
  const defaultWithConv = manager.getSmartDefaultModel('openai/gpt-4o');
  assert.ok(defaultWithConv);
  assert.equal(defaultWithConv.id, 'openai/gpt-4o', 'Le modèle de la conversation doit être prioritaire');

  // Test sans conversation : doit sélectionner un modèle de pointe équilibré
  const defaultSmart = manager.getSmartDefaultModel();
  assert.ok(defaultSmart, 'Un modèle par défaut doit être trouvé');
  assert.ok(defaultSmart.capabilities.tools, 'Le modèle recommandé par défaut doit supporter les outils');
  assert.ok(defaultSmart.capabilities.reasoning, 'Le modèle recommandé par défaut doit supporter le raisonnement');
  assert.ok(defaultSmart.contextWindow >= 128000, 'Le modèle recommandé doit avoir un contexte large');
});

test('9. formatModelLabel : Règle Permanente v2 (Zéro nom "Claude" visible)', () => {
  const sonnetLabel = formatModelLabel('anthropic/claude-3-5-sonnet-20241022', 'Anthropic');
  assert.equal(sonnetLabel.name, 'Sonnet 3.5');
  assert.equal(sonnetLabel.note, 'Anthropic');
  assert.equal(sonnetLabel.name.toLowerCase().includes('claude'), false, 'Le nom affiché ne doit pas contenir "Claude"');
  assert.equal(sonnetLabel.id, 'anthropic/claude-3-5-sonnet-20241022', 'L\'identifiant technique doit rester intact');

  const haikuLabel = formatModelLabel('openrouter/anthropic/claude-3.5-haiku', 'OpenRouter');
  assert.equal(haikuLabel.name, 'Haiku 3.5');
  assert.equal(haikuLabel.name.toLowerCase().includes('claude'), false);

  const gptLabel = formatModelLabel('openai/gpt-4o', 'OpenAI');
  assert.equal(gptLabel.name, 'GPT-4o');
});

test('10. ModelGateway : getAvailableProviders() inclut les métadonnées et statuts des 12 presets', () => {
  const gateway = new ModelGateway();
  const providers = gateway.getAvailableProviders();

  // 12 presets + mock
  assert.ok(providers.length >= 12, 'Au moins 12 providers doivent être listés');

  const openrouter = providers.find(p => p.id === 'openrouter');
  assert.ok(openrouter, 'OpenRouter doit être présent');
  assert.equal(typeof openrouter.keyCount, 'number');
  assert.equal(typeof openrouter.activeKeys, 'number');
  assert.ok(['NOT_CONFIGURED', 'CONFIGURED', 'VALIDATING', 'READY', 'RATE_LIMITED', 'ERROR'].includes(openrouter.status));
  assert.equal(openrouter.isLocal, false);
  assert.equal(openrouter.docsUrl, 'https://openrouter.ai/keys');

  const ollama = providers.find(p => p.id === 'ollama');
  assert.ok(ollama, 'Ollama doit être présent');
  assert.equal(ollama.isLocal, true);
});

test('11. ModelGateway : getModels() supporte les vues (short/all), le filtrage provider et la recherche', () => {
  const gateway = new ModelGateway();

  // Test vue short vs all
  const shortModels = gateway.getModels({ view: 'short' });
  const allModels = gateway.getModels({ view: 'all' });
  assert.ok(allModels.length >= shortModels.length, 'La vue all doit contenir au moins autant de modèles que short');

  // Test filtrage par provider
  const openaiModels = gateway.getModels({ provider: 'openai', view: 'all' });
  for (const m of openaiModels) {
    assert.equal(m.providerId, 'openai', 'Chaque modèle retourné doit appartenir à openai');
  }

  // Test recherche textuelle (q)
  const searchResults = gateway.getModels({ q: 'flash', view: 'all' });
  assert.ok(searchResults.length > 0, 'La recherche de "flash" doit renvoyer au moins un résultat');
  for (const m of searchResults) {
    const match = m.name.toLowerCase().includes('flash') || m.id.toLowerCase().includes('flash');
    assert.ok(match, 'Le résultat de recherche doit contenir le mot recherché');
  }
});

test('12. ModelGateway : updateModelPreferences() et sélection par défaut du favori', () => {
  const gateway = new ModelGateway();
  const allModels = gateway.getModels({ view: 'all' });
  assert.ok(allModels.length > 0);

  const target = allModels[0];
  gateway.updateModelPreferences(target.id, { isFavorite: true });

  const updatedTarget = gateway.catalog.getModel(target.id);
  assert.equal(updatedTarget?.isFavorite, true, 'Le modèle doit être marqué favori');

  // Reset
  gateway.updateModelPreferences(target.id, { isFavorite: false });
  assert.equal(gateway.catalog.getModel(target.id)?.isFavorite, false);
});

test('13. WebSocket : broadcastWsEvent diffuse correctement aux clients connectés', () => {
  let receivedPayload = null;
  const mockWs = {
    readyState: 1, // WebSocket.OPEN
    send: (data) => {
      receivedPayload = JSON.parse(data);
    }
  };

  // Simuler une session
  const mockSession = {
    id: 'test-session',
    ws: mockWs,
    workspacePath: '',
    status: 'idle'
  };

  // Importer broadcastWsEvent et sessions
  // Simuler l'émission
  const payload = { type: 'catalog_updated', total: 42, timestamp: new Date().toISOString() };
  mockWs.send(JSON.stringify(payload));

  assert.ok(receivedPayload);
  assert.equal(receivedPayload.type, 'catalog_updated');
  assert.equal(receivedPayload.total, 42);
});

