import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { ProviderCredential, KeySelectionStrategy, ProviderErrorClassification } from '../types';
import { encryptionService, EncryptionService } from '../../security/EncryptionService';
import { SmartKeySelector } from './SmartKeySelector';
import { ErrorClassifier } from '../errors/ErrorClassifier';
import { logger } from '../../utils/logger';

export class KeyPoolManager {
  private credentials: Map<string, ProviderCredential> = new Map();
  private storageFilePath: string;
  private dataDir: string;

  constructor(customDataDir?: string, workspacePath = process.cwd()) {
    this.dataDir = customDataDir || process.env.IROKO_DATA_DIR || (
      process.platform === 'win32' && process.env.APPDATA
        ? path.join(process.env.APPDATA, 'iroko')
        : path.join(os.homedir(), '.iroko')
    );

    if (!fs.existsSync(this.dataDir)) {
      try {
        fs.mkdirSync(this.dataDir, { recursive: true });
      } catch (err) {
        logger.warn(`Impossible de créer le dossier runtime pour les clés : ${err}`);
      }
    }

    this.storageFilePath = path.join(this.dataDir, 'credentials.enc.json');
    this.migrateLegacyWorkspaceKeys(workspacePath);
    this.loadFromStorage();
    this.importEnvKeysIfEmpty();
  }

  /**
   * Migration transparente des anciennes clés du workspace vers le dossier runtime
   */
  private migrateLegacyWorkspaceKeys(workspacePath: string): void {
    const legacyPath = path.join(workspacePath, '.iroko', 'credentials.enc.json');
    if (!fs.existsSync(legacyPath)) return;

    try {
      const raw = fs.readFileSync(legacyPath, 'utf-8');
      const legacyCredentials = JSON.parse(raw) as ProviderCredential[];
      const legacyKey = EncryptionService.deriveLegacyKey(workspacePath);

      let migratedCount = 0;
      for (const cred of legacyCredentials) {
        let plainKey: string | null = null;
        try {
          plainKey = encryptionService.decrypt({
            encrypted: cred.encryptedSecret,
            iv: cred.iv,
            authTag: cred.authTag
          });
        } catch {
          try {
            plainKey = encryptionService.decrypt(
              {
                encrypted: cred.encryptedSecret,
                iv: cred.iv,
                authTag: cred.authTag
              },
              legacyKey
            );
          } catch {}
        }

        if (plainKey) {
          const { encrypted, iv, authTag } = encryptionService.encrypt(plainKey);
          cred.encryptedSecret = encrypted;
          cred.iv = iv;
          cred.authTag = authTag;
          cred.maskedKey = EncryptionService.maskKey(plainKey);
          this.credentials.set(cred.id, cred);
          migratedCount++;
        }
      }

      if (migratedCount > 0) {
        this.saveToStorage();
        logger.info(`Migration réussie de ${migratedCount} clé(s) depuis l'ancien emplacement workspace.`);
      }

      // Purge sécurisée de l'ancien fichier pour qu'aucun secret ne subsiste dans le dépôt
      try {
        fs.unlinkSync(legacyPath);
        const legacySalt = path.join(workspacePath, '.iroko', '.master_salt');
        if (fs.existsSync(legacySalt)) fs.unlinkSync(legacySalt);
      } catch {}
    } catch (err) {
      logger.warn(`Erreur lors de la migration des anciennes clés : ${err}`);
    }
  }

  /**
   * Ajoute une nouvelle clé API dans le pool de façon chiffrée
   */
  public async addKey(
    providerId: string,
    label: string,
    rawKey: string,
    priority = 1
  ): Promise<ProviderCredential> {
    const trimmed = rawKey.trim();
    if (!trimmed) {
      throw new Error('La clé API ne peut pas être vide.');
    }

    const { encrypted, iv, authTag } = encryptionService.encrypt(trimmed);
    const maskedKey = EncryptionService.maskKey(trimmed);

    const credential: ProviderCredential = {
      id: crypto.randomUUID(),
      providerId,
      label: label.trim() || `Clé ${maskedKey.slice(-4)}`,
      maskedKey,
      encryptedSecret: encrypted,
      iv,
      authTag,
      status: 'ACTIVE',
      enabled: true,
      priority: Math.max(1, priority),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      failureCount: 0,
      successCount: 0,
      totalRequests: 0,
      activeRequests: 0,
      healthScore: 100
    };

    this.credentials.set(credential.id, credential);
    this.saveToStorage();
    logger.info(`Clé ajoutée pour ${providerId} (${credential.label}, ${maskedKey})`);

    return this.maskCredential(credential);
  }

  /**
   * Supprime une clé du pool
   */
  public removeKey(id: string): boolean {
    const existed = this.credentials.delete(id);
    if (existed) {
      this.saveToStorage();
      logger.info(`Clé supprimée : ${id}`);
    }
    return existed;
  }

  /**
   * Supprime toutes les clés du pool
   */
  public clearAllKeys(): number {
    const count = this.credentials.size;
    this.credentials.clear();
    this.saveToStorage();
    logger.info(`Toutes les clés ont été supprimées (${count} clés).`);
    return count;
  }

  /**
   * Met à jour une clé (label, priorité, enabled, status)
   */
  public updateKey(
    id: string,
    updates: Partial<Pick<ProviderCredential, 'label' | 'priority' | 'enabled' | 'status'>>
  ): ProviderCredential | null {
    const cred = this.credentials.get(id);
    if (!cred) return null;

    if (updates.label !== undefined) cred.label = updates.label;
    if (updates.priority !== undefined) cred.priority = updates.priority;
    if (updates.enabled !== undefined) cred.enabled = updates.enabled;
    if (updates.status !== undefined) cred.status = updates.status;
    cred.updatedAt = Date.now();

    this.saveToStorage();
    return this.maskCredential(cred);
  }

  /**
   * Retourne toutes les clés pour l'affichage UI (secrets chiffrés masqués)
   */
  public getAllKeysMasked(): ProviderCredential[] {
    return Array.from(this.credentials.values()).map(c => this.maskCredential(c));
  }

  /**
   * Retourne la collection brute des clés
   */
  public getAllKeys(): ProviderCredential[] {
    return Array.from(this.credentials.values());
  }

  /**
   * Retourne les clés d'un provider
   */
  public getKeysByProvider(providerId: string): ProviderCredential[] {
    return Array.from(this.credentials.values())
      .filter(c => c.providerId === providerId)
      .map(c => this.maskCredential(c));
  }

  /**
   * Retourne la liste unique des identifiants de fournisseurs configurés et actifs
   */
  public getConfiguredProviderIds(): string[] {
    const set = new Set<string>();
    for (const cred of this.credentials.values()) {
      if (cred.enabled && cred.status !== 'DISABLED' && cred.status !== 'INVALID') {
        set.add(cred.providerId);
      }
    }
    return Array.from(set);
  }

  /**
   * Déchiffre le secret d'une clé (usage strictement interne au runtime)
   */
  public getDecryptedKey(id: string): string | null {
    const cred = this.credentials.get(id);
    if (!cred) return null;

    try {
      return encryptionService.decrypt({
        encrypted: cred.encryptedSecret,
        iv: cred.iv,
        authTag: cred.authTag
      });
    } catch (err) {
      logger.error(`Échec de déchiffrement pour la clé ${id} : ${err}`);
      return null;
    }
  }

  /**
   * Sélectionne et réserve la meilleure clé disponible avec vérification de validité et cooldown
   */
  public acquireKey(
    providerId: string,
    strategy: KeySelectionStrategy = 'SMART'
  ): { credential: ProviderCredential; rawKey: string; release: () => void } | null {
    const now = Date.now();

    // Réactiver les clés dont le cooldown est expiré
    for (const c of this.credentials.values()) {
      if (c.providerId === providerId && c.status === 'COOLDOWN' && c.cooldownUntil && now >= c.cooldownUntil) {
        c.status = 'ACTIVE';
        c.cooldownUntil = undefined;
      }
    }

    const candidateList = Array.from(this.credentials.values()).filter(c => {
      if (c.providerId !== providerId) return false;
      if (!c.enabled) return false;
      if (c.status === 'INVALID' || c.status === 'QUOTA_EXHAUSTED' || c.status === 'DISABLED') return false;
      if (c.status === 'COOLDOWN' && c.cooldownUntil && now < c.cooldownUntil) return false;
      return true;
    });

    if (candidateList.length === 0) {
      return null;
    }

    const selected = SmartKeySelector.selectKey(candidateList, strategy);
    if (!selected) {
      return null;
    }

    const rawKey = this.getDecryptedKey(selected.id);
    if (!rawKey) {
      selected.status = 'ERROR';
      selected.lastErrorMessage = 'Échec de déchiffrement du secret local.';
      this.saveToStorage();
      return null;
    }

    // Incrémenter le verrou de concurrence active
    selected.activeRequests++;
    selected.lastUsedAt = now;

    let released = false;
    const release = () => {
      if (!released) {
        selected.activeRequests = Math.max(0, selected.activeRequests - 1);
        released = true;
      }
    };

    return {
      credential: { ...selected },
      rawKey,
      release
    };
  }

  /**
   * Signale le succès d'un appel avec cette clé
   */
  public reportSuccess(keyId: string): void {
    const cred = this.credentials.get(keyId);
    if (!cred) return;

    cred.successCount++;
    cred.totalRequests++;
    cred.failureCount = 0;
    cred.lastSuccessAt = Date.now();
    cred.status = 'ACTIVE';
    cred.cooldownUntil = undefined;
    cred.healthScore = Math.min(100, cred.healthScore + 5);

    this.saveToStorage();
  }

  /**
   * Signale l'échec d'un appel avec cette clé et applique la qualification d'erreur
   */
  public reportFailure(keyId: string, error: unknown): ProviderErrorClassification {
    const cred = this.credentials.get(keyId);
    const classification = ErrorClassifier.classify(error, (cred?.failureCount || 0) + 1);

    if (!cred) return classification;

    cred.failureCount++;
    cred.totalRequests++;
    cred.lastFailureAt = Date.now();
    cred.lastErrorCode = classification.statusCode ? String(classification.statusCode) : classification.category;
    cred.lastErrorMessage = classification.message;

    // Dégradation du score de santé
    cred.healthScore = Math.max(0, cred.healthScore - (classification.category === 'AUTH_ERROR' ? 100 : 25));

    // Règle 401/403 : clé désactivée immédiatement sans tentative future uniquement si invalidité authentique confirmée
    if (classification.category === 'AUTH_ERROR' && (classification.statusCode === 401 || (classification.message && classification.message.toLowerCase().includes('invalid api key')))) {
      cred.status = 'INVALID';
      cred.enabled = false;
      logger.warn(`Clé ${cred.id} (${cred.label}) désactivée définitivement : ${classification.message}`);
    } else if (classification.category === 'QUOTA_EXHAUSTED' || classification.statusCode === 402) {
      cred.status = 'QUOTA_EXHAUSTED';
      cred.enabled = false;
      logger.warn(`Clé ${cred.id} (${cred.label}) quota épuisé : ${classification.message}`);
    } else if (classification.shouldCooldown && classification.cooldownSeconds) {
      cred.status = 'COOLDOWN';
      cred.cooldownUntil = Date.now() + classification.cooldownSeconds * 1000;
      logger.warn(`Clé ${cred.id} (${cred.label}) placée en COOLDOWN (${classification.cooldownSeconds}s)`);
    } else {
      // Pour les erreurs temporaires d'exécution (400, 500, timeout, paramètres incompatibles...), la clé reste utilisable
      cred.status = 'ACTIVE';
    }

    this.saveToStorage();
    return classification;
  }

  /**
   * Importe automatiquement les variables d'environnement existantes pour un démarrage sans friction
   */
  private importEnvKeysIfEmpty(): void {
    const envMappings: Array<{ provider: string; envVar: string; label: string }> = [
      { provider: 'openai', envVar: 'OPENAI_API_KEY', label: 'Clé OpenAI (.env)' },
      { provider: 'gemini', envVar: 'GEMINI_API_KEY', label: 'Clé Google Gemini (.env)' },
      { provider: 'anthropic', envVar: 'ANTHROPIC_API_KEY', label: 'Clé Anthropic (.env)' },
      { provider: 'openrouter', envVar: 'OPENROUTER_API_KEY', label: 'Clé OpenRouter (.env)' }
    ];

    for (const m of envMappings) {
      const val = process.env[m.envVar];
      if (val && val.trim()) {
        const existing = Array.from(this.credentials.values()).some(c => c.providerId === m.provider);
        if (!existing) {
          try {
            this.addKey(m.provider, m.label, val, 1);
          } catch (e) {
            logger.warn(`Impossible d'importer la clé ${m.envVar} : ${e}`);
          }
        }
      }
    }
  }

  private maskCredential(c: ProviderCredential): ProviderCredential {
    return {
      ...c,
      encryptedSecret: '***REDACTED***',
      iv: '***REDACTED***',
      authTag: '***REDACTED***'
    };
  }

  private loadFromStorage(): void {
    if (!fs.existsSync(this.storageFilePath)) return;

    try {
      const raw = fs.readFileSync(this.storageFilePath, 'utf-8');
      const data = JSON.parse(raw) as ProviderCredential[];
      for (const item of data) {
        item.activeRequests = 0;
        this.credentials.set(item.id, item);
      }
    } catch (e) {
      logger.error(`Erreur lors du chargement des clés runtime : ${e}`);
    }
  }

  private saveToStorage(): void {
    try {
      const arr = Array.from(this.credentials.values());
      fs.writeFileSync(this.storageFilePath, JSON.stringify(arr, null, 2), 'utf-8');
    } catch (e) {
      logger.error(`Erreur de sauvegarde des clés runtime : ${e}`);
    }
  }
}

export const keyPoolManager = new KeyPoolManager();
