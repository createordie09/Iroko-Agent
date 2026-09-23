import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import fs from 'fs';
import os from 'os';

const { AgentLoop } = await import('../server/runtime/AgentLoop.ts');
const { Planner } = await import('../server/runtime/Planner.ts');
const { PermissionEngine } = await import('../server/permissions/PermissionEngine.ts');
const { toolRegistry } = await import('../server/tools/ToolRegistry.ts');
const { processManager } = await import('../server/tools/terminal/ProcessManager.ts');

test('1. Outil bloqué : Interruption automatique par timeout sans figer le runtime', async () => {
  // Enregistrer un outil de test avec un délai très court (50ms)
  const slowTool = {
    name: 'test_slow_tool',
    description: 'Outil de test simulant un blocage',
    category: 'filesystem',
    permission: 'SAFE',
    timeoutMs: 50,
    parameters: { type: 'object', properties: {} },
    async execute() {
      // Simule un blocage de 500ms
      await new Promise(resolve => setTimeout(resolve, 500));
      return { success: true, data: 'Terminé' };
    }
  };

  toolRegistry.register(slowTool);

  const context = {
    workspacePath: process.cwd(),
    sessionId: 'test-session-timeout',
    permissionEngine: new PermissionEngine(),
    emitEvent: () => {}
  };

  const result = await toolRegistry.executeTool('test_slow_tool', {}, context);

  assert.equal(result.success, false);
  assert.ok(result.error?.includes('Délai d\'exécution dépassé'), `L'erreur attendue doit mentionner le timeout (reçu: ${result.error})`);
});

test('2. Attente d\'autorisation : Temps d\'attente utilisateur non décompté des délais', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'iroko-wait-test-'));
  const engine = new PermissionEngine(tempDir);

  assert.equal(engine.getTotalWaitTimeMs(), 0);

  // Simuler une demande où l'utilisateur met 60ms à répondre
  const requestPromise = engine.requestPermission(
    'execute_command',
    'MEDIUM',
    'Test wait time',
    { command: 'npm test' },
    (req) => {
      setTimeout(() => {
        engine.resolvePermission(req.id, true, 'once');
      }, 60);
    }
  );

  const approved = await requestPromise;
  assert.equal(approved, true);

  const waitTime = engine.getTotalWaitTimeMs();
  assert.ok(waitTime >= 50, `Le temps d'attente utilisateur doit être comptabilisé (reçu: ${waitTime}ms)`);

  // Vérifier la réinitialisation
  engine.resetWaitTime();
  assert.equal(engine.getTotalWaitTimeMs(), 0);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('3. Annulation : Propagation de l\'AbortSignal aux processus du ProcessManager', async () => {
  const controller = new AbortController();

  // Lancer une commande longue (ex: ping ou sleep ou node loop) et l'annuler après 50ms
  const longCmd = process.platform === 'win32'
    ? 'Start-Sleep -Seconds 10'
    : 'sleep 10';

  setTimeout(() => {
    controller.abort();
  }, 50);

  const result = await processManager.executeCommand(
    longCmd,
    process.cwd(),
    60000,
    undefined,
    controller.signal
  );

  assert.equal(result.exitCode, 130);
  assert.ok(result.stderr.includes('interrompue') || result.stderr.includes('annulée'));
});

test('4. Détection d\'outil qui échoue en boucle : 3 échecs identiques arrêtent la boucle', async () => {
  const loop = new AgentLoop();
  const events = [];
  const emitEvent = (ev) => events.push(ev);
  const planner = new Planner(emitEvent);

  // Créer un outil qui échoue systématiquement avec la même erreur
  const failingTool = {
    name: 'test_failing_tool',
    description: 'Outil échouant toujours',
    category: 'filesystem',
    permission: 'SAFE',
    parameters: { type: 'object', properties: {} },
    async execute() {
      return { success: false, error: 'Connexion réseau refusée (ECONNREFUSED)' };
    }
  };
  toolRegistry.register(failingTool);

  // Mock du modelGateway pour appeler 4 fois l'outil défaillant
  const { modelGateway } = await import('../server/models/ModelGateway.ts');
  const originalGenerateStream = modelGateway.generateStream.bind(modelGateway);

  let tour = 0;
  modelGateway.generateStream = async function* () {
    tour++;
    yield {
      type: 'tool_call_delta',
      id: `call_${tour}`,
      name: 'test_failing_tool',
      argumentsDelta: '{}'
    };
  };

  const context = {
    workspacePath: process.cwd(),
    sessionId: 'test-failing-loop',
    permissionEngine: new PermissionEngine(),
    emitEvent
  };

  try {
    const result = await loop.run('Test échecs en boucle', context, planner, { maxIterations: 10 });
    
    // Vérifier qu'un événement d'erreur d'arrêt automatique pour 3 échecs identiques a été émis
    const loopError = events.find(e => e.type === 'error' && e.message?.includes('échoué 3 fois consécutivement'));
    assert.ok(loopError, 'Un événement d\'arrêt pour 3 échecs consécutifs doit être émis');
    assert.ok(tour <= 4, `La boucle aurait dû s'arrêter dès le 3ème échec (tours: ${tour})`);
  } finally {
    modelGateway.generateStream = originalGenerateStream;
  }
});

test('5. Progrès : Tâche en lecture seule non interrompue à tort par l\'absence de modification de fichier', async () => {
  const loop = new AgentLoop();
  const events = [];
  const emitEvent = (ev) => events.push(ev);
  const planner = new Planner(emitEvent);

  // Outil de lecture retournant des données utiles
  let readCount = 0;
  const readTool = {
    name: 'test_read_progress_tool',
    description: 'Outil de lecture produisant du progrès',
    category: 'filesystem',
    permission: 'SAFE',
    parameters: { type: 'object', properties: {} },
    async execute() {
      readCount++;
      return { success: true, data: `Contenu utile découvert au tour ${readCount}` };
    }
  };
  toolRegistry.register(readTool);

  const { modelGateway } = await import('../server/models/ModelGateway.ts');
  const originalGenerateStream = modelGateway.generateStream.bind(modelGateway);

  let tour = 0;
  modelGateway.generateStream = async function* () {
    tour++;
    if (tour <= 3) {
      yield {
        type: 'tool_call_delta',
        id: `call_read_${tour}`,
        name: 'test_read_progress_tool',
        argumentsDelta: '{}'
      };
    } else {
      // Conclusion
      yield {
        type: 'text_delta',
        text: 'Analyse en lecture seule terminée avec succès.'
      };
    }
  };

  const context = {
    workspacePath: process.cwd(),
    sessionId: 'test-read-progress',
    permissionEngine: new PermissionEngine(),
    emitEvent
  };

  try {
    const result = await loop.run('Analyse en lecture seule', context, planner, { maxIterations: 6 });
    
    // Aucune erreur de manque de progrès ne doit être émise malgré 0 fichier modifié
    const noProgressError = events.find(e => e.type === 'error' && e.message?.includes('aucun progrès'));
    assert.equal(noProgressError, undefined, 'La tâche en lecture seule ne doit pas être interrompue pour manque de progrès');
    assert.equal(result.success, true);
    assert.equal(result.filesChanged.length, 0);
  } finally {
    modelGateway.generateStream = originalGenerateStream;
  }
});

test('6. Stagnation : Boucle sans aucun progrès arrêtée après 5 tours avec explication', async () => {
  const loop = new AgentLoop();
  const events = [];
  const emitEvent = (ev) => events.push(ev);
  const planner = new Planner(emitEvent);

  // Outil retournant un résultat vide (aucun progrès)
  const emptyTool = {
    name: 'test_empty_tool',
    description: 'Outil sans résultat',
    category: 'filesystem',
    permission: 'SAFE',
    parameters: { type: 'object', properties: {} },
    async execute() {
      return { success: true, data: '' };
    }
  };
  toolRegistry.register(emptyTool);

  const { modelGateway } = await import('../server/models/ModelGateway.ts');
  const originalGenerateStream = modelGateway.generateStream.bind(modelGateway);

  let tour = 0;
  modelGateway.generateStream = async function* () {
    tour++;
    yield {
      type: 'tool_call_delta',
      id: `call_empty_${tour}`,
      name: 'test_empty_tool',
      argumentsDelta: '{}'
    };
  };

  const context = {
    workspacePath: process.cwd(),
    sessionId: 'test-stagnation',
    permissionEngine: new PermissionEngine(),
    emitEvent
  };

  try {
    const result = await loop.run('Test stagnation', context, planner, { maxIterations: 10 });
    
    // Un événement d'erreur pour stagnation (5 tours sans progrès) doit être émis
    const stagnationError = events.find(e => e.type === 'error' && e.message?.includes('aucun progrès constaté depuis 5 tours'));
    assert.ok(stagnationError, 'Un événement d\'arrêt pour 5 tours sans progrès doit être émis');
    assert.equal(tour, 5, `La boucle doit s'arrêter exactement au 5ème tour sans progrès (tours exécutés: ${tour})`);
  } finally {
    modelGateway.generateStream = originalGenerateStream;
  }
});
