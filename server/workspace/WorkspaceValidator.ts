import path from 'path';
import fs from 'fs';
import os from 'os';
import { PathSanitizer } from '../security/PathSanitizer';

export interface WorkspaceValidationResult {
  valid: boolean;
  canonicalPath?: string;
  name?: string;
  warning?: string;
  error?: string;
}

export class WorkspaceValidator {
  /**
   * Valide rigoureusement un chemin de dossier avant acceptation comme workspace.
   * Conforme au cahier des charges (§12, §26).
   */
  public static validate(rawPath: string): WorkspaceValidationResult {
    if (!rawPath || typeof rawPath !== 'string' || !rawPath.trim()) {
      return { valid: false, error: 'Chemin de dossier vide ou invalide.' };
    }

    const trimmed = rawPath.trim();

    // 1. Refus des chemins de périphériques Windows ou UNC réseau
    if (/^[\\/]{2}[?.][\\/]/.test(trimmed) || trimmed.startsWith('\\\\') || trimmed.startsWith('//')) {
      return { valid: false, error: 'Accès refusé : les chemins réseau ou périphériques ne sont pas autorisés.' };
    }

    // 2. Vérification de l'existence et du type dossier
    const resolved = path.resolve(trimmed);
    if (!fs.existsSync(resolved)) {
      return { valid: false, error: `Le chemin spécifié n'existe pas : "${resolved}".` };
    }

    let stats: fs.Stats;
    try {
      stats = fs.statSync(resolved);
    } catch (err: any) {
      return { valid: false, error: `Impossible d'accéder au chemin : ${err.message}` };
    }

    if (!stats.isDirectory()) {
      return { valid: false, error: `Le chemin spécifié n'est pas un dossier : "${resolved}".` };
    }

    // 3. Résolution canonique (realpath) pour neutraliser les liens symboliques et jonctions
    let canonicalPath: string;
    try {
      canonicalPath = fs.realpathSync(resolved);
    } catch (err: any) {
      return { valid: false, error: `Erreur lors de la résolution canonique du dossier : ${err.message}` };
    }

    // 4. Refus strict des racines de disque
    const isWindows = process.platform === 'win32';
    if (isWindows) {
      // Sous Windows : C:\, D:\, C:, \\
      if (/^[a-zA-Z]:[\\/]?$/.test(canonicalPath) || /^[a-zA-Z]:[\\/]?$/.test(trimmed)) {
        return { valid: false, error: 'Accès refusé : la racine d\'un lecteur ne peut pas servir de workspace.' };
      }
    } else {
      // Sous Unix : /
      if (canonicalPath === '/') {
        return { valid: false, error: 'Accès refusé : la racine du système (/) ne peut pas servir de workspace.' };
      }
    }

    // 5. Refus strict des dossiers système
    const lowerCanonical = canonicalPath.toLowerCase();
    const systemDirsWindows = [
      'c:\\windows',
      'c:\\program files',
      'c:\\program files (x86)',
      'c:\\programdata',
      'c:\\recovery',
      'c:\\system volume information',
      'c:\\$recycle.bin'
    ];

    if (isWindows) {
      for (const sysDir of systemDirsWindows) {
        if (lowerCanonical === sysDir || lowerCanonical.startsWith(sysDir + '\\')) {
          return { valid: false, error: `Accès refusé : le dossier système "${canonicalPath}" ne peut pas servir de workspace.` };
        }
      }
      // Vérification des variables système courantes
      const winDir = (process.env.WINDIR || 'C:\\Windows').toLowerCase();
      if (lowerCanonical === winDir || lowerCanonical.startsWith(winDir + '\\')) {
        return { valid: false, error: 'Accès refusé : le répertoire Windows est sanctuarisé.' };
      }
    } else {
      const systemDirsUnix = [
        '/etc',
        '/sys',
        '/proc',
        '/dev',
        '/boot',
        '/root',
        '/bin',
        '/sbin',
        '/usr/bin',
        '/usr/sbin',
        '/lib',
        '/lib64'
      ];
      for (const sysDir of systemDirsUnix) {
        if (canonicalPath === sysDir || canonicalPath.startsWith(sysDir + '/')) {
          return { valid: false, error: `Accès refusé : le dossier système "${canonicalPath}" ne peut pas servir de workspace.` };
        }
      }
    }

    // 6. Refus strict du répertoire de données du runtime
    if (PathSanitizer.isRuntimeDataPath(canonicalPath)) {
      return { valid: false, error: 'Accès refusé : le répertoire de données d\'Iroko est sanctuarisé.' };
    }

    // 7. Vérification d'accessibilité en lecture et écriture
    try {
      fs.accessSync(canonicalPath, fs.constants.R_OK | fs.constants.W_OK);
    } catch (err: any) {
      return { valid: false, error: `Permissions insuffisantes : le dossier "${canonicalPath}" n'est pas accessible en lecture/écriture.` };
    }

    // 8. Avertissement si l'utilisateur choisit l'intégralité de son dossier personnel
    let warning: string | undefined;
    try {
      const homeCanonical = fs.realpathSync(os.homedir());
      const compHome = isWindows ? homeCanonical.toLowerCase() : homeCanonical;
      const compTarget = isWindows ? canonicalPath.toLowerCase() : canonicalPath;

      if (compTarget === compHome) {
        warning = 'Attention : vous avez sélectionné l\'intégralité de votre dossier personnel. Il est vivement recommandé de choisir un sous-dossier de projet.';
      }
    } catch {}

    const name = path.basename(canonicalPath) || canonicalPath;

    return {
      valid: true,
      canonicalPath,
      name,
      warning
    };
  }
}
