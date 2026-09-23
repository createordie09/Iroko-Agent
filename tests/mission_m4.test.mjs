import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseMarkdownBlocks } from '../src/features/chat/markdownParser.ts';
import { artifactManager } from '../server/artifacts/ArtifactManager.ts';
import { toolRegistry } from '../server/tools/ToolRegistry.ts';
import { runtimeDatabase } from '../server/storage/RuntimeDatabase.ts';
import { SystemPrompt } from '../server/runtime/SystemPrompt.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE_URL = 'http://127.0.0.1:3001';

async function getAuthToken() {
  const res = await fetch(`${BASE_URL}/api/bootstrap`, {
    headers: { 'Host': '127.0.0.1:3001' }
  });
  const data = await res.json();
  return data.token;
}

// ─────────────────────────────────────────────────────────────
// PARTIE A : BLOCS DE CODE & PARSEUR MARKDOWN
// ─────────────────────────────────────────────────────────────

test('Mission M4 - A1. Parseur : bloc simple 3 backticks avec langage et code exact', () => {
  const md = `Introduction
\`\`\`typescript
const x: number = 42;
console.log(x);
\`\`\`
Conclusion`;

  const blocks = parseMarkdownBlocks(md);
  assert.strictEqual(blocks.length, 3);
  assert.strictEqual(blocks[0].type, 'text');
  assert.strictEqual(blocks[0].content, 'Introduction');

  assert.strictEqual(blocks[1].type, 'code');
  assert.strictEqual(blocks[1].language, 'typescript');
  assert.strictEqual(blocks[1].code, 'const x: number = 42;\nconsole.log(x);');

  assert.strictEqual(blocks[2].type, 'text');
  assert.strictEqual(blocks[2].content, 'Conclusion');
});

test('Mission M4 - A2. Parseur : clôture stricte de 4+ backticks et tildes avec backticks imbriqués', () => {
  // Un bloc de 4 backticks qui contient un bloc de 3 backticks
  const mdWithNested = `\`\`\`\`markdown
Voici un exemple :
\`\`\`javascript
const a = 1;
\`\`\`
Fin de l'exemple.
\`\`\`\``;

  const blocks = parseMarkdownBlocks(mdWithNested);
  assert.strictEqual(blocks.length, 1);
  assert.strictEqual(blocks[0].type, 'code');
  assert.strictEqual(blocks[0].language, 'markdown');
  assert.strictEqual(
    blocks[0].code,
    `Voici un exemple :\n\`\`\`javascript\nconst a = 1;\n\`\`\`\nFin de l'exemple.`
  );

  // Bloc avec tildes
  const mdWithTildes = `~~~python
print("test avec tildes")
~~~`;
  const tildeBlocks = parseMarkdownBlocks(mdWithTildes);
  assert.strictEqual(tildeBlocks.length, 1);
  assert.strictEqual(tildeBlocks[0].type, 'code');
  assert.strictEqual(tildeBlocks[0].language, 'python');
  assert.strictEqual(tildeBlocks[0].code, 'print("test avec tildes")');
});

test('Mission M4 - A3. Parseur : extraction des titres optionnels title="..." et lang:title', () => {
  // Format title="..."
  const md1 = `\`\`\`typescript title="src/index.ts"
console.log('hello');
\`\`\``;
  const blocks1 = parseMarkdownBlocks(md1);
  assert.strictEqual(blocks1[0].type, 'code');
  assert.strictEqual(blocks1[0].language, 'typescript');
  assert.strictEqual(blocks1[0].title, 'src/index.ts');

  // Format lang:title
  const md2 = `\`\`\`json:config.json
{ "key": "value" }
\`\`\``;
  const blocks2 = parseMarkdownBlocks(md2);
  assert.strictEqual(blocks2[0].type, 'code');
  assert.strictEqual(blocks2[0].language, 'json');
  assert.strictEqual(blocks2[0].title, 'config.json');

  // Format sans langage mais avec titre
  const md3 = `\`\`\`title="prompt.txt"
Instructions pour l'agent
\`\`\``;
  const blocks3 = parseMarkdownBlocks(md3);
  assert.strictEqual(blocks3[0].type, 'code');
  assert.strictEqual(blocks3[0].title, 'prompt.txt');
  assert.strictEqual(blocks3[0].code, "Instructions pour l'agent");
});

test('Mission M4 - A4. Parseur : préservation fidèle des espaces finaux et des blocs vides', () => {
  const emptyCode = `\`\`\`\n\`\`\``;
  const blocksEmpty = parseMarkdownBlocks(emptyCode);
  assert.strictEqual(blocksEmpty.length, 1);
  assert.strictEqual(blocksEmpty[0].type, 'code');
  assert.strictEqual(blocksEmpty[0].code, '');

  const whitespaceCode = `\`\`\`text
  ligne indentée  
ligne 2    
\`\`\``;
  const blocksWs = parseMarkdownBlocks(whitespaceCode);
  assert.strictEqual(blocksWs[0].code, '  ligne indentée  \nligne 2    ');
});

// ─────────────────────────────────────────────────────────────
// PARTIE B : SÉCURITÉ & GESTIONNAIRE D'ARTÉFACTS
// ─────────────────────────────────────────────────────────────

test('Mission M4 - B1. Sécurité : assainissement et rejet des noms de fichiers invalides', () => {
  const convId = 'test_conv_sec_' + Date.now();
  runtimeDatabase.saveConversation(convId, 'Test Sec');

  // 1. Rejet des chemins avec slash ou antislash
  assert.throws(() => {
    artifactManager.createArtifact({
      conversationId: convId,
      filename: 'dossier/test.txt',
      content: 'hello'
    });
  }, /séparateur de chemin/);

  assert.throws(() => {
    artifactManager.createArtifact({
      conversationId: convId,
      filename: '..\\test.txt',
      content: 'hello'
    });
  }, /séparateur de chemin/);

  // 2. Rejet des noms réservés Windows (CON, PRN, AUX, NUL, COM1, etc.)
  assert.throws(() => {
    artifactManager.createArtifact({
      conversationId: convId,
      filename: 'CON.txt',
      content: 'hello'
    });
  }, /réservé/);

  assert.throws(() => {
    artifactManager.createArtifact({
      conversationId: convId,
      filename: 'nul.json',
      content: 'hello'
    });
  }, /réservé/);

  // 3. Rejet des caractères interdits (< > : " / \ | ? *)
  assert.throws(() => {
    artifactManager.createArtifact({
      conversationId: convId,
      filename: 'fichier<test>.md',
      content: 'hello'
    });
  }, /non autorisés|caractères/);

  // 4. Rejet des noms trop longs (> 128 caractères)
  const tooLongName = 'a'.repeat(125) + '.txt'; // 129 caractères
  assert.throws(() => {
    artifactManager.createArtifact({
      conversationId: convId,
      filename: tooLongName,
      content: 'hello'
    });
  }, /128 caractères/);

  // Nettoyage
  runtimeDatabase.deleteConversation(convId);
});

test('Mission M4 - B2. Cycle de vie : création, versioning et restauration d\'un artéfact', () => {
  const convId = 'test_conv_lifecycle_' + Date.now();
  runtimeDatabase.saveConversation(convId, 'Test Lifecycle');

  // 1. Création v1
  const art1 = artifactManager.createArtifact({
    conversationId: convId,
    filename: 'analyse.md',
    content: '# Rapport initial\nPremière version.',
    title: 'Rapport d\'analyse'
  });

  assert.ok(art1.id);
  assert.strictEqual(art1.name, 'analyse.md');
  assert.strictEqual(art1.currentVersion, 1);
  assert.strictEqual(art1.mimeType, 'text/markdown');

  // Vérification sur disque
  const v1Content = artifactManager.getArtifactContent(art1.id, 1);
  assert.strictEqual(v1Content, '# Rapport initial\nPremière version.');

  // 2. Mise à jour v2 — la méthode attend {id, content}
  const art2 = artifactManager.updateArtifact({
    id: art1.id,
    content: '# Rapport initial\nDeuxième version complétée.'
  });

  assert.strictEqual(art2.currentVersion, 2);
  const v2Content = artifactManager.getArtifactContent(art1.id, 2);
  assert.strictEqual(v2Content, '# Rapport initial\nDeuxième version complétée.');

  // La v1 est toujours intacte
  assert.strictEqual(artifactManager.getArtifactContent(art1.id, 1), '# Rapport initial\nPremière version.');

  // 3. Liste des versions via getArtifact (listVersions n'est pas exposé)
  const artMeta = artifactManager.getArtifact(art1.id);
  const versions = artMeta?.versions || [];
  assert.strictEqual(versions.length, 2);
  assert.strictEqual(versions[0].version, 1);
  assert.strictEqual(versions[1].version, 2);

  // 4. Restauration de la v1 : crée une nouvelle version (v3) avec le contenu de v1
  const restored = artifactManager.restoreVersion(art1.id, 1);
  // restoreVersion appelle updateArtifact → la version courante est maintenant 3
  assert.ok(restored.currentVersion >= 3, 'La restauration doit créer une nouvelle version');
  const activeContent = artifactManager.getArtifactContent(art1.id);
  assert.strictEqual(activeContent, '# Rapport initial\nPremière version.');

  // Nettoyage
  runtimeDatabase.deleteConversation(convId);
});

// ─────────────────────────────────────────────────────────────
// PARTIE C : OUTILS CREATE_ARTIFACT & UPDATE_ARTIFACT
// ─────────────────────────────────────────────────────────────

test('Mission M4 - C1. Outils d\'artéfacts dans le ToolRegistry', async () => {
  const createTool = toolRegistry.getTool('create_artifact');
  assert.ok(createTool, 'create_artifact doit être enregistré dans ToolRegistry');
  assert.strictEqual(createTool.category, 'artifacts');
  assert.ok(['SAFE', 'safe'].includes(createTool.permission));

  const updateTool = toolRegistry.getTool('update_artifact');
  assert.ok(updateTool, 'update_artifact doit être enregistré dans ToolRegistry');
  assert.strictEqual(updateTool.category, 'artifacts');
  assert.ok(['SAFE', 'safe'].includes(updateTool.permission));

  const convId = 'test_conv_tool_' + Date.now();
  runtimeDatabase.saveConversation(convId, 'Test Tool');

  // Exécution de create_artifact via l'outil
  const events = [];
  const fakeContext = {
    conversationId: convId,
    emitEvent: (e) => events.push(e),
    logger: console
  };

  const createRes = await createTool.execute({
    filename: 'export.json',
    content: '{"statut": "ok"}',
    title: 'Export JSON'
  }, fakeContext);

  assert.strictEqual(createRes.success, true);
  assert.ok(createRes.data.id);
  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].type, 'artifact_created');

  // Exécution de update_artifact via l'outil — paramètre "id" (pas "artifactId")
  const updateRes = await updateTool.execute({
    id: createRes.data.id,
    content: '{"statut": "mis_a_jour"}'
  }, fakeContext);

  assert.strictEqual(updateRes.success, true);
  // L'outil retourne data.version (currentVersion du ToolResult)
  assert.ok(updateRes.data.version >= 2);
  assert.strictEqual(events.length, 2);
  assert.strictEqual(events[1].type, 'artifact_updated');

  // Nettoyage
  runtimeDatabase.deleteConversation(convId);
});

// ─────────────────────────────────────────────────────────────
// PARTIE D : API REST & TÉLÉCHARGEMENT AUTHENTIFIÉ
// ─────────────────────────────────────────────────────────────

test('Mission M4 - D1. Endpoints REST : consultation, versions et téléchargement', async () => {
  const token = await getAuthToken();
  const convId = 'test_conv_api_' + Date.now();
  // Créer la conversation via l'API REST (le serveur a sa propre DB)
  const createConvRes = await fetch(`${BASE_URL}/api/conversations`, {
    method: 'POST',
    headers: {
      'Host': '127.0.0.1:3001',
      'Authorization': `Bearer ${token}`,
      'X-Iroko-Request': '1',
      'Content-Type': 'application/json',
      'Origin': 'http://localhost:5173'
    },
    body: JSON.stringify({ id: convId, title: 'Test API M4' })
  });
  assert.strictEqual(createConvRes.status, 201, 'La conversation doit être créée avec succès');

  // Créer un artéfact via l'API REST  
  const createArtRes = await fetch(`${BASE_URL}/api/conversations/${convId}/artifacts`, {
    method: 'POST',
    headers: {
      'Host': '127.0.0.1:3001',
      'Authorization': `Bearer ${token}`,
      'X-Iroko-Request': '1',
      'Content-Type': 'application/json',
      'Origin': 'http://localhost:5173'
    },
    body: JSON.stringify({
      filename: 'donnees.csv',
      content: 'id,nom,score\n1,Alice,95\n2,Bob,88',
      title: 'Tableau de données'
    })
  });
  assert.strictEqual(createArtRes.status, 201, 'L\'artéfact doit être créé avec succès');
  const createArtData = await createArtRes.json();
  assert.ok(createArtData.artifact?.id || createArtData.id, 'L\'artéfact créé doit avoir un id');
  const artId = createArtData.artifact?.id || createArtData.id;

  const headers = {
    'Host': '127.0.0.1:3001',
    'Authorization': `Bearer ${token}`,
    'X-Iroko-Request': '1',
    'Origin': 'http://localhost:5173'
  };

  // 2. GET /api/conversations/:id/artifacts
  const listRes = await fetch(`${BASE_URL}/api/conversations/${convId}/artifacts`, { headers });
  assert.strictEqual(listRes.status, 200);
  const listData = await listRes.json();
  // Le serveur retourne { artifacts: [...] }
  const artifactsList = listData.artifacts || listData;
  assert.ok(Array.isArray(artifactsList), 'La liste doit être un tableau');
  assert.strictEqual(artifactsList.length, 1);
  assert.strictEqual(artifactsList[0].id, artId);
  assert.strictEqual(artifactsList[0].name, 'donnees.csv');

  // 3. GET /api/artifacts/:id
  const getRes = await fetch(`${BASE_URL}/api/artifacts/${artId}`, { headers });
  assert.strictEqual(getRes.status, 200);
  const getData = await getRes.json();
  // Le serveur retourne { artifact: {...} }
  const artifactData = getData.artifact || getData;
  assert.strictEqual(artifactData.id, artId);

  // 4. Téléchargement GET /api/artifacts/:id/download
  const dlRes = await fetch(`${BASE_URL}/api/artifacts/${artId}/download`, { headers });
  assert.strictEqual(dlRes.status, 200);
  assert.ok(dlRes.headers.get('content-disposition')?.includes('donnees.csv'), 'Content-Disposition doit contenir le nom du fichier');
  assert.strictEqual(dlRes.headers.get('x-content-type-options'), 'nosniff');
  const dlText = await dlRes.text();
  assert.strictEqual(dlText, 'id,nom,score\n1,Alice,95\n2,Bob,88');

  // 5. Nettoyage via API — suppression de la conversation en cascade
  await fetch(`${BASE_URL}/api/conversations/${convId}`, {
    method: 'DELETE',
    headers: {
      ...headers,
      'Content-Type': 'application/json'
    }
  });
});

// ─────────────────────────────────────────────────────────────
// PARTIE E : PROMPT SYSTÈME v1.1.0
// ─────────────────────────────────────────────────────────────

test('Mission M4 - E1. Prompt système : version 1.1.0 et directives de copie / artéfacts', () => {
  assert.strictEqual(SystemPrompt.VERSION, '1.1.0');
  const fakeMeta = {
    path: 'C:\\test\\workspace',
    name: 'test',
    os: { platform: 'win32', arch: 'x64' },
    packageManager: 'npm',
    languages: [],
    frameworks: [],
    scripts: {},
    git: { isRepo: false, isClean: true },
    keyFiles: []
  };
  const built = SystemPrompt.build(fakeMeta);
  assert.ok(
    built.includes("8. Quand l'utilisateur demande un texte, un prompt, une commande ou du code à copier"),
    'Le prompt système doit inclure la directive 8 sur les blocs de code'
  );
  assert.ok(
    built.includes("9. En mode Code avec un projet ouvert, tout fichier appartenant au projet s'écrit dans le projet"),
    'Le prompt système doit inclure la directive 9 sur la distinction projet vs artéfact'
  );
});
