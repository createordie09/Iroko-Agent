import crypto from 'crypto';
import { IrokoTool, ToolContext, ToolResult } from '../types';
import { mediaGateway } from '../../media/MediaGateway';
import { ArtifactManager } from '../../artifacts/ArtifactManager';

export class GenerateImageTool implements IrokoTool {
  public readonly name = 'generate_image';
  public readonly description = 'Génère une image à partir d\'une description textuelle (prompt). Crée un artéfact d\'image accessible et téléchargeable dans la conversation.';
  public readonly category = 'media';
  public readonly permission = 'SAFE';

  public readonly parameters = {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
        description: 'La description détaillée et précise de l\'image à générer.'
      },
      aspect_ratio: {
        type: 'string',
        description: 'Le ratio d\'aspect souhaité pour l\'image (ex: "1:1", "16:9", "9:16", "4:3", "3:2"). Par défaut "1:1".',
        enum: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3']
      },
      count: {
        type: 'number',
        description: 'Nombre d\'images à générer (par défaut 1).'
      },
      seed: {
        type: 'number',
        description: 'Graine aléatoire optionnelle pour la reproductibilité.'
      }
    },
    required: ['prompt']
  };

  public async execute(input: unknown, context: ToolContext): Promise<ToolResult> {
    const params = input as {
      prompt: string;
      aspect_ratio?: string;
      count?: number;
      seed?: number;
    };

    if (!params.prompt || typeof params.prompt !== 'string' || !params.prompt.trim()) {
      return {
        success: false,
        error: 'Le paramètre "prompt" est obligatoire pour générer une image.'
      };
    }

    // Vérification de la présence d'un fournisseur configuré
    if (!mediaGateway.hasConfiguredProvider()) {
      return {
        success: false,
        error: 'Aucun fournisseur de génération d\'images configuré. Rendez-vous dans Paramètres › Fournisseurs & Clés pour configurer une clé et un modèle d\'images (OpenAI, Google Imagen, Cloudflare Workers AI ou Test).'
      };
    }

    try {
      const result = await mediaGateway.generateImage({
        prompt: params.prompt.trim(),
        aspectRatio: params.aspect_ratio || '1:1',
        count: params.count || 1,
        seed: params.seed,
        abortSignal: context.abortSignal
      });

      // Détermination de l'extension de fichier selon le type MIME
      let ext = '.png';
      if (result.mimeType === 'image/jpeg' || result.mimeType === 'image/jpg') {
        ext = '.jpg';
      } else if (result.mimeType === 'image/webp') {
        ext = '.webp';
      }

      // Nom de fichier assaini
      const slug = params.prompt
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 30) || 'image';
      const filename = `${slug}-${Date.now().toString(36)}${ext}`;
      const title = params.prompt.length > 50 ? params.prompt.slice(0, 47) + '...' : params.prompt;

      const conversationId = context.conversationId || 'default_conversation';

      const artifact = ArtifactManager.getInstance().createArtifact({
        conversationId,
        filename,
        contentBuffer: result.imageData,
        mimeType: result.mimeType,
        title,
        metadata: {
          prompt: result.prompt,
          model: result.model,
          seed: result.seed,
          aspectRatio: result.aspectRatio || params.aspect_ratio || '1:1',
          revisedPrompt: result.revisedPrompt,
          isGeneratedImage: true
        }
      });

      // Émission d'événement vers le frontend
      if (context.emitEvent) {
        context.emitEvent({
          type: 'artifact_created',
          artifact: {
            id: artifact.id,
            name: artifact.name,
            title: artifact.title,
            mimeType: artifact.mimeType,
            version: artifact.currentVersion,
            size: artifact.size,
            metadata: artifact.metadata
          }
        });
      }

      return {
        success: true,
        data: {
          artifactId: artifact.id,
          filename: artifact.name,
          title: artifact.title,
          mimeType: artifact.mimeType,
          size: artifact.size,
          model: result.model,
          aspectRatio: result.aspectRatio,
          seed: result.seed,
          revisedPrompt: result.revisedPrompt,
          downloadUrl: `/api/artifacts/${artifact.id}/download`,
          message: `L'image a été générée avec succès et enregistrée comme artéfact "${artifact.name}".`
        }
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Échec de la génération d\'image.'
      };
    }
  }
}
