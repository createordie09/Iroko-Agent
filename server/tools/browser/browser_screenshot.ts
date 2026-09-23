import { IrokoTool, ToolContext, ToolResult } from '../types';
import { browserManager, ScreenshotResult } from '../../browser/BrowserManager';

export interface BrowserScreenshotInput {
  fullPage?: boolean;
  outputPath?: string;
}

export class BrowserScreenshotTool implements IrokoTool<BrowserScreenshotInput, ScreenshotResult> {
  public readonly name = 'browser_screenshot';
  public readonly description = 'Prend une capture d\'écran de la page web active dans le navigateur Playwright.';
  public readonly category = 'browser';
  public readonly permission = 'SAFE' as const;

  public readonly parameters = {
    type: 'object',
    properties: {
      fullPage: {
        type: 'boolean',
        description: 'Si vrai, capture la page entière défilable (par défaut: faux)'
      },
      outputPath: {
        type: 'string',
        description: 'Chemin relatif du fichier où sauvegarder la capture (facultatif)'
      }
    },
    additionalProperties: false
  };

  public async execute(input: BrowserScreenshotInput, _context: ToolContext): Promise<ToolResult<ScreenshotResult>> {
    try {
      const result = await browserManager.screenshot(input);
      return {
        success: true,
        data: result
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Erreur lors de la capture d'écran : ${err.message || String(err)}`
      };
    }
  }
}
