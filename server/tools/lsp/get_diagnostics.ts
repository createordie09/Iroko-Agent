// server/tools/lsp/get_diagnostics.ts
// Cahier §14 : Outil SAFE pour récupérer les diagnostics TypeScript

import { IrokoTool, ToolContext, ToolResult } from '../types';
import { lspManager, LspDiagnostic } from './LspManager';
import { PathSanitizer } from '../../security/PathSanitizer';

export interface GetDiagnosticsInput {
  path?: string;
}

export interface GetDiagnosticsOutput {
  total: number;
  errorCount: number;
  warningCount: number;
  diagnostics: LspDiagnostic[];
}

export class GetDiagnosticsTool implements IrokoTool<GetDiagnosticsInput, GetDiagnosticsOutput> {
  public readonly name = 'get_diagnostics';
  public readonly description = 'Récupère les diagnostics LSP (erreurs de compilation TypeScript/JS, types incompatibles et avertissements) en temps réel.';
  public readonly category = 'lsp';
  public readonly permission = 'SAFE' as const;

  public readonly parameters = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Chemin relatif d\'un fichier spécifique à diagnostiquer (si omis, diagnostique tout le workspace)'
      }
    },
    additionalProperties: false
  };

  public async execute(input: GetDiagnosticsInput, context: ToolContext): Promise<ToolResult<GetDiagnosticsOutput>> {
    try {
      // Confinement strict si un chemin cible est spécifié
      if (input.path) {
        const pathValidation = PathSanitizer.validatePath(input.path, context.workspacePath);
        if (!pathValidation.valid) {
          return {
            success: false,
            error: pathValidation.error || 'Accès refusé : tentative de sortie du workspace.'
          };
        }
      }

      // Vérification de la disponibilité du LSP
      const avail = lspManager.isAvailable(context.workspacePath);
      if (!avail.available) {
        return {
          success: false,
          error: avail.reasonDisabled || 'Serveur de langage TypeScript indisponible.'
        };
      }

      const allDiagnostics = await lspManager.getDiagnostics(context.workspacePath, input.path);
      const errorCount = allDiagnostics.filter(d => d.category === 'error').length;
      const warningCount = allDiagnostics.filter(d => d.category === 'warning').length;

      return {
        success: true,
        data: {
          total: allDiagnostics.length,
          errorCount,
          warningCount,
          diagnostics: allDiagnostics.slice(0, 50) // Limiter à 50 pour préserver le contexte
        }
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Erreur lors de la récupération des diagnostics LSP : ${err.message || String(err)}`
      };
    }
  }
}
