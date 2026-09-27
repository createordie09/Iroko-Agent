// tests/mission_r6a_lsp.test.mjs
// Suite de tests normatifs pour la Mission R6a : Serveur de langage TypeScript (Cahier §14)

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import path from 'path';
import os from 'os';
import fs from 'fs';

// Assurer l'isolation des données runtime
const testDataDir = path.join(os.tmpdir(), `iroko-r6a-data-${Date.now()}`);
process.env.IROKO_DATA_DIR = testDataDir;

import { lspManager } from '../server/tools/lsp/LspManager.ts';
import { GetDiagnosticsTool } from '../server/tools/lsp/get_diagnostics.ts';
import { FindDefinitionTool } from '../server/tools/lsp/find_definition.ts';
import { FindReferencesTool } from '../server/tools/lsp/find_references.ts';
import { GetDocumentSymbolsTool } from '../server/tools/lsp/get_document_symbols.ts';
import { verificationEngine } from '../server/verification/VerificationEngine.ts';
import { ToolRegistry } from '../server/tools/ToolRegistry.ts';

describe('MISSION R6a : Serveur de langage pour le mode Code (Cahier §14)', () => {
  const workspaceDir = path.join(os.tmpdir(), `iroko-r6a-ws-${Date.now()}`);
  const emptyWsDir = path.join(os.tmpdir(), `iroko-r6a-empty-ws-${Date.now()}`);
  const toolRegistry = new ToolRegistry();

  before(() => {
    fs.mkdirSync(testDataDir, { recursive: true });
    fs.mkdirSync(workspaceDir, { recursive: true });
    fs.mkdirSync(emptyWsDir, { recursive: true });

    // Configuration tsconfig.json valide
    fs.writeFileSync(path.join(workspaceDir, 'tsconfig.json'), JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'CommonJS',
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true
      },
      include: ['src/**/*']
    }, null, 2));

    const srcDir = path.join(workspaceDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });

    // Fichier 1 : Déclaration
    fs.writeFileSync(path.join(srcDir, 'math.ts'), [
      'export function calculateTax(amount: number): number {',
      '  return amount * 0.2;',
      '}',
      '',
      'export interface TaxResult {',
      '  total: number;',
      '}'
    ].join('\n'));

    // Fichier 2 : Utilisation
    fs.writeFileSync(path.join(srcDir, 'checkout.ts'), [
      "import { calculateTax } from './math';",
      '',
      'export function processOrder(subtotal: number): number {',
      '  const tax = calculateTax(subtotal);',
      '  return subtotal + tax;',
      '}'
    ].join('\n'));

    // Fichier 3 : Erreur de type injectée
    fs.writeFileSync(path.join(srcDir, 'error.ts'), [
      'const invalidNumber: number = "ceci est une chaîne de caractères";',
      'console.log(invalidNumber);'
    ].join('\n'));
  });

  after(() => {
    try {
      lspManager.stop();
      fs.rmSync(workspaceDir, { recursive: true, force: true });
      fs.rmSync(emptyWsDir, { recursive: true, force: true });
      fs.rmSync(testDataDir, { recursive: true, force: true });
    } catch {}
  });

  test('1. Définition résolue en moins d\'une seconde à chaud', async () => {
    const tool = new FindDefinitionTool();
    const context = { workspacePath: workspaceDir };

    // Premier appel à froid pour démarrer le processus à la demande
    const coldStart = await tool.execute({
      file: 'src/checkout.ts',
      line: 4,
      column: 17
    }, context);
    assert.strictEqual(coldStart.success, true);
    assert.strictEqual(coldStart.data?.found, true);

    // Mesure de la résolution à chaud (< 1 seconde)
    const t0 = Date.now();
    const warmResult = await tool.execute({
      file: 'src/checkout.ts',
      line: 4,
      column: 17
    }, context);
    const elapsedMs = Date.now() - t0;

    assert.strictEqual(warmResult.success, true);
    assert.ok(warmResult.data);
    assert.strictEqual(warmResult.data.found, true);
    assert.ok(elapsedMs < 1000, `Résolution à chaud attendue en < 1s (obtenu: ${elapsedMs}ms)`);
    assert.ok(warmResult.data.definitions.length > 0);
    const def = warmResult.data.definitions[0];
    assert.ok(def.file.endsWith('math.ts'));
    assert.strictEqual(def.line, 1);
  });

  test('2. Diagnostic précis sur une erreur de type injectée (fichier:ligne:colonne)', async () => {
    const tool = new GetDiagnosticsTool();
    const context = { workspacePath: workspaceDir };

    const res = await tool.execute({}, context);
    assert.strictEqual(res.success, true);
    assert.ok(res.data);
    assert.ok(res.data.errorCount >= 1, 'Au moins une erreur doit être détectée');

    const err = res.data.diagnostics.find(d => d.file.includes('error.ts'));
    assert.ok(err, 'L\'erreur dans error.ts doit figurer dans les diagnostics');
    assert.strictEqual(err.line, 1, 'Ligne de l\'erreur incorrecte');
    assert.strictEqual(err.category, 'error');
    assert.ok(err.code > 0, 'Code TS attendu');
    assert.ok(err.message.includes('not assignable') || err.message.includes('Type'));
  });

  test('3. Arrêt propre du processus (arbre de processus vérifié)', async () => {
    const pid = lspManager.getActivePid(workspaceDir);
    assert.ok(pid && pid > 0, 'Le processus serveur de langage doit avoir un PID actif');

    // Vérifier que le processus existe
    let isAliveBefore = false;
    try {
      isAliveBefore = process.kill(pid, 0);
    } catch {
      isAliveBefore = false;
    }
    assert.ok(isAliveBefore, 'Le processus enfant doit être vivant avant l\'arrêt');

    // Arrêt propre du processus enfant
    lspManager.stop(workspaceDir);

    // Attendre la destruction complète de l'arbre
    await new Promise(r => setTimeout(r, 200));

    let isAliveAfter = true;
    try {
      process.kill(pid, 0);
    } catch {
      isAliveAfter = false;
    }
    assert.strictEqual(isAliveAfter, false, 'Le processus enfant et son arbre doivent être détruits');
  });

  test('4. Confinement strict : chemin hors workspace refusé par tous les outils LSP', async () => {
    const context = { workspacePath: workspaceDir };

    const diagTool = new GetDiagnosticsTool();
    const defTool = new FindDefinitionTool();
    const refTool = new FindReferencesTool();
    const symTool = new GetDocumentSymbolsTool();

    // 1. get_diagnostics avec traversée
    const rDiag = await diagTool.execute({ path: '../../outside.ts' }, context);
    assert.strictEqual(rDiag.success, false);
    assert.ok(rDiag.error?.includes('Accès refusé') || rDiag.error?.includes('workspace'));

    // 2. find_definition avec chemin hors workspace
    const rDef = await defTool.execute({ file: '../outside.ts', line: 1, column: 1 }, context);
    assert.strictEqual(rDef.success, false);
    assert.ok(rDef.error?.includes('Accès refusé') || rDef.error?.includes('workspace'));

    // 3. find_references avec chemin absolu interdit
    const rRef = await refTool.execute({ file: 'C:\\Windows\\System32\\drivers.ts', line: 1, column: 1 }, context);
    assert.strictEqual(rRef.success, false);
    assert.ok(rRef.error?.includes('Accès refusé') || rRef.error?.includes('workspace'));

    // 4. get_document_symbols avec traversée
    const rSym = await symTool.execute({ file: '../../passwords.ts' }, context);
    assert.strictEqual(rSym.success, false);
    assert.ok(rSym.error?.includes('Accès refusé') || rSym.error?.includes('workspace'));
  });

  test('5. Repli transparent sur tsc si LSP absent ou non configuré', async () => {
    // Vérifier l'état d'absence dans un dossier sans tsconfig
    const avail = lspManager.isAvailable(emptyWsDir);
    assert.strictEqual(avail.available, false);
    assert.ok(avail.reasonDisabled?.includes('tsconfig.json') || avail.reasonDisabled?.includes('indisponible'));

    // Vérifier que le pipeline VerificationEngine gère l'absence de LSP sans échec bloquant
    const plan = verificationEngine.planChecks(emptyWsDir, {
      path: emptyWsDir,
      os: { platform: process.platform, arch: process.arch },
      packageManager: 'npm',
      hasNodeModules: true,
      languages: [],
      frameworks: [],
      scripts: {},
      git: { isRepo: false },
      keyFiles: []
    });

    assert.ok(plan.skipped.some(s => s.type === 'typecheck'), 'Le contrôle typecheck doit être ignoré avec raison sans tsconfig');

    // Vérifier dans le workspace actif que VerificationEngine exécute le diagnostic LSP
    const vResult = await verificationEngine.runVerification(workspaceDir, undefined, { checksToRun: ['typecheck'] });
    assert.strictEqual(vResult.allPassed, false, 'Doit échouer sur l\'erreur de type injectée');
    assert.ok(vResult.firstFailure?.errors && vResult.firstFailure.errors.length > 0);
    assert.ok(vResult.firstFailure.errors[0].file?.includes('error.ts'));
  });

  test('6. get_document_symbols : extraction des symboles structurés et plafonnés', async () => {
    const symTool = new GetDocumentSymbolsTool();
    const context = { workspacePath: workspaceDir };

    const res = await symTool.execute({ file: 'src/math.ts' }, context);
    assert.strictEqual(res.success, true);
    assert.ok(res.data);
    assert.ok(res.data.total >= 2, 'Au moins calculateTax et TaxResult attendus');

    const fnSym = res.data.symbols.find(s => s.name === 'calculateTax');
    assert.ok(fnSym, 'Le symbole fonction calculateTax doit être extrait');
    assert.strictEqual(fnSym.line, 1);
    assert.ok(fnSym.column > 0);

    const ifaceSym = res.data.symbols.find(s => s.name === 'TaxResult');
    assert.ok(ifaceSym, 'Le symbole interface TaxResult doit être extrait');
    assert.strictEqual(ifaceSym.line, 5);
  });
});
