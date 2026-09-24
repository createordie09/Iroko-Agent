import { IrokoTool, ToolContext, ToolResult } from '../types';
import { DocumentGenerators, SupportedFormat } from '../../artifacts/DocumentGenerators';
import { artifactManager } from '../../artifacts/ArtifactManager';
import { skillManager } from '../../skills/SkillManager';

const FALLBACK_INSTRUCTIONS: Record<SupportedFormat, string> = {
  docx: 'Format DOCX (docx) : racine { title: string, description?: string, sections: [{ heading?: string, paragraphs?: string[], bulletPoints?: string[], table?: { headers: string[], rows: any[][] } }] }.',
  xlsx: 'Format XLSX (exceljs) : racine { title?: string, sheets: [{ name: string (max 31 car), headers?: string[], rows: any[][] }] }.',
  pptx: 'Format PPTX (pptxgenjs) : racine { title: string, author?: string, slides: [{ title?: string, subtitle?: string, bullets?: string[], textBlocks?: string[], table?: { headers?: string[], rows: any[][] } }] }.',
  pdf: 'Format PDF (pdf-lib) : racine { title: string, author?: string, pages: [{ title?: string, paragraphs?: string[], lines?: string[], bulletPoints?: string[] }] }.',
  zip: 'Format ZIP (jszip) : racine { entries: [{ name: string, content?: string, sourcePath?: string }] }.'
};

export class CreateDocumentTool implements IrokoTool {
  public readonly name = 'create_document';
  public readonly description = 'Génère un document binaire autonome (docx, xlsx, pptx, pdf, zip) à partir d\'une spécification JSON structurée et validée par schéma.';
  public readonly category = 'artifacts' as const;
  public readonly permission = 'SAFE' as const;
  public readonly parameters = {
    type: 'object',
    properties: {
      format: {
        type: 'string',
        enum: ['docx', 'xlsx', 'pptx', 'pdf', 'zip'],
        description: 'Format du document à générer (docx, xlsx, pptx, pdf, zip).'
      },
      filename: {
        type: 'string',
        description: 'Nom du fichier avec extension (ex: rapport.docx, analyse.xlsx, presentation.pptx, document.pdf, archive.zip).'
      },
      spec: {
        type: 'object',
        description: 'Spécification JSON structurée du contenu selon le format (schéma Zod validé côté runtime).'
      },
      title: {
        type: 'string',
        description: 'Titre lisible optionnel pour l\'artéfact.'
      }
    },
    required: ['format', 'filename', 'spec']
  };

  public async execute(input: unknown, context: ToolContext): Promise<ToolResult> {
    const { format, filename, spec, title } = (input || {}) as {
      format?: SupportedFormat;
      filename?: string;
      spec?: unknown;
      title?: string;
    };

    if (!format || !['docx', 'xlsx', 'pptx', 'pdf', 'zip'].includes(format)) {
      return {
        success: false,
        error: 'Le paramètre "format" est requis et doit être l\'un des suivants : docx, xlsx, pptx, pdf, zip.'
      };
    }

    if (!filename || typeof filename !== 'string') {
      return {
        success: false,
        error: 'Le paramètre "filename" est requis.'
      };
    }

    if (!spec || typeof spec !== 'object') {
      return {
        success: false,
        error: 'Le paramètre "spec" est requis et doit être un objet JSON conforme au schéma du format.'
      };
    }

    const conversationId = context.conversationId || 'default_conversation';

    // Lecture de la compétence associée au format (Mission N2)
    const skill = skillManager.getSkill(format);
    let skillWarning: string | undefined;

    if (skill) {
      if (skill.enabled) {
        context.emitEvent({
          type: 'skill_invoked' as any,
          skillName: skill.name,
          format
        });
      } else {
        skillWarning = `La compétence système "${format}" est désactivée. Génération effectuée avec les instructions minimales intégrées.`;
        context.emitEvent({
          type: 'skill_fallback' as any,
          skillName: skill.name,
          format,
          warning: skillWarning
        });
      }
    }

    try {
      // 1. Génération du buffer binaire avec validation Zod
      const { buffer, mimeType } = await DocumentGenerators.generate(
        format,
        spec,
        { workspacePath: context.workspacePath }
      );

      // 2. Enregistrement dans le magasin d'artéfacts
      const artifact = artifactManager.createArtifact({
        conversationId,
        filename,
        contentBuffer: buffer,
        mimeType,
        title: title || filename
      });

      // 3. Émission d'événement vers le client
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

      const baseMessage = `Document "${artifact.name}" (${format.toUpperCase()}) généré avec succès (${(artifact.size / 1024).toFixed(1)} Ko).`;
      const finalMessage = skillWarning ? `${skillWarning} ${baseMessage}` : baseMessage;

      return {
        success: true,
        data: {
          id: artifact.id,
          name: artifact.name,
          title: artifact.title,
          mimeType: artifact.mimeType,
          version: artifact.currentVersion,
          size: artifact.size,
          skillUsed: skill ? skill.name : undefined,
          skillEnabled: skill ? skill.enabled : undefined,
          warning: skillWarning || undefined,
          message: finalMessage
        }
      };
    } catch (err: any) {
      const fallbackHint = FALLBACK_INSTRUCTIONS[format] || '';
      return {
        success: false,
        error: `Erreur lors de la génération du document ${format.toUpperCase()} : ${err.message}. ${fallbackHint ? `Instructions minimales : ${fallbackHint}` : ''}`
      };
    }
  }
}
