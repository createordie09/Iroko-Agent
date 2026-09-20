import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { ProviderCredential, KeySelectionStrategy, ProviderErrorClassification } from '../types';
import { encryptionService, EncryptionService } from '../../security/EncryptionService';
import { SmartKeySelector } from './SmartKeySelector';
import { ErrorClassifier } from '../errors/ErrorClassifier';

export class KeyPoolManager {
  private credentials: Map<string, ProviderCredential> = new Map();
  private storageFilePath: string;

  constructor(workspacePath = process.cwd()) {
    const irokoDir = path.join(workspacePath, '.iroko');
    if (!fs.existsSync(irokoDir)) {
      try { fs.mkdirSync(irokoDir, { recursive: true }); } catch {}
    }
    this.storageFilePath = path.join(irokoDir, 'credentials.enc.json');
    this.loadFromStorage();
    this.importEnvKeysIfEmpty();
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
    console.log(`[KeyPoolManager] Clé ajoutée pour ${providerId} (${credential.label}, ${maskedKey})`);

    return this.maskCredential(credential);
  }

  /**
   * Supprime une clé du pool
   */
  public removeKey(id: string): boolean {
    const existed = this.credentials.delete(id);
    if (existed) {
      this.saveToStorage();
      console.log(`[KeyPoolManager] Clé supprimée : ${id}`);
    }
    return existed;
  }

  /**
   * Met à jour une clé (label, priorité, enabled, status)
   */
  public updateKey(id: string, updates: Partial<Pick<ProviderCredential, 'label' | 'priority' | 'enabled' | 'status'>>): ProviderCredential | null {
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
   * Retourne les clés d'un provider
   */
  public getKeysByProvider(providerId: string): ProviderCredential[] {
    return Array.from(this.credentials.values())
      .filter(c => c.providerId === providerId)
      .map(c => this.maskCredential(c));
  }

  /**
   * Déchiffre le secret d'une clé (usage strictement interne)
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
      console.error(`[KeyPoolManager] Erreur de déchiffrement pour ${id} :`, err);
      return null;
    }
  }

  /**
   * Sélectionne et réserve la meilleure clé disponible avec gestion de concurrence
   */
  public acquireKey(
    providerId: string,
    strategy: KeySelectionStrategy = 'SMART'
  ): { credential: ProviderCredential; rawKey: string; release: () => void } | null {
    const candidateList = Array.from(this.credentials.values()).filter(c => c.providerId === providerId);
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
    selected.lastUsedAt = Date.now();

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
    // Remonter le score de santé doucement jusqu'à 100
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

    if (classification.shouldDisableKey) {
      cred.status = classification.category === 'QUOTA_EXHAUSTED' ? 'QUOTA_EXHAUSTED' : 'INVALID';
      console.warn(`[KeyPoolManager] Clé ${cred.id} (${cred.label}) marquée ${cred.status} : ${classification.message}`);
    } else if (classification.shouldCooldown && classification.cooldownSeconds) {
      cred.status = 'COOLDOWN';
      cred.cooldownUntil = Date.now() + classification.cooldownSeconds * 1000;
      console.warn(`[KeyPoolManager] Clé ${cred.id} (${cred.label}) placée en COOLDOWN jusqu'à ${new Date(cred.cooldownUntil).toISOString()}`);
    } else {
      cred.status = 'ERROR';
    }

    this.saveToStorage();
    return classification;
  }

  /**
   * Importe automatiquement les variables d'environnement existantes pour un démarrage transparent
   */
  private importEnvKeysIfEmpty(): void {
    const envMappings: Array<{ provider: string; envVar: string; label: string }> = [
      { provider: 'openai', envVar: 'OPENAI_API_KEY', label: 'Clé OpenAI (.env)' },
      { provider: 'gemini', envVar: 'GEMINI_API_KEY', label: 'Clé Google Gemini (.env)' },
      { provider: 'anthropic', envVar: 'ANTHROPIC_API_KEY', label: 'Clé Anthropic Claude (.env)' },
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
            console.warn(`[KeyPoolManager] Impossible d'importer la clé ${m.envVar} :`, e);
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
        // Réinitialiser les verrous de concurrence active au chargement
        item.activeRequests = 0;
        this.credentials.set(item.id, item);
      }
    } catch (e) {
      console.error('[KeyPoolManager] Erreur lors du chargement du fichier de clés :', e);
    }
  }

  private saveToStorage(): void {
    try {
      const arr = Array.from(this.credentials.values());
      fs.writeFileSync(this.storageFilePath, JSON.stringify(arr, null, 2), 'utf-8');
    } catch (e) {
      console.error('[KeyPoolManager] Erreur de sauvegarde du fichier de clés :', e);
    }
  }
}

export const keyPoolManager = new KeyPoolManager();
