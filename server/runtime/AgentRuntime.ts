import { AgentEvent } from '../types/events';
import { PermissionEngine } from '../permissions/PermissionEngine';
import { Planner } from './Planner';
import { AgentLoop } from './AgentLoop';
import { ToolContext } from '../tools/types';
import { workspaceLockManager } from '../workspace/WorkspaceLockManager';

export interface RunTaskOptions {
  taskId?: string;
  preferredProviderId?: string;
  modelId?: string;
  thinkingLevel?: 'disabled' | 'low' | 'medium' | 'high';
  thinkingBudget?: number;
  conversationId?: string;
  conversationMode?: 'chat' | 'code';
  executionMode?: 'execute' | 'plan';
  resumeFromCheckpoint?: boolean;
  attachmentIds?: string[];
}

export class AgentRuntime {
  private planner: Planner;
  private agentLoop: AgentLoop;
  private currentAbortController: AbortController | null = null;
  private isBusy = false;

  constructor(
    public readonly sessionId: string,
    public workspacePath: string,
    public readonly permissionEngine: PermissionEngine,
    private emitEvent: (event: AgentEvent) => void
  ) {
    this.planner = new Planner(emitEvent);
    this.agentLoop = new AgentLoop();
  }

  public isRunning(): boolean {
    return this.isBusy;
  }

  public async runTask(prompt: string, options: RunTaskOptions = {}): Promise<void> {
    if (this.isBusy) {
      this.cancelTask();
    }

    this.isBusy = true;
    this.currentAbortController = new AbortController();

    const toolContext: ToolContext = {
      workspacePath: this.workspacePath,
      sessionId: this.sessionId,
      taskId: options.taskId,
      permissionEngine: this.permissionEngine,
      emitEvent: this.emitEvent,
      abortSignal: this.currentAbortController.signal,
      executionMode: options.executionMode || 'execute',
      conversationMode: options.conversationMode || 'chat',
      conversationId: options.conversationId,
      isReadOnly: options.conversationId ? workspaceLockManager.isReadOnly(this.workspacePath, options.conversationId) : false
    };

    try {
      await this.agentLoop.run(prompt, toolContext, this.planner, {
        preferredProviderId: options.preferredProviderId,
        modelId: options.modelId,
        abortSignal: this.currentAbortController.signal,
        thinkingLevel: options.thinkingLevel,
        thinkingBudget: options.thinkingBudget,
        conversationId: options.conversationId,
        conversationMode: options.conversationMode || 'chat',
        executionMode: options.executionMode,
        resumeFromCheckpoint: options.resumeFromCheckpoint,
        attachmentIds: options.attachmentIds
      });
    } finally {
      this.isBusy = false;
      this.currentAbortController = null;
    }
  }

  public cancelTask(): void {
    if (this.currentAbortController) {
      this.currentAbortController.abort();
      this.currentAbortController = null;
    }
    this.permissionEngine.clear();
    this.isBusy = false;
    this.emitEvent({
      type: 'status',
      status: 'idle',
      message: 'Tâche interrompue par l\'utilisateur.'
    });
  }
}
