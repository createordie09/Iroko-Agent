// server/skills/SkillManager.ts
// Cahier §13, §15 : Gestionnaire de Compétences (Skills) & Chargement à la Demande

import path from 'path';
import fs from 'fs';
import os from 'os';
import { runtimeDatabase } from '../storage/RuntimeDatabase';

export interface SkillInfo {
  id?: string;
  name: string;
  description: string;
  dirPath: string;
  instructions: string;
  enabled: boolean;
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

  /**
   * Initialise le catalogue de compétences depuis la base de données
   * et découvre les compétences du workspace (.agents/skills)
   */
  public async init(workspacePath = process.cwd()): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    // Découverte des compétences dans le workspace (.agents/skills)
    const workspaceSkillsDir = path.join(workspacePath, '.agents', 'skills');
    if (fs.existsSync(workspaceSkillsDir)) {
      try {
        const entries = fs.readdirSync(workspaceSkillsDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const skillPath = path.join(workspaceSkillsDir, entry.name);
            const skillMd = path.join(skillPath, 'SKILL.md');
            if (fs.existsSync(skillMd)) {
              try {
                const parsed = this.parseSkillFile(skillMd, skillPath);
                // Si la compétence n'est pas encore enregistrée en base, la persister
                const existing = runtimeDatabase.getSkill(parsed.name);
                if (!existing) {
                  runtimeDatabase.saveSkill({
                    name: parsed.name,
                    description: parsed.description,
                    dirPath: skillPath,
                    instructions: parsed.instructions,
                    enabled: true
                  });
                }
              } catch {}
            }
          }
        }
      } catch {}
    }
  }

  /**
   * Parse un fichier SKILL.md avec frontmatter YAML basique et corps Markdown
   */
  public parseSkillFile(filePath: string, dirPath: string): { name: string; description: string; instructions: string } {
    const content = fs.readFileSync(filePath, 'utf-8');
    let name = path.basename(dirPath);
    let description = '';
    let instructions = content;

    // Analyse du frontmatter YAML entre deux '---'
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
    if (match) {
      const frontmatter = match[1];
      instructions = match[2].trim();

      const nameMatch = frontmatter.match(/^name:\s*([^\r\n]+)/m);
      if (nameMatch) {
        name = nameMatch[1].trim().replace(/^['"]|['"]$/g, '');
      }

      const descMatch = frontmatter.match(/^description:\s*([^\r\n]+(?:\r?\n\s+[^\r\n]+)*)/m);
      if (descMatch) {
        description = descMatch[1].replace(/\r?\n\s+/g, ' ').trim().replace(/^['"]|['"]$/g, '');
      }
    }

    return {
      name,
      description: description || `Compétence ${name}`,
      instructions
    };
  }

  /**
   * Liste toutes les compétences enregistrées
   */
  public listSkills(): SkillInfo[] {
    return runtimeDatabase.listSkills();
  }

  /**
   * Récupère une compétence par son nom
   */
  public getSkill(name: string): SkillInfo | null {
    return runtimeDatabase.getSkill(name);
  }

  /**
   * Active ou désactive une compétence
   */
  public setSkillEnabled(name: string, enabled: boolean): boolean {
    return runtimeDatabase.setSkillEnabled(name, enabled);
  }

  /**
   * Importe une compétence depuis un dossier contenant un fichier SKILL.md
   */
  public async importSkillFromDirectory(dirPath: string): Promise<SkillInfo> {
    const resolvedPath = path.resolve(dirPath);
    const skillMd = path.join(resolvedPath, 'SKILL.md');

    if (!fs.existsSync(skillMd)) {
      throw new Error(`Le dossier spécifié ne contient aucun fichier SKILL.md (${dirPath})`);
    }

    const parsed = this.parseSkillFile(skillMd, resolvedPath);

    const saved = runtimeDatabase.saveSkill({
      name: parsed.name,
      description: parsed.description,
      dirPath: resolvedPath,
      instructions: parsed.instructions,
      enabled: true
    });

    return saved;
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
   * Supprime une compétence
   */
  public deleteSkill(name: string): boolean {
    return runtimeDatabase.deleteSkill(name);
  }

  /**
   * Génère le catalogue descriptif pour le prompt système (§13).
   * RÈGLE STRICTE : Seule la description courte est incluse dans le catalogue.
   */
  public getSkillsCatalogForPrompt(): string {
    const skills = runtimeDatabase.listSkills().filter(s => s.enabled);
    if (skills.length === 0) return '';

    const lines = skills.map(s => `- ${s.name}: ${s.description}`);
    return `<available_skills>\n${lines.join('\n')}\n</available_skills>`;
  }

  /**
   * Chargement à la demande (§13) :
   * Renvoie les instructions complètes UNIQUEMENT si la requête de l'utilisateur
   * mentionne expressément ou concerne la compétence.
   * Les scripts de la compétence ne sont JAMAIS exécutés automatiquement.
   */
  public getRelevantSkillInstructions(userPrompt: string): string | null {
    if (!userPrompt || typeof userPrompt !== 'string') return null;

    const skills = runtimeDatabase.listSkills().filter(s => s.enabled);
    const relevantSkills: SkillInfo[] = [];

    const normalizedPrompt = userPrompt.toLowerCase();

    for (const skill of skills) {
      const skillName = skill.name.toLowerCase();
      // Correspondance sur le nom exact de la compétence ou mot-clé préfixé
      if (
        normalizedPrompt.includes(skillName) ||
        normalizedPrompt.includes(skillName.replace(/-/g, ' ')) ||
        (skill.description && normalizedPrompt.includes(skill.description.slice(0, 30).toLowerCase()))
      ) {
        relevantSkills.push(skill);
      }
    }

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
