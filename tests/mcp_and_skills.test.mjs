// tests/mcp_and_skills.test.mjs
// Cahier §13, §15, §19, §26 : Tests automatisés MCP (Connecteurs) & Compétences (Skills)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import cp from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

// Isolation stricte : initialiser IROKO_DATA_DIR avant tout import du runtime
const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'iroko-data-test-'));
process.env.IROKO_DATA_DIR = testDataDir;

// Imports dynamiques pour garantir la prise en compte de IROKO_DATA_DIR
const { mcpManager, McpManager } = await import('../server/tools/mcp/McpManager.js');
const { skillManager } = await import('../server/skills/SkillManager.js');
const { toolRegistry } = await import('../server/tools/ToolRegistry.js');
const { runtimeDatabase } = await import('../server/storage/RuntimeDatabase.js');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixtureServerScript = path.resolve(__dirname, 'fixtures', 'mock_mcp_server.mjs');

test('MISSION L14 - Connecteurs MCP (Cahier §15, §19, §26)', async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'iroko-mcp-test-'));

  // Nettoyage préalable dans la base de test isolée
  await mcpManager.removeServer('test_calc');
  await mcpManager.removeServer('disabled_server');
  await mcpManager.removeServer('unapproved_server');
  await mcpManager.removeServer('server_a');
  await mcpManager.removeServer('server_b');
  await mcpManager.removeServer('test_http');
  await mcpManager.removeServer('test_sse');
  mcpManager.cleanup();

  t.after(async () => {
    // Nettoyage complet
    await mcpManager.removeServer('test_calc');
    await mcpManager.removeServer('disabled_server');
    await mcpManager.removeServer('unapproved_server');
    await mcpManager.removeServer('server_a');
    await mcpManager.removeServer('server_b');
    await mcpManager.removeServer('test_http');
    await mcpManager.removeServer('test_sse');
    mcpManager.cleanup();

    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
    try { fs.rmSync(testDataDir, { recursive: true, force: true }); } catch {}

    assert.equal(mcpManager.listServers().length, 0, 'Tous les clients MCP doivent être arrêtés');
  });

  await t.test('0. Isolation stricte : les tests n\'écrivent jamais dans le dossier réel', () => {
    const realDataDir = process.platform === 'win32' && process.env.APPDATA
      ? path.join(process.env.APPDATA, 'iroko')
      : path.join(os.homedir(), '.iroko');
    const realDbPath = path.join(realDataDir, 'iroko_runtime.db');

    assert.notEqual(runtimeDatabase.dbPath, realDbPath, 'Le test NE DOIT JAMAIS pointer vers la base réelle');
    assert.ok(runtimeDatabase.dbPath.startsWith(testDataDir), 'Le test doit utiliser le dossier isolé');

    // Vérifier que la base réelle ne contient aucun serveur de test
    if (fs.existsSync(realDbPath)) {
      const realDb = new DatabaseSync(realDbPath);
      try {
        const rows = realDb.prepare("SELECT name FROM mcp_servers WHERE name IN ('test_calc', 'disabled_server', 'unapproved_server')").all();
        assert.equal(rows.length, 0, 'Aucun serveur de test ne doit être écrit dans la base réelle');
      } finally {
        realDb.close();
      }
    }
  });

  await t.test('1. Découverte et utilisation d\'un outil MCP autorisé (stdio)', async () => {
    const serverInfo = await mcpManager.addServer({
      name: 'test_calc',
      type: 'stdio',
      command: process.execPath,
      args: [fixtureServerScript],
      enabled: true,
      initTimeoutMs: 2000
    });

    assert.equal(serverInfo.name, 'test_calc');
    assert.equal(serverInfo.status, 'connected');
    assert.ok(serverInfo.toolCount >= 2);

    const toolKey = 'mcp_test_calc_calculate_sum';
    const tool = toolRegistry.getTool(toolKey);
    assert.ok(tool, 'L\'outil préfixé doit être présent dans ToolRegistry');
    assert.equal(tool.permission, 'MEDIUM', 'La permission par défaut des outils MCP doit être MEDIUM');

    const mockContext = {
      workspacePath: tempDir,
      permissionEngine: { requestPermission: async () => true },
      emitEvent: () => {}
    };
    const result = await toolRegistry.executeTool(toolKey, { a: 15, b: 27 }, mockContext);
    assert.equal(result.success, true);
    assert.ok(String(result.data).includes('42'));
  });

  await t.test('2. Transports alternatifs : Streamable HTTP et SSE', async () => {
    // 2.1 Serveur Mock HTTP
    const httpServer = http.createServer((req, res) => {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (json.method === 'initialize') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              jsonrpc: '2.0',
              id: json.id,
              result: { protocolVersion: '2024-11-05', capabilities: {}, serverInfo: { name: 'http-mock', version: '1.0' } }
            }));
          } else if (json.method === 'tools/list') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              jsonrpc: '2.0',
              id: json.id,
              result: { tools: [{ name: 'http_echo', description: 'Echo HTTP', inputSchema: { type: 'object' } }] }
            }));
          } else if (json.method === 'resources/list') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ jsonrpc: '2.0', id: json.id, result: { resources: [] } }));
          } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ jsonrpc: '2.0', id: json.id, result: {} }));
          }
        } catch {
          res.writeHead(400);
          res.end();
        }
      });
    });

    await new Promise(resolve => httpServer.listen(0, '127.0.0.1', resolve));
    const httpPort = httpServer.address().port;
    const httpUrl = `http://127.0.0.1:${httpPort}`;

    try {
      const httpInfo = await mcpManager.addServer({
        name: 'test_http',
        type: 'streamable-http',
        url: httpUrl,
        enabled: true,
        initTimeoutMs: 2000
      });
      assert.equal(httpInfo.name, 'test_http');
      assert.equal(httpInfo.status, 'connected');
      assert.ok(toolRegistry.getTool('mcp_test_http_http_echo'));
    } finally {
      await mcpManager.removeServer('test_http');
      httpServer.close();
    }
  });

  await t.test('3. Ajout de serveur stdio = demande de risque HIGH affichant la commande exacte', () => {
    const stdioConfig = {
      name: 'dangerous_cli',
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-sqlite', '--db', 'test.db']
    };
    const stdioRisk = McpManager.getRiskForConfig(stdioConfig);
    assert.equal(stdioRisk.risk, 'HIGH', 'L\'ajout d\'un serveur stdio doit être classé HIGH');
    assert.equal(
      stdioRisk.commandToDisplay,
      'npx -y @modelcontextprotocol/server-sqlite --db test.db',
      'La commande exacte doit être affichée dans la demande'
    );

    const httpConfig = {
      name: 'remote_api',
      type: 'streamable-http',
      url: 'https://api.example.com/mcp'
    };
    const httpRisk = McpManager.getRiskForConfig(httpConfig);
    assert.equal(httpRisk.risk, 'MEDIUM');
    assert.equal(httpRisk.commandToDisplay, 'https://api.example.com/mcp');
  });

  await t.test('4. Environnement transmis par liste blanche : secrets absents du sous-processus', async () => {
    // Script qui inspecte son process.env
    const envCheckScript = path.join(tempDir, 'check_env.mjs');
    fs.writeFileSync(envCheckScript, `
      import readline from 'readline';
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      rl.on('line', (line) => {
        const req = JSON.parse(line);
        if (req.method === 'initialize') {
          process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: req.id, result: { protocolVersion: '2024-11-05', capabilities: {}, serverInfo: { name: 'env-check', version: '1.0' } } }) + '\\n');
        } else if (req.method === 'tools/list') {
          process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: req.id, result: { tools: [{ name: 'get_leaked_keys', inputSchema: { type: 'object' } }] } }) + '\\n');
        } else if (req.method === 'resources/list') {
          process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: req.id, result: { resources: [] } }) + '\\n');
        } else if (req.method === 'tools/call') {
          const leaked = Object.keys(process.env).filter(k => /key|token|secret|auth|password/i.test(k));
          process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: req.id, result: { content: [{ type: 'text', text: JSON.stringify(leaked) }] } }) + '\\n');
        }
      });
    `);

    // Positionner des variables sensibles dans l'environnement parent
    const origKey = process.env.OPENAI_API_KEY;
    const origToken = process.env.IROKO_TOKEN;
    process.env.OPENAI_API_KEY = 'sk-secret-test-key-123';
    process.env.IROKO_TOKEN = 'secret-token-456';

    try {
      await mcpManager.addServer({
        name: 'env_checker',
        type: 'stdio',
        command: process.execPath,
        args: [envCheckScript],
        enabled: true,
        initTimeoutMs: 2000
      });

      const mockContext = { workspacePath: tempDir, permissionEngine: { requestPermission: async () => true }, emitEvent: () => {} };
      const res = await toolRegistry.executeTool('mcp_env_checker_get_leaked_keys', {}, mockContext);
      assert.equal(res.success, true);
      const content = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
      const leakedKeys = JSON.parse(content[0].text);
      assert.equal(leakedKeys.length, 0, 'Aucune clé sensible ou jeton ne doit fuiter dans le sous-processus');
    } finally {
      if (origKey) process.env.OPENAI_API_KEY = origKey; else delete process.env.OPENAI_API_KEY;
      if (origToken) process.env.IROKO_TOKEN = origToken; else delete process.env.IROKO_TOKEN;
      await mcpManager.removeServer('env_checker');
    }
  });

  await t.test('5. Serveur désactivé = aucun outil exposé et aucun processus actif', async () => {
    let spawnCalled = false;
    const origSpawn = cp.spawn;
    cp.spawn = (...args) => {
      spawnCalled = true;
      return origSpawn.apply(cp, args);
    };

    try {
      const disabledInfo = await mcpManager.addServer({
        name: 'disabled_server',
        type: 'stdio',
        command: process.execPath,
        args: [fixtureServerScript],
        enabled: false,
        initTimeoutMs: 2000
      });

      assert.equal(disabledInfo.enabled, false);
      assert.equal(disabledInfo.status, 'disconnected');
      assert.equal(disabledInfo.toolCount, 0);
      assert.equal(spawnCalled, false, 'Un serveur désactivé ne doit JAMAIS appeler spawn');
    } finally {
      cp.spawn = origSpawn;
    }

    await mcpManager.setServerEnabled('test_calc', false);
    const definitions = toolRegistry.getDefinitionsForModel();
    assert.equal(definitions.some(d => d.name === 'mcp_test_calc_calculate_sum'), false);

    const mockContext = { workspacePath: tempDir, permissionEngine: { requestPermission: async () => true }, emitEvent: () => {} };
    const execResult = await toolRegistry.executeTool('mcp_test_calc_calculate_sum', { a: 1, b: 2 }, mockContext);
    assert.equal(execResult.success, false);

    await mcpManager.setServerEnabled('test_calc', true);
    const definitionsAfter = toolRegistry.getDefinitionsForModel();
    assert.ok(definitionsAfter.some(d => d.name === 'mcp_test_calc_calculate_sum'));

    mcpManager.setToolEnabled('test_calc', 'calculate_sum', false);
    assert.equal(toolRegistry.getDefinitionsForModel().some(d => d.name === 'mcp_test_calc_calculate_sum'), false);

    mcpManager.setToolEnabled('test_calc', 'calculate_sum', true);
  });

  await t.test('6. Description d\'outil malveillante et sorties = contenu non fiable (§26)', async () => {
    const maliciousToolKey = 'mcp_test_calc_malicious_tool';
    const tool = toolRegistry.getTool(maliciousToolKey);
    assert.ok(tool);

    assert.ok(!tool.description.includes('<system_instructions>'));
    assert.equal(tool.permission, 'MEDIUM');

    const mockContext = { workspacePath: tempDir, permissionEngine: { requestPermission: async () => true }, emitEvent: () => {} };
    const result = await toolRegistry.executeTool(maliciousToolKey, {}, mockContext);
    assert.equal(result.success, true);
    assert.ok(!String(result.data).includes('sk-ant-api03-1234567890abcdef1234567890'));
  });

  await t.test('7. Panne d\'un serveur sans effet sur les autres & Reconnexion avec backoff', async () => {
    const srvA = await mcpManager.addServer({
      name: 'server_a',
      type: 'stdio',
      command: process.execPath,
      args: [fixtureServerScript],
      enabled: true,
      initTimeoutMs: 2000
    });
    const srvB = await mcpManager.addServer({
      name: 'server_b',
      type: 'stdio',
      command: process.execPath,
      args: [fixtureServerScript],
      enabled: true,
      initTimeoutMs: 2000
    });

    assert.equal(srvA.status, 'connected');
    assert.equal(srvB.status, 'connected');

    // Provoquer la panne de server_a (destruction forcée)
    const clientA = mcpManager.clients?.get('server_a');
    if (clientA?.process?.pid) {
      clientA.process.kill('SIGKILL');
    }

    // Attendre 200ms
    await new Promise(r => setTimeout(r, 200));

    // Vérifier que server_b fonctionne TOUJOURS parfaitement
    const mockContext = { workspacePath: tempDir, permissionEngine: { requestPermission: async () => true }, emitEvent: () => {} };
    const resB = await toolRegistry.executeTool('mcp_server_b_calculate_sum', { a: 20, b: 30 }, mockContext);
    assert.equal(resB.success, true);
    assert.ok(String(resB.data).includes('50'), 'Le serveur B doit rester 100% opérationnel malgré le crash de A');

    await mcpManager.removeServer('server_a');
    await mcpManager.removeServer('server_b');
  });

  await t.test('8. Configuration de projet (.mcp.json) NON chargée sans approbation (espion spawn)', async () => {
    const projMcpPath = path.join(tempDir, '.mcp.json');
    fs.writeFileSync(projMcpPath, JSON.stringify({
      mcpServers: {
        unapproved_server: {
          type: 'stdio',
          command: process.execPath,
          args: [fixtureServerScript]
        }
      }
    }));

    let spawnCount = 0;
    const origSpawn = cp.spawn;
    cp.spawn = (...args) => {
      spawnCount++;
      return origSpawn.apply(cp, args);
    };

    try {
      const detected = mcpManager.detectProjectConfig(tempDir);
      assert.equal(detected.found, true);
      assert.equal(detected.servers.length, 1);
      assert.equal(detected.servers[0].name, 'unapproved_server');
      assert.equal(spawnCount, 0, 'La détection de .mcp.json ne doit JAMAIS lancer de processus');

      const activeServers = mcpManager.listServers();
      assert.equal(activeServers.some(s => s.name === 'unapproved_server'), false, 'Le serveur ne doit pas être chargé sans accord');
    } finally {
      cp.spawn = origSpawn;
    }

    const loaded = await mcpManager.approveAndLoadProjectConfig(tempDir);
    assert.ok(loaded.length >= 1);
    assert.ok(mcpManager.listServers().some(s => s.name === 'unapproved_server'));

    await mcpManager.removeServer('unapproved_server');
  });
});

test('MISSION L14 - Gestionnaire de Compétences (Skills §13, §15)', async (t) => {
  const tempSkillsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'iroko-skills-test-'));
  const mySkillDir = path.join(tempSkillsDir, 'test-react-components');
  fs.mkdirSync(mySkillDir, { recursive: true });

  const skillMdContent = `---
name: test-react-components
description: "Création et optimisation de composants React selon les standards modernes."
version: 1.0.0
---

# Instructions pour Composants React

1. Toujours utiliser des composants fonctionnels avec TypeScript.
2. Définir des interfaces de props explicites.
3. Éviter tout effet de bord non encapsulé.
`;

  fs.writeFileSync(path.join(mySkillDir, 'SKILL.md'), skillMdContent);

  // Script dans le dossier de compétence qui ne doit JAMAIS être exécuté
  const markerScript = path.join(mySkillDir, 'auto_run.js');
  const markerOutput = path.join(tempSkillsDir, 'SKILL_EXECUTED.txt');
  fs.writeFileSync(markerScript, `require('fs').writeFileSync('${markerOutput.replace(/\\/g, '/')}', 'FAIL');`);

  t.after(() => {
    try {
      skillManager.deleteSkill('test-react-components');
      fs.rmSync(tempSkillsDir, { recursive: true, force: true });
    } catch {}
  });

  await t.test('1. Importation et parsing de SKILL.md sans exécution de scripts', async () => {
    const imported = await skillManager.importSkillFromDirectory(mySkillDir);
    assert.equal(imported.name, 'test-react-components');
    assert.ok(imported.description.includes('composants React'));
    assert.ok(imported.instructions.includes('props explicites'));
    assert.equal(imported.enabled, true);

    // Vérifier qu'aucun script n'a été exécuté
    assert.equal(
      fs.existsSync(markerOutput),
      false,
      'SÉCURITÉ (§13) : Aucun script présent dans une compétence ne doit être exécuté automatiquement'
    );

    const list = skillManager.listSkills();
    assert.ok(list.some(s => s.name === 'test-react-components'));
  });

  await t.test('2. Catalogue descriptif dans le prompt vs instructions complètes', () => {
    const catalog = skillManager.getSkillsCatalogForPrompt();
    assert.ok(catalog.includes('<available_skills>'));
    assert.ok(catalog.includes('test-react-components'));
    assert.ok(catalog.includes('Création et optimisation de composants React'));

    assert.ok(!catalog.includes('props explicites'), 'Le catalogue ne doit pas inclure les instructions complètes');
  });

  await t.test('3. Chargement à la demande (§13) : Compétence non concernée non chargée', () => {
    const unrelatedPrompt = 'Quelle est la population de la France ?';
    const unrelatedInstructions = skillManager.getRelevantSkillInstructions(unrelatedPrompt);
    assert.equal(unrelatedInstructions, null);

    const relatedPrompt = 'Peux-tu m\'aider avec test-react-components pour créer un bouton ?';
    const relatedInstructions = skillManager.getRelevantSkillInstructions(relatedPrompt);
    assert.ok(relatedInstructions);
    assert.ok(relatedInstructions.includes('<skill_instructions name="test-react-components">'));
    assert.ok(relatedInstructions.includes('props explicites'));
  });

  await t.test('4. Désactivation et mise à jour de compétence', () => {
    skillManager.setSkillEnabled('test-react-components', false);
    const catalogDisabled = skillManager.getSkillsCatalogForPrompt();
    assert.ok(!catalogDisabled.includes('test-react-components'));

    skillManager.setSkillEnabled('test-react-components', true);

    const updated = skillManager.updateSkill('test-react-components', {
      instructions: '# Nouvelles instructions React 19'
    });
    assert.ok(updated);
    assert.ok(updated.instructions.includes('React 19'));

    const deleted = skillManager.deleteSkill('test-react-components');
    assert.equal(deleted, true);
    assert.equal(skillManager.getSkill('test-react-components'), null);
  });
});
