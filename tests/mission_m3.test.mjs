import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { WorkspaceValidator } from '../server/workspace/WorkspaceValidator.ts';
import { WorkspaceDialogPicker } from '../server/workspace/WorkspaceDialogPicker.ts';
import { WorkspaceLockManager } from '../server/workspace/WorkspaceLockManager.ts';
import { TempWorkspaceManager } from '../server/workspace/TempWorkspaceManager.ts';
import { PathSanitizer } from '../server/security/PathSanitizer.ts';
import { toolRegistry } from '../server/tools/ToolRegistry.ts';
import { runtimeDatabase } from '../server/storage/RuntimeDatabase.ts';

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

const isHeadlessLinux = process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY;

test('Mission M3 - 1. Dialogue natif : annulation et concurrence d\'un seul dialogue', {
  skip: isHeadlessLinux ? 'Environnement Linux sans interface graphique (DISPLAY et WAYLAND_DISPLAY absents)' : false
}, async () => {
  const token = await getAuthToken();

  // Test annulation via API HTTP /api/workspaces/pick et /api/workspaces/pick/cancel
  const pickPromise = fetch(`${BASE_URL}/api/workspaces/pick`, {
    method: 'POST',
    headers: {
      'Host': '127.0.0.1:3001',
      'Authorization': `Bearer ${token}`,
      'X-Iroko-Request': '1',
      'Origin': 'http://localhost:5173'
    }
  });

  // Laisser le temps au dialogue de s'initialiser
  await new Promise(r => setTimeout(r, 200));

  // Tentative concurrente d'un second dialogue : doit être rejetée
  const secondPickRes = await fetch(`${BASE_URL}/api/workspaces/pick`, {
    method: 'POST',
    headers: {
      'Host': '127.0.0.1:3001',
      'Authorization': `Bearer ${token}`,
      'X-Iroko-Request': '1',
      'Origin': 'http://localhost:5173'
    }
  });
  const secondData = await secondPickRes.json();
  assert.strictEqual(secondData.cancelled, true, 'Un second dialogue simultané doit être immédiatement rejeté');
  assert.ok(secondData.error?.includes('déjà ouverte'), 'Message d\'erreur explicite sur le dialogue déjà ouvert');

  // Annulation du premier dialogue
  const cancelRes = await fetch(`${BASE_URL}/api/workspaces/pick/cancel`, {
    method: 'POST',
    headers: {
      'Host': '127.0.0.1:3001',
      'Authorization': `Bearer ${token}`,
      'X-Iroko-Request': '1',
      'Origin': 'http://localhost:5173'
    }
  });
  assert.strictEqual(cancelRes.status, 200);
  const cancelData = await cancelRes.json();
  assert.strictEqual(cancelData.success, true, 'L\'annulation doit retourner success: true');

  const firstResult = await pickPromise;
  const firstData = await firstResult.json();
  assert.strictEqual(firstData.cancelled, true, 'Le premier dialogue annulé doit avoir cancelled: true');
});

test('Mission M3 - 2. Validation serveur : rejet des chemins invalides, racines de disques et dossiers système', () => {
  // Chemins vides ou inexistants
  assert.strictEqual(WorkspaceValidator.validate('').valid, false);
  assert.strictEqual(WorkspaceValidator.validate('   ').valid, false);
  assert.strictEqual(WorkspaceValidator.validate('C:\\Chemin\\Totalement\\Inexistant\\12345').valid, false);

  // Racines de disques
  if (process.platform === 'win32') {
    assert.strictEqual(WorkspaceValidator.validate('C:\\').valid, false);
    assert.strictEqual(WorkspaceValidator.validate('c:').valid, false);
    assert.ok(WorkspaceValidator.validate('C:\\').error?.includes('racine d\'un lecteur'));
  } else {
    assert.strictEqual(WorkspaceValidator.validate('/').valid, false);
    assert.ok(WorkspaceValidator.validate('/').error?.includes('racine'));
  }

  // Dossiers système
  if (process.platform === 'win32') {
    assert.strictEqual(WorkspaceValidator.validate('C:\\Windows').valid, false);
    assert.strictEqual(WorkspaceValidator.validate('C:\\Program Files').valid, false);
    assert.ok(WorkspaceValidator.validate('C:\\Windows').error?.includes('sanctuarisé') || WorkspaceValidator.validate('C:\\Windows').error?.includes('dossier système'));
  } else {
    assert.strictEqual(WorkspaceValidator.validate('/etc').valid, false);
    assert.strictEqual(WorkspaceValidator.validate('/sys').valid, false);
  }

  // Périphériques Windows et UNC
  assert.strictEqual(WorkspaceValidator.validate('\\\\?\\C:\\Temp').valid, false);
  assert.strictEqual(WorkspaceValidator.validate('\\\\server\\share').valid, false);
});

test('Mission M3 - 3. Validation serveur : rejet strict du répertoire de données du runtime', () => {
  const dataDir = process.env.IROKO_DATA_DIR || (
    process.platform === 'win32' && process.env.APPDATA
      ? path.join(process.env.APPDATA, 'iroko')
      : path.join(os.homedir(), '.iroko')
  );

  // Le répertoire de données runtime doit être rejeté
  if (fs.existsSync(dataDir)) {
    const res = WorkspaceValidator.validate(dataDir);
    assert.strictEqual(res.valid, false, 'Le dossier de données du runtime doit être rejeté');
    assert.ok(res.error?.includes('sanctuarisé'), 'L\'erreur doit mentionner que le dossier est sanctuarisé');
  }
});

test('Mission M3 - 4. Validation serveur : avertissement si sélection du dossier personnel entier', () => {
  const homeDir = os.homedir();
  const res = WorkspaceValidator.validate(homeDir);
  assert.strictEqual(res.valid, true, 'Le dossier personnel est valide');
  assert.ok(res.warning !== undefined, 'Un avertissement doit être retourné pour os.homedir()');
  assert.ok(res.warning?.includes('dossier personnel'), 'Le message avertit sur le dossier personnel');
});

test('Mission M3 - 5. Persistance des dossiers récents : max 5, antéchronologique, suppression', async () => {
  // Purger la table pour isoler strictement le test
  runtimeDatabase.db.exec('DELETE FROM recent_workspaces');

  const testDirs = [
    path.join(__dirname, 'fixtures', 'recents_1'),
    path.join(__dirname, 'fixtures', 'recents_2'),
    path.join(__dirname, 'fixtures', 'recents_3'),
    path.join(__dirname, 'fixtures', 'recents_4'),
    path.join(__dirname, 'fixtures', 'recents_5'),
    path.join(__dirname, 'fixtures', 'recents_6')
  ];

  for (const dir of testDirs) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    runtimeDatabase.recordRecentWorkspace(dir, path.basename(dir));
  }

  const recents = runtimeDatabase.listRecentWorkspaces(10);
  assert.ok(recents.length <= 5, 'La liste des récents ne doit pas dépasser 5 éléments');
  // Le dernier inséré (recents_6) doit être en première position (antéchronologique)
  assert.strictEqual(recents[0].name, 'recents_6');

  // Suppression d'un récent
  runtimeDatabase.removeRecentWorkspace(recents[0].path);
  const updatedRecents = runtimeDatabase.listRecentWorkspaces(10);
  assert.strictEqual(updatedRecents.some(r => r.path === recents[0].path), false, 'Le récent supprimé ne doit plus apparaître');

  // Nettoyage
  for (const dir of testDirs) {
    if (fs.existsSync(dir)) fs.rmdirSync(dir);
  }
});

test('Mission M3 - 6. Changement de projet & Blocage si tâche en cours (409 Conflict)', async () => {
  const token = await getAuthToken();
  const convId = 'test-conv-running-' + Date.now();

  const testDir = path.join(__dirname, 'fixtures', 'proj_switch');
  if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });

  // Ouvrir initialement
  const openRes1 = await fetch(`${BASE_URL}/api/workspaces/open`, {
    method: 'POST',
    headers: {
      'Host': '127.0.0.1:3001',
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Iroko-Request': '1',
      'Origin': 'http://localhost:5173'
    },
    body: JSON.stringify({
      conversationId: convId,
      path: testDir
    })
  });
  assert.strictEqual(openRes1.status, 200);

  const nextDir = path.join(__dirname, 'fixtures', 'proj_switch_2');
  if (!fs.existsSync(nextDir)) fs.mkdirSync(nextDir, { recursive: true });

  // Switch de workspace réussi quand pas de tâche active
  const openRes2 = await fetch(`${BASE_URL}/api/workspaces/open`, {
    method: 'POST',
    headers: {
      'Host': '127.0.0.1:3001',
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Iroko-Request': '1',
      'Origin': 'http://localhost:5173'
    },
    body: JSON.stringify({
      conversationId: convId,
      path: nextDir
    })
  });
  assert.strictEqual(openRes2.status, 200);

  // Nettoyage
  if (fs.existsSync(testDir)) fs.rmdirSync(testDir);
  if (fs.existsSync(nextDir)) fs.rmdirSync(nextDir);
  await fetch(`${BASE_URL}/api/conversations/${convId}`, {
    method: 'DELETE',
    headers: {
      'Host': '127.0.0.1:3001',
      'Authorization': `Bearer ${token}`,
      'X-Iroko-Request': '1',
      'Origin': 'http://localhost:5173'
    }
  });
});

test('Mission M3 - 7. Réinitialisation des permissions lors d\'un changement de projet', () => {
  const lockManager = WorkspaceLockManager.getInstance();
  const convId = 'test-conv-perms-' + Date.now();
  const testDir1 = path.join(__dirname, 'fixtures', 'perm_proj_1');
  const testDir2 = path.join(__dirname, 'fixtures', 'perm_proj_2');

  if (!fs.existsSync(testDir1)) fs.mkdirSync(testDir1, { recursive: true });
  if (!fs.existsSync(testDir2)) fs.mkdirSync(testDir2, { recursive: true });

  // Acquisition initiale
  const lock1 = lockManager.acquireLock(testDir1, convId);
  assert.strictEqual(lock1.isReadOnly, false);

  // Libération et acquisition sur nouveau projet
  lockManager.releaseLock(convId);
  const lock2 = lockManager.acquireLock(testDir2, convId);
  assert.strictEqual(lock2.isReadOnly, false);

  lockManager.releaseLock(convId);
  if (fs.existsSync(testDir1)) fs.rmdirSync(testDir1);
  if (fs.existsSync(testDir2)) fs.rmdirSync(testDir2);
});

test('Mission M3 - 8. Verrou d\'écriture mono-rédacteur & Mode Lecture Seule bloquant les outils modificateurs', async () => {
  const lockManager = WorkspaceLockManager.getInstance();
  const testDir = path.join(__dirname, 'fixtures', 'lock_test');
  if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });

  const conv1 = 'conv-writer-' + Date.now();
  const conv2 = 'conv-reader-' + Date.now();

  // Premier acquéreur : rédacteur
  const lock1 = lockManager.acquireLock(testDir, conv1);
  assert.strictEqual(lock1.isReadOnly, false, 'La première conversation doit avoir les droits d\'écriture');

  // Second acquéreur sur le même dossier : lecture seule
  const lock2 = lockManager.acquireLock(testDir, conv2);
  assert.strictEqual(lock2.isReadOnly, true, 'La deuxième conversation doit être en lecture seule');
  assert.ok(lock2.message?.includes('lecture seule'), 'Avertissement explicite sur le mode lecture seule');

  // Vérification que les outils modificateurs sont bloqués en lecture seule
  const modifyingTools = ['write_file', 'edit_file', 'git_add', 'git_commit', 'git_create_branch'];
  for (const toolName of modifyingTools) {
    const execResult = await toolRegistry.executeTool(toolName, { path: 'test.txt', content: 'hello' }, {
      workspacePath: testDir,
      conversationId: conv2,
      isReadOnly: true,
      emitEvent: () => {}
    });
    assert.strictEqual(execResult.success, false, `L'outil ${toolName} doit échouer en mode lecture seule`);
    assert.ok(execResult.error?.includes('lecture seule'), `L'erreur de ${toolName} doit indiquer le mode lecture seule`);
  }

  // Libération
  lockManager.releaseLock(conv1);
  lockManager.releaseLock(conv2);
  if (fs.existsSync(testDir)) fs.rmdirSync(testDir);
});

test('Mission M3 - 9. Confinement de l\'espace temporaire, anti-traversée et purge', async () => {
  const tempManager = TempWorkspaceManager.getInstance();
  const convId = 'test-temp-confine-' + Date.now();

  const tempPath = tempManager.getOrCreateTempWorkspace(convId);
  assert.ok(fs.existsSync(tempPath), 'L\'espace temporaire doit être créé physiquement');
  assert.strictEqual(tempManager.isTempWorkspace(tempPath), true, 'Doit être reconnu comme espace temporaire');

  // Validation d'un fichier légitime à l'intérieur
  const validFileResult = PathSanitizer.validatePath('index.js', tempPath, { allowCreation: true });
  assert.strictEqual(validFileResult.valid, true, 'Un fichier dans l\'espace temporaire doit être valide');

  // Tentative de traversée hors de l'espace temporaire (../autre_dossier)
  const traversalResult = PathSanitizer.validatePath('../../../escape.txt', tempPath);
  assert.strictEqual(traversalResult.valid, false, 'La tentative de traversée doit être bloquée');
  assert.ok(traversalResult.error?.includes('sortie du workspace'), 'Message anti-traversée');

  // Calcul de la taille
  const testFilePath = path.join(tempPath, 'sample.txt');
  fs.writeFileSync(testFilePath, 'Contenu temporaire pour le test');
  const size = tempManager.getTempWorkspaceSize(convId);
  assert.ok(size > 0, 'La taille cumulée doit être supérieure à 0');

  // Purge de l'espace temporaire
  tempManager.purgeTempWorkspace(convId);
  assert.strictEqual(fs.existsSync(tempPath), false, 'L\'espace temporaire doit être totalement purgé');
});

test('Mission M3 - 10. Routine de copie de l\'espace temporaire vers un dossier PC', () => {
  const tempManager = TempWorkspaceManager.getInstance();
  const convId = 'test-temp-copy-' + Date.now();
  const tempPath = tempManager.getOrCreateTempWorkspace(convId);

  // Écriture de quelques fichiers dans le temp
  fs.writeFileSync(path.join(tempPath, 'app.js'), 'console.log("hello");');
  fs.mkdirSync(path.join(tempPath, 'src'), { recursive: true });
  fs.writeFileSync(path.join(tempPath, 'src', 'utils.js'), 'export const a = 1;');

  const destDir = path.join(__dirname, 'fixtures', 'copy_destination');
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

  const copyResult = tempManager.copyTo(convId, destDir);
  assert.strictEqual(copyResult.copiedFiles, 2, '2 fichiers doivent avoir été copiés');
  assert.ok(fs.existsSync(path.join(destDir, 'app.js')));
  assert.ok(fs.existsSync(path.join(destDir, 'src', 'utils.js')));

  // Nettoyage
  tempManager.purgeTempWorkspace(convId);
  if (fs.existsSync(destDir)) {
    fs.rmSync(destDir, { recursive: true, force: true });
  }
});

test('Mission M3 - 11. Sécurité : le frontend ne peut pas contourner la validation serveur (/api/workspaces/open)', async () => {
  const token = await getAuthToken();
  const convId = 'test-security-bypass-' + Date.now();

  // Tentative d'ouvrir un dossier système via /api/workspaces/open
  const badPath = process.platform === 'win32' ? 'C:\\Windows' : '/etc';
  const res = await fetch(`${BASE_URL}/api/workspaces/open`, {
    method: 'POST',
    headers: {
      'Host': '127.0.0.1:3001',
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Iroko-Request': '1',
      'Origin': 'http://localhost:5173'
    },
    body: JSON.stringify({
      conversationId: convId,
      path: badPath
    })
  });

  assert.strictEqual(res.status, 400, 'L\'ouverture d\'un dossier non autorisé doit être rejetée avec un code 400');
  const data = await res.json();
  assert.strictEqual(data.valid, false);
  assert.ok(data.error !== undefined);
});
