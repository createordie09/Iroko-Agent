// server/tools/browser/browser_get_logs.ts
// Cahier §16 : Outil SAFE pour lire les logs de console et erreurs réseau de la page active

import { IrokoTool, ToolContext, ToolResult } from '../types';
import { browserManager, BrowserConsoleLog, BrowserNetworkError } from '../../browser/BrowserManager';

export interface BrowserGetLogsInput {
  limit?: number;
  clear?: boolean;
}

export interface BrowserGetLogsOutput {
  totalConsole: number;
  consoleLogs: BrowserConsoleLog[];
  totalNetworkErrors: number;
  networkErrors: BrowserNetworkError[];
}

export class BrowserGetLogsTool implements IrokoTool<BrowserGetLogsInput, BrowserGetLogsOutput> {
  public readonly name = 'browser_get_logs';
  public readonly description = 'Récupère les journaux de la console (logs, avertissements, erreurs) et les requêtes réseau échouées (4xx, 5xx, timeouts) de la page web active dans le navigateur Playwright.';
  public readonly category = 'browser';
  public readonly permission = 'SAFE' as const;

  public readonly parameters = {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'Nombre maximal d\'entrées à récupérer par catégorie (par défaut : 20, max : 50)'
      },
      clear: {
        type: 'boolean',
        description: 'Si vrai, réinitialise les journaux après la lecture (par défaut : faux)'
      }
    },
    additionalProperties: false
  };

  public async execute(input: BrowserGetLogsInput, _context: ToolContext): Promise<ToolResult<BrowserGetLogsOutput>> {
    try {
      const limit = typeof input.limit === 'number' ? Math.min(Math.max(1, input.limit), 50) : 20;
      const consoleLogs = browserManager.getConsoleLogs(limit);
      const networkErrors = browserManager.getNetworkErrors(limit);

      if (input.clear) {
        browserManager.clearLogs();
      }

      return {
        success: true,
        data: {
          totalConsole: consoleLogs.length,
          consoleLogs,
          totalNetworkErrors: networkErrors.length,
          networkErrors
        }
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Erreur lors de la récupération des journaux du navigateur : ${err.message || String(err)}`
      };
    }
  }
}
