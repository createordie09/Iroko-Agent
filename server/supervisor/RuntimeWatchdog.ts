import { spawn, ChildProcess, execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

export interface RestartEntry {
  timestamp: string;
  exitCode: number | null;
  signal: string | null;
  pid?: number;
  reason: string;
}

export interface WatchdogOptions {
  targetScript: string;
  args?: string[];
  execArgv?: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  dataDir?: string;
  maxRestarts?: number;
  restartWindowMs?: number;
  backoffMs?: number;
  onRestart?: (info: RestartEntry) => void;
  onMaxRestartsExceeded?: (error: Error) => void;
}

export class RuntimeWatchdog {
  private child: ChildProcess | null = null;
  private isStopping = false;
  private restarts: RestartEntry[] = [];
  public readonly dataDir: string;
  public readonly targetScript: string;
  public readonly maxRestarts: number;
  public readonly restartWindowMs: number;
  public readonly backoffMs: number;
  private readonly options: WatchdogOptions;
  private maxRestartsTriggered = false;

  constructor(options: WatchdogOptions) {
    this.options = options;
    this.targetScript = options.targetScript;
    this.maxRestarts = options.maxRestarts ?? 5;
    this.restartWindowMs = options.restartWindowMs ?? 60000;
    this.backoffMs = options.backoffMs ?? 200;

    const realDataDir = process.platform === 'win32' && process.env.APPDATA
      ? path.join(process.env.APPDATA, 'iroko')
      : path.join(os.homedir(), '.iroko');

    this.dataDir = options.dataDir || process.env.IROKO_DATA_DIR || realDataDir;
    this.restarts = this.loadRestartsFromDisk();
  }

  private getJournalPath(): string {
    return path.join(this.dataDir, 'watchdog_restarts.json');
  }

  public loadRestartsFromDisk(): RestartEntry[] {
    const journalPath = this.getJournalPath();
    if (fs.existsSync(journalPath)) {
      try {
        const raw = fs.readFileSync(journalPath, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      } catch {}
    }
    return [];
  }

  public saveRestartsToDisk(): void {
    try {
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }
      const journalPath = this.getJournalPath();
      fs.writeFileSync(journalPath, JSON.stringify(this.restarts, null, 2), 'utf8');
    } catch (err) {
      console.warn('Impossible de sauvegarder le journal des redémarrages :', err);
    }
  }

  public clearRestarts(): void {
    this.restarts = [];
    try {
      const journalPath = this.getJournalPath();
      if (fs.existsSync(journalPath)) {
        fs.unlinkSync(journalPath);
      }
    } catch {}
  }

  public getRestarts(): RestartEntry[] {
    return [...this.restarts];
  }

  public getChild(): ChildProcess | null {
    return this.child;
  }

  public isSupervising(): boolean {
    return !this.isStopping && !this.maxRestartsTriggered;
  }

  public async start(): Promise<ChildProcess> {
    this.isStopping = false;
    this.maxRestartsTriggered = false;
    return this.spawnChild();
  }

  private spawnChild(): ChildProcess {
    const nodeExecutable = process.execPath;
    const execArgv = this.options.execArgv || [];
    const scriptArgs = this.options.args || [];
    const spawnArgs = [...execArgv, this.targetScript, ...scriptArgs];

    const child = spawn(nodeExecutable, spawnArgs, {
      cwd: this.options.cwd || process.cwd(),
      env: {
        ...process.env,
        ...this.options.env,
        IROKO_SUPERVISED: '1',
        IROKO_DATA_DIR: this.dataDir
      },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    this.child = child;

    child.stdout?.pipe(process.stdout, { end: false });
    child.stderr?.pipe(process.stderr, { end: false });

    child.on('exit', (code, signal) => {
      this.handleChildExit(code, signal, child.pid);
    });

    return child;
  }

  private handleChildExit(code: number | null, signal: string | null, pid?: number): void {
    // Si l'arrêt était intentionnel ou si le processus s'est terminé avec succès sans signal
    if (this.isStopping || (code === 0 && !signal)) {
      this.child = null;
      return;
    }

    const now = Date.now();
    const entry: RestartEntry = {
      timestamp: new Date().toISOString(),
      exitCode: code,
      signal,
      pid,
      reason: signal
        ? `Processus interrompu par signal ${signal}`
        : `Sortie anormale avec code ${code ?? 'inconnu'}`
    };

    this.restarts.push(entry);
    this.saveRestartsToDisk();

    if (this.options.onRestart) {
      try {
        this.options.onRestart(entry);
      } catch {}
    }

    // Calcul des redémarrages récents sur la fenêtre glissante
    const recent = this.restarts.filter(
      (r) => now - new Date(r.timestamp).getTime() <= this.restartWindowMs
    );

    if (recent.length >= this.maxRestarts) {
      this.maxRestartsTriggered = true;
      this.isStopping = true;
      this.child = null;

      const errorMsg = `[SUPERVISEUR RUNTIME] Limite de ${this.maxRestarts} redémarrages en ${Math.round(
        this.restartWindowMs / 1000
      )}s atteinte. Arrêt du superviseur pour prévenir une boucle infinie.`;
      console.error(errorMsg);

      const limitError = new Error(errorMsg);
      if (this.options.onMaxRestartsExceeded) {
        try {
          this.options.onMaxRestartsExceeded(limitError);
        } catch {}
      }
      return;
    }

    // Redémarrage automatique après délai d'attente sobre
    setTimeout(() => {
      if (!this.isStopping && !this.maxRestartsTriggered) {
        this.spawnChild();
      }
    }, this.backoffMs);
  }

  public async stop(): Promise<void> {
    this.isStopping = true;
    if (this.child && this.child.pid) {
      const pid = this.child.pid;
      if (process.platform === 'win32') {
        try {
          execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' });
        } catch {}
      } else {
        try {
          process.kill(-pid, 'SIGKILL');
        } catch {
          try {
            this.child.kill('SIGKILL');
          } catch {}
        }
      }
      this.child = null;
    }
  }

  public static getRestartsFromDisk(dataDir?: string): RestartEntry[] {
    const realDataDir = process.platform === 'win32' && process.env.APPDATA
      ? path.join(process.env.APPDATA, 'iroko')
      : path.join(os.homedir(), '.iroko');
    const resolvedDir = dataDir || process.env.IROKO_DATA_DIR || realDataDir;
    const journalPath = path.join(resolvedDir, 'watchdog_restarts.json');
    if (fs.existsSync(journalPath)) {
      try {
        const raw = fs.readFileSync(journalPath, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      } catch {}
    }
    return [];
  }
}
