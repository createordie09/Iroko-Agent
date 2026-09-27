// server/tools/browser/browser_screenshot.ts
// Cahier §16 : Outil SAFE pour capture d'écran dans le navigateur Playwright avec confinement workspace

import { IrokoTool, ToolContext, ToolResult } from '../types';
import { browserManager, ScreenshotResult } from '../../browser/BrowserManager';
import { PathSanitizer } from '../../security/PathSanitizer';
import path from 'path';

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
        description: 'Si vrai, capture la page entière défilable (par défaut : faux)'
      },
      outputPath: {
        type: 'string',
        description: 'Chemin relatif au workspace où sauvegarder la capture d\'écran (facultatif)'
      }
    },
    additionalProperties: false
  };

  public async execute(input: BrowserScreenshotInput, context: ToolContext): Promise<ToolResult<ScreenshotResult>> {
    try {
      let resolvedOutputPath: string | undefined;

      if (input.outputPath) {
        // Confinement strict au workspace (§16, §26)
        const pathValidation = PathSanitizer.validatePath(input.outputPath, context.workspacePath, { allowCreation: true });
        if (!pathValidation.valid) {
          return {
            success: false,
            error: pathValidation.error || 'Accès refusé : le fichier de capture d\'écran doit être confiné au workspace.'
          };
        }
        resolvedOutputPath = pathValidation.canonicalPath || path.resolve(context.workspacePath, input.outputPath);
      }

      const result = await browserManager.screenshot({
        fullPage: input.fullPage,
        outputPath: resolvedOutputPath
      });

      return {
        success: true,
        data: {
          ...result,
          path: input.outputPath || result.path
        }
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Erreur lors de la capture d'écran : ${err.message || String(err)}`
      };
    }
  }
}
