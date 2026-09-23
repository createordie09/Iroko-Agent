import path from 'path';
import fs from 'fs';
import os from 'os';
import { WorkspaceValidator } from './WorkspaceValidator';

export class TempWorkspaceManager {
  private static instance: TempWorkspaceManager;
  private readonly baseTempDir: string;
  public static readonly MAX_TEMP_WORKSPACE_BYTES = 100 * 1024 * 1024; // 100 Mo max

  private constructor() {
    const dataDir = process.env.IROKO_DATA_DIR || (
      process.platform === 'win32' && process.env.APPDATA
        ? path.join(process.env.APPDATA, 'iroko')
        : path.join(os.homedir(), '.iroko')
    );
    this.baseTempDir = path.join(dataDir, 'workspaces', 'temp');
    if (!fs.existsSync(this.baseTempDir)) {
      fs.mkdirSync(this.baseTempDir, { recursive: true });
    }
  }

  public static getInstance(): TempWorkspaceManager {
    if (!TempWorkspaceManager.instance) {
      TempWorkspaceManager.instance = new TempWorkspaceManager();
    }
    return TempWorkspaceManager.instance;
  }

  /**
   * Obtient ou crée le répertoire d'espace temporaire confiné d'une conversation.
   */
  public getOrCreateTempWorkspace(conversationId: string): string {
    const safeConvId = conversationId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const tempPath = path.join(this.baseTempDir, safeConvId);
    if (!fs.existsSync(tempPath)) {
      fs.mkdirSync(tempPath, { recursive: true });
    }
    return fs.realpathSync(tempPath);
  }

  /**
   * Vérifie si un chemin donné correspond à un espace temporaire.
   */
  public isTempWorkspace(targetPath: string): boolean {
    try {
      const canonicalTarget = fs.realpathSync(path.resolve(targetPath)).toLowerCase();
      const canonicalBase = fs.realpathSync(this.baseTempDir).toLowerCase();
      return canonicalTarget.startsWith(canonicalBase);
    } catch {
      return false;
    }
  }

  /**
   * Purge physiquement l'espace temporaire d'une conversation lors de sa suppression.
   */
  public purgeTempWorkspace(conversationId: string): void {
    const safeConvId = conversationId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const tempPath = path.join(this.baseTempDir, safeConvId);
    if (fs.existsSync(tempPath)) {
      try {
        fs.rmSync(tempPath, { recursive: true, force: true });
      } catch (err) {
        console.warn(`[TempWorkspaceManager] Échec de la purge de l'espace temporaire "${tempPath}":`, err);
      }
    }
  }

  /**
   * Calcule la taille cumulée des fichiers dans un espace temporaire.
   */
  public getTempWorkspaceSize(conversationId: string): number {
    const safeConvId = conversationId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const tempPath = path.join(this.baseTempDir, safeConvId);
    if (!fs.existsSync(tempPath)) return 0;

    let total = 0;
    const calculate = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          calculate(full);
        } else if (entry.isFile()) {
          total += fs.statSync(full).size;
        }
      }
    };

    calculate(tempPath);
    return total;
  }

  /**
   * Copie récursivement tous les fichiers d'un espace temporaire vers un dossier cible validé du PC.
   */
  public copyTo(conversationId: string, destinationPath: string): { copiedFiles: number; totalBytes: number } {
    const validation = WorkspaceValidator.validate(destinationPath);
    if (!validation.valid || !validation.canonicalPath) {
      throw new Error(validation.error || 'Dossier de destination invalide.');
    }

    const safeConvId = conversationId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const tempPath = path.join(this.baseTempDir, safeConvId);
    if (!fs.existsSync(tempPath)) {
      return { copiedFiles: 0, totalBytes: 0 };
    }

    let copiedFiles = 0;
    let totalBytes = 0;

    const copyDir = (src: string, dest: string) => {
      if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
      }
      const entries = fs.readdirSync(src, { withFileTypes: true });
      for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
          copyDir(srcPath, destPath);
        } else if (entry.isFile()) {
          fs.copyFileSync(srcPath, destPath);
          copiedFiles++;
          totalBytes += fs.statSync(destPath).size;
        }
      }
    };

    copyDir(tempPath, validation.canonicalPath);
    return { copiedFiles, totalBytes };
  }
}

export const tempWorkspaceManager = TempWorkspaceManager.getInstance();
