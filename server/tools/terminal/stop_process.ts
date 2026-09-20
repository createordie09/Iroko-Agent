import { IrokoTool, ToolContext, ToolResult } from '../types';
import { processManager } from './ProcessManager';

export interface StopProcessInput {
  processId: string;
}

export class StopProcessTool implements IrokoTool<StopProcessInput> {
  public name = 'stop_process';
  public description = 'Arrête un processus persistant en cours d\'exécution.';
  public category = 'terminal' as const;
  public permission = 'SAFE' as const;

  public parameters = {
    type: 'object',
    required: ['processId'],
    properties: {
      processId: {
        type: 'string',
        description: 'L\'identifiant unique du processus à interrompre.'
      }
    }
  };

  public async execute(input: StopProcessInput): Promise<ToolResult> {
    const stopped = processManager.stopProcess(input.processId);
    if (!stopped) {
      return { success: false, error: `Processus introuvable ou déjà arrêté : ${input.processId}` };
    }
    return { success: true, data: { processId: input.processId, status: 'stopped' } };
  }
}
