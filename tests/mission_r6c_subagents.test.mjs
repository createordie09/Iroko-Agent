// tests/mission_r6c_subagents.test.mjs
// Cahier §11 : Tests normatifs de la Mission R6c (Sous-agents spécialisés, confinement des permissions, routage automatique et repli)

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import path from 'path';
import os from 'os';
import fs from 'fs';

const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'iroko-r6c-subagents-'));
process.env.IROKO_DATA_DIR = testDataDir;

import { subagentManager } from '../server/subagents/SubagentManager.ts';
import { SUBAGENT_DEFINITIONS } from '../server/subagents/types.ts';
import { runtimeDatabase } from '../server/storage/RuntimeDatabase.ts';
import { ToolRegistry } from '../server/tools/ToolRegistry.ts';

describe('MISSION R6c : Sous-Agents Spécialisés et Routage (§11)', () => {
  const toolRegistry = new ToolRegistry();

  after(() => {
    try {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    } catch {}
  });

  test('1. Confinement strict : un sous-agent ne peut jamais exécuter une action interdite à son parent', async () => {
    let parentRequested = false;

    // 1.1 Contexte parent en lecture seule (isReadOnly: true)
    const readOnlyParentContext = {
      workspacePath: os.tmpdir(),
      sessionId: 'session-readonly',
      isReadOnly: true,
      permissionEngine: {
        requestPermission: async () => {
          parentRequested = true;
          return true; // Même si le moteur parent disait oui, le proxy doit interdire
        }
      },
      emitEvent: () => {}
    };

    const subContextReadOnly = subagentManager.createSubagentContext('test', readOnlyParentContext);
    const execAllowed = await subContextReadOnly.permissionEngine.requestPermission(
      'execute_command',
      'MEDIUM',
      'Exécution interdite en lecture seule'
    );
    assert.strictEqual(execAllowed, false, 'Une commande ne doit pas être exécutée si le parent est en lecture seule');
    assert.strictEqual(parentRequested, false, 'Le parent ne doit même pas être sollicité si la règle de lecture seule est violée');

    // 1.2 Refus explicite du parent
    const parentRefusingContext = {
      workspacePath: os.tmpdir(),
      sessionId: 'session-refuse',
      isReadOnly: false,
      permissionEngine: {
        requestPermission: async () => false // Le parent refuse
      },
      emitEvent: () => {}
    };

    const subContextRefused = subagentManager.createSubagentContext('explore', parentRefusingContext);
    const readAllowed = await subContextRefused.permissionEngine.requestPermission(
      'read_file',
      'SAFE',
      'Lecture refusée par le parent'
    );
    assert.strictEqual(readAllowed, false, 'Le sous-agent doit respecter le refus du parent');

    // 1.3 Tentative d\'élévation de privilèges pour un rôle restreint (explore demandant write_file)
    const permissiveParentContext = {
      workspacePath: os.tmpdir(),
      sessionId: 'session-permissive',
      permissionEngine: {
        requestPermission: async () => true
      },
      emitEvent: () => {}
    };

    const exploreContext = subagentManager.createSubagentContext('explore', permissiveParentContext);
    const writeRefused = await exploreContext.permissionEngine.requestPermission(
      'write_file',
      'MEDIUM',
      'Tentative d\'écriture par explore'
    );
    assert.strictEqual(writeRefused, false, 'explore ne doit pas pouvoir demander write_file');

    // 1.4 Test d\'exécution confinée via executeSubagentTool
    const toolExecResult = await subagentManager.executeSubagentTool(
      'write_file',
      { path: 'test.txt', content: 'hello' },
      exploreContext,
      'explore'
    );
    assert.strictEqual(toolExecResult.success, false);
    assert.ok(toolExecResult.error?.includes('interdite'));
  });

  test('2. Routage automatique : sélection d\'un modèle distinct selon la complexité de la tâche', async () => {
    // S\'assurer que le routage automatique est actif
    runtimeDatabase.setSetting('subagent_auto_routing', true);
    assert.strictEqual(subagentManager.isAutoRoutingEnabled(), true);

    const parentContext = {
      workspacePath: os.tmpdir(),
      sessionId: 'session-routing',
      permissionEngine: { requestPermission: async () => true },
      emitEvent: () => {}
    };

    // Tâche 1 : Simple (lecture/recherche ponctuelle)
    const simpleTask = 'Lister les fichiers du répertoire components et trouver le chemin de Header.tsx';
    const complexitySimple = subagentManager.estimateComplexity(simpleTask, undefined, 'explore');
    assert.strictEqual(complexitySimple, 'simple');

    const simpleResolved = subagentManager.resolveModelForRequest(
      { type: 'explore', task: simpleTask },
      parentContext
    );
    assert.strictEqual(simpleResolved.complexity, 'simple');
    assert.strictEqual(simpleResolved.routingMode, 'auto');
    assert.strictEqual(simpleResolved.model, 'mock-fast');

    // Tâche 2 : Complexe (analyse architecturale, fuite mémoire et débogage racine)
    const complexTask = 'Analyse architecturale approfondie de la fuite de mémoire et débogage de la cause racine d\'un conflit multi-fichiers';
    const complexityComplex = subagentManager.estimateComplexity(complexTask, undefined, 'debug');
    assert.strictEqual(complexityComplex, 'complex');

    const complexResolved = subagentManager.resolveModelForRequest(
      { type: 'debug', task: complexTask },
      parentContext
    );
    assert.strictEqual(complexResolved.complexity, 'complex');
    assert.strictEqual(complexResolved.routingMode, 'auto');
    assert.strictEqual(complexResolved.model, 'mock-powerful');

    // Vérifier que deux modèles différents sont choisis
    assert.notStrictEqual(simpleResolved.model, complexResolved.model, 'Les modèles doivent être différents pour des complexités différentes');

    // Exécution réelle avec résultat structuré et métadonnées de routage
    const resultSimple = await subagentManager.executeSubagent(
      { type: 'explore', task: simpleTask },
      parentContext
    );
    assert.strictEqual(resultSimple.status, 'completed');
    assert.strictEqual(resultSimple.complexityEstimated, 'simple');
    assert.strictEqual(resultSimple.routingMode, 'auto');
    assert.strictEqual(resultSimple.modelUsed, 'mock-fast');

    const resultComplex = await subagentManager.executeSubagent(
      { type: 'debug', task: complexTask },
      parentContext
    );
    assert.strictEqual(resultComplex.status, 'completed');
    assert.strictEqual(resultComplex.complexityEstimated, 'complex');
    assert.strictEqual(resultComplex.routingMode, 'auto');
    assert.strictEqual(resultComplex.modelUsed, 'mock-powerful');
  });

  test('3. Désactivation du routage automatique : repli strict sur le modèle utilisateur manuel', async () => {
    // Désactiver le routage automatique
    runtimeDatabase.setSetting('subagent_auto_routing', false);
    assert.strictEqual(subagentManager.isAutoRoutingEnabled(), false);

    const manualUserContext = {
      workspacePath: os.tmpdir(),
      sessionId: 'session-manual',
      currentModelId: 'custom-parent-model',
      currentProviderId: 'mock',
      permissionEngine: { requestPermission: async () => true },
      emitEvent: () => {}
    };

    // Tâche simple exécutée sans routage auto
    const simpleTask = 'Lister les fichiers du dossier src';
    const resolvedSimple = subagentManager.resolveModelForRequest(
      { type: 'explore', task: simpleTask },
      manualUserContext
    );
    assert.strictEqual(resolvedSimple.routingMode, 'manual');
    assert.strictEqual(resolvedSimple.model, 'custom-parent-model', 'Doit utiliser le modèle parent');
    assert.strictEqual(resolvedSimple.providerId, 'mock');

    // Tâche complexe exécutée sans routage auto
    const complexTask = 'Audit approfondi de la sécurité et détection de vulnérabilité cryptique';
    const resolvedComplex = subagentManager.resolveModelForRequest(
      { type: 'review', task: complexTask },
      manualUserContext
    );
    assert.strictEqual(resolvedComplex.routingMode, 'manual');
    assert.strictEqual(resolvedComplex.model, 'custom-parent-model', 'Doit également utiliser le modèle parent');
    assert.strictEqual(resolvedComplex.providerId, 'mock');

    // Exécution réelle vérifiant le retour structuré
    const resultManual = await subagentManager.executeSubagent(
      { type: 'review', task: complexTask },
      manualUserContext
    );
    assert.strictEqual(resultManual.status, 'completed');
    assert.strictEqual(resultManual.routingMode, 'manual');
    assert.strictEqual(resultManual.modelUsed, 'custom-parent-model');

    // Rétablissement du réglage par défaut
    runtimeDatabase.setSetting('subagent_auto_routing', true);
  });

  test('4. Invisibilité stricte des sous-agents dans le fil utilisateur', async () => {
    const emittedEvents = [];
    const parentContext = {
      workspacePath: os.tmpdir(),
      sessionId: 'session-invis',
      permissionEngine: { requestPermission: async () => true },
      emitEvent: (e) => emittedEvents.push(e)
    };

    const subContext = subagentManager.createSubagentContext('explore', parentContext);
    subContext.emitEvent({ type: 'status', message: 'Recherche de symboles...' });

    assert.strictEqual(emittedEvents.length, 1);
    assert.strictEqual(emittedEvents[0].internal, true, 'L\'événement doit avoir internal: true');
    assert.strictEqual(emittedEvents[0].subagent, 'explore', 'L\'événement doit identifier le sous-agent');
  });

  test('5. Définition et outils spécialisés des 4 rôles', () => {
    const roles = ['explore', 'debug', 'review', 'test'];
    for (const r of roles) {
      const def = SUBAGENT_DEFINITIONS[r];
      assert.ok(def, `Le rôle ${r} doit être défini`);
      assert.strictEqual(def.type, r);
      assert.ok(def.allowedTools.length > 0, `Le rôle ${r} doit posséder des outils autorisés`);
      assert.ok(def.systemInstructions.length > 20, `Le prompt système doit exister pour ${r}`);
    }

    // explore ne doit contenir aucun outil d'écriture ni de commande
    assert.strictEqual(SUBAGENT_DEFINITIONS.explore.allowedTools.includes('write_file'), false);
    assert.strictEqual(SUBAGENT_DEFINITIONS.explore.allowedTools.includes('execute_command'), false);
    // review ne doit contenir aucun outil d'écriture
    assert.strictEqual(SUBAGENT_DEFINITIONS.review.allowedTools.includes('write_file'), false);
  });
});
