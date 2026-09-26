import { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { InstalledPlugin } from '../plugins/types';
import { tempWorkspaceManager } from '../workspace/TempWorkspaceManager';
import { VideoJobRecord } from '../media/videoTypes';

const require = createRequire(import.meta.url);
const ZipStream = require('zip-stream');
const unzipper = require('unzipper');

export interface DbConversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  workspace_path: string | null;
  metadata: string | null;
  mode: 'chat' | 'code';
  workspace_id: string | null;
}

export interface DbMessage {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
  thinking_logs: string | null;
  metadata: string | null;
}

export interface DbTask {
  id: string;
  session_id: string;
  conversation_id: string | null;
  prompt: string;
  status: string;
  mode: string;
  created_at: string;
  completed_at: string | null;
  error: string | null;
}

export interface DbToolCall {
  id: string;
  task_id: string;
  tool_name: string;
  arguments: string;
  result: string | null;
  status: string;
  created_at: string;
  completed_at: string | null;
}

export interface DbTaskCheckpoint {
  id: string;
  task_id: string;
  session_id: string;
  conversation_id: string | null;
  task_prompt: string;
  plan_json: string;
  current_step_index: number;
  completed_steps_json: string;
  blockers_json: string | null;
  files_changed_json: string;
  test_results_json: string | null;
  created_at: string;
}

export interface DbMemoryItem {
  id: string;
  scope: 'global' | 'project';
  project_hash: string | null;
  category: string;
  fact: string;
  created_at: string;
  updated_at: string;
}

export interface SearchHit {
  conversationId: string;
  conversationTitle: string;
  conversationMode: 'chat' | 'code';
  updatedAt: string;
  itemType: 'conversation' | 'message' | 'artifact';
  itemId: string;
  itemTitle?: string;
  snippet?: string;
}

export interface StorageCategoryBreakdown {
  category: 'attachments' | 'artifacts' | 'media' | 'database' | 'tempWorkspaces';
  label: string;
  bytes: number;
  itemCount: number;
  canClean: boolean;
  cleanWarning?: string;
}

export interface StorageBreakdown {
  totalBytes: number;
  categories: StorageCategoryBreakdown[];
}

export interface DbCatalogModel {
  id: string;
  provider_id: string;
  raw_id: string;
  name: string;
  publisher: string;
  description: string | null;
  context_window: number;
  max_output_tokens: number | null;
  capabilities_json: string;
  pricing_json: string | null;
  price_tier: 'free' | 'budget' | 'standard' | 'premium';
  is_curated: number;
  is_favorite: number;
  is_hidden: number;
  last_refreshed_at: string;
  raw_metadata_json: string | null;
}

export function sanitizeFts5Query(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';
  const cleaned = raw.replace(/["'*^():\-+~{}\[\]<>=@#$&]/g, ' ');
  const tokens = cleaned
    .split(/\s+/)
    .map(t => t.trim())
    .filter(t => t.length > 0 && !['AND', 'OR', 'NOT', 'NEAR'].includes(t.toUpperCase()));
  if (tokens.length === 0) return '';
  return tokens.map(t => `"${t}"*`).join(' ');
}

export function getDirectorySizeAndCount(dirPath: string): { bytes: number; count: number } {
  let bytes = 0;
  let count = 0;
  if (!fs.existsSync(dirPath)) return { bytes, count };
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        const sub = getDirectorySizeAndCount(fullPath);
        bytes += sub.bytes;
        count += sub.count;
      } else if (entry.isFile()) {
        try {
          const st = fs.statSync(fullPath);
          bytes += st.size;
          count++;
        } catch {}
      }
    }
  } catch {}
  return { bytes, count };
}

export class RuntimeDatabase {
  private db: DatabaseSync;
  public readonly dbPath: string;
  public readonly dataDir: string;
  private lastRecentTimestamp = 0;

  constructor(customPath?: string) {
    if (customPath === ':memory:') {
      this.dbPath = ':memory:';
      this.dataDir = ':memory:';
      this.db = new DatabaseSync(':memory:');
    } else {
      const realDataDir = process.platform === 'win32' && process.env.APPDATA
        ? path.join(process.env.APPDATA, 'iroko')
        : path.join(os.homedir(), '.iroko');

      const dataDir = customPath || process.env.IROKO_DATA_DIR || realDataDir;
      this.dataDir = dataDir;

      // Mission M10.1 : Refus strict d'utiliser le dossier de données réel en mode test
      const isTestEnv = process.env.NODE_ENV === 'test' || process.env.IROKO_TEST_MODE === '1' || Boolean(process.env.NODE_TEST_CONTEXT);
      if (isTestEnv) {
        const resolvedTarget = path.resolve(dataDir);
        const resolvedReal = path.resolve(realDataDir);
        if (resolvedTarget.toLowerCase() === resolvedReal.toLowerCase()) {
          throw new Error(
            `[SÉCURITÉ RUNTIME M10.1] Refus formel d'exécuter des tests dans le dossier de données réel (${realDataDir}). Définissez IROKO_DATA_DIR vers un répertoire temporaire isolé.`
          );
        }
      }

      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      this.dbPath = path.join(dataDir, 'iroko_runtime.db');
      this.ensureDatabaseIntegrityAndConnect();
    }

    // Activer les clés étrangères et le mode WAL pour la robustesse
    this.db.exec('PRAGMA foreign_keys = ON;');
    if (this.dbPath !== ':memory:') {
      try {
        this.db.exec('PRAGMA journal_mode = WAL;');
        this.db.exec('PRAGMA busy_timeout = 5000;');
      } catch {}
    }
    this.runMigrations();
  }

  public lastCorruptionIncident: {
    timestamp: string;
    corruptedBackupPath: string;
    corruptedBackupName: string;
    corruptionReason: string;
    recoveredTables: string[];
    fallbackToNew: boolean;
    userMessage: string;
  } | null = null;

  public getCorruptionIncident(): any {
    if (this.lastCorruptionIncident) return this.lastCorruptionIncident;
    if (this.dataDir && this.dataDir !== ':memory:') {
      const reportPath = path.join(this.dataDir, 'database_corruption_report.json');
      if (fs.existsSync(reportPath)) {
        try {
          return JSON.parse(fs.readFileSync(reportPath, 'utf8'));
        } catch {}
      }
    }
    return null;
  }

  private ensureDatabaseIntegrityAndConnect(): void {
    if (!fs.existsSync(this.dbPath)) {
      this.db = new DatabaseSync(this.dbPath);
      return;
    }

    // Sauvegarde préalable de précaution (.bak)
    try {
      fs.copyFileSync(this.dbPath, this.dbPath + '.bak');
    } catch {}

    let isCorrupted = false;
    let corruptionReason = '';
    let testDb: DatabaseSync | null = null;

    try {
      testDb = new DatabaseSync(this.dbPath);
      const rows = testDb.prepare('PRAGMA integrity_check').all() as Array<Record<string, any>>;
      const firstVal = rows.length > 0 ? Object.values(rows[0])[0] : null;
      if (firstVal !== 'ok') {
        isCorrupted = true;
        corruptionReason = `PRAGMA integrity_check: ${JSON.stringify(rows)}`;
      }
    } catch (err: any) {
      isCorrupted = true;
      corruptionReason = err.message || 'Échec lors de l\'ouverture de la base SQLite';
    } finally {
      if (testDb) {
        try { testDb.close(); } catch {}
      }
    }

    if (!isCorrupted) {
      this.db = new DatabaseSync(this.dbPath);
      return;
    }

    // --- CORRUPTION DÉTECTÉE (Mission R3b) ---
    console.warn(`[BASE SQLITE] Corruption détectée : ${corruptionReason}`);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const corruptedBackupName = `iroko_runtime_corrupted_${timestamp}.db`;
    const corruptedBackupPath = path.join(this.dataDir, corruptedBackupName);

    // 1. Sauvegarde automatique du fichier corrompu (jamais écrasé)
    try {
      fs.copyFileSync(this.dbPath, corruptedBackupPath);
      if (fs.existsSync(this.dbPath + '-wal')) {
        try { fs.copyFileSync(this.dbPath + '-wal', corruptedBackupPath + '-wal'); } catch {}
      }
      if (fs.existsSync(this.dbPath + '-shm')) {
        try { fs.copyFileSync(this.dbPath + '-shm', corruptedBackupPath + '-shm'); } catch {}
      }
    } catch (copyErr) {
      console.error('Erreur lors de la sauvegarde du fichier corrompu :', copyErr);
    }

    // 2. Nettoyage de l'ancien fichier corrompu pour permettre l'initialisation de la base neuve
    try {
      fs.unlinkSync(this.dbPath);
      if (fs.existsSync(this.dbPath + '-wal')) fs.unlinkSync(this.dbPath + '-wal');
      if (fs.existsSync(this.dbPath + '-shm')) fs.unlinkSync(this.dbPath + '-shm');
    } catch {}

    // 3. Initialisation de la base neuve avec son schéma complet
    this.db = new DatabaseSync(this.dbPath);
    this.db.exec('PRAGMA foreign_keys = OFF;');
    this.runMigrations();

    // 4. Tentative de récupération partielle des tables lisibles depuis le fichier corrompu sauvegardé
    const recoveredTables: string[] = [];
    let rescueDb: DatabaseSync | null = null;
    try {
      rescueDb = new DatabaseSync(corruptedBackupPath, { readOnly: true });
      const candidates = [
        'settings',
        'conversations',
        'messages',
        'agent_tasks',
        'project_memories',
        'installed_plugins',
        'custom_instructions',
        'model_catalog'
      ];

      for (const table of candidates) {
        try {
          const rows = rescueDb.prepare(`SELECT * FROM ${table}`).all();
          if (Array.isArray(rows) && rows.length > 0) {
            const firstRow = rows[0] as Record<string, any>;
            const cols = Object.keys(firstRow);
            const placeholders = cols.map(() => '?').join(', ');
            const insertStmt = this.db.prepare(
              `INSERT OR REPLACE INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`
            );
            for (const row of rows) {
              const vals = cols.map(c => (row as any)[c]);
              insertStmt.run(...vals);
            }
            recoveredTables.push(table);
          }
        } catch {}
      }
    } catch (rescueErr) {
      console.warn('[BASE SQLITE] Récupération partielle impossible, base neuve vierge conservée :', rescueErr);
    } finally {
      if (rescueDb) {
        try { rescueDb.close(); } catch {}
      }
    }

    // 5. Consignation du rapport d'incident accessible
    const userMessage = recoveredTables.length > 0
      ? `Base SQLite corrompue. Sauvegarde créée sous '${corruptedBackupName}'. Données partielles récupérées (${recoveredTables.join(', ')}).`
      : `Base SQLite corrompue. Sauvegarde créée sous '${corruptedBackupName}'. Repli sur une base neuve.`;

    const report = {
      timestamp: new Date().toISOString(),
      corruptedBackupPath,
      corruptedBackupName,
      corruptionReason,
      recoveredTables,
      fallbackToNew: true,
      userMessage
    };

    this.lastCorruptionIncident = report;
    try {
      fs.writeFileSync(
        path.join(this.dataDir, 'database_corruption_report.json'),
        JSON.stringify(report, null, 2),
        'utf8'
      );
    } catch {}
  }

  private runMigrations(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
    `);

    const row = this.db.prepare('SELECT MAX(version) as current_version FROM schema_migrations').get() as { current_version: number | null };
    const currentVersion = row?.current_version || 0;

    if (currentVersion < 1) {
      this.db.exec(`
        -- Cahier §29 : Stockage structuré runtime local
        CREATE TABLE IF NOT EXISTS conversations (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          workspace_path TEXT,
          metadata TEXT
        );

        CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
          role TEXT NOT NULL,
          content TEXT NOT NULL,
          created_at TEXT NOT NULL,
          thinking_logs TEXT,
          metadata TEXT
        );

        CREATE TABLE IF NOT EXISTS agent_tasks (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
          prompt TEXT NOT NULL,
          status TEXT NOT NULL,
          mode TEXT NOT NULL DEFAULT 'chat',
          created_at TEXT NOT NULL,
          completed_at TEXT,
          error TEXT
        );

        CREATE TABLE IF NOT EXISTS agent_events (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          task_id TEXT REFERENCES agent_tasks(id) ON DELETE CASCADE,
          event_type TEXT NOT NULL,
          payload TEXT NOT NULL,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS tool_calls (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL REFERENCES agent_tasks(id) ON DELETE CASCADE,
          tool_name TEXT NOT NULL,
          arguments TEXT NOT NULL,
          result TEXT,
          status TEXT NOT NULL,
          created_at TEXT NOT NULL,
          completed_at TEXT
        );

        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
        CREATE INDEX IF NOT EXISTS idx_tasks_session ON agent_tasks(session_id);
        CREATE INDEX IF NOT EXISTS idx_events_task ON agent_events(task_id);
        CREATE INDEX IF NOT EXISTS idx_tool_calls_task ON tool_calls(task_id);

        INSERT INTO schema_migrations (version, applied_at) VALUES (1, '${new Date().toISOString()}');
      `);
    }

    if (currentVersion < 2) {
      this.db.exec(`
        -- Cahier §20.1 & §21 : Points de contrôle et reprise de tâches
        CREATE TABLE IF NOT EXISTS task_checkpoints (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL,
          session_id TEXT NOT NULL,
          conversation_id TEXT,
          task_prompt TEXT NOT NULL,
          plan_json TEXT NOT NULL,
          current_step_index INTEGER NOT NULL,
          completed_steps_json TEXT NOT NULL,
          blockers_json TEXT,
          files_changed_json TEXT NOT NULL,
          test_results_json TEXT,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_checkpoints_task ON task_checkpoints(task_id);
        CREATE INDEX IF NOT EXISTS idx_checkpoints_session ON task_checkpoints(session_id);

        INSERT INTO schema_migrations (version, applied_at) VALUES (2, '${new Date().toISOString()}');
      `);
    }

    if (currentVersion < 3) {
      this.db.exec(`
        -- Cahier §20 : Mémoire de Projet et Préférences
        CREATE TABLE IF NOT EXISTS project_memories (
          id TEXT PRIMARY KEY,
          scope TEXT NOT NULL CHECK (scope IN ('global', 'project')),
          project_hash TEXT,
          category TEXT NOT NULL DEFAULT 'general',
          fact TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_memories_scope_proj ON project_memories(scope, project_hash);

        INSERT INTO schema_migrations (version, applied_at) VALUES (3, '${new Date().toISOString()}');
      `);
    }

    if (currentVersion < 4) {
      this.db.exec(`
        -- Cahier §13, §15, §19, §26 : MCP Servers et Compétences (Skills)
        CREATE TABLE IF NOT EXISTS mcp_servers (
          id TEXT PRIMARY KEY,
          name TEXT UNIQUE NOT NULL,
          type TEXT NOT NULL,
          command TEXT,
          args_json TEXT,
          env_json TEXT,
          url TEXT,
          headers_json TEXT,
          enabled INTEGER NOT NULL DEFAULT 1,
          disabled_tools_json TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS skills (
          id TEXT PRIMARY KEY,
          name TEXT UNIQUE NOT NULL,
          description TEXT NOT NULL,
          dir_path TEXT NOT NULL,
          instructions TEXT NOT NULL,
          enabled INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        INSERT INTO schema_migrations (version, applied_at) VALUES (4, '${new Date().toISOString()}');
      `);
    }

    if (currentVersion < 5) {
      this.db.exec(`
        -- Cahier §11, §13, §15 : Plugins (compétences, connecteurs, règles)
        CREATE TABLE IF NOT EXISTS plugins (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          version TEXT NOT NULL,
          description TEXT NOT NULL,
          author TEXT,
          enabled INTEGER NOT NULL DEFAULT 0,
          validated INTEGER NOT NULL DEFAULT 0,
          package_json TEXT NOT NULL,
          installed_at INTEGER NOT NULL
        );

        INSERT INTO schema_migrations (version, applied_at) VALUES (5, '${new Date().toISOString()}');
      `);
    }

    if (currentVersion < 6) {
      // Mission M1 : conversations.mode ('chat' | 'code') et conversations.workspace_id
      const tableInfo = this.db.prepare("PRAGMA table_info(conversations)").all() as Array<{ name: string }>;
      const hasMode = tableInfo.some(c => c.name === 'mode');
      const hasWorkspaceId = tableInfo.some(c => c.name === 'workspace_id');

      if (!hasMode) {
        this.db.exec("ALTER TABLE conversations ADD COLUMN mode TEXT NOT NULL DEFAULT 'chat';");
      }
      if (!hasWorkspaceId) {
        this.db.exec("ALTER TABLE conversations ADD COLUMN workspace_id TEXT;");
      }

      // Migration des anciennes tâches et sessions de l'ancienne section Code
      try {
        const orphanedTasks = this.db.prepare("SELECT id, session_id, prompt, created_at, status FROM agent_tasks WHERE conversation_id IS NULL").all() as Array<{
          id: string;
          session_id: string;
          prompt: string;
          created_at: string;
          status: string;
        }>;

        for (const task of orphanedTasks) {
          const convId = `migrated_task_${task.id}`;
          const title = task.prompt ? (task.prompt.slice(0, 40) + (task.prompt.length > 40 ? '...' : '')) : 'Tâche de code migrée';
          this.db.prepare(`
            INSERT OR IGNORE INTO conversations (id, title, created_at, updated_at, mode, workspace_id)
            VALUES (?, ?, ?, ?, 'code', NULL)
          `).run(convId, title, task.created_at, task.created_at);

          this.db.prepare(`
            UPDATE agent_tasks SET conversation_id = ? WHERE id = ?
          `).run(convId, task.id);
        }
      } catch {}

      this.db.exec(`INSERT INTO schema_migrations (version, applied_at) VALUES (6, '${new Date().toISOString()}');`);
    }

    if (currentVersion < 7) {
      // Mission M2 : Table attachments (pièces jointes)
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS attachments (
          id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
          message_id TEXT,
          name TEXT NOT NULL,
          original_name TEXT NOT NULL,
          size INTEGER NOT NULL,
          mime_type TEXT NOT NULL,
          detected_type TEXT NOT NULL,
          sha256 TEXT NOT NULL,
          file_path TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_attachments_conv ON attachments(conversation_id);

        INSERT INTO schema_migrations (version, applied_at) VALUES (7, '${new Date().toISOString()}');
      `);
    }

    if (currentVersion < 8) {
      // Mission M3 : Projets récents
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS recent_workspaces (
          path TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          last_opened_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_recent_workspaces_time ON recent_workspaces(last_opened_at DESC);

        INSERT INTO schema_migrations (version, applied_at) VALUES (8, '${new Date().toISOString()}');
      `);
    }

    if (currentVersion < 9) {
      // Mission M4 : Tables artifacts et artifact_versions
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS artifacts (
          id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
          message_id TEXT,
          name TEXT NOT NULL,
          title TEXT,
          mime_type TEXT NOT NULL,
          current_version INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_artifacts_conv ON artifacts(conversation_id);

        CREATE TABLE IF NOT EXISTS artifact_versions (
          id TEXT PRIMARY KEY,
          artifact_id TEXT NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
          version INTEGER NOT NULL,
          size INTEGER NOT NULL,
          file_path TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_artifact_versions_art ON artifact_versions(artifact_id);

        INSERT INTO schema_migrations (version, applied_at) VALUES (9, '${new Date().toISOString()}');
      `);
    }

    if (currentVersion < 10) {
      // Mission M6 : Colonne metadata dans artifacts
      const tableInfo = this.db.prepare("PRAGMA table_info(artifacts)").all() as Array<{ name: string }>;
      const hasMetadata = tableInfo.some(c => c.name === 'metadata');
      if (!hasMetadata) {
        this.db.exec("ALTER TABLE artifacts ADD COLUMN metadata TEXT;");
      }
      this.db.exec(`INSERT INTO schema_migrations (version, applied_at) VALUES (10, '${new Date().toISOString()}');`);
    }

    if (currentVersion < 11) {
      // Mission M7 : Table video_jobs pour les tâches asynchrones de génération vidéo
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS video_jobs (
          id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
          provider_id TEXT NOT NULL,
          model_id TEXT NOT NULL,
          prompt TEXT NOT NULL,
          duration INTEGER NOT NULL DEFAULT 5,
          aspect_ratio TEXT NOT NULL DEFAULT '16:9',
          status TEXT NOT NULL DEFAULT 'queued',
          progress REAL DEFAULT 0,
          artifact_id TEXT REFERENCES artifacts(id) ON DELETE SET NULL,
          video_file_path TEXT,
          mime_type TEXT DEFAULT 'video/mp4',
          size INTEGER DEFAULT 0,
          error TEXT,
          external_job_id TEXT,
          poll_url TEXT,
          metadata TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_video_jobs_conv ON video_jobs(conversation_id);
        CREATE INDEX IF NOT EXISTS idx_video_jobs_status ON video_jobs(status);

        INSERT INTO schema_migrations (version, applied_at) VALUES (11, '${new Date().toISOString()}');
      `);
    }

    if (currentVersion < 12) {
      // Mission M8.3 : Recherche Plein Texte FTS5 avec triggers automatiques
      this.db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS search_fts USING fts5(
          conversation_id UNINDEXED,
          item_type UNINDEXED,
          item_id UNINDEXED,
          title,
          content,
          tokenize='unicode61'
        );

        -- Triggers conversations
        CREATE TRIGGER IF NOT EXISTS trg_conversations_ai AFTER INSERT ON conversations BEGIN
          INSERT INTO search_fts (conversation_id, item_type, item_id, title, content)
          VALUES (new.id, 'conversation', new.id, new.title, '');
        END;

        CREATE TRIGGER IF NOT EXISTS trg_conversations_au AFTER UPDATE OF title ON conversations BEGIN
          DELETE FROM search_fts WHERE item_id = old.id AND item_type = 'conversation';
          INSERT INTO search_fts (conversation_id, item_type, item_id, title, content)
          VALUES (new.id, 'conversation', new.id, new.title, '');
        END;

        CREATE TRIGGER IF NOT EXISTS trg_conversations_ad AFTER DELETE ON conversations BEGIN
          DELETE FROM search_fts WHERE conversation_id = old.id;
        END;

        -- Triggers messages
        CREATE TRIGGER IF NOT EXISTS trg_messages_ai AFTER INSERT ON messages BEGIN
          INSERT INTO search_fts (conversation_id, item_type, item_id, title, content)
          VALUES (new.conversation_id, 'message', new.id, '', new.content);
        END;

        CREATE TRIGGER IF NOT EXISTS trg_messages_au AFTER UPDATE OF content ON messages BEGIN
          DELETE FROM search_fts WHERE item_id = old.id AND item_type = 'message';
          INSERT INTO search_fts (conversation_id, item_type, item_id, title, content)
          VALUES (new.conversation_id, 'message', new.id, '', new.content);
        END;

        CREATE TRIGGER IF NOT EXISTS trg_messages_ad AFTER DELETE ON messages BEGIN
          DELETE FROM search_fts WHERE item_id = old.id AND item_type = 'message';
        END;

        -- Triggers artifacts
        CREATE TRIGGER IF NOT EXISTS trg_artifacts_ai AFTER INSERT ON artifacts BEGIN
          INSERT INTO search_fts (conversation_id, item_type, item_id, title, content)
          VALUES (new.conversation_id, 'artifact', new.id, new.name, coalesce(new.title, new.name));
        END;

        CREATE TRIGGER IF NOT EXISTS trg_artifacts_au AFTER UPDATE ON artifacts BEGIN
          DELETE FROM search_fts WHERE item_id = old.id AND item_type = 'artifact';
          INSERT INTO search_fts (conversation_id, item_type, item_id, title, content)
          VALUES (new.conversation_id, 'artifact', new.id, new.name, coalesce(new.title, new.name));
        END;

        CREATE TRIGGER IF NOT EXISTS trg_artifacts_ad AFTER DELETE ON artifacts BEGIN
          DELETE FROM search_fts WHERE item_id = old.id AND item_type = 'artifact';
        END;

        -- Peuplement initial des données existantes
        INSERT INTO search_fts (conversation_id, item_type, item_id, title, content)
        SELECT id, 'conversation', id, title, '' FROM conversations;

        INSERT INTO search_fts (conversation_id, item_type, item_id, title, content)
        SELECT conversation_id, 'message', id, '', content FROM messages;

        INSERT INTO search_fts (conversation_id, item_type, item_id, title, content)
        SELECT conversation_id, 'artifact', id, name, coalesce(title, name) FROM artifacts;

        INSERT INTO schema_migrations (version, applied_at) VALUES (12, '${new Date().toISOString()}');
      `);
    }

    if (currentVersion < 13) {
      // Mission M10.2 : Catalogue normalisé et persistant de modèles (Cahier §10, §26)
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS model_catalog (
          id TEXT PRIMARY KEY,
          provider_id TEXT NOT NULL,
          raw_id TEXT NOT NULL,
          name TEXT NOT NULL,
          publisher TEXT NOT NULL,
          description TEXT,
          context_window INTEGER NOT NULL DEFAULT 4096,
          max_output_tokens INTEGER,
          capabilities_json TEXT NOT NULL,
          pricing_json TEXT,
          price_tier TEXT NOT NULL DEFAULT 'standard',
          is_curated INTEGER NOT NULL DEFAULT 0,
          is_favorite INTEGER NOT NULL DEFAULT 0,
          is_hidden INTEGER NOT NULL DEFAULT 0,
          last_refreshed_at TEXT NOT NULL,
          raw_metadata_json TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_model_catalog_provider ON model_catalog(provider_id);
        CREATE INDEX IF NOT EXISTS idx_model_catalog_curated ON model_catalog(is_curated);
        CREATE INDEX IF NOT EXISTS idx_model_catalog_tier ON model_catalog(price_tier);
        CREATE INDEX IF NOT EXISTS idx_model_catalog_favorite ON model_catalog(is_favorite);

        INSERT INTO schema_migrations (version, applied_at) VALUES (13, '${new Date().toISOString()}');
      `);
    }

    if (currentVersion < 14) {
      // Mission N1 : Compétences Niveau 3 (is_system, metadata_json)
      const skillsTableInfo = this.db.prepare("PRAGMA table_info(skills)").all() as Array<{ name: string }>;
      const hasIsSystem = skillsTableInfo.some(c => c.name === 'is_system');
      const hasMetadata = skillsTableInfo.some(c => c.name === 'metadata_json');
      if (!hasIsSystem) {
        this.db.exec("ALTER TABLE skills ADD COLUMN is_system INTEGER NOT NULL DEFAULT 0;");
      }
      if (!hasMetadata) {
        this.db.exec("ALTER TABLE skills ADD COLUMN metadata_json TEXT;");
      }

      this.db.exec(`INSERT INTO schema_migrations (version, applied_at) VALUES (14, '${new Date().toISOString()}');`);
    }
  }

  // --- Conversations ---
  public listConversations(): DbConversation[] {
    const stmt = this.db.prepare('SELECT * FROM conversations ORDER BY updated_at DESC');
    return stmt.all() as unknown as DbConversation[];
  }

  public getConversation(id: string): { conversation: DbConversation; messages: DbMessage[] } | null {
    const convStmt = this.db.prepare('SELECT * FROM conversations WHERE id = ?');
    const conv = convStmt.get(id) as unknown as DbConversation | undefined;
    if (!conv) return null;

    const msgStmt = this.db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC');
    const messages = msgStmt.all(id) as unknown as DbMessage[];
    return { conversation: conv, messages };
  }

  public saveConversation(
    id: string,
    title: string,
    workspacePath?: string,
    metadata?: any,
    mode: 'chat' | 'code' = 'chat',
    workspaceId?: string | null
  ): DbConversation {
    const now = new Date().toISOString();
    const existing = this.db.prepare('SELECT id, created_at, mode, workspace_id FROM conversations WHERE id = ?').get(id) as { id: string; created_at: string; mode?: string; workspace_id?: string | null } | undefined;

    if (existing) {
      this.db.prepare(`
        UPDATE conversations 
        SET title = ?, updated_at = ?, workspace_path = coalesce(?, workspace_path), metadata = coalesce(?, metadata),
            mode = coalesce(?, mode), workspace_id = coalesce(?, workspace_id)
        WHERE id = ?
      `).run(
        title,
        now,
        workspacePath || null,
        metadata ? JSON.stringify(metadata) : null,
        mode || existing.mode || 'chat',
        workspaceId !== undefined ? workspaceId : existing.workspace_id || null,
        id
      );
    } else {
      this.db.prepare(`
        INSERT INTO conversations (id, title, created_at, updated_at, workspace_path, metadata, mode, workspace_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        title,
        now,
        now,
        workspacePath || null,
        metadata ? JSON.stringify(metadata) : null,
        mode,
        workspaceId || null
      );
    }

    return this.getConversation(id)!.conversation;
  }

  public updateConversationMode(id: string, mode: 'chat' | 'code'): boolean {
    const res = this.db.prepare(`
      UPDATE conversations SET mode = ?, updated_at = ? WHERE id = ?
    `).run(mode, new Date().toISOString(), id);
    return Number(res.changes) > 0;
  }

  public updateConversationWorkspace(id: string, workspaceId: string | null): boolean {
    const res = this.db.prepare(`
      UPDATE conversations SET workspace_id = ?, updated_at = ? WHERE id = ?
    `).run(workspaceId, new Date().toISOString(), id);
    return Number(res.changes) > 0;
  }

  public deleteConversation(id: string): boolean {
    this.deleteConversationAttachments(id);
    this.deleteConversationArtifacts(id);
    this.deleteConversationVideoJobs(id);
    tempWorkspaceManager.purgeTempWorkspace(id);
    const res = this.db.prepare('DELETE FROM conversations WHERE id = ?').run(id);
    return Number(res.changes) > 0;
  }

  // --- Projets Récents (Mission M3) ---
  public recordRecentWorkspace(wsPath: string, name: string): void {
    let nowMs = Date.now();
    if (nowMs <= this.lastRecentTimestamp) {
      nowMs = this.lastRecentTimestamp + 1;
    }
    this.lastRecentTimestamp = nowMs;
    const now = new Date(nowMs).toISOString();

    this.db.prepare(`
      INSERT OR REPLACE INTO recent_workspaces (path, name, last_opened_at)
      VALUES (?, ?, ?)
    `).run(wsPath, name, now);

    // Conserver au maximum les 5 plus récents
    this.db.exec(`
      DELETE FROM recent_workspaces WHERE path NOT IN (
        SELECT path FROM recent_workspaces ORDER BY last_opened_at DESC, rowid DESC LIMIT 5
      )
    `);
  }

  public listRecentWorkspaces(limit = 5): Array<{ path: string; name: string; last_opened_at: string }> {
    const stmt = this.db.prepare('SELECT path, name, last_opened_at FROM recent_workspaces ORDER BY last_opened_at DESC, rowid DESC LIMIT ?');
    return stmt.all(limit) as Array<{ path: string; name: string; last_opened_at: string }>;
  }

  public removeRecentWorkspace(wsPath: string): boolean {
    const res = this.db.prepare('DELETE FROM recent_workspaces WHERE path = ?').run(wsPath);
    return Number(res.changes) > 0;
  }

  // --- Attachments (Pièces Jointes) ---
  public recordAttachment(att: {
    id: string;
    conversationId: string;
    messageId?: string | null;
    name: string;
    originalName: string;
    size: number;
    mimeType: string;
    detectedType: string;
    sha256: string;
    filePath: string;
    createdAt?: string;
  }): void {
    const now = att.createdAt || new Date().toISOString();
    this.db.prepare(`
      INSERT OR REPLACE INTO attachments (id, conversation_id, message_id, name, original_name, size, mime_type, detected_type, sha256, file_path, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      att.id,
      att.conversationId,
      att.messageId || null,
      att.name,
      att.originalName,
      att.size,
      att.mimeType,
      att.detectedType,
      att.sha256,
      att.filePath,
      now
    );
  }

  public getAttachment(id: string): any | null {
    const row = this.db.prepare('SELECT * FROM attachments WHERE id = ?').get(id) as any;
    if (!row) return null;
    return {
      id: row.id,
      conversationId: row.conversation_id,
      messageId: row.message_id,
      name: row.name,
      originalName: row.original_name,
      size: row.size,
      mimeType: row.mime_type,
      detectedType: row.detected_type,
      sha256: row.sha256,
      filePath: row.file_path,
      createdAt: row.created_at
    };
  }

  public listAttachments(conversationId: string): any[] {
    const rows = this.db.prepare('SELECT * FROM attachments WHERE conversation_id = ? ORDER BY created_at ASC').all(conversationId) as any[];
    return rows.map(row => ({
      id: row.id,
      conversationId: row.conversation_id,
      messageId: row.message_id,
      name: row.name,
      originalName: row.original_name,
      size: row.size,
      mimeType: row.mime_type,
      detectedType: row.detected_type,
      sha256: row.sha256,
      filePath: row.file_path,
      createdAt: row.created_at
    }));
  }

  public deleteAttachment(id: string): boolean {
    const res = this.db.prepare('DELETE FROM attachments WHERE id = ?').run(id);
    return Number(res.changes) > 0;
  }

  public deleteConversationAttachments(conversationId: string): boolean {
    const res = this.db.prepare('DELETE FROM attachments WHERE conversation_id = ?').run(conversationId);
    return Number(res.changes) > 0;
  }

  // --- Artifacts (Mission M4) ---
  public recordArtifact(art: {
    id: string;
    conversationId: string;
    messageId?: string | null;
    name: string;
    title?: string | null;
    mimeType: string;
    currentVersion?: number;
    size: number;
    filePath: string;
    versionId?: string;
    metadata?: any;
    createdAt?: string;
    updatedAt?: string;
  }): void {
    const now = new Date().toISOString();
    const currentVersion = art.currentVersion || 1;
    const createdAt = art.createdAt || now;
    const updatedAt = art.updatedAt || now;
    const versionId = art.versionId || crypto.randomUUID();
    const metadataJson = art.metadata ? JSON.stringify(art.metadata) : null;
    this.db.prepare(`
      INSERT INTO artifacts (id, conversation_id, message_id, name, title, mime_type, current_version, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      art.id,
      art.conversationId,
      art.messageId || null,
      art.name,
      art.title || art.name,
      art.mimeType,
      currentVersion,
      metadataJson,
      createdAt,
      updatedAt
    );

    this.db.prepare(`
      INSERT INTO artifact_versions (id, artifact_id, version, size, file_path, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      versionId,
      art.id,
      currentVersion,
      art.size,
      art.filePath,
      createdAt
    );
  }

  public addArtifactVersion(ver: {
    id: string;
    artifactId: string;
    version: number;
    size: number;
    filePath: string;
    title?: string | null;
    updatedAt: string;
  }): void {
    this.db.prepare(`
      INSERT INTO artifact_versions (id, artifact_id, version, size, file_path, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      ver.id,
      ver.artifactId,
      ver.version,
      ver.size,
      ver.filePath,
      ver.updatedAt
    );

    if (ver.title) {
      this.db.prepare(`
        UPDATE artifacts SET current_version = ?, title = ?, updated_at = ? WHERE id = ?
      `).run(ver.version, ver.title, ver.updatedAt, ver.artifactId);
    } else {
      this.db.prepare(`
        UPDATE artifacts SET current_version = ?, updated_at = ? WHERE id = ?
      `).run(ver.version, ver.updatedAt, ver.artifactId);
    }
  }

  public getArtifact(id: string): {
    id: string;
    conversationId: string;
    messageId: string | null;
    name: string;
    title: string | null;
    mimeType: string;
    currentVersion: number;
    size: number;
    metadata?: any;
    createdAt: string;
    updatedAt: string;
  } | null {
    const row = this.db.prepare(`
      SELECT 
        a.id, a.conversation_id as conversationId, a.message_id as messageId, 
        a.name, a.title, a.mime_type as mimeType, a.current_version as currentVersion,
        a.metadata, a.created_at as createdAt, a.updated_at as updatedAt,
        COALESCE(v.size, 0) as size
      FROM artifacts a
      LEFT JOIN artifact_versions v ON v.artifact_id = a.id AND v.version = a.current_version
      WHERE a.id = ?
    `).get(id) as any;

    if (!row) return null;
    let parsedMetadata = undefined;
    if (row.metadata) {
      try { parsedMetadata = JSON.parse(row.metadata); } catch {}
    }
    return {
      ...row,
      metadata: parsedMetadata
    };
  }

  public listArtifacts(conversationId: string): Array<{
    id: string;
    conversationId: string;
    messageId: string | null;
    name: string;
    title: string | null;
    mimeType: string;
    currentVersion: number;
    size: number;
    metadata?: any;
    createdAt: string;
    updatedAt: string;
  }> {
    const rows = this.db.prepare(`
      SELECT 
        a.id, a.conversation_id as conversationId, a.message_id as messageId, 
        a.name, a.title, a.mime_type as mimeType, a.current_version as currentVersion,
        a.metadata, a.created_at as createdAt, a.updated_at as updatedAt,
        COALESCE(v.size, 0) as size
      FROM artifacts a
      LEFT JOIN artifact_versions v ON v.artifact_id = a.id AND v.version = a.current_version
      WHERE a.conversation_id = ?
      ORDER BY a.created_at DESC
    `).all(conversationId) as any[];

    return rows.map(r => {
      let parsed = undefined;
      if (r.metadata) {
        try { parsed = JSON.parse(r.metadata); } catch {}
      }
      return {
        ...r,
        metadata: parsed
      };
    });
  }

  public getArtifactVersion(artifactId: string, version: number): {
    id: string;
    artifactId: string;
    version: number;
    size: number;
    filePath: string;
    createdAt: string;
  } | null {
    const row = this.db.prepare(`
      SELECT id, artifact_id as artifactId, version, size, file_path as filePath, created_at as createdAt
      FROM artifact_versions
      WHERE artifact_id = ? AND version = ?
    `).get(artifactId, version) as any;

    return row || null;
  }

  public listArtifactVersions(artifactId: string): Array<{
    id: string;
    artifactId: string;
    version: number;
    size: number;
    filePath: string;
    createdAt: string;
  }> {
    const rows = this.db.prepare(`
      SELECT id, artifact_id as artifactId, version, size, file_path as filePath, created_at as createdAt
      FROM artifact_versions
      WHERE artifact_id = ?
      ORDER BY version ASC
    `).all(artifactId) as any[];

    return rows;
  }

  public deleteConversationArtifacts(conversationId: string): boolean {
    const artifactsDir = path.join(this.dataDir, 'artifacts', conversationId);
    if (fs.existsSync(artifactsDir)) {
      try {
        fs.rmSync(artifactsDir, { recursive: true, force: true });
      } catch {}
    }
    const res = this.db.prepare('DELETE FROM artifacts WHERE conversation_id = ?').run(conversationId);
    return Number(res.changes) > 0;
  }

  // --- Video Jobs (Mission M7) ---
  public createVideoJob(job: VideoJobRecord): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO video_jobs (
        id, conversation_id, provider_id, model_id, prompt, duration, aspect_ratio,
        status, progress, artifact_id, video_file_path, mime_type, size, error,
        external_job_id, poll_url, metadata, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      job.id,
      job.conversationId,
      job.providerId,
      job.modelId,
      job.prompt,
      job.duration || 5,
      job.aspectRatio || '16:9',
      job.status || 'queued',
      job.progress || 0,
      job.artifactId || null,
      job.videoFilePath || null,
      job.mimeType || 'video/mp4',
      job.size || 0,
      job.error || null,
      job.externalJobId || null,
      job.pollUrl || null,
      job.metadata ? JSON.stringify(job.metadata) : null,
      job.createdAt || now,
      job.updatedAt || now
    );
  }

  public updateVideoJob(id: string, updates: Partial<VideoJobRecord>): boolean {
    const existing = this.getVideoJob(id);
    if (!existing) return false;
    const now = new Date().toISOString();

    const merged = { ...existing, ...updates };
    const res = this.db.prepare(`
      UPDATE video_jobs
      SET status = ?, progress = ?, artifact_id = ?, video_file_path = ?,
          mime_type = ?, size = ?, error = ?, external_job_id = ?,
          poll_url = ?, metadata = ?, updated_at = ?
      WHERE id = ?
    `).run(
      merged.status,
      merged.progress !== undefined ? merged.progress : 0,
      merged.artifactId || null,
      merged.videoFilePath || null,
      merged.mimeType || 'video/mp4',
      merged.size || 0,
      merged.error || null,
      merged.externalJobId || null,
      merged.pollUrl || null,
      merged.metadata ? JSON.stringify(merged.metadata) : null,
      now,
      id
    );
    return Number(res.changes) > 0;
  }

  public getVideoJob(id: string): VideoJobRecord | null {
    const row = this.db.prepare('SELECT * FROM video_jobs WHERE id = ?').get(id) as any;
    if (!row) return null;
    return this.mapVideoJobRow(row);
  }

  public listVideoJobs(conversationId?: string): VideoJobRecord[] {
    let rows: any[];
    if (conversationId) {
      rows = this.db.prepare('SELECT * FROM video_jobs WHERE conversation_id = ? ORDER BY created_at DESC').all(conversationId) as any[];
    } else {
      rows = this.db.prepare('SELECT * FROM video_jobs ORDER BY created_at DESC').all() as any[];
    }
    return rows.map(r => this.mapVideoJobRow(r));
  }

  public listPendingVideoJobs(): VideoJobRecord[] {
    const rows = this.db.prepare("SELECT * FROM video_jobs WHERE status IN ('queued', 'processing') ORDER BY created_at ASC").all() as any[];
    return rows.map(r => this.mapVideoJobRow(r));
  }

  public deleteVideoJob(id: string): boolean {
    const res = this.db.prepare('DELETE FROM video_jobs WHERE id = ?').run(id);
    return Number(res.changes) > 0;
  }

  public deleteConversationVideoJobs(conversationId: string): boolean {
    const res = this.db.prepare('DELETE FROM video_jobs WHERE conversation_id = ?').run(conversationId);
    return Number(res.changes) > 0;
  }

  private mapVideoJobRow(row: any): VideoJobRecord {
    let metadata: any = undefined;
    if (row.metadata) {
      try { metadata = JSON.parse(row.metadata); } catch {}
    }
    return {
      id: row.id,
      conversationId: row.conversation_id,
      providerId: row.provider_id,
      modelId: row.model_id,
      prompt: row.prompt,
      duration: Number(row.duration) || 5,
      aspectRatio: row.aspect_ratio || '16:9',
      status: row.status,
      progress: Number(row.progress) || 0,
      artifactId: row.artifact_id || undefined,
      videoFilePath: row.video_file_path || undefined,
      mimeType: row.mime_type || 'video/mp4',
      size: Number(row.size) || 0,
      error: row.error || undefined,
      externalJobId: row.external_job_id || undefined,
      pollUrl: row.poll_url || undefined,
      metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  // --- Messages ---
  public addMessage(msg: {
    id: string;
    conversationId: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    thinkingLogs?: any[];
    metadata?: any;
    createdAt?: string;
  }): DbMessage {
    const now = msg.createdAt || new Date().toISOString();
    this.db.prepare(`
      INSERT INTO messages (id, conversation_id, role, content, created_at, thinking_logs, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      msg.id,
      msg.conversationId,
      msg.role,
      msg.content,
      now,
      msg.thinkingLogs ? JSON.stringify(msg.thinkingLogs) : null,
      msg.metadata ? JSON.stringify(msg.metadata) : null
    );

    // Mettre à jour l'horodatage de la conversation
    this.db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(now, msg.conversationId);

    return {
      id: msg.id,
      conversation_id: msg.conversationId,
      role: msg.role,
      content: msg.content,
      created_at: now,
      thinking_logs: msg.thinkingLogs ? JSON.stringify(msg.thinkingLogs) : null,
      metadata: msg.metadata ? JSON.stringify(msg.metadata) : null
    };
  }

  public getMessage(messageId: string): DbMessage | null {
    const row = this.db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId) as unknown as DbMessage | undefined;
    return row || null;
  }

  public deleteMessage(messageId: string): {
    success: boolean;
    conversationId?: string;
    deletedAttachmentIds: string[];
    deletedArtifactIds: string[];
  } {
    const msg = this.db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId) as unknown as DbMessage | undefined;
    if (!msg) {
      return { success: false, deletedAttachmentIds: [], deletedArtifactIds: [] };
    }

    const deletedAttachmentIds: string[] = [];
    const deletedArtifactIds: string[] = [];

    // 1. Pièces jointes liées à ce message
    const atts = this.db.prepare('SELECT id, file_path FROM attachments WHERE message_id = ?').all(messageId) as Array<{ id: string; file_path: string }>;
    for (const a of atts) {
      deletedAttachmentIds.push(a.id);
      if (a.file_path && fs.existsSync(a.file_path)) {
        try { fs.unlinkSync(a.file_path); } catch {}
      }
    }
    if (msg.metadata) {
      try {
        const meta = JSON.parse(msg.metadata);
        if (Array.isArray(meta.attachmentIds)) {
          for (const attId of meta.attachmentIds) {
            if (!deletedAttachmentIds.includes(attId)) {
              const aRow = this.db.prepare('SELECT file_path FROM attachments WHERE id = ?').get(attId) as { file_path: string } | undefined;
              if (aRow?.file_path && fs.existsSync(aRow.file_path)) {
                try { fs.unlinkSync(aRow.file_path); } catch {}
              }
              deletedAttachmentIds.push(attId);
            }
          }
        }
      } catch {}
    }
    for (const id of deletedAttachmentIds) {
      this.db.prepare('DELETE FROM attachments WHERE id = ?').run(id);
    }

    // 2. Artéfacts liés à ce message
    const arts = this.db.prepare('SELECT id FROM artifacts WHERE message_id = ?').all(messageId) as Array<{ id: string }>;
    for (const art of arts) {
      deletedArtifactIds.push(art.id);
    }
    if (msg.metadata) {
      try {
        const meta = JSON.parse(msg.metadata);
        if (Array.isArray(meta.artifacts)) {
          for (const a of meta.artifacts) {
            if (a.id && !deletedArtifactIds.includes(a.id)) {
              deletedArtifactIds.push(a.id);
            }
          }
        }
      } catch {}
    }
    for (const artId of deletedArtifactIds) {
      const vers = this.db.prepare('SELECT file_path FROM artifact_versions WHERE artifact_id = ?').all(artId) as Array<{ file_path: string }>;
      for (const v of vers) {
        if (v.file_path && fs.existsSync(v.file_path)) {
          try { fs.unlinkSync(v.file_path); } catch {}
        }
      }
      this.db.prepare('DELETE FROM artifact_versions WHERE artifact_id = ?').run(artId);
      this.db.prepare('DELETE FROM artifacts WHERE id = ?').run(artId);
    }

    // 3. Suppression du message dans SQLite (trigger trg_messages_ad synchronise search_fts)
    const res = this.db.prepare('DELETE FROM messages WHERE id = ?').run(messageId);

    return {
      success: Number(res.changes) > 0,
      conversationId: msg.conversation_id,
      deletedAttachmentIds,
      deletedArtifactIds
    };
  }

  public checkTruncateImpact(conversationId: string, messageId: string): {
    subsequentCount: number;
    filesWereModified: boolean;
    modifiedFiles: string[];
  } {
    const target = this.db.prepare('SELECT created_at FROM messages WHERE id = ? AND conversation_id = ?').get(messageId, conversationId) as { created_at: string } | undefined;
    if (!target) {
      return { subsequentCount: 0, filesWereModified: false, modifiedFiles: [] };
    }

    const subsequent = this.db.prepare('SELECT count(*) as count FROM messages WHERE conversation_id = ? AND created_at > ?').get(conversationId, target.created_at) as { count: number };

    const modifiedFilesSet = new Set<string>();
    const checkpoints = this.db.prepare('SELECT files_changed_json FROM task_checkpoints WHERE conversation_id = ? AND created_at >= ?').all(conversationId, target.created_at) as Array<{ files_changed_json: string }>;
    for (const cp of checkpoints) {
      try {
        const files = JSON.parse(cp.files_changed_json);
        if (Array.isArray(files)) {
          files.forEach(f => modifiedFilesSet.add(f));
        }
      } catch {}
    }

    const fileToolCalls = this.db.prepare(`
      SELECT tc.arguments
      FROM tool_calls tc
      JOIN agent_tasks t ON t.id = tc.task_id
      WHERE t.conversation_id = ? AND tc.created_at >= ?
        AND tc.tool_name IN ('write_file', 'edit_file', 'create_file', 'delete_file')
        AND tc.status = 'success'
    `).all(conversationId, target.created_at) as Array<{ arguments: string }>;

    for (const tc of fileToolCalls) {
      try {
        let args = typeof tc.arguments === 'string' ? JSON.parse(tc.arguments) : tc.arguments;
        if (typeof args === 'string') {
          try { args = JSON.parse(args); } catch {}
        }
        if (args && typeof args === 'object') {
          if (args.path) modifiedFilesSet.add(args.path);
          if (args.filePath) modifiedFilesSet.add(args.filePath);
        }
      } catch {}
    }

    return {
      subsequentCount: Number(subsequent?.count || 0),
      filesWereModified: modifiedFilesSet.size > 0,
      modifiedFiles: Array.from(modifiedFilesSet)
    };
  }

  public truncateConversationFrom(
    conversationId: string,
    messageId: string,
    includeTarget = false
  ): {
    success: boolean;
    deletedCount: number;
    filesWereModified: boolean;
    deletedAttachmentIds: string[];
    deletedArtifactIds: string[];
  } {
    const target = this.db.prepare('SELECT created_at FROM messages WHERE id = ? AND conversation_id = ?').get(messageId, conversationId) as { created_at: string } | undefined;
    if (!target) {
      return { success: false, deletedCount: 0, filesWereModified: false, deletedAttachmentIds: [], deletedArtifactIds: [] };
    }

    const impact = this.checkTruncateImpact(conversationId, messageId);
    const op = includeTarget ? '>=' : '>';
    const msgsToDelete = this.db.prepare(`SELECT id FROM messages WHERE conversation_id = ? AND created_at ${op} ?`).all(conversationId, target.created_at) as Array<{ id: string }>;

    const allDeletedAttachments: string[] = [];
    const allDeletedArtifacts: string[] = [];

    for (const m of msgsToDelete) {
      const delRes = this.deleteMessage(m.id);
      if (delRes.deletedAttachmentIds) allDeletedAttachments.push(...delRes.deletedAttachmentIds);
      if (delRes.deletedArtifactIds) allDeletedArtifacts.push(...delRes.deletedArtifactIds);
    }

    return {
      success: true,
      deletedCount: msgsToDelete.length,
      filesWereModified: impact.filesWereModified,
      deletedAttachmentIds: allDeletedAttachments,
      deletedArtifactIds: allDeletedArtifacts
    };
  }

  // --- Recherche Plein Texte FTS5 (Mission M8.3) ---
  public searchFullText(rawQuery: string): SearchHit[] {
    const sanitized = sanitizeFts5Query(rawQuery);
    if (!sanitized) return [];

    try {
      const stmt = this.db.prepare(`
        SELECT 
          f.conversation_id as conversationId,
          c.title as conversationTitle,
          c.mode as conversationMode,
          c.updated_at as updatedAt,
          f.item_type as itemType,
          f.item_id as itemId,
          f.title as itemTitle,
          snippet(search_fts, 4, '<b>', '</b>', '...', 12) as snippet
        FROM search_fts f
        JOIN conversations c ON c.id = f.conversation_id
        WHERE search_fts MATCH ?
        ORDER BY f.rank
        LIMIT 50
      `);
      return stmt.all(sanitized) as unknown as SearchHit[];
    } catch (err) {
      console.error('[RuntimeDatabase] Erreur lors de la recherche FTS5 :', err);
      return [];
    }
  }

  // --- Espace Disque (Mission M8.3) ---
  public getStorageBreakdown(): StorageBreakdown {
    const attInfo = getDirectorySizeAndCount(path.join(this.dataDir, 'attachments'));
    const tempInfo = getDirectorySizeAndCount(path.join(this.dataDir, 'workspaces', 'temp'));

    let dbBytes = 0;
    let dbCount = 0;
    for (const f of [this.dbPath, `${this.dbPath}-wal`, `${this.dbPath}-shm`, `${this.dbPath}.bak`]) {
      if (fs.existsSync(f)) {
        try {
          dbBytes += fs.statSync(f).size;
          dbCount++;
        } catch {}
      }
    }

    const artifactsDir = path.join(this.dataDir, 'artifacts');
    let artifactsBytes = 0;
    let artifactsCount = 0;
    let mediaBytes = 0;
    let mediaCount = 0;

    const mediaExts = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.mp4', '.webm', '.mov']);

    function scanArtifacts(dir: string) {
      if (!fs.existsSync(dir)) return;
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const e of entries) {
          const full = path.join(dir, e.name);
          if (e.isDirectory()) {
            scanArtifacts(full);
          } else if (e.isFile()) {
            try {
              const sz = fs.statSync(full).size;
              const ext = path.extname(e.name).toLowerCase();
              if (mediaExts.has(ext)) {
                mediaBytes += sz;
                mediaCount++;
              } else {
                artifactsBytes += sz;
                artifactsCount++;
              }
            } catch {}
          }
        }
      } catch {}
    }
    scanArtifacts(artifactsDir);

    const categories: StorageCategoryBreakdown[] = [
      {
        category: 'attachments',
        label: 'Pièces jointes',
        bytes: attInfo.bytes,
        itemCount: attInfo.count,
        canClean: true,
        cleanWarning: "Supprime définitivement les fichiers physiques de pièces jointes du disque. Les conversations existantes perdront l'accès à ces fichiers."
      },
      {
        category: 'artifacts',
        label: 'Artéfacts documentaires',
        bytes: artifactsBytes,
        itemCount: artifactsCount,
        canClean: true,
        cleanWarning: "Supprime définitivement les documents et artéfacts texte du disque. Les cartes d'artéfacts des conversations existantes ne pourront plus être téléchargées."
      },
      {
        category: 'media',
        label: 'Médias (images et vidéos)',
        bytes: mediaBytes,
        itemCount: mediaCount,
        canClean: true,
        cleanWarning: "Supprime définitivement les images et vidéos générées du disque."
      },
      {
        category: 'database',
        label: 'Base SQLite locale',
        bytes: dbBytes,
        itemCount: dbCount,
        canClean: true,
        cleanWarning: "Exécute un compactage complet (VACUUM) de la base de données SQLite pour récupérer l'espace non alloué, sans perte de données."
      },
      {
        category: 'tempWorkspaces',
        label: 'Espaces temporaires de code',
        bytes: tempInfo.bytes,
        itemCount: tempInfo.count,
        canClean: true,
        cleanWarning: "Supprime tous les dossiers des espaces de code temporaires créés lors des sessions."
      }
    ];

    const totalBytes = attInfo.bytes + artifactsBytes + mediaBytes + dbBytes + tempInfo.bytes;
    return { totalBytes, categories };
  }

  public cleanStorage(category: string, force = false): { success: boolean; category: string; freedBytes: number; message: string } {
    const before = this.getStorageBreakdown();
    let freedBytes = 0;

    if (category === 'database') {
      const beforeBytes = before.categories.find(c => c.category === 'database')?.bytes || 0;
      try {
        this.db.exec('VACUUM;');
      } catch (err: any) {
        return { success: false, category, freedBytes: 0, message: `Échec du compactage : ${err.message}` };
      }
      const after = this.getStorageBreakdown();
      const afterBytes = after.categories.find(c => c.category === 'database')?.bytes || 0;
      freedBytes = Math.max(0, beforeBytes - afterBytes);
      return { success: true, category, freedBytes, message: 'Base de données SQLite compactée avec succès.' };
    }

    if (category === 'tempWorkspaces' || category === 'temp') {
      const tempDir = path.join(this.dataDir, 'workspaces', 'temp');
      const beforeBytes = before.categories.find(c => c.category === 'tempWorkspaces')?.bytes || 0;
      if (fs.existsSync(tempDir)) {
        try {
          const entries = fs.readdirSync(tempDir);
          for (const e of entries) {
            try { fs.rmSync(path.join(tempDir, e), { recursive: true, force: true }); } catch {}
          }
        } catch (err: any) {
          return { success: false, category, freedBytes: 0, message: err.message };
        }
      }
      const after = this.getStorageBreakdown();
      const afterBytes = after.categories.find(c => c.category === 'tempWorkspaces')?.bytes || 0;
      freedBytes = Math.max(0, beforeBytes - afterBytes);
      return { success: true, category, freedBytes, message: 'Espaces temporaires nettoyés.' };
    }

    if (category === 'attachments') {
      const attDir = path.join(this.dataDir, 'attachments');
      const beforeBytes = before.categories.find(c => c.category === 'attachments')?.bytes || 0;
      if (fs.existsSync(attDir)) {
        try {
          const entries = fs.readdirSync(attDir);
          for (const e of entries) {
            try { fs.rmSync(path.join(attDir, e), { recursive: true, force: true }); } catch {}
          }
        } catch (err: any) {
          return { success: false, category, freedBytes: 0, message: err.message };
        }
      }
      if (force) {
        this.db.prepare('DELETE FROM attachments').run();
      }
      const after = this.getStorageBreakdown();
      const afterBytes = after.categories.find(c => c.category === 'attachments')?.bytes || 0;
      freedBytes = Math.max(0, beforeBytes - afterBytes);
      return { success: true, category, freedBytes, message: 'Pièces jointes nettoyées.' };
    }

    if (category === 'artifacts') {
      const artDir = path.join(this.dataDir, 'artifacts');
      const beforeBytes = before.categories.find(c => c.category === 'artifacts')?.bytes || 0;
      const mediaExts = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.mp4', '.webm', '.mov']);

      const cleanNonMedia = (dir: string) => {
        if (!fs.existsSync(dir)) return;
        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const e of entries) {
            const full = path.join(dir, e.name);
            if (e.isDirectory()) {
              cleanNonMedia(full);
              try {
                if (fs.readdirSync(full).length === 0) fs.rmdirSync(full);
              } catch {}
            } else if (e.isFile()) {
              const ext = path.extname(e.name).toLowerCase();
              if (!mediaExts.has(ext)) {
                try { fs.unlinkSync(full); } catch {}
              }
            }
          }
        } catch {}
      };
      cleanNonMedia(artDir);
      const after = this.getStorageBreakdown();
      const afterBytes = after.categories.find(c => c.category === 'artifacts')?.bytes || 0;
      freedBytes = Math.max(0, beforeBytes - afterBytes);
      return { success: true, category, freedBytes, message: 'Artéfacts documentaires nettoyés.' };
    }

    if (category === 'media') {
      const artDir = path.join(this.dataDir, 'artifacts');
      const beforeBytes = before.categories.find(c => c.category === 'media')?.bytes || 0;
      const mediaExts = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.mp4', '.webm', '.mov']);

      const cleanMedia = (dir: string) => {
        if (!fs.existsSync(dir)) return;
        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const e of entries) {
            const full = path.join(dir, e.name);
            if (e.isDirectory()) {
              cleanMedia(full);
              try {
                if (fs.readdirSync(full).length === 0) fs.rmdirSync(full);
              } catch {}
            } else if (e.isFile()) {
              const ext = path.extname(e.name).toLowerCase();
              if (mediaExts.has(ext)) {
                try { fs.unlinkSync(full); } catch {}
              }
            }
          }
        } catch {}
      };
      cleanMedia(artDir);
      const after = this.getStorageBreakdown();
      const afterBytes = after.categories.find(c => c.category === 'media')?.bytes || 0;
      freedBytes = Math.max(0, beforeBytes - afterBytes);
      return { success: true, category, freedBytes, message: 'Médias supprimés.' };
    }

    return { success: false, category, freedBytes: 0, message: `Catégorie inconnue : ${category}` };
  }

  // --- Observabilité : Tâches & Événements (§36) ---
  public recordTask(task: {
    id: string;
    sessionId: string;
    conversationId?: string;
    prompt: string;
    status: string;
    mode?: string;
    createdAt?: string;
  }): void {
    const now = task.createdAt || new Date().toISOString();
    this.db.prepare(`
      INSERT INTO agent_tasks (id, session_id, conversation_id, prompt, status, mode, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(task.id, task.sessionId, task.conversationId || null, task.prompt, task.status, task.mode || 'chat', now);
  }

  public updateTaskStatus(taskId: string, status: string, error?: string): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE agent_tasks 
      SET status = ?, completed_at = ?, error = ?
      WHERE id = ?
    `).run(status, now, error || null, taskId);
  }

  public recordEvent(event: {
    id: string;
    sessionId: string;
    taskId?: string;
    eventType: string;
    payload: any;
    createdAt?: string;
  }): void {
    const now = event.createdAt || new Date().toISOString();
    this.db.prepare(`
      INSERT INTO agent_events (id, session_id, task_id, event_type, payload, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(event.id, event.sessionId, event.taskId || null, event.eventType, JSON.stringify(event.payload), now);
  }

  public recordToolCall(call: {
    id: string;
    taskId: string;
    toolName: string;
    arguments: any;
    status: string;
    result?: any;
    createdAt?: string;
  }): void {
    const now = call.createdAt || new Date().toISOString();
    this.db.prepare(`
      INSERT INTO tool_calls (id, task_id, tool_name, arguments, result, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      call.id,
      call.taskId,
      call.toolName,
      JSON.stringify(call.arguments),
      call.result ? JSON.stringify(call.result) : null,
      call.status,
      now
    );
  }

  // --- Settings ---
  public getSetting(key: string): any {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
    if (!row) return null;
    try {
      return JSON.parse(row.value);
    } catch {
      return row.value;
    }
  }

  public setSetting(key: string, value: any): void {
    const now = new Date().toISOString();
    const strVal = typeof value === 'string' ? value : JSON.stringify(value);
    this.db.prepare(`
      INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(key, strVal, now);
  }

  public deleteSetting(key: string): boolean {
    const res = this.db.prepare('DELETE FROM settings WHERE key = ?').run(key);
    return Number(res.changes) > 0;
  }

  public getAllSettings(): Record<string, any> {
    const rows = this.db.prepare('SELECT key, value FROM settings').all() as unknown as { key: string; value: string }[];
    const result: Record<string, any> = {};
    for (const r of rows) {
      try {
        result[r.key] = JSON.parse(r.value);
      } catch {
        result[r.key] = r.value;
      }
    }
    return result;
  }

  // --- Migration unique localStorage vers Runtime ---
  public migrateFromLocalStorage(data: {
    conversations?: Array<{ id: string; topic?: string; title?: string; time?: string; messages?: any[] }>;
    settings?: Record<string, any>;
  }): { importedConversations: number; importedSettings: number } {
    let importedConversations = 0;
    let importedSettings = 0;

    if (Array.isArray(data.conversations)) {
      for (const conv of data.conversations) {
        if (!conv || typeof conv !== 'object' || !conv.id) continue;
        const title = conv.topic || conv.title || 'Discussion importée';
        const convId = String(conv.id);
        
        // Insérer ou mettre à jour la conversation
        this.saveConversation(convId, title);
        importedConversations++;

        // Migrer les messages si présents
        if (Array.isArray(conv.messages)) {
          for (let i = 0; i < conv.messages.length; i++) {
            const m = conv.messages[i];
            if (!m || !m.content) continue;
            const msgId = m.id || `${convId}-msg-${i}`;
            const role = m.role === 'assistant' ? 'assistant' : 'user';
            this.addMessage({
              id: String(msgId),
              conversationId: convId,
              role,
              content: String(m.content),
              thinkingLogs: Array.isArray(m.thinkingLogs) ? m.thinkingLogs : undefined
            });
          }
        }
      }
    }

    if (data.settings && typeof data.settings === 'object') {
      for (const [k, v] of Object.entries(data.settings)) {
        this.setSetting(k, v);
        importedSettings++;
      }
    }

    return { importedConversations, importedSettings };
  }

  // --- Points de Contrôle & Reprise (§20.1, §21) ---
  public saveCheckpoint(data: {
    id?: string;
    taskId: string;
    sessionId: string;
    conversationId?: string | null;
    taskPrompt: string;
    plan: any[];
    currentStepIndex: number;
    completedSteps: any[];
    blockers?: any[] | null;
    filesChanged: string[];
    testResults?: any | null;
    createdAt?: string;
  }): DbTaskCheckpoint {
    const id = data.id || crypto.randomUUID();
    const now = data.createdAt || new Date().toISOString();
    this.db.prepare(`
      INSERT INTO task_checkpoints (
        id, task_id, session_id, conversation_id, task_prompt, plan_json,
        current_step_index, completed_steps_json, blockers_json, files_changed_json,
        test_results_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.taskId,
      data.sessionId,
      data.conversationId || null,
      data.taskPrompt,
      JSON.stringify(data.plan),
      data.currentStepIndex,
      JSON.stringify(data.completedSteps),
      data.blockers ? JSON.stringify(data.blockers) : null,
      JSON.stringify(data.filesChanged),
      data.testResults ? JSON.stringify(data.testResults) : null,
      now
    );

    return {
      id,
      task_id: data.taskId,
      session_id: data.sessionId,
      conversation_id: data.conversationId || null,
      task_prompt: data.taskPrompt,
      plan_json: JSON.stringify(data.plan),
      current_step_index: data.currentStepIndex,
      completed_steps_json: JSON.stringify(data.completedSteps),
      blockers_json: data.blockers ? JSON.stringify(data.blockers) : null,
      files_changed_json: JSON.stringify(data.filesChanged),
      test_results_json: data.testResults ? JSON.stringify(data.testResults) : null,
      created_at: now
    };
  }

  public getLatestCheckpoint(taskId: string): DbTaskCheckpoint | null {
    const stmt = this.db.prepare('SELECT * FROM task_checkpoints WHERE task_id = ? ORDER BY created_at DESC LIMIT 1');
    const row = stmt.get(taskId) as unknown as DbTaskCheckpoint | undefined;
    return row || null;
  }

  public getLatestCheckpointForSession(sessionId: string): DbTaskCheckpoint | null {
    const stmt = this.db.prepare('SELECT * FROM task_checkpoints WHERE session_id = ? ORDER BY created_at DESC LIMIT 1');
    const row = stmt.get(sessionId) as unknown as DbTaskCheckpoint | undefined;
    return row || null;
  }

  public clearCheckpoints(taskId: string): void {
    this.db.prepare('DELETE FROM task_checkpoints WHERE task_id = ?').run(taskId);
  }

  // --- Mémoire de Projet (§20) ---
  public listMemories(scope?: 'global' | 'project', projectHash?: string | null): DbMemoryItem[] {
    if (scope && projectHash !== undefined) {
      const stmt = this.db.prepare(
        'SELECT * FROM project_memories WHERE scope = ? AND (project_hash = ? OR project_hash IS NULL) ORDER BY updated_at DESC'
      );
      return stmt.all(scope, projectHash) as unknown as DbMemoryItem[];
    } else if (scope) {
      const stmt = this.db.prepare('SELECT * FROM project_memories WHERE scope = ? ORDER BY updated_at DESC');
      return stmt.all(scope) as unknown as DbMemoryItem[];
    } else if (projectHash) {
      const stmt = this.db.prepare(
        'SELECT * FROM project_memories WHERE scope = \'global\' OR (scope = \'project\' AND project_hash = ?) ORDER BY updated_at DESC'
      );
      return stmt.all(projectHash) as unknown as DbMemoryItem[];
    } else {
      const stmt = this.db.prepare('SELECT * FROM project_memories ORDER BY updated_at DESC');
      return stmt.all() as unknown as DbMemoryItem[];
    }
  }

  public getMemory(id: string): DbMemoryItem | null {
    const stmt = this.db.prepare('SELECT * FROM project_memories WHERE id = ?');
    const row = stmt.get(id) as unknown as DbMemoryItem | undefined;
    return row || null;
  }

  public saveMemory(memory: {
    id?: string;
    scope: 'global' | 'project';
    projectHash?: string | null;
    category?: string;
    fact: string;
    createdAt?: string;
    updatedAt?: string;
  }): DbMemoryItem {
    const now = new Date().toISOString();
    const id = memory.id || crypto.randomUUID();
    const existing = this.getMemory(id);

    if (existing) {
      this.db.prepare(`
        UPDATE project_memories
        SET scope = ?, project_hash = ?, category = ?, fact = ?, updated_at = ?
        WHERE id = ?
      `).run(
        memory.scope,
        memory.projectHash !== undefined ? memory.projectHash : existing.project_hash,
        memory.category !== undefined ? memory.category : existing.category,
        memory.fact,
        memory.updatedAt || now,
        id
      );
    } else {
      this.db.prepare(`
        INSERT INTO project_memories (id, scope, project_hash, category, fact, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        memory.scope,
        memory.projectHash || null,
        memory.category || 'general',
        memory.fact,
        memory.createdAt || now,
        memory.updatedAt || now
      );
    }

    return this.getMemory(id)!;
  }

  public deleteMemory(id: string): boolean {
    const res = this.db.prepare('DELETE FROM project_memories WHERE id = ?').run(id);
    return Number(res.changes) > 0;
  }

  public clearAllMemories(scope?: 'global' | 'project', projectHash?: string | null): number {
    // IMPORTANT : Supprime uniquement les éléments de project_memories,
    // ne touche JAMAIS aux conversations, messages ni clés d'authentification.
    let res;
    if (scope && projectHash) {
      res = this.db.prepare('DELETE FROM project_memories WHERE scope = ? AND project_hash = ?').run(scope, projectHash);
    } else if (scope) {
      res = this.db.prepare('DELETE FROM project_memories WHERE scope = ?').run(scope);
    } else if (projectHash) {
      res = this.db.prepare('DELETE FROM project_memories WHERE scope = \'project\' AND project_hash = ?').run(projectHash);
    } else {
      res = this.db.prepare('DELETE FROM project_memories').run();
    }
    return Number(res.changes);
  }

  public isMemoryEnabled(): boolean {
    const setting = this.getSetting('memory_enabled');
    if (setting === null) return true; // activé par défaut
    return setting === 'true';
  }

  public setMemoryEnabled(enabled: boolean): void {
    this.setSetting('memory_enabled', enabled ? 'true' : 'false');
  }

  // --- Confidentialité & Purges (§26, Mission L13) ---
  public getDataDirectory(): string {
    return this.dbPath === ':memory:' ? ':memory:' : path.dirname(this.dbPath);
  }

  public clearAllConversations(): { deletedConversations: number; deletedMessages: number } {
    const msgRes = this.db.prepare('DELETE FROM messages').run();
    const convRes = this.db.prepare('DELETE FROM conversations').run();
    return {
      deletedConversations: Number(convRes.changes),
      deletedMessages: Number(msgRes.changes)
    };
  }

  public exportAllData(): {
    exportedAt: string;
    version: string;
    conversations: Array<{ conversation: DbConversation; messages: DbMessage[] }>;
    memories: DbMemoryItem[];
    settings: Record<string, any>;
  } {
    const conversations = this.listConversations().map(conv => {
      const data = this.getConversation(conv.id);
      return data || { conversation: conv, messages: [] };
    });

    const memories = this.listMemories();
    const allSettings = this.getAllSettings();
    const safeSettings: Record<string, any> = {};
    for (const [k, v] of Object.entries(allSettings)) {
      if (!k.toLowerCase().includes('key') && !k.toLowerCase().includes('secret') && !k.toLowerCase().includes('token')) {
        safeSettings[k] = v;
      }
    }

    return {
      exportedAt: new Date().toISOString(),
      version: '1.0.0',
      conversations,
      memories,
      settings: safeSettings
    };
  }

  // --- MCP Servers (Cahier §15, §19, §26, Mission L14) ---
  public listMcpServers(): any[] {
    const rows = this.db.prepare('SELECT * FROM mcp_servers ORDER BY created_at ASC').all() as any[];
    return rows.map(r => ({
      ...r,
      args: r.args_json ? JSON.parse(r.args_json) : [],
      env: r.env_json ? JSON.parse(r.env_json) : {},
      headers: r.headers_json ? JSON.parse(r.headers_json) : {},
      enabled: Boolean(r.enabled),
      disabledTools: r.disabled_tools_json ? JSON.parse(r.disabled_tools_json) : []
    }));
  }

  public getMcpServer(name: string): any | null {
    const row = this.db.prepare('SELECT * FROM mcp_servers WHERE name = ?').get(name) as any;
    if (!row) return null;
    return {
      ...row,
      args: row.args_json ? JSON.parse(row.args_json) : [],
      env: row.env_json ? JSON.parse(row.env_json) : {},
      headers: row.headers_json ? JSON.parse(row.headers_json) : {},
      enabled: Boolean(row.enabled),
      disabledTools: row.disabled_tools_json ? JSON.parse(row.disabled_tools_json) : []
    };
  }

  public saveMcpServer(server: {
    id?: string;
    name: string;
    type: string;
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    url?: string;
    headers?: Record<string, string>;
    enabled?: boolean;
    disabledTools?: string[];
  }): any {
    const now = new Date().toISOString();
    const id = server.id || crypto.randomUUID();
    const existing = this.getMcpServer(server.name);

    if (existing) {
      this.db.prepare(`
        UPDATE mcp_servers
        SET type = ?, command = ?, args_json = ?, env_json = ?, url = ?, headers_json = ?,
            enabled = ?, disabled_tools_json = ?, updated_at = ?
        WHERE name = ?
      `).run(
        server.type,
        server.command || null,
        server.args ? JSON.stringify(server.args) : null,
        server.env ? JSON.stringify(server.env) : null,
        server.url || null,
        server.headers ? JSON.stringify(server.headers) : null,
        server.enabled !== false ? 1 : 0,
        server.disabledTools ? JSON.stringify(server.disabledTools) : null,
        now,
        server.name
      );
    } else {
      this.db.prepare(`
        INSERT INTO mcp_servers (id, name, type, command, args_json, env_json, url, headers_json, enabled, disabled_tools_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        server.name,
        server.type,
        server.command || null,
        server.args ? JSON.stringify(server.args) : null,
        server.env ? JSON.stringify(server.env) : null,
        server.url || null,
        server.headers ? JSON.stringify(server.headers) : null,
        server.enabled !== false ? 1 : 0,
        server.disabledTools ? JSON.stringify(server.disabledTools) : null,
        now,
        now
      );
    }

    return this.getMcpServer(server.name);
  }

  public deleteMcpServer(name: string): boolean {
    const res = this.db.prepare('DELETE FROM mcp_servers WHERE name = ?').run(name);
    return Number(res.changes) > 0;
  }

  public setMcpServerEnabled(name: string, enabled: boolean): boolean {
    const res = this.db.prepare('UPDATE mcp_servers SET enabled = ?, updated_at = ? WHERE name = ?')
      .run(enabled ? 1 : 0, new Date().toISOString(), name);
    return Number(res.changes) > 0;
  }

  // --- Compétences / Skills (Cahier §13, §15, Mission L14, N1) ---
  public listSkills(): any[] {
    const rows = this.db.prepare('SELECT * FROM skills ORDER BY name ASC').all() as any[];
    return rows.map(r => ({
      ...r,
      dirPath: r.dir_path,
      enabled: Boolean(r.enabled),
      isSystem: Boolean(r.is_system),
      metadata: r.metadata_json ? (() => { try { return JSON.parse(r.metadata_json); } catch { return {}; } })() : {}
    }));
  }

  public getSkill(name: string): any | null {
    const row = this.db.prepare('SELECT * FROM skills WHERE name = ?').get(name) as any;
    if (!row) return null;
    return {
      ...row,
      dirPath: row.dir_path,
      enabled: Boolean(row.enabled),
      isSystem: Boolean(row.is_system),
      metadata: row.metadata_json ? (() => { try { return JSON.parse(row.metadata_json); } catch { return {}; } })() : {}
    };
  }

  public saveSkill(skill: {
    id?: string;
    name: string;
    description: string;
    dirPath?: string;
    dir_path?: string;
    instructions: string;
    enabled?: boolean;
    isSystem?: boolean;
    is_system?: boolean | number;
    metadata?: Record<string, any>;
    metadata_json?: string;
  }): any {
    const now = new Date().toISOString();
    const id = skill.id || crypto.randomUUID();
    const existing = this.getSkill(skill.name);
    const resolvedDirPath = skill.dirPath || skill.dir_path || existing?.dirPath || '';
    const isSys = skill.isSystem !== undefined
      ? (skill.isSystem ? 1 : 0)
      : (skill.is_system !== undefined ? (skill.is_system ? 1 : 0) : (existing?.isSystem ? 1 : 0));
    const metaJson = skill.metadata_json !== undefined
      ? skill.metadata_json
      : (skill.metadata !== undefined ? JSON.stringify(skill.metadata) : (existing?.metadata ? JSON.stringify(existing.metadata) : null));

    if (existing) {
      this.db.prepare(`
        UPDATE skills
        SET description = ?, dir_path = ?, instructions = ?, enabled = ?, is_system = ?, metadata_json = ?, updated_at = ?
        WHERE name = ?
      `).run(
        skill.description !== undefined ? skill.description : existing.description,
        resolvedDirPath,
        skill.instructions !== undefined ? skill.instructions : existing.instructions,
        skill.enabled !== undefined ? (skill.enabled ? 1 : 0) : (existing.enabled ? 1 : 0),
        isSys,
        metaJson,
        now,
        skill.name
      );
    } else {
      this.db.prepare(`
        INSERT INTO skills (id, name, description, dir_path, instructions, enabled, is_system, metadata_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        skill.name,
        skill.description,
        resolvedDirPath,
        skill.instructions,
        skill.enabled !== false ? 1 : 0,
        isSys,
        metaJson,
        now,
        now
      );
    }

    return this.getSkill(skill.name);
  }

  public deleteSkill(name: string): boolean {
    const existing = this.getSkill(name);
    if (existing?.isSystem) {
      throw new Error(`Impossible de supprimer la compétence système "${name}". Elle peut uniquement être désactivée.`);
    }
    const res = this.db.prepare('DELETE FROM skills WHERE name = ?').run(name);
    return Number(res.changes) > 0;
  }

  public setSkillEnabled(name: string, enabled: boolean): boolean {
    const res = this.db.prepare('UPDATE skills SET enabled = ?, updated_at = ? WHERE name = ?')
      .run(enabled ? 1 : 0, new Date().toISOString(), name);
    return Number(res.changes) > 0;
  }

  // --- Plugins (§11, §13, §15) ---
  public listPlugins(): InstalledPlugin[] {
    const rows = this.db.prepare('SELECT * FROM plugins ORDER BY name ASC').all() as any[];
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      version: r.version,
      description: r.description,
      author: r.author || undefined,
      enabled: Boolean(r.enabled),
      validated: Boolean(r.validated),
      installedAt: Number(r.installed_at),
      packageData: JSON.parse(r.package_json)
    }));
  }

  public getPlugin(id: string): InstalledPlugin | null {
    const row = this.db.prepare('SELECT * FROM plugins WHERE id = ?').get(id) as any;
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      version: row.version,
      description: row.description,
      author: row.author || undefined,
      enabled: Boolean(row.enabled),
      validated: Boolean(row.validated),
      installedAt: Number(row.installed_at),
      packageData: JSON.parse(row.package_json)
    };
  }

  public savePlugin(plugin: InstalledPlugin): void {
    const existing = this.getPlugin(plugin.id);
    if (existing) {
      this.db.prepare(`
        UPDATE plugins
        SET name = ?, version = ?, description = ?, author = ?, enabled = ?, validated = ?, package_json = ?
        WHERE id = ?
      `).run(
        plugin.name,
        plugin.version,
        plugin.description,
        plugin.author || null,
        plugin.enabled ? 1 : 0,
        plugin.validated ? 1 : 0,
        JSON.stringify(plugin.packageData),
        plugin.id
      );
    } else {
      this.db.prepare(`
        INSERT INTO plugins (id, name, version, description, author, enabled, validated, package_json, installed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        plugin.id,
        plugin.name,
        plugin.version,
        plugin.description,
        plugin.author || null,
        plugin.enabled ? 1 : 0,
        plugin.validated ? 1 : 0,
        JSON.stringify(plugin.packageData),
        plugin.installedAt
      );
    }
  }

  public deletePlugin(id: string): boolean {
    const res = this.db.prepare('DELETE FROM plugins WHERE id = ?').run(id);
    return Number(res.changes) > 0;
  }

  public setPluginEnabled(id: string, enabled: boolean): boolean {
    const res = this.db.prepare('UPDATE plugins SET enabled = ? WHERE id = ?')
      .run(enabled ? 1 : 0, id);
    return Number(res.changes) > 0;
  }

  public getSchemaVersion(): number {
    try {
      const row = this.db.prepare('SELECT MAX(version) as current_version FROM schema_migrations').get() as { current_version: number | null };
      return row?.current_version || 1;
    } catch {
      return 1;
    }
  }

  public getRecentErrors(limit = 20): Array<{ timestamp: string; message: string }> {
    try {
      const rows = this.db.prepare(`
        SELECT created_at as timestamp, error as message FROM agent_tasks WHERE error IS NOT NULL AND error != ''
        UNION ALL
        SELECT created_at as timestamp, payload as message FROM agent_events WHERE event_type = 'error'
        ORDER BY timestamp DESC
        LIMIT ?
      `).all(limit) as unknown as Array<{ timestamp: string; message: string }>;
      return rows || [];
    } catch {
      return [];
    }
  }

  /**
   * Sauvegarde transactionnelle sans blocage via VACUUM INTO, streaming zip-stream (§ Mission M8.2)
   * Exclusion par défaut des clés API, autorisations, jetons et clé maîtresse.
   */
  public async createBackupArchive(targetPath?: string, includeSecrets = false): Promise<string> {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'iroko-backup-'));
    const tempDbPath = path.join(tempDir, 'iroko_runtime.db');

    try {
      // 1. Snapshot transactionnel SQLite (évite de copier le fichier WAL en cours d'écriture)
      const escapedDbPath = tempDbPath.replace(/'/g, "''");
      this.db.exec(`VACUUM INTO '${escapedDbPath}';`);

      // 2. Nettoyage strict des secrets si non inclus
      const snapDb = new DatabaseSync(tempDbPath);
      if (!includeSecrets) {
        try {
          snapDb.exec('DELETE FROM keys;');
        } catch {}
        try {
          snapDb.exec('DELETE FROM permissions;');
        } catch {}
        try {
          snapDb.exec("DELETE FROM settings WHERE key LIKE '%token%' OR key LIKE '%key%' OR key LIKE '%secret%';");
        } catch {}
        try {
          snapDb.exec('VACUUM;');
        } catch {}
      }
      snapDb.close();

      // 3. Manifeste descriptif
      const manifest = {
        app: 'iroko-code-agent',
        schemaVersion: this.getSchemaVersion(),
        createdAt: new Date().toISOString(),
        includesSecrets: !!includeSecrets
      };

      // 4. Fichier archive de destination
      const destFile = targetPath || path.join(this.dataDir, `iroko_backup_${Date.now()}.zip`);
      fs.mkdirSync(path.dirname(destFile), { recursive: true });

      // 5. Streaming vers archive ZIP via zip-stream (sans chargement mémoire)
      const outStream = fs.createWriteStream(destFile);
      const zip = new ZipStream();
      zip.pipe(outStream);

      await new Promise<void>((resolve, reject) => {
        zip.entry(JSON.stringify(manifest, null, 2), { name: 'manifest.json' }, (err: any) => {
          if (err) return reject(err);

          const dbStream = fs.createReadStream(tempDbPath);
          zip.entry(dbStream, { name: 'iroko_runtime.db' }, (err2: any) => {
            if (err2) return reject(err2);
            zip.finish();
          });
        });
        outStream.on('finish', () => resolve());
        outStream.on('error', (err: any) => reject(err));
      });

      return destFile;
    } finally {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {}
    }
  }

  /**
   * Restauration d'une archive avec protection anti zip-slip et sauvegarde de secours (§ Mission M8.2)
   */
  public async restoreFromBackup(archivePath: string): Promise<{ success: boolean; message: string; schemaVersion: number }> {
    if (!fs.existsSync(archivePath)) {
      throw new Error(`Fichier de sauvegarde introuvable : ${archivePath}`);
    }

    const extractDir = fs.mkdtempSync(path.join(os.tmpdir(), 'iroko-restore-'));
    try {
      const directory = await unzipper.Open.file(archivePath);

      // Protection stricte anti zip-slip
      for (const file of directory.files) {
        if (
          file.path.includes('..') ||
          path.isAbsolute(file.path) ||
          file.path.startsWith('/') ||
          file.path.startsWith('\\') ||
          /^[a-zA-Z]:/.test(file.path)
        ) {
          throw new Error(`Protection anti zip-slip : chemin d'archive suspect (${file.path})`);
        }
      }

      // Extraction des fichiers
      for (const file of directory.files) {
        const dest = path.join(extractDir, file.path);
        if (file.type === 'Directory') {
          fs.mkdirSync(dest, { recursive: true });
        } else {
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          await new Promise<void>((resolve, reject) => {
            file.stream().pipe(fs.createWriteStream(dest)).on('finish', () => resolve()).on('error', reject);
          });
        }
      }

      const manifestPath = path.join(extractDir, 'manifest.json');
      if (!fs.existsSync(manifestPath)) {
        throw new Error("L'archive ne contient pas de manifest.json valide.");
      }
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      if (manifest.app !== 'iroko-code-agent') {
        throw new Error("L'archive n'est pas une sauvegarde Iroko valide.");
      }

      const restoredDbPath = path.join(extractDir, 'iroko_runtime.db');
      if (!fs.existsSync(restoredDbPath)) {
        throw new Error("L'archive ne contient pas de base de données iroko_runtime.db.");
      }

      // Vérification d'intégrité de la base restaurée
      const verifyDb = new DatabaseSync(restoredDbPath);
      const row = verifyDb.prepare('SELECT MAX(version) as v FROM schema_migrations').get() as { v: number | null };
      const restoredVersion = row?.v || 1;
      verifyDb.close();

      // Sauvegarde automatique de secours de la base actuelle avant remplacement
      if (fs.existsSync(this.dbPath)) {
        fs.copyFileSync(this.dbPath, this.dbPath + '.pre-restore.bak');
      }

      // Fermeture de la base actuelle
      this.db.close();

      // Remplacement de la base par la version restaurée
      fs.copyFileSync(restoredDbPath, this.dbPath);

      // Réouverture de la base
      this.db = new DatabaseSync(this.dbPath);
      this.db.exec('PRAGMA foreign_keys = ON;');
      this.runMigrations();

      return {
        success: true,
        message: 'Restauration terminée avec succès. Veuillez redémarrer l\'application si nécessaire.',
        schemaVersion: restoredVersion
      };
    } finally {
      try {
        fs.rmSync(extractDir, { recursive: true, force: true });
      } catch {}
    }
  }

  // --- Catalogue de Modèles (Mission M10.2) ---
  public upsertCatalogModels(models: Array<{
    id: string;
    providerId: string;
    rawId: string;
    name: string;
    publisher: string;
    description?: string;
    contextWindow: number;
    maxOutputTokens?: number;
    capabilities: any;
    pricing?: any;
    priceTier: string;
    isCurated?: boolean;
    isFavorite?: boolean;
    isHidden?: boolean;
    rawMetadata?: any;
  }>): void {
    if (!models || models.length === 0) return;
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO model_catalog (
        id, provider_id, raw_id, name, publisher, description,
        context_window, max_output_tokens, capabilities_json,
        pricing_json, price_tier, is_curated, is_favorite, is_hidden,
        last_refreshed_at, raw_metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        publisher = excluded.publisher,
        description = coalesce(excluded.description, model_catalog.description),
        context_window = excluded.context_window,
        max_output_tokens = excluded.max_output_tokens,
        capabilities_json = excluded.capabilities_json,
        pricing_json = coalesce(excluded.pricing_json, model_catalog.pricing_json),
        price_tier = excluded.price_tier,
        is_curated = excluded.is_curated,
        last_refreshed_at = excluded.last_refreshed_at,
        raw_metadata_json = coalesce(excluded.raw_metadata_json, model_catalog.raw_metadata_json)
    `);

    for (const m of models) {
      stmt.run(
        m.id,
        m.providerId,
        m.rawId,
        m.name,
        m.publisher || 'Inconnu',
        m.description || null,
        m.contextWindow || 4096,
        m.maxOutputTokens || null,
        typeof m.capabilities === 'string' ? m.capabilities : JSON.stringify(m.capabilities || {}),
        m.pricing ? (typeof m.pricing === 'string' ? m.pricing : JSON.stringify(m.pricing)) : null,
        m.priceTier || 'standard',
        m.isCurated ? 1 : 0,
        m.isFavorite ? 1 : 0,
        m.isHidden ? 1 : 0,
        now,
        m.rawMetadata ? (typeof m.rawMetadata === 'string' ? m.rawMetadata : JSON.stringify(m.rawMetadata)) : null
      );
    }
  }

  public listCatalogModels(filter?: {
    providerId?: string;
    isCurated?: boolean;
    includeHidden?: boolean;
    query?: string;
    isFavorite?: boolean;
  }): DbCatalogModel[] {
    let sql = 'SELECT * FROM model_catalog WHERE 1=1';
    const params: any[] = [];

    if (filter?.providerId) {
      sql += ' AND provider_id = ?';
      params.push(filter.providerId);
    }

    if (filter?.isCurated !== undefined) {
      sql += ' AND is_curated = ?';
      params.push(filter.isCurated ? 1 : 0);
    }

    if (!filter?.includeHidden) {
      sql += ' AND is_hidden = 0';
    }

    if (filter?.isFavorite !== undefined) {
      sql += ' AND is_favorite = ?';
      params.push(filter.isFavorite ? 1 : 0);
    }

    if (filter?.query && filter.query.trim()) {
      const q = `%${filter.query.trim()}%`;
      sql += ' AND (name LIKE ? OR raw_id LIKE ? OR publisher LIKE ? OR id LIKE ?)';
      params.push(q, q, q, q);
    }

    sql += ' ORDER BY is_favorite DESC, is_curated DESC, publisher ASC, name ASC';

    return this.db.prepare(sql).all(...params) as unknown as DbCatalogModel[];
  }

  public getCatalogModel(id: string): DbCatalogModel | null {
    const row = this.db.prepare('SELECT * FROM model_catalog WHERE id = ?').get(id);
    return (row as unknown as DbCatalogModel) || null;
  }

  public updateModelPreferences(id: string, preferences: { isFavorite?: boolean; isHidden?: boolean }): boolean {
    const updates: string[] = [];
    const params: any[] = [];

    if (preferences.isFavorite !== undefined) {
      updates.push('is_favorite = ?');
      params.push(preferences.isFavorite ? 1 : 0);
    }
    if (preferences.isHidden !== undefined) {
      updates.push('is_hidden = ?');
      params.push(preferences.isHidden ? 1 : 0);
    }

    if (updates.length === 0) return false;

    params.push(id);
    const result = this.db.prepare(`UPDATE model_catalog SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    return result.changes > 0;
  }

  public deleteCatalogModelsByProvider(providerId: string): number {
    const res = this.db.prepare('DELETE FROM model_catalog WHERE provider_id = ?').run(providerId);
    return Number(res.changes);
  }

  public clearModelCatalog(): number {
    const res = this.db.prepare('DELETE FROM model_catalog').run();
    return Number(res.changes);
  }

  public getLastCatalogRefreshTime(providerId?: string): string | null {
    if (providerId) {
      const row = this.db.prepare('SELECT MAX(last_refreshed_at) as last_refreshed FROM model_catalog WHERE provider_id = ?').get(providerId) as { last_refreshed: string | null } | undefined;
      return row?.last_refreshed || null;
    }
    const row = this.db.prepare('SELECT MAX(last_refreshed_at) as last_refreshed FROM model_catalog').get() as { last_refreshed: string | null } | undefined;
    return row?.last_refreshed || null;
  }

  public close(): void {
    this.db.close();
  }
}

export const runtimeDatabase = new RuntimeDatabase();
