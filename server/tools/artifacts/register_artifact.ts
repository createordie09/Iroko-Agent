import path from 'path';
import fs from 'fs';
import { IrokoTool, ToolContext, ToolResult } from '../types';
import { PathSanitizer } from '../../security/PathSanitizer';
import { artifactManager, ArtifactManager } from '../../artifacts/ArtifactManager';
import { tempWorkspaceManager } from '../../workspace/TempWorkspaceManager';

export class RegisterArtifactTool implements IrokoTool {
  public readonly name = 'register_artifact';
  public readonly description = 'Enregistre dans le magasin d\'artéfacts un fichier produit dans le dossier de travail ou l\'espace temporaire par un script ou une commande.';
  public readonly category = 'artifacts' as const;
  public readonly permission = 'SAFE' as const;
  public readonly parameters = {
    type: 'object',
    properties: {
      filePath: {
        type: 'string',
        description: 'Chemin relatif au dossier de travail ou absolu vers le fichier à enregistrer comme artéfact.'
      },
      title: {
        type: 'string',
        description: 'Titre lisible optionnel pour l\'artéfact.'
      },
      mimeType: {
        type: 'string',
        description: 'Type MIME optionnel si connu (ex: image/png, application/pdf).'
      }
    },
    required: ['filePath']
  };

  public async execute(input: unknown, context: ToolContext): Promise<ToolResult> {
    const { filePath, title, mimeType } = (input || {}) as {
      filePath?: string;
      title?: string;
      mimeType?: string;
    };

    if (!filePath || typeof filePath !== 'string') {
      return {
        success: false,
        error: 'Le paramètre "filePath" est requis.'
      };
    }

    const conversationId = context.conversationId || 'default_conversation';

    // 1. Détermination du dossier de base autorisé (workspace actif ou espace temporaire)
    let baseDir = context.workspacePath;
    if (!baseDir || !fs.existsSync(baseDir)) {
      baseDir = tempWorkspaceManager.getOrCreateTempWorkspace(conversationId);
    }

    // 2. Confinement strict du chemin via PathSanitizer
    const validation = PathSanitizer.validatePath(filePath, baseDir);
    if (!validation.valid || !validation.canonicalPath) {
      // Si non valide sous workspacePath, tester si le fichier réside sous l'espace temporaire
      const tempPath = tempWorkspaceManager.getOrCreateTempWorkspace(conversationId);
      const tempValidation = PathSanitizer.validatePath(filePath, tempPath);
      if (!tempValidation.valid || !tempValidation.canonicalPath) {
        return {
          success: false,
          error: validation.error || 'Accès refusé : le fichier doit résider obligatoirement dans le dossier de travail.'
        };
      }
      validation.canonicalPath = tempValidation.canonicalPath;
    }

    const targetFile = validation.canonicalPath;

    // 3. Vérification d'existence sur disque
    if (!fs.existsSync(targetFile)) {
      return {
        success: false,
        error: `Fichier introuvable sur le disque : "${filePath}".`
      };
    }

    // 4. Vérification qu'il s'agit bien d'un fichier régulier
    const stat = fs.statSync(targetFile);
    if (!stat.isFile()) {
      return {
        success: false,
        error: `Le chemin spécifié n'est pas un fichier régulier : "${filePath}".`
      };
    }

    // 5. Plafond de taille strict (50 Mo max)
    if (stat.size > ArtifactManager.MAX_ARTIFACT_BYTES) {
      return {
        success: false,
        error: `Taille du fichier (${(stat.size / (1024 * 1024)).toFixed(1)} Mo) supérieure à la limite autorisée de 50 Mo.`
      };
    }

    try {
      const filename = path.basename(targetFile);
      const buffer = fs.readFileSync(targetFile);

      // 6. Enregistrement dans le magasin d'artéfacts
      const artifact = artifactManager.createArtifact({
        conversationId,
        filename,
        contentBuffer: buffer,
        mimeType,
        title: title || filename
      });

      // 7. Émission d'événement vers le client
      context.emitEvent({
        type: 'artifact_created' as any,
        artifact: {
          id: artifact.id,
          name: artifact.name,
          title: artifact.title,
          mimeType: artifact.mimeType,
          version: artifact.currentVersion,
          size: artifact.size
        }
      });

      return {
        success: true,
        data: {
          id: artifact.id,
          name: artifact.name,
          title: artifact.title,
          mimeType: artifact.mimeType,
          version: artifact.currentVersion,
          size: artifact.size,
          message: `Fichier "${artifact.name}" enregistré avec succès comme artéfact (${(artifact.size / 1024).toFixed(1)} Ko).`
        }
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Erreur lors de l\'enregistrement de l\'artéfact.'
      };
    }
  }
}
