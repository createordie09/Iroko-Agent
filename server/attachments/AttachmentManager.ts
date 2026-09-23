import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import os from 'os';
import { Readable } from 'stream';
import { IncomingMessage } from 'http';
import { AttachmentMetadata, AttachmentPublicInfo } from './types';
import { detectMagicBytesFromFile } from './magic_bytes';
import { runtimeDatabase } from '../storage/RuntimeDatabase';

export interface UploadLimits {
  maxFileSize: number; // 50 Mo par défaut
  maxFilesPerMessage: number; // 10 par défaut
  maxConversationSize: number; // 200 Mo par défaut
}

export const DEFAULT_LIMITS: UploadLimits = {
  maxFileSize: 50 * 1024 * 1024,
  maxFilesPerMessage: 10,
  maxConversationSize: 200 * 1024 * 1024
};

export class AttachmentManager {
  private baseDir: string;
  private limits: UploadLimits;

  constructor(customBaseDir?: string, limits: Partial<UploadLimits> = {}) {
    const dataDir = customBaseDir || process.env.IROKO_DATA_DIR || (
      process.platform === 'win32' && process.env.APPDATA
        ? path.join(process.env.APPDATA, 'iroko')
        : path.join(os.homedir(), '.iroko')
    );
    this.baseDir = path.join(dataDir, 'attachments');
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
    this.limits = { ...DEFAULT_LIMITS, ...limits };
  }

  public getConversationDir(conversationId: string): string {
    // Sanitisation stricte de l'identifiant de conversation
    const safeId = conversationId.replace(/[^a-zA-Z0-9_\-]/g, '_');
    const dir = path.join(this.baseDir, safeId);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  public sanitizeFilename(originalName: string): string {
    const basename = path.basename(originalName);
    // Supprimer les caractères dangereux, espaces multiples et caractères de contrôle
    let cleaned = basename.replace(/[\/\?<>\\:\*\|":\x00-\x1f\x80-\x9f]/g, '_').trim();
    if (!cleaned || cleaned === '.' || cleaned === '..') {
      cleaned = 'fichier_' + Date.now();
    }
    return cleaned;
  }

  public async saveStream(
    conversationId: string,
    filename: string,
    inputStream: Readable,
    messageId?: string
  ): Promise<AttachmentMetadata> {
    const convDir = this.getConversationDir(conversationId);
    const safeName = this.sanitizeFilename(filename);
    const tempId = crypto.randomUUID();
    const tempFilePath = path.join(convDir, `tmp_${tempId}_${safeName}`);

    const hash = crypto.createHash('sha256');
    let totalBytes = 0;

    // Vérifier le quota existant de la conversation
    const existingAttachments = this.listAttachments(conversationId);
    const currentTotalSize = existingAttachments.reduce((sum, a) => sum + a.size, 0);

    if (currentTotalSize >= this.limits.maxConversationSize) {
      throw new Error(`Quota de conversation dépassé : la taille cumulée des pièces jointes dépasse ${Math.round(this.limits.maxConversationSize / 1024 / 1024)} Mo.`);
    }

    const writeStream = fs.createWriteStream(tempFilePath);

    try {
      await new Promise<void>((resolve, reject) => {
        inputStream.on('data', (chunk: Buffer) => {
          totalBytes += chunk.length;
          if (totalBytes > this.limits.maxFileSize) {
            inputStream.destroy(new Error(`Fichier trop volumineux : la taille dépasse la limite autorisée de ${Math.round(this.limits.maxFileSize / 1024 / 1024)} Mo.`));
            return;
          }
          if (currentTotalSize + totalBytes > this.limits.maxConversationSize) {
            inputStream.destroy(new Error(`Quota de conversation dépassé : l'ajout de ce fichier dépasserait la limite de ${Math.round(this.limits.maxConversationSize / 1024 / 1024)} Mo.`));
            return;
          }
          hash.update(chunk);
          if (!writeStream.write(chunk)) {
            inputStream.pause();
            writeStream.once('drain', () => inputStream.resume());
          }
        });

        inputStream.on('end', () => {
          writeStream.end();
        });

        writeStream.on('finish', () => {
          resolve();
        });

        inputStream.on('error', (err) => {
          writeStream.destroy();
          reject(err);
        });

        writeStream.on('error', (err) => {
          reject(err);
        });
      });
    } catch (err) {
      // Nettoyage immédiat du fichier partiel
      if (fs.existsSync(tempFilePath)) {
        try { fs.unlinkSync(tempFilePath); } catch {}
      }
      throw err;
    }

    if (totalBytes === 0) {
      if (fs.existsSync(tempFilePath)) {
        try { fs.unlinkSync(tempFilePath); } catch {}
      }
      throw new Error('Le fichier est vide (0 octet).');
    }

    const sha256 = hash.digest('hex');

    // Détection du type MIME réel par signature binaire (magic bytes)
    const detected = detectMagicBytesFromFile(tempFilePath);

    // Sécurité : Refus catégorique des exécutables (PE, ELF, Mach-O) même déguisés en images
    if (detected.isExecutable) {
      if (fs.existsSync(tempFilePath)) {
        try { fs.unlinkSync(tempFilePath); } catch {}
      }
      throw new Error(`Fichier binaire exécutable interdit : la signature réelle (${detected.mimeType}) ne correspond pas à un document ou média consultable.`);
    }

    // Déduplication : si le fichier existe déjà exactement dans cette conversation
    const duplicate = existingAttachments.find(a => a.sha256 === sha256);
    if (duplicate && duplicate.filePath && fs.existsSync(duplicate.filePath)) {
      // Supprimer le temporaire et retourner le doublon existant
      try { fs.unlinkSync(tempFilePath); } catch {}
      return duplicate;
    }

    // Renommer le fichier temporaire avec son identifiant définitif
    const attachmentId = crypto.randomUUID();
    const finalFilename = `${attachmentId}_${safeName}`;
    const finalFilePath = path.join(convDir, finalFilename);
    fs.renameSync(tempFilePath, finalFilePath);

    const attachment: AttachmentMetadata = {
      id: attachmentId,
      conversationId,
      messageId,
      name: safeName,
      originalName: filename,
      size: totalBytes,
      mimeType: detected.mimeType,
      detectedType: detected.category,
      sha256,
      filePath: finalFilePath,
      createdAt: new Date().toISOString()
    };

    // Enregistrer en base SQLite
    this.recordAttachment(attachment);

    return attachment;
  }

  public recordAttachment(attachment: AttachmentMetadata): void {
    try {
      runtimeDatabase.recordAttachment({
        id: attachment.id,
        conversationId: attachment.conversationId,
        messageId: attachment.messageId,
        name: attachment.name,
        originalName: attachment.originalName,
        size: attachment.size,
        mimeType: attachment.mimeType,
        detectedType: attachment.detectedType,
        sha256: attachment.sha256,
        filePath: attachment.filePath || '',
        createdAt: attachment.createdAt
      });
    } catch (e) {
      // Fallback si la méthode n'est pas encore déclarée
    }
  }

  public getAttachment(id: string): AttachmentMetadata | null {
    try {
      const record = runtimeDatabase.getAttachment(id);
      if (record) return record;
    } catch {}

    // Recherche récursive dans baseDir en secours
    if (fs.existsSync(this.baseDir)) {
      const convDirs = fs.readdirSync(this.baseDir);
      for (const conv of convDirs) {
        const fullConv = path.join(this.baseDir, conv);
        if (fs.statSync(fullConv).isDirectory()) {
          const files = fs.readdirSync(fullConv);
          for (const f of files) {
            if (f.startsWith(id)) {
              const fullPath = path.join(fullConv, f);
              const stats = fs.statSync(fullPath);
              const detected = detectMagicBytesFromFile(fullPath);
              return {
                id,
                conversationId: conv,
                name: f.slice(id.length + 1),
                originalName: f.slice(id.length + 1),
                size: stats.size,
                mimeType: detected.mimeType,
                detectedType: detected.category,
                sha256: '',
                filePath: fullPath,
                createdAt: stats.birthtime.toISOString()
              };
            }
          }
        }
      }
    }

    return null;
  }

  public listAttachments(conversationId: string): AttachmentMetadata[] {
    try {
      const records = runtimeDatabase.listAttachments(conversationId);
      if (records && records.length > 0) return records;
    } catch {}

    const convDir = path.join(this.baseDir, conversationId.replace(/[^a-zA-Z0-9_\-]/g, '_'));
    if (!fs.existsSync(convDir)) return [];

    const files = fs.readdirSync(convDir);
    const results: AttachmentMetadata[] = [];

    for (const file of files) {
      if (file.startsWith('tmp_')) continue;
      const fullPath = path.join(convDir, file);
      try {
        const stats = fs.statSync(fullPath);
        if (!stats.isFile()) continue;
        const separatorIdx = file.indexOf('_');
        const id = separatorIdx > 0 ? file.slice(0, separatorIdx) : file;
        const name = separatorIdx > 0 ? file.slice(separatorIdx + 1) : file;
        const detected = detectMagicBytesFromFile(fullPath);

        results.push({
          id,
          conversationId,
          name,
          originalName: name,
          size: stats.size,
          mimeType: detected.mimeType,
          detectedType: detected.category,
          sha256: '',
          filePath: fullPath,
          createdAt: stats.birthtime.toISOString()
        });
      } catch {}
    }

    return results;
  }

  public deleteAttachment(id: string): boolean {
    const attachment = this.getAttachment(id);
    if (!attachment) return false;

    if (attachment.filePath && fs.existsSync(attachment.filePath)) {
      try { fs.unlinkSync(attachment.filePath); } catch {}
    }

    try {
      runtimeDatabase.deleteAttachment(id);
    } catch {}

    return true;
  }

  public deleteConversationAttachments(conversationId: string): void {
    const convDir = path.join(this.baseDir, conversationId.replace(/[^a-zA-Z0-9_\-]/g, '_'));
    if (fs.existsSync(convDir)) {
      try {
        fs.rmSync(convDir, { recursive: true, force: true });
      } catch {}
    }

    try {
      runtimeDatabase.deleteConversationAttachments(conversationId);
    } catch {}
  }

  public toPublicInfo(meta: AttachmentMetadata): AttachmentPublicInfo {
    return {
      id: meta.id,
      conversationId: meta.conversationId,
      name: meta.name,
      size: meta.size,
      mimeType: meta.mimeType,
      detectedType: meta.detectedType,
      sha256: meta.sha256,
      createdAt: meta.createdAt
    };
  }
}

export const attachmentManager = new AttachmentManager();
