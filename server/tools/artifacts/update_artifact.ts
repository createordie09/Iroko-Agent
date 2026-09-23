import { IrokoTool, ToolContext, ToolResult } from '../types';
import { artifactManager } from '../../artifacts/ArtifactManager';

export class UpdateArtifactTool implements IrokoTool {
  public readonly name = 'update_artifact';
  public readonly description = 'Met à jour un artéfact existant en créant une nouvelle version (vN+1) avec un nouveau contenu complet ou un patch.';
  public readonly category = 'artifacts' as const;
  public readonly permission = 'SAFE' as const;
  public readonly parameters = {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: 'Identifiant unique de l\'artéfact à mettre à jour (ex: art_...).'
      },
      content: {
        type: 'string',
        description: 'Nouveau contenu textuel intégral de l\'artéfact (remplace le contenu pour la nouvelle version).'
      },
      patch: {
        type: 'string',
        description: 'Patch ou texte additionnel à appliquer si le contenu complet n\'est pas fourni.'
      },
      title: {
        type: 'string',
        description: 'Nouveau titre lisible optionnel pour l\'artéfact.'
      }
    },
    required: ['id']
  };

  public async execute(input: unknown, context: ToolContext): Promise<ToolResult> {
    const { id, content, patch, title } = (input || {}) as {
      id?: string;
      content?: string;
      patch?: string;
      title?: string;
    };

    if (!id || typeof id !== 'string') {
      return {
        success: false,
        error: 'Le paramètre "id" est requis.'
      };
    }

    if (content === undefined && patch === undefined) {
      return {
        success: false,
        error: 'Soit "content" soit "patch" doit être fourni.'
      };
    }

    try {
      const artifact = artifactManager.updateArtifact({
        id,
        content,
        patch,
        title
      });

      // Émettre un événement pour informer l'interface en temps réel
      context.emitEvent({
        type: 'artifact_updated' as any,
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
          message: `Artéfact "${artifact.name}" mis à jour avec succès (nouvelle version ${artifact.currentVersion}).`
        }
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Erreur lors de la mise à jour de l\'artéfact.'
      };
    }
  }
}
