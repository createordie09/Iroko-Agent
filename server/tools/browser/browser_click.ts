import { IrokoTool, ToolContext, ToolResult } from '../types';
import { browserManager } from '../../browser/BrowserManager';

export interface BrowserClickInput {
  selector: string;
}

export interface BrowserClickOutput {
  clicked: boolean;
  selector: string;
}

export class BrowserClickTool implements IrokoTool<BrowserClickInput, BrowserClickOutput> {
  public readonly name = 'browser_click';
  public readonly description = 'Clique sur un élément HTML identifié par son sélecteur CSS dans la page web active.';
  public readonly category = 'browser';
  public readonly permission = 'SAFE' as const;

  public readonly parameters = {
    type: 'object',
    properties: {
      selector: {
        type: 'string',
        description: 'Sélecteur CSS de l\'élément sur lequel cliquer (ex: "button#submit", "a.nav-link")'
      }
    },
    required: ['selector'],
    additionalProperties: false
  };

  public async execute(input: BrowserClickInput, _context: ToolContext): Promise<ToolResult<BrowserClickOutput>> {
    try {
      if (!input.selector || typeof input.selector !== 'string') {
        return {
          success: false,
          error: 'Le paramètre "selector" est requis.'
        };
      }

      await browserManager.click(input.selector);
      return {
        success: true,
        data: {
          clicked: true,
          selector: input.selector
        }
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Erreur lors du clic sur "${input.selector}" : ${err.message || String(err)}`
      };
    }
  }
}
