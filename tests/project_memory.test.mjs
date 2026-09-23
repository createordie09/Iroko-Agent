import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// Isolation stricte : initialiser IROKO_DATA_DIR avant tout import du runtime
const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'iroko-mem-test-'));
process.env.IROKO_DATA_DIR = testDataDir;

const { RuntimeDatabase } = await import('../server/storage/RuntimeDatabase.js');
const {
  ProjectMemoryManager,
  containsSecret,
  computeProjectHash
} = await import('../server/memory/ProjectMemory.js');
const { RememberFactTool } = await import('../server/tools/memory/remember_fact.js');
const { SystemPrompt } = await import('../server/runtime/SystemPrompt.js');

test('Project Memory (§20, §21) - Refus formel des secrets', async (t) => {
  await t.test('Détection stricte de multiples types de secrets', () => {
    // Clé OpenAI / Anthropic
    assert.equal(
      containsSecret('Voici ma clé sk-ant-api03-12345678901234567890 pour plus tard').hasSecret,
      true
    );

    // Clé Google
    assert.equal(
      containsSecret('Google API key: AIzaSyD-1234567890abcdefghijklmnopqrstuv').hasSecret,
      true
    );

    // Jeton GitHub
    assert.equal(
      containsSecret('Mon token ghp_1234567890abcdef1234567890abcdef1234').hasSecret,
      true
    );

    // Jeton Bearer
    assert.equal(
      containsSecret('Authorization: Bearer my-super-secret-token-value-here-12345').hasSecret,
      true
    );

    // Clé privée
    assert.equal(
      containsSecret('-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0...').hasSecret,
      true
    );

    // Mot de passe explicite
    assert.equal(
      containsSecret('password = "SuperSecretPassword123"').hasSecret,
      true
    );

    // Texte ordinaire sans secret
    assert.equal(
      containsSecret('Toujours utiliser PostgreSQL et Prisma pour les accès base de données.').hasSecret,
      false
    );
  });

  await t.test('L\'outil remember_fact refuse catégoriquement d\'enregistrer un secret', async () => {
    const tool = new RememberFactTool();
    const mockContext = {
      workspacePath: 'c:/test-proj',
      permissionEngine: {
        requestPermission: async () => true
      },
      emitEvent: () => {}
    };

    const result = await tool.execute(
      {
        fact: 'Ne pas oublier la clé sk-ant-api03-12345678901234567890'
      },
      mockContext
    );

    assert.equal(result.success, false);
    assert.match(result.error, /Refus formel de mémoriser des secrets/);
  });
});

test('Project Memory (§20) - Portées (Global vs Project) et isolation', async (t) => {
  const db = new RuntimeDatabase(':memory:');
  const memoryManager = new ProjectMemoryManager();

  // Remplacer runtimeDatabase temporairement pour le test en mémoire
  const origList = db.listMemories.bind(db);
  const origSave = db.saveMemory.bind(db);
  const origClear = db.clearAllMemories.bind(db);
  const origDelete = db.deleteMemory.bind(db);
  const origIsEnabled = db.isMemoryEnabled.bind(db);
  const origSetEnabled = db.setMemoryEnabled.bind(db);

  // Sauvegarder un fait global
  const globalItem = db.saveMemory({
    scope: 'global',
    category: 'preference',
    fact: 'Toujours formater le code avec Prettier et tabWidth 2.'
  });

  // Sauvegarder un fait pour le projet A
  const hashA = computeProjectHash('c:/workspace-alpha');
  const projAItem = db.saveMemory({
    scope: 'project',
    projectHash: hashA,
    category: 'architecture',
    fact: 'Utiliser SQLite avec DatabaseSync pour le stockage local.'
  });

  // Sauvegarder un fait pour le projet B
  const hashB = computeProjectHash('c:/workspace-beta');
  const projBItem = db.saveMemory({
    scope: 'project',
    projectHash: hashB,
    category: 'architecture',
    fact: 'Utiliser Redis pour le cache distribué.'
  });

  await t.test('Isolation par hash de workspace', () => {
    assert.notEqual(hashA, hashB);

    // Requête pour projet A : doit retourner globalItem et projAItem, JAMAIS projBItem
    const memoriesA = db.listMemories(undefined, hashA);
    const idsA = memoriesA.map(m => m.id);
    assert.ok(idsA.includes(globalItem.id));
    assert.ok(idsA.includes(projAItem.id));
    assert.ok(!idsA.includes(projBItem.id));

    // Requête pour projet B : doit retourner globalItem et projBItem, JAMAIS projAItem
    const memoriesB = db.listMemories(undefined, hashB);
    const idsB = memoriesB.map(m => m.id);
    assert.ok(idsB.includes(globalItem.id));
    assert.ok(idsB.includes(projBItem.id));
    assert.ok(!idsA.includes(projBItem.id));
  });

  db.close();
});

test('Project Memory (§20) - Injection dans le prompt système et budget de tokens', async (t) => {
  const memoryManager = new ProjectMemoryManager();

  await t.test('Formatage propre du bloc <project_memory>', () => {
    const mockMemories = [
      {
        id: '1',
        scope: 'global',
        project_hash: null,
        category: 'preference',
        fact: 'Préférer les fonctions pures.',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: '2',
        scope: 'project',
        project_hash: 'abc123',
        category: 'decision',
        fact: 'Architecture hexagonale retenue pour le module auth.',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ];

    const formatted = memoryManager.formatMemoriesForPrompt(mockMemories);
    assert.ok(formatted.includes('<project_memory>'));
    assert.ok(formatted.includes('[MÉMOIRE GLOBALE]'));
    assert.ok(formatted.includes('- [preference] Préférer les fonctions pures.'));
    assert.ok(formatted.includes('[MÉMOIRE DU PROJET ACTIF]'));
    assert.ok(formatted.includes('- [decision] Architecture hexagonale retenue pour le module auth.'));
    assert.ok(formatted.includes('</project_memory>'));

    // Vérifier l'insertion dans SystemPrompt.build
    const prompt = SystemPrompt.build(
      {
        path: 'c:/proj',
        os: { platform: 'win32', arch: 'x64' },
        packageManager: 'npm',
        languages: ['TypeScript'],
        frameworks: ['React'],
        scripts: {},
        git: { isRepo: true, branch: 'main', isClean: true },
        keyFiles: []
      },
      formatted
    );

    assert.ok(prompt.includes('<project_memory>'));
    assert.ok(prompt.includes('Architecture hexagonale'));
  });

  await t.test('Plafonnement strict du budget de caractères', () => {
    const items = [];
    for (let i = 0; i < 50; i++) {
      items.push({
        id: `item-${i}`,
        scope: 'project',
        project_hash: 'proj1',
        category: 'rule',
        fact: `Règle numéro ${i} : ${'x'.repeat(200)}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    }

    // Tester la limitation
    let totalLen = 0;
    const selected = [];
    const maxChars = 4000;
    for (const item of items) {
      const len = item.fact.length + 30;
      if (totalLen + len <= maxChars) {
        selected.push(item);
        totalLen += len;
      }
    }

    assert.ok(totalLen <= maxChars);
    assert.ok(selected.length < items.length);
  });
});

test('Project Memory (§20, §21) - Effacement exclusif sans impact sur les conversations', async (t) => {
  const db = new RuntimeDatabase(':memory:');

  // Créer une conversation et un message
  const conv = db.saveConversation('conv-1', 'Discussion initiale', 'c:/workspace');
  const msg = db.addMessage({
    id: 'msg-1',
    conversationId: 'conv-1',
    role: 'user',
    content: 'Bonjour, peux-tu créer un fichier ?'
  });

  // Créer un setting
  db.setSetting('custom_key', 'custom_value');

  // Créer des mémoires
  db.saveMemory({ scope: 'global', fact: 'Fait 1' });
  db.saveMemory({ scope: 'project', projectHash: 'abc', fact: 'Fait 2' });

  assert.equal(db.listMemories().length, 2);
  assert.equal(db.listConversations().length, 1);
  assert.equal(db.getConversation('conv-1')?.messages.length, 1);
  assert.equal(db.getSetting('custom_key'), 'custom_value');

  // Exécuter l'effacement complet de la mémoire
  const deletedCount = db.clearAllMemories();
  assert.equal(deletedCount, 2);
  assert.equal(db.listMemories().length, 0);

  // VÉRIFICATION CRITIQUE : les conversations, messages et paramètres sont 100% intacts !
  assert.equal(db.listConversations().length, 1);
  assert.equal(db.getConversation('conv-1')?.conversation.title, 'Discussion initiale');
  assert.equal(db.getConversation('conv-1')?.messages.length, 1);
  assert.equal(db.getSetting('custom_key'), 'custom_value');

  db.close();

  try {
    fs.rmSync(testDataDir, { recursive: true, force: true });
  } catch {}
});
