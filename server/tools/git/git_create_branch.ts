import { IrokoTool, ToolContext, ToolResult } from '../types';
import { runGit, validateBranchName } from './git_utils';

export interface GitCreateBranchInput {
  branchName: string;
}

export interface GitCreateBranchOutput {
  branchName: string;
  message: string;
}

export class GitCreateBranchTool implements IrokoTool<GitCreateBranchInput, GitCreateBranchOutput> {
  public readonly name = 'git_create_branch';
  public readonly description = 'Crée une nouvelle branche de travail Git et bascule dessus de façon sécurisée.';
  public readonly category = 'git';
  public readonly permission = 'LOW' as const;

  public readonly parameters = {
    type: 'object',
    properties: {
      branchName: {
        type: 'string',
        description: 'Nom de la nouvelle branche à créer (ex: feature/nouvelle-fonctionnalite, fix/correction-bug).'
      }
    },
    required: ['branchName'],
    additionalProperties: false
  };

  public async execute(input: GitCreateBranchInput, context: ToolContext): Promise<ToolResult<GitCreateBranchOutput>> {
    if (!input.branchName) {
      return {
        success: false,
        error: 'Le paramètre "branchName" est requis.'
      };
    }

    const val = validateBranchName(input.branchName);
    if (!val.valid) {
      return {
        success: false,
        error: val.error || 'Nom de branche non valide.'
      };
    }

    const sanitizedBranch = input.branchName.trim();

    try {
      await runGit(['checkout', '-b', sanitizedBranch], context.workspacePath);

      return {
        success: true,
        data: {
          branchName: sanitizedBranch,
          message: `Nouvelle branche "${sanitizedBranch}" créée et activée avec succès.`
        }
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Échec de création de la branche "${sanitizedBranch}" : ${err.message || String(err)}`
      };
    }
  }
}
