import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { PermissionLevel } from '../types/events';

export type PermissionScope = 'once' | 'session' | 'project' | 'workspace' | 'reject';
export type PermissionMode = 'ask' | 'auto_edit' | 'read_only';

export interface ProjectPermissionRule {
  id: string;
  projectHash: string;
  canonicalWorkspace: string;
  tool: string;
  pattern: string; // ex: "npm test", "git status", "edit_file:src/*"
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  tool: string;
  description: string;
  level: PermissionLevel;
  approved: boolean;
  scope: PermissionScope;
  canonicalWorkspace: string;
  commandOrPath?: string;
  fingerprint: string;
}

export class PermissionStore {
  private static instance: PermissionStore | null = null;
  public readonly dataDir: string;
  public readonly permissionsDir: string;
  public readonly logsDir: string;
  public readonly auditLogPath: string;
  public readonly settingsPath: string;
  private readonly maxLogSizeBytes = 5 * 1024 * 1024; // 5 Mo

  constructor(customDataDir?: string) {
    this.dataDir = customDataDir || process.env.IROKO_DATA_DIR || (
      process.platform === 'win32' && process.env.APPDATA
        ? path.join(process.env.APPDATA, 'iroko')
        : path.join(os.homedir(), '.iroko')
    );
    this.permissionsDir = path.join(this.dataDir, 'permissions');
    this.logsDir = path.join(this.dataDir, 'logs');
    this.auditLogPath = path.join(this.logsDir, 'audit.log');
    this.settingsPath = path.join(this.dataDir, 'permission_settings.json');

    this.ensureDirectories();
  }

  public static getInstance(): PermissionStore {
    if (!PermissionStore.instance) {
      PermissionStore.instance = new PermissionStore();
    }
    return PermissionStore.instance;
  }

  private ensureDirectories(): void {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
    if (!fs.existsSync(this.permissionsDir)) {
      fs.mkdirSync(this.permissionsDir, { recursive: true });
    }
    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true });
    }
  }

  /**
   * Vérifie si un chemin cible se trouve dans le répertoire de données du runtime
   * ou dans le répertoire des clés de sécurité.
   */
  public static isRuntimeDataPath(targetPath: string): boolean {
    const dataDir = process.env.IROKO_DATA_DIR || (
      process.platform === 'win32' && process.env.APPDATA
        ? path.join(process.env.APPDATA, 'iroko')
        : path.join(os.homedir(), '.iroko')
    );
    const securityDir = path.join(os.homedir(), '.iroko_security');

    try {
      const resolvedTarget = path.resolve(targetPath).toLowerCase();
      const resolvedData = path.resolve(dataDir).toLowerCase();
      const resolvedSec = path.resolve(securityDir).toLowerCase();

      return resolvedTarget.startsWith(resolvedData) || resolvedTarget.startsWith(resolvedSec);
    } catch {
      return false;
    }
  }

  /**
   * Calcule le hash SHA-256 du chemin canonique du workspace.
   */
  public getCanonicalWorkspace(workspacePath: string): string {
    try {
      return fs.realpathSync(path.resolve(workspacePath));
    } catch {
      return path.resolve(workspacePath);
    }
  }

  public getProjectHash(workspacePath: string): string {
    const canonical = this.getCanonicalWorkspace(workspacePath);
    return crypto.createHash('sha256').update(canonical.toLowerCase()).digest('hex').substring(0, 16);
  }

  private getProjectFilePath(workspacePath: string): string {
    const hash = this.getProjectHash(workspacePath);
    return path.join(this.permissionsDir, `${hash}.json`);
  }

  /**
   * Récupère la liste des règles mémorisées pour un workspace donné.
   */
  public getProjectPermissions(workspacePath: string): ProjectPermissionRule[] {
    const filePath = this.getProjectFilePath(workspacePath);
    if (!fs.existsSync(filePath)) {
      return [];
    }
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(raw);
      return Array.isArray(data.rules) ? data.rules : [];
    } catch {
      return [];
    }
  }

  /**
   * Ajoute une règle mémorisée "Toujours pour ce projet".
   */
  public addProjectPermission(
    workspacePath: string,
    tool: string,
    pattern: string
  ): ProjectPermissionRule {
    const canonical = this.getCanonicalWorkspace(workspacePath);
    const hash = this.getProjectHash(workspacePath);
    const filePath = this.getProjectFilePath(workspacePath);
    const rules = this.getProjectPermissions(workspacePath);

    // Éviter les doublons
    const existing = rules.find(r => r.tool === tool && r.pattern === pattern);
    if (existing) {
      return existing;
    }

    const newRule: ProjectPermissionRule = {
      id: crypto.randomUUID(),
      projectHash: hash,
      canonicalWorkspace: canonical,
      tool,
      pattern,
      createdAt: new Date().toISOString()
    };

    rules.push(newRule);
    fs.writeFileSync(filePath, JSON.stringify({ projectHash: hash, canonical, rules }, null, 2), 'utf-8');
    return newRule;
  }

  /**
   * Révoque une règle mémorisée.
   */
  public revokeProjectPermission(workspacePath: string, ruleId: string): boolean {
    const filePath = this.getProjectFilePath(workspacePath);
    const rules = this.getProjectPermissions(workspacePath);
    const initialCount = rules.length;
    const filtered = rules.filter(r => r.id !== ruleId);

    if (filtered.length === initialCount) {
      return false;
    }

    const canonical = this.getCanonicalWorkspace(workspacePath);
    const hash = this.getProjectHash(workspacePath);
    fs.writeFileSync(filePath, JSON.stringify({ projectHash: hash, canonical, rules: filtered }, null, 2), 'utf-8');
    return true;
  }

  /**
   * Vérifie si une action correspond à une règle "Toujours pour ce projet".
   */
  public isActionProjectAllowed(
    workspacePath: string,
    tool: string,
    pattern: string
  ): boolean {
    const rules = this.getProjectPermissions(workspacePath);
    const normalizedPattern = pattern.trim().toLowerCase();

    return rules.some(rule => {
      if (rule.tool !== tool && rule.tool !== '*') return false;
      const rulePat = rule.pattern.trim().toLowerCase();
      if (rulePat === '*' || rulePat === normalizedPattern) return true;
      if (normalizedPattern.startsWith(rulePat)) return true;
      return false;
    });
  }

  /**
   * Journalise une décision dans le journal d'audit avec rotation de fichiers.
   */
  public logDecision(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): void {
    try {
      this.rotateLogsIfNeeded();

      const fullEntry: AuditLogEntry = {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        ...entry,
        // Caviardage des secrets
        commandOrPath: this.redactSecrets(entry.commandOrPath || ''),
        description: this.redactSecrets(entry.description)
      };

      const line = JSON.stringify(fullEntry) + '\n';
      fs.appendFileSync(this.auditLogPath, line, 'utf-8');
    } catch (err) {
      console.error('[PermissionStore] Échec d\'écriture dans le journal d\'audit :', err);
    }
  }

  /**
   * Récupère les entrées récentes du journal d'audit (pour l'UI).
   */
  public getRecentAuditEntries(limit = 50): AuditLogEntry[] {
    if (!fs.existsSync(this.auditLogPath)) {
      return [];
    }
    try {
      const raw = fs.readFileSync(this.auditLogPath, 'utf-8');
      const lines = raw.trim().split('\n').filter(Boolean);
      const entries: AuditLogEntry[] = [];

      for (let i = lines.length - 1; i >= 0 && entries.length < limit; i--) {
        try {
          entries.push(JSON.parse(lines[i]));
        } catch {}
      }

      return entries;
    } catch {
      return [];
    }
  }

  /**
   * Rotation des fichiers de logs :
   * audit.log -> audit.log.1 -> audit.log.2 -> suppression
   */
  private rotateLogsIfNeeded(): void {
    if (!fs.existsSync(this.auditLogPath)) return;

    try {
      const stats = fs.statSync(this.auditLogPath);
      if (stats.size < this.maxLogSizeBytes) return;

      const log2 = `${this.auditLogPath}.2`;
      const log1 = `${this.auditLogPath}.1`;

      if (fs.existsSync(log2)) {
        fs.unlinkSync(log2);
      }
      if (fs.existsSync(log1)) {
        fs.renameSync(log1, log2);
      }
      fs.renameSync(this.auditLogPath, log1);
    } catch (err) {
      console.warn('[PermissionStore] Avertissement lors de la rotation de logs :', err);
    }
  }

  /**
   * Masquage strict des secrets (clés d'API, tokens bearer, mots de passe).
   */
  public redactSecrets(input: string): string {
    if (!input) return '';
    return input
      .replace(/sk-[a-zA-Z0-9_-]{20,}/g, 'sk-***REDACTED***')
      .replace(/bearer\s+[a-zA-Z0-9._-]{20,}/gi, 'Bearer ***REDACTED***')
      .replace(/(password|token|secret|api_key|apikey)=([^\s&]+)/gi, '$1=***REDACTED***');
  }

  /**
   * Réglages généraux de permissions (Mode par défaut, timeout terminal, timeout fichiers).
   */
  public getSettings(): { mode: PermissionMode; terminalTimeout: number; fileTimeout: number } {
    const defaults: { mode: PermissionMode; terminalTimeout: number; fileTimeout: number } = {
      mode: 'ask',
      terminalTimeout: 120000,
      fileTimeout: 30000
    };
    if (!fs.existsSync(this.settingsPath)) {
      return defaults;
    }
    try {
      const raw = fs.readFileSync(this.settingsPath, 'utf-8');
      const parsed = JSON.parse(raw);
      return {
        mode: ['ask', 'auto_edit', 'read_only'].includes(parsed.mode) ? parsed.mode : defaults.mode,
        terminalTimeout: typeof parsed.terminalTimeout === 'number' ? parsed.terminalTimeout : defaults.terminalTimeout,
        fileTimeout: typeof parsed.fileTimeout === 'number' ? parsed.fileTimeout : defaults.fileTimeout
      };
    } catch {
      return defaults;
    }
  }

  public updateSettings(partial: Partial<{ mode: PermissionMode; terminalTimeout: number; fileTimeout: number }>): { mode: PermissionMode; terminalTimeout: number; fileTimeout: number } {
    const current = this.getSettings();
    const updated = { ...current, ...partial };
    try {
      fs.writeFileSync(this.settingsPath, JSON.stringify(updated, null, 2), 'utf-8');
    } catch (err) {
      console.error('[PermissionStore] Échec d\'enregistrement des paramètres :', err);
    }
    return updated;
  }
}
