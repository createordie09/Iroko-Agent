import fs from 'fs';
import path from 'path';
import { IrokoTool, ToolContext, ToolResult } from '../types';
import { PathSanitizer } from '../../security/PathSanitizer';

export interface SearchTextInput {
  query: string;
  isRegex?: boolean;
  dirPath?: string;
  maxResults?: number;
}

const IGNORED_NAMES = new Set(['node_modules', '.git', 'dist', 'build', '.cache', '.iroko']);

export class SearchTextTool implements IrokoTool<SearchTextInput> {
  public name = 'search_text';
  public description = 'Recherche un texte ou une regex dans l\'ensemble des fichiers texte du workspace.';
  public category = 'filesystem' as const;
  public permission = 'SAFE' as const;

  public parameters = {
    type: 'object',
    required: ['query'],
    properties: {
      query: {
        type: 'string',
        description: 'Terme ou motif recherché dans les fichiers.'
      },
      isRegex: {
        type: 'boolean',
        description: 'Indique si la requête doit être interprétée comme une expression régulière.'
      },
      dirPath: {
        type: 'string',
        description: 'Sous-dossier dans lequel restreindre la recherche (optionnel).'
      },
      maxResults: {
        type: 'number',
        description: 'Nombre maximal de correspondances à retourner (par défaut 50).'
      }
    }
  };

  public async execute(input: SearchTextInput, context: ToolContext): Promise<ToolResult> {
    const rawTarget = input.dirPath || '.';
    const validation = PathSanitizer.validatePath(rawTarget, context.workspacePath);
    if (!validation.valid || !validation.canonicalPath) {
      return { success: false, error: validation.error || 'Dossier hors workspace.' };
    }

    const targetDir = validation.canonicalPath;

    const limit = input.maxResults || 50;
    const matches: Array<{ file: string; line: number; text: string }> = [];

    let regex: RegExp;
    try {
      regex = input.isRegex 
        ? new RegExp(input.query, 'g') 
        : new RegExp(input.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    } catch (e: any) {
      return { success: false, error: `Expression régulière invalide : ${e.message}` };
    }

    const searchDir = (dir: string) => {
      if (matches.length >= limit) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (matches.length >= limit) break;
        if (IGNORED_NAMES.has(entry.name)) continue;

        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          searchDir(fullPath);
        } else if (entry.isFile()) {
          // Filtrer les fichiers texte pertinents
          const ext = path.extname(entry.name).toLowerCase();
          if (['.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.css', '.html', '.toml', '.yml', '.yaml', '.txt', '.env'].includes(ext) || entry.name.startsWith('.')) {
            try {
              const content = fs.readFileSync(fullPath, 'utf-8');
              const lines = content.split('\n');

              for (let i = 0; i < lines.length; i++) {
                if (matches.length >= limit) break;
                if (regex.test(lines[i])) {
                  matches.push({
                    file: path.relative(context.workspacePath, fullPath).replace(/\\/g, '/'),
                    line: i + 1,
                    text: lines[i].trim()
                  });
                }
              }
            } catch {
              // Fichier binaire ou illisible
            }
          }
        }
      }
    };

    try {
      searchDir(targetDir);
      return {
        success: true,
        data: {
          query: input.query,
          totalMatches: matches.length,
          matches
        }
      };
    } catch (err: any) {
      return { success: false, error: err.message || 'Erreur lors de la recherche textuelle' };
    }
  }
}
