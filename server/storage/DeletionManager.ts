/**
 * DeletionManager — Gestionnaire de suppressions différées avec annulation (Mission R4b)
 *
 * Gère le cycle de vie des suppressions avec délai de rétractation (5 secondes par défaut) :
 * 1. Marque l'élément supprimé logiquement (non visible dans les requêtes de lecture).
 * 2. Conserve l'élément et ses fichiers associés (pièces jointes, artéfacts) sur disque.
 * 3. Permet l'annulation immédiate ("Annuler") sans aucune perte.
 * 4. Déclenche la purge physique réelle à l'expiration du délai (fichiers compris).
 * 5. À la relance de l'application, purge immédiatement les suppressions dont le délai est expiré.
 */
import { runtimeDatabase } from './RuntimeDatabase';
import { attachmentManager } from '../attachments/AttachmentManager';
import { artifactManager } from '../artifacts/ArtifactManager';
import { skillManager } from '../skills/SkillManager';

export type DeletableItemType = 'conversation' | 'message' | 'memory' | 'skill';

export interface PendingDeletion {
  id: string;
  itemType: DeletableItemType;
  deletedAt: string;
  purgeAt: string;
  metadata?: any;
}

export class DeletionManager {
  private activeTimers: Map<string, NodeJS.Timeout> = new Map();

  private key(itemType: string, id: string): string {
    return `${itemType}:${id}`;
  }

  /**
   * Planifie la suppression différée d'un élément (5 secondes par défaut)
   */
  public scheduleDeletion(
    itemType: DeletableItemType,
    id: string,
    durationMs: number = 5000,
    metadata?: any
  ): PendingDeletion {
    if (itemType === 'skill') {
      const skill = skillManager.getSkill(id);
      if (skill?.isSystem) {
        throw new Error(`Impossible de supprimer la compétence système "${id}".`);
      }
    }
    const k = this.key(itemType, id);
    if (this.activeTimers.has(k)) {
      clearTimeout(this.activeTimers.get(k)!);
      this.activeTimers.delete(k);
    }

    const pending = runtimeDatabase.markPendingDeletion(itemType, id, durationMs, metadata);

    const timer = setTimeout(() => {
      this.activeTimers.delete(k);
      this.executePhysicalPurge(itemType, id);
    }, durationMs);

    if (typeof timer.unref === 'function') {
      timer.unref();
    }

    this.activeTimers.set(k, timer);
    return pending as PendingDeletion;
  }

  /**
   * Annule une suppression en attente et restaure l'élément immédiatement
   */
  public cancelDeletion(itemType: DeletableItemType, id: string): boolean {
    const k = this.key(itemType, id);
    if (this.activeTimers.has(k)) {
      clearTimeout(this.activeTimers.get(k)!);
      this.activeTimers.delete(k);
    }
    return runtimeDatabase.cancelPendingDeletion(itemType, id);
  }

  /**
   * Exécute la purge physique définitive de l'élément et de tous ses fichiers associés
   */
  public executePhysicalPurge(itemType: DeletableItemType | string, id: string): boolean {
    const k = this.key(itemType, id);
    if (this.activeTimers.has(k)) {
      clearTimeout(this.activeTimers.get(k)!);
      this.activeTimers.delete(k);
    }

    try {
      if (itemType === 'conversation') {
        attachmentManager.deleteConversationAttachments(id);
        artifactManager.deleteConversationArtifacts(id);
        runtimeDatabase.deleteConversation(id);
      } else if (itemType === 'message') {
        runtimeDatabase.deleteMessage(id);
      } else if (itemType === 'memory') {
        runtimeDatabase.deleteMemory(id);
      } else if (itemType === 'skill') {
        skillManager.deleteSkill(id);
      }
    } catch (err: any) {
      console.error(`[DeletionManager] Erreur lors de la purge physique (${itemType}:${id}) :`, err?.message || err);
    } finally {
      runtimeDatabase.removePendingDeletion(itemType, id);
    }
    return true;
  }

  /**
   * À la relance de l'application : purge immédiate des éléments dont le délai est dépassé.
   * Si le délai n'est pas encore dépassé, réarme la minuterie pour le temps restant.
   */
  public purgeExpiredOnStartup(nowIso?: string): { count: number; items: Array<{ id: string; itemType: string }> } {
    const now = nowIso ? new Date(nowIso).getTime() : Date.now();
    const all = runtimeDatabase.listPendingDeletions();
    const purged: Array<{ id: string; itemType: string }> = [];

    for (const item of all) {
      const purgeAtMs = new Date(item.purgeAt).getTime();
      if (purgeAtMs <= now) {
        this.executePhysicalPurge(item.itemType, item.id);
        purged.push({ id: item.id, itemType: item.itemType });
      } else {
        const remainingMs = purgeAtMs - now;
        const k = this.key(item.itemType, item.id);
        const timer = setTimeout(() => {
          this.activeTimers.delete(k);
          this.executePhysicalPurge(item.itemType, item.id);
        }, remainingMs);
        if (typeof timer.unref === 'function') {
          timer.unref();
        }
        this.activeTimers.set(k, timer);
      }
    }

    return { count: purged.length, items: purged };
  }

  /**
   * Vérifie si un élément est en cours de suppression différée
   */
  public isPending(itemType: string, id: string): boolean {
    return runtimeDatabase.isPendingDeletion(itemType, id);
  }

  /**
   * Liste tous les éléments en attente de purge
   */
  public listPending(itemType?: string): PendingDeletion[] {
    return runtimeDatabase.listPendingDeletions(itemType);
  }

  /**
   * Nettoie toutes les minuteries actives (lors de l'arrêt du serveur)
   */
  public clearAllTimers(): void {
    for (const timer of this.activeTimers.values()) {
      clearTimeout(timer);
    }
    this.activeTimers.clear();
  }
}

export const deletionManager = new DeletionManager();
