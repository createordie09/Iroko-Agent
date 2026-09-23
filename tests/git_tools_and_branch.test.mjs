import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { execFileSync } from 'child_process';
import { GitStatusTool } from '../server/tools/git/git_status.ts';
import { GitDiffTool } from '../server/tools/git/git_diff.ts';
import { GitLogTool } from '../server/tools/git/git_log.ts';
import { GitAddTool } from '../server/tools/git/git_add.ts';
import { GitCommitTool } from '../server/tools/git/git_commit.ts';
import { GitBranchTool } from '../server/tools/git/git_branch.ts';
import { GitCreateBranchTool } from '../server/tools/git/git_create_branch.ts';
import { validateBranchName, validateGitArgument, truncateDiff } from '../server/tools/git/git_utils.ts';
import { CommandRiskClassifier } from '../server/permissions/CommandRiskClassifier.ts';
import { PermissionEngine } from '../server/permissions/PermissionEngine.ts';
import { PermissionStore } from '../server/permissions/PermissionStore.ts';

describe('MISSION L9 : Git et Affichage de Branche', () => {
  const tmpRepo = path.join(os.tmpdir(), `iroko-git-test-${Date.now()}`);
  const tmpDataDir = path.join(os.tmpdir(), `iroko-data-git-${Date.now()}`);

  before(() => {
    fs.mkdirSync(tmpRepo, { recursive: true });
    fs.mkdirSync(tmpDataDir, { recursive: true });

    // Initialiser un dépôt git propre pour les tests
    execFileSync('git', ['init', '-b', 'main'], { cwd: tmpRepo, windowsHide: true });
    execFileSync('git', ['config', 'user.name', 'Iroko Test'], { cwd: tmpRepo, windowsHide: true });
    execFileSync('git', ['config', 'user.email', 'test@iroko.local'], { cwd: tmpRepo, windowsHide: true });

    // Premier commit initial
    fs.writeFileSync(path.join(tmpRepo, 'README.md'), '# Iroko Git Test\n', 'utf-8');
    execFileSync('git', ['add', 'README.md'], { cwd: tmpRepo, windowsHide: true });
    execFileSync('git', ['commit', '-m', 'chore: initial commit'], { cwd: tmpRepo, windowsHide: true });
  });

  after(() => {
    try {
      fs.rmSync(tmpRepo, { recursive: true, force: true });
      fs.rmSync(tmpDataDir, { recursive: true, force: true });
    } catch {}
  });

  test('1. Détection correcte d\'un dépôt propre vs sale (git_status)', async () => {
    const statusTool = new GitStatusTool();
    const context = {
      workspacePath: tmpRepo,
      permissionEngine: {},
      emitEvent: () => {}
    };

    // État propre
    const cleanRes = await statusTool.execute({}, context);
    assert.strictEqual(cleanRes.success, true);
    assert.strictEqual(cleanRes.data?.isClean, true);
    assert.strictEqual(cleanRes.data?.branch, 'main');
    assert.strictEqual(cleanRes.data?.modified.length, 0);

    // Modifier un fichier -> état sale
    fs.writeFileSync(path.join(tmpRepo, 'README.md'), '# Iroko Git Test (modifié)\n', 'utf-8');
    const dirtyRes = await statusTool.execute({}, context);
    assert.strictEqual(dirtyRes.success, true);
    assert.strictEqual(dirtyRes.data?.isClean, false);
    assert.ok(dirtyRes.data?.modified.includes('README.md'));
  });

  test('2. Rejet des injections d\'arguments et options dangereuses', () => {
    // Options dangereuses bloquées
    assert.strictEqual(validateGitArgument('-c').valid, false);
    assert.strictEqual(validateGitArgument('-c=core.pager=evil').valid, false);
    assert.strictEqual(validateGitArgument('--upload-pack').valid, false);
    assert.strictEqual(validateGitArgument('--exec=calc.exe').valid, false);

    // Arguments sûrs autorisés
    assert.strictEqual(validateGitArgument('status').valid, true);
    assert.strictEqual(validateGitArgument('--porcelain=v1').valid, true);
    assert.strictEqual(validateGitArgument('--cached').valid, true);
  });

  test('3. Validation stricte des noms de branches', () => {
    // Branches valides
    assert.strictEqual(validateBranchName('feature/mon-travail').valid, true);
    assert.strictEqual(validateBranchName('fix/bug_123').valid, true);
    assert.strictEqual(validateBranchName('release-1.0.0').valid, true);

    // Branches invalides ou suspectes
    assert.strictEqual(validateBranchName('-b').valid, false);
    assert.strictEqual(validateBranchName('-evil').valid, false);
    assert.strictEqual(validateBranchName('/slash-initial').valid, false);
    assert.strictEqual(validateBranchName('slash-final/').valid, false);
    assert.strictEqual(validateBranchName('branche.lock').valid, false);
    assert.strictEqual(validateBranchName('branche..traverse').valid, false);
    assert.strictEqual(validateBranchName('branche avec espace').valid, false);
    assert.strictEqual(validateBranchName('').valid, false);
  });

  test('4. Création et bascule de branche sécurisée (git_create_branch & git_branch)', async () => {
    const createTool = new GitCreateBranchTool();
    const branchTool = new GitBranchTool();

    const context = {
      workspacePath: tmpRepo,
      permissionEngine: {},
      emitEvent: () => {}
    };

    // Rejet d'une branche invalide
    const badRes = await createTool.execute({ branchName: '-option-injection' }, context);
    assert.strictEqual(badRes.success, false);
    assert.ok(badRes.error?.includes('tiret'));

    // Création d'une branche valide
    const createRes = await createTool.execute({ branchName: 'feature/nouvelle-vue' }, context);
    assert.strictEqual(createRes.success, true);
    assert.strictEqual(createRes.data?.branchName, 'feature/nouvelle-vue');

    // Vérifier que la branche active a changé
    const listRes = await branchTool.execute({ action: 'list' }, context);
    assert.strictEqual(listRes.success, true);
    assert.strictEqual(listRes.data?.currentBranch, 'feature/nouvelle-vue');
    assert.ok(listRes.data?.branches.includes('main'));
    assert.ok(listRes.data?.branches.includes('feature/nouvelle-vue'));

    // Rebasculer sur main
    const checkoutRes = await branchTool.execute({ action: 'checkout', branchName: 'main' }, context);
    assert.strictEqual(checkoutRes.success, true);
    assert.strictEqual(checkoutRes.data?.currentBranch, 'main');
  });

  test('5. Indexation ciblée et sécurisée (git_add)', async () => {
    const addTool = new GitAddTool();
    const statusTool = new GitStatusTool();

    const context = {
      workspacePath: tmpRepo,
      permissionEngine: {},
      emitEvent: () => {}
    };

    // Créer un nouveau fichier
    fs.writeFileSync(path.join(tmpRepo, 'fichier_test.txt'), 'Contenu pour git add\n', 'utf-8');

    // Rejet si argument commence par un tiret
    const badAdd = await addTool.execute({ files: ['--force'] }, context);
    assert.strictEqual(badAdd.success, false);
    assert.ok(badAdd.error?.includes('tiret'));

    // Indexation du fichier valide
    const addRes = await addTool.execute({ files: ['fichier_test.txt'] }, context);
    assert.strictEqual(addRes.success, true);

    // Vérifier l'état staged
    const statusRes = await statusTool.execute({}, context);
    assert.strictEqual(statusRes.success, true);
    assert.ok(statusRes.data?.staged.some(s => s.includes('fichier_test.txt')));
  });

  test('6. Aucun commit sans approbation explicite et format Conventional Commits (git_commit)', async () => {
    const commitTool = new GitCommitTool();
    const store = new PermissionStore(tmpDataDir);
    const engine = new PermissionEngine(tmpRepo, store);

    // 6.1 Test refus de l'utilisateur
    let permissionRequested = false;
    const rejectContext = {
      workspacePath: tmpRepo,
      permissionEngine: engine,
      emitEvent: (event) => {
        if (event.type === 'permission_required') {
          permissionRequested = true;
          engine.resolvePermission(event.request.id, false, 'reject');
        }
      }
    };

    const rejectRes = await commitTool.execute({ message: 'ajout fichier_test' }, rejectContext);
    assert.strictEqual(permissionRequested, true);
    assert.strictEqual(rejectRes.success, false);
    assert.ok(rejectRes.error?.includes('non autorisé'));

    // 6.2 Test approbation de l'utilisateur
    const approveContext = {
      workspacePath: tmpRepo,
      permissionEngine: engine,
      emitEvent: (event) => {
        if (event.type === 'permission_required') {
          engine.resolvePermission(event.request.id, true, 'session');
        }
      }
    };

    const commitRes = await commitTool.execute({ message: 'feat: ajout du fichier de test' }, approveContext);
    assert.strictEqual(commitRes.success, true);
    assert.ok(commitRes.data?.commitHash);
    assert.strictEqual(commitRes.data?.message, 'feat: ajout du fichier de test');
    assert.ok(commitRes.data?.beforeStatus !== undefined);
    assert.ok(commitRes.data?.afterStatus !== undefined);
  });

  test('7. Classification stricte du risque Git dans CommandRiskClassifier', () => {
    // SAFE : inspection en lecture seule
    assert.strictEqual(CommandRiskClassifier.analyze('git status').overallRisk, 'SAFE');
    assert.strictEqual(CommandRiskClassifier.analyze('git diff').overallRisk, 'SAFE');
    assert.strictEqual(CommandRiskClassifier.analyze('git log -n 5').overallRisk, 'SAFE');
    assert.strictEqual(CommandRiskClassifier.analyze('git branch').overallRisk, 'SAFE');

    // HIGH : modification d'environnement ou opération distante
    assert.strictEqual(CommandRiskClassifier.analyze('git push').overallRisk, 'HIGH');
    assert.strictEqual(CommandRiskClassifier.analyze('git push origin main').overallRisk, 'HIGH');

    // CRITICAL : opérations destructives irréversibles
    assert.strictEqual(CommandRiskClassifier.analyze('git push --force').overallRisk, 'CRITICAL');
    assert.strictEqual(CommandRiskClassifier.analyze('git reset --hard HEAD~1').overallRisk, 'CRITICAL');
    assert.strictEqual(CommandRiskClassifier.analyze('git clean -fd').overallRisk, 'CRITICAL');
    assert.strictEqual(CommandRiskClassifier.analyze('git branch -D feature/bad').overallRisk, 'CRITICAL');
  });

  test('8. Troncature des diffs volumineux à 500 Ko', () => {
    const largeDiff = 'diff --git a/big.txt b/big.txt\n' + '+'.repeat(600 * 1024);
    const truncated = truncateDiff(largeDiff, 500 * 1024);

    assert.ok(truncated.includes('[Diff tronqué : limite de 500 Ko atteinte]'));
    assert.ok(Buffer.byteLength(truncated, 'utf-8') <= 550 * 1024);
  });
});
