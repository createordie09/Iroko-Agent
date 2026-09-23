import { IrokoTool, ToolContext, ToolResult } from '../types';
import { browserManager, NavigateResult } from '../../browser/BrowserManager';
import { BrowserSecurity } from '../../browser/BrowserSecurity';

export interface BrowserNavigateInput {
  url: string;
}

export class BrowserNavigateTool implements IrokoTool<BrowserNavigateInput, NavigateResult> {
  public readonly name = 'browser_navigate';
  public readonly description = 'Navigue vers une URL web dans le navigateur Playwright headless. Localhost est autorisé par défaut pour tester l\'application ; les URL externes et réseaux privés nécessitent une autorisation explicite.';
  public readonly category = 'browser';
  public readonly permission = 'MEDIUM' as const;

  public readonly parameters = {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'URL cible vers laquelle naviguer (ex: http://localhost:5173)'
      }
    },
    required: ['url'],
    additionalProperties: false
  };

  public async execute(input: BrowserNavigateInput, context: ToolContext): Promise<ToolResult<NavigateResult>> {
    try {
      if (!input.url || typeof input.url !== 'string') {
        return {
          success: false,
          error: 'Le paramètre "url" est obligatoire et doit être une chaîne valide.'
        };
      }

      const classification = BrowserSecurity.classifyUrl(input.url);

      if (classification.type === 'INVALID') {
        return {
          success: false,
          error: `URL invalide : ${classification.reason || 'Format non supporté.'}`
        };
      }

      // Si l'URL nécessite une autorisation (externe, réseau privé, file://)
      if (classification.requiresPermission && context.permissionEngine) {
        const riskLevel = classification.type === 'PRIVATE_NETWORK' || classification.type === 'FILE' ? 'HIGH' : 'MEDIUM';
        const allowed = await context.permissionEngine.requestPermission(
          this.name,
          riskLevel,
          classification.reason || `Navigation vers ${input.url}`,
          { url: input.url }
        );

        if (!allowed) {
          return {
            success: false,
            error: `Navigation vers "${input.url}" refusée par la politique de sécurité ou l'utilisateur.`
          };
        }
      }

      const result = await browserManager.navigate(input.url);
      return {
        success: true,
        data: result
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Erreur lors de la navigation : ${err.message || String(err)}`
      };
    }
  }
}
