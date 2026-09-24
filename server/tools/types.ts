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
  | 'lsp'
  | 'memory'
  | 'subagent'
  | 'attachments'
  | 'artifacts'
  | 'media'
  | 'skills';

export interface ToolContext {
  workspacePath: string;
  sessionId: string;
  taskId?: string;
  permissionEngine: PermissionEngine;
  emitEvent: (event: AgentEvent) => void;
  abortSignal?: AbortSignal;
  executionMode?: 'execute' | 'plan';
  conversationMode?: 'chat' | 'code';
  conversationId?: string;
  isReadOnly?: boolean;
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
  timeoutMs?: number;
  execute(input: TInput, context: ToolContext): Promise<ToolResult<TOutput>>;
}
