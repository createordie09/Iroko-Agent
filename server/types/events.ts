export type AgentStatus = 
  | 'idle' 
  | 'thinking' 
  | 'planning' 
  | 'executing_tool' 
  | 'awaiting_permission' 
  | 'verifying' 
  | 'completed' 
  | 'error';

export type PermissionLevel = 'SAFE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface PermissionRequest {
  id: string;
  tool: string;
  level: PermissionLevel;
  description: string;
  details?: Record<string, any>;
  timestamp: number;
}

export interface PlanStep {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  details?: string;
}

export interface VerificationCheck {
  name: string;
  command?: string;
  status: 'pending' | 'running' | 'passed' | 'failed';
  output?: string;
}

export type AgentEvent =
  | { type: 'connected'; sessionId: string; workspacePath: string }
  | { type: 'status'; status: AgentStatus; message?: string }
  | { type: 'thinking'; content: string }
  | { type: 'plan'; steps: PlanStep[] }
  | { type: 'tool_call_start'; callId: string; tool: string; input: unknown }
  | { type: 'tool_call_result'; callId: string; tool: string; success: boolean; result: unknown; error?: string }
  | { type: 'permission_required'; request: PermissionRequest }
  | { type: 'file_changed'; path: string; diff?: string; action: 'create' | 'modify' | 'delete' }
  | { type: 'verification_step'; check: VerificationCheck }
  | { type: 'message'; role: 'assistant'; content: string; partial?: boolean }
  | { type: 'completed'; summary: string; filesChanged: string[] }
  | { type: 'error'; message: string; fatal: boolean };

export type ClientMessage =
  | { type: 'init_session'; workspacePath?: string }
  | { type: 'send_prompt'; prompt: string; mode?: string }
  | { type: 'permission_response'; requestId: string; approved: boolean; scope?: 'once' | 'session' | 'workspace' }
  | { type: 'cancel_task' };
