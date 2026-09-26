import { AgentEvent } from '../types/events';
import { AgentRuntime } from './AgentRuntime';
import { runtimeDatabase } from '../storage/RuntimeDatabase';
import { logger } from '../utils/logger';

export interface ActiveJob {
  taskId: string;
  conversationId: string;
  prompt: string;
  mode: 'chat' | 'code';
  status: 'running' | 'completed' | 'failed' | 'interrupted' | 'cancelled';
  streamedText: string;
  thinkingText: string;
  toolExecutions: Array<{
    callId: string;
    tool: string;
    input: any;
    result?: any;
    success?: boolean;
    error?: string;
  }>;
  planSteps: any[];
  assistantMessageId: string;
  runtime: AgentRuntime;
  createdAt: string;
  lastFlushedAt: number;
  flushTimer?: NodeJS.Timeout;
  subscribers: Set<(event: AgentEvent) => void>;
}

export class ActiveJobManager {
  private jobs = new Map<string, ActiveJob>();
  private db: any;

  constructor(db?: any) {
    this.db = db || runtimeDatabase;
  }

  public getActiveJob(conversationId: string): ActiveJob | undefined {
    return this.jobs.get(conversationId);
  }

  public getJobByTaskId(taskId: string): ActiveJob | undefined {
    for (const job of this.jobs.values()) {
      if (job.taskId === taskId) return job;
    }
    return undefined;
  }

  public getAllActiveJobs(): ActiveJob[] {
    return Array.from(this.jobs.values());
  }

  public getRunningCount(): number {
    let count = 0;
    for (const job of this.jobs.values()) {
      if (job.status === 'running') count++;
    }
    return count;
  }

  public registerJob(params: {
    taskId: string;
    conversationId: string;
    prompt: string;
    mode: 'chat' | 'code';
    assistantMessageId: string;
    runtime: AgentRuntime;
    initialSubscriber?: (event: AgentEvent) => void;
  }): ActiveJob {
    // Si un job tournait déjà sur cette conversation, l'interrompre proprement
    const existing = this.jobs.get(params.conversationId);
    if (existing && existing.status === 'running') {
      try {
        existing.runtime.cancelTask();
        this.finishJob(existing, 'interrupted');
      } catch {}
    }

    const subscribers = new Set<(event: AgentEvent) => void>();
    if (params.initialSubscriber) {
      subscribers.add(params.initialSubscriber);
    }

    const job: ActiveJob = {
      taskId: params.taskId,
      conversationId: params.conversationId,
      prompt: params.prompt,
      mode: params.mode,
      status: 'running',
      streamedText: '',
      thinkingText: '',
      toolExecutions: [],
      planSteps: [],
      assistantMessageId: params.assistantMessageId,
      runtime: params.runtime,
      createdAt: new Date().toISOString(),
      lastFlushedAt: Date.now(),
      subscribers
    };

    this.jobs.set(params.conversationId, job);
    return job;
  }

  public subscribe(
    conversationId: string, 
    listener: (event: AgentEvent) => void
  ): { unsubscribe: () => void; job?: ActiveJob } {
    const job = this.jobs.get(conversationId);
    if (!job || job.status !== 'running') {
      return { unsubscribe: () => {}, job: undefined };
    }

    job.subscribers.add(listener);

    // Émettre immédiatement l'état de reprise vers ce nouvel abonné
    const resumeEvent: AgentEvent = {
      type: 'task_resumed' as any,
      taskId: job.taskId,
      sessionId: job.runtime.sessionId,
      timestamp: new Date().toISOString(),
      payload: {
        taskId: job.taskId,
        conversationId: job.conversationId,
        content: job.streamedText,
        thinking: job.thinkingText,
        toolExecutions: job.toolExecutions,
        planSteps: job.planSteps,
        prompt: job.prompt,
        mode: job.mode,
        status: job.status
      }
    };

    try {
      listener(resumeEvent);
    } catch {}

    return {
      unsubscribe: () => {
        job.subscribers.delete(listener);
      },
      job
    };
  }

  public unsubscribe(conversationId: string, listener: (event: AgentEvent) => void): void {
    const job = this.jobs.get(conversationId);
    if (job) {
      job.subscribers.delete(listener);
    }
  }

  public handleEvent(conversationId: string, event: AgentEvent): void {
    const job = this.jobs.get(conversationId);
    if (!job) return;

    // Accumulation continue du flux en mémoire
    if (event.type === 'message' && event.role === 'assistant' && typeof event.content === 'string') {
      job.streamedText += event.content;
      this.scheduleDbFlush(job);
    } else if (event.type === 'thinking' && typeof event.content === 'string') {
      job.thinkingText += event.content;
      this.scheduleDbFlush(job);
    } else if (event.type === 'plan' && Array.isArray((event as any).steps)) {
      job.planSteps = (event as any).steps;
    } else if (event.type === 'tool_call_start') {
      job.toolExecutions.push({
        callId: (event as any).callId,
        tool: (event as any).tool,
        input: (event as any).input
      });
      this.flushJobToDatabase(job, true);
    } else if (event.type === 'tool_call_result') {
      const idx = job.toolExecutions.findIndex(t => t.callId === (event as any).callId);
      if (idx >= 0) {
        job.toolExecutions[idx].result = (event as any).result;
        job.toolExecutions[idx].success = (event as any).success;
        job.toolExecutions[idx].error = (event as any).error;
      }
      this.flushJobToDatabase(job, true);
    } else if (event.type === 'completed') {
      const finalContent = (event as any).summary || job.streamedText;
      job.streamedText = finalContent;
      this.finishJob(job, 'completed', (event as any).sources);
    } else if (event.type === 'error' && (event as any).fatal) {
      this.finishJob(job, 'failed');
    }

    // Diffusion aux abonnés connectés
    for (const sub of job.subscribers) {
      try {
        sub(event);
      } catch (err) {
        logger.warn('Erreur lors de la diffusion d\'événement à un abonné WebSocket', err);
      }
    }
  }

  private scheduleDbFlush(job: ActiveJob): void {
    const now = Date.now();
    // Flush périodique régulé (toutes les 150ms maximum pour éviter les I/O bloquants)
    if (now - job.lastFlushedAt > 150) {
      this.flushJobToDatabase(job);
    } else if (!job.flushTimer) {
      job.flushTimer = setTimeout(() => {
        job.flushTimer = undefined;
        this.flushJobToDatabase(job);
      }, 150);
    }
  }

  public flushJobToDatabase(job: ActiveJob, force = false): void {
    if (job.flushTimer) {
      clearTimeout(job.flushTimer);
      job.flushTimer = undefined;
    }
    job.lastFlushedAt = Date.now();

    try {
      this.db.updateMessageContent(
        job.assistantMessageId,
        job.streamedText,
        job.thinkingText ? [job.thinkingText] : undefined,
        {
          taskId: job.taskId,
          status: job.status === 'running' ? 'generating' : job.status,
          interrupted: job.status !== 'completed',
          canContinue: job.status !== 'completed',
          prompt: job.prompt
        }
      );
    } catch (err) {
      logger.warn('Erreur lors du flush de message en base', err);
    }
  }

  public finishJob(job: ActiveJob, status: ActiveJob['status'], sources?: any[]): void {
    if (job.flushTimer) {
      clearTimeout(job.flushTimer);
      job.flushTimer = undefined;
    }
    job.status = status;

    try {
      const metadata: Record<string, any> = {
        taskId: job.taskId,
        status,
        interrupted: status !== 'completed',
        canContinue: status !== 'completed',
        prompt: job.prompt
      };
      if (sources && sources.length > 0) {
        metadata.sources = sources;
      }

      this.db.updateMessageContent(
        job.assistantMessageId,
        job.streamedText,
        job.thinkingText ? [job.thinkingText] : undefined,
        metadata
      );

      if (status === 'completed') {
        this.db.updateTaskStatus(job.taskId, 'completed');
      } else if (status === 'failed') {
        this.db.updateTaskStatus(job.taskId, 'failed', 'Erreur survenue');
      } else if (status === 'cancelled') {
        this.db.updateTaskStatus(job.taskId, 'cancelled');
      } else if (status === 'interrupted') {
        this.db.updateTaskStatus(job.taskId, 'interrupted', 'Interrompu');
      }
    } catch (err) {
      logger.warn('Erreur lors de la finalisation du job en base', err);
    }

    // Retirer le job après 1 seconde et vider immédiatement les abonnés pour libérer le heap (Mission R5c)
    setTimeout(() => {
      if (this.jobs.get(job.conversationId)?.taskId === job.taskId) {
        job.subscribers.clear();
        this.jobs.delete(job.conversationId);
      }
    }, 1000);

    // Purge de sécurité si trop de jobs résiduels s'accumulent
    if (this.jobs.size > 10) {
      for (const [id, j] of this.jobs.entries()) {
        if (j.status !== 'running') {
          j.subscribers.clear();
          this.jobs.delete(id);
        }
      }
    }
  }

  public cancelJob(conversationId: string): boolean {
    const job = this.jobs.get(conversationId);
    if (!job || job.status !== 'running') return false;

    job.runtime.cancelTask();
    this.finishJob(job, 'cancelled');
    return true;
  }
}

export const activeJobManager = new ActiveJobManager();
