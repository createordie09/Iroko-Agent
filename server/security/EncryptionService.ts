import crypto from 'crypto';
import path from 'path';
import fs from 'fs';

export interface EncryptedData {
  encrypted: string;
  iv: string;
  authTag: string;
}

export class EncryptionService {
  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly IV_LENGTH = 12; // 96 bits pour GCM
  private masterKey: Buffer;

  constructor(workspacePath?: string) {
    this.masterKey = this.deriveMasterKey(workspacePath || process.cwd());
  }

  /**
   * Dérive une clé AES-256 de 32 octets de façon reproductible et sécurisée
   */
  private deriveMasterKey(workspacePath: string): Buffer {
    const envKey = process.env.IROKO_MASTER_KEY;
    if (envKey && envKey.length >= 16) {
      return crypto.createHash('sha256').update(envKey).digest();
    }

    // Sinon, générer ou lire un salt unique par installation dans .iroko/
    const irokoDir = path.join(workspacePath, '.iroko');
    const saltFile = path.join(irokoDir, '.master_salt');

    let salt: Buffer;
    if (!fs.existsSync(irokoDir)) {
      try { fs.mkdirSync(irokoDir, { recursive: true }); } catch {}
    }

    if (fs.existsSync(saltFile)) {
      try {
        salt = fs.readFileSync(saltFile);
      } catch {
        salt = crypto.randomBytes(32);
      }
    } else {
      salt = crypto.randomBytes(32);
      try {
        fs.writeFileSync(saltFile, salt);
      } catch {}
    }

    const machineId = `${process.platform}:${process.arch}:${process.env.USERNAME || process.env.USER || 'iroko'}`;
    return crypto.pbkdf2Sync(machineId, salt, 100000, 32, 'sha256');
  }

  /**
   * Chiffre une chaîne de caractères en AES-256-GCM
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
   * Déchiffre une chaîne chiffrée avec vérification d'intégrité
   */
  public decrypt(encryptedData: EncryptedData): string {
    const iv = Buffer.from(encryptedData.iv, 'hex');
    const authTag = Buffer.from(encryptedData.authTag, 'hex');
    const decipher = crypto.createDecipheriv(EncryptionService.ALGORITHM, this.masterKey, iv);

    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf-8');
    decrypted += decipher.final('utf-8');

    return decrypted;
  }

  /**
   * Masque une clé d'API pour l'affichage sécurisé (ex: "••••••••3A9B")
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
