import { exec } from 'child_process';
import { promisify } from 'util';
import { WorkspaceMetadata, workspaceManager } from '../workspace/WorkspaceManager';
import { VerificationCheck, AgentEvent } from '../types/events';

const execAsync = promisify(exec);

export interface VerificationResult {
  allPassed: boolean;
  checks: VerificationCheck[];
  summary: string;
  firstFailure?: {
    checkName: string;
    command: string;
    output: string;
  };
}

export interface VerificationOptions {
  checksToRun?: Array<'typecheck' | 'lint' | 'test' | 'build'>;
  timeoutMs?: number;
}

export class VerificationEngine {
  /**
   * Détermine les commandes de vérification applicables en fonction des métadonnées du workspace
   */
  public getAvailableChecks(meta: WorkspaceMetadata, requested?: Array<'typecheck' | 'lint' | 'test' | 'build'>): Array<{ name: string; type: 'typecheck' | 'lint' | 'test' | 'build'; command: string }> {
    const list: Array<{ name: string; type: 'typecheck' | 'lint' | 'test' | 'build'; command: string }> = [];
    const scripts = meta.scripts || {};

    // 1. Typecheck
    if (meta.languages.includes('TypeScript') || meta.keyFiles.includes('tsconfig.json')) {
      if (scripts['typecheck']) {
        list.push({ name: 'Typecheck TypeScript', type: 'typecheck', command: `${meta.packageManager} run typecheck` });
      } else if (scripts['lint'] && scripts['lint'].includes('tsc')) {
        list.push({ name: 'Typecheck (via lint)', type: 'typecheck', command: `${meta.packageManager} run lint` });
      } else {
        list.push({ name: 'Typecheck TypeScript', type: 'typecheck', command: 'npx tsc --noEmit' });
      }
    }

    // 2. Lint (si distinct du typecheck)
    if (scripts['lint'] && !list.some(c => c.command.includes('run lint'))) {
      list.push({ name: 'Linter', type: 'lint', command: `${meta.packageManager} run lint` });
    }

    // 3. Tests
    if (scripts['test'] && !scripts['test'].includes('no test specified')) {
      // Pour éviter les serveurs de test interactifs qui bloquent (watch mode)
      const testCmd = scripts['test'].includes('vitest')
        ? `${meta.packageManager} run test -- --run`
        : scripts['test'].includes('jest')
        ? `${meta.packageManager} run test -- --watchAll=false`
        : `${meta.packageManager} run test`;
      list.push({ name: 'Tests Unitaires', type: 'test', command: testCmd });
    }

    // 4. Build
    if (scripts['build']) {
      list.push({ name: 'Build de Production', type: 'build', command: `${meta.packageManager} run build` });
    }

    if (requested && requested.length > 0) {
      return list.filter(item => requested.includes(item.type));
    }

    return list;
  }

  /**
   * Exécute le pipeline complet de vérification
   */
  public async runVerification(
    workspacePath: string,
    emitEvent?: (event: AgentEvent) => void,
    options: VerificationOptions = {}
  ): Promise<VerificationResult> {
    const meta = await workspaceManager.analyze(workspacePath);
    const plannedChecks = this.getAvailableChecks(meta, options.checksToRun);
    const timeoutMs = options.timeoutMs || 45000; // 45s max par commande

    const checksResults: VerificationCheck[] = [];
    let firstFailure: VerificationResult['firstFailure'] | undefined;

    if (plannedChecks.length === 0) {
      return {
        allPassed: true,
        checks: [],
        summary: 'Aucun script de vérification automatisé détecté dans ce workspace.'
      };
    }

    for (const plan of plannedChecks) {
      const check: VerificationCheck = {
        name: plan.name,
        command: plan.command,
        status: 'running'
      };

      if (emitEvent) {
        emitEvent({
          type: 'verification_step',
          check: { ...check }
        });
      }

      try {
        const { stdout, stderr } = await execAsync(plan.command, {
          cwd: workspacePath,
          timeout: timeoutMs,
          maxBuffer: 5 * 1024 * 1024
        });

        check.status = 'passed';
        check.output = (stdout || stderr || 'Succès sans avertissement.').trim();
      } catch (err: any) {
        check.status = 'failed';
        const errOutput = (err.stdout || err.stderr || err.message || 'Échec de la vérification').trim();
        check.output = errOutput;

        if (!firstFailure) {
          firstFailure = {
            checkName: plan.name,
            command: plan.command,
            output: errOutput
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

      // Si une étape échoue (ex: TypeScript invalide), on arrête la chaîne pour corriger en priorité
      if (check.status === 'failed') {
        break;
      }
    }

    const allPassed = checksResults.every(c => c.status === 'passed');
    const passedCount = checksResults.filter(c => c.status === 'passed').length;
    const summary = allPassed
      ? `Toutes les vérifications ont réussi (${passedCount}/${plannedChecks.length} contrôles validés avec succès).`
      : `Échec de vérification sur "${firstFailure?.checkName}". ${passedCount} contrôle(s) validé(s).`;

    return {
      allPassed,
      checks: checksResults,
      summary,
      firstFailure
    };
  }
}

export const verificationEngine = new VerificationEngine();
