import { IrokoTool, ToolContext, ToolResult } from '../types';
import { browserManager } from '../../browser/BrowserManager';

export interface BrowserFillInput {
  selector: string;
  text: string;
}

export interface BrowserFillOutput {
  filled: boolean;
  selector: string;
}

export class BrowserFillTool implements IrokoTool<BrowserFillInput, BrowserFillOutput> {
  public readonly name = 'browser_fill';
  public readonly description = 'Saisit du texte dans un champ de formulaire ou zone éditable identifiée par son sélecteur CSS.';
  public readonly category = 'browser';
  public readonly permission = 'SAFE' as const;

  public readonly parameters = {
    type: 'object',
    properties: {
      selector: {
        type: 'string',
        description: 'Sélecteur CSS du champ à remplir (ex: "input#search", "textarea.comment")'
      },
      text: {
        type: 'string',
        description: 'Texte à saisir dans le champ'
      }
    },
    required: ['selector', 'text'],
    additionalProperties: false
  };

  public async execute(input: BrowserFillInput, _context: ToolContext): Promise<ToolResult<BrowserFillOutput>> {
    try {
      if (!input.selector || typeof input.text !== 'string') {
        return {
          success: false,
          error: 'Les paramètres "selector" et "text" sont requis.'
        };
      }

      await browserManager.fill(input.selector, input.text);
      return {
        success: true,
        data: {
          filled: true,
          selector: input.selector
        }
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Erreur lors de la saisie dans "${input.selector}" : ${err.message || String(err)}`
      };
    }
  }
}
