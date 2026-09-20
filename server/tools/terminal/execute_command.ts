import { IrokoTool, ToolContext, ToolResult } from '../types';
import { processManager } from './ProcessManager';
import { PermissionLevel } from '../../types/events';

export interface ExecuteCommandInput {
  command: string;
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
      timeoutMs: {
        type: 'number',
        description: 'Délai d\'expiration maximal en millisecondes (par défaut 60000ms).'
      }
    }
  };

  /**
   * Analyse le risque intrinsèque de la commande pour ajuster le niveau de permission
   */
  private assessRisk(command: string): PermissionLevel {
    const cmd = command.toLowerCase().trim();

    // Commandes critiques destructives
    if (
      cmd.includes('rm -rf') ||
      cmd.includes('rmdir /s') ||
      cmd.includes('format ') ||
      cmd.includes('git reset --hard') ||
      cmd.includes('git clean -fd') ||
      cmd.includes('drop database') ||
      cmd.includes('mkfs')
    ) {
      return 'CRITICAL';
    }

    // Commandes impactantes sur l'environnement externe
    if (
      cmd.includes('git push') ||
      cmd.includes('npm publish') ||
      cmd.includes('npm uninstall')
    ) {
      return 'HIGH';
    }

    // Commandes en lecture seule / inspection
    if (
      cmd.startsWith('git status') ||
      cmd.startsWith('git diff') ||
      cmd.startsWith('git log') ||
      cmd.startsWith('node -v') ||
      cmd.startsWith('npm -v') ||
      cmd.startsWith('dir') ||
      cmd.startsWith('ls ') ||
      cmd === 'ls'
    ) {
      return 'SAFE';
    }

    // Par défaut : modification ou exécution standard
    return 'MEDIUM';
  }

  public async execute(input: ExecuteCommandInput, context: ToolContext): Promise<ToolResult> {
    const riskLevel = this.assessRisk(input.command);

    // Demande de permission
    const approved = await context.permissionEngine.requestPermission(
      this.name,
      riskLevel,
      `Exécuter la commande dans le terminal : "${input.command}"`,
      { command: input.command, risk: riskLevel },
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
        context.workspacePath,
        input.timeoutMs || 60000,
        (chunk) => {
          // Streaming du terminal vers l'UI
          context.emitEvent({
            type: 'message',
            role: 'assistant',
            content: chunk,
            partial: true
          });
        }
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
