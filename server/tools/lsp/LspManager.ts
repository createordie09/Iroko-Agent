// server/tools/lsp/LspManager.ts
// Cahier §14 : Language Server Protocol (LSP) - Diagnostics, Définitions, Références et Symboles

import path from 'path';
import fs from 'fs';
import { fork, ChildProcess } from 'child_process';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { ProcessManager, processManager } from '../terminal/ProcessManager';

const nodeRequire = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface LspDiagnostic {
  file: string;
  line: number;
  column: number;
  code: number;
  category: 'error' | 'warning' | 'suggestion' | 'message';
  message: string;
}

export interface LspLocation {
  file: string;
  line: number;
  column: number;
  text?: string;
  isDefinition?: boolean;
  isWriteAccess?: boolean;
}

export interface LspDefinitionResult {
  found: boolean;
  symbol?: string;
  definitions: LspLocation[];
}

export interface LspReferencesResult {
  found: boolean;
  symbol?: string;
  total: number;
  references: LspLocation[];
}

export interface LspDocumentSymbol {
  name: string;
  kind: string;
  containerName?: string;
  line: number;
  column: number;
  file: string;
}

function getWorkerScriptPath(): string {
  const candidates = [
    path.join(__dirname, 'lsp_worker.cjs'),
    path.join(process.cwd(), 'server', 'tools', 'lsp', 'lsp_worker.cjs'),
    path.join(process.cwd(), 'dist-server', 'lsp_worker.cjs')
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0];
}

class LspWorkerProcess {
  public child?: ChildProcess;
  public pid?: number;
  public status: 'idle' | 'starting' | 'ready' | 'stopped' | 'failed' = 'idle';
  public failureReason?: string;
  private pendingRequests: Map<number, {
    resolve: (val: any) => void;
    reject: (err: any) => void;
    timer: NodeJS.Timeout;
  }> = new Map();
  private nextReqId = 1;
  private startupPromise?: Promise<void>;
  private startupTimer?: NodeJS.Timeout;

  constructor(public readonly workspacePath: string) {}

  public async start(): Promise<void> {
    if (this.status === 'ready') return;
    if (this.status === 'starting' && this.startupPromise) return this.startupPromise;

    this.status = 'starting';
    this.startupPromise = new Promise<void>((resolve, reject) => {
      const scriptPath = getWorkerScriptPath();
      if (!fs.existsSync(scriptPath)) {
        this.status = 'failed';
        this.failureReason = `Script de travailleur LSP introuvable : ${scriptPath}`;
        return reject(new Error(this.failureReason));
      }

      // Délai de démarrage maximal de 20 secondes (§14)
      this.startupTimer = setTimeout(() => {
        this.status = 'failed';
        this.failureReason = 'Délai d\'initialisation du serveur de langage dépassé (20 s).';
        this.stop();
        reject(new Error(this.failureReason));
      }, 20000);

      try {
        const child = fork(scriptPath, [this.workspacePath], {
          cwd: this.workspacePath,
          execArgv: [],
          env: ProcessManager.getSanitizedEnv(),
          stdio: ['pipe', 'pipe', 'pipe', 'ipc']
        });

        this.child = child;
        this.pid = child.pid;
        let stderrData = '';

        child.stderr?.on('data', (d) => {
          stderrData += d.toString();
        });

        child.on('message', (msg: any) => {
          if (!msg) return;

          if (msg.type === 'ready') {
            if (this.startupTimer) {
              clearTimeout(this.startupTimer);
              this.startupTimer = undefined;
            }
            this.status = 'ready';
            resolve();
            return;
          }

          if (msg.type === 'init_error') {
            if (this.startupTimer) {
              clearTimeout(this.startupTimer);
              this.startupTimer = undefined;
            }
            this.status = 'failed';
            this.failureReason = msg.error || 'Erreur d\'initialisation du serveur de langage.';
            this.stop();
            reject(new Error(this.failureReason));
            return;
          }

          if (typeof msg.id === 'number') {
            const req = this.pendingRequests.get(msg.id);
            if (req) {
              clearTimeout(req.timer);
              this.pendingRequests.delete(msg.id);
              if (msg.success) {
                req.resolve(msg.data);
              } else {
                req.reject(new Error(msg.error || 'Erreur d\'exécution LSP.'));
              }
            }
          }
        });

        child.on('error', (err) => {
          if (this.status === 'starting') {
            if (this.startupTimer) clearTimeout(this.startupTimer);
            this.status = 'failed';
            this.failureReason = err.message;
            reject(err);
          }
          this.stop();
        });

        child.on('exit', (code) => {
          if (this.status === 'starting') {
            if (this.startupTimer) clearTimeout(this.startupTimer);
            this.status = 'failed';
            this.failureReason = stderrData.trim() || `Le serveur de langage s'est arrêté prématurément avec le code ${code}.`;
            reject(new Error(this.failureReason));
          }
          this.stop();
        });
      } catch (err: any) {
        if (this.startupTimer) clearTimeout(this.startupTimer);
        this.status = 'failed';
        this.failureReason = err.message;
        reject(err);
      }
    });

    return this.startupPromise;
  }

  public async sendRequest<T>(method: string, params?: any): Promise<T> {
    if (this.status !== 'ready') {
      await this.start();
    }

    if (!this.child || !this.child.connected) {
      throw new Error('Le processus serveur de langage n\'est pas connecté.');
    }

    const id = this.nextReqId++;
    return new Promise<T>((resolve, reject) => {
      // Délai maximal par requête de 10 secondes (§14)
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Délai maximal de 10 s dépassé pour la requête LSP "${method}".`));
      }, 10000);

      this.pendingRequests.set(id, { resolve, reject, timer });

      try {
        this.child!.send({ id, method, params });
      } catch (sendErr: any) {
        clearTimeout(timer);
        this.pendingRequests.delete(id);
        reject(sendErr);
      }
    });
  }

  public stop(): void {
    this.status = 'stopped';
    if (this.startupTimer) {
      clearTimeout(this.startupTimer);
      this.startupTimer = undefined;
    }
    for (const [, req] of this.pendingRequests.entries()) {
      clearTimeout(req.timer);
      req.reject(new Error('Serveur de langage TypeScript arrêté.'));
    }
    this.pendingRequests.clear();

    if (this.pid) {
      ProcessManager.killProcessTree(this.pid);
    }

    if (this.child) {
      try {
        this.child.removeAllListeners();
        this.child.disconnect();
      } catch {}
      try {
        this.child.kill();
      } catch {}
      this.child = undefined;
    }
  }
}

export class LspManager {
  private workers: Map<string, LspWorkerProcess> = new Map();
  private registeredShutdown = false;

  constructor() {
    this.registerShutdown();
  }

  private registerShutdown(): void {
    if (this.registeredShutdown) return;
    this.registeredShutdown = true;
    const cleanup = () => this.stop();
    process.on('exit', cleanup);
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  }

  /**
   * Vérifie si le serveur LSP est disponible pour le workspace donné sans installation implicite.
   */
  public isAvailable(workspacePath: string): { available: boolean; reasonDisabled?: string } {
    if (!workspacePath || !fs.existsSync(workspacePath)) {
      return { available: false, reasonDisabled: 'Dossier de workspace introuvable.' };
    }

    const tsconfigPath = path.join(workspacePath, 'tsconfig.json');
    const jsconfigPath = path.join(workspacePath, 'jsconfig.json');
    if (!fs.existsSync(tsconfigPath) && !fs.existsSync(jsconfigPath)) {
      return {
        available: false,
        reasonDisabled: 'Serveur de langage TypeScript indisponible : aucun fichier tsconfig.json ou jsconfig.json détecté dans le workspace.'
      };
    }

    // Vérifier la présence du module TypeScript
    const localTs = path.join(workspacePath, 'node_modules', 'typescript');
    let hasTs = fs.existsSync(localTs);
    if (!hasTs) {
      try {
        nodeRequire.resolve('typescript');
        hasTs = true;
      } catch {
        hasTs = false;
      }
    }

    if (!hasTs) {
      return {
        available: false,
        reasonDisabled: 'Serveur de langage TypeScript indisponible : TypeScript n\'est pas installé (aucune installation implicite autorisée).'
      };
    }

    const canonical = path.resolve(workspacePath);
    const existing = this.workers.get(canonical);
    if (existing && existing.status === 'failed') {
      return {
        available: false,
        reasonDisabled: existing.failureReason || 'Serveur de langage TypeScript indisponible (échec de démarrage précédent).'
      };
    }

    return { available: true };
  }

  private getOrCreateWorker(workspacePath: string): LspWorkerProcess {
    const canonical = path.resolve(workspacePath);
    let worker = this.workers.get(canonical);
    if (!worker || worker.status === 'stopped' || worker.status === 'failed') {
      worker = new LspWorkerProcess(canonical);
      this.workers.set(canonical, worker);
    }
    return worker;
  }

  public getActivePid(workspacePath: string): number | undefined {
    const canonical = path.resolve(workspacePath);
    return this.workers.get(canonical)?.pid;
  }

  public async getDiagnostics(workspacePath: string, targetFile?: string): Promise<LspDiagnostic[]> {
    const avail = this.isAvailable(workspacePath);
    if (!avail.available) {
      throw new Error(avail.reasonDisabled || 'Serveur de langage TypeScript indisponible.');
    }
    const worker = this.getOrCreateWorker(workspacePath);
    return worker.sendRequest<LspDiagnostic[]>('get_diagnostics', { targetFile });
  }

  public async getDefinition(
    workspacePath: string,
    filePath: string,
    line: number,
    column: number
  ): Promise<LspDefinitionResult> {
    const avail = this.isAvailable(workspacePath);
    if (!avail.available) {
      return { found: false, definitions: [] };
    }
    const worker = this.getOrCreateWorker(workspacePath);
    return worker.sendRequest<LspDefinitionResult>('find_definition', { filePath, line, column });
  }

  public async getReferences(
    workspacePath: string,
    filePath: string,
    line: number,
    column: number
  ): Promise<LspReferencesResult> {
    const avail = this.isAvailable(workspacePath);
    if (!avail.available) {
      return { found: false, total: 0, references: [] };
    }
    const worker = this.getOrCreateWorker(workspacePath);
    return worker.sendRequest<LspReferencesResult>('find_references', { filePath, line, column });
  }

  public async getDocumentSymbols(
    workspacePath: string,
    filePath: string
  ): Promise<LspDocumentSymbol[]> {
    const avail = this.isAvailable(workspacePath);
    if (!avail.available) {
      return [];
    }
    const worker = this.getOrCreateWorker(workspacePath);
    return worker.sendRequest<LspDocumentSymbol[]>('get_document_symbols', { filePath });
  }

  /**
   * Arrête proprement le processus du serveur de langage (et tout son arbre de processus).
   */
  public stop(workspacePath?: string): void {
    if (workspacePath) {
      const canonical = path.resolve(workspacePath);
      const worker = this.workers.get(canonical);
      if (worker) {
        worker.stop();
        this.workers.delete(canonical);
      }
    } else {
      for (const [, worker] of this.workers.entries()) {
        worker.stop();
      }
      this.workers.clear();
    }
  }
}

export const lspManager = new LspManager();
