import { IrokoTool, ToolContext, ToolResult } from '../types';
import { runGit } from './git_utils';
import { PathSanitizer } from '../../security/PathSanitizer';

export interface GitCommitInput {
  message: string;
  files?: string[];
}

export interface GitCommitOutput {
  commitHash: string;
  message: string;
  filesCommitted: string[];
  beforeStatus: string;
  afterStatus: string;
  output: string;
}

export class GitCommitTool implements IrokoTool<GitCommitInput, GitCommitOutput> {
  public readonly name = 'git_commit';
  public readonly description = 'Indexe les modifications et crée un commit Git sécurisé après approbation explicite de l\'utilisateur.';
  public readonly category = 'git';
  public readonly permission = 'MEDIUM' as const;

  public readonly parameters = {
    type: 'object',
    properties: {
      message: {
        type: 'string',
        description: 'Message de commit descriptif au format Conventional Commits en français (ex: feat: ..., fix: ..., docs: ...).'
      },
      files: {
        type: 'array',
        items: { type: 'string' },
        description: 'Liste des chemins relatifs des fichiers à indexer et commiter (si omis, indexe toutes les modifications du workspace).'
      }
    },
    required: ['message'],
    additionalProperties: false
  };

  /**
   * Valide ou normalise un message de commit selon le standard Conventional Commits en français.
   */
  public static formatCommitMessage(rawMessage: string): string {
    const trimmed = rawMessage.trim();
    const conventionalPrefixes = [
      'feat:', 'fix:', 'docs:', 'style:', 'refactor:', 'perf:', 'test:', 'build:', 'ci:', 'chore:', 'revert:'
    ];

    const hasPrefix = conventionalPrefixes.some(p => trimmed.toLowerCase().startsWith(p));
    if (hasPrefix) {
      return trimmed;
    }

    // Si aucun préfixe conventionnel n'est fourni, préfixer par "chore:" par défaut
    return `chore: ${trimmed}`;
  }

  public async execute(input: GitCommitInput, context: ToolContext): Promise<ToolResult<GitCommitOutput>> {
    const rawMessage = (input.message || '').trim();
    if (!rawMessage) {
      return {
        success: false,
        error: 'Le message de commit ne peut pas être vide.'
      };
    }

    const message = GitCommitTool.formatCommitMessage(rawMessage);

    try {
      // 1. Capture de l'état Git avant le commit
      const { stdout: beforeStatusOut } = await runGit(['status', '--porcelain=v1', '-b'], context.workspacePath);
      const beforeStatus = beforeStatusOut.trim();

      // 2. Validation des fichiers spécifiés
      const validatedFiles: string[] = [];
      if (input.files && input.files.length > 0) {
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
              error: pathVal.error || `Chemin cible invalide ou hors workspace : "${raw}".`
            };
          }
          validatedFiles.push(raw);
        }
      }

      // 3. Demande d'approbation explicite obligatoire (niveau MEDIUM car un commit peut déclencher des hooks)
      const approved = await context.permissionEngine.requestPermission(
        this.name,
        this.permission,
        `Création d'un commit Git : "${message}"`,
        {
          message,
          files: validatedFiles.length > 0 ? validatedFiles : 'Toutes les modifications',
          beforeStatus
        },
        (req) => context.emitEvent({ type: 'permission_required', request: req })
      );

      if (!approved) {
        return {
          success: false,
          error: 'Action refusée par l\'utilisateur : commit Git non autorisé.'
        };
      }

      // 4. Indexation préalable
      if (validatedFiles.length > 0) {
        await runGit(['add', '--', ...validatedFiles], context.workspacePath);
      } else {
        await runGit(['add', '-A'], context.workspacePath);
      }

      // 5. Vérifier si des changements sont effectivement indexés
      const { stdout: stagedCheck } = await runGit(['diff', '--cached', '--name-only'], context.workspacePath);
      if (!stagedCheck.trim()) {
        return {
          success: false,
          error: 'Aucune modification indexée à commiter dans le workspace.'
        };
      }

      // 6. Exécution du commit avec tableau d'arguments (zéro interpolation shell)
      const { stdout: commitOut } = await runGit(['commit', '-m', message], context.workspacePath);

      // 7. Capture du hash de commit et de l'état post-commit
      const { stdout: hashOut } = await runGit(['rev-parse', '--short', 'HEAD'], context.workspacePath);
      const commitHash = hashOut.trim();

      const { stdout: afterStatusOut } = await runGit(['status', '--porcelain=v1', '-b'], context.workspacePath);
      const afterStatus = afterStatusOut.trim();

      return {
        success: true,
        data: {
          commitHash,
          message,
          filesCommitted: validatedFiles.length > 0 ? validatedFiles : ['Toutes les modifications'],
          beforeStatus,
          afterStatus,
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
