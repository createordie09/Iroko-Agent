import path from 'path';
import fs from 'fs';
import { WorkspaceMetadata, workspaceManager } from '../workspace/WorkspaceManager';
import { AgentEvent } from '../types/events';
import { processManager } from '../tools/terminal/ProcessManager';

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

/**
 * Interface d'adaptateur pour les gestionnaires de paquets (extensible pour d'autres écosystèmes).
 */
export interface PackageManagerAdapter {
  name: string;
  runScript(scriptName: string, extraArgs?: string[]): string;
  execBinary(binary: string, args?: string[]): string;
}

export const PACKAGE_MANAGER_ADAPTERS: Record<string, PackageManagerAdapter> = {
  npm: {
    name: 'npm',
    runScript: (script, extra) => `npm run ${script}${extra?.length ? ' ' + extra.join(' ') : ''}`,
    execBinary: (bin, args) => `npx ${bin}${args?.length ? ' ' + args.join(' ') : ''}`
  },
  pnpm: {
    name: 'pnpm',
    runScript: (script, extra) => `pnpm run ${script}${extra?.length ? ' ' + extra.join(' ') : ''}`,
    execBinary: (bin, args) => `pnpm exec ${bin}${args?.length ? ' ' + args.join(' ') : ''}`
  },
  yarn: {
    name: 'yarn',
    runScript: (script, extra) => `yarn run ${script}${extra?.length ? ' ' + extra.join(' ') : ''}`,
    execBinary: (bin, args) => `yarn exec ${bin}${args?.length ? ' ' + args.join(' ') : ''}`
  },
  bun: {
    name: 'bun',
    runScript: (script, extra) => `bun run ${script}${extra?.length ? ' ' + extra.join(' ') : ''}`,
    execBinary: (bin, args) => `bun x ${bin}${args?.length ? ' ' + args.join(' ') : ''}`
  }
};

export class VerificationEngine {
  /**
   * Obtient l'adaptateur pour le gestionnaire de paquets détecté (repli sur npm).
   */
  public getAdapter(packageManager: string): PackageManagerAdapter {
    return PACKAGE_MANAGER_ADAPTERS[packageManager] || PACKAGE_MANAGER_ADAPTERS.npm;
  }

  /**
   * Détermine les commandes applicables et les contrôles ignorés avec raison explicite.
   */
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
          reason: 'Ignoré : aucun script de typage (typecheck, check-types, tsc) ni tsconfig.json détecté.'
        });
      }
    }

    // 2. Lint
    if (!requested || requested.includes('lint')) {
      const isLintAlreadyUsedForTsc = planned.some(p => p.command.includes('run lint'));
      if (scripts['lint'] && !isLintAlreadyUsedForTsc) {
        planned.push({ name: 'Linter (ESLint)', type: 'lint', command: adapter.runScript('lint') });
      } else {
        const eslintConfigs = [
          '.eslintrc.js', '.eslintrc.cjs', '.eslintrc.json', '.eslintrc.yaml', '.eslintrc.yml',
          '.eslintrc', 'eslint.config.js', 'eslint.config.mjs', 'eslint.config.ts', 'eslint.config.cjs'
        ];
        const hasEslintConfig = eslintConfigs.some(cfg => fs.existsSync(path.join(workspacePath, cfg)));

        if (hasEslintConfig && !isLintAlreadyUsedForTsc) {
          planned.push({ name: 'Linter (ESLint direct)', type: 'lint', command: adapter.execBinary('eslint', ['.']) });
        } else if (!isLintAlreadyUsedForTsc) {
          skipped.push({
            type: 'lint',
            name: 'Linter',
            reason: 'Ignoré : aucun script "lint" ni fichier de configuration ESLint détecté.'
          });
        }
      }
    }

    // 3. Tests
    if (!requested || requested.includes('test')) {
      if (scripts['test'] && !scripts['test'].includes('no test specified')) {
        let testCmd = adapter.runScript('test');
        if (scripts['test'].includes('vitest')) {
          testCmd = adapter.runScript('test', ['--', '--run']);
        } else if (scripts['test'].includes('jest')) {
          testCmd = adapter.runScript('test', ['--', '--watchAll=false']);
        }
        planned.push({ name: 'Tests Unitaires', type: 'test', command: testCmd });
      } else {
        skipped.push({
          type: 'test',
          name: 'Tests Unitaires',
          reason: 'Ignoré : aucun script "test" configuré dans package.json.'
        });
      }
    }

    // 4. Build
    if (!requested || requested.includes('build')) {
      if (scripts['build']) {
        planned.push({ name: 'Build de Production', type: 'build', command: adapter.runScript('build') });
      } else {
        skipped.push({
          type: 'build',
          name: 'Build de Production',
          reason: 'Ignoré : aucun script "build" configuré dans package.json.'
        });
      }
    }

    return { planned, skipped };
  }

  /**
   * Analyse et extrait les erreurs structurées (fichier:ligne:colonne) depuis la sortie.
   */
  public static parseErrorLocations(output: string): VerificationErrorLocation[] {
    const locations: VerificationErrorLocation[] = [];
    const lines = output.split(/\r?\n/);

    // Motifs courants :
    // TypeScript : src/App.tsx(12,5): error TS2322: ...
    // TypeScript : src/App.tsx:12:5 - error TS2322: ...
    // ESLint :   12:5  error  Unexpected any  @typescript-eslint/no-explicit-any
    // Général : src/file.ts:12:5 ou src/file.ts:12
    const tsParenRegex = /^([a-zA-Z0-9._/\\]+)\((\d+),(\d+)\):\s*(?:error|warning)\s*TS\d+:\s*(.+)$/i;
    const tsColonRegex = /^([a-zA-Z0-9._/\\]+):(\d+):(\d+)\s*-\s*(?:error|warning)\s*TS\d+:\s*(.+)$/i;
    const generalRegex = /^([a-zA-Z0-9._/\\]+\.[a-zA-Z0-9]+):(\d+)(?::(\d+))?\s*(?:-\s*)?(.+)$/i;

    let currentFile = '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Détection de nom de fichier seul (ex: ESLint groupe par fichier)
      if (/^[a-zA-Z0-9._/\\]+\.[a-zA-Z0-9]+$/.test(trimmed)) {
        currentFile = trimmed;
        continue;
      }

      // Format TypeScript avec parenthèses
      const parenMatch = trimmed.match(tsParenRegex);
      if (parenMatch) {
        locations.push({
          file: parenMatch[1].replace(/\\/g, '/'),
          line: parseInt(parenMatch[2], 10),
          column: parseInt(parenMatch[3], 10),
          message: parenMatch[4].trim()
        });
        continue;
      }

      // Format TypeScript avec deux-points
      const colonMatch = trimmed.match(tsColonRegex);
      if (colonMatch) {
        locations.push({
          file: colonMatch[1].replace(/\\/g, '/'),
          line: parseInt(colonMatch[2], 10),
          column: parseInt(colonMatch[3], 10),
          message: colonMatch[4].trim()
        });
        continue;
      }

      // Format ESLint sous un fichier courant : "  12:5  error  ..."
      const eslintMatch = trimmed.match(/^(\d+):(\d+)\s+(?:error|warning)\s+(.+)$/i);
      if (eslintMatch && currentFile) {
        locations.push({
          file: currentFile.replace(/\\/g, '/'),
          line: parseInt(eslintMatch[1], 10),
          column: parseInt(eslintMatch[2], 10),
          message: eslintMatch[3].trim()
        });
        continue;
      }

      // Format général file:line:col
      const genMatch = trimmed.match(generalRegex);
      if (genMatch) {
        locations.push({
          file: genMatch[1].replace(/\\/g, '/'),
          line: parseInt(genMatch[2], 10),
          column: genMatch[3] ? parseInt(genMatch[3], 10) : undefined,
          message: genMatch[4].trim()
        });
      }
    }

    return locations.slice(0, 10); // Limiter aux 10 premières erreurs
  }

  /**
   * Exécute le pipeline de vérification complet et structuré.
   */
  public async runVerification(
    workspacePath: string,
    emitEvent?: (event: AgentEvent) => void,
    options: VerificationOptions = {}
  ): Promise<VerificationResult> {
    const meta = await workspaceManager.analyze(workspacePath);

    // Vérification de la présence de node_modules (si package.json existe)
    if (meta.keyFiles.includes('package.json') && !meta.hasNodeModules) {
      const msg = `Dépendances manquantes : le répertoire "node_modules" est absent. Une installation préalable (${meta.packageManager} install) est requise.`;
      return {
        allPassed: false,
        missingDependencies: true,
        checks: [],
        skippedChecks: [],
        summary: msg,
        firstFailure: {
          checkName: 'Dépendances',
          command: `${meta.packageManager} install`,
          output: msg
        }
      };
    }

    const { planned, skipped } = this.planChecks(workspacePath, meta, options.checksToRun);
    const timeoutMs = options.timeoutMs || 60000; // 60s max par étape

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

      if (emitEvent) {
        emitEvent({
          type: 'verification_step',
          check: { ...check }
        });
      }

      const startTime = Date.now();

      // Exécution sécurisée via ProcessManager (environnement assaini L8, destruction récursive, timeout)
      const executionResult = await processManager.executeCommand(
        plan.command,
        workspacePath,
        timeoutMs
      );

      const durationMs = Date.now() - startTime;
      check.durationMs = durationMs;

      if (executionResult.exitCode === 0 && !executionResult.timedOut) {
        check.status = 'passed';
        check.output = executionResult.stdout || executionResult.stderr || 'Succès sans avertissement.';
      } else {
        check.status = 'failed';
        const rawError = executionResult.stderr || executionResult.stdout || 'Échec de la commande de vérification.';
        // Plafonner la sortie d'erreur à 50 Ko
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

      if (emitEvent) {
        emitEvent({
          type: 'verification_step',
          check: { ...check }
        });
      }

      // En cas d'échec, interrompre la chaîne immédiatement pour remonter l'erreur (§18)
      if (check.status === 'failed') {
        break;
      }
    }

    const allPassed = checksResults.length > 0 && checksResults.every(c => c.status === 'passed');
    const passedCount = checksResults.filter(c => c.status === 'passed').length;

    let summary = '';
    if (allPassed) {
      summary = `Toutes les vérifications requises ont réussi (${passedCount}/${planned.length} contrôles validés).`;
      if (skipped.length > 0) {
        const skippedReasons = skipped.map(s => `${s.name} (${s.reason})`).join(' ; ');
        summary += ` Contrôles ignorés : ${skippedReasons}.`;
      }
    } else {
      summary = `Échec de vérification sur "${firstFailure?.checkName}" (${firstFailure?.command}). ${passedCount}/${planned.length} contrôle(s) validé(s).`;
      if (firstFailure?.errors && firstFailure.errors.length > 0) {
        const errLoc = firstFailure.errors[0];
        summary += ` Erreur détectée dans ${errLoc.file || 'fichier'}${errLoc.line ? `:${errLoc.line}` : ''} : ${errLoc.message}`;
      }
    }

    return {
      allPassed,
      checks: checksResults,
      skippedChecks: skipped,
      summary,
      firstFailure
    };
  }
}

export const verificationEngine = new VerificationEngine();
