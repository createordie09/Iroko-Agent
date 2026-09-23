import { IrokoTool, ToolContext, ToolResult } from '../types';
import { browserManager } from '../../browser/BrowserManager';

export interface BrowserCloseOutput {
  closed: boolean;
}

export class BrowserCloseTool implements IrokoTool<{}, BrowserCloseOutput> {
  public readonly name = 'browser_close';
  public readonly description = 'Ferme la session active du navigateur Playwright et détruit le profil temporaire isolé.';
  public readonly category = 'browser';
  public readonly permission = 'SAFE' as const;

  public readonly parameters = {
    type: 'object',
    properties: {},
    additionalProperties: false
  };

  public async execute(_input: {}, _context: ToolContext): Promise<ToolResult<BrowserCloseOutput>> {
    try {
      await browserManager.close();
      return {
        success: true,
        data: {
          closed: true
        }
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Erreur lors de la fermeture du navigateur : ${err.message || String(err)}`
      };
    }
  }
}
