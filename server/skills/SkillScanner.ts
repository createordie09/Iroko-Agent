// server/skills/SkillScanner.ts
// Cahier §13, §15, Mission N1 : Validation Frontmatter (agentskills.io) & Scanner de Sécurité

import fs from 'fs';
import path from 'path';

export interface SkillFinding {
  file: string;
  line: number;
  type: 'network' | 'command' | 'traversal' | 'url';
  snippet: string;
}

export interface SkillSecurityScan {
  scriptsCount: number;
  totalFilesCount: number;
  networkCount: number;
  commandCount: number;
  traversalCount: number;
  scripts: string[];
  urls: string[];
  networkCalls: string[];
  commandExecutions: string[];
  pathTraversals: string[];
  hasSuspiciousActivity: boolean;
  findings: SkillFinding[];
  summary: string;
}

export interface SkillParseResult {
  name: string;
  description: string;
  instructions: string;
  metadata: Record<string, any>;
  warnings: string[];
}

// Standard ouvert agentskills.io : champs acceptés et conservés
const ALLOWED_AGENTSKILLS_FIELDS = new Set([
  'name',
  'description',
  'license',
  'compatibility',
  'metadata',
  'allowed-tools',
  'allowed_tools',
  'author',
  'version'
]);

export class SkillScanner {
  /**
   * Parse un frontmatter YAML simple sans dépendance externe
   */
  public static parseYamlFrontmatter(content: string): { frontmatter: Record<string, any>; body: string } {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
    if (!match) {
      throw new Error("Le fichier SKILL.md ne contient aucun bloc frontmatter YAML délimité par '---'.");
    }

    const rawYaml = match[1];
    const body = match[2];
    const frontmatter: Record<string, any> = {};

    const lines = rawYaml.split(/\r?\n/);
    let currentKey = '';
    let currentList: string[] | null = null;
    let currentDict: Record<string, any> | null = null;
    let currentValue = '';
    let inMultiline = false;

    const flushCurrent = () => {
      if (!currentKey) return;
      if (currentList !== null) {
        frontmatter[currentKey] = currentList;
      } else if (currentDict !== null) {
        frontmatter[currentKey] = currentDict;
      } else {
        frontmatter[currentKey] = currentValue.trim().replace(/^['"]|['"]$/g, '');
      }
      currentKey = '';
      currentList = null;
      currentDict = null;
      currentValue = '';
      inMultiline = false;
    };

    for (const line of lines) {
      if (!line.trim()) continue;

      // Détection de clé de premier niveau (ex: "name: foo")
      const keyMatch = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
      if (keyMatch) {
        flushCurrent();
        currentKey = keyMatch[1];
        const val = keyMatch[2].trim();
        if (val === '|' || val === '>') {
          inMultiline = true;
          currentValue = '';
        } else if (val === '') {
          currentValue = '';
        } else {
          currentValue = val;
        }
      } else if (currentKey && line.startsWith('  - ')) {
        // Élément de liste YAML
        if (currentList === null) currentList = [];
        currentList.push(line.substring(4).trim().replace(/^['"]|['"]$/g, ''));
      } else if (currentKey && line.startsWith('  ') && line.includes(':')) {
        // Sous-dictionnaire YAML (ex: metadata)
        if (currentDict === null) currentDict = {};
        const subMatch = line.trim().match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
        if (subMatch) {
          const subVal = subMatch[2].trim().replace(/^['"]|['"]$/g, '');
          currentDict[subMatch[1]] = isNaN(Number(subVal)) ? subVal : Number(subVal);
        }
      } else if (inMultiline && line.startsWith('  ')) {
        currentValue += (currentValue ? ' ' : '') + line.trim();
      } else if (currentKey && line.startsWith('  ')) {
        currentValue += ' ' + line.trim();
      }
    }
    flushCurrent();

    return { frontmatter, body };
  }

  /**
   * Valide les contraintes strictes sur le nom et la description de la compétence
   */
  public static validateFrontmatter(frontmatter: Record<string, any>): {
    valid: boolean;
    name: string;
    description: string;
    metadata: Record<string, any>;
    error?: string;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];
    const metadata: Record<string, any> = {};

    // 1. Validation du nom
    const rawName = frontmatter.name ? String(frontmatter.name).trim() : '';
    if (!rawName) {
      errors.push("Le champ 'name' est obligatoire dans le frontmatter de SKILL.md.");
    } else {
      if (rawName.length > 64) {
        errors.push(`Le nom de la compétence ne doit pas dépasser 64 caractères (actuel\u00A0: ${rawName.length}).`);
      }
      if (!/^[a-z0-9-]+$/.test(rawName)) {
        errors.push("Le nom de la compétence doit contenir exclusivement des minuscules, des chiffres et des tirets (sans espaces ni majuscules).");
      }
      if (/claude|anthropic/i.test(rawName)) {
        errors.push("Le nom de la compétence ne doit pas contenir 'claude' ni 'anthropic' (conformément aux règles permanentes).");
      }
    }

    // 2. Validation de la description
    const rawDesc = frontmatter.description ? String(frontmatter.description).trim() : '';
    if (!rawDesc) {
      errors.push("Le champ 'description' est obligatoire et ne doit pas être vide.");
    } else if (rawDesc.length > 1024) {
      errors.push(`La description de la compétence ne doit pas dépasser 1024 caractères (actuel\u00A0: ${rawDesc.length}).`);
    }

    // 3. Traitement des champs additionnels (agentskills.io vs outils tiers)
    for (const [key, value] of Object.entries(frontmatter)) {
      if (key === 'name' || key === 'description') continue;
      if (ALLOWED_AGENTSKILLS_FIELDS.has(key)) {
        metadata[key] = value;
      }
      // Les champs tiers sont ignorés silencieusement sans générer d'erreur
    }

    return {
      valid: errors.length === 0,
      name: rawName,
      description: rawDesc,
      metadata,
      error: errors[0],
      errors,
      warnings
    };
  }

  /**
   * Analyse et valide un fichier SKILL.md
   */
  public static parseSkillMd(filePath: string, dirPath: string): SkillParseResult {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Fichier introuvable\u00A0: ${filePath}`);
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const { frontmatter, body } = this.parseYamlFrontmatter(content);
    const validation = this.validateFrontmatter(frontmatter);

    if (!validation.valid) {
      throw new Error(`Validation de SKILL.md échouée\u00A0: ${validation.errors.join(' ')}`);
    }

    const warnings = [...validation.warnings];

    // Vérification de la taille du corps de SKILL.md (Niveau 2)
    // Avertir au-delà de 500 lignes ou 5000 tokens (~20 000 car.), sans bloquer
    const lines = body.split(/\r?\n/);
    if (lines.length > 500) {
      warnings.push(`Le corps de SKILL.md comporte ${lines.length} lignes (> 500 lignes recommandées). Il est conseillé de déplacer les détails dans references/.`);
    }
    if (body.length > 20000) {
      warnings.push(`Le corps de SKILL.md dépasse ~5000 tokens (${Math.round(body.length / 4)} tokens estimés).`);
    }

    return {
      name: validation.name,
      description: validation.description,
      instructions: body.trim(),
      metadata: validation.metadata,
      warnings
    };
  }

  /**
   * Scanne tous les fichiers d'un dossier de compétence avant activation
   */
  public static scanDirectory(dirPath: string): SkillSecurityScan {
    const findings: SkillFinding[] = [];
    const scripts: string[] = [];
    const urls: string[] = [];
    const networkCalls: string[] = [];
    const commandExecutions: string[] = [];
    const pathTraversals: string[] = [];
    let scriptsCount = 0;
    let totalFilesCount = 0;
    let networkCount = 0;
    let commandCount = 0;
    let traversalCount = 0;

    const SCRIPT_EXTENSIONS = new Set([
      '.py', '.sh', '.bash', '.js', '.ts', '.mjs', '.cjs',
      '.ps1', '.bat', '.cmd', '.rb', '.php', '.pl'
    ]);

    const isScript = (filename: string, relPath: string): boolean => {
      const ext = path.extname(filename).toLowerCase();
      if (SCRIPT_EXTENSIONS.has(ext)) return true;
      if (relPath.replace(/\\/g, '/').startsWith('scripts/')) return true;
      return false;
    };

    const traverse = (currentDir: string) => {
      if (!fs.existsSync(currentDir)) return;
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.name === '.git' || entry.name === 'node_modules') continue;
        const fullPath = path.join(currentDir, entry.name);
        const relPath = path.relative(dirPath, fullPath).replace(/\\/g, '/');

        if (entry.isDirectory()) {
          traverse(fullPath);
        } else if (entry.isFile()) {
          totalFilesCount++;
          if (isScript(entry.name, relPath)) {
            scriptsCount++;
            scripts.push(relPath);
          }

          // Scan de sécurité textuel
          try {
            const stat = fs.statSync(fullPath);
            if (stat.size > 2 * 1024 * 1024) continue; // Ignorer les gros fichiers > 2 Mo
            const content = fs.readFileSync(fullPath, 'utf-8');
            const lines = content.split(/\r?\n/);

            lines.forEach((line, idx) => {
              const lineNum = idx + 1;

              // Détection d'appels réseau
              if (/(?:fetch\(|axios\b|requests\.|urllib|http\.get|https\.get|net\.connect|curl\s|wget\s)/i.test(line)) {
                networkCount++;
                networkCalls.push(line.trim().slice(0, 120));
                findings.push({
                  file: relPath,
                  line: lineNum,
                  type: 'network',
                  snippet: line.trim().slice(0, 120)
                });
              }

              const urlMatches = line.match(/https?:\/\/[^\s"'`<>]+/ig);
              if (urlMatches) {
                networkCount += urlMatches.length;
                urls.push(...urlMatches);
                findings.push({
                  file: relPath,
                  line: lineNum,
                  type: 'url',
                  snippet: line.trim().slice(0, 120)
                });
              }

              // Détection d'exécution de commandes
              if (/(?:exec\(|execSync|spawn\(|spawnSync|child_process|system\(|popen|os\.system|subprocess\.)/i.test(line)) {
                commandCount++;
                commandExecutions.push(line.trim().slice(0, 120));
                findings.push({
                  file: relPath,
                  line: lineNum,
                  type: 'command',
                  snippet: line.trim().slice(0, 120)
                });
              }

              // Détection de traversée de chemin hors du dossier
              if (/\.\.[/\\]/.test(line)) {
                traversalCount++;
                pathTraversals.push(line.trim().slice(0, 120));
                findings.push({
                  file: relPath,
                  line: lineNum,
                  type: 'traversal',
                  snippet: line.trim().slice(0, 120)
                });
              }
            });
          } catch {}
        }
      }
    };

    traverse(dirPath);

    // Formulation du résumé factuel
    const parts: string[] = [];
    parts.push(`Ce dossier contient ${scriptsCount} script(s) sur ${totalFilesCount} fichier(s).`);

    if (networkCount > 0) {
      const firstNetwork = findings.find(f => f.type === 'network' || f.type === 'url');
      parts.push(`${networkCount} référence(s) réseau détectée(s) (ex.\u00A0: ${firstNetwork?.file} ligne ${firstNetwork?.line}).`);
    }

    if (commandCount > 0) {
      const firstCmd = findings.find(f => f.type === 'command');
      parts.push(`${commandCount} exécution(s) de commande détectée(s) (ex.\u00A0: ${firstCmd?.file} ligne ${firstCmd?.line}).`);
    }

    if (traversalCount > 0) {
      const firstTrav = findings.find(f => f.type === 'traversal');
      parts.push(`${traversalCount} motif(s) de traversée de chemin détecté(s) (ex.\u00A0: ${firstTrav?.file} ligne ${firstTrav?.line}).`);
    }

    if (networkCount === 0 && commandCount === 0 && traversalCount === 0) {
      parts.push("Aucun appel réseau ni exécution de commande détectée.");
    }

    const hasSuspiciousActivity = networkCount > 0 || commandCount > 0 || traversalCount > 0;

    return {
      scriptsCount,
      totalFilesCount,
      networkCount,
      commandCount,
      traversalCount,
      scripts,
      urls,
      networkCalls,
      commandExecutions,
      pathTraversals,
      hasSuspiciousActivity,
      findings,
      summary: parts.join(' ')
    };
  }
}
