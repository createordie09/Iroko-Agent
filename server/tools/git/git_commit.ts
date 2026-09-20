import { exec } from 'child_process';
import { promisify } from 'util';
import { IrokoTool, ToolContext, ToolResult } from '../types';

const execAsync = promisify(exec);

export interface GitCommitInput {
  message: string;
  files?: string[];
}

export interface GitCommitOutput {
  commitHash: string;
  message: string;
  filesCommitted: string[];
  output: string;
}

export class GitCommitTool implements IrokoTool<GitCommitInput, GitCommitOutput> {
  public readonly name = 'git_commit';
  public readonly description = 'Indexe les modifications et crée un commit Git sécurisé avec un message descriptif.';
  public readonly category = 'git';
  public readonly permission = 'MEDIUM' as const;

  public readonly parameters = {
    type: 'object',
    properties: {
      message: {
        type: 'string',
        description: 'Message de commit clair décrivant les modifications apportées'
      },
      files: {
        type: 'array',
        items: { type: 'string' },
        description: 'Liste des chemins relatifs des fichiers à indexer (si omis, indexe toutes les modifications du workspace)'
      }
    },
    required: ['message'],
    additionalProperties: false
  };

  public async execute(input: GitCommitInput, context: ToolContext): Promise<ToolResult<GitCommitOutput>> {
    const message = (input.message || '').trim();
    if (!message) {
      return {
        success: false,
        error: 'Le message de commit ne peut pas être vide.'
      };
    }

    try {
      // 1. Demande d'autorisation via le PermissionEngine pour niveau MEDIUM
      const approved = await context.permissionEngine.requestPermission(
        this.name,
        this.permission,
        `Création d'un commit Git : "${message}"`,
        {
          message,
          files: input.files || 'Tous les fichiers modifiés'
        },
        (req) => context.emitEvent({ type: 'permission_required', request: req })
      );

      if (!approved) {
        return {
          success: false,
          error: 'Action refusée par l\'utilisateur : commit Git non autorisé.'
        };
      }

      // 2. Indexation des fichiers
      if (input.files && input.files.length > 0) {
        for (const file of input.files) {
          await execAsync(`git add "${file}"`, { cwd: context.workspacePath });
        }
      } else {
        await execAsync('git add -A', { cwd: context.workspacePath });
      }

      // 3. Vérifier s'il y a quelque chose à commiter
      const { stdout: statusOut } = await execAsync('git status --porcelain', { cwd: context.workspacePath });
      if (!statusOut.trim()) {
        return {
          success: false,
          error: 'Aucune modification à commiter dans le workspace.'
        };
      }

      // 4. Exécution du commit
      // Échapper les guillemets dans le message
      const sanitizedMessage = message.replace(/"/g, '\\"');
      const { stdout: commitOut } = await execAsync(`git commit -m "${sanitizedMessage}"`, { cwd: context.workspacePath });

      // Récupérer le hash du nouveau commit
      const { stdout: hashOut } = await execAsync('git rev-parse --short HEAD', { cwd: context.workspacePath });
      const commitHash = hashOut.trim();

      return {
        success: true,
        data: {
          commitHash,
          message,
          filesCommitted: input.files || ['Toutes modifications'],
          output: commitOut.trim()
        }
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Échec du commit Git : ${err.message || String(err)}`
      };
    }
  }
}
