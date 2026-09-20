import { exec } from 'child_process';
import { promisify } from 'util';
import { IrokoTool, ToolContext, ToolResult } from '../types';

const execAsync = promisify(exec);

export interface GitBranchInput {
  action?: 'list' | 'create' | 'checkout';
  branchName?: string;
}

export interface GitBranchOutput {
  currentBranch: string;
  branches: string[];
  actionResult?: string;
}

export class GitBranchTool implements IrokoTool<GitBranchInput, GitBranchOutput> {
  public readonly name = 'git_branch';
  public readonly description = 'Liste les branches Git du projet ou bascule / crée une nouvelle branche de travail.';
  public readonly category = 'git';
  public readonly permission = 'LOW' as const;

  public readonly parameters = {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['list', 'create', 'checkout'],
        description: 'Action à réaliser : "list" pour voir les branches, "create" pour créer une branche, "checkout" pour basculer'
      },
      branchName: {
        type: 'string',
        description: 'Nom de la branche (requis pour "create" et "checkout")'
      }
    },
    additionalProperties: false
  };

  public async execute(input: GitBranchInput, context: ToolContext): Promise<ToolResult<GitBranchOutput>> {
    const action = input.action || 'list';

    try {
      let actionResult: string | undefined;

      if (action === 'create' || action === 'checkout') {
        if (!input.branchName) {
          return {
            success: false,
            error: 'Le paramètre "branchName" est requis pour cette action.'
          };
        }

        const sanitizedBranch = input.branchName.trim().replace(/[^a-zA-Z0-9_\-/.]/g, '');

        if (action === 'create') {
          await execAsync(`git checkout -b "${sanitizedBranch}"`, { cwd: context.workspacePath });
          actionResult = `Nouvelle branche "${sanitizedBranch}" créée et activée.`;
        } else if (action === 'checkout') {
          await execAsync(`git checkout "${sanitizedBranch}"`, { cwd: context.workspacePath });
          actionResult = `Basculé sur la branche "${sanitizedBranch}".`;
        }
      }

      // Lister les branches et déterminer la branche active
      const { stdout: branchListOut } = await execAsync('git branch --no-color', { cwd: context.workspacePath });
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
