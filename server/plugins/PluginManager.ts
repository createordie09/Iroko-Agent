// server/plugins/PluginManager.ts
// Cahier §11, §13, §15 : Gestionnaire de plugins (compétences, connecteurs, règles)

import { runtimeDatabase } from '../storage/RuntimeDatabase';
import { skillManager } from '../skills/SkillManager';
import { mcpManager } from '../tools/mcp/McpManager';
import {
  IrokoPluginPackage,
  PluginValidationReport,
  PluginValidationIssue,
  InstalledPlugin
} from './types';

export class PluginManager {
  /**
   * Valide un paquet de plugin avant toute installation ou activation.
   */
  public validatePlugin(pkg: IrokoPluginPackage): PluginValidationReport {
    const issues: PluginValidationIssue[] = [];

    // 1. Vérification de la structure globale
    if (!pkg || typeof pkg !== 'object') {
      return {
        valid: false,
        canActivate: false,
        issues: [{ severity: 'error', field: 'root', message: 'Le paquet de plugin est vide ou invalide.' }],
        securitySummary: { hasMcpServers: false, hasSkills: false, hasRules: false, mcpRiskLevel: 'SAFE' }
      };
    }

    if (pkg.schemaVersion !== '1.0') {
      issues.push({ severity: 'error', field: 'schemaVersion', message: 'Version de schéma non supportée (1.0 requis).' });
    }

    // 2. Vérification des métadonnées
    if (!pkg.metadata || typeof pkg.metadata !== 'object') {
      issues.push({ severity: 'error', field: 'metadata', message: 'Métadonnées obligatoires manquantes.' });
    } else {
      if (!pkg.metadata.id || typeof pkg.metadata.id !== 'string' || !/^[a-z0-9-_.]+$/i.test(pkg.metadata.id)) {
        issues.push({ severity: 'error', field: 'metadata.id', message: 'Identifiant de plugin manquant ou invalide (lettres, chiffres, tirets uniquement).' });
      }
      if (!pkg.metadata.name || typeof pkg.metadata.name !== 'string') {
        issues.push({ severity: 'error', field: 'metadata.name', message: 'Nom de plugin obligatoire.' });
      }
      if (!pkg.metadata.version || typeof pkg.metadata.version !== 'string') {
        issues.push({ severity: 'error', field: 'metadata.version', message: 'Version de plugin obligatoire.' });
      }
      if (!pkg.metadata.description || typeof pkg.metadata.description !== 'string') {
        issues.push({ severity: 'error', field: 'metadata.description', message: 'Description de plugin obligatoire.' });
      }
    }

    // 3. Analyse des compétences (Skills)
    let hasSkills = false;
    if (pkg.skills) {
      if (!Array.isArray(pkg.skills)) {
        issues.push({ severity: 'error', field: 'skills', message: 'Le champ "skills" doit être un tableau.' });
      } else {
        hasSkills = pkg.skills.length > 0;
        for (let i = 0; i < pkg.skills.length; i++) {
          const s = pkg.skills[i];
          if (!s.name || typeof s.name !== 'string') {
            issues.push({ severity: 'error', field: `skills[${i}].name`, message: 'Nom de compétence manquant.' });
          }
          if (!s.description || typeof s.description !== 'string') {
            issues.push({ severity: 'error', field: `skills[${i}].description`, message: 'Description de compétence manquante.' });
          }
          if (!s.instructions || typeof s.instructions !== 'string') {
            issues.push({ severity: 'error', field: `skills[${i}].instructions`, message: 'Instructions de compétence manquantes.' });
          }
        }
      }
    }

    // 4. Analyse des connecteurs (MCP)
    let hasMcpServers = false;
    let maxMcpRisk: 'SAFE' | 'MEDIUM' | 'HIGH' = 'SAFE';
    if (pkg.connectors) {
      if (!Array.isArray(pkg.connectors)) {
        issues.push({ severity: 'error', field: 'connectors', message: 'Le champ "connectors" doit être un tableau.' });
      } else {
        hasMcpServers = pkg.connectors.length > 0;
        for (let i = 0; i < pkg.connectors.length; i++) {
          const c = pkg.connectors[i];
          if (!c.name || typeof c.name !== 'string') {
            issues.push({ severity: 'error', field: `connectors[${i}].name`, message: 'Nom de connecteur manquant.' });
          }
          if (!['stdio', 'streamable-http', 'sse'].includes(c.type)) {
            issues.push({ severity: 'error', field: `connectors[${i}].type`, message: `Type de transport inconnu : "${c.type}".` });
          }
          if (c.type === 'stdio') {
            maxMcpRisk = 'HIGH';
            issues.push({
              severity: 'warning',
              field: `connectors[${i}]`,
              message: `Le connecteur "${c.name}" exécute une commande locale ("${c.command}"). Une confirmation sera requise à l'activation.`
            });
          } else if (c.type === 'streamable-http' || c.type === 'sse') {
            if (maxMcpRisk !== 'HIGH') maxMcpRisk = 'MEDIUM';
          }
        }
      }
    }

    // 5. Analyse des règles (Rules)
    let hasRules = false;
    if (pkg.rules) {
      if (!Array.isArray(pkg.rules)) {
        issues.push({ severity: 'error', field: 'rules', message: 'Le champ "rules" doit être un tableau.' });
      } else {
        hasRules = pkg.rules.length > 0;
        for (let i = 0; i < pkg.rules.length; i++) {
          if (typeof pkg.rules[i] !== 'string' || pkg.rules[i].trim().length === 0) {
            issues.push({ severity: 'error', field: `rules[${i}]`, message: 'Règle vide ou non textuelle.' });
          }
        }
      }
    }

    const hasErrors = issues.some(i => i.severity === 'error');

    return {
      valid: !hasErrors,
      canActivate: !hasErrors,
      issues,
      securitySummary: {
        hasMcpServers,
        hasSkills,
        hasRules,
        mcpRiskLevel: maxMcpRisk
      }
    };
  }

  /**
   * Installe un paquet de plugin dans la base runtime locale.
   */
  public installPlugin(pkg: IrokoPluginPackage): {
    success: boolean;
    plugin?: InstalledPlugin;
    report: PluginValidationReport;
    error?: string;
  } {
    const report = this.validatePlugin(pkg);
    if (!report.valid) {
      return {
        success: false,
        report,
        error: `Validation échouée : ${report.issues.map(i => i.message).join(' ; ')}`
      };
    }

    const installed: InstalledPlugin = {
      id: pkg.metadata.id,
      name: pkg.metadata.name,
      version: pkg.metadata.version,
      description: pkg.metadata.description,
      author: pkg.metadata.author,
      enabled: false, // Toujours inactif à l'installation par sécurité
      validated: true,
      installedAt: Date.now(),
      packageData: pkg
    };

    runtimeDatabase.savePlugin(installed);

    return {
      success: true,
      plugin: installed,
      report
    };
  }

  /**
   * Exporte un plugin installé au format de paquet portable JSON.
   */
  public exportPlugin(pluginId: string): IrokoPluginPackage | null {
    const plugin = runtimeDatabase.getPlugin(pluginId);
    return plugin ? plugin.packageData : null;
  }

  /**
   * Active un plugin et enregistre ses compétences et connecteurs associés.
   */
  public async activatePlugin(pluginId: string): Promise<{ success: boolean; error?: string }> {
    const plugin = runtimeDatabase.getPlugin(pluginId);
    if (!plugin) {
      return { success: false, error: `Plugin "${pluginId}" introuvable.` };
    }

    if (!plugin.validated) {
      return { success: false, error: `Le plugin "${pluginId}" n'a pas été validé et ne peut être activé.` };
    }

    try {
      const pkg = plugin.packageData;

      // 1. Activer les compétences incluses
      if (pkg.skills) {
        for (const skill of pkg.skills) {
          const existing = runtimeDatabase.getSkill(skill.name);
          if (!existing) {
            runtimeDatabase.saveSkill({
              name: skill.name,
              description: skill.description,
              dirPath: 'plugins/' + pluginId,
              instructions: skill.instructions,
              enabled: true
            });
          } else {
            runtimeDatabase.setSkillEnabled(skill.name, true);
          }
        }
      }

      // 2. Enregistrer les connecteurs MCP inclus
      if (pkg.connectors) {
        for (const conn of pkg.connectors) {
          const existing = mcpManager.getServerInfo(conn.name);
          if (!existing) {
            await mcpManager.addServer(conn);
          } else {
            await mcpManager.setServerEnabled(conn.name, true);
          }
        }
      }

      // 3. Marquer le plugin comme activé
      runtimeDatabase.setPluginEnabled(pluginId, true);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: `Erreur lors de l'activation : ${err.message || String(err)}` };
    }
  }

  /**
   * Désactive un plugin et retire ses compétences et connecteurs associés.
   */
  public async deactivatePlugin(pluginId: string): Promise<{ success: boolean; error?: string }> {
    const plugin = runtimeDatabase.getPlugin(pluginId);
    if (!plugin) {
      return { success: false, error: `Plugin "${pluginId}" introuvable.` };
    }

    try {
      const pkg = plugin.packageData;

      // 1. Désactiver les compétences incluses
      if (pkg.skills) {
        for (const skill of pkg.skills) {
          await skillManager.setSkillEnabled(skill.name, false);
        }
      }

      // 2. Désactiver les connecteurs MCP inclus
      if (pkg.connectors) {
        for (const conn of pkg.connectors) {
          await mcpManager.setServerEnabled(conn.name, false);
        }
      }

      // 3. Marquer le plugin comme désactivé
      runtimeDatabase.setPluginEnabled(pluginId, false);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: `Erreur lors de la désactivation : ${err.message || String(err)}` };
    }
  }

  /**
   * Supprime un plugin de la base runtime.
   */
  public async deletePlugin(pluginId: string): Promise<boolean> {
    await this.deactivatePlugin(pluginId);
    return runtimeDatabase.deletePlugin(pluginId);
  }

  /**
   * Liste tous les plugins installés.
   */
  public listPlugins(): InstalledPlugin[] {
    return runtimeDatabase.listPlugins();
  }
}

export const pluginManager = new PluginManager();
