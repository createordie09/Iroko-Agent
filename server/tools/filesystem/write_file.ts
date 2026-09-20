import fs from 'fs';
import path from 'path';
import { IrokoTool, ToolContext, ToolResult } from '../types';

export interface WriteFileInput {
  filePath: string;
  content: string;
  overwrite?: boolean;
}

export class WriteFileTool implements IrokoTool<WriteFileInput> {
  public name = 'write_file';
  public description = 'Crée un nouveau fichier dans le workspace avec le contenu spécifié.';
  public category = 'filesystem' as const;
  public permission = 'MEDIUM' as const;

  public parameters = {
    type: 'object',
    required: ['filePath', 'content'],
    properties: {
      filePath: {
        type: 'string',
        description: 'Chemin relatif du fichier à créer depuis la racine du workspace.'
      },
      content: {
        type: 'string',
        description: 'Contenu intégral à écrire dans le fichier.'
      },
      overwrite: {
        type: 'boolean',
        description: 'Autorise l\'écrasement si le fichier existe déjà (par défaut false).'
      }
    }
  };

  public async execute(input: WriteFileInput, context: ToolContext): Promise<ToolResult> {
    const fullPath = path.resolve(context.workspacePath, input.filePath);

    if (!fullPath.startsWith(context.workspacePath)) {
      return { success: false, error: 'Accès refusé : chemin en dehors du workspace.' };
    }

    const fileExists = fs.existsSync(fullPath);
    if (fileExists && !input.overwrite) {
      return {
        success: false,
        error: `Le fichier "${input.filePath}" existe déjà. Utilisez edit_file pour une modification ciblée ou spécifiez overwrite: true.`
      };
    }

    // Demande de permission
    const approved = await context.permissionEngine.requestPermission(
      this.name,
      this.permission,
      `${fileExists ? 'Écraser' : 'Créer'} le fichier "${input.filePath}"`,
      { path: input.filePath },
      (req) => context.emitEvent({ type: 'permission_required', request: req })
    );

    if (!approved) {
      return {
        success: false,
        error: `Action non autorisée : l'écriture dans ${input.filePath} a été refusée.`
      };
    }

    try {
      const parentDir = path.dirname(fullPath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }

      fs.writeFileSync(fullPath, input.content, 'utf-8');

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
