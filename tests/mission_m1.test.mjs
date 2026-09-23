import { test } from 'node:test';
import assert from 'node:assert';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ToolRegistry } from '../server/tools/ToolRegistry.ts';

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

test('Mission M1 - 1. Redirection HTTP 302 de /code vers /', async () => {
  const result = await new Promise((resolve, reject) => {
    const req = http.request(`${BASE_URL}/code`, {
      method: 'GET',
      headers: { 'Host': '127.0.0.1:3001' }
    }, (res) => {
      resolve({
        statusCode: res.statusCode,
        location: res.headers.location
      });
    });
    req.on('error', reject);
    req.end();
  });

  assert.strictEqual(result.statusCode, 302, 'La route /code doit retourner un code 302');
  assert.strictEqual(result.location, '/', 'La route /code doit rediriger vers /');
});

test('Mission M1 - 2. Absence totale d\'import de CodeWorkspace dans src/', () => {
  const srcDir = path.resolve(__dirname, '../src');
  
  function scanDir(dir) {
    const files = fs.readdirSync(dir, { withFileTypes: true });
    for (const file of files) {
      const fullPath = path.join(dir, file.name);
      if (file.isDirectory()) {
        scanDir(fullPath);
      } else if (/\.(tsx?|jsx?)$/.test(file.name)) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        assert.ok(
          !content.includes('CodeWorkspace'),
          `Fichier ${fullPath} contient encore une référence à CodeWorkspace`
        );
        assert.ok(
          !content.includes('UniversalComposer'),
          `Fichier ${fullPath} contient encore une référence à UniversalComposer`
        );
      }
    }
  }

  scanDir(srcDir);
});

test('Mission M1 - 3. Gestion et persistance du mode conversation via API REST', async () => {
  const token = await getAuthToken();

  // Création d'une conversation en mode 'chat'
  const createRes = await fetch(`${BASE_URL}/api/conversations`, {
    method: 'POST',
    headers: {
      'Host': '127.0.0.1:3001',
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Iroko-Request': '1'
    },
    body: JSON.stringify({
      title: 'Test Discussion M1',
      mode: 'chat'
    })
  });

  assert.strictEqual(createRes.status, 201);
  const data = await createRes.json();
  const created = data.conversation;
  assert.ok(created.id, 'Une conversation doit être créée');
  assert.strictEqual(created.mode, 'chat', 'Le mode initial doit être chat');

  // Changement de mode vers 'code'
  const updateRes = await fetch(`${BASE_URL}/api/conversations/${created.id}/mode`, {
    method: 'PUT',
    headers: {
      'Host': '127.0.0.1:3001',
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Iroko-Request': '1'
    },
    body: JSON.stringify({ mode: 'code' })
  });

  assert.strictEqual(updateRes.status, 200);
  const updated = await updateRes.json();
  assert.strictEqual(updated.mode, 'code', 'Le mode doit être mis à jour en code');

  // Récupération de la conversation
  const getRes = await fetch(`${BASE_URL}/api/conversations/${created.id}`, {
    headers: {
      'Host': '127.0.0.1:3001',
      'Authorization': `Bearer ${token}`
    }
  });

  assert.strictEqual(getRes.status, 200);
  const fetched = await getRes.json();
  const conv = fetched.conversation || fetched;
  assert.strictEqual(conv.mode, 'code', 'Le mode persisté doit être code');
});

test('Mission M1 - 4. Filtrage strict des outils selon le mode (ToolRegistry)', async () => {
  const registry = new ToolRegistry();

  // En mode 'chat'
  const chatDefinitions = registry.getDefinitionsForModel('execute', 'chat');
  const chatToolNames = chatDefinitions.map(d => d.name);

  // Les outils de code ne doivent PAS être présents en mode chat
  assert.ok(!chatToolNames.includes('execute_command'), 'execute_command ne doit pas être présent en mode chat');
  assert.ok(!chatToolNames.includes('write_file'), 'write_file ne doit pas être présent en mode chat');
  assert.ok(!chatToolNames.includes('edit_file'), 'edit_file ne doit pas être présent en mode chat');
  assert.ok(!chatToolNames.includes('git_status'), 'git_status ne doit pas être présent en mode chat');
  assert.ok(!chatToolNames.includes('verify_project'), 'verify_project ne doit pas être présent en mode chat');

  // En mode 'code'
  const codeDefinitions = registry.getDefinitionsForModel('execute', 'code');
  const codeToolNames = codeDefinitions.map(d => d.name);

  // Les outils de code DOIVENT être présents en mode code
  assert.ok(codeToolNames.includes('execute_command'), 'execute_command doit être présent en mode code');
  assert.ok(codeToolNames.includes('write_file'), 'write_file doit être présent en mode code');
  assert.ok(codeToolNames.includes('edit_file'), 'edit_file doit être présent en mode code');
  assert.ok(codeToolNames.includes('git_status'), 'git_status doit être présent en mode code');
  assert.ok(codeToolNames.includes('verify_project'), 'verify_project doit être présent en mode code');

  // Tentative d'exécution d'un outil de code en mode chat bloquée
  const execResult = await registry.executeTool(
    'execute_command',
    { command: 'echo test' },
    {
      conversationMode: 'chat',
      workspacePath: process.cwd(),
      emitEvent: () => {}
    }
  );

  assert.strictEqual(execResult.success, false, 'L\'exécution d\'un outil de code en mode chat doit échouer');
  assert.ok(
    execResult.error && execResult.error.includes('Mode Chat actif'),
    'L\'erreur doit expliquer que le Mode Chat est actif et inviter à passer en mode Code'
  );
});
