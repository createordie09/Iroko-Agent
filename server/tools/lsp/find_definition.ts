import { IrokoTool, ToolContext, ToolResult } from '../types';
import { lspManager, LspDefinitionResult } from './LspManager';

export interface FindDefinitionInput {
  file: string;
  line: number;
  column: number;
}

export class FindDefinitionTool implements IrokoTool<FindDefinitionInput, LspDefinitionResult> {
  public readonly name = 'find_definition';
  public readonly description = 'Trouve l\'emplacement de la définition d\'un symbole (fonction, variable, classe, type) à une position donnée (fichier, ligne, colonne).';
  public readonly category = 'lsp';
  public readonly permission = 'SAFE' as const;

  public readonly parameters = {
    type: 'object',
    properties: {
      file: {
        type: 'string',
        description: 'Chemin relatif du fichier contenant l\'utilisation du symbole'
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

  public async execute(input: FindDefinitionInput, context: ToolContext): Promise<ToolResult<LspDefinitionResult>> {
    try {
      if (!input.file || typeof input.line !== 'number' || typeof input.column !== 'number') {
        return {
          success: false,
          error: 'Paramètres invalides : file, line et column sont requis.'
        };
      }

      const result = lspManager.getDefinition(context.workspacePath, input.file, input.line, input.column);
      return {
        success: true,
        data: result
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Erreur lors de la recherche de définition LSP : ${err.message || String(err)}`
      };
    }
  }
}
