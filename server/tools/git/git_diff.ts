import { IrokoTool, ToolContext, ToolResult } from '../types';
import { runGit, truncateDiff } from './git_utils';
import { PathSanitizer } from '../../security/PathSanitizer';

export interface GitDiffInput {
  path?: string;
  cached?: boolean;
}

export interface GitDiffOutput {
  diff: string;
  filesChanged: string[];
  summary: string;
}

export class GitDiffTool implements IrokoTool<GitDiffInput, GitDiffOutput> {
  public readonly name = 'git_diff';
  public readonly description = 'Affiche le diff Git unifié des modifications en cours (complet, pour un fichier spécifique, ou staged).';
  public readonly category = 'git';
  public readonly permission = 'SAFE' as const;

  public readonly parameters = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Chemin relatif du fichier ou répertoire à inspecter (optionnel, tout le workspace par défaut)'
      },
      cached: {
        type: 'boolean',
        description: 'Si true, inspecte le diff des modifications indexées (--cached)'
      }
    },
    additionalProperties: false
  };

  public async execute(input: GitDiffInput, context: ToolContext): Promise<ToolResult<GitDiffOutput>> {
    try {
      const args = ['diff'];
      if (input.cached) {
        args.push('--cached');
      }

      let relativeTarget: string | undefined;
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
        relativeTarget = raw;
        args.push('--', relativeTarget);
      }

      const { stdout: diffOutput } = await runGit(args, context.workspacePath, {
        maxBuffer: 15 * 1024 * 1024
      });

      // Statistiques résumées
      const statArgs = ['diff', '--stat'];
      if (input.cached) {
        statArgs.push('--cached');
      }
      if (relativeTarget) {
        statArgs.push('--', relativeTarget);
      }

      let statSummary = '';
      try {
        const { stdout: statOut } = await runGit(statArgs, context.workspacePath);
        statSummary = statOut.trim();
      } catch {}

      // Extraire les fichiers modifiés depuis les en-têtes diff
      const files: string[] = [];
      const diffHeaders = diffOutput.match(/^diff --git a\/(.+) b\/(.+)$/gm) || [];
      for (const h of diffHeaders) {
        const m = h.match(/^diff --git a\/(.+) b\/(.+)$/);
        if (m && m[2]) {
          files.push(m[2]);
        }
      }

      const cleanDiff = diffOutput.trim();
      const truncated = truncateDiff(cleanDiff || 'Aucune différence.');

      return {
        success: true,
        data: {
          diff: truncated,
          filesChanged: files,
          summary: statSummary
        },
        diff: truncated
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Erreur git diff : ${err.message || String(err)}`
      };
    }
  }
}
