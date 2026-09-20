import fs from 'fs';
import path from 'path';
import { IrokoTool, ToolContext, ToolResult } from '../types';

export interface EditFileInput {
  filePath: string;
  targetContent: string;
  replacementContent: string;
}

export class EditFileTool implements IrokoTool<EditFileInput> {
  public name = 'edit_file';
  public description = 'Remplace de façon chirurgicale un fragment de texte exact dans un fichier existant.';
  public category = 'filesystem' as const;
  public permission = 'MEDIUM' as const;

  public parameters = {
    type: 'object',
    required: ['filePath', 'targetContent', 'replacementContent'],
    properties: {
      filePath: {
        type: 'string',
        description: 'Chemin relatif du fichier à modifier.'
      },
      targetContent: {
        type: 'string',
        description: 'Extrait de texte exact à remplacer (doit être unique dans le fichier).'
      },
      replacementContent: {
        type: 'string',
        description: 'Nouveau contenu venant remplacer l\'extrait cible.'
      }
    }
  };

  public async execute(input: EditFileInput, context: ToolContext): Promise<ToolResult> {
    const fullPath = path.resolve(context.workspacePath, input.filePath);

    if (!fullPath.startsWith(context.workspacePath)) {
      return { success: false, error: 'Accès refusé : fichier hors du workspace.' };
    }

    if (!fs.existsSync(fullPath)) {
      return { success: false, error: `Fichier introuvable : ${input.filePath}` };
    }

    // Sollicitation de permission préalable
    const approved = await context.permissionEngine.requestPermission(
      this.name,
      this.permission,
      `Modifier chirurgicalement le fichier "${input.filePath}"`,
      { path: input.filePath },
      (req) => context.emitEvent({ type: 'permission_required', request: req })
    );

    if (!approved) {
      return {
        success: false,
        error: `Action non autorisée : la modification de ${input.filePath} a été refusée par l'utilisateur.`
      };
    }

    try {
      const original = fs.readFileSync(fullPath, 'utf-8');

      // Normalisation des fins de ligne pour la comparaison
      const normOriginal = original.replace(/\r\n/g, '\n');
      const normTarget = input.targetContent.replace(/\r\n/g, '\n');
      const normReplacement = input.replacementContent.replace(/\r\n/g, '\n');

      const occurrences = normOriginal.split(normTarget).length - 1;

      if (occurrences === 0) {
        return {
          success: false,
          error: `Le texte cible n'a pas été trouvé dans "${input.filePath}". Assurez-vous d'avoir lu le fichier au préalable pour copier le fragment exact.`
        };
      }

      if (occurrences > 1) {
        return {
          success: false,
          error: `Le texte cible apparaît ${occurrences} fois dans "${input.filePath}". Il doit être unique. Incluez davantage de lignes environnantes pour lever l'ambiguïté.`
        };
      }

      const updated = normOriginal.replace(normTarget, normReplacement);
      fs.writeFileSync(fullPath, updated, 'utf-8');

      const diff = `--- ${input.filePath}\n+++ ${input.filePath}\n- ${normTarget.slice(0, 150)}...\n+ ${normReplacement.slice(0, 150)}...`;

      context.emitEvent({
        type: 'file_changed',
        path: input.filePath,
        diff,
        action: 'modify'
      });

      return {
        success: true,
        diff,
        data: {
          filePath: input.filePath,
          status: 'modified'
        }
      };
    } catch (err: any) {
      return { success: false, error: err.message || 'Erreur lors de la modification du fichier' };
    }
  }
}
