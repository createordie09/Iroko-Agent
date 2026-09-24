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
  description?: string;
}

export interface VerificationCheck {
  name: string;
  command?: string;
  status: 'pending' | 'running' | 'passed' | 'failed' | 'skipped';
  output?: string;
}

export type BaseEvent = {
  sessionId?: string;
  taskId?: string;
  toolCallId?: string;
  timestamp?: string;
};

export type AgentEvent = BaseEvent & (
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
  | { type: 'artifact_created'; artifact: { id: string; name: string; title?: string; mimeType: string; version: number; size: number; metadata?: any } }
  | { type: 'artifact_updated'; artifact: { id: string; name: string; title?: string; mimeType: string; version: number; size: number; metadata?: any } }
  | { type: 'video_job_updated'; job: any }
  | { type: 'context_usage'; usage: { inputTokens: number; outputTokens: number; totalTokens: number; contextWindow: number; isEstimate: boolean; ratio: number } }
  | { type: 'context_summarized'; message: string; usage?: { inputTokens: number; outputTokens: number; totalTokens: number; contextWindow: number; isEstimate: boolean; ratio: number } }
  | { type: 'completed'; summary: string; filesChanged: string[]; thinking?: string; sources?: Array<{ url: string; title: string; domain: string }> }
  | { type: 'error'; message: string; fatal: boolean }
  | { type: 'providers_changed'; providers?: any[]; timestamp?: string }
  | { type: 'catalog_updated'; total?: number; byProvider?: Record<string, number>; timestamp?: string }
  | { type: 'agent_status_changed'; activeConversationIds: string[]; runningCount: number; timestamp?: string; conversationId?: string; status?: string }
  | { type: 'skill_invoked'; skillName: string; format?: string; timestamp?: string }
  | { type: 'skill_fallback'; skillName: string; format?: string; warning?: string; timestamp?: string }
);

export type ClientMessage =
  | { type: 'init_session'; workspacePath?: string }
  | { 
      type: 'send_prompt'; 
      prompt: string; 
      mode?: string; 
      preferredProviderId?: string;
      modelId?: string;
      thinkingLevel?: 'disabled' | 'low' | 'medium' | 'high';
      thinkingBudget?: number;
      conversationId?: string;
      attachmentIds?: string[];
    }
  | { type: 'permission_response'; requestId: string; approved: boolean; scope?: 'once' | 'session' | 'workspace' }
  | { type: 'cancel_task' };
