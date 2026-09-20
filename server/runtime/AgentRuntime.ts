import { AgentEvent } from '../types/events';
import { PermissionEngine } from '../permissions/PermissionEngine';
import { Planner } from './Planner';
import { AgentLoop } from './AgentLoop';
import { ToolContext } from '../tools/types';

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

  public async runTask(prompt: string, preferredProviderId?: string): Promise<void> {
    if (this.isBusy) {
      this.cancelTask();
    }

    this.isBusy = true;
    this.currentAbortController = new AbortController();

    const toolContext: ToolContext = {
      workspacePath: this.workspacePath,
      sessionId: this.sessionId,
      permissionEngine: this.permissionEngine,
      emitEvent: this.emitEvent
    };

    try {
      await this.agentLoop.run(prompt, toolContext, this.planner, {
        preferredProviderId,
        abortSignal: this.currentAbortController.signal
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
  }
}
