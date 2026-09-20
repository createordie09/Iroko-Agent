import { IrokoTool, ToolContext, ToolResult } from '../types';
import { processManager } from './ProcessManager';

export interface StartProcessInput {
  command: string;
}

export class StartProcessTool implements IrokoTool<StartProcessInput> {
  public name = 'start_process';
  public description = 'Démarre un processus persistant en arrière-plan (par exemple un serveur de développement ou un watcher).';
  public category = 'terminal' as const;
  public permission = 'MEDIUM' as const;

  public parameters = {
    type: 'object',
    required: ['command'],
    properties: {
      command: {
        type: 'string',
        description: 'La commande longue à démarrer en arrière-plan.'
      }
    }
  };

  public async execute(input: StartProcessInput, context: ToolContext): Promise<ToolResult> {
    const approved = await context.permissionEngine.requestPermission(
      this.name,
      this.permission,
      `Démarrer le processus persistant : "${input.command}"`,
      { command: input.command },
      (req) => context.emitEvent({ type: 'permission_required', request: req })
    );

    if (!approved) {
      return { success: false, error: 'Démarrage du processus refusé par l\'utilisateur.' };
    }

    try {
      const proc = processManager.startBackgroundProcess(input.command, context.workspacePath);
      return {
        success: true,
        data: {
          processId: proc.id,
          command: proc.command,
          status: proc.status
        }
      };
    } catch (err: any) {
      return { success: false, error: err.message || 'Erreur lors du démarrage du processus' };
    }
  }
}
