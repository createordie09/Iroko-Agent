import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import path from 'path';
import os from 'os';
import fs from 'fs';

// Isolation stricte des données runtime
const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'iroko-subagents-data-'));
process.env.IROKO_DATA_DIR = testDataDir;

import { subagentManager } from '../server/subagents/SubagentManager.ts';
import { SUBAGENT_DEFINITIONS } from '../server/subagents/types.ts';
import { InvokeSubagentTool } from '../server/tools/subagents/invoke_subagent.ts';
import { ToolRegistry } from '../server/tools/ToolRegistry.ts';

describe('MISSION L15c : Sous-Agents Spécialisés Internes (§11)', () => {
  const toolRegistry = new ToolRegistry();

  after(() => {
    try {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    } catch {}
  });

  test('1. Définitions et spécifications des 4 sous-agents (explore, debug, review, test)', () => {
    const types = ['explore', 'debug', 'review', 'test'];
    for (const t of types) {
      const def = SUBAGENT_DEFINITIONS[t];
      assert.ok(def, `Définition pour ${t} doit exister`);
      assert.strictEqual(def.type, t);
      assert.ok(def.description.length > 0);
      assert.ok(Array.isArray(def.allowedTools) && def.allowedTools.length > 0);
      assert.ok(def.systemInstructions.length > 0);
    }

    // explore, debug, review doivent être plafonnés à SAFE (lecture seule stricte)
    assert.strictEqual(SUBAGENT_DEFINITIONS.explore.maxAllowedPermission, 'SAFE');
    assert.strictEqual(SUBAGENT_DEFINITIONS.debug.maxAllowedPermission, 'SAFE');
    assert.strictEqual(SUBAGENT_DEFINITIONS.review.maxAllowedPermission, 'SAFE');
    // test peut exécuter des commandes de test (MEDIUM)
    assert.strictEqual(SUBAGENT_DEFINITIONS.test.maxAllowedPermission, 'MEDIUM');
  });

  test('2. Enregistrement de l\'outil invoke_subagent dans ToolRegistry', () => {
    const tool = toolRegistry.getTool('invoke_subagent');
    assert.ok(tool, 'invoke_subagent doit être enregistré');
    assert.strictEqual(tool.category, 'subagent');
    assert.strictEqual(tool.permission, 'SAFE');

    const status = toolRegistry.getToolStatus('invoke_subagent');
    assert.ok(status);
    assert.strictEqual(status.enabled, true);
    assert.strictEqual(status.available, true);
  });

  test('3. Routage des modèles : profils rapide, puissant et local', () => {
    // 3.1 Profil rapide (fast)
    const fastChoice = subagentManager.selectModelForProfile('fast');
    assert.ok(fastChoice.model, 'Un modèle rapide doit être sélectionné');
    assert.ok(fastChoice.providerId, 'Un fournisseur rapide doit être sélectionné');

    // 3.2 Profil puissant (powerful)
    const powerfulChoice = subagentManager.selectModelForProfile('powerful');
    assert.ok(powerfulChoice.model, 'Un modèle puissant doit être sélectionné');
    assert.ok(powerfulChoice.providerId, 'Un fournisseur puissant doit être sélectionné');

    // 3.3 Profil local (local)
    const localChoice = subagentManager.selectModelForProfile('local');
    assert.ok(localChoice.model, 'Un modèle local doit être sélectionné');
    assert.ok(localChoice.providerId, 'Un fournisseur local doit être sélectionné');
  });

  test('4. Confinement strict des permissions : le sous-agent ne peut dépasser son parent', async () => {
    const emittedEvents = [];
    let permissionRequestedFor = null;

    const mockParentContext = {
      workspacePath: os.tmpdir(),
      sessionId: 'test-session',
      permissionEngine: {
        requestPermission: async (tool, level) => {
          permissionRequestedFor = { tool, level };
          return true;
        }
      },
      emitEvent: (evt) => emittedEvents.push(evt)
    };

    // 4.1 Un sous-agent "explore" tente d'accéder à un outil non autorisé (ex: execute_command ou write_file)
    // Le proxy interne doit bloquer la requête sans même solliciter l'utilisateur
    const subContext = subagentManager['createSubagentContext']('explore', mockParentContext);

    const writeAllowed = await subContext.permissionEngine.requestPermission('write_file', 'MEDIUM', 'Écriture');
    assert.strictEqual(writeAllowed, false, 'explore ne peut pas demander write_file');

    const execAllowed = await subContext.permissionEngine.requestPermission('execute_command', 'HIGH', 'Commande');
    assert.strictEqual(execAllowed, false, 'explore ne peut pas demander execute_command');

    // 4.2 Outil autorisé SAFE pour explore
    const readAllowed = await subContext.permissionEngine.requestPermission('read_file', 'SAFE', 'Lecture');
    assert.strictEqual(readAllowed, true, 'explore peut utiliser read_file');
    assert.strictEqual(permissionRequestedFor?.tool, 'read_file');
  });

  test('5. Exécution invisible et résultat structuré renvoyé au parent', async () => {
    const emittedEvents = [];
    const mockContext = {
      workspacePath: os.tmpdir(),
      sessionId: 'session-subagents',
      permissionEngine: {
        requestPermission: async () => true
      },
      emitEvent: (evt) => emittedEvents.push(evt)
    };

    const tool = new InvokeSubagentTool();

    // 5.1 Invoquer sous-agent "explore"
    const exploreRes = await tool.execute({
      type: 'explore',
      task: 'Explorer les fichiers du module de paiement et identifier les dépendances',
      context: { focusDir: 'src/payments' }
    }, mockContext);

    assert.strictEqual(exploreRes.success, true);
    assert.ok(exploreRes.data);
    assert.strictEqual(exploreRes.data.subagentType, 'explore');
    assert.strictEqual(exploreRes.data.status, 'completed');
    assert.ok(typeof exploreRes.data.summary === 'string' && exploreRes.data.summary.length > 0);
    assert.ok(Array.isArray(exploreRes.data.findings));
    assert.ok(exploreRes.data.durationMs >= 0);

    // 5.2 Invoquer sous-agent "debug"
    const debugRes = await tool.execute({
      type: 'debug',
      task: 'Analyser la cause de l\'erreur Cannot read property id of undefined dans UserList.tsx',
      context: { file: 'UserList.tsx', line: 42 }
    }, mockContext);

    assert.strictEqual(debugRes.success, true);
    assert.ok(debugRes.data);
    assert.strictEqual(debugRes.data.subagentType, 'debug');
    assert.strictEqual(debugRes.data.status, 'completed');

    // 5.3 Invoquer sous-agent "review"
    const reviewRes = await tool.execute({
      type: 'review',
      task: 'Vérifier la conformité du code avec les règles architecturales et l\'absence de secrets'
    }, mockContext);

    assert.strictEqual(reviewRes.success, true);
    assert.strictEqual(reviewRes.data?.subagentType, 'review');

    // 5.4 Invoquer sous-agent "test"
    const testRes = await tool.execute({
      type: 'test',
      task: 'Lancer les tests unitaires du module de sécurité'
    }, mockContext);

    assert.strictEqual(testRes.success, true);
    assert.strictEqual(testRes.data?.subagentType, 'test');

    // 5.5 Vérifier le caractère invisible des événements émis
    // Tous les événements émis doivent porter le marqueur { internal: true }
    for (const evt of emittedEvents) {
      assert.strictEqual(evt.internal, true, 'L\'événement de sous-agent doit être invisible pour le chat utilisateur');
    }
  });

  test('6. Gestion des cas d\'erreur (type invalide ou tâche vide)', async () => {
    const tool = new InvokeSubagentTool();
    const mockContext = {
      workspacePath: os.tmpdir(),
      sessionId: 'session-subagents',
      permissionEngine: { requestPermission: async () => true },
      emitEvent: () => {}
    };

    // Type invalide
    const resBadType = await tool.execute({
      type: 'inconnu',
      task: 'Faire quelque chose'
    }, mockContext);
    assert.strictEqual(resBadType.success, false);
    assert.ok(resBadType.error?.includes('invalide'));

    // Tâche vide
    const resEmptyTask = await tool.execute({
      type: 'explore',
      task: ''
    }, mockContext);
    assert.strictEqual(resEmptyTask.success, false);
    assert.ok(resEmptyTask.error?.includes('obligatoires'));
  });
});
