import { IrokoTool, ToolContext, ToolResult } from '../types';
import { runGit } from './git_utils';
import { PathSanitizer } from '../../security/PathSanitizer';

export interface GitAddInput {
  files?: string[];
}

export interface GitAddOutput {
  stagedFiles: string[];
  message: string;
}

export class GitAddTool implements IrokoTool<GitAddInput, GitAddOutput> {
  public readonly name = 'git_add';
  public readonly description = 'Indexe des fichiers spécifiques ou toutes les modifications dans l\'index de travail Git.';
  public readonly category = 'git';
  public readonly permission = 'LOW' as const;

  public readonly parameters = {
    type: 'object',
    properties: {
      files: {
        type: 'array',
        items: { type: 'string' },
        description: 'Liste des chemins relatifs des fichiers à indexer (si omis, indexe toutes les modifications du workspace).'
      }
    },
    additionalProperties: false
  };

  public async execute(input: GitAddInput, context: ToolContext): Promise<ToolResult<GitAddOutput>> {
    try {
      if (input.files && input.files.length > 0) {
        const validatedFiles: string[] = [];

        for (const file of input.files) {
          const raw = (file || '').trim();
          if (!raw) continue;

          if (raw.startsWith('-')) {
            return {
              success: false,
              error: `Nom de fichier invalide : un chemin ne peut pas commencer par un tiret ("${raw}").`
            };
          }

          const pathVal = PathSanitizer.validatePath(raw, context.workspacePath);
          if (!pathVal.valid || !pathVal.canonicalPath) {
            return {
              success: false,
              error: pathVal.error || `Chemin cible invalide ou situé en dehors du workspace : "${raw}".`
            };
          }
          validatedFiles.push(raw);
        }

        if (validatedFiles.length === 0) {
          return {
            success: false,
            error: 'Aucun fichier valide fourni à indexer.'
          };
        }

        await runGit(['add', '--', ...validatedFiles], context.workspacePath);

        return {
          success: true,
          data: {
            stagedFiles: validatedFiles,
            message: `${validatedFiles.length} fichier(s) indexé(s) avec succès.`
          }
        };
      } else {
        await runGit(['add', '-A'], context.workspacePath);

        return {
          success: true,
          data: {
            stagedFiles: ['Toutes les modifications'],
            message: 'Toutes les modifications ont été indexées avec succès.'
          }
        };
      }
    } catch (err: any) {
      return {
        success: false,
        error: `Erreur git add : ${err.message || String(err)}`
      };
    }
  }
}
