import { IrokoTool, ToolResult } from '../types';
import { processManager } from './ProcessManager';

export interface GetProcessOutputInput {
  processId: string;
  maxLines?: number;
}

export class GetProcessOutputTool implements IrokoTool<GetProcessOutputInput> {
  public name = 'get_process_output';
  public description = 'Récupère les dernières lignes de sortie (logs stdout/stderr) d\'un processus actif.';
  public category = 'terminal' as const;
  public permission = 'SAFE' as const;

  public parameters = {
    type: 'object',
    required: ['processId'],
    properties: {
      processId: {
        type: 'string',
        description: 'L\'identifiant du processus dont on souhaite consulter les logs.'
      },
      maxLines: {
        type: 'number',
        description: 'Nombre de lignes maximal à retourner (par défaut 100).'
      }
    }
  };

  public async execute(input: GetProcessOutputInput): Promise<ToolResult> {
    const proc = processManager.getProcess(input.processId);
    if (!proc) {
      return { success: false, error: `Processus introuvable : ${input.processId}` };
    }

    const logs = processManager.getLogs(input.processId, input.maxLines || 100);
    return {
      success: true,
      data: {
        processId: input.processId,
        status: proc.status,
        exitCode: proc.exitCode,
        totalLines: logs.length,
        output: logs.join('\n')
      }
    };
  }
}
