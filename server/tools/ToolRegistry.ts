import crypto from 'crypto';
import { IrokoTool, ToolContext, ToolResult } from './types';
import { ToolDefinition } from '../models/types';
import { ListDirTool } from './filesystem/list_dir';
import { ReadFileTool } from './filesystem/read_file';
import { SearchTextTool } from './filesystem/search_text';
import { EditFileTool } from './filesystem/edit_file';
import { WriteFileTool } from './filesystem/write_file';
import { ExecuteCommandTool } from './terminal/execute_command';
import { StartProcessTool } from './terminal/start_process';
import { StopProcessTool } from './terminal/stop_process';
import { GetProcessOutputTool } from './terminal/get_process_output';
import { GitStatusTool } from './git/git_status';
import { GitDiffTool } from './git/git_diff';
import { GitLogTool } from './git/git_log';
import { GitCommitTool } from './git/git_commit';
import { GitBranchTool } from './git/git_branch';
import { VerifyProjectTool } from './testing/verify_project';
import { GetDiagnosticsTool } from './lsp/get_diagnostics';

export class ToolRegistry {
  private tools: Map<string, IrokoTool> = new Map();

  constructor() {
    // Outils Filesystem
    this.register(new ListDirTool());
    this.register(new ReadFileTool());
    this.register(new SearchTextTool());
    this.register(new EditFileTool());
    this.register(new WriteFileTool());

    // Outils Terminal & Process
    this.register(new ExecuteCommandTool());
    this.register(new StartProcessTool());
    this.register(new StopProcessTool());
    this.register(new GetProcessOutputTool());

    // Outils Git
    this.register(new GitStatusTool());
    this.register(new GitDiffTool());
    this.register(new GitLogTool());
    this.register(new GitCommitTool());
    this.register(new GitBranchTool());

    // Outils Testing & Verification
    this.register(new VerifyProjectTool());

    // Outils LSP & Intelligence de code
    this.register(new GetDiagnosticsTool());
  }

  public register(tool: IrokoTool): void {
    this.tools.set(tool.name, tool);
  }

  public getTool(name: string): IrokoTool | undefined {
    return this.tools.get(name);
  }

  public getAllTools(): IrokoTool[] {
    return Array.from(this.tools.values());
  }

  public getDefinitionsForModel(): ToolDefinition[] {
    return this.getAllTools().map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters
    }));
  }

  public async executeTool(
    name: string,
    input: unknown,
    context: ToolContext,
    callId?: string
  ): Promise<ToolResult> {
    const id = callId || crypto.randomUUID();
    const tool = this.getTool(name);

    context.emitEvent({
      type: 'tool_call_start',
      callId: id,
      tool: name,
      input
    });

    if (!tool) {
      const result: ToolResult = {
        success: false,
        error: `Outil inconnu dans le ToolRegistry : "${name}"`
      };
      context.emitEvent({
        type: 'tool_call_result',
        callId: id,
        tool: name,
        success: false,
        result: null,
        error: result.error
      });
      return result;
    }

    try {
      console.log(`[ToolRegistry] Exécution de "${name}"...`);
      const result = await tool.execute(input, context);

      context.emitEvent({
        type: 'tool_call_result',
        callId: id,
        tool: name,
        success: result.success,
        result: result.data,
        error: result.error
      });

      return result;
    } catch (err: any) {
      console.error(`[ToolRegistry] Erreur lors de l'exécution de "${name}" :`, err);
      const result: ToolResult = {
        success: false,
        error: err.message || `Erreur non gérée lors de l'exécution de ${name}`
      };
      context.emitEvent({
        type: 'tool_call_result',
        callId: id,
        tool: name,
        success: false,
        result: null,
        error: result.error
      });
      return result;
    }
  }
}

export const toolRegistry = new ToolRegistry();
