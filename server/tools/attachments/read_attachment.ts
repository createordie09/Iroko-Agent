import { IrokoTool, ToolContext, ToolResult } from '../types';
import { attachmentManager } from '../../attachments/AttachmentManager';
import { AttachmentReader } from '../../attachments/AttachmentReader';

export class ReadAttachmentTool implements IrokoTool {
  public readonly name = 'read_attachment';
  public readonly description = 'Lit une portion ou la suite d\'un fichier joint à la conversation (document texte, PDF, tableur, archive) en respectant un offset et une limite.';
  public readonly category = 'attachments';
  public readonly permission = 'SAFE';

  public readonly parameters = {
    type: 'object',
    properties: {
      attachment_id: {
        type: 'string',
        description: 'L\'identifiant unique de la pièce jointe (fourni dans le message ou le contexte).'
      },
      offset: {
        type: 'integer',
        description: 'Position de départ en caractères (0 par défaut).'
      },
      limit: {
        type: 'integer',
        description: 'Nombre maximal de caractères à lire (30000 par défaut).'
      }
    },
    required: ['attachment_id']
  };

  public async execute(input: unknown, context: ToolContext): Promise<ToolResult> {
    const params = input as { attachment_id?: string; offset?: number; limit?: number };
    if (!params || !params.attachment_id) {
      return {
        success: false,
        error: 'Le paramètre attachment_id est obligatoire.'
      };
    }

    const attachment = attachmentManager.getAttachment(params.attachment_id);
    if (!attachment) {
      return {
        success: false,
        error: `Pièce jointe introuvable pour l'identifiant "${params.attachment_id}".`
      };
    }

    // Sécurité : Vérifier que la pièce jointe appartient bien à la conversation courante si un ID de conversation est fourni
    if (context.conversationId && attachment.conversationId !== context.conversationId) {
      return {
        success: false,
        error: 'Accès non autorisé : la pièce jointe n\'appartient pas à cette conversation.'
      };
    }

    try {
      const readResult = await AttachmentReader.readAttachment(attachment, {
        offset: params.offset,
        limit: params.limit,
        maxCharacters: params.limit || 30000
      });

      if (readResult.error) {
        return {
          success: false,
          error: readResult.error
        };
      }

      return {
        success: true,
        data: {
          id: attachment.id,
          name: attachment.name,
          mimeType: attachment.mimeType,
          type: readResult.type,
          content: readResult.content,
          truncated: readResult.truncated,
          pageCount: readResult.pageCount,
          sheetNames: readResult.sheetNames,
          entries: readResult.entries
        }
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Erreur de lecture de la pièce jointe : ${err.message}`
      };
    }
  }
}
