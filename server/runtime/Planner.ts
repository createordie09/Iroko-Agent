import crypto from 'crypto';
import { PlanStep, AgentEvent } from '../types/events';

export class Planner {
  private steps: PlanStep[] = [];

  constructor(private emitEvent: (event: AgentEvent) => void) {}

  public setPlan(stepTitles: string[]): PlanStep[] {
    this.steps = stepTitles.map(title => ({
      id: crypto.randomUUID(),
      title,
      status: 'pending' as const
    }));

    if (this.steps.length > 0) {
      this.steps[0].status = 'in_progress';
    }

    this.notify();
    return this.steps;
  }

  public updateStepStatus(stepIndex: number, status: 'pending' | 'in_progress' | 'completed' | 'failed', details?: string): void {
    if (this.steps[stepIndex]) {
      this.steps[stepIndex].status = status;
      if (details) {
        this.steps[stepIndex].details = details;
      }
      this.notify();
    }
  }

  public markNextInProgress(): void {
    const nextPending = this.steps.find(s => s.status === 'pending');
    if (nextPending) {
      nextPending.status = 'in_progress';
      this.notify();
    }
  }

  public getSteps(): PlanStep[] {
    return this.steps;
  }

  public clear(): void {
    this.steps = [];
    this.notify();
  }

  private notify(): void {
    this.emitEvent({
      type: 'plan',
      steps: [...this.steps]
    });
  }
}
