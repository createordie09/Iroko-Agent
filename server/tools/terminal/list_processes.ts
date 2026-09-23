import { IrokoTool, ToolResult } from '../types';
import { processManager } from './ProcessManager';

export class ListProcessesTool implements IrokoTool<void> {
  public name = 'list_processes';
  public description = 'Liste tous les processus persistants d\'arrière-plan actuellement gérés par le runtime.';
  public category = 'terminal' as const;
  public permission = 'SAFE' as const;

  public parameters = {
    type: 'object',
    properties: {}
  };

  public async execute(): Promise<ToolResult> {
    const processes = processManager.listProcesses();
    return {
      success: true,
      data: {
        total: processes.length,
        processes
      }
    };
  }
}
