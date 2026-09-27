// server/tools/lsp/get_document_symbols.ts
// Cahier §14 : Outil SAFE pour extraire les symboles de document (fonctions, types, classes)

import { IrokoTool, ToolContext, ToolResult } from '../types';
import { lspManager, LspDocumentSymbol } from './LspManager';
import { PathSanitizer } from '../../security/PathSanitizer';

export interface GetDocumentSymbolsInput {
  file: string;
}

export interface GetDocumentSymbolsOutput {
  file: string;
  total: number;
  symbols: LspDocumentSymbol[];
}

export class GetDocumentSymbolsTool implements IrokoTool<GetDocumentSymbolsInput, GetDocumentSymbolsOutput> {
  public readonly name = 'get_document_symbols';
  public readonly description = 'Extrait la liste structurée des symboles (fonctions, classes, interfaces, variables) d\'un fichier TypeScript/JavaScript avec leur position (fichier:ligne:colonne).';
  public readonly category = 'lsp';
  public readonly permission = 'SAFE' as const;

  public readonly parameters = {
    type: 'object',
    properties: {
      file: {
        type: 'string',
        description: 'Chemin relatif du fichier au sein du workspace dont extraire les symboles'
      }
    },
    required: ['file'],
    additionalProperties: false
  };

  public async execute(input: GetDocumentSymbolsInput, context: ToolContext): Promise<ToolResult<GetDocumentSymbolsOutput>> {
    try {
      if (!input.file || typeof input.file !== 'string') {
        return {
          success: false,
          error: 'Paramètre "file" manquant ou invalide.'
        };
      }

      // Confinement strict au workspace (§14, §26)
      const pathValidation = PathSanitizer.validatePath(input.file, context.workspacePath);
      if (!pathValidation.valid) {
        return {
          success: false,
          error: pathValidation.error || 'Accès refusé : tentative de sortie du workspace.'
        };
      }

      // Vérification d'absence sans installation implicite
      const avail = lspManager.isAvailable(context.workspacePath);
      if (!avail.available) {
        return {
          success: false,
          error: avail.reasonDisabled || 'Serveur de langage TypeScript indisponible.'
        };
      }

      const symbols = await lspManager.getDocumentSymbols(context.workspacePath, input.file);
      const capped = symbols.slice(0, 100);

      return {
        success: true,
        data: {
          file: input.file,
          total: symbols.length,
          symbols: capped
        }
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Erreur lors de l'extraction des symboles de document : ${err.message || String(err)}`
      };
    }
  }
}
