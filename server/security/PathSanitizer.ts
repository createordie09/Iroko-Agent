import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';

export interface PathValidationResult {
  valid: boolean;
  canonicalPath?: string;
  error?: string;
  isSensitive?: boolean;
}

// Noms réservés sous Windows (DOS device names), avec ou sans extension
const WINDOWS_RESERVED_NAMES = new Set([
  'con', 'prn', 'aux', 'nul',
  'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
  'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9'
]);

export class PathSanitizer {
  /**
   * Obtient le chemin canonique réel d'un dossier de workspace.
   */
  public static getCanonicalWorkspace(workspacePath: string): string {
    try {
      const resolved = path.resolve(workspacePath);
      if (fs.existsSync(resolved)) {
        return fs.realpathSync(resolved);
      }
      return resolved;
    } catch {
      return path.resolve(workspacePath);
    }
  }

  /**
   * Vérifie si un chemin cible est situé dans le répertoire de données du runtime.
   * Si allowedTempWorkspace est fourni, les fichiers situés strictement au sein de cet espace temporaire sont autorisés.
   */
  public static isRuntimeDataPath(targetPath: string, options?: { allowedTempWorkspace?: string }): boolean {
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

      if (resolvedTarget.startsWith(resolvedSec)) {
        return true;
      }

      if (resolvedTarget.startsWith(resolvedData)) {
        if (options?.allowedTempWorkspace) {
          const resolvedAllowed = path.resolve(options.allowedTempWorkspace).toLowerCase();
          const tempBaseDir = path.join(resolvedData, 'workspaces', 'temp').toLowerCase();
          if (resolvedAllowed.startsWith(tempBaseDir) && (resolvedTarget === resolvedAllowed || resolvedTarget.startsWith(resolvedAllowed + path.sep))) {
            return false;
          }
        }
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Vérifie si un fichier correspond à un fichier sensible (secrets, clés, .env).
   */
  public static isSensitiveFile(filePath: string, options?: { allowedTempWorkspace?: string }): boolean {
    const base = path.basename(filePath).toLowerCase();

    // 1. Fichiers .env
    if (base === '.env' || base.startsWith('.env.')) {
      return true;
    }

    // 2. Certificats et clés privées
    if (
      base.endsWith('.pem') ||
      base.endsWith('.key') ||
      base.endsWith('.pfx') ||
      base.endsWith('.p12') ||
      base.endsWith('.pkcs12') ||
      base.endsWith('.kdbx')
    ) {
      return true;
    }

    // 3. Clés SSH privées courantes
    if (['id_rsa', 'id_ed25519', 'id_ecdsa', 'id_dsa'].includes(base)) {
      return true;
    }

    // 4. Répertoire de données du runtime
    if (this.isRuntimeDataPath(filePath, options)) {
      return true;
    }

    return false;
  }

  /**
   * Valide et confine rigoureusement un chemin relatif ou absolu au sein du workspace.
   * Prend en compte toutes les spécificités de Windows et d'Unix.
   */
  public static validatePath(
    rawPath: string,
    workspacePath: string,
    options: { allowCreation?: boolean } = {}
  ): PathValidationResult {
    if (!rawPath || typeof rawPath !== 'string') {
      return { valid: false, error: 'Chemin de fichier invalide ou vide.' };
    }

    if (!rawPath.trim()) {
      return { valid: false, error: 'Chemin de fichier vide.' };
    }

    // 1. Refus des chemins de périphériques Windows : \\?\ ou \\.\ ou //?/ ou //./
    if (/^[\\/]{2}[?.][\\/]/.test(rawPath)) {
      return { valid: false, error: 'Accès refusé : les chemins de périphériques Windows ne sont pas autorisés.' };
    }

    // 2. Refus strict des chemins UNC réseau : \\server\share ou //server/share
    if (rawPath.startsWith('\\\\') || rawPath.startsWith('//')) {
      return { valid: false, error: 'Accès refusé : les chemins UNC réseau ne sont pas autorisés.' };
    }

    // 3. Refus des flux de données alternatifs NTFS (Alternate Data Streams : file:stream)
    // Sous Windows, 'C:' est légitime, mais 'file:stream' ou 'C:\dir\file:stream' est un ADS
    const withoutDrive = rawPath.replace(/^[a-zA-Z]:/, '');
    if (withoutDrive.includes(':')) {
      return { valid: false, error: 'Accès refusé : les flux de données alternatifs NTFS ne sont pas autorisés.' };
    }

    // 4. Découpage en segments pour analyse approfondie
    const normalizedSeparators = rawPath.replace(/\\/g, '/');
    const segments = normalizedSeparators.split('/').filter(Boolean);

    for (const segment of segments) {
      // 4.1 Refus des noms avec espace ou point final (contournement Windows)
      if (segment !== '.' && segment !== '..' && (segment.endsWith(' ') || segment.endsWith('.'))) {
        return { valid: false, error: `Accès refusé : le segment "${segment}" se termine par un espace ou un point.` };
      }

      // 4.2 Refus des noms réservés Windows (DOS device names)
      const dotIndex = segment.indexOf('.');
      const baseName = (dotIndex === -1 ? segment : segment.substring(0, dotIndex)).toLowerCase();
      if (WINDOWS_RESERVED_NAMES.has(baseName)) {
        return { valid: false, error: `Accès refusé : le nom de fichier ou dossier "${segment}" est réservé par le système.` };
      }

      // 4.3 Refus des noms courts DOS 8.3 (ex: FOO~1.TXT)
      if (/~[0-9]/.test(segment)) {
        return { valid: false, error: `Accès refusé : les noms courts au format 8.3 ("${segment}") ne sont pas autorisés.` };
      }
    }

    // 5. Résolution absolue et canonique
    const canonicalWorkspace = this.getCanonicalWorkspace(workspacePath);
    const fullPath = path.resolve(canonicalWorkspace, rawPath);

    // 6. Vérification anti-traversée (..) et confinement strict
    const isWindows = process.platform === 'win32';
    const compareTarget = isWindows ? fullPath.toLowerCase() : fullPath;
    const compareWorkspace = isWindows ? canonicalWorkspace.toLowerCase() : canonicalWorkspace;

    if (!compareTarget.startsWith(compareWorkspace)) {
      return { valid: false, error: 'Accès refusé : tentative de sortie du workspace.' };
    }

    // 7. Résolution canonique (realpath) pour neutraliser les liens symboliques et jonctions NTFS
    let canonicalTarget = fullPath;
    if (fs.existsSync(fullPath)) {
      try {
        canonicalTarget = fs.realpathSync(fullPath);
      } catch (err: any) {
        return { valid: false, error: `Erreur lors de la résolution du lien symbolique : ${err.message}` };
      }
    } else if (options.allowCreation) {
      // Si le fichier n'existe pas encore, trouver le parent existant le plus proche
      let currentParent = path.dirname(fullPath);
      while (!fs.existsSync(currentParent) && currentParent !== path.dirname(currentParent)) {
        currentParent = path.dirname(currentParent);
      }
      if (fs.existsSync(currentParent)) {
        try {
          const canonicalParent = fs.realpathSync(currentParent);
          const compParent = isWindows ? canonicalParent.toLowerCase() : canonicalParent;
          if (!compParent.startsWith(compareWorkspace)) {
            return { valid: false, error: 'Accès refusé : le dossier parent cible résout hors du workspace via un lien symbolique.' };
          }
        } catch {}
      }
    }

    // 8. Re-vérification du chemin canonique résolu
    const compareCanonicalTarget = isWindows ? canonicalTarget.toLowerCase() : canonicalTarget;
    if (!compareCanonicalTarget.startsWith(compareWorkspace)) {
      return { valid: false, error: 'Accès refusé : le lien symbolique ou la jonction pointe en dehors du workspace.' };
    }

    // 9. Interdiction formelle du dossier de données runtime
    if (this.isRuntimeDataPath(canonicalTarget, { allowedTempWorkspace: canonicalWorkspace })) {
      return { valid: false, error: 'Accès interdit : le répertoire de données du runtime est sanctuarisé.' };
    }

    const isSensitive = this.isSensitiveFile(canonicalTarget, { allowedTempWorkspace: canonicalWorkspace });

    return {
      valid: true,
      canonicalPath: canonicalTarget,
      isSensitive
    };
  }

  /**
   * Détecte si un fichier est binaire (octets nuls ou ratio élevé d'octets non imprimables).
   */
  public static isBinaryFile(filePath: string): boolean {
    try {
      const buffer = Buffer.alloc(512);
      const fd = fs.openSync(filePath, 'r');
      const bytesRead = fs.readSync(fd, buffer, 0, 512, 0);
      fs.closeSync(fd);

      if (bytesRead === 0) return false;

      let nonPrintable = 0;
      for (let i = 0; i < bytesRead; i++) {
        const byte = buffer[i];
        if (byte === 0x00) {
          // Présence d'un octet nul = fichier binaire immédiat
          return true;
        }
        // Caractères imprimables ASCII standard et caractères de contrôle courants
        if (
          byte < 0x09 ||
          (byte > 0x0d && byte < 0x20) ||
          byte === 0x7f
        ) {
          nonPrintable++;
        }
      }

      // Plus de 30% d'octets non imprimables = fichier binaire
      return nonPrintable / bytesRead > 0.3;
    } catch {
      return false;
    }
  }

  /**
   * Écrit un fichier de manière atomique dans le workspace :
   * 1. Écriture dans un fichier temporaire unique dans le même dossier
   * 2. Renommage atomique vers la cible finale
   */
  public static writeAtomic(
    targetPath: string,
    content: string | Buffer,
    encoding: BufferEncoding = 'utf-8'
  ): void {
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const tempFile = path.join(dir, `.${path.basename(targetPath)}.${crypto.randomUUID()}.tmp`);

    try {
      fs.writeFileSync(tempFile, content, encoding);
      // Renommage atomique
      fs.renameSync(tempFile, targetPath);
    } catch (err) {
      // Nettoyage du temporaire en cas d'échec
      if (fs.existsSync(tempFile)) {
        try { fs.unlinkSync(tempFile); } catch {}
      }
      throw err;
    }
  }

  /**
   * Sauvegarde une copie du fichier original dans le dossier de données du runtime
   * avant toute modification par edit_file pour permettre l'annulation et l'audit.
   */
  public static backupFile(workspacePath: string, fullPath: string): string | null {
    if (!fs.existsSync(fullPath)) return null;

    try {
      const dataDir = process.env.IROKO_DATA_DIR || (
        process.platform === 'win32' && process.env.APPDATA
          ? path.join(process.env.APPDATA, 'iroko')
          : path.join(os.homedir(), '.iroko')
      );
      const canonical = this.getCanonicalWorkspace(workspacePath);
      const projectHash = crypto.createHash('sha256').update(canonical.toLowerCase()).digest('hex').substring(0, 16);
      const backupDir = path.join(dataDir, 'backups', projectHash);

      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFileName = `${path.basename(fullPath)}.${timestamp}.bak`;
      const backupPath = path.join(backupDir, backupFileName);

      fs.copyFileSync(fullPath, backupPath);
      return backupPath;
    } catch (err) {
      console.warn('[PathSanitizer] Avertissement lors de la sauvegarde préalable :', err);
      return null;
    }
  }
}
