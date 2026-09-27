// server/verification/VerificationEngine.ts
// Cahier §18 : Moteur de vérification avec intégration LSP (§14) et repli transparent sur tsc

import path from 'path';
import fs from 'fs';
import { WorkspaceMetadata, workspaceManager } from '../workspace/WorkspaceManager';
import { AgentEvent } from '../types/events';
import { processManager } from '../tools/terminal/ProcessManager';
import { lspManager } from '../tools/lsp/LspManager';

export interface VerificationErrorLocation {
  file?: string;
  line?: number;
  column?: number;
  message: string;
}

export interface VerificationCheck {
  name: string;
  type: 'typecheck' | 'lint' | 'test' | 'build';
  command: string;
  status: 'running' | 'passed' | 'failed' | 'skipped';
  output?: string;
  durationMs?: number;
  reason?: string;
  errors?: VerificationErrorLocation[];
}

export interface SkippedCheck {
  type: 'typecheck' | 'lint' | 'test' | 'build';
  name: string;
  reason: string;
}

export interface VerificationResult {
  allPassed: boolean;
  checks: VerificationCheck[];
  skippedChecks: SkippedCheck[];
  summary: string;
  missingDependencies?: boolean;
  firstFailure?: {
    checkName: string;
    command: string;
    output: string;
    errors?: VerificationErrorLocation[];
  };
}

export interface VerificationOptions {
  checksToRun?: Array<'typecheck' | 'lint' | 'test' | 'build'>;
  timeoutMs?: number;
}

export interface PackageManagerAdapter {
  name: string;
  runScript(scriptName: string, extraArgs?: string[]): string;
  execBinary(binary: string, args?: string[]): string;
}

export const PACKAGE_MANAGER_ADAPTERS: Record<string, PackageManagerAdapter> = {
  npm: {
    name: 'npm',
    runScript: (s, extra) => `npm run ${s}${extra?.length ? ' ' + extra.join(' ') : ''}`,
    execBinary: (bin, args) => `npx ${bin}${args?.length ? ' ' + args.join(' ') : ''}`
  },
  pnpm: {
    name: 'pnpm',
    runScript: (s, extra) => `pnpm run ${s}${extra?.length ? ' ' + extra.join(' ') : ''}`,
    execBinary: (bin, args) => `pnpm exec ${bin}${args?.length ? ' ' + args.join(' ') : ''}`
  },
  yarn: {
    name: 'yarn',
    runScript: (s, extra) => `yarn run ${s}${extra?.length ? ' ' + extra.join(' ') : ''}`,
    execBinary: (bin, args) => `yarn exec ${bin}${args?.length ? ' ' + args.join(' ') : ''}`
  },
  bun: {
    name: 'bun',
    runScript: (s, extra) => `bun run ${s}${extra?.length ? ' ' + extra.join(' ') : ''}`,
    execBinary: (bin, args) => `bun x ${bin}${args?.length ? ' ' + args.join(' ') : ''}`
  }
};

export class VerificationEngine {
  public getAdapter(packageManager: string): PackageManagerAdapter {
    return PACKAGE_MANAGER_ADAPTERS[packageManager] || PACKAGE_MANAGER_ADAPTERS.npm;
  }

  public planChecks(
    workspacePath: string,
    meta: WorkspaceMetadata,
    requested?: Array<'typecheck' | 'lint' | 'test' | 'build'>
  ): {
    planned: Array<{ name: string; type: 'typecheck' | 'lint' | 'test' | 'build'; command: string }>;
    skipped: SkippedCheck[];
  } {
    const planned: Array<{ name: string; type: 'typecheck' | 'lint' | 'test' | 'build'; command: string }> = [];
    const skipped: SkippedCheck[] = [];
    const scripts = meta.scripts || {};
    const adapter = this.getAdapter(meta.packageManager);

    // 1. Typecheck
    if (!requested || requested.includes('typecheck')) {
      if (scripts['typecheck']) {
        planned.push({ name: 'Typecheck TypeScript', type: 'typecheck', command: adapter.runScript('typecheck') });
      } else if (scripts['check-types']) {
        planned.push({ name: 'Typecheck (check-types)', type: 'typecheck', command: adapter.runScript('check-types') });
      } else if (scripts['tsc']) {
        planned.push({ name: 'Typecheck (tsc)', type: 'typecheck', command: adapter.runScript('tsc') });
      } else if (scripts['lint'] && scripts['lint'].includes('tsc')) {
        planned.push({ name: 'Typecheck (via script lint)', type: 'typecheck', command: adapter.runScript('lint') });
      } else if (fs.existsSync(path.join(workspacePath, 'tsconfig.json'))) {
        planned.push({ name: 'Typecheck TypeScript', type: 'typecheck', command: adapter.execBinary('tsc', ['--noEmit']) });
      } else {
        skipped.push({
          type: 'typecheck',
          name: 'Typecheck TypeScript',
          reason: 'Ignoré : aucun script de typage ni tsconfig.json détecté.'
        });
      }
    }

    // 2. Lint
    if (!requested || requested.includes('lint')) {
      const isLintUsedForTsc = planned.some(p => p.command.includes('run lint'));
      if (scripts['lint'] && !isLintUsedForTsc) {
        planned.push({ name: 'Linter (ESLint)', type: 'lint', command: adapter.runScript('lint') });
      } else {
        const eslintConfigs = ['.eslintrc.js', '.eslintrc.cjs', '.eslintrc.json', '.eslintrc.yaml', '.eslintrc.yml', '.eslintrc', 'eslint.config.js', 'eslint.config.mjs', 'eslint.config.ts', 'eslint.config.cjs'];
        const hasEslint = eslintConfigs.some(cfg => fs.existsSync(path.join(workspacePath, cfg)));
        if (hasEslint && !isLintUsedForTsc) {
          planned.push({ name: 'Linter (ESLint direct)', type: 'lint', command: adapter.execBinary('eslint', ['.']) });
        } else if (!isLintUsedForTsc) {
          skipped.push({ type: 'lint', name: 'Linter', reason: 'Ignoré : aucun script "lint" ni configuration ESLint détecté.' });
        }
      }
    }

    // 3. Tests
    if (!requested || requested.includes('test')) {
      if (scripts['test'] && !scripts['test'].includes('no test specified')) {
        let testCmd = adapter.runScript('test');
        if (scripts['test'].includes('vitest')) testCmd = adapter.runScript('test', ['--', '--run']);
        else if (scripts['test'].includes('jest')) testCmd = adapter.runScript('test', ['--', '--watchAll=false']);
        planned.push({ name: 'Tests Unitaires', type: 'test', command: testCmd });
      } else {
        skipped.push({ type: 'test', name: 'Tests Unitaires', reason: 'Ignoré : aucun script "test" configuré dans package.json.' });
      }
    }

    // 4. Build
    if (!requested || requested.includes('build')) {
      if (scripts['build']) {
        planned.push({ name: 'Build de Production', type: 'build', command: adapter.runScript('build') });
      } else {
        skipped.push({ type: 'build', name: 'Build de Production', reason: 'Ignoré : aucun script "build" configuré dans package.json.' });
      }
    }

    return { planned, skipped };
  }

  public static parseErrorLocations(output: string): VerificationErrorLocation[] {
    const locations: VerificationErrorLocation[] = [];
    const lines = output.split(/\r?\n/);
    const tsParen = /^([a-zA-Z0-9._/\\]+)\((\d+),(\d+)\):\s*(?:error|warning)\s*TS\d+:\s*(.+)$/i;
    const tsColon = /^([a-zA-Z0-9._/\\]+):(\d+):(\d+)\s*-\s*(?:error|warning)\s*TS\d+:\s*(.+)$/i;
    const genRegex = /^([a-zA-Z0-9._/\\]+\.[a-zA-Z0-9]+):(\d+)(?::(\d+))?\s*(?:-\s*)?(.+)$/i;
    let currentFile = '';

    for (const rawLine of lines) {
      const trimmed = rawLine.trim();
      if (!trimmed) continue;
      if (/^[a-zA-Z0-9._/\\]+\.[a-zA-Z0-9]+$/.test(trimmed)) {
        currentFile = trimmed;
        continue;
      }
      const matchTs = trimmed.match(tsParen) || trimmed.match(tsColon);
      if (matchTs) {
        locations.push({
          file: matchTs[1].replace(/\\/g, '/'),
          line: parseInt(matchTs[2], 10),
          column: parseInt(matchTs[3], 10),
          message: matchTs[4].trim()
        });
        continue;
      }
      const matchEs = trimmed.match(/^(\d+):(\d+)\s+(?:error|warning)\s+(.+)$/i);
      if (matchEs && currentFile) {
        locations.push({
          file: currentFile.replace(/\\/g, '/'),
          line: parseInt(matchEs[1], 10),
          column: parseInt(matchEs[2], 10),
          message: matchEs[3].trim()
        });
        continue;
      }
      const matchGen = trimmed.match(genRegex);
      if (matchGen) {
        locations.push({
          file: matchGen[1].replace(/\\/g, '/'),
          line: parseInt(matchGen[2], 10),
          column: matchGen[3] ? parseInt(matchGen[3], 10) : undefined,
          message: matchGen[4].trim()
        });
      }
    }
    return locations.slice(0, 10);
  }

  public async runVerification(
    workspacePath: string,
    emitEvent?: (event: AgentEvent) => void,
    options: VerificationOptions = {}
  ): Promise<VerificationResult> {
    const meta = await workspaceManager.analyze(workspacePath);

    if (meta.keyFiles.includes('package.json') && !meta.hasNodeModules) {
      const msg = `Dépendances manquantes : le répertoire "node_modules" est absent. Une installation préalable (${meta.packageManager} install) est requise.`;
      return {
        allPassed: false,
        missingDependencies: true,
        checks: [],
        skippedChecks: [],
        summary: msg,
        firstFailure: { checkName: 'Dépendances', command: `${meta.packageManager} install`, output: msg }
      };
    }

    const { planned, skipped } = this.planChecks(workspacePath, meta, options.checksToRun);
    const timeoutMs = options.timeoutMs || 60000;
    const checksResults: VerificationCheck[] = [];
    let firstFailure: VerificationResult['firstFailure'] | undefined;

    if (planned.length === 0) {
      return {
        allPassed: true,
        checks: [],
        skippedChecks: skipped,
        summary: 'Aucun contrôle de vérification applicable dans ce workspace.'
      };
    }

    for (const plan of planned) {
      const check: VerificationCheck = {
        name: plan.name,
        type: plan.type,
        command: plan.command,
        status: 'running'
      };

      if (emitEvent) emitEvent({ type: 'verification_step', check: { ...check } });

      // Compléter le contrôle typecheck existant par le LSP avec repli transparent sur tsc (Cahier §14)
      let handledByLsp = false;
      if (plan.type === 'typecheck' && lspManager.isAvailable(workspacePath).available) {
        try {
          const lspStart = Date.now();
          const diags = await lspManager.getDiagnostics(workspacePath);
          const errors = diags.filter(d => d.category === 'error');
          if (errors.length === 0) {
            check.status = 'passed';
            check.durationMs = Date.now() - lspStart;
            check.output = `Diagnostics LSP réussis : 0 erreur détectée (${diags.length} diagnostic(s) total).`;
            checksResults.push(check);
            if (emitEvent) emitEvent({ type: 'verification_step', check: { ...check } });
            handledByLsp = true;
            continue;
          } else {
            check.status = 'failed';
            check.durationMs = Date.now() - lspStart;
            const errLocations: VerificationErrorLocation[] = errors.map(e => ({
              file: e.file,
              line: e.line,
              column: e.column,
              message: `${e.message} [TS${e.code}]`
            }));
            const formatted = errors.slice(0, 10).map(e => `${e.file}:${e.line}:${e.column} - error TS${e.code}: ${e.message}`).join('\n');
            check.output = formatted;
            check.errors = errLocations;
            if (!firstFailure) {
              firstFailure = { checkName: plan.name, command: 'lsp:get_diagnostics', output: formatted, errors: errLocations };
            }
            checksResults.push(check);
            if (emitEvent) emitEvent({ type: 'verification_step', check: { ...check } });
            handledByLsp = true;
            break;
          }
        } catch {
          // Repli transparent sur la commande CLI tsc
        }
      }

      const startTime = Date.now();
      const executionResult = await processManager.executeCommand(plan.command, workspacePath, timeoutMs);
      check.durationMs = Date.now() - startTime;

      if (executionResult.exitCode === 0 && !executionResult.timedOut) {
        check.status = 'passed';
        check.output = executionResult.stdout || executionResult.stderr || 'Succès sans avertissement.';
      } else {
        check.status = 'failed';
        const rawError = executionResult.stderr || executionResult.stdout || 'Échec de la commande de vérification.';
        const cappedError = rawError.length > 50 * 1024
          ? `${rawError.slice(0, 50 * 1024)}\n\n[Sortie d'erreur tronquée : limite de 50 Ko atteinte]`
          : rawError;

        check.output = cappedError;
        const parsedErrors = VerificationEngine.parseErrorLocations(cappedError);
        check.errors = parsedErrors;

        if (!firstFailure) {
          firstFailure = {
            checkName: plan.name,
            command: plan.command,
            output: cappedError,
            errors: parsedErrors
          };
        }
      }

      checksResults.push(check);
      if (emitEvent) emitEvent({ type: 'verification_step', check: { ...check } });

      if (check.status === 'failed') break;
    }

    const allPassed = checksResults.length > 0 && checksResults.every(c => c.status === 'passed');
    const passedCount = checksResults.filter(c => c.status === 'passed').length;

    let summary = '';
    if (allPassed) {
      summary = `Toutes les vérifications requises ont réussi (${passedCount}/${planned.length} contrôles validés).`;
      if (skipped.length > 0) {
        summary += ` Contrôles ignorés : ${skipped.map(s => `${s.name} (${s.reason})`).join(' ; ')}.`;
      }
    } else {
      summary = `Échec de vérification sur "${firstFailure?.checkName}" (${firstFailure?.command}). ${passedCount}/${planned.length} contrôle(s) validé(s).`;
      if (firstFailure?.errors && firstFailure.errors.length > 0) {
        const errLoc = firstFailure.errors[0];
        summary += ` Erreur détectée dans ${errLoc.file || 'fichier'}${errLoc.line ? `:${errLoc.line}` : ''} : ${errLoc.message}`;
      }
    }

    return { allPassed, checks: checksResults, skippedChecks: skipped, summary, firstFailure };
  }
}

export const verificationEngine = new VerificationEngine();
