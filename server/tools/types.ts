import { PermissionLevel, AgentEvent } from '../types/events';
import { PermissionEngine } from '../permissions/PermissionEngine';

export type ToolCategory = 
  | 'filesystem' 
  | 'terminal' 
  | 'git' 
  | 'search' 
  | 'testing' 
  | 'browser' 
  | 'mcp' 
  | 'lsp';

export interface ToolContext {
  workspacePath: string;
  sessionId: string;
  permissionEngine: PermissionEngine;
  emitEvent: (event: AgentEvent) => void;
}

export interface ToolResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  diff?: string;
}

export interface IrokoTool<TInput = any, TOutput = any> {
  name: string;
  description: string;
  category: ToolCategory;
  parameters: Record<string, any>; // JSON Schema
  permission: PermissionLevel;
  execute(input: TInput, context: ToolContext): Promise<ToolResult<TOutput>>;
}
