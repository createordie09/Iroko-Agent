import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { verificationEngine, PACKAGE_MANAGER_ADAPTERS } from '../server/verification/VerificationEngine.ts';
import { workspaceManager } from '../server/workspace/WorkspaceManager.ts';
import { VerifyProjectTool } from '../server/tools/testing/verify_project.ts';

describe('MISSION L10 : Vérification et boucle de correction dynamique', () => {
  const baseTmp = path.join(os.tmpdir(), `iroko-l10-test-${Date.now()}`);

  before(() => {
    fs.mkdirSync(baseTmp, { recursive: true });
  });

  after(() => {
    try {
      fs.rmSync(baseTmp, { recursive: true, force: true });
    } catch {}
  });

  test('1. Détection sur les 4 types de gestionnaires (npm, pnpm, yarn, bun) et lockfiles', async () => {
    // 1.1 Détection via packageManager field
    const dirNpmField = path.join(baseTmp, 'dir-npm-field');
    fs.mkdirSync(dirNpmField, { recursive: true });
    fs.writeFileSync(path.join(dirNpmField, 'package.json'), JSON.stringify({ packageManager: 'npm@10.0.0' }));
    assert.strictEqual((await workspaceManager.analyze(dirNpmField)).packageManager, 'npm');

    const dirPnpmField = path.join(baseTmp, 'dir-pnpm-field');
    fs.mkdirSync(dirPnpmField, { recursive: true });
    fs.writeFileSync(path.join(dirPnpmField, 'package.json'), JSON.stringify({ packageManager: 'pnpm@8.0.0' }));
    assert.strictEqual((await workspaceManager.analyze(dirPnpmField)).packageManager, 'pnpm');

    const dirYarnField = path.join(baseTmp, 'dir-yarn-field');
    fs.mkdirSync(dirYarnField, { recursive: true });
    fs.writeFileSync(path.join(dirYarnField, 'package.json'), JSON.stringify({ packageManager: 'yarn@3.0.0' }));
    assert.strictEqual((await workspaceManager.analyze(dirYarnField)).packageManager, 'yarn');

    const dirBunField = path.join(baseTmp, 'dir-bun-field');
    fs.mkdirSync(dirBunField, { recursive: true });
    fs.writeFileSync(path.join(dirBunField, 'package.json'), JSON.stringify({ packageManager: 'bun@1.0.0' }));
    assert.strictEqual((await workspaceManager.analyze(dirBunField)).packageManager, 'bun');

    // 1.2 Détection via lockfiles
    const dirPnpmLock = path.join(baseTmp, 'dir-pnpm-lock');
    fs.mkdirSync(dirPnpmLock, { recursive: true });
    fs.writeFileSync(path.join(dirPnpmLock, 'package.json'), '{}');
    fs.writeFileSync(path.join(dirPnpmLock, 'pnpm-lock.yaml'), '');
    assert.strictEqual((await workspaceManager.analyze(dirPnpmLock)).packageManager, 'pnpm');

    const dirYarnLock = path.join(baseTmp, 'dir-yarn-lock');
    fs.mkdirSync(dirYarnLock, { recursive: true });
    fs.writeFileSync(path.join(dirYarnLock, 'package.json'), '{}');
    fs.writeFileSync(path.join(dirYarnLock, 'yarn.lock'), '');
    assert.strictEqual((await workspaceManager.analyze(dirYarnLock)).packageManager, 'yarn');

    const dirBunLock = path.join(baseTmp, 'dir-bun-lock');
    fs.mkdirSync(dirBunLock, { recursive: true });
    fs.writeFileSync(path.join(dirBunLock, 'package.json'), '{}');
    fs.writeFileSync(path.join(dirBunLock, 'bun.lockb'), '');
    assert.strictEqual((await workspaceManager.analyze(dirBunLock)).packageManager, 'bun');

    // 1.3 Adaptateurs de commandes
    assert.strictEqual(verificationEngine.getAdapter('pnpm').runScript('test'), 'pnpm run test');
    assert.strictEqual(verificationEngine.getAdapter('pnpm').execBinary('tsc', ['--noEmit']), 'pnpm exec tsc --noEmit');
    assert.strictEqual(verificationEngine.getAdapter('bun').runScript('build'), 'bun run build');
    assert.strictEqual(verificationEngine.getAdapter('bun').execBinary('tsc', ['--noEmit']), 'bun x tsc --noEmit');
  });

  test('2. Planification stricte des scripts réels vs fallbacks & ordre des contrôles', async () => {
    const dirWithScripts = path.join(baseTmp, 'dir-scripts');
    fs.mkdirSync(dirWithScripts, { recursive: true });
    fs.writeFileSync(path.join(dirWithScripts, 'package.json'), JSON.stringify({
      scripts: {
        lint: 'eslint .',
        test: 'vitest run',
        typecheck: 'tsc --noEmit',
        build: 'vite build'
      }
    }));

    const meta = await workspaceManager.analyze(dirWithScripts);
    const plan = verificationEngine.planChecks(dirWithScripts, meta);

    // Ordre strict : typecheck -> lint -> test -> build
    assert.strictEqual(plan.planned.length, 4);
    assert.strictEqual(plan.planned[0].type, 'typecheck');
    assert.strictEqual(plan.planned[1].type, 'lint');
    assert.strictEqual(plan.planned[2].type, 'test');
    assert.strictEqual(plan.planned[3].type, 'build');
    assert.strictEqual(plan.skipped.length, 0);

    // Fallbacks si tsconfig.json et .eslintrc existent sans scripts dans package.json
    const dirFallback = path.join(baseTmp, 'dir-fallback');
    fs.mkdirSync(dirFallback, { recursive: true });
    fs.writeFileSync(path.join(dirFallback, 'package.json'), '{}');
    fs.writeFileSync(path.join(dirFallback, 'tsconfig.json'), '{}');
    fs.writeFileSync(path.join(dirFallback, '.eslintrc.json'), '{}');

    const metaFallback = await workspaceManager.analyze(dirFallback);
    const planFallback = verificationEngine.planChecks(dirFallback, metaFallback);

    assert.strictEqual(planFallback.planned.length, 2);
    assert.strictEqual(planFallback.planned[0].type, 'typecheck');
    assert.ok(planFallback.planned[0].command.includes('tsc --noEmit'));
    assert.strictEqual(planFallback.planned[1].type, 'lint');
    assert.ok(planFallback.planned[1].command.includes('eslint .'));
  });

  test('3. Contrôles ignorés consignés avec justification explicite (skippedChecks)', async () => {
    const dirEmpty = path.join(baseTmp, 'dir-empty-checks');
    fs.mkdirSync(dirEmpty, { recursive: true });
    fs.writeFileSync(path.join(dirEmpty, 'package.json'), '{}');

    const meta = await workspaceManager.analyze(dirEmpty);
    const plan = verificationEngine.planChecks(dirEmpty, meta);

    assert.strictEqual(plan.planned.length, 0);
    assert.strictEqual(plan.skipped.length, 4);

    const skippedTypes = plan.skipped.map(s => s.type);
    assert.ok(skippedTypes.includes('typecheck'));
    assert.ok(skippedTypes.includes('lint'));
    assert.ok(skippedTypes.includes('test'));
    assert.ok(skippedTypes.includes('build'));

    for (const skipped of plan.skipped) {
      assert.ok(skipped.reason && skipped.reason.length > 0, `Raison présente pour ${skipped.type}`);
    }
  });

  test('4. Absence de node_modules : détection missingDependencies et refus d\'installation sauvage', async () => {
    const dirNoModules = path.join(baseTmp, 'dir-no-modules');
    fs.mkdirSync(dirNoModules, { recursive: true });
    fs.writeFileSync(path.join(dirNoModules, 'package.json'), JSON.stringify({
      dependencies: { 'foo': '1.0.0' },
      scripts: { test: 'echo ok' }
    }));

    // S'assurer qu'aucun node_modules n'existe
    const meta = await workspaceManager.analyze(dirNoModules);
    assert.strictEqual(meta.hasNodeModules, false);

    const emittedEvents = [];
    const result = await verificationEngine.runVerification(dirNoModules, (event) => {
      emittedEvents.push(event);
    });

    // Règle d'or : allPassed = false, missingDependencies = true
    assert.strictEqual(result.allPassed, false);
    assert.strictEqual(result.missingDependencies, true);
    assert.ok(result.summary.includes('node_modules'));

    // Vérifier l'outil verify_project
    const tool = new VerifyProjectTool();
    const toolResult = await tool.execute({}, {
      workspacePath: dirNoModules,
      permissionEngine: {},
      emitEvent: () => {}
    });

    assert.strictEqual(toolResult.success, false);
    assert.ok(toolResult.error?.includes('Dépendances manquantes'));
  });

  test('5. Erreur de typage ou d\'exécution : capture fichier:ligne:colonne et allPassed=false (Règle d\'or)', async () => {
    const dirError = path.join(baseTmp, 'dir-error');
    fs.mkdirSync(dirError, { recursive: true });
    fs.mkdirSync(path.join(dirError, 'node_modules'), { recursive: true }); // Simuler node_modules présent

    // Script typecheck simulant une erreur TypeScript typique
    const errorScript = 'node -e "console.error(\'src/index.ts:15:23 - error TS2322: Type string is not assignable to type number.\'); process.exit(1);"';
    fs.writeFileSync(path.join(dirError, 'package.json'), JSON.stringify({
      scripts: {
        typecheck: errorScript
      }
    }));

    const result = await verificationEngine.runVerification(dirError, () => {});

    // Règle d'or : aucun succès annoncé
    assert.strictEqual(result.allPassed, false);
    assert.ok(result.firstFailure);
    assert.strictEqual(result.firstFailure.checkName, 'Typecheck TypeScript');
    assert.ok(result.firstFailure.output.includes('TS2322'));

    // Extraction précise fichier:ligne:colonne
    assert.ok(result.firstFailure.errors && result.firstFailure.errors.length > 0);
    const firstErr = result.firstFailure.errors[0];
    assert.strictEqual(firstErr.file, 'src/index.ts');
    assert.strictEqual(firstErr.line, 15);
    assert.strictEqual(firstErr.column, 23);
    assert.ok(firstErr.message.includes('not assignable'));
  });

  test('6. Pipeline réussi avec contrôles applicables et ignorés explicites (Règle d\'or §18)', async () => {
    const dirSuccess = path.join(baseTmp, 'dir-success');
    fs.mkdirSync(dirSuccess, { recursive: true });
    fs.mkdirSync(path.join(dirSuccess, 'node_modules'), { recursive: true });

    // Seuls typecheck et test sont configurés (lint et build seront skipped)
    fs.writeFileSync(path.join(dirSuccess, 'package.json'), JSON.stringify({
      scripts: {
        typecheck: 'node -e "console.log(\'Types OK\'); process.exit(0);"',
        test: 'node -e "console.log(\'Tests OK\'); process.exit(0);"'
      }
    }));

    const result = await verificationEngine.runVerification(dirSuccess, () => {});

    assert.strictEqual(result.allPassed, true);
    assert.strictEqual(result.checks.length, 2);
    assert.strictEqual(result.checks[0].status, 'passed');
    assert.strictEqual(result.checks[1].status, 'passed');
    assert.strictEqual(result.skippedChecks.length, 2);

    const skippedTypes = result.skippedChecks.map(s => s.type);
    assert.ok(skippedTypes.includes('lint'));
    assert.ok(skippedTypes.includes('build'));

    // Le résumé mentionne les succès ET les contrôles ignorés avec raison
    assert.ok(result.summary.includes('Toutes les vérifications requises ont réussi'));
    assert.ok(result.summary.includes('Contrôles ignorés'));
  });
});
