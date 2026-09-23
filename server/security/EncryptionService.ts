import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { execSync } from 'child_process';
import { logger } from '../utils/logger';

export interface EncryptedData {
  encrypted: string;
  iv: string;
  authTag: string;
}

export class EncryptionService {
  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly IV_LENGTH = 12; // 96 bits recommandés pour GCM
  private masterKey: Buffer;

  constructor(customKey?: Buffer) {
    this.masterKey = customKey || this.resolveMasterKey();
  }

  /**
   * Obtient le chemin du dossier de sécurité pour la clé maîtresse.
   * Doit être impérativement hors du dépôt et hors du dossier de données runtime.
   */
  public static getMasterKeyDir(): string {
    if (process.platform === 'win32' && process.env.USERPROFILE) {
      return path.join(process.env.USERPROFILE, '.iroko_security');
    }
    return path.join(os.homedir(), '.iroko_security');
  }

  public static getMasterKeyPath(): string {
    return path.join(EncryptionService.getMasterKeyDir(), 'master.key');
  }

  /**
   * Résout la clé maîtresse AES-256 (32 octets).
   * 1. Variable d'environnement IROKO_MASTER_KEY si définie.
   * 2. Sinon, fichier sécurisé restreint à l'utilisateur courant.
   */
  private resolveMasterKey(): Buffer {
    const envKey = process.env.IROKO_MASTER_KEY;
    if (envKey && envKey.trim().length >= 16) {
      return crypto.createHash('sha256').update(envKey.trim()).digest();
    }

    const keyDir = EncryptionService.getMasterKeyDir();
    const keyPath = EncryptionService.getMasterKeyPath();

    if (!fs.existsSync(keyDir)) {
      try {
        fs.mkdirSync(keyDir, { recursive: true, mode: 0o700 });
      } catch (err) {
        logger.warn(`Impossible de créer le répertoire de sécurité : ${err}`);
      }
    }

    if (fs.existsSync(keyPath)) {
      try {
        const raw = fs.readFileSync(keyPath);
        if (raw.length === 32) {
          return raw;
        }
        return crypto.createHash('sha256').update(raw).digest();
      } catch (err) {
        logger.warn(`Erreur lors de la lecture de master.key, régénération : ${err}`);
      }
    }

    // Création d'une clé maîtresse cryptographique de 32 octets
    const newKey = crypto.randomBytes(32);
    try {
      fs.writeFileSync(keyPath, newKey, { mode: 0o600 });
      EncryptionService.applyRestrictedPermissions(keyPath, keyDir);
      logger.info('Clé maîtresse de sécurité Iroko générée et restreinte.');
    } catch (err) {
      logger.warn(`Impossible d'écrire master.key avec droits stricts : ${err}`);
    }

    return newKey;
  }

  /**
   * Applique les permissions restreintes à l'utilisateur courant du système
   */
  private static applyRestrictedPermissions(filePath: string, dirPath: string): void {
    if (process.platform === 'win32') {
      try {
        const username = process.env.USERNAME || process.env.USER;
        if (username) {
          // Désactiver l'héritage et accorder l'accès total uniquement à l'utilisateur courant
          execSync(`icacls "${filePath}" /inheritance:r /grant:r "${username}:F"`, { stdio: 'ignore' });
        }
      } catch {
        // En environnement sandboxé ou sans icacls, continuer sans bloquer
      }
    } else {
      try {
        fs.chmodSync(dirPath, 0o700);
        fs.chmodSync(filePath, 0o600);
      } catch {}
    }
  }

  /**
   * Chiffre une chaîne en AES-256-GCM avec IV aléatoire de 12 octets et tag d'authentification
   */
  public encrypt(plaintext: string): EncryptedData {
    const iv = crypto.randomBytes(EncryptionService.IV_LENGTH);
    const cipher = crypto.createCipheriv(EncryptionService.ALGORITHM, this.masterKey, iv);

    let encrypted = cipher.update(plaintext, 'utf-8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag().toString('hex');

    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag
    };
  }

  /**
   * Déchiffre une charge utile AES-256-GCM avec contrôle d'intégrité strict
   */
  public decrypt(encryptedData: EncryptedData, alternativeKey?: Buffer): string {
    const key = alternativeKey || this.masterKey;
    const iv = Buffer.from(encryptedData.iv, 'hex');
    const authTag = Buffer.from(encryptedData.authTag, 'hex');
    const decipher = crypto.createDecipheriv(EncryptionService.ALGORITHM, key, iv, { authTagLength: 16 });

    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf-8');
    decrypted += decipher.final('utf-8');

    return decrypted;
  }

  /**
   * Ancienne méthode de dérivation pour la migration des clés créées sous le schéma précédent
   */
  public static deriveLegacyKey(workspacePath: string): Buffer {
    const saltFile = path.join(workspacePath, '.iroko', '.master_salt');
    let salt: Buffer;
    if (fs.existsSync(saltFile)) {
      try {
        salt = fs.readFileSync(saltFile);
      } catch {
        salt = Buffer.from('default_salt_iroko_legacy_fallback');
      }
    } else {
      salt = Buffer.from('default_salt_iroko_legacy_fallback');
    }
    const machineId = `${process.platform}:${process.arch}:${process.env.USERNAME || process.env.USER || 'iroko'}`;
    return crypto.pbkdf2Sync(machineId, salt, 100000, 32, 'sha256');
  }

  /**
   * Masque une clé API pour l'affichage sans jamais exposer le secret.
   * Conserve le début (ex: sk-•••• ou ••••) et la fin (ex: 3A9B).
   */
  public static maskKey(key: string): string {
    if (!key || typeof key !== 'string') return '••••';
    const trimmed = key.trim();
    if (trimmed.length <= 8) {
      return '••••••••';
    }

    const prefix = trimmed.startsWith('sk-') ? 'sk-••••' : '••••';
    const suffix = trimmed.slice(-4);
    return `${prefix}••••${suffix}`;
  }
}

export const encryptionService = new EncryptionService();
