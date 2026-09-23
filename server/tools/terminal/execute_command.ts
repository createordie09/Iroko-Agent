import { IrokoTool, ToolContext, ToolResult } from '../types';
import { processManager } from './ProcessManager';
import { CommandRiskClassifier } from '../../permissions/CommandRiskClassifier';
import { PathSanitizer } from '../../security/PathSanitizer';

export interface ExecuteCommandInput {
  command: string;
  cwd?: string;
  timeoutMs?: number;
}

export class ExecuteCommandTool implements IrokoTool<ExecuteCommandInput> {
  public name = 'execute_command';
  public description = 'Exécute une commande shell dans le terminal du workspace et retourne stdout, stderr et le code de retour.';
  public category = 'terminal' as const;
  public permission = 'MEDIUM' as const;

  public parameters = {
    type: 'object',
    required: ['command'],
    properties: {
      command: {
        type: 'string',
        description: 'La ligne de commande shell exacte à exécuter.'
      },
      cwd: {
        type: 'string',
        description: 'Sous-dossier relatif ou chemin dans le workspace où exécuter la commande (optionnel).'
      },
      timeoutMs: {
        type: 'number',
        description: 'Délai d\'expiration maximal en millisecondes (par défaut 60000ms).'
      }
    }
  };

  public async execute(input: ExecuteCommandInput, context: ToolContext): Promise<ToolResult> {
    const analysis = CommandRiskClassifier.analyze(input.command);
    const riskLevel = analysis.overallRisk;

    // Validation et confinement du cwd
    const targetPath = input.cwd || context.workspacePath;
    const pathValidation = PathSanitizer.validatePath(targetPath, context.workspacePath);
    if (!pathValidation.valid || !pathValidation.canonicalPath) {
      return {
        success: false,
        error: pathValidation.error || 'Répertoire d\'exécution invalide ou situé en dehors du workspace.'
      };
    }

    // Demande de permission
    const approved = await context.permissionEngine.requestPermission(
      this.name,
      riskLevel,
      `Exécuter la commande dans le terminal : "${input.command}"`,
      { 
        command: input.command, 
        risk: riskLevel,
        isCompound: analysis.isCompound,
        segments: analysis.segments,
        cwd: pathValidation.canonicalPath
      },
      (req) => context.emitEvent({ type: 'permission_required', request: req })
    );

    if (!approved) {
      return {
        success: false,
        error: `Action non autorisée : l'exécution de "${input.command}" a été refusée par l'utilisateur.`
      };
    }

    try {
      const result = await processManager.executeCommand(
        input.command,
        pathValidation.canonicalPath,
        input.timeoutMs || 60000,
        (chunk) => {
          // Streaming du terminal vers l'UI
          context.emitEvent({
            type: 'message',
            role: 'assistant',
            content: chunk,
            partial: true
          });
        },
        context.abortSignal
      );

      const isSuccess = result.exitCode === 0;

      return {
        success: isSuccess,
        data: {
          command: input.command,
          exitCode: result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr,
          durationMs: result.durationMs,
          timedOut: result.timedOut
        },
        error: !isSuccess ? `La commande s'est terminée avec le code d'erreur ${result.exitCode}.\n${result.stderr || result.stdout}` : undefined
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || `Erreur lors de l'exécution de la commande`
      };
    }
  }
}
