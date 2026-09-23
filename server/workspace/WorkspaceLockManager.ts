export interface WorkspaceLockStatus {
  acquired: boolean;
  isReadOnly: boolean;
  holderConvId?: string;
  message?: string;
}

export class WorkspaceLockManager {
  private static instance: WorkspaceLockManager;
  // Map canonicalWorkspacePath (lowercase on Windows) -> conversationId
  private locks: Map<string, { conversationId: string; lockedAt: string }> = new Map();

  public static getInstance(): WorkspaceLockManager {
    if (!WorkspaceLockManager.instance) {
      WorkspaceLockManager.instance = new WorkspaceLockManager();
    }
    return WorkspaceLockManager.instance;
  }

  private normalizeKey(workspacePath: string): string {
    return process.platform === 'win32' ? workspacePath.toLowerCase() : workspacePath;
  }

  /**
   * Tente d'acquérir le verrou d'écriture exclusif pour un dossier donné.
   * Si une autre conversation détient déjà le verrou, la conversation demandée passe en lecture seule.
   */
  public acquireLock(workspacePath: string, conversationId: string): WorkspaceLockStatus {
    const key = this.normalizeKey(workspacePath);
    const existing = this.locks.get(key);

    if (!existing || existing.conversationId === conversationId) {
      this.locks.set(key, {
        conversationId,
        lockedAt: new Date().toISOString()
      });
      return {
        acquired: true,
        isReadOnly: false
      };
    }

    return {
      acquired: false,
      isReadOnly: true,
      holderConvId: existing.conversationId,
      message: 'Ce dossier est actuellement ouvert en écriture dans une autre conversation. Cette conversation est en lecture seule.'
    };
  }

  /**
   * Libère le verrou d'écriture détenu par une conversation.
   */
  public releaseLock(conversationId: string): void {
    for (const [key, lock] of this.locks.entries()) {
      if (lock.conversationId === conversationId) {
        this.locks.delete(key);
      }
    }
  }

  /**
   * Vérifie si une conversation est en lecture seule sur un dossier.
   */
  public isReadOnly(workspacePath: string, conversationId?: string): boolean {
    if (!conversationId) return false;
    const key = this.normalizeKey(workspacePath);
    const existing = this.locks.get(key);
    return Boolean(existing && existing.conversationId !== conversationId);
  }

  /**
   * Retourne l'identifiant de la conversation détentrice du verrou.
   */
  public getLockHolder(workspacePath: string): string | null {
    const key = this.normalizeKey(workspacePath);
    const existing = this.locks.get(key);
    return existing ? existing.conversationId : null;
  }

  /**
   * Réinitialise tous les verrous (utile pour les tests).
   */
  public reset(): void {
    this.locks.clear();
  }
}

export const workspaceLockManager = WorkspaceLockManager.getInstance();
