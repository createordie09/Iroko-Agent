import { IrokoTool, ToolContext, ToolResult } from '../types';
import { verificationEngine, VerificationResult } from '../../verification/VerificationEngine';

export interface VerifyProjectInput {
  checks?: Array<'typecheck' | 'lint' | 'test' | 'build'>;
}

export class VerifyProjectTool implements IrokoTool<VerifyProjectInput, VerificationResult> {
  public readonly name = 'verify_project';
  public readonly description = 'Lance la suite de vérifications du projet (Typecheck, Lint, Tests, Build) et analyse les résultats.';
  public readonly category = 'testing';
  public readonly permission = 'LOW' as const;

  public readonly parameters = {
    type: 'object',
    properties: {
      checks: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['typecheck', 'lint', 'test', 'build']
        },
        description: 'Contrôles spécifiques à exécuter (si omis, exécute tous les contrôles applicables dans l\'ordre)'
      }
    },
    additionalProperties: false
  };

  public async execute(input: VerifyProjectInput, context: ToolContext): Promise<ToolResult<VerificationResult>> {
    context.emitEvent({
      type: 'status',
      status: 'verifying',
      message: 'Exécution des vérifications du projet...'
    });

    try {
      const result = await verificationEngine.runVerification(
        context.workspacePath,
        context.emitEvent,
        { checksToRun: input.checks }
      );

      return {
        success: result.allPassed,
        data: result,
        error: result.allPassed ? undefined : `Vérification échouée : ${result.firstFailure?.checkName} (${result.firstFailure?.command}). Erreur : ${result.firstFailure?.output}`
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Erreur interne lors de la vérification : ${err.message || String(err)}`
      };
    }
  }
}
