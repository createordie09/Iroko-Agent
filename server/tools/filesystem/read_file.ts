import fs from 'fs';
import path from 'path';
import { IrokoTool, ToolContext, ToolResult } from '../types';
import { PathSanitizer } from '../../security/PathSanitizer';

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
    const validation = PathSanitizer.validatePath(input.filePath, context.workspacePath);
    if (!validation.valid || !validation.canonicalPath) {
      return { success: false, error: validation.error || 'Chemin invalide.' };
    }

    const fullPath = validation.canonicalPath;

    if (!fs.existsSync(fullPath)) {
      return { success: false, error: `Fichier introuvable : ${input.filePath}` };
    }

    // 1. Détection de fichier binaire
    if (PathSanitizer.isBinaryFile(fullPath)) {
      return {
        success: false,
        error: `Le fichier "${input.filePath}" est un fichier binaire et ne peut être lu comme du texte.`
      };
    }

    // 2. Traitement des fichiers sensibles (.env, clés privées, certificats)
    if (validation.isSensitive) {
      const approved = await context.permissionEngine.requestPermission(
        this.name,
        'HIGH',
        `Lecture d'un fichier sensible contenant potentiellement des secrets : "${input.filePath}"`,
        { path: input.filePath, isSensitive: true },
        (req) => context.emitEvent({ type: 'permission_required', request: req })
      );

      if (!approved) {
        return {
          success: false,
          error: `Action non autorisée : la lecture du fichier sensible "${input.filePath}" a été refusée par l'utilisateur.`
        };
      }
    }

    try {
      // 3. Contrôle de taille (max 2 Mo)
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
