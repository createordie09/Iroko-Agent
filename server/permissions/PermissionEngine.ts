import crypto from 'crypto';
import { PermissionLevel, PermissionRequest } from '../types/events';

export interface PendingPermission {
  request: PermissionRequest;
  resolve: (approved: boolean) => void;
  timer: NodeJS.Timeout;
}

export class PermissionEngine {
  // Permissions accordées pour la session : clé = "tool:resource" ou "tool"
  private sessionGrants: Set<string> = new Set();
  // Permissions en attente de réponse utilisateur : clé = requestId
  private pendingRequests: Map<string, PendingPermission> = new Map();
  // Délai maximal d'attente d'une réponse de l'utilisateur (2 minutes par défaut)
  private timeoutMs = 120000;

  /**
   * Vérifie ou sollicite l'autorisation pour une action
   */
  public async requestPermission(
    tool: string,
    level: PermissionLevel,
    description: string,
    details?: Record<string, any>,
    onRequestPrompt?: (request: PermissionRequest) => void
  ): Promise<boolean> {
    // Les actions SAFE et LOW s'exécutent automatiquement
    if (level === 'SAFE' || level === 'LOW') {
      return true;
    }

    // Vérifier si une autorisation de session existe déjà pour cet outil
    const sessionKey = `${tool}:${details?.path || '*'}`;
    if (this.sessionGrants.has(sessionKey) || this.sessionGrants.has(tool)) {
      console.log(`[PermissionEngine] Action "${tool}" pré-autorisée par la session`);
      return true;
    }

    // Créer la demande d'autorisation pour l'utilisateur
    const requestId = crypto.randomUUID();
    const request: PermissionRequest = {
      id: requestId,
      tool,
      level,
      description,
      details,
      timestamp: Date.now()
    };

    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        console.warn(`[PermissionEngine] Expiration du délai pour la demande ${requestId}`);
        this.pendingRequests.delete(requestId);
        resolve(false);
      }, this.timeoutMs);

      this.pendingRequests.set(requestId, { request, resolve, timer });

      if (onRequestPrompt) {
        onRequestPrompt(request);
      }
    });
  }

  /**
   * Résout une demande en attente après validation ou refus utilisateur
   */
  public resolvePermission(
    requestId: string,
    approved: boolean,
    scope: 'once' | 'session' | 'workspace' = 'once'
  ): boolean {
    const pending = this.pendingRequests.get(requestId);
    if (!pending) {
      console.warn(`[PermissionEngine] Demande inconnue ou expirée : ${requestId}`);
      return false;
    }

    clearTimeout(pending.timer);
    this.pendingRequests.delete(requestId);

    if (approved && (scope === 'session' || scope === 'workspace')) {
      const key = pending.request.details?.path
        ? `${pending.request.tool}:${pending.request.details.path}`
        : pending.request.tool;
      this.sessionGrants.add(key);
      console.log(`[PermissionEngine] Règle mémorisée pour la session : ${key}`);
    }

    pending.resolve(approved);
    return true;
  }

  /**
   * Réinitialise les permissions accordées
   */
  public clear(): void {
    for (const pending of this.pendingRequests.values()) {
      clearTimeout(pending.timer);
      pending.resolve(false);
    }
    this.pendingRequests.clear();
    this.sessionGrants.clear();
  }
}
