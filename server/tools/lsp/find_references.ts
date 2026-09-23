import { IrokoTool, ToolContext, ToolResult } from '../types';
import { lspManager, LspReferencesResult } from './LspManager';

export interface FindReferencesInput {
  file: string;
  line: number;
  column: number;
}

export class FindReferencesTool implements IrokoTool<FindReferencesInput, LspReferencesResult> {
  public readonly name = 'find_references';
  public readonly description = 'Trouve toutes les références et utilisations d\'un symbole à une position donnée dans l\'ensemble du workspace.';
  public readonly category = 'lsp';
  public readonly permission = 'SAFE' as const;

  public readonly parameters = {
    type: 'object',
    properties: {
      file: {
        type: 'string',
        description: 'Chemin relatif du fichier contenant le symbole'
      },
      line: {
        type: 'number',
        description: 'Numéro de ligne (1-indexé)'
      },
      column: {
        type: 'number',
        description: 'Numéro de colonne (1-indexé)'
      }
    },
    required: ['file', 'line', 'column'],
    additionalProperties: false
  };

  public async execute(input: FindReferencesInput, context: ToolContext): Promise<ToolResult<LspReferencesResult>> {
    try {
      if (!input.file || typeof input.line !== 'number' || typeof input.column !== 'number') {
        return {
          success: false,
          error: 'Paramètres invalides : file, line et column sont requis.'
        };
      }

      const result = lspManager.getReferences(context.workspacePath, input.file, input.line, input.column);
      return {
        success: true,
        data: result
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Erreur lors de la recherche de références LSP : ${err.message || String(err)}`
      };
    }
  }
}
