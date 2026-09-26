/**
 * DeletionService — Service client pour la suppression avec délai de rétractation (Mission R4b)
 */
import { tokenService } from '../security/TokenService';

export type DeletableType = 'conversation' | 'message' | 'memory' | 'skill';

export interface PendingDeletionResponse {
  success: boolean;
  pending?: {
    id: string;
    itemType: DeletableType;
    deletedAt: string;
    purgeAt: string;
    metadata?: any;
  };
}

export class DeletionService {
  /**
   * Enregistre une suppression différée sur le runtime (5 secondes par défaut)
   */
  public async schedulePendingDeletion(
    itemType: DeletableType,
    id: string,
    durationMs: number = 5000,
    metadata?: any
  ): Promise<PendingDeletionResponse> {
    const res = await tokenService.fetch('/api/deletions/pending', {
      method: 'POST',
      body: JSON.stringify({ itemType, id, durationMs, metadata })
    });
    return res.json();
  }

  /**
   * Annule une suppression en cours et restaure immédiatement l'élément
   */
  public async cancelPendingDeletion(
    itemType: DeletableType,
    id: string
  ): Promise<{ success: boolean; restored: boolean }> {
    const res = await tokenService.fetch('/api/deletions/cancel', {
      method: 'POST',
      body: JSON.stringify({ itemType, id })
    });
    return res.json();
  }

  /**
   * Force la purge physique immédiate sans attendre l'expiration
   */
  public async purgePendingDeletion(
    itemType: DeletableType,
    id: string
  ): Promise<{ success: boolean; purged: boolean }> {
    const res = await tokenService.fetch('/api/deletions/purge', {
      method: 'POST',
      body: JSON.stringify({ itemType, id })
    });
    return res.json();
  }

  /**
   * Enregistre une suppression différée groupée (Mission R4c)
   */
  public async scheduleBatchPendingDeletion(
    itemType: DeletableType,
    ids: string[],
    durationMs: number = 5000,
    metadata?: any
  ): Promise<void> {
    await Promise.all(
      ids.map(id => this.schedulePendingDeletion(itemType, id, durationMs, metadata))
    );
  }

  /**
   * Annule une suppression groupée en cours (Mission R4c)
   */
  public async cancelBatchPendingDeletion(
    itemType: DeletableType,
    ids: string[]
  ): Promise<void> {
    await Promise.all(
      ids.map(id => this.cancelPendingDeletion(itemType, id))
    );
  }
}

export const deletionService = new DeletionService();
