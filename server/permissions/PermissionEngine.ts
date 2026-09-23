import crypto from 'crypto';
import { PermissionLevel, PermissionRequest } from '../types/events';
import { PermissionStore, PermissionScope } from './PermissionStore';
import { CommandRiskClassifier } from './CommandRiskClassifier';

export interface PendingPermission {
  request: PermissionRequest;
  fingerprint: string;
  pattern: string;
  resolve: (approved: boolean) => void;
  timer: NodeJS.Timeout;
  promptTime: number;
}

export class PermissionEngine {
  // Permissions accordées pour la session : clé = "tool:resource" ou "tool"
  private sessionGrants: Set<string> = new Set();
  // Empreintes déjà consommées (protection anti-rejeu stricte)
  private consumedFingerprints: Set<string> = new Set();
  // Demandes en attente de réponse utilisateur : clé = requestId
  private pendingRequests: Map<string, PendingPermission> = new Map();
  // Délai maximal d'attente d'une réponse de l'utilisateur (120 secondes / 2 minutes par défaut)
  private timeoutMs = 120000;
  // Temps total cumulé passé en attente d'approbation utilisateur (exclu des timeouts de tâche)
  private totalWaitTimeMs = 0;

  constructor(
    public readonly workspacePath: string = process.cwd(),
    private readonly store: PermissionStore = PermissionStore.getInstance()
  ) {}

  /**
   * Calcule une empreinte SHA-256 unique et déterministe pour un appel d'outil et ses arguments.
   */
  public static computeFingerprint(tool: string, details?: Record<string, any>): string {
    const sortedDetails: Record<string, any> = {};
    if (details) {
      const keys = Object.keys(details).sort();
      for (const k of keys) {
        // Exclure les champs d'affichage non stables comme timestamp
        if (k !== 'timestamp') {
          sortedDetails[k] = details[k];
        }
      }
    }
    const raw = `${tool}:${JSON.stringify(sortedDetails)}`;
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  /**
   * Extrait le motif représentatif de l'action pour les autorisations de session et de projet.
   */
  private extractActionPattern(tool: string, details?: Record<string, any>): string {
    if (tool === 'execute_command' && details?.command) {
      return CommandRiskClassifier.normalizeCommandPattern(details.command);
    }
    if (details?.path) {
      return details.path;
    }
    return '*';
  }

  /**
   * Vérifie ou sollicite l'autorisation pour une action.
   */
  public async requestPermission(
    tool: string,
    level: PermissionLevel,
    description: string,
    details?: Record<string, any>,
    onRequestPrompt?: (request: PermissionRequest) => void
  ): Promise<boolean> {
    const fingerprint = PermissionEngine.computeFingerprint(tool, details);
    const pattern = this.extractActionPattern(tool, details);
    const mode = this.store.getSettings().mode;

    // 1. Mode "Lecture seule" : rejet immédiat de toute action modificatrice
    if (mode === 'read_only' && ['MEDIUM', 'HIGH', 'CRITICAL'].includes(level)) {
      console.warn(`[PermissionEngine] Action "${tool}" rejetée en mode lecture seule.`);
      this.store.logDecision({
        tool,
        description,
        level,
        approved: false,
        scope: 'reject',
        canonicalWorkspace: this.store.getCanonicalWorkspace(this.workspacePath),
        commandOrPath: details?.command || details?.path,
        fingerprint
      });
      return false;
    }

    // 2. Les actions SAFE et LOW s'exécutent automatiquement
    if (level === 'SAFE' || level === 'LOW') {
      return true;
    }

    // 3. Mode "Modifications automatiques" pour les écritures/éditions de fichiers non critiques
    if (
      mode === 'auto_edit' &&
      ['write_file', 'edit_file'].includes(tool) &&
      level !== 'CRITICAL'
    ) {
      console.log(`[PermissionEngine] Action "${tool}" auto-autorisée en mode modifications automatiques.`);
      this.store.logDecision({
        tool,
        description,
        level,
        approved: true,
        scope: 'session',
        canonicalWorkspace: this.store.getCanonicalWorkspace(this.workspacePath),
        commandOrPath: details?.command || details?.path,
        fingerprint
      });
      return true;
    }

    // 4. Règle CRITIQUE : les commandes CRITICAL ne peuvent JAMAIS être pré-autorisées
    if (level !== 'CRITICAL') {
      // 4.1 Vérifier si une autorisation de session existe déjà
      const sessionKey = `${tool}:${pattern}`;
      if (this.sessionGrants.has(sessionKey) || this.sessionGrants.has(tool)) {
        console.log(`[PermissionEngine] Action "${tool}" (${pattern}) pré-autorisée par la session`);
        return true;
      }

      // 4.2 Vérifier si une règle "Toujours pour ce projet" existe dans le magasin hors workspace
      if (this.store.isActionProjectAllowed(this.workspacePath, tool, pattern)) {
        console.log(`[PermissionEngine] Action "${tool}" (${pattern}) pré-autorisée pour le projet`);
        return true;
      }
    }

    // 5. Créer la demande d'autorisation interactive pour l'utilisateur
    const requestId = crypto.randomUUID();
    const request: PermissionRequest = {
      id: requestId,
      tool,
      level,
      description,
      details: {
        ...details,
        fingerprint,
        pattern
      },
      timestamp: Date.now()
    };

    const promptTime = Date.now();

    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        console.warn(`[PermissionEngine] Expiration du délai (2 min) pour la demande ${requestId} -> Refus par défaut.`);
        this.pendingRequests.delete(requestId);
        this.consumedFingerprints.add(fingerprint);
        this.totalWaitTimeMs += (Date.now() - promptTime);

        // Journaliser le refus par expiration
        this.store.logDecision({
          tool,
          description: `[Délai dépassé] ${description}`,
          level,
          approved: false,
          scope: 'reject',
          canonicalWorkspace: this.store.getCanonicalWorkspace(this.workspacePath),
          commandOrPath: details?.command || details?.path,
          fingerprint
        });

        resolve(false);
      }, this.timeoutMs);

      this.pendingRequests.set(requestId, {
        request,
        fingerprint,
        pattern,
        resolve,
        timer,
        promptTime
      });

      if (onRequestPrompt) {
        onRequestPrompt(request);
      }
    });
  }

  /**
   * Retourne le temps cumulé passé en attente d'autorisation utilisateur.
   */
  public getTotalWaitTimeMs(): number {
    return this.totalWaitTimeMs;
  }

  /**
   * Réinitialise le compteur de temps d'attente d'autorisation (ex. au début d'une tâche).
   */
  public resetWaitTime(): void {
    this.totalWaitTimeMs = 0;
  }

  /**
   * Résout une demande en attente après validation ou refus utilisateur.
   */
  public resolvePermission(
    requestId: string,
    approved: boolean,
    scope: PermissionScope = 'once'
  ): boolean {
    const pending = this.pendingRequests.get(requestId);
    if (!pending) {
      console.warn(`[PermissionEngine] Demande inconnue ou déjà résolue : ${requestId}`);
      return false;
    }

    clearTimeout(pending.timer);
    this.pendingRequests.delete(requestId);
    this.totalWaitTimeMs += (Date.now() - pending.promptTime);

    // Marquer l'empreinte comme consommée pour interdire tout rejeu
    this.consumedFingerprints.add(pending.fingerprint);

    const actualScope: PermissionScope = approved ? scope : 'reject';

    // Traitement des portées d'approbation
    if (approved) {
      if (scope === 'session') {
        const sessionKey = `${pending.request.tool}:${pending.pattern}`;
        this.sessionGrants.add(sessionKey);
        console.log(`[PermissionEngine] Règle mémorisée pour la session : ${sessionKey}`);
      } else if (scope === 'project' || scope === 'workspace') {
        // Mémorisation durable hors workspace dans PermissionStore
        this.store.addProjectPermission(
          this.workspacePath,
          pending.request.tool,
          pending.pattern
        );
        console.log(`[PermissionEngine] Règle durable enregistrée hors workspace : ${pending.request.tool}:${pending.pattern}`);
      }
    }

    // Journalisation de la décision dans le journal d'audit persistant
    this.store.logDecision({
      tool: pending.request.tool,
      description: pending.request.description,
      level: pending.request.level,
      approved,
      scope: actualScope,
      canonicalWorkspace: this.store.getCanonicalWorkspace(this.workspacePath),
      commandOrPath: pending.request.details?.command || pending.request.details?.path,
      fingerprint: pending.fingerprint
    });

    pending.resolve(approved);
    return true;
  }

  /**
   * Réinitialise les autorisations de session et annule les requêtes en attente.
   */
  public clear(): void {
    for (const pending of this.pendingRequests.values()) {
      clearTimeout(pending.timer);
      pending.resolve(false);
    }
    this.pendingRequests.clear();
    this.sessionGrants.clear();
    this.consumedFingerprints.clear();
  }
}
