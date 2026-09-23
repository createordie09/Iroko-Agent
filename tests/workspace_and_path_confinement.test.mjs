import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { PathSanitizer } from '../server/security/PathSanitizer.ts';
import { ReadFileTool } from '../server/tools/filesystem/read_file.ts';
import { WriteFileTool } from '../server/tools/filesystem/write_file.ts';
import { EditFileTool } from '../server/tools/filesystem/edit_file.ts';
import { PermissionEngine } from '../server/permissions/PermissionEngine.ts';
import { WorkspaceManager } from '../server/workspace/WorkspaceManager.ts';
import { SystemPrompt } from '../server/runtime/SystemPrompt.ts';

test('PathSanitizer - Confinement absolu et validation multi-plateforme', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'iroko-path-test-'));
  const workspaceDir = path.join(tempDir, 'workspace');
  fs.mkdirSync(workspaceDir, { recursive: true });

  const testFile = path.join(workspaceDir, 'normal.txt');
  fs.writeFileSync(testFile, 'contenu');

  // 1. Fichier valide dans le workspace
  const resValid = PathSanitizer.validatePath('normal.txt', workspaceDir);
  assert.equal(resValid.valid, true);
  assert.ok(resValid.canonicalPath);

  // 2. Traversée de répertoire (..)
  const resTraversal = PathSanitizer.validatePath('../secret.txt', workspaceDir);
  assert.equal(resTraversal.valid, false);
  assert.ok(resTraversal.error?.includes('Accès refusé'));

  // 3. Chemins UNC réseau
  const resUnc1 = PathSanitizer.validatePath('\\\\server\\share\\test.txt', workspaceDir);
  assert.equal(resUnc1.valid, false);
  assert.ok(resUnc1.error?.includes('UNC'));

  const resUnc2 = PathSanitizer.validatePath('//server/share/test.txt', workspaceDir);
  assert.equal(resUnc2.valid, false);
  assert.ok(resUnc2.error?.includes('UNC'));

  // 4. Chemins de périphériques Windows
  const resDev1 = PathSanitizer.validatePath('\\\\?\\C:\\Windows', workspaceDir);
  assert.equal(resDev1.valid, false);
  assert.ok(resDev1.error?.includes('périphériques'));

  const resDev2 = PathSanitizer.validatePath('\\\\.\\COM1', workspaceDir);
  assert.equal(resDev2.valid, false);
  assert.ok(resDev2.error?.includes('périphériques'));

  // 5. Flux alternatifs NTFS (ADS)
  const resAds1 = PathSanitizer.validatePath('normal.txt:stream', workspaceDir);
  assert.equal(resAds1.valid, false);
  assert.ok(resAds1.error?.includes('flux de données alternatifs'));

  // 6. Noms réservés Windows DOS
  assert.equal(PathSanitizer.validatePath('CON.txt', workspaceDir).valid, false);
  assert.equal(PathSanitizer.validatePath('aux', workspaceDir).valid, false);
  assert.equal(PathSanitizer.validatePath('nul.json', workspaceDir).valid, false);
  assert.equal(PathSanitizer.validatePath('com1', workspaceDir).valid, false);
  assert.equal(PathSanitizer.validatePath('dir/lpt1.txt', workspaceDir).valid, false);

  // 7. Noms avec espace ou point final
  assert.equal(PathSanitizer.validatePath('bad.txt.', workspaceDir).valid, false);
  assert.equal(PathSanitizer.validatePath('bad.txt ', workspaceDir).valid, false);
  assert.equal(PathSanitizer.validatePath('dir /file.txt', workspaceDir).valid, false);

  // 8. Noms courts DOS 8.3
  assert.equal(PathSanitizer.validatePath('PROGRA~1/test.txt', workspaceDir).valid, false);
  assert.equal(PathSanitizer.validatePath('test~1.txt', workspaceDir).valid, false);

  // 9. Fichiers sensibles
  assert.equal(PathSanitizer.isSensitiveFile('.env'), true);
  assert.equal(PathSanitizer.isSensitiveFile('.env.production'), true);
  assert.equal(PathSanitizer.isSensitiveFile('server.key'), true);
  assert.equal(PathSanitizer.isSensitiveFile('cert.pem'), true);
  assert.equal(PathSanitizer.isSensitiveFile('id_rsa'), true);
  assert.equal(PathSanitizer.isSensitiveFile('id_ed25519'), true);
  assert.equal(PathSanitizer.isSensitiveFile('normal.ts'), false);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('PathSanitizer - Détection binaire et écriture atomique', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'iroko-atomic-test-'));

  // 1. Fichier texte vs binaire
  const textFile = path.join(tempDir, 'plain.txt');
  fs.writeFileSync(textFile, 'Hello world, ceci est du texte pur en UTF-8.');
  assert.equal(PathSanitizer.isBinaryFile(textFile), false);

  const binFile = path.join(tempDir, 'sample.bin');
  const binBuffer = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x00, 0x01, 0x01, 0x00]); // En-tête ELF avec octet nul
  fs.writeFileSync(binFile, binBuffer);
  assert.equal(PathSanitizer.isBinaryFile(binFile), true);

  // 2. Écriture atomique
  const targetFile = path.join(tempDir, 'atomic.txt');
  PathSanitizer.writeAtomic(targetFile, 'Contenu atomique');
  assert.equal(fs.readFileSync(targetFile, 'utf-8'), 'Contenu atomique');

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('edit_file - Échec sur ambiguïté, préservation CRLF/BOM et backup', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'iroko-edit-test-'));
  const workspaceDir = path.join(tempDir, 'workspace');
  fs.mkdirSync(workspaceDir, { recursive: true });

  const permissionEngine = new PermissionEngine(workspaceDir);
  const context = {
    workspacePath: workspaceDir,
    permissionEngine,
    emitEvent: (event) => {
      if (event && event.type === 'permission_required') {
        permissionEngine.resolvePermission(event.request.id, true, 'once');
      }
    }
  };

  const editTool = new EditFileTool();

  // 1. Fichier avec cible ambiguë (dupliquée)
  const dupFile = path.join(workspaceDir, 'duplicate.txt');
  fs.writeFileSync(dupFile, 'LIGNE CIBLE\nAUTRE CHOSE\nLIGNE CIBLE\n');

  const dupRes = await editTool.execute({
    filePath: 'duplicate.txt',
    targetContent: 'LIGNE CIBLE',
    replacementContent: 'NOUVELLE LIGNE'
  }, context);

  assert.equal(dupRes.success, false);
  assert.ok(dupRes.error?.includes('apparaît 2 fois'));
  // Vérifier qu'absolument rien n'a été modifié
  assert.equal(fs.readFileSync(dupFile, 'utf-8'), 'LIGNE CIBLE\nAUTRE CHOSE\nLIGNE CIBLE\n');

  // 2. Cible introuvable
  const notFoundRes = await editTool.execute({
    filePath: 'duplicate.txt',
    targetContent: 'INEXISTANT',
    replacementContent: 'REMPLACEMENT'
  }, context);
  assert.equal(notFoundRes.success, false);
  assert.ok(notFoundRes.error?.includes('pas été trouvé'));

  // 3. Préservation CRLF (\r\n)
  const crlfFile = path.join(workspaceDir, 'crlf.txt');
  fs.writeFileSync(crlfFile, 'première ligne\r\ndeuxième ligne\r\ntroisième ligne\r\n');

  const crlfRes = await editTool.execute({
    filePath: 'crlf.txt',
    targetContent: 'deuxième ligne',
    replacementContent: 'deuxième ligne modifiée'
  }, context);

  assert.equal(crlfRes.success, true);
  const updatedCrlf = fs.readFileSync(crlfFile, 'utf-8');
  assert.ok(updatedCrlf.includes('\r\n'));
  assert.ok(!updatedCrlf.includes('\r\r\n'));
  assert.ok(updatedCrlf.includes('deuxième ligne modifiée\r\n'));

  // 4. Préservation du BOM UTF-8 (\uFEFF)
  const bomFile = path.join(workspaceDir, 'bom.txt');
  fs.writeFileSync(bomFile, '\uFEFFContenu avec BOM\nDeuxième ligne\n');

  const bomRes = await editTool.execute({
    filePath: 'bom.txt',
    targetContent: 'Deuxième ligne',
    replacementContent: 'Deuxième ligne avec BOM préservé'
  }, context);

  assert.equal(bomRes.success, true);
  const updatedBom = fs.readFileSync(bomFile, 'utf-8');
  assert.equal(updatedBom.charCodeAt(0), 0xFEFF);

  // 5. Vérification du backup préalable dans le dossier runtime
  const backupDir = path.join(process.env.IROKO_DATA_DIR || (process.platform === 'win32' && process.env.APPDATA ? path.join(process.env.APPDATA, 'iroko') : path.join(os.homedir(), '.iroko')), 'backups');
  // Le backupDir doit exister et contenir des fichiers de sauvegarde
  assert.ok(fs.existsSync(backupDir));

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('WorkspaceManager & SystemPrompt - Découverte hiérarchique, <project_instructions> et prompt versionné', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'iroko-rules-test-'));
  const workspaceDir = path.join(tempDir, 'workspace');
  fs.mkdirSync(workspaceDir, { recursive: true });

  // Créer AGENTS.md à la racine
  fs.writeFileSync(path.join(workspaceDir, 'AGENTS.md'), '# Règles racine\n1. Règle absolue');

  // Créer un sous-dossier avec IROKO.md
  const subDir = path.join(workspaceDir, 'src');
  fs.mkdirSync(subDir, { recursive: true });
  fs.writeFileSync(path.join(subDir, 'IROKO.md'), '# Règles sous-dossier\n1. Règle src');

  const wm = new WorkspaceManager();
  const meta = await wm.analyze(workspaceDir);

  assert.ok(meta.projectRulesFile?.includes('AGENTS.md'));
  assert.ok(meta.projectRulesFile?.includes('src/IROKO.md'));
  assert.ok(meta.projectRulesContent?.includes('Règle absolue'));
  assert.ok(meta.projectRulesContent?.includes('Règle src'));

  // Vérifier le formatage dans <project_instructions>
  const formatted = wm.formatForPrompt(meta);
  assert.ok(formatted.includes('<project_instructions>'));
  assert.ok(formatted.includes('contenu non fiable'));
  assert.ok(formatted.includes('</project_instructions>'));

  // Vérifier le SystemPrompt versionné sans comparaison d'autres agents
  const systemPrompt = SystemPrompt.build(meta);
  assert.ok(systemPrompt.includes(`(v${SystemPrompt.VERSION})`));
  assert.ok(!systemPrompt.toLowerCase().includes('contrairement à'));
  assert.ok(!systemPrompt.toLowerCase().includes('mieux que'));
  assert.ok(!systemPrompt.includes('Cursor'));
  assert.ok(!systemPrompt.includes('Aider'));

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('ReadFileTool & WriteFileTool - Confinement, binaire et fichiers sensibles', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'iroko-tools-test-'));
  const workspaceDir = path.join(tempDir, 'workspace');
  fs.mkdirSync(workspaceDir, { recursive: true });

  const permissionEngine = new PermissionEngine(workspaceDir);
  let sensitivePermRequested = false;
  const context = {
    workspacePath: workspaceDir,
    permissionEngine,
    emitEvent: (event) => {
      if (event && event.type === 'permission_required') {
        if (event.request.level === 'HIGH') {
          sensitivePermRequested = true;
        }
        permissionEngine.resolvePermission(event.request.id, true, 'once');
      }
    }
  };

  const readTool = new ReadFileTool();
  const writeTool = new WriteFileTool();

  // 1. WriteFileTool : traversée refusée
  const writeTravers = await writeTool.execute({ filePath: '../escape.txt', content: 'test' }, context);
  assert.equal(writeTravers.success, false);

  // 2. WriteFileTool : écriture normale atomique
  const writeOk = await writeTool.execute({ filePath: 'valid.txt', content: 'Contenu valide' }, context);
  assert.equal(writeOk.success, true);
  assert.equal(fs.readFileSync(path.join(workspaceDir, 'valid.txt'), 'utf-8'), 'Contenu valide');

  // 3. ReadFileTool : lecture normale
  const readOk = await readTool.execute({ filePath: 'valid.txt' }, context);
  assert.equal(readOk.success, true);
  assert.ok(readOk.data?.content.includes('Contenu valide'));

  // 4. ReadFileTool : fichier binaire rejeté
  const binPath = path.join(workspaceDir, 'binary.bin');
  fs.writeFileSync(binPath, Buffer.from([0x00, 0x01, 0x02, 0x03]));
  const readBin = await readTool.execute({ filePath: 'binary.bin' }, context);
  assert.equal(readBin.success, false);
  assert.ok(readBin.error?.includes('binaire'));

  // 5. ReadFileTool : fichier sensible déclenchant confirmation HIGH
  const envPath = path.join(workspaceDir, '.env');
  fs.writeFileSync(envPath, 'SECRET_KEY=12345');
  const readEnv = await readTool.execute({ filePath: '.env' }, context);
  assert.equal(readEnv.success, true);
  assert.equal(sensitivePermRequested, true);

  fs.rmSync(tempDir, { recursive: true, force: true });
});
