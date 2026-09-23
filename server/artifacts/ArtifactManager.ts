import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import JSZip from 'jszip';
import mammoth from 'mammoth';
import ExcelJS from 'exceljs';
import { PDFDocument } from 'pdf-lib';
import { runtimeDatabase } from '../storage/RuntimeDatabase';

export interface ArtifactMeta {
  id: string;
  conversationId: string;
  messageId?: string | null;
  name: string;
  title?: string | null;
  mimeType: string;
  currentVersion: number;
  size: number;
  metadata?: any;
  createdAt: string;
  updatedAt: string;
}

export interface ArtifactVersionMeta {
  id: string;
  artifactId: string;
  version: number;
  size: number;
  filePath: string;
  createdAt: string;
}

export interface ArtifactWithVersions extends ArtifactMeta {
  versions: ArtifactVersionMeta[];
  content?: string;
}

const WINDOWS_RESERVED_NAMES = new Set([
  'con', 'prn', 'aux', 'nul',
  'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
  'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9'
]);

export class ArtifactManager {
  private static instance: ArtifactManager;
  private readonly baseArtifactsDir: string;
  public static readonly MAX_ARTIFACT_BYTES = 50 * 1024 * 1024; // 50 Mo

  private constructor() {
    const dataDir = process.env.IROKO_DATA_DIR || (
      process.platform === 'win32' && process.env.APPDATA
        ? path.join(process.env.APPDATA, 'iroko')
        : path.join(os.homedir(), '.iroko')
    );
    this.baseArtifactsDir = path.join(dataDir, 'artifacts');
    if (!fs.existsSync(this.baseArtifactsDir)) {
      fs.mkdirSync(this.baseArtifactsDir, { recursive: true });
    }
  }

  public static getInstance(): ArtifactManager {
    if (!ArtifactManager.instance) {
      ArtifactManager.instance = new ArtifactManager();
    }
    return ArtifactManager.instance;
  }

  /**
   * Valide et assainit rigoureusement un nom de fichier d'artéfact.
   * Conforme au cahier des charges et aux exigences multiplateformes.
   */
  public sanitizeFilename(filename: string): string {
    if (!filename || typeof filename !== 'string') {
      throw new Error('Le nom de fichier d\'artéfact est requis.');
    }

    const trimmed = filename.trim();
    if (!trimmed) {
      throw new Error('Le nom de fichier d\'artéfact ne peut pas être vide.');
    }

    if (trimmed.length > 128) {
      throw new Error('Le nom de fichier d\'artéfact dépasse la limite autorisée de 128 caractères.');
    }

    // Interdiction formelle des séparateurs de chemin et de la traversée de répertoire
    if (trimmed.includes('/') || trimmed.includes('\\') || trimmed.includes('..')) {
      throw new Error('Le nom de fichier d\'artéfact ne doit pas contenir de séparateur de chemin ni de "..".');
    }

    // Interdiction des caractères interdits sous Windows et Unix (< > : " / \ | ? * et contrôles 0-31)
    if (/[<>:"/\\|?*\x00-\x1f]/.test(trimmed)) {
      throw new Error('Le nom de fichier d\'artéfact contient des caractères non autorisés.');
    }

    // Interdiction des noms avec espace ou point final
    if (trimmed.endsWith(' ') || trimmed.endsWith('.')) {
      throw new Error('Le nom de fichier d\'artéfact ne peut pas se terminer par un espace ou un point.');
    }

    // Interdiction des noms réservés Windows (DOS device names)
    const baseName = (trimmed.indexOf('.') === -1 ? trimmed : trimmed.substring(0, trimmed.indexOf('.'))).toLowerCase();
    if (WINDOWS_RESERVED_NAMES.has(baseName)) {
      throw new Error(`Le nom de fichier "${trimmed}" est réservé par le système.`);
    }

    return trimmed;
  }

  /**
   * Détecte le type MIME à partir de l'extension si non fourni.
   */
  public inferMimeType(filename: string, explicitMime?: string): string {
    if (explicitMime && explicitMime.trim()) {
      return explicitMime.trim().toLowerCase();
    }

    const ext = path.extname(filename).toLowerCase();
    switch (ext) {
      case '.md':
      case '.markdown':
        return 'text/markdown';
      case '.txt':
        return 'text/plain';
      case '.json':
        return 'application/json';
      case '.csv':
        return 'text/csv';
      case '.js':
      case '.mjs':
        return 'application/javascript';
      case '.ts':
        return 'text/typescript';
      case '.html':
      case '.htm':
        return 'text/html';
      case '.css':
        return 'text/css';
      case '.py':
        return 'text/x-python';
      case '.sh':
      case '.bash':
        return 'text/x-shellscript';
      case '.xml':
        return 'text/xml';
      case '.svg':
        return 'image/svg+xml';
      case '.yaml':
      case '.yml':
        return 'text/yaml';
      case '.docx':
        return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      case '.xlsx':
        return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      case '.pptx':
        return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
      case '.pdf':
        return 'application/pdf';
      case '.zip':
        return 'application/zip';
      case '.png':
        return 'image/png';
      case '.jpg':
      case '.jpeg':
        return 'image/jpeg';
      case '.gif':
        return 'image/gif';
      case '.webp':
        return 'image/webp';
      default:
        return 'text/plain';
    }
  }

  public isBinary(mimeType: string): boolean {
    if (
      mimeType.startsWith('text/') ||
      mimeType === 'application/json' ||
      mimeType === 'image/svg+xml' ||
      mimeType === 'application/javascript' ||
      mimeType === 'text/typescript' ||
      mimeType === 'application/xml' ||
      mimeType === 'text/yaml'
    ) {
      return false;
    }
    return true;
  }

  /**
   * Crée un nouvel artéfact texte ou binaire (v1) et l'enregistre sur disque et en base de données.
   */
  public createArtifact(params: {
    conversationId: string;
    filename: string;
    content?: string;
    contentBuffer?: Buffer;
    mimeType?: string;
    title?: string;
    messageId?: string | null;
    metadata?: any;
  }): ArtifactWithVersions {
    const { conversationId, filename, content, contentBuffer, mimeType, title, messageId, metadata } = params;

    if (!conversationId) {
      throw new Error('Le champ conversationId est requis.');
    }

    const safeFilename = this.sanitizeFilename(filename);
    const resolvedMime = this.inferMimeType(safeFilename, mimeType);

    const buffer = contentBuffer ? contentBuffer : Buffer.from(content ?? '', 'utf-8');
    if (buffer.length > ArtifactManager.MAX_ARTIFACT_BYTES) {
      throw new Error(`Taille d'artéfact (${(buffer.length / (1024 * 1024)).toFixed(1)} Mo) supérieure à la limite autorisée de 50 Mo.`);
    }

    const artifactId = 'art_' + crypto.randomUUID();
    const versionId = 'artver_' + crypto.randomUUID();
    const version = 1;

    const versionDir = path.join(this.baseArtifactsDir, conversationId, artifactId, `v${version}`);
    if (!fs.existsSync(versionDir)) {
      fs.mkdirSync(versionDir, { recursive: true });
    }

    const filePath = path.join(versionDir, safeFilename);
    fs.writeFileSync(filePath, buffer);

    const now = new Date().toISOString();

    runtimeDatabase.recordArtifact({
      id: artifactId,
      conversationId,
      messageId: messageId || null,
      name: safeFilename,
      title: title || safeFilename,
      mimeType: resolvedMime,
      currentVersion: version,
      size: buffer.length,
      filePath,
      versionId,
      metadata,
      createdAt: now,
      updatedAt: now
    });

    const meta: ArtifactWithVersions = {
      id: artifactId,
      conversationId,
      messageId: messageId || null,
      name: safeFilename,
      title: title || safeFilename,
      mimeType: resolvedMime,
      currentVersion: version,
      size: buffer.length,
      metadata,
      createdAt: now,
      updatedAt: now,
      content,
      versions: [
        {
          id: versionId,
          artifactId,
          version,
          size: buffer.length,
          filePath,
          createdAt: now
        }
      ]
    };

    return meta;
  }

  /**
   * Met à jour un artéfact existant en créant une nouvelle version incrémentée.
   */
  public updateArtifact(params: {
    id: string;
    content?: string;
    patch?: string;
    title?: string;
  }): ArtifactWithVersions {
    const { id, content, patch, title } = params;

    const existing = runtimeDatabase.getArtifact(id);
    if (!existing) {
      throw new Error(`Artéfact introuvable avec l'identifiant "${id}".`);
    }

    let newContent = content;

    // Si un patch est fourni à la place du contenu complet
    if (newContent === undefined && patch !== undefined) {
      const currentContent = this.getArtifactContent(id, existing.currentVersion);
      // Application de patch simple : remplacement si présent, ou ajout
      newContent = currentContent + '\n' + patch;
    }

    if (newContent === undefined) {
      throw new Error('Soit le contenu complet (content) soit un patch (patch) doit être fourni.');
    }

    const buffer = Buffer.from(newContent, 'utf-8');
    if (buffer.length > ArtifactManager.MAX_ARTIFACT_BYTES) {
      throw new Error(`Taille d'artéfact (${(buffer.length / (1024 * 1024)).toFixed(1)} Mo) supérieure à la limite autorisée de 50 Mo.`);
    }

    const newVersion = existing.currentVersion + 1;
    const versionId = 'artver_' + crypto.randomUUID();

    const versionDir = path.join(this.baseArtifactsDir, existing.conversationId, id, `v${newVersion}`);
    if (!fs.existsSync(versionDir)) {
      fs.mkdirSync(versionDir, { recursive: true });
    }

    const filePath = path.join(versionDir, existing.name);
    fs.writeFileSync(filePath, buffer);

    const now = new Date().toISOString();

    runtimeDatabase.addArtifactVersion({
      id: versionId,
      artifactId: id,
      version: newVersion,
      size: buffer.length,
      filePath,
      title: title || existing.title,
      updatedAt: now
    });

    const updated = this.getArtifact(id);
    if (!updated) {
      throw new Error('Erreur lors de la récupération de l\'artéfact mis à jour.');
    }

    return {
      ...updated,
      content: newContent
    };
  }

  /**
   * Restaure une version passée en créant une nouvelle version identique à la version cible.
   */
  public restoreVersion(id: string, targetVersion: number): ArtifactWithVersions {
    const targetContent = this.getArtifactContent(id, targetVersion);
    return this.updateArtifact({
      id,
      content: targetContent
    });
  }

  /**
   * Récupère le contenu brut d'un artéfact pour une version donnée (ou la version courante).
   */
  public getArtifactContent(id: string, version?: number): string {
    const artifact = runtimeDatabase.getArtifact(id);
    if (!artifact) {
      throw new Error(`Artéfact introuvable : "${id}".`);
    }

    const targetVer = version !== undefined ? version : artifact.currentVersion;
    const verMeta = runtimeDatabase.getArtifactVersion(id, targetVer);
    if (!verMeta || !fs.existsSync(verMeta.filePath)) {
      throw new Error(`Version ${targetVer} introuvable pour l'artéfact "${id}".`);
    }

    return fs.readFileSync(verMeta.filePath, 'utf-8');
  }

  /**
   * Récupère les métadonnées et la liste des versions d'un artéfact.
   */
  public getArtifact(id: string): ArtifactWithVersions | null {
    const artifact = runtimeDatabase.getArtifact(id);
    if (!artifact) return null;

    const versions = runtimeDatabase.listArtifactVersions(id);
    let content: string | undefined;
    try {
      content = this.getArtifactContent(id, artifact.currentVersion);
    } catch {}

    return {
      ...artifact,
      versions,
      content
    };
  }

  /**
   * Récupère le chemin physique du fichier pour le téléchargement sécurisé.
   */
  public getArtifactFilePath(id: string, version?: number): { filePath: string; filename: string; mimeType: string } | null {
    const artifact = runtimeDatabase.getArtifact(id);
    if (!artifact) return null;

    const targetVer = version !== undefined ? version : artifact.currentVersion;
    const verMeta = runtimeDatabase.getArtifactVersion(id, targetVer);
    if (!verMeta || !fs.existsSync(verMeta.filePath)) return null;

    return {
      filePath: verMeta.filePath,
      filename: artifact.name,
      mimeType: artifact.mimeType
    };
  }

  /**
   * Liste tous les artéfacts d'une conversation.
   */
  public listArtifacts(conversationId: string): ArtifactWithVersions[] {
    const list = runtimeDatabase.listArtifacts(conversationId);
    return list.map(art => {
      const versions = runtimeDatabase.listArtifactVersions(art.id);
      return {
        ...art,
        versions
      };
    });
  }

  /**
   * Crée une archive ZIP regroupant l'intégralité des artéfacts courants d'une conversation.
   */
  public async createZipArchive(conversationId: string): Promise<{ filePath: string; filename: string; size: number } | null> {
    const artifacts = this.listArtifacts(conversationId);
    if (!artifacts || artifacts.length === 0) return null;

    const zip = new JSZip();
    const usedNames = new Set<string>();

    for (const art of artifacts) {
      const fileInfo = this.getArtifactFilePath(art.id, art.currentVersion);
      if (fileInfo && fs.existsSync(fileInfo.filePath)) {
        let entryName = art.name;
        if (usedNames.has(entryName)) {
          const ext = path.extname(entryName);
          const base = path.basename(entryName, ext);
          let count = 1;
          while (usedNames.has(`${base}_${count}${ext}`)) {
            count++;
          }
          entryName = `${base}_${count}${ext}`;
        }
        usedNames.add(entryName);
        const data = fs.readFileSync(fileInfo.filePath);
        zip.file(entryName, data);
      }
    }

    const zipBuffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    });

    const exportDir = path.join(this.baseArtifactsDir, conversationId, '_exports');
    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir, { recursive: true });
    }

    const filename = `artefacts_${conversationId.substring(0, 12)}_${Date.now()}.zip`;
    const zipPath = path.join(exportDir, filename);
    fs.writeFileSync(zipPath, zipBuffer);

    return {
      filePath: zipPath,
      filename,
      size: zipBuffer.length
    };
  }

  /**
   * Extrait un aperçu structuré et sécurisé d'un artéfact selon son type.
   */
  public async extractArtifactPreview(id: string, version?: number): Promise<{
    previewType: 'text' | 'html' | 'svg' | 'image' | 'docx' | 'xlsx' | 'pptx' | 'pdf' | 'binary';
    text?: string;
    sheets?: Array<{ name: string; rows: any[][] }>;
    slides?: Array<{ title?: string; text: string }>;
    pageCount?: number;
    metadata?: Record<string, any>;
    error?: string;
  }> {
    const artifact = this.getArtifact(id);
    if (!artifact) {
      throw new Error(`Artéfact introuvable : "${id}".`);
    }

    const fileInfo = this.getArtifactFilePath(id, version);
    if (!fileInfo || !fs.existsSync(fileInfo.filePath)) {
      throw new Error(`Fichier introuvable pour l'artéfact "${id}".`);
    }

    const { filePath, mimeType } = fileInfo;
    const ext = path.extname(fileInfo.filename).toLowerCase();

    // 1. Fichiers HTML
    if (mimeType === 'text/html' || ext === '.html' || ext === '.htm') {
      const text = fs.readFileSync(filePath, 'utf-8');
      return { previewType: 'html', text };
    }

    // 2. Fichiers SVG
    if (mimeType === 'image/svg+xml' || ext === '.svg') {
      const text = fs.readFileSync(filePath, 'utf-8');
      return { previewType: 'svg', text };
    }

    // 3. Fichiers Image
    if (mimeType.startsWith('image/')) {
      return { previewType: 'image' };
    }

    // 4. Documents Word (.docx)
    if (
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      ext === '.docx'
    ) {
      try {
        const result = await mammoth.extractRawText({ path: filePath });
        return {
          previewType: 'docx',
          text: result.value || 'Document Word vide.'
        };
      } catch (err: any) {
        return {
          previewType: 'docx',
          error: `Erreur d'extraction du texte Word : ${err.message}`
        };
      }
    }

    // 5. Classeurs Excel (.xlsx)
    if (
      mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      ext === '.xlsx'
    ) {
      try {
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.readFile(filePath);
        const sheets = wb.worksheets.map(ws => {
          const rows: any[][] = [];
          ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
            if (rowNumber <= 50) {
              const vals = (row.values as any[]) || [];
              rows.push(vals.slice(1));
            }
          });
          return { name: ws.name, rows };
        });
        return {
          previewType: 'xlsx',
          sheets
        };
      } catch (err: any) {
        return {
          previewType: 'xlsx',
          error: `Erreur de lecture du classeur Excel : ${err.message}`
        };
      }
    }

    // 6. Présentations PowerPoint (.pptx)
    if (
      mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
      ext === '.pptx'
    ) {
      try {
        const data = fs.readFileSync(filePath);
        const zip = await JSZip.loadAsync(data);
        const slides: Array<{ title?: string; text: string }> = [];

        const slideFiles = Object.keys(zip.files)
          .filter(name => name.startsWith('ppt/slides/slide') && name.endsWith('.xml'))
          .sort((a, b) => {
            const numA = parseInt(a.replace(/[^\d]/g, '') || '0', 10);
            const numB = parseInt(b.replace(/[^\d]/g, '') || '0', 10);
            return numA - numB;
          });

        for (let i = 0; i < slideFiles.length; i++) {
          const xml = await zip.files[slideFiles[i]].async('text');
          // Extraction sommaire de tous les fragments de texte <a:t>...</a:t>
          const matches = xml.match(/<a:t>([^<]+)<\/a:t>/g) || [];
          const textFragments = matches.map(m => m.replace(/<\/?a:t>/g, '').trim()).filter(Boolean);
          slides.push({
            title: textFragments[0] || `Diapositive ${i + 1}`,
            text: textFragments.join('\n')
          });
        }

        return {
          previewType: 'pptx',
          slides
        };
      } catch (err: any) {
        return {
          previewType: 'pptx',
          error: `Erreur de lecture de la présentation : ${err.message}`
        };
      }
    }

    // 7. Documents PDF (.pdf)
    if (mimeType === 'application/pdf' || ext === '.pdf') {
      try {
        const data = fs.readFileSync(filePath);
        const pdfDoc = await PDFDocument.load(data);
        return {
          previewType: 'pdf',
          pageCount: pdfDoc.getPageCount(),
          metadata: {
            title: pdfDoc.getTitle(),
            author: pdfDoc.getAuthor()
          }
        };
      } catch (err: any) {
        return {
          previewType: 'pdf',
          error: `Erreur de lecture du PDF : ${err.message}`
        };
      }
    }

    // 8. Fichiers texte classiques
    if (!this.isBinary(mimeType)) {
      const text = fs.readFileSync(filePath, 'utf-8');
      return { previewType: 'text', text };
    }

    // 9. Autres binaires
    return { previewType: 'binary' };
  }

  /**
   * Purge physiquement et en base tous les artéfacts d'une conversation lors de sa suppression.
   */
  public deleteConversationArtifacts(conversationId: string): void {
    runtimeDatabase.deleteConversationArtifacts(conversationId);
    const convDir = path.join(this.baseArtifactsDir, conversationId);
    if (fs.existsSync(convDir)) {
      try {
        fs.rmSync(convDir, { recursive: true, force: true });
      } catch (err) {
        console.warn(`[ArtifactManager] Échec de la purge des artéfacts pour "${conversationId}":`, err);
      }
    }
  }
}

export const artifactManager = ArtifactManager.getInstance();
