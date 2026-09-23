import { IrokoTool, ToolContext, ToolResult } from '../types';
import { runGit, validateBranchName } from './git_utils';

export interface GitBranchInput {
  action?: 'list' | 'checkout';
  branchName?: string;
}

export interface GitBranchOutput {
  currentBranch: string;
  branches: string[];
  actionResult?: string;
}

export class GitBranchTool implements IrokoTool<GitBranchInput, GitBranchOutput> {
  public readonly name = 'git_branch';
  public readonly description = 'Liste les branches Git du projet ou bascule sur une branche existante.';
  public readonly category = 'git';
  public readonly permission = 'LOW' as const;

  public readonly parameters = {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['list', 'checkout'],
        description: 'Action à réaliser : "list" pour afficher les branches, "checkout" pour basculer sur une branche existante.'
      },
      branchName: {
        type: 'string',
        description: 'Nom de la branche existante vers laquelle basculer (requis pour "checkout").'
      }
    },
    additionalProperties: false
  };

  public async execute(input: GitBranchInput, context: ToolContext): Promise<ToolResult<GitBranchOutput>> {
    const action = input.action || 'list';

    try {
      let actionResult: string | undefined;

      if (action === 'checkout') {
        if (!input.branchName) {
          return {
            success: false,
            error: 'Le paramètre "branchName" est requis pour basculer de branche.'
          };
        }

        const val = validateBranchName(input.branchName);
        if (!val.valid) {
          return {
            success: false,
            error: val.error || 'Nom de branche invalide.'
          };
        }

        await runGit(['checkout', input.branchName.trim()], context.workspacePath);
        actionResult = `Basculé avec succès sur la branche "${input.branchName.trim()}".`;
      }

      // Lister les branches et déterminer la branche courante
      const { stdout: branchListOut } = await runGit(['branch', '--no-color'], context.workspacePath);
      const lines = branchListOut.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

      let currentBranch = 'unknown';
      const branches: string[] = [];

      for (const line of lines) {
        if (line.startsWith('* ')) {
          currentBranch = line.substring(2).trim();
          branches.push(currentBranch);
        } else {
          branches.push(line.trim());
        }
      }

      return {
        success: true,
        data: {
          currentBranch,
          branches,
          actionResult
        }
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Erreur git branch : ${err.message || String(err)}`
      };
    }
  }
}
