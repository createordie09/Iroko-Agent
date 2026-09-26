// server/skills/SkillManager.ts
// Cahier §13, §15, Mission N1 : Gestionnaire de Compétences (Skills) Niveau 3

import path from 'path';
import fs from 'fs';
import os from 'os';
import { runtimeDatabase } from '../storage/RuntimeDatabase';
import { SkillScanner, SkillSecurityScan, SkillParseResult } from './SkillScanner';
import { SkillArchiveManager } from './SkillArchiveManager';

export interface SkillInfo {
  id?: string;
  name: string;
  description: string;
  dirPath: string;
  instructions: string;
  enabled: boolean;
  isSystem: boolean;
  metadata?: Record<string, any>;
  warnings?: string[];
  scanReport?: SkillSecurityScan;
  createdAt?: string;
  updatedAt?: string;
}

export class SkillManager {
  private skillsDir: string;
  private initialized = false;

  constructor(customDataDir?: string) {
    const dataDir = customDataDir || process.env.IROKO_DATA_DIR || (
      process.platform === 'win32' && process.env.APPDATA
        ? path.join(process.env.APPDATA, 'iroko')
        : path.join(os.homedir(), '.iroko')
    );
    this.skillsDir = path.join(dataDir, 'skills');

    if (!fs.existsSync(this.skillsDir)) {
      try {
        fs.mkdirSync(this.skillsDir, { recursive: true });
      } catch {}
    }
  }

  public getSkillsDir(): string {
    return this.skillsDir;
  }

  private discoverInDirectory(dir: string, isSystem: boolean): void {
    if (!fs.existsSync(dir)) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const skillPath = path.join(dir, entry.name);
          const skillMd = path.join(skillPath, 'SKILL.md');
          if (fs.existsSync(skillMd)) {
            try {
              const parsed = SkillScanner.parseSkillMd(skillMd, skillPath);
              const existing = runtimeDatabase.getSkill(parsed.name);
              if (!existing) {
                runtimeDatabase.saveSkill({
                  name: parsed.name, description: parsed.description, dirPath: skillPath,
                  instructions: parsed.instructions, enabled: true, isSystem, metadata: parsed.metadata
                });
              }
            } catch {}
          }
        }
      }
    } catch {}
  }

  /**
   * Initialise le catalogue de compétences depuis la base de données
   * et découvre les compétences système et du workspace (.agents/skills)
   */
  public async init(workspacePath = process.cwd()): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    // 1. Découverte des compétences système (dans server/skills/system et skills/system/)
    const codeSystemDir = path.resolve(process.cwd(), 'server', 'skills', 'system');
    this.discoverInDirectory(codeSystemDir, true);

    const runtimeSystemDir = path.join(this.skillsDir, 'system');
    if (runtimeSystemDir !== codeSystemDir) {
      this.discoverInDirectory(runtimeSystemDir, true);
    }

    // 2. Découverte des compétences dans le workspace (.agents/skills)
    const workspaceSkillsDir = path.join(workspacePath, '.agents', 'skills');
    this.discoverInDirectory(workspaceSkillsDir, false);
  }

  /**
   * Parse un fichier SKILL.md avec validation frontmatter (agentskills.io)
   */
  public parseSkillFile(filePath: string, dirPath: string): SkillParseResult {
    return SkillScanner.parseSkillMd(filePath, dirPath);
  }

  /**
   * Scanne la sécurité d'un dossier de compétence
   */
  public scanSkillDirectory(dirPath: string): SkillSecurityScan {
    return SkillScanner.scanDirectory(dirPath);
  }

  /**
   * Liste toutes les compétences enregistrées
   */
  public listSkills(): SkillInfo[] {
    return runtimeDatabase.listSkills();
  }

  /**
   * Récupère une compétence par son nom ou son id
   */
  public getSkill(nameOrId: string): SkillInfo | null {
    if (!nameOrId) return null;
    const direct = runtimeDatabase.getSkill(nameOrId);
    if (direct) return direct;

    const all = this.listSkills();
    return all.find(s => s.id === nameOrId || s.name.toLowerCase() === nameOrId.toLowerCase()) || null;
  }

  /**
   * Active ou désactive une compétence
   */
  public setSkillEnabled(name: string, enabled: boolean): boolean {
    return runtimeDatabase.setSkillEnabled(name, enabled);
  }

  /**
   * Importe une compétence depuis un dossier contenant un fichier SKILL.md
   * Règles Mission N1 :
   * - Validation stricte du frontmatter (agentskills.io).
   * - Scan de sécurité avant activation.
   * - Désactivée par défaut pour les compétences non-système (enabled: false).
   */
  public async importSkillFromDirectory(
    dirPath: string,
    options?: { isSystem?: boolean; autoEnable?: boolean }
  ): Promise<SkillInfo & { scanReport?: SkillSecurityScan; warnings: string[] }> {
    const resolvedPath = path.resolve(dirPath);

    // Support direct des archives .zip (Mission R4f)
    if (resolvedPath.toLowerCase().endsWith('.zip') || (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isFile())) {
      return SkillArchiveManager.importSkillFromZip(resolvedPath, this.skillsDir, options);
    }

    const skillMd = path.join(resolvedPath, 'SKILL.md');

    if (!fs.existsSync(skillMd)) {
      throw new Error(`Le dossier spécifié ne contient aucun fichier SKILL.md (${dirPath})`);
    }

    // 1. Analyse et validation stricte du frontmatter
    const parsed = SkillScanner.parseSkillMd(skillMd, resolvedPath);

    // 2. Scan de sécurité
    const isSystem = Boolean(options?.isSystem);
    const scanReport = SkillScanner.scanDirectory(resolvedPath);

    // 3. Statut d'activation par défaut : désactivé pour compétence importée
    const shouldEnable = options?.autoEnable !== undefined
      ? Boolean(options.autoEnable)
      : (options === undefined ? true : Boolean(options.isSystem));

    const saved = runtimeDatabase.saveSkill({
      name: parsed.name, description: parsed.description, dirPath: resolvedPath,
      instructions: parsed.instructions, enabled: shouldEnable, isSystem, metadata: parsed.metadata
    });

    return {
      ...saved,
      scanReport,
      warnings: parsed.warnings
    };
  }

  /**
   * Exporte une compétence sous forme d'archive .zip téléchargeable (Mission R4f)
   */
  public async exportSkill(name: string): Promise<{ filename: string; buffer: Buffer }> {
    const skill = this.getSkill(name);
    if (!skill) throw new Error(`Compétence introuvable : "${name}".`);
    return SkillArchiveManager.exportSkillToZip(skill);
  }

  /**
   * Importe une compétence depuis un buffer d'archive .zip (Mission R4f)
   */
  public async importSkillFromBuffer(
    buffer: Buffer,
    originalFilename?: string,
    options?: { isSystem?: boolean; autoEnable?: boolean }
  ): Promise<SkillInfo & { scanReport?: SkillSecurityScan; warnings: string[] }> {
    return SkillArchiveManager.importSkillFromBuffer(buffer, this.skillsDir, originalFilename, options);
  }

  /**
   * Met à jour une compétence
   */
  public updateSkill(name: string, updates: { description?: string; instructions?: string }): SkillInfo | null {
    const existing = runtimeDatabase.getSkill(name);
    if (!existing) return null;

    const saved = runtimeDatabase.saveSkill({
      ...existing,
      description: updates.description !== undefined ? updates.description : existing.description,
      instructions: updates.instructions !== undefined ? updates.instructions : existing.instructions
    });

    return saved;
  }

  /**
   * Supprime une compétence (interdit pour les compétences système)
   */
  public deleteSkill(name: string): boolean {
    const existing = this.getSkill(name);
    if (existing?.isSystem) {
      throw new Error(`Impossible de supprimer la compétence système "${name}". Elle peut uniquement être désactivée.`);
    }
    return runtimeDatabase.deleteSkill(name);
  }

  /**
   * Vérifie si un fichier de référence est explicitement cité par son nom
   * dans le corps de SKILL.md d'une compétence active (Niveau 3).
   */
  public isReferenceCited(skillNameOrPath: string, referenceFileName: string): boolean {
    const skill = this.getSkill(skillNameOrPath) || this.listSkills().find(s => s.dirPath === skillNameOrPath);
    if (!skill || !skill.instructions) return false;
    const baseName = path.basename(referenceFileName);
    return skill.instructions.includes(baseName) || skill.instructions.includes(`references/${baseName}`) || skill.instructions.includes(`references\\${baseName}`);
  }

  /**
   * Détecte si un chemin pointe vers un fichier de référence d'une compétence
   * et retourne le statut d'autorisation de lecture.
   */
  public checkReferenceAccess(targetFilePath: string): {
    isSkillReference: boolean;
    allowed: boolean;
    skillName?: string;
    resolvedPath?: string;
    reason?: string;
  } {
    if (!targetFilePath || typeof targetFilePath !== 'string') {
      return { isSkillReference: false, allowed: true };
    }

    const normPath = targetFilePath.replace(/\\/g, '/').replace(/\/+$/, '');

    // 1. Tentative de lecture du dossier references/ complet
    const dirMatch = normPath.match(/(?:^|\/)(?:\.agents\/skills\/|skills\/)([^/]+)\/references$/i);
    if (dirMatch) {
      return {
        isSkillReference: true,
        allowed: false,
        skillName: dirMatch[1],
        reason: 'Lecture du dossier references/ interdite. Seul un fichier de référence spécifique cité dans SKILL.md peut être lu.'
      };
    }

    // 2. Détection via pattern de chemin relatif ou absolu
    let skillName: string | undefined;
    let refFileName: string | undefined;

    const relMatch = normPath.match(/(?:^|\/)(?:\.agents\/skills\/|skills\/)([^/]+)\/references\/([^/]+)$/i);
    if (relMatch) {
      skillName = relMatch[1];
      refFileName = relMatch[2];
    } else {
      // Vérification par rapport aux dirPath de compétences enregistrées
      const resolvedTarget = path.resolve(targetFilePath).toLowerCase();
      for (const s of this.listSkills()) {
        const skillRefsDir = path.resolve(s.dirPath, 'references').toLowerCase();
        if (resolvedTarget === skillRefsDir) {
          return {
            isSkillReference: true,
            allowed: false,
            skillName: s.name,
            reason: 'Lecture du dossier references/ interdite. Seul un fichier de référence spécifique cité dans SKILL.md peut être lu.'
          };
        }
        if (resolvedTarget.startsWith(skillRefsDir + path.sep)) {
          skillName = s.name;
          refFileName = path.basename(targetFilePath);
          break;
        }
      }
    }

    if (!skillName || !refFileName) {
      return { isSkillReference: false, allowed: true };
    }

    const skill = this.getSkill(skillName);
    if (!skill) {
      return {
        isSkillReference: true,
        allowed: false,
        skillName,
        reason: `Compétence introuvable ou inactive\u00A0: ${skillName}`
      };
    }

    const cited = this.isReferenceCited(skill.name, refFileName);
    if (!cited) {
      return {
        isSkillReference: true,
        allowed: false,
        skillName: skill.name,
        reason: `La référence "${refFileName}" n'est pas citée dans le corps de SKILL.md de la compétence "${skill.name}". Aucune lecture automatique de tout le dossier.`
      };
    }

    const resolvedPath = path.join(skill.dirPath, 'references', refFileName);
    return {
      isSkillReference: true,
      allowed: true,
      skillName: skill.name,
      resolvedPath
    };
  }

  /**
   * Génère le catalogue descriptif pour le prompt système (§13 - Niveau 1).
   * RÈGLE STRICTE : Seule la description courte est incluse dans le catalogue.
   */
  public getSkillsCatalogForPrompt(): string {
    const skills = runtimeDatabase.listSkills().filter(s => s.enabled);
    if (skills.length === 0) return '';

    const lines = skills.map(s => `- ${s.name}: ${s.description}`);
    return `<available_skills>\n${lines.join('\n')}\n</available_skills>`;
  }

  /**
   * Retourne la liste des compétences actives pertinentes pour un prompt donné (§13 - Niveau 2)
   */
  public getRelevantSkills(userPrompt: string): SkillInfo[] {
    if (!userPrompt || typeof userPrompt !== 'string') return [];

    const skills = runtimeDatabase.listSkills().filter(s => s.enabled);
    const relevantSkills: SkillInfo[] = [];
    const normalizedPrompt = userPrompt.toLowerCase();

    for (const skill of skills) {
      const skillName = skill.name.toLowerCase();
      if (
        normalizedPrompt.includes(skillName) ||
        normalizedPrompt.includes(skillName.replace(/-/g, ' ')) ||
        (skill.description && normalizedPrompt.includes(skill.description.slice(0, 30).toLowerCase()))
      ) {
        relevantSkills.push(skill);
      }
    }

    return relevantSkills;
  }

  /**
   * Chargement à la demande (§13 - Niveau 2) :
   * Renvoie les instructions complètes UNIQUEMENT si la requête de l'utilisateur
   * mentionne expressément ou concerne la compétence.
   * RÈGLE NIVEAU 3 : Les dossiers references/, scripts/ et assets/ ne sont JAMAIS chargés automatiquement ici.
   */
  public getRelevantSkillInstructions(userPrompt: string): string | null {
    const relevantSkills = this.getRelevantSkills(userPrompt);
    if (relevantSkills.length === 0) return null;

    const blocks = relevantSkills.map(s => {
      // Limiter la taille des instructions injectées pour préserver le budget de tokens
      const cappedInstructions = s.instructions.slice(0, 6000);
      return `<skill_instructions name="${s.name}">\n${cappedInstructions}\n</skill_instructions>`;
    });

    return blocks.join('\n\n');
  }
}

export const skillManager = new SkillManager();
