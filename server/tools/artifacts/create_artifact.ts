import { IrokoTool, ToolContext, ToolResult } from '../types';
import { artifactManager } from '../../artifacts/ArtifactManager';

export class CreateArtifactTool implements IrokoTool {
  public readonly name = 'create_artifact';
  public readonly description = 'Crée un nouvel artéfact autonome (rapport, export de données CSV/JSON, document de synthèse) conservé hors du workspace.';
  public readonly category = 'artifacts' as const;
  public readonly permission = 'SAFE' as const;
  public readonly parameters = {
    type: 'object',
    properties: {
      filename: {
        type: 'string',
        description: 'Nom du fichier avec son extension (ex: rapport.md, export.csv, donnees.json, script.py). Sans chemin.'
      },
      content: {
        type: 'string',
        description: 'Contenu textuel intégral de l\'artéfact.'
      },
      title: {
        type: 'string',
        description: 'Titre lisible optionnel pour l\'affichage (ex: "Rapport d\'audit de sécurité").'
      },
      mimeType: {
        type: 'string',
        description: 'Type MIME optionnel (ex: text/markdown, text/csv, application/json).'
      }
    },
    required: ['filename', 'content']
  };

  public async execute(input: unknown, context: ToolContext): Promise<ToolResult> {
    const { filename, content, title, mimeType } = (input || {}) as {
      filename?: string;
      content?: string;
      title?: string;
      mimeType?: string;
    };

    if (!filename || typeof filename !== 'string') {
      return {
        success: false,
        error: 'Le paramètre "filename" est requis.'
      };
    }

    if (content === undefined || typeof content !== 'string') {
      return {
        success: false,
        error: 'Le paramètre "content" est requis.'
      };
    }

    const conversationId = context.conversationId || 'default_conversation';

    try {
      const artifact = artifactManager.createArtifact({
        conversationId,
        filename,
        content,
        title,
        mimeType
      });

      // Émettre un événement pour informer l'interface en temps réel
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
          message: `Artéfact "${artifact.name}" créé avec succès (version ${artifact.currentVersion}).`
        }
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Erreur lors de la création de l\'artéfact.'
      };
    }
  }
}
