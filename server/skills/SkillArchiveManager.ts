// server/skills/SkillArchiveManager.ts
// Cahier §13, §15, Mission R4f : Partage et archivage ZIP sécurisé des compétences

import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';
import { runtimeDatabase } from '../storage/RuntimeDatabase';
import { SkillScanner, SkillSecurityScan } from './SkillScanner';
import { SkillInfo } from './SkillManager';

export class SkillArchiveManager {
  /**
   * Exporte une compétence importée sous forme d'archive .zip
   * Les compétences système ne peuvent pas être exportées.
   */
  public static async exportSkillToZip(skill: SkillInfo): Promise<{ filename: string; buffer: Buffer }> {
    if (skill.isSystem) {
      throw new Error(`Impossible d'exporter la compétence système "${skill.name}".`);
    }

    const dirPath = path.resolve(skill.dirPath);
    if (!fs.existsSync(dirPath)) {
      throw new Error(`Le dossier de la compétence "${skill.name}" est introuvable sur le disque (${dirPath}).`);
    }

    const skillMdPath = path.join(dirPath, 'SKILL.md');
    if (!fs.existsSync(skillMdPath)) {
      throw new Error(`Le fichier SKILL.md de la compétence "${skill.name}" est introuvable.`);
    }

    const zip = new JSZip();

    // Fonction récursive pour inclure tous les fichiers du dossier
    const addDirToZip = (currentDir: string, relativeTo: string) => {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        const fullPath = path.join(currentDir, entry.name);
        const relPath = path.relative(relativeTo, fullPath).replace(/\\/g, '/');

        if (entry.isDirectory()) {
          addDirToZip(fullPath, relativeTo);
        } else if (entry.isFile()) {
          const fileData = fs.readFileSync(fullPath);
          zip.file(relPath, fileData);
        }
      }
    };

    addDirToZip(dirPath, dirPath);

    const buffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 9 }
    });

    const filename = `${skill.name}.zip`;
    return { filename, buffer };
  }

  /**
   * Importe une compétence depuis un chemin d'archive .zip ou un Buffer
   */
  public static async importSkillFromZip(
    zipSource: string | Buffer,
    targetSkillsDir: string,
    options?: { isSystem?: boolean; autoEnable?: boolean }
  ): Promise<SkillInfo & { scanReport?: SkillSecurityScan; warnings: string[] }> {
    let zipBuffer: Buffer;
    if (typeof zipSource === 'string') {
      const resolvedZip = path.resolve(zipSource);
      if (!fs.existsSync(resolvedZip)) {
        throw new Error(`L'archive ZIP spécifiée est introuvable (${zipSource}).`);
      }
      zipBuffer = fs.readFileSync(resolvedZip);
    } else {
      zipBuffer = zipSource;
    }

    return this.processZipBuffer(zipBuffer, targetSkillsDir, options);
  }

  /**
   * Importe une compétence depuis un buffer d'archive
   */
  public static async importSkillFromBuffer(
    buffer: Buffer,
    targetSkillsDir: string,
    _originalFilename?: string,
    options?: { isSystem?: boolean; autoEnable?: boolean }
  ): Promise<SkillInfo & { scanReport?: SkillSecurityScan; warnings: string[] }> {
    return this.processZipBuffer(buffer, targetSkillsDir, options);
  }

  /**
   * Traite, valide et extrait l'archive ZIP
   */
  private static async processZipBuffer(
    zipBuffer: Buffer,
    targetSkillsDir: string,
    options?: { isSystem?: boolean; autoEnable?: boolean }
  ): Promise<SkillInfo & { scanReport?: SkillSecurityScan; warnings: string[] }> {
    // 1. Décompression JSZip
    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(zipBuffer);
    } catch (err: any) {
      throw new Error(`L'archive fournie n'est pas un fichier ZIP valide : ${err.message}`);
    }

    // 2. Vérifications de sécurité : Zip-Slip et bombe de décompression
    let totalUncompressed = 0;
    let totalCompressed = 0;

    for (const [entryName, fileObj] of Object.entries(zip.files)) {
      const normalized = path.normalize(entryName).replace(/\\/g, '/');

      // Garde anti Zip-Slip strict (identique à M2 / AttachmentReader)
      if (
        normalized.startsWith('..') ||
        path.isAbsolute(normalized) ||
        entryName.includes('..') ||
        entryName.startsWith('/') ||
        entryName.startsWith('\\') ||
        /^[a-zA-Z]:/.test(entryName)
      ) {
        throw new Error("Archive rejetée pour des raisons de sécurité : détection de chemins suspects (tentative de traversée de répertoire zip-slip).");
      }

      const uncompressedSize = (fileObj as any)._data?.uncompressedSize || 0;
      const compressedSize = (fileObj as any)._data?.compressedSize || 0;
      totalUncompressed += uncompressedSize;
      totalCompressed += compressedSize;
    }

    // Protection anti bombe de décompression (> 100 Mo ou ratio > 100:1)
    if (
      totalUncompressed > 100 * 1024 * 1024 ||
      (totalCompressed > 0 && (totalUncompressed / totalCompressed) > 100 && totalUncompressed > 1024 * 1024)
    ) {
      throw new Error("Archive rejetée : taille décompressée excessive (suspicion de bombe de décompression).");
    }

    // 3. Détection du fichier SKILL.md
    let skillMdEntryKey: string | null = null;
    let prefix = '';

    const allKeys = Object.keys(zip.files).map(k => k.replace(/\\/g, '/'));
    if (allKeys.some(k => k.toLowerCase() === 'skill.md')) {
      skillMdEntryKey = allKeys.find(k => k.toLowerCase() === 'skill.md')!;
      prefix = '';
    } else {
      const found = allKeys.find(k => /(?:^|\/)skill\.md$/i.test(k));
      if (found) {
        skillMdEntryKey = found;
        prefix = found.substring(0, found.lastIndexOf('/') + 1);
      }
    }

    if (!skillMdEntryKey) {
      throw new Error("L'archive ne contient aucun fichier SKILL.md valide.");
    }

    const skillMdFile = zip.file(skillMdEntryKey);
    if (!skillMdFile) {
      throw new Error("L'archive ne contient aucun fichier SKILL.md valide.");
    }

    const skillMdContent = await skillMdFile.async('string');

    // 4. Validation frontmatter en mémoire (agentskills.io)
    const parsedYaml = SkillScanner.parseYamlFrontmatter(skillMdContent);
    const validated = SkillScanner.validateFrontmatter(parsedYaml.frontmatter);
    if (!validated.valid) {
      throw new Error(`Contenu de SKILL.md non valide : ${validated.errors.join(' ')}`);
    }

    const skillName = validated.name;
    const destDir = path.join(targetSkillsDir, skillName);

    // 5. Extraction sécurisée
    if (fs.existsSync(destDir)) {
      try {
        fs.rmSync(destDir, { recursive: true, force: true });
      } catch {}
    }
    fs.mkdirSync(destDir, { recursive: true });

    for (const [entryName, fileObj] of Object.entries(zip.files)) {
      if (fileObj.dir) continue;
      const cleanName = entryName.replace(/\\/g, '/');
      if (prefix && !cleanName.startsWith(prefix)) continue;

      const relPath = prefix ? cleanName.substring(prefix.length) : cleanName;
      if (!relPath) continue;

      const targetPath = path.resolve(destDir, relPath);
      // Confinement strict à l'intérieur du dossier cible
      if (!targetPath.startsWith(path.resolve(destDir) + path.sep)) {
        throw new Error("Archive rejetée pour des raisons de sécurité : détection de chemins suspects (tentative de traversée de répertoire zip-slip).");
      }

      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      const content = await fileObj.async('nodebuffer');
      fs.writeFileSync(targetPath, content);
    }

    // 6. Scan de sécurité et parsing N1
    const scanReport = SkillScanner.scanDirectory(destDir);
    const parsedSkill = SkillScanner.parseSkillMd(path.join(destDir, 'SKILL.md'), destDir);

    const isSystem = Boolean(options?.isSystem);
    const shouldEnable = options?.autoEnable !== undefined
      ? Boolean(options.autoEnable)
      : false; // Les compétences importées sont désactivées par défaut

    const saved = runtimeDatabase.saveSkill({
      name: parsedSkill.name,
      description: parsedSkill.description,
      dirPath: destDir,
      instructions: parsedSkill.instructions,
      enabled: shouldEnable,
      isSystem,
      metadata: parsedSkill.metadata
    });

    return {
      ...saved,
      scanReport,
      warnings: parsedSkill.warnings
    };
  }
}
