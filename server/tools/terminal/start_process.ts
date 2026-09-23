import { IrokoTool, ToolContext, ToolResult } from '../types';
import { processManager } from './ProcessManager';
import { PathSanitizer } from '../../security/PathSanitizer';

export interface StartProcessInput {
  command: string;
  cwd?: string;
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
      },
      cwd: {
        type: 'string',
        description: 'Sous-dossier relatif ou chemin dans le workspace où exécuter le processus (optionnel).'
      }
    }
  };

  public async execute(input: StartProcessInput, context: ToolContext): Promise<ToolResult> {
    const targetPath = input.cwd || context.workspacePath;
    const pathValidation = PathSanitizer.validatePath(targetPath, context.workspacePath);
    if (!pathValidation.valid || !pathValidation.canonicalPath) {
      return {
        success: false,
        error: pathValidation.error || 'Répertoire d\'exécution invalide ou situé en dehors du workspace.'
      };
    }

    const approved = await context.permissionEngine.requestPermission(
      this.name,
      this.permission,
      `Démarrer le processus persistant : "${input.command}"`,
      { command: input.command, cwd: pathValidation.canonicalPath },
      (req) => context.emitEvent({ type: 'permission_required', request: req })
    );

    if (!approved) {
      return { success: false, error: 'Démarrage du processus refusé par l\'utilisateur.' };
    }

    try {
      const proc = processManager.startBackgroundProcess(input.command, pathValidation.canonicalPath);
      return {
        success: true,
        data: {
          processId: proc.id,
          command: proc.command,
          status: proc.status,
          portConflict: proc.portConflict,
          portConflictMessage: proc.portConflictMessage
        }
      };
    } catch (err: any) {
      return { success: false, error: err.message || 'Erreur lors du démarrage du processus' };
    }
  }
}
