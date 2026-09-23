import { spawn, spawnSync, ChildProcess } from 'child_process';
import crypto from 'crypto';
import { PermissionStore } from '../../permissions/PermissionStore';

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
  portConflict?: boolean;
  portConflictMessage?: string;
}

export class ProcessManager {
  private activeProcesses: Map<string, ManagedProcess> = new Map();
  private trackedPids: Set<number> = new Set();
  private maxLogEntries = 1000;
  private registeredShutdown = false;

  public static readonly PORT_CONFLICT_REGEX = /(?:EADDRINUSE|address already in use|port \d+ is already in use)/i;

  constructor() {
    this.registerShutdownHooks();
  }

  private registerShutdownHooks(): void {
    if (this.registeredShutdown) return;
    this.registeredShutdown = true;

    const onExit = () => this.cleanup();
    process.on('SIGINT', onExit);
    process.on('SIGTERM', onExit);
    process.on('exit', onExit);
    process.on('beforeExit', onExit);
  }

  private getShell(): { shell: string; args: string[] } {
    if (process.platform === 'win32') {
      return { shell: 'powershell.exe', args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command'] };
    }
    return { shell: '/bin/bash', args: ['-c'] };
  }

  /**
   * Construit un environnement assaini basé sur une liste blanche stricte
   * sans aucune fuite de clés API, jetons ou variables IROKO_*.
   */
  public static getSanitizedEnv(customEnv?: Record<string, string>): NodeJS.ProcessEnv {
    const isWindows = process.platform === 'win32';
    const whitelist = isWindows
      ? [
          'PATH', 'PATHEXT', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP',
          'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'APPDATA', 'LOCALAPPDATA',
          'COMSPEC', 'LANG', 'LC_ALL', 'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE',
          'OS', 'SYSTEMDRIVE'
        ]
      : [
          'PATH', 'HOME', 'USER', 'SHELL', 'LANG', 'LC_ALL',
          'TEMP', 'TMP', 'TERM'
        ];

    const isDenied = (key: string): boolean => {
      return /key|token|secret|auth|pass|credential|^iroko_/i.test(key);
    };

    const sanitized: NodeJS.ProcessEnv = {};

    // 1. Filtrer process.env selon la liste blanche et la liste noire
    for (const key of Object.keys(process.env)) {
      const upperKey = key.toUpperCase();
      if (whitelist.includes(upperKey) && !isDenied(key)) {
        sanitized[key] = process.env[key];
      }
    }

    // 2. Fusionner customEnv s'il est fourni (en appliquant la liste noire)
    if (customEnv) {
      for (const [k, v] of Object.entries(customEnv)) {
        if (!isDenied(k)) {
          sanitized[k] = v;
        }
      }
    }

    // 3. Variables forcées standards
    sanitized.CI = 'true';
    sanitized.PAGER = 'cat';
    sanitized.FORCE_COLOR = '0';
    sanitized.NO_COLOR = '1';

    return sanitized;
  }

  /**
   * Supprime les séquences d'échappement ANSI.
   */
  public static stripAnsi(text: string): string {
    const ANSI_REGEX = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;
    return text.replace(ANSI_REGEX, '');
  }

  /**
   * Formate la sortie : suppression ANSI, caviardage de secrets et plafonnement à 500 Ko.
   */
  public static formatOutput(raw: string, maxBytes = 500 * 1024): string {
    const cleaned = ProcessManager.stripAnsi(raw);
    const redacted = PermissionStore.getInstance().redactSecrets(cleaned);
    const byteLen = Buffer.byteLength(redacted, 'utf-8');

    if (byteLen > maxBytes) {
      const head = redacted.slice(0, 200 * 1024);
      const tail = redacted.slice(-300 * 1024);
      return `${head}\n\n[Sortie tronquée : limite de 500 Ko atteinte]\n\n${tail}`;
    }
    return redacted;
  }

  /**
   * Détruit récursivement l'ensemble de l'arbre de processus.
   */
  public static killProcessTree(pid: number): void {
    if (!pid || pid <= 0) return;

    if (process.platform === 'win32') {
      try {
        spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], {
          windowsHide: true,
          stdio: 'ignore'
        });
      } catch {}
    } else {
      try {
        process.kill(-pid, 'SIGKILL');
      } catch {
        try {
          process.kill(pid, 'SIGKILL');
        } catch {}
      }
    }
  }

  /**
   * Exécute une commande shell synchrone avec un timeout défini
   */
  public async executeCommand(
    command: string,
    cwd: string,
    timeoutMs = 60000,
    onOutputChunk?: (chunk: string) => void,
    abortSignal?: AbortSignal
  ): Promise<CommandExecutionResult> {
    const { shell, args } = this.getShell();
    const startTime = Date.now();

    if (abortSignal?.aborted) {
      return {
        command,
        exitCode: 130,
        stdout: '',
        stderr: 'Commande annulée par l\'utilisateur.',
        durationMs: 0,
        timedOut: false
      };
    }

    return new Promise<CommandExecutionResult>((resolve) => {
      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const child = spawn(shell, [...args, command], {
        cwd,
        windowsHide: true,
        detached: process.platform !== 'win32',
        env: ProcessManager.getSanitizedEnv()
      });

      if (child.pid) {
        this.trackedPids.add(child.pid);
      }

      const timer = setTimeout(() => {
        timedOut = true;
        if (child.pid) {
          ProcessManager.killProcessTree(child.pid);
        }
        try { child.kill(); } catch {}
      }, timeoutMs);

      const onAbort = () => {
        clearTimeout(timer);
        if (child.pid) {
          ProcessManager.killProcessTree(child.pid);
        }
        try { child.kill(); } catch {}
        resolve({
          command,
          exitCode: 130,
          stdout: ProcessManager.formatOutput(stdout.trim()),
          stderr: 'Commande interrompue par l\'utilisateur.',
          durationMs: Date.now() - startTime,
          timedOut: false
        });
      };

      if (abortSignal) {
        abortSignal.addEventListener('abort', onAbort, { once: true });
      }

      const cleanup = () => {
        clearTimeout(timer);
        if (abortSignal) {
          abortSignal.removeEventListener('abort', onAbort);
        }
        if (child.pid) {
          this.trackedPids.delete(child.pid);
        }
      };

      child.stdout?.on('data', (data: Buffer) => {
        const text = data.toString();
        stdout += text;
        const cleaned = ProcessManager.stripAnsi(text);
        const redacted = PermissionStore.getInstance().redactSecrets(cleaned);
        onOutputChunk?.(redacted);
      });

      child.stderr?.on('data', (data: Buffer) => {
        const text = data.toString();
        stderr += text;
        const cleaned = ProcessManager.stripAnsi(text);
        const redacted = PermissionStore.getInstance().redactSecrets(cleaned);
        onOutputChunk?.(redacted);
      });

      child.on('close', (code) => {
        cleanup();
        resolve({
          command,
          exitCode: code,
          stdout: ProcessManager.formatOutput(stdout.trim()),
          stderr: ProcessManager.formatOutput(stderr.trim()),
          durationMs: Date.now() - startTime,
          timedOut
        });
      });

      child.on('error', (err) => {
        cleanup();
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
      detached: process.platform !== 'win32',
      env: ProcessManager.getSanitizedEnv()
    });

    if (child.pid) {
      this.trackedPids.add(child.pid);
    }

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
      const rawText = data.toString();
      const cleaned = ProcessManager.stripAnsi(rawText);
      const redacted = PermissionStore.getInstance().redactSecrets(cleaned);

      if (ProcessManager.PORT_CONFLICT_REGEX.test(cleaned)) {
        managed.portConflict = true;
        managed.portConflictMessage = `Conflit de port détecté : l'adresse ou le port est déjà utilisé ou occupé.`;
      }

      const line = `[${prefix}] ${redacted}`;
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
      if (child.pid) {
        this.trackedPids.delete(child.pid);
      }
    });

    child.on('error', () => {
      managed.status = 'failed';
      if (child.pid) {
        this.trackedPids.delete(child.pid);
      }
    });

    this.activeProcesses.set(id, managed);
    return managed;
  }

  public stopProcess(id: string): boolean {
    const proc = this.activeProcesses.get(id);
    if (!proc || proc.status !== 'running') return false;

    if (proc.child.pid) {
      ProcessManager.killProcessTree(proc.child.pid);
      this.trackedPids.delete(proc.child.pid);
    }
    try {
      proc.child.kill();
    } catch {}

    proc.status = 'stopped';
    return true;
  }

  public getProcess(id: string): ManagedProcess | undefined {
    return this.activeProcesses.get(id);
  }

  public listProcesses(): Array<{
    id: string;
    command: string;
    status: string;
    uptimeMs: number;
    exitCode: number | null;
    portConflict?: boolean;
    portConflictMessage?: string;
  }> {
    return Array.from(this.activeProcesses.values()).map(p => ({
      id: p.id,
      command: p.command,
      status: p.status,
      uptimeMs: Date.now() - p.startTime,
      exitCode: p.exitCode,
      portConflict: p.portConflict,
      portConflictMessage: p.portConflictMessage
    }));
  }

  public getLogs(id: string, maxLines = 100): string[] {
    const proc = this.activeProcesses.get(id);
    if (!proc) return [];
    return proc.logs.slice(-maxLines);
  }

  public terminateAll(): void {
    this.cleanup();
  }

  public cleanup(): void {
    for (const proc of this.activeProcesses.values()) {
      if (proc.status === 'running') {
        if (proc.child.pid) {
          ProcessManager.killProcessTree(proc.child.pid);
        }
        try {
          proc.child.kill();
        } catch {}
        proc.status = 'stopped';
      }
    }
    for (const pid of this.trackedPids) {
      ProcessManager.killProcessTree(pid);
    }
    this.activeProcesses.clear();
    this.trackedPids.clear();
  }
}

export const processManager = new ProcessManager();
