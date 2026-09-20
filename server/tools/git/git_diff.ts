import { exec } from 'child_process';
import { promisify } from 'util';
import { IrokoTool, ToolContext, ToolResult } from '../types';

const execAsync = promisify(exec);

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
      const args = ['git', 'diff'];
      if (input.cached) {
        args.push('--cached');
      }
      if (input.path) {
        args.push('--', input.path);
      }

      const cmd = args.join(' ');
      const { stdout: diffOutput } = await execAsync(cmd, { cwd: context.workspacePath, maxBuffer: 10 * 1024 * 1024 });

      // Statistique récapitulative
      const statCmd = `${args.slice(0, input.cached ? 3 : 2).join(' ')} --stat ${input.path ? `-- ${input.path}` : ''}`;
      let statSummary = '';
      try {
        const { stdout: statOut } = await execAsync(statCmd, { cwd: context.workspacePath });
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

      return {
        success: true,
        data: {
          diff: cleanDiff || 'Aucune différence.',
          filesChanged: files,
          summary: statSummary
        },
        diff: cleanDiff || undefined
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Erreur git diff : ${err.message || String(err)}`
      };
    }
  }
}
