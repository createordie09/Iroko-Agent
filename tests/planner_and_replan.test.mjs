import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import path from 'path';
import os from 'os';
import fs from 'fs';

// Isolation stricte : initialiser IROKO_DATA_DIR avant tout import du runtime
const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'iroko-plan-test-'));
process.env.IROKO_DATA_DIR = testDataDir;

const { Planner } = await import('../server/runtime/Planner.ts');
const { runtimeDatabase } = await import('../server/storage/RuntimeDatabase.ts');
const { toolRegistry } = await import('../server/tools/ToolRegistry.ts');
const { AgentLoop } = await import('../server/runtime/AgentLoop.ts');

describe('MISSION L11 : Boucle Autonome Évoluée & Gestionnaire de Plan Dynamique Auto-Replanifiant', () => {
  const baseTmp = path.join(os.tmpdir(), `iroko-l11-test-${Date.now()}`);

  before(() => {
    fs.mkdirSync(baseTmp, { recursive: true });
  });

  after(() => {
    try {
      fs.rmSync(baseTmp, { recursive: true, force: true });
      fs.rmSync(testDataDir, { recursive: true, force: true });
    } catch {}
  });

  test('1. Décomposition non triviale & Statuts fidèles à l\'exécution réelle', () => {
    const emittedEvents = [];
    const planner = new Planner((event) => {
      emittedEvents.push(event);
    });

    // 1.1 Requête triviale -> aucun plan ouvert
    assert.strictEqual(planner.isNonTrivial('bonjour'), false);
    assert.strictEqual(planner.isNonTrivial('Bonjour !'), false);
    assert.strictEqual(planner.isNonTrivial('qui es-tu ?'), false);
    assert.strictEqual(planner.isNonTrivial('merci'), false);

    const trivialPlan = planner.createInitialPlan('bonjour !');
    assert.strictEqual(trivialPlan.length, 0);
    assert.strictEqual(planner.getSteps().length, 0);

    // 1.2 Requête non triviale -> décomposition en étapes ordonnées
    assert.strictEqual(planner.isNonTrivial('Ajoute un composant de barre de navigation dans le projet'), true);
    assert.strictEqual(planner.isNonTrivial('Corrige le bug de rendu dans App.tsx et vérifie'), true);

    const plan = planner.createInitialPlan('Ajoute un composant de statut et vérifie le build');
    assert.strictEqual(plan.length, 3);
    assert.strictEqual(plan[0].status, 'in_progress');
    assert.strictEqual(plan[1].status, 'pending');
    assert.strictEqual(plan[2].status, 'pending');

    // Vérifier l'émission de l'événement 'plan'
    const lastEvent = emittedEvents[emittedEvents.length - 1];
    assert.strictEqual(lastEvent.type, 'plan');
    assert.strictEqual(lastEvent.steps.length, 3);

    // 1.3 Progression fidèle des statuts
    planner.updateStepStatus(0, 'completed');
    planner.updateStepStatus(1, 'in_progress');
    assert.strictEqual(planner.getSteps()[0].status, 'completed');
    assert.strictEqual(planner.getSteps()[1].status, 'in_progress');
  });

  test('2. Auto-replanification après un échec de vérification ou de test (§5.2, §22)', () => {
    const emittedEvents = [];
    const planner = new Planner((event) => {
      emittedEvents.push(event);
    });

    planner.createInitialPlan('Corrige les types et compile le projet');
    assert.strictEqual(planner.getSteps().length, 3);

    // Simuler l'avancement : étape 0 completed, étape 1 completed, étape 2 in_progress
    planner.updateStepStatus(0, 'completed');
    planner.updateStepStatus(1, 'completed');
    planner.updateStepStatus(2, 'in_progress');

    // Simuler un échec de vérification (ex: TypeScript TS2322)
    const replanResult = planner.replanAfterFailure({
      checkName: 'Typecheck TypeScript',
      output: 'src/App.tsx:10:5 - error TS2322: Type string is not assignable to type number.',
      error: 'Échec de vérification sur Typecheck'
    });

    assert.strictEqual(replanResult.replanned, true);
    const updatedSteps = planner.getSteps();

    // Le plan initial avait 3 étapes, après échec de l'étape 2 (passée en failed),
    // 3 étapes correctives sont insérées : diagnostic (in_progress), correction (pending), relance vérif (pending)
    assert.strictEqual(updatedSteps.length, 6);
    assert.strictEqual(updatedSteps[2].status, 'failed');
    assert.strictEqual(updatedSteps[3].title.includes('Diagnostiquer'), true);
    assert.strictEqual(updatedSteps[3].status, 'in_progress');
    assert.strictEqual(updatedSteps[4].title.includes('correction'), true);
    assert.strictEqual(updatedSteps[4].status, 'pending');
    assert.strictEqual(updatedSteps[5].title.includes('vérification'), true);
    assert.strictEqual(updatedSteps[5].status, 'pending');

    // Vérifier l'événement émis
    const lastPlanEvent = emittedEvents[emittedEvents.length - 1];
    assert.strictEqual(lastPlanEvent.type, 'plan');
    assert.strictEqual(lastPlanEvent.steps.length, 6);
  });

  test('3. Point de contrôle & Reprise après interruption forcée du runtime (§20.1, §21)', () => {
    const taskId = `test-task-resume-${Date.now()}`;
    const sessionId = `test-session-${Date.now()}`;

    const planInitial = [
      { id: 'step-1', title: 'Inspection du code', status: 'completed' },
      { id: 'step-2', title: 'Application du patch', status: 'completed' },
      { id: 'step-3', title: 'Vérification finale', status: 'in_progress' }
    ];

    // Sauvegarder un point de contrôle avec étapes déjà achevées
    runtimeDatabase.saveCheckpoint({
      taskId,
      sessionId,
      taskPrompt: 'Mettre à jour la configuration et vérifier',
      plan: planInitial,
      currentStepIndex: 2,
      completedSteps: [planInitial[0], planInitial[1]],
      filesChanged: ['src/config.ts']
    });

    // Vérifier la récupération du point de contrôle
    const retrieved = runtimeDatabase.getLatestCheckpoint(taskId);
    assert.ok(retrieved);
    assert.strictEqual(retrieved.task_id, taskId);

    const reloadedPlan = JSON.parse(retrieved.plan_json);
    assert.strictEqual(reloadedPlan.length, 3);
    assert.strictEqual(reloadedPlan[0].status, 'completed');
    assert.strictEqual(reloadedPlan[1].status, 'completed');
    assert.strictEqual(reloadedPlan[2].status, 'in_progress');

    // Charger dans Planner : les étapes terminées restent terminées sans être réexécutées
    const planner = new Planner(() => {});
    planner.loadFromCheckpoint(reloadedPlan);
    assert.strictEqual(planner.getSteps()[0].status, 'completed');
    assert.strictEqual(planner.getSteps()[1].status, 'completed');
    assert.strictEqual(planner.getSteps()[2].status, 'in_progress');

    runtimeDatabase.clearCheckpoints(taskId);
    assert.strictEqual(runtimeDatabase.getLatestCheckpoint(taskId), null);
  });

  test('4. Mode Plan (lecture seule) : restriction absolue aux outils SAFE', async () => {
    // 4.1 En mode 'plan', seules les définitions d'outils SAFE sont exposées au modèle
    const planTools = toolRegistry.getDefinitionsForModel('plan');
    const toolNames = planTools.map(t => t.name);

    // Les outils SAFE d'inspection doivent être présents
    assert.ok(toolNames.includes('read_file'));
    assert.ok(toolNames.includes('list_dir'));
    assert.ok(toolNames.includes('search_text'));
    assert.ok(toolNames.includes('git_status'));
    assert.ok(toolNames.includes('git_diff'));

    // Les outils modificateurs ou à risque doivent être absents
    assert.strictEqual(toolNames.includes('write_file'), false);
    assert.strictEqual(toolNames.includes('edit_file'), false);
    assert.strictEqual(toolNames.includes('execute_command'), false);
    assert.strictEqual(toolNames.includes('start_process'), false);
    assert.strictEqual(toolNames.includes('git_commit'), false);

    // 4.2 En mode 'plan', tentative d'exécuter un outil modificateur est bloquée net
    const context = {
      workspacePath: baseTmp,
      sessionId: 'test-plan-mode',
      executionMode: 'plan',
      permissionEngine: {},
      emitEvent: () => {}
    };

    // Tentative d'écriture -> rejet formel
    const writeResult = await toolRegistry.executeTool('write_file', {
      path: 'test.txt',
      content: 'hello'
    }, context);

    assert.strictEqual(writeResult.success, false);
    assert.ok(writeResult.error?.includes('Mode Plan actif (lecture seule)'));

    // Outil SAFE en mode plan -> exécution autorisée
    fs.writeFileSync(path.join(baseTmp, 'safe_test.txt'), 'contenu');
    const readResult = await toolRegistry.executeTool('read_file', {
      filePath: 'safe_test.txt'
    }, context);

    assert.strictEqual(readResult.success, true);
    assert.ok(readResult.data?.content.includes('contenu'));
  });

  test('5. Blocage persistant après replanifications répétées expliqué à l\'utilisateur (§37)', () => {
    const planner = new Planner(() => {});
    planner.createInitialPlan('Corrige le bug complexe');

    // 1ère replanification
    const r1 = planner.replanAfterFailure({ checkName: 'Test 1', error: 'Erreur 1' });
    assert.strictEqual(r1.replanned, true);
    assert.strictEqual(r1.maxReached, undefined);

    // 2e replanification
    const r2 = planner.replanAfterFailure({ checkName: 'Test 2', error: 'Erreur 2' });
    assert.strictEqual(r2.replanned, true);

    // 3e replanification
    const r3 = planner.replanAfterFailure({ checkName: 'Test 3', error: 'Erreur 3' });
    assert.strictEqual(r3.replanned, true);

    // 4e tentative -> Seuil max de 3 atteint, aucun nouvel ajout, arrêt avec maxReached
    const r4 = planner.replanAfterFailure({ checkName: 'Test 4', error: 'Erreur 4' });
    assert.strictEqual(r4.replanned, false);
    assert.strictEqual(r4.maxReached, true);
  });
});
