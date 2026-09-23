export function maskSecrets(input: string): string {
  if (!input || typeof input !== 'string') return input;
  return input
    // Masquer les tokens Bearer
    .replace(/Bearer\s+[A-Za-z0-9_\-\.]{8,}/gi, 'Bearer [MASQUÉ]')
    // Masquer les clés type sk-...
    .replace(/sk-[A-Za-z0-9_\-]{8,}/gi, 'sk-[MASQUÉ]')
    // Masquer les tickets WebSocket
    .replace(/ticket[=\:\"\'\s]+[A-Za-z0-9_\-]{16,}/gi, 'ticket=[MASQUÉ]')
    // Masquer les champs JSON key / token / secret / password
    .replace(/\"(key|token|secret|password|ticket)\"\s*:\s*\"[^\"]+\"/gi, '"$1":"[MASQUÉ]"');
}

export interface LogContext {
  sessionId?: string;
  taskId?: string;
  toolCallId?: string;
  [key: string]: any;
}

export class StructuredLogger {
  private formatLog(level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG', message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString();
    const safeMsg = maskSecrets(message);
    const safeContext = context ? JSON.parse(maskSecrets(JSON.stringify(context))) : {};

    const parts = [
      `[${timestamp}]`,
      `[${level}]`,
      context?.sessionId ? `[session:${context.sessionId.slice(0, 8)}]` : '',
      context?.taskId ? `[task:${context.taskId.slice(0, 8)}]` : '',
      context?.toolCallId ? `[tool:${context.toolCallId.slice(0, 8)}]` : '',
      safeMsg
    ].filter(Boolean);

    const extra = Object.keys(safeContext).filter(k => !['sessionId', 'taskId', 'toolCallId'].includes(k));
    if (extra.length > 0) {
      const extraObj: Record<string, any> = {};
      for (const k of extra) extraObj[k] = safeContext[k];
      return `${parts.join(' ')} ${JSON.stringify(extraObj)}`;
    }

    return parts.join(' ');
  }

  public info(message: string, context?: LogContext): void {
    console.log(this.formatLog('INFO', message, context));
  }

  public warn(message: string, context?: LogContext): void {
    console.warn(this.formatLog('WARN', message, context));
  }

  public error(message: string, error?: any, context?: LogContext): void {
    const errStr = error instanceof Error ? `${error.message}\n${error.stack}` : (error ? String(error) : '');
    const combined = errStr ? `${message} - ${errStr}` : message;
    console.error(this.formatLog('ERROR', combined, context));
  }

  public debug(message: string, context?: LogContext): void {
    if (process.env.DEBUG === 'true') {
      console.log(this.formatLog('DEBUG', message, context));
    }
  }
}

export const logger = new StructuredLogger();
