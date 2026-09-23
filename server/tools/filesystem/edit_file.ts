import fs from 'fs';
import path from 'path';
import { IrokoTool, ToolContext, ToolResult } from '../types';
import { PathSanitizer } from '../../security/PathSanitizer';

export interface EditFileInput {
  filePath: string;
  targetContent: string;
  replacementContent: string;
}

export class EditFileTool implements IrokoTool<EditFileInput> {
  public name = 'edit_file';
  public description = 'Remplace une portion de texte unique dans un fichier existant du workspace.';
  public category = 'filesystem' as const;
  public permission = 'MEDIUM' as const;

  public parameters = {
    type: 'object',
    required: ['filePath', 'targetContent', 'replacementContent'],
    properties: {
      filePath: {
        type: 'string',
        description: 'Chemin relatif du fichier à modifier depuis la racine du workspace.'
      },
      targetContent: {
        type: 'string',
        description: 'Le contenu exact à remplacer (doit être unique dans le fichier).'
      },
      replacementContent: {
        type: 'string',
        description: 'Le nouveau contenu de remplacement.'
      }
    }
  };

  public async execute(input: EditFileInput, context: ToolContext): Promise<ToolResult> {
    const validation = PathSanitizer.validatePath(input.filePath, context.workspacePath);
    if (!validation.valid || !validation.canonicalPath) {
      return { success: false, error: validation.error || 'Chemin invalide.' };
    }

    const fullPath = validation.canonicalPath;

    if (!fs.existsSync(fullPath)) {
      return { success: false, error: `Fichier introuvable : ${input.filePath}` };
    }

    // Sollicitation de permission préalable
    const permLevel = validation.isSensitive ? 'HIGH' : this.permission;
    const desc = validation.isSensitive
      ? `Modification chirurgicale d'un fichier sensible (${input.filePath})`
      : `Modifier chirurgicalement le fichier "${input.filePath}"`;

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
        error: `Action non autorisée : la modification de ${input.filePath} a été refusée par l'utilisateur.`
      };
    }

    try {
      const original = fs.readFileSync(fullPath, 'utf-8');

      // 1. Détection et préservation du BOM UTF-8 (\uFEFF)
      const hasBOM = original.charCodeAt(0) === 0xfeff;
      const contentWithoutBOM = hasBOM ? original.slice(1) : original;

      // 2. Détection et préservation des fins de ligne (CRLF vs LF)
      const isCRLF = contentWithoutBOM.includes('\r\n');

      // Normalisation en LF pour la recherche et le comptage strict
      const normOriginal = contentWithoutBOM.replace(/\r\n/g, '\n');
      const normTarget = input.targetContent.replace(/\r\n/g, '\n');
      const normReplacement = input.replacementContent.replace(/\r\n/g, '\n');

      const occurrences = normOriginal.split(normTarget).length - 1;

      // 3. Échec strict sans rien modifier si la cible est introuvable
      if (occurrences === 0) {
        return {
          success: false,
          error: `Le texte cible n'a pas été trouvé dans "${input.filePath}". Assurez-vous d'avoir lu le fichier au préalable pour copier le fragment exact.`
        };
      }

      // 4. Échec strict sans rien modifier si la cible est ambiguë (> 1 occurrence)
      if (occurrences > 1) {
        return {
          success: false,
          error: `Le texte cible apparaît ${occurrences} fois dans "${input.filePath}". Il doit être unique. Incluez davantage de lignes environnantes pour lever l'ambiguïté.`
        };
      }

      // 5. Sauvegarde préalable dans le dossier runtime pour annulation et audit
      PathSanitizer.backupFile(context.workspacePath, fullPath);

      // 6. Remplacement chirurgical
      let updated = normOriginal.replace(normTarget, normReplacement);

      // Restauration des fins de ligne d'origine
      if (isCRLF) {
        updated = updated.replace(/\n/g, '\r\n');
      }

      // Restauration du BOM d'origine
      if (hasBOM) {
        updated = '\uFEFF' + updated;
      }

      // 7. Écriture atomique via fichier temporaire
      PathSanitizer.writeAtomic(fullPath, updated, 'utf-8');

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
