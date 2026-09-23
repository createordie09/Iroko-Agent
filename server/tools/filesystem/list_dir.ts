import fs from 'fs';
import path from 'path';
import { IrokoTool, ToolContext, ToolResult } from '../types';
import { PathSanitizer } from '../../security/PathSanitizer';

export interface ListDirInput {
  dirPath?: string;
  recursive?: boolean;
}

const IGNORED_NAMES = new Set(['node_modules', '.git', 'dist', 'build', '.cache', '.iroko']);

export class ListDirTool implements IrokoTool<ListDirInput> {
  public name = 'list_dir';
  public description = 'Liste les fichiers et répertoires d\'un dossier du workspace.';
  public category = 'filesystem' as const;
  public permission = 'SAFE' as const;

  public parameters = {
    type: 'object',
    properties: {
      dirPath: {
        type: 'string',
        description: 'Chemin relatif du dossier à explorer (par défaut la racine du workspace).'
      },
      recursive: {
        type: 'boolean',
        description: 'Indique si l\'exploration doit être récursive (limité à 3 niveaux).'
      }
    }
  };

  public async execute(input: ListDirInput, context: ToolContext): Promise<ToolResult> {
    const rawTarget = input.dirPath || '.';
    const validation = PathSanitizer.validatePath(rawTarget, context.workspacePath);
    if (!validation.valid || !validation.canonicalPath) {
      return { success: false, error: validation.error || 'Dossier invalide.' };
    }

    const targetDir = validation.canonicalPath;

    if (!fs.existsSync(targetDir)) {
      return { success: false, error: `Le dossier n'existe pas : ${input.dirPath || '.'}` };
    }

    try {
      const results: Array<{ name: string; path: string; type: 'file' | 'directory'; size?: number }> = [];

      const walk = (dir: string, depth = 0) => {
        if (depth > 2 && input.recursive) return;
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
          if (IGNORED_NAMES.has(entry.name)) continue;
          const fullPath = path.join(dir, entry.name);
          const relativePath = path.relative(context.workspacePath, fullPath).replace(/\\/g, '/');

          if (entry.isDirectory()) {
            results.push({ name: entry.name, path: relativePath, type: 'directory' });
            if (input.recursive) {
              walk(fullPath, depth + 1);
            }
          } else if (entry.isFile()) {
            const stat = fs.statSync(fullPath);
            results.push({ name: entry.name, path: relativePath, type: 'file', size: stat.size });
          }
        }
      };

      walk(targetDir, 0);

      return {
        success: true,
        data: {
          currentDirectory: path.relative(context.workspacePath, targetDir).replace(/\\/g, '/') || '.',
          totalEntries: results.length,
          entries: results
        }
      };
    } catch (err: any) {
      return { success: false, error: err.message || 'Erreur lors de la lecture du dossier' };
    }
  }
}
