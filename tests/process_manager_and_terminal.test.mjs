import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { processManager, ProcessManager } from '../server/tools/terminal/ProcessManager.ts';
import { ExecuteCommandTool } from '../server/tools/terminal/execute_command.ts';
import { StartProcessTool } from '../server/tools/terminal/start_process.ts';
import { StopProcessTool } from '../server/tools/terminal/stop_process.ts';
import { GetProcessOutputTool } from '../server/tools/terminal/get_process_output.ts';
import { ListProcessesTool } from '../server/tools/terminal/list_processes.ts';
import { PermissionEngine } from '../server/permissions/PermissionEngine.ts';
import { PermissionStore } from '../server/permissions/PermissionStore.ts';

describe('MISSION L8 : Terminal, Environnement Assaini & Processus Multi-Plateformes', () => {
  const tmpWorkspace = path.join(os.tmpdir(), `iroko-test-l8-${Date.now()}`);
  const tmpDataDir = path.join(os.tmpdir(), `iroko-data-l8-${Date.now()}`);

  before(() => {
    fs.mkdirSync(tmpWorkspace, { recursive: true });
    fs.mkdirSync(tmpDataDir, { recursive: true });
  });

  after(() => {
    processManager.cleanup();
    try {
      fs.rmSync(tmpWorkspace, { recursive: true, force: true });
      fs.rmSync(tmpDataDir, { recursive: true, force: true });
    } catch {}
  });

  test('1. Environnement assaini : aucune clé API, jeton ou variable IROKO_* dans les sous-processus', async () => {
    // Injecter des variables sensibles dans le process parent
    process.env.OPENAI_API_KEY = 'sk-proj-secret12345678901234567890';
    process.env.ANTHROPIC_API_KEY = 'sk-ant-secret12345678901234567890';
    process.env.IROKO_TOKEN = 'secret-runtime-token-xyz';
    process.env.DB_PASSWORD = 'super_secret_password';
    process.env.MY_AUTH_CREDENTIAL = 'some_credential';

    const sanitized = ProcessManager.getSanitizedEnv();

    // Vérifier l'absence de toutes les variables sensibles
    assert.strictEqual(sanitized.OPENAI_API_KEY, undefined);
    assert.strictEqual(sanitized.ANTHROPIC_API_KEY, undefined);
    assert.strictEqual(sanitized.IROKO_TOKEN, undefined);
    assert.strictEqual(sanitized.DB_PASSWORD, undefined);
    assert.strictEqual(sanitized.MY_AUTH_CREDENTIAL, undefined);

    // Vérifier que les variables standard sont présentes
    assert.strictEqual(sanitized.CI, 'true');
    assert.strictEqual(sanitized.PAGER, 'cat');
    assert.strictEqual(sanitized.FORCE_COLOR, '0');
    assert.strictEqual(sanitized.NO_COLOR, '1');

    // Vérifier également lors d'une exécution réelle de commande
    const result = await processManager.executeCommand(
      'node -e "console.log(JSON.stringify(process.env))"',
      tmpWorkspace,
      10000
    );

    assert.strictEqual(result.exitCode, 0);
    const childEnv = JSON.parse(result.stdout);

    assert.strictEqual(childEnv.OPENAI_API_KEY, undefined);
    assert.strictEqual(childEnv.ANTHROPIC_API_KEY, undefined);
    assert.strictEqual(childEnv.IROKO_TOKEN, undefined);
    assert.strictEqual(childEnv.DB_PASSWORD, undefined);
    assert.strictEqual(childEnv.MY_AUTH_CREDENTIAL, undefined);
    assert.strictEqual(childEnv.CI, 'true');
  });

  test('2. Destruction récursive de l\'arbre de processus', async () => {
    // Créer un script parent qui lance un enfant persistant
    const parentScript = path.join(tmpWorkspace, 'parent.js');
    const childScript = path.join(tmpWorkspace, 'child.js');

    fs.writeFileSync(childScript, 'setInterval(() => {}, 1000);', 'utf-8');
    fs.writeFileSync(parentScript, `
      const cp = require('child_process');
      const child = cp.spawn(process.execPath, ['${childScript.replace(/\\/g, '/')}'], { stdio: 'ignore' });
      setInterval(() => {}, 1000);
    `, 'utf-8');

    const managed = processManager.startBackgroundProcess(`node "${parentScript}"`, tmpWorkspace);
    assert.ok(managed.child.pid);

    // Attendre un court instant pour que le sous-processus s'initialise
    await new Promise(r => setTimeout(r, 800));

    // Arrêter le processus
    const stopped = processManager.stopProcess(managed.id);
    assert.strictEqual(stopped, true);
    assert.strictEqual(managed.status, 'stopped');
  });

  test('3. Timeout de commande respecté et interruption propre', async () => {
    const start = Date.now();
    const result = await processManager.executeCommand(
      'node -e "setTimeout(() => {}, 15000);"',
      tmpWorkspace,
      800 // Timeout 800ms
    );
    const elapsed = Date.now() - start;

    assert.strictEqual(result.timedOut, true);
    assert.ok(elapsed >= 750 && elapsed < 35000, `Le délai d'exécution (${elapsed}ms) doit respecter le timeout`);
  });

  test('4. Nettoyage des séquences ANSI dans les sorties', () => {
    const rawWithAnsi = '\u001b[31mErreur\u001b[0m: \u001b[1mFichier non trouvé\u001b[0m \u001b[32m[OK]\u001b[0m';
    const cleaned = ProcessManager.stripAnsi(rawWithAnsi);
    assert.strictEqual(cleaned, 'Erreur: Fichier non trouvé [OK]');
  });

  test('5. Caviardage automatique des secrets dans les sorties', () => {
    const rawOutput = 'Erreur lors de la connexion avec la clé sk-proj-1234567890abcdef1234567890 et token=my_super_secret_token';
    const formatted = ProcessManager.formatOutput(rawOutput);
    assert.ok(!formatted.includes('sk-proj-1234567890abcdef1234567890'));
    assert.ok(formatted.includes('sk-***REDACTED***'));
    assert.ok(!formatted.includes('my_super_secret_token'));
    assert.ok(formatted.includes('token=***REDACTED***'));
  });

  test('6. Plafonnement de la taille de sortie avec mention de troncature', () => {
    const largeText = 'A'.repeat(600 * 1024); // 600 Ko
    const formatted = ProcessManager.formatOutput(largeText, 500 * 1024);

    assert.ok(formatted.includes('[Sortie tronquée : limite de 500 Ko atteinte]'));
    assert.ok(Buffer.byteLength(formatted, 'utf-8') <= 550 * 1024);
  });

  test('7. Détection de conflit de port (EADDRINUSE)', async () => {
    const conflictScript = path.join(tmpWorkspace, 'port_conflict.js');
    fs.writeFileSync(conflictScript, `
      console.error("Error: listen EADDRINUSE: address already in use :::3000");
      setTimeout(() => process.exit(1), 500);
    `, 'utf-8');

    const managed = processManager.startBackgroundProcess(`node "${conflictScript}"`, tmpWorkspace);

    // Attendre que le log soit capturé
    for (let i = 0; i < 30; i++) {
      if (managed.portConflict) break;
      await new Promise(r => setTimeout(r, 100));
    }

    assert.strictEqual(managed.portConflict, true);
    assert.ok(managed.portConflictMessage?.includes('Conflit de port'));
  });

  test('8. Gestion complète des processus d\'arrière-plan (start, list, output, stop)', async () => {
    const pingScript = path.join(tmpWorkspace, 'ping.js');
    fs.writeFileSync(pingScript, `
      console.log("DEMARRE");
      setInterval(() => console.log("PING"), 100);
    `, 'utf-8');

    const startTool = new StartProcessTool();
    const listTool = new ListProcessesTool();
    const outputTool = new GetProcessOutputTool();
    const stopTool = new StopProcessTool();

    const store = new PermissionStore(tmpDataDir);
    const engine = new PermissionEngine(tmpWorkspace, store);

    const context = {
      workspacePath: tmpWorkspace,
      permissionEngine: engine,
      emitEvent: (evt) => {
        if (evt.type === 'permission_required') {
          engine.resolvePermission(evt.request.id, true, 'session');
        }
      }
    };

    // Démarrer
    const startRes = await startTool.execute({ command: `node "${pingScript}"` }, context);
    assert.strictEqual(startRes.success, true);
    const procId = startRes.data.processId;

    // Lister
    const listRes = await listTool.execute();
    assert.strictEqual(listRes.success, true);
    assert.ok(listRes.data.processes.some(p => p.id === procId));

    // Attendre l'accumulation des logs (polling avec timeout)
    let outputRes;
    for (let i = 0; i < 25; i++) {
      await new Promise(r => setTimeout(r, 100));
      outputRes = await outputTool.execute({ processId: procId, maxLines: 50 });
      if (outputRes?.success && outputRes.data.output.includes('DEMARRE')) {
        break;
      }
    }

    assert.strictEqual(outputRes?.success, true);
    assert.ok(outputRes?.data.output.includes('DEMARRE'));

    // Arrêter
    const stopRes = await stopTool.execute({ processId: procId });
    assert.strictEqual(stopRes.success, true);
    assert.strictEqual(stopRes.data.status, 'stopped');
  });

  test('9. Commande refusée si la permission est rejetée', async () => {
    const executeTool = new ExecuteCommandTool();
    const store = new PermissionStore(tmpDataDir);
    const engine = new PermissionEngine(tmpWorkspace, store);

    let permissionRequested = false;

    const context = {
      workspacePath: tmpWorkspace,
      permissionEngine: engine,
      emitEvent: (event) => {
        if (event.type === 'permission_required') {
          permissionRequested = true;
          // Rejeter la demande
          engine.resolvePermission(event.request.id, false, 'reject');
        }
      }
    };

    // Commande classée MEDIUM pour forcer une demande de permission
    const result = await executeTool.execute({ command: 'node -e "console.log(123)"' }, context);
    assert.strictEqual(permissionRequested, true);
    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes('refusée par l\'utilisateur'));
  });
});
