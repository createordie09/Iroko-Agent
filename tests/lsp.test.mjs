import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import path from 'path';
import os from 'os';
import fs from 'fs';

// Assurer l'isolation des données runtime
const testDataDir = path.join(os.tmpdir(), `iroko-lsp-data-${Date.now()}`);
process.env.IROKO_DATA_DIR = testDataDir;

import { lspManager } from '../server/tools/lsp/LspManager.ts';
import { GetDiagnosticsTool } from '../server/tools/lsp/get_diagnostics.ts';
import { FindDefinitionTool } from '../server/tools/lsp/find_definition.ts';
import { FindReferencesTool } from '../server/tools/lsp/find_references.ts';
import { ToolRegistry } from '../server/tools/ToolRegistry.ts';

describe('MISSION L15a : Language Server Protocol (LSP) TypeScript', () => {
  const workspaceDir = path.join(os.tmpdir(), `iroko-lsp-ws-${Date.now()}`);
  const toolRegistry = new ToolRegistry();

  before(() => {
    fs.mkdirSync(testDataDir, { recursive: true });
    fs.mkdirSync(workspaceDir, { recursive: true });

    // Créer un tsconfig.json valide
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

    // Module A : déclaration
    fs.writeFileSync(path.join(srcDir, 'math.ts'), [
      'export function calculateTax(amount: number): number {',
      '  return amount * 0.2;',
      '}',
      '',
      'export interface TaxResult {',
      '  total: number;',
      '}'
    ].join('\n'));

    // Module B : import et utilisation valide
    fs.writeFileSync(path.join(srcDir, 'checkout.ts'), [
      "import { calculateTax } from './math';",
      '',
      'export function processOrder(subtotal: number): number {',
      '  const tax = calculateTax(subtotal);',
      '  return subtotal + tax;',
      '}'
    ].join('\n'));

    // Module C : référence supplémentaire
    fs.writeFileSync(path.join(srcDir, 'report.ts'), [
      "import { calculateTax } from './math';",
      '',
      'export function logTax(val: number): void {',
      '  console.log(calculateTax(val));',
      '}'
    ].join('\n'));

    // Module D : erreur de type volontaire
    fs.writeFileSync(path.join(srcDir, 'error.ts'), [
      'const value: number = "ceci n\'est pas un nombre";',
      'console.log(value);'
    ].join('\n'));
  });

  after(() => {
    try {
      fs.rmSync(workspaceDir, { recursive: true, force: true });
      fs.rmSync(testDataDir, { recursive: true, force: true });
    } catch {}
  });

  test('1. Enregistrement et métadonnées des outils LSP', () => {
    const diagTool = toolRegistry.getTool('get_diagnostics');
    const defTool = toolRegistry.getTool('find_definition');
    const refTool = toolRegistry.getTool('find_references');

    assert.ok(diagTool, 'get_diagnostics doit être enregistré');
    assert.ok(defTool, 'find_definition doit être enregistré');
    assert.ok(refTool, 'find_references doit être enregistré');

    assert.strictEqual(diagTool.category, 'lsp');
    assert.strictEqual(defTool.category, 'lsp');
    assert.strictEqual(refTool.category, 'lsp');

    assert.strictEqual(diagTool.permission, 'SAFE');
    assert.strictEqual(defTool.permission, 'SAFE');
    assert.strictEqual(refTool.permission, 'SAFE');

    const status = toolRegistry.getAllToolsStatus();
    const lspTools = status.filter(t => t.category === 'lsp');
    assert.strictEqual(lspTools.length, 3);
    assert.ok(lspTools.every(t => t.enabled && t.available));
  });

  test('2. get_diagnostics : détection des erreurs de type réelles avec positionnement précis', async () => {
    const tool = new GetDiagnosticsTool();
    const context = { workspacePath: workspaceDir };

    // Diagnostic global
    const resAll = await tool.execute({}, context);
    assert.strictEqual(resAll.success, true);
    assert.ok(resAll.data);
    assert.ok(resAll.data.errorCount >= 1, 'Au moins une erreur de type doit être détectée');

    const errorDiag = resAll.data.diagnostics.find(d => d.file.includes('error.ts'));
    assert.ok(errorDiag, 'L\'erreur dans error.ts doit être trouvée');
    assert.strictEqual(errorDiag.line, 1);
    assert.strictEqual(errorDiag.category, 'error');
    assert.ok(errorDiag.code > 0);
    assert.ok(errorDiag.message.includes('not assignable') || errorDiag.message.includes('Type'));

    // Diagnostic ciblé sur un fichier propre
    const resClean = await tool.execute({ path: 'src/math.ts' }, context);
    assert.strictEqual(resClean.success, true);
    assert.strictEqual(resClean.data?.errorCount, 0, 'src/math.ts ne doit avoir aucune erreur');
  });

  test('3. find_definition : résolution instantanée (< 1s) du symbole vers sa déclaration', async () => {
    const tool = new FindDefinitionTool();
    const context = { workspacePath: workspaceDir };

    // Dans checkout.ts, ligne 4, colonne 17 : "calculateTax(subtotal)"
    const start = Date.now();
    const res = await tool.execute({
      file: 'src/checkout.ts',
      line: 4,
      column: 17
    }, context);
    const elapsedMs = Date.now() - start;

    assert.strictEqual(res.success, true);
    assert.ok(res.data);
    assert.strictEqual(res.data.found, true, 'La définition doit être trouvée');
    assert.ok(elapsedMs < 1000, `Résolution en moins de 1s (actuel: ${elapsedMs}ms)`);

    assert.ok(res.data.definitions.length >= 1);
    const def = res.data.definitions[0];
    assert.ok(def.file.endsWith('math.ts'), `Doit pointer vers math.ts (obtenu: ${def.file})`);
    assert.strictEqual(def.line, 1, 'Doit pointer vers la ligne 1 de math.ts');
  });

  test('4. find_definition : gestion des cas limites (symbole introuvable ou fichier inexistant)', async () => {
    const tool = new FindDefinitionTool();
    const context = { workspacePath: workspaceDir };

    // Fichier inexistant
    const resNotFound = await tool.execute({
      file: 'src/inexistant.ts',
      line: 1,
      column: 1
    }, context);
    assert.strictEqual(resNotFound.success, true);
    assert.strictEqual(resNotFound.data?.found, false);

    // Position sur un espace vide
    const resBlank = await tool.execute({
      file: 'src/math.ts',
      line: 4,
      column: 1
    }, context);
    assert.strictEqual(resBlank.success, true);
    assert.strictEqual(resBlank.data?.found, false);
  });

  test('5. find_references : localisation de toutes les références dans le workspace', async () => {
    const tool = new FindReferencesTool();
    const context = { workspacePath: workspaceDir };

    // Dans math.ts, ligne 1, colonne 17 : "function calculateTax"
    const res = await tool.execute({
      file: 'src/math.ts',
      line: 1,
      column: 17
    }, context);

    assert.strictEqual(res.success, true);
    assert.ok(res.data);
    assert.strictEqual(res.data.found, true);
    assert.ok(res.data.total >= 3, `Au moins 3 références attendues (obtenu: ${res.data.total})`);

    const filesWithRef = res.data.references.map(r => r.file);
    assert.ok(filesWithRef.some(f => f.includes('math.ts')), 'Contient math.ts (définition)');
    assert.ok(filesWithRef.some(f => f.includes('checkout.ts')), 'Contient checkout.ts (usage 1)');
    assert.ok(filesWithRef.some(f => f.includes('report.ts')), 'Contient report.ts (usage 2)');
  });
});
