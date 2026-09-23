import { IrokoTool, ToolContext, ToolResult } from '../types';
import { runGit } from './git_utils';
import { PathSanitizer } from '../../security/PathSanitizer';

export interface GitLogInput {
  limit?: number;
  path?: string;
}

export interface GitCommitInfo {
  hash: string;
  author: string;
  date: string;
  message: string;
}

export interface GitLogOutput {
  total: number;
  commits: GitCommitInfo[];
}

export class GitLogTool implements IrokoTool<GitLogInput, GitLogOutput> {
  public readonly name = 'git_log';
  public readonly description = 'Affiche l\'historique récent des commits Git du projet (hash, auteur, date, message).';
  public readonly category = 'git';
  public readonly permission = 'SAFE' as const;

  public readonly parameters = {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'Nombre de commits à retourner (défaut : 10, max : 50)'
      },
      path: {
        type: 'string',
        description: 'Chemin relatif d\'un fichier spécifique pour filtrer l\'historique'
      }
    },
    additionalProperties: false
  };

  public async execute(input: GitLogInput, context: ToolContext): Promise<ToolResult<GitLogOutput>> {
    try {
      const limit = Math.min(Math.max(input.limit || 10, 1), 50);
      const delimiter = '---IROKO_COMMIT---';
      const format = `%h%x09%an%x09%ad%x09%s${delimiter}`;

      const args = ['log', '-n', String(limit), '--date=short', `--format=${format}`];

      if (input.path) {
        const raw = input.path.trim();
        if (raw.startsWith('-')) {
          return {
            success: false,
            error: `Chemin invalide : un chemin ne peut pas commencer par un tiret ("${raw}").`
          };
        }
        const pathVal = PathSanitizer.validatePath(raw, context.workspacePath);
        if (!pathVal.valid || !pathVal.canonicalPath) {
          return {
            success: false,
            error: pathVal.error || 'Chemin cible invalide ou situé en dehors du workspace.'
          };
        }
        args.push('--', raw);
      }

      const { stdout } = await runGit(args, context.workspacePath);

      const rawCommits = stdout.split(delimiter).map(c => c.trim()).filter(Boolean);
      const commits: GitCommitInfo[] = [];

      for (const entry of rawCommits) {
        const parts = entry.split('\t');
        if (parts.length >= 4) {
          commits.push({
            hash: parts[0],
            author: parts[1],
            date: parts[2],
            message: parts.slice(3).join(' ')
          });
        }
      }

      return {
        success: true,
        data: {
          total: commits.length,
          commits
        }
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Erreur git log : ${err.message || String(err)}`
      };
    }
  }
}
