import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { 
  VideoProvider, 
  VideoModelInfo, 
  GenerateVideoRequest, 
  VideoJobRecord, 
  VideoSettings,
  VideoJobStatus
} from './videoTypes';
import { GoogleVideoAdapter } from './adapters/GoogleVideoAdapter';
import { ReplicateVideoAdapter } from './adapters/ReplicateVideoAdapter';
import { FalVideoAdapter } from './adapters/FalVideoAdapter';
import { MockVideoAdapter } from './adapters/MockVideoAdapter';
import { SsrfGuard } from './security/SsrfGuard';
import { runtimeDatabase } from '../storage/RuntimeDatabase';
import { encryptionService } from '../security/EncryptionService';
import { ArtifactManager } from '../artifacts/ArtifactManager';
import { logger } from '../utils/logger';

interface ActiveJobContext {
  jobId: string;
  abortController: AbortController;
  timerId?: NodeJS.Timeout;
}

interface StreamTicket {
  ticket: string;
  artifactId: string;
  expiresAt: number;
}

export class VideoGateway {
  private static instance: VideoGateway;
  private providers: Map<string, VideoProvider> = new Map();
  private activeJobs: Map<string, ActiveJobContext> = new Map();
  private streamTickets: Map<string, StreamTicket> = new Map();
  private eventEmitter?: (event: any) => void;

  private constructor() {
    this.registerProvider(new GoogleVideoAdapter());
    this.registerProvider(new ReplicateVideoAdapter());
    this.registerProvider(new FalVideoAdapter());
    this.registerProvider(new MockVideoAdapter());

    // Nettoyage régulier des tickets de streaming expirés
    setInterval(() => {
      const now = Date.now();
      for (const [t, data] of this.streamTickets.entries()) {
        if (data.expiresAt < now) {
          this.streamTickets.delete(t);
        }
      }
    }, 60000).unref();
  }

  public static getInstance(): VideoGateway {
    if (!VideoGateway.instance) {
      VideoGateway.instance = new VideoGateway();
    }
    return VideoGateway.instance;
  }

  public setEventEmitter(emitter: (event: any) => void): void {
    this.eventEmitter = emitter;
  }

  public registerProvider(provider: VideoProvider): void {
    this.providers.set(provider.id, provider);
  }

  public getProvider(id: string): VideoProvider | undefined {
    return this.providers.get(id);
  }

  public listProviders(): Array<{ id: string; name: string }> {
    return Array.from(this.providers.values()).map(p => ({
      id: p.id,
      name: p.name
    }));
  }

  /**
   * Récupère la configuration vidéo persistée en base SQLite.
   */
  public getSettings(): VideoSettings {
    const raw = runtimeDatabase.getSetting('video_settings') as any;
    if (raw && typeof raw === 'object') {
      let decryptedKey: string | undefined = undefined;
      if (raw.encryptedKey && raw.iv && raw.authTag) {
        try {
          decryptedKey = encryptionService.decrypt({
            encrypted: raw.encryptedKey,
            iv: raw.iv,
            authTag: raw.authTag
          });
        } catch (err) {
          logger.warn(`Impossible de déchiffrer la clé vidéo : ${err}`);
        }
      }

      return {
        activeProviderId: raw.activeProviderId || '',
        activeModelId: raw.activeModelId || '',
        apiKey: decryptedKey,
        baseUrl: raw.baseUrl,
        timeoutMs: raw.timeoutMs || 600000, // 10 min par défaut
        maxVideoBytes: raw.maxVideoBytes || 200 * 1024 * 1024 // 200 Mo par défaut
      };
    }

    return {
      activeProviderId: '',
      activeModelId: '',
      timeoutMs: 600000,
      maxVideoBytes: 200 * 1024 * 1024
    };
  }

  /**
   * Enregistre les paramètres vidéo avec chiffrement AES-256-GCM.
   */
  public saveSettings(settings: {
    activeProviderId: string;
    activeModelId: string;
    apiKey?: string;
    baseUrl?: string;
    timeoutMs?: number;
    maxVideoBytes?: number;
  }): void {
    let encryptedKeyData: any = undefined;

    if (settings.apiKey && settings.apiKey.trim()) {
      const encrypted = encryptionService.encrypt(settings.apiKey.trim());
      encryptedKeyData = {
        encryptedKey: encrypted.encrypted,
        iv: encrypted.iv,
        authTag: encrypted.authTag
      };
    }

    runtimeDatabase.setSetting('video_settings', {
      activeProviderId: settings.activeProviderId,
      activeModelId: settings.activeModelId,
      baseUrl: settings.baseUrl,
      timeoutMs: settings.timeoutMs || 600000,
      maxVideoBytes: settings.maxVideoBytes || 200 * 1024 * 1024,
      ...(encryptedKeyData || {})
    });
  }

  public hasConfiguredProvider(): boolean {
    const settings = this.getSettings();
    if (!settings.activeProviderId) return false;
    if (settings.activeProviderId === 'mock') return true;
    return Boolean(settings.apiKey);
  }

  public async listModels(providerId?: string): Promise<VideoModelInfo[]> {
    const targetId = providerId || this.getSettings().activeProviderId;
    if (!targetId) return [];
    const provider = this.getProvider(targetId);
    if (!provider) return [];
    return provider.listVideoModels();
  }

  /**
   * Crée et lance le suivi d'un nouveau job vidéo asynchrone.
   */
  public async createVideoJob(
    request: GenerateVideoRequest,
    conversationId: string
  ): Promise<VideoJobRecord> {
    const settings = this.getSettings();
    if (!settings.activeProviderId) {
      throw new Error('Aucun fournisseur vidéo configuré dans les paramètres.');
    }

    const provider = this.getProvider(settings.activeProviderId);
    if (!provider) {
      throw new Error(`Fournisseur vidéo "${settings.activeProviderId}" introuvable.`);
    }

    if (settings.activeProviderId !== 'mock' && !settings.apiKey) {
      throw new Error(`Clé d'API requise pour le fournisseur vidéo "${provider.name}".`);
    }

    const jobId = `vjob_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const model = request.model || settings.activeModelId || 'default';
    const duration = request.duration || 5;
    const aspectRatio = request.aspectRatio || '16:9';

    // 1. Initialiser le job auprès du fournisseur
    const externalResult = await provider.createVideoJob(request, settings.apiKey, {
      baseUrl: settings.baseUrl,
      timeoutMs: settings.timeoutMs
    });

    const now = new Date().toISOString();
    const jobRecord: VideoJobRecord = {
      id: jobId,
      conversationId,
      providerId: settings.activeProviderId,
      modelId: model,
      prompt: request.prompt,
      duration,
      aspectRatio,
      status: externalResult.initialStatus || 'queued',
      progress: 0,
      externalJobId: externalResult.externalJobId,
      pollUrl: externalResult.pollUrl,
      metadata: {
        prompt: request.prompt,
        model,
        duration,
        aspectRatio
      },
      createdAt: now,
      updatedAt: now
    };

    // 2. Persister en base SQLite
    runtimeDatabase.createVideoJob(jobRecord);

    // 3. Lancer la boucle de suivi asynchrone
    this.startJobPollingLoop(jobRecord);

    return jobRecord;
  }

  /**
   * Boucle d'interrogation asynchrone avec backoff pour un job vidéo.
   */
  private startJobPollingLoop(job: VideoJobRecord): void {
    const abortController = new AbortController();
    const activeCtx: ActiveJobContext = {
      jobId: job.id,
      abortController
    };
    this.activeJobs.set(job.id, activeCtx);

    const settings = this.getSettings();
    const timeoutMs = settings.timeoutMs || 600000;
    const startTime = Date.now();
    const isMock = job.providerId === 'mock';
    let currentDelayMs = isMock ? 40 : 2000;

    const pollStep = async () => {
      if (abortController.signal.aborted) {
        return;
      }

      // Vérification du timeout global
      if (Date.now() - startTime > timeoutMs) {
        this.finishJob(job.id, {
          status: 'failed',
          error: `Délai d'attente maximal dépassé (${Math.round(timeoutMs / 60000)} minutes).`
        });
        return;
      }

      try {
        const provider = this.getProvider(job.providerId);
        if (!provider) {
          throw new Error(`Fournisseur "${job.providerId}" indisponible.`);
        }

        const pollRes = await provider.pollVideoJob(
          job.externalJobId || job.id,
          settings.apiKey,
          {
            baseUrl: settings.baseUrl,
            pollUrl: job.pollUrl
          }
        );

        if (abortController.signal.aborted) return;

        if (pollRes.status === 'processing' || pollRes.status === 'queued') {
          // Mise à jour de la progression
          runtimeDatabase.updateVideoJob(job.id, {
            status: pollRes.status,
            progress: pollRes.progress || job.progress || 0
          });

          this.emitJobUpdate(job.id, {
            status: pollRes.status,
            progress: pollRes.progress
          });

          // Prochaine étape avec backoff (jusqu'à 10s max)
          currentDelayMs = isMock ? 40 : Math.min(currentDelayMs * 1.3, 10000);
          activeCtx.timerId = setTimeout(pollStep, currentDelayMs);
        } else if (pollRes.status === 'completed') {
          // Téléchargement ou écriture de la vidéo sur disque
          await this.processCompletedVideo(job, pollRes);
        } else if (pollRes.status === 'cancelled') {
          this.finishJob(job.id, {
            status: 'cancelled',
            error: pollRes.error || 'Génération vidéo annulée.'
          });
        } else {
          // Échec
          this.finishJob(job.id, {
            status: 'failed',
            error: pollRes.error || 'Échec de la génération vidéo.'
          });
        }
      } catch (err: any) {
        if (abortController.signal.aborted) return;
        logger.error(`[VideoGateway] Erreur polling pour job ${job.id}: ${err.message}`);
        // Continuer quelques tentatives avant d'échouer définitivement
        currentDelayMs = Math.min(currentDelayMs * 1.5, 15000);
        activeCtx.timerId = setTimeout(pollStep, currentDelayMs);
      }
    };

    // Démarrer la première vérification après un bref délai
    activeCtx.timerId = setTimeout(pollStep, isMock ? 20 : 1000);
  }

  /**
   * Traitement d'une vidéo finalisée (téléchargement streaming, artéfact et persistance).
   */
  private async processCompletedVideo(
    job: VideoJobRecord,
    pollRes: {
      videoBuffer?: Buffer;
      downloadUrl?: string;
      mimeType?: string;
    }
  ): Promise<void> {
    const slug = job.prompt
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 30) || 'video';
    const filename = `${slug}-${Date.now().toString(36)}.mp4`;
    const title = job.prompt.length > 50 ? job.prompt.slice(0, 47) + '...' : job.prompt;

    let artifact: any;

    if (pollRes.videoBuffer) {
      // Écriture directe depuis le buffer (ex: Mock ou Gemini binaire)
      artifact = ArtifactManager.getInstance().createArtifact({
        conversationId: job.conversationId,
        filename,
        contentBuffer: pollRes.videoBuffer,
        mimeType: pollRes.mimeType || 'video/mp4',
        title,
        metadata: {
          prompt: job.prompt,
          model: job.modelId,
          duration: job.duration,
          aspectRatio: job.aspectRatio,
          jobId: job.id,
          isGeneratedVideo: true
        }
      });
    } else if (pollRes.downloadUrl) {
      // Téléchargement sécurisé via SSRF Guard
      const tempPath = path.join(os.tmpdir(), `vtmp_${job.id}_${Date.now()}.mp4`);
      const streamRes = await SsrfGuard.safeStreamDownloadVideo(pollRes.downloadUrl, tempPath, {
        maxBytes: this.getSettings().maxVideoBytes
      });

      const fileBuffer = fs.readFileSync(tempPath);
      try { fs.unlinkSync(tempPath); } catch {}

      artifact = ArtifactManager.getInstance().createArtifact({
        conversationId: job.conversationId,
        filename,
        contentBuffer: fileBuffer,
        mimeType: streamRes.mimeType || 'video/mp4',
        title,
        metadata: {
          prompt: job.prompt,
          model: job.modelId,
          duration: job.duration,
          aspectRatio: job.aspectRatio,
          jobId: job.id,
          isGeneratedVideo: true
        }
      });
    } else {
      throw new Error('Ni buffer vidéo ni URL de téléchargement disponibles.');
    }

    const version = artifact.versions?.[0];
    const videoFilePath = version?.filePath;

    this.finishJob(job.id, {
      status: 'completed',
      progress: 100,
      artifactId: artifact.id,
      videoFilePath,
      size: artifact.size,
      mimeType: artifact.mimeType
    });

    // Émettre un événement d'artéfact créé
    if (this.eventEmitter) {
      this.eventEmitter({
        type: 'artifact_created',
        artifact: {
          id: artifact.id,
          name: artifact.name,
          title: artifact.title,
          mimeType: artifact.mimeType,
          version: artifact.currentVersion || 1,
          size: artifact.size,
          metadata: artifact.metadata
        }
      });
    }
  }

  private finishJob(
    jobId: string,
    updates: Partial<VideoJobRecord>
  ): void {
    const active = this.activeJobs.get(jobId);
    if (active) {
      if (active.timerId) clearTimeout(active.timerId);
      this.activeJobs.delete(jobId);
    }

    runtimeDatabase.updateVideoJob(jobId, updates);
    this.emitJobUpdate(jobId, updates);
  }

  public async cancelJob(jobId: string): Promise<boolean> {
    const active = this.activeJobs.get(jobId);
    if (active) {
      active.abortController.abort();
      if (active.timerId) clearTimeout(active.timerId);
      this.activeJobs.delete(jobId);
    }

    const job = runtimeDatabase.getVideoJob(jobId);
    if (job && (job.status === 'queued' || job.status === 'processing')) {
      const provider = this.getProvider(job.providerId);
      if (provider?.cancelVideoJob && job.externalJobId) {
        try {
          await provider.cancelVideoJob(job.externalJobId, this.getSettings().apiKey, {
            baseUrl: this.getSettings().baseUrl
          });
        } catch {}
      }

      runtimeDatabase.updateVideoJob(jobId, {
        status: 'cancelled',
        error: 'Génération vidéo interrompue par l\'utilisateur.'
      });

      this.emitJobUpdate(jobId, {
        status: 'cancelled',
        error: 'Génération vidéo interrompue par l\'utilisateur.'
      });

      return true;
    }

    return false;
  }

  private emitJobUpdate(jobId: string, updates: Partial<VideoJobRecord>): void {
    if (this.eventEmitter) {
      this.eventEmitter({
        type: 'video_job_updated',
        jobId,
        updates
      });
    }
  }

  /**
   * Reprise automatique au démarrage des jobs non terminés persistés dans SQLite.
   */
  public resumePendingJobs(): void {
    try {
      const pending = runtimeDatabase.listPendingVideoJobs();
      logger.info(`[VideoGateway] ${pending.length} job(s) vidéo en attente de reprise.`);
      for (const job of pending) {
        this.startJobPollingLoop(job);
      }
    } catch (err: any) {
      logger.warn(`[VideoGateway] Erreur lors de la reprise des jobs vidéo : ${err.message}`);
    }
  }

  /**
   * Génère un ticket cryptographique à usage temporaire pour la lecture vidéo (5 minutes).
   */
  public generateStreamTicket(artifactId: string): string {
    const ticket = crypto.randomBytes(24).toString('hex');
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 min
    this.streamTickets.set(ticket, {
      ticket,
      artifactId,
      expiresAt
    });
    return ticket;
  }

  /**
   * Valide un ticket de streaming pour un artéfact donné.
   */
  public validateStreamTicket(artifactId: string, ticket?: string): boolean {
    if (!ticket) return false;
    const record = this.streamTickets.get(ticket);
    if (!record) return false;
    if (record.artifactId !== artifactId) return false;
    if (record.expiresAt < Date.now()) {
      this.streamTickets.delete(ticket);
      return false;
    }
    return true;
  }

  public getJob(jobId: string): VideoJobRecord | null {
    return runtimeDatabase.getVideoJob(jobId);
  }

  public listJobs(conversationId?: string): VideoJobRecord[] {
    return runtimeDatabase.listVideoJobs(conversationId);
  }

  public createStreamTicket(artifactId: string): string {
    return this.generateStreamTicket(artifactId);
  }

  public verifyStreamTicket(ticket: string, artifactId: string): boolean {
    return this.validateStreamTicket(artifactId, ticket);
  }
}

export const videoGateway = VideoGateway.getInstance();
