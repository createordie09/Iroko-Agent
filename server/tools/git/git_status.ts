import { IrokoTool, ToolContext, ToolResult } from '../types';
import { runGit } from './git_utils';

export interface GitStatusOutput {
  branch: string;
  isClean: boolean;
  staged: string[];
  modified: string[];
  untracked: string[];
  deleted: string[];
  raw: string;
}

export class GitStatusTool implements IrokoTool<Record<string, never>, GitStatusOutput> {
  public readonly name = 'git_status';
  public readonly description = 'Inspecte l\'état Git du workspace (branche courante, fichiers modifiés, ajoutés, supprimés, non suivis).';
  public readonly category = 'git';
  public readonly permission = 'SAFE' as const;

  public readonly parameters = {
    type: 'object',
    properties: {},
    additionalProperties: false
  };

  public async execute(_input: Record<string, never>, context: ToolContext): Promise<ToolResult<GitStatusOutput>> {
    try {
      const { stdout } = await runGit(['status', '--porcelain=v1', '-b'], context.workspacePath);
      const lines = stdout.split(/\r?\n/).filter(line => line.trim().length > 0);

      let branch = 'unknown';
      const staged: string[] = [];
      const modified: string[] = [];
      const untracked: string[] = [];
      const deleted: string[] = [];

      for (const line of lines) {
        if (line.startsWith('## ')) {
          branch = line.replace('## ', '').split('...')[0].trim();
          continue;
        }

        const indexStatus = line[0];
        const worktreeStatus = line[1];
        const filePath = line.slice(3).trim();

        if (indexStatus === '?' && worktreeStatus === '?') {
          untracked.push(filePath);
        } else {
          if (indexStatus !== ' ' && indexStatus !== '?') {
            staged.push(`${indexStatus}: ${filePath}`);
          }
          if (worktreeStatus === 'M') {
            modified.push(filePath);
          } else if (worktreeStatus === 'D') {
            deleted.push(filePath);
          }
        }
      }

      const isClean = staged.length === 0 && modified.length === 0 && untracked.length === 0 && deleted.length === 0;

      return {
        success: true,
        data: {
          branch,
          isClean,
          staged,
          modified,
          untracked,
          deleted,
          raw: stdout.trim()
        }
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Erreur git status : ${err.message || String(err)}`
      };
    }
  }
}
