import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import path from 'path';
import os from 'os';
import fs from 'fs';

// Isolation stricte des données runtime
const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'iroko-plugins-data-'));
process.env.IROKO_DATA_DIR = testDataDir;

const { pluginManager } = await import('../server/plugins/PluginManager.ts');
const { skillManager } = await import('../server/skills/SkillManager.ts');
const { mcpManager } = await import('../server/tools/mcp/McpManager.ts');
const { runtimeDatabase } = await import('../server/storage/RuntimeDatabase.ts');

describe('MISSION L15d : Gestionnaire de Plugins (§11, §13, §15)', () => {
  after(() => {
    try {
      runtimeDatabase.close();
      fs.rmSync(testDataDir, { recursive: true, force: true });
    } catch {}
  });

  const validPackage = {
    schemaVersion: '1.0',
    metadata: {
      id: 'plugin-dev-tools',
      name: 'Outils Développeur',
      version: '1.0.0',
      description: 'Pack complet intégrant compétences de refactoring, connecteur HTTP et règles de typage.',
      author: 'Iroko Team'
    },
    skills: [
      {
        name: 'code_refactor',
        description: 'Compétence d\'optimisation et de refactoring propre.',
        instructions: 'Toujours préserver les contrats d\'interfaces et la compatibilité descendante.'
      }
    ],
    connectors: [
      {
        name: 'dev_mock_http',
        type: 'streamable-http',
        url: 'http://127.0.0.1:9090/mcp'
      }
    ],
    rules: [
      'Règle 1 : Aucun `any` implicite dans le code TypeScript.',
      'Règle 2 : Toutes les fonctions exportées doivent être documentées.'
    ]
  };

  test('1. Validation stricte du schéma et des métadonnées (validatePlugin)', () => {
    // 1.1 Paquet valide
    const validReport = pluginManager.validatePlugin(validPackage);
    assert.strictEqual(validReport.valid, true);
    assert.strictEqual(validReport.canActivate, true);
    assert.strictEqual(validReport.securitySummary.hasSkills, true);
    assert.strictEqual(validReport.securitySummary.hasMcpServers, true);
    assert.strictEqual(validReport.securitySummary.hasRules, true);
    assert.strictEqual(validReport.securitySummary.mcpRiskLevel, 'MEDIUM');

    // 1.2 Version de schéma non supportée
    const badSchema = pluginManager.validatePlugin({
      ...validPackage,
      schemaVersion: '2.0'
    });
    assert.strictEqual(badSchema.valid, false);
    assert.ok(badSchema.issues.some(i => i.field === 'schemaVersion'));

    // 1.3 Métadonnées manquantes ou invalides
    const badMeta = pluginManager.validatePlugin({
      schemaVersion: '1.0',
      metadata: { id: 'invalid id with spaces!' }
    });
    assert.strictEqual(badMeta.valid, false);
    assert.ok(badMeta.issues.some(i => i.field.startsWith('metadata')));

    // 1.4 Avertissement sur connecteur stdio à haut risque
    const stdioPackage = {
      schemaVersion: '1.0',
      metadata: {
        id: 'stdio-plugin',
        name: 'Stdio Plugin',
        version: '1.0.0',
        description: 'Exécute des commandes locales'
      },
      connectors: [
        {
          name: 'cmd_runner',
          type: 'stdio',
          command: 'npx my-mcp-server'
        }
      ]
    };
    const stdioReport = pluginManager.validatePlugin(stdioPackage);
    assert.strictEqual(stdioReport.valid, true);
    assert.strictEqual(stdioReport.securitySummary.mcpRiskLevel, 'HIGH');
    assert.ok(stdioReport.issues.some(i => i.severity === 'warning'));
  });

  test('2. Installation d\'un plugin et état inactif initial sécurisé (installPlugin)', () => {
    const res = pluginManager.installPlugin(validPackage);
    assert.strictEqual(res.success, true);
    assert.ok(res.plugin);
    assert.strictEqual(res.plugin.id, 'plugin-dev-tools');
    assert.strictEqual(res.plugin.name, 'Outils Développeur');
    assert.strictEqual(res.plugin.enabled, false, 'Un plugin doit toujours être inactif à l\'installation');
    assert.strictEqual(res.plugin.validated, true);

    const list = pluginManager.listPlugins();
    assert.ok(list.some(p => p.id === 'plugin-dev-tools'));
  });

  test('3. Exportation d\'un plugin (exportPlugin)', () => {
    const exported = pluginManager.exportPlugin('plugin-dev-tools');
    assert.ok(exported);
    assert.strictEqual(exported.metadata.id, 'plugin-dev-tools');
    assert.strictEqual(exported.metadata.name, 'Outils Développeur');
    assert.strictEqual(exported.skills?.length, 1);
    assert.strictEqual(exported.connectors?.length, 1);
    assert.strictEqual(exported.rules?.length, 2);
  });

  test('4. Activation et désactivation couplée (activatePlugin / deactivatePlugin)', async () => {
    // 4.1 Activation
    const actRes = await pluginManager.activatePlugin('plugin-dev-tools');
    assert.strictEqual(actRes.success, true);

    const pluginActive = runtimeDatabase.getPlugin('plugin-dev-tools');
    assert.strictEqual(pluginActive?.enabled, true);

    // Vérifier que la compétence a été importée et activée
    const skill = skillManager.getSkill('code_refactor');
    assert.ok(skill, 'La compétence code_refactor doit être enregistrée');
    assert.strictEqual(skill.enabled, true);

    // Vérifier que le connecteur MCP a été enregistré
    const mcpServer = mcpManager.getServerInfo('dev_mock_http');
    assert.ok(mcpServer, 'Le connecteur dev_mock_http doit être enregistré');
    assert.strictEqual(mcpServer.enabled, true);

    // 4.2 Désactivation
    const deactRes = await pluginManager.deactivatePlugin('plugin-dev-tools');
    assert.strictEqual(deactRes.success, true);

    const pluginInactive = runtimeDatabase.getPlugin('plugin-dev-tools');
    assert.strictEqual(pluginInactive?.enabled, false);

    // La compétence et le connecteur doivent être désactivés
    const skillDisabled = skillManager.getSkill('code_refactor');
    assert.strictEqual(skillDisabled?.enabled, false);

    const mcpDisabled = mcpManager.getServerInfo('dev_mock_http');
    assert.strictEqual(mcpDisabled?.enabled, false);
  });

  test('5. Suppression d\'un plugin (deletePlugin)', async () => {
    const delRes = await pluginManager.deletePlugin('plugin-dev-tools');
    assert.strictEqual(delRes, true);

    const check = runtimeDatabase.getPlugin('plugin-dev-tools');
    assert.strictEqual(check, null);
  });
});
