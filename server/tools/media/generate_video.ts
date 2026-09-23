import { IrokoTool, ToolContext, ToolResult } from '../types';
import { videoGateway } from '../../media/VideoGateway';

export class GenerateVideoTool implements IrokoTool {
  public readonly name = 'generate_video';
  public readonly description = 'Génère une vidéo à partir d\'une description textuelle (prompt). Crée un job asynchrone et un artéfact vidéo accessible et visualisable dans la conversation.';
  public readonly category = 'media';
  public readonly permission = 'MEDIUM'; // Requiert confirmation explicite de l'utilisateur

  public readonly parameters = {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
        description: 'La description détaillée de la scène vidéo à générer.'
      },
      duration: {
        type: 'number',
        description: 'Durée de la vidéo en secondes (par défaut 5s).'
      },
      aspect_ratio: {
        type: 'string',
        description: 'Le ratio d\'aspect souhaité pour la vidéo (ex: "16:9", "9:16", "1:1"). Par défaut "16:9".',
        enum: ['16:9', '9:16', '1:1', '4:3', '3:4']
      },
      start_image: {
        type: 'string',
        description: 'Image de départ optionnelle (chemin local ou URL base64) pour initialiser la vidéo.'
      },
      model: {
        type: 'string',
        description: 'Identifiant du modèle vidéo à utiliser (optionnel).'
      }
    },
    required: ['prompt']
  };

  public async execute(input: unknown, context: ToolContext): Promise<ToolResult> {
    const params = input as {
      prompt: string;
      duration?: number;
      aspect_ratio?: string;
      start_image?: string;
      model?: string;
    };

    if (!params.prompt || typeof params.prompt !== 'string' || !params.prompt.trim()) {
      return {
        success: false,
        error: 'Le paramètre "prompt" est obligatoire pour générer une vidéo.'
      };
    }

    // 1. Vérification de la configuration d'un fournisseur
    if (!videoGateway.hasConfiguredProvider()) {
      return {
        success: false,
        error: 'Aucun fournisseur de génération de vidéos configuré. Rendez-vous dans Paramètres › Fournisseurs & Clés pour configurer un modèle vidéo (Google Veo, Replicate, fal.ai ou Test).'
      };
    }

    const settings = videoGateway.getSettings();
    const provider = videoGateway.getProvider(settings.activeProviderId);
    const providerName = provider?.name || settings.activeProviderId || 'Inconnu';
    const modelId = params.model || settings.activeModelId || 'défaut';
    const duration = params.duration || 5;

    // 2. Demande d'autorisation interactive (Niveau MEDIUM : Une fois / Pour la session / Refuser)
    if (context.permissionEngine) {
      const approved = await context.permissionEngine.requestPermission(
        this.name,
        'MEDIUM',
        `Générer une vidéo (${providerName}, modèle ${modelId}, durée ${duration}s) : "${params.prompt}"`,
        {
          prompt: params.prompt,
          provider: providerName,
          model: modelId,
          duration,
          aspectRatio: params.aspect_ratio || '16:9'
        },
        (req) => context.emitEvent({ type: 'permission_required', request: req })
      );

      if (!approved) {
        return {
          success: false,
          error: 'Génération de vidéo refusée par l\'utilisateur.'
        };
      }
    }

    // 3. Création et lancement du job asynchrone
    try {
      const job = await videoGateway.createVideoJob(
        {
          prompt: params.prompt.trim(),
          duration,
          aspectRatio: params.aspect_ratio || '16:9',
          startImage: params.start_image,
          model: params.model,
          abortSignal: context.abortSignal
        },
        context.conversationId || 'default_conversation'
      );

      // Notification visuelle de démarrage du job
      context.emitEvent({
        type: 'status',
        status: 'executing_tool',
        message: `Job vidéo #${job.id} initié (${duration}s). Suivi en cours...`
      });

      return {
        success: true,
        data: {
          jobId: job.id,
          status: job.status,
          prompt: job.prompt,
          duration: job.duration,
          aspectRatio: job.aspectRatio,
          message: 'Tâche de génération vidéo en file d\'attente. Le résultat sera affiché dès achèvement.'
        }
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Erreur lors de l'initialisation du job vidéo : ${err.message}`
      };
    }
  }
}
