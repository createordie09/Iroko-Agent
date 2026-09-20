import { spawn, ChildProcess } from 'child_process';
import crypto from 'crypto';

export interface CommandExecutionResult {
  command: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
}

export interface ManagedProcess {
  id: string;
  command: string;
  startTime: number;
  child: ChildProcess;
  logs: string[];
  status: 'running' | 'stopped' | 'failed';
  exitCode: number | null;
}

export class ProcessManager {
  private activeProcesses: Map<string, ManagedProcess> = new Map();
  private maxLogEntries = 1000;

  private getShell(): { shell: string; args: string[] } {
    if (process.platform === 'win32') {
      return { shell: 'powershell.exe', args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command'] };
    }
    return { shell: '/bin/bash', args: ['-c'] };
  }

  /**
   * Exécute une commande shell synchrone avec un timeout défini
   */
  public async executeCommand(
    command: string,
    cwd: string,
    timeoutMs = 60000,
    onOutputChunk?: (chunk: string) => void
  ): Promise<CommandExecutionResult> {
    const { shell, args } = this.getShell();
    const startTime = Date.now();

    return new Promise<CommandExecutionResult>((resolve) => {
      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const child = spawn(shell, [...args, command], {
        cwd,
        windowsHide: true,
        env: { ...process.env, CI: 'true', PAGER: 'cat' }
      });

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, timeoutMs);

      child.stdout?.on('data', (data: Buffer) => {
        const text = data.toString();
        stdout += text;
        onOutputChunk?.(text);
      });

      child.stderr?.on('data', (data: Buffer) => {
        const text = data.toString();
        stderr += text;
        onOutputChunk?.(text);
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({
          command,
          exitCode: code,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          durationMs: Date.now() - startTime,
          timedOut
        });
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        resolve({
          command,
          exitCode: 1,
          stdout: '',
          stderr: err.message,
          durationMs: Date.now() - startTime,
          timedOut: false
        });
      });
    });
  }

  /**
   * Lance un processus persistant d'arrière-plan (ex: serveur de dev, watcher)
   */
  public startBackgroundProcess(command: string, cwd: string): ManagedProcess {
    const id = crypto.randomUUID();
    const { shell, args } = this.getShell();

    const child = spawn(shell, [...args, command], {
      cwd,
      windowsHide: true,
      env: { ...process.env, PAGER: 'cat' }
    });

    const managed: ManagedProcess = {
      id,
      command,
      startTime: Date.now(),
      child,
      logs: [],
      status: 'running',
      exitCode: null
    };

    const appendLog = (prefix: string, data: Buffer) => {
      const line = `[${prefix}] ${data.toString()}`;
      managed.logs.push(line);
      if (managed.logs.length > this.maxLogEntries) {
        managed.logs.shift();
      }
    };

    child.stdout?.on('data', (data: Buffer) => appendLog('OUT', data));
    child.stderr?.on('data', (data: Buffer) => appendLog('ERR', data));

    child.on('close', (code) => {
      managed.status = code === 0 ? 'stopped' : 'failed';
      managed.exitCode = code;
    });

    this.activeProcesses.set(id, managed);
    return managed;
  }

  public stopProcess(id: string): boolean {
    const proc = this.activeProcesses.get(id);
    if (!proc || proc.status !== 'running') return false;

    proc.child.kill();
    proc.status = 'stopped';
    return true;
  }

  public getProcess(id: string): ManagedProcess | undefined {
    return this.activeProcesses.get(id);
  }

  public listProcesses(): Array<{ id: string; command: string; status: string; uptimeMs: number }> {
    return Array.from(this.activeProcesses.values()).map(p => ({
      id: p.id,
      command: p.command,
      status: p.status,
      uptimeMs: Date.now() - p.startTime
    }));
  }

  public getLogs(id: string, maxLines = 100): string[] {
    const proc = this.activeProcesses.get(id);
    if (!proc) return [];
    return proc.logs.slice(-maxLines);
  }

  public cleanup(): void {
    for (const proc of this.activeProcesses.values()) {
      if (proc.status === 'running') {
        try {
          proc.child.kill();
        } catch {}
      }
    }
    this.activeProcesses.clear();
  }
}

export const processManager = new ProcessManager();
