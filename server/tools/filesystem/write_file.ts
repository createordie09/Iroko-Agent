import fs from 'fs';
import path from 'path';
import { IrokoTool, ToolContext, ToolResult } from '../types';
import { PathSanitizer } from '../../security/PathSanitizer';

export interface WriteFileInput {
  filePath: string;
  content: string;
  overwrite?: boolean;
}

export class WriteFileTool implements IrokoTool<WriteFileInput> {
  public name = 'write_file';
  public description = 'Crée un nouveau fichier texte ou remplace intégralement son contenu.';
  public category = 'filesystem' as const;
  public permission = 'HIGH' as const;

  public parameters = {
    type: 'object',
    required: ['filePath', 'content'],
    properties: {
      filePath: {
        type: 'string',
        description: 'Chemin relatif du fichier à créer ou modifier.'
      },
      content: {
        type: 'string',
        description: 'Nouveau contenu complet du fichier.'
      },
      overwrite: {
        type: 'boolean',
        description: 'Autoriser l\'écrasement si le fichier existe déjà (false par défaut).'
      }
    }
  };

  public async execute(input: WriteFileInput, context: ToolContext): Promise<ToolResult> {
    const validation = PathSanitizer.validatePath(input.filePath, context.workspacePath, { allowCreation: true });
    if (!validation.valid || !validation.canonicalPath) {
      return { success: false, error: validation.error || 'Chemin invalide.' };
    }

    const fullPath = validation.canonicalPath;
    const fileExists = fs.existsSync(fullPath);

    if (fileExists && !input.overwrite) {
      return {
        success: false,
        error: `Le fichier "${input.filePath}" existe déjà. Utilisez edit_file pour une modification ciblée ou spécifiez overwrite: true.`
      };
    }

    // Demande de permission
    const permLevel = validation.isSensitive ? 'HIGH' : this.permission;
    const desc = validation.isSensitive
      ? `Écriture dans un fichier sensible (${input.filePath})`
      : `${fileExists ? 'Écraser' : 'Créer'} le fichier "${input.filePath}"`;

    const approved = await context.permissionEngine.requestPermission(
      this.name,
      permLevel,
      desc,
      { path: input.filePath, isSensitive: validation.isSensitive },
      (req) => context.emitEvent({ type: 'permission_required', request: req })
    );

    if (!approved) {
      return {
        success: false,
        error: `Action non autorisée : l'écriture dans ${input.filePath} a été refusée.`
      };
    }

    try {
      // Écriture atomique via fichier temporaire
      PathSanitizer.writeAtomic(fullPath, input.content, 'utf-8');

      context.emitEvent({
        type: 'file_changed',
        path: input.filePath,
        action: fileExists ? 'modify' : 'create'
      });

      return {
        success: true,
        data: {
          filePath: input.filePath,
          bytesWritten: Buffer.byteLength(input.content, 'utf-8'),
          status: fileExists ? 'overwritten' : 'created'
        }
      };
    } catch (err: any) {
      return { success: false, error: err.message || 'Erreur lors de l\'écriture du fichier' };
    }
  }
}
