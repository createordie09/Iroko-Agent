import fs from 'fs';
import path from 'path';
import { IrokoTool, ToolContext, ToolResult } from '../types';

export interface ReadFileInput {
  filePath: string;
  startLine?: number;
  endLine?: number;
}

export class ReadFileTool implements IrokoTool<ReadFileInput> {
  public name = 'read_file';
  public description = 'Lit le contenu d\'un fichier texte avec numérotation des lignes.';
  public category = 'filesystem' as const;
  public permission = 'SAFE' as const;

  public parameters = {
    type: 'object',
    required: ['filePath'],
    properties: {
      filePath: {
        type: 'string',
        description: 'Chemin relatif du fichier à lire depuis la racine du workspace.'
      },
      startLine: {
        type: 'number',
        description: 'Numéro de la première ligne à lire (1-indexé).'
      },
      endLine: {
        type: 'number',
        description: 'Numéro de la dernière ligne à lire (1-indexé).'
      }
    }
  };

  public async execute(input: ReadFileInput, context: ToolContext): Promise<ToolResult> {
    const fullPath = path.resolve(context.workspacePath, input.filePath);

    if (!fullPath.startsWith(context.workspacePath)) {
      return { success: false, error: 'Accès refusé : le fichier demandé est hors du workspace.' };
    }

    if (!fs.existsSync(fullPath)) {
      return { success: false, error: `Fichier introuvable : ${input.filePath}` };
    }

    try {
      const stats = fs.statSync(fullPath);
      if (stats.size > 2 * 1024 * 1024) {
        return { success: false, error: `Le fichier est trop volumineux (> 2 Mo) pour être lu intégralement.` };
      }

      const raw = fs.readFileSync(fullPath, 'utf-8');
      const allLines = raw.split('\n');
      const totalLines = allLines.length;

      const start = Math.max(1, input.startLine || 1);
      const end = Math.min(totalLines, input.endLine || totalLines);

      const slicedLines = allLines.slice(start - 1, end).map((line, idx) => {
        const lineNum = start + idx;
        return `${lineNum}: ${line}`;
      });

      return {
        success: true,
        data: {
          filePath: input.filePath,
          totalLines,
          startLine: start,
          endLine: end,
          content: slicedLines.join('\n')
        }
      };
    } catch (err: any) {
      return { success: false, error: err.message || 'Erreur lors de la lecture du fichier' };
    }
  }
}
