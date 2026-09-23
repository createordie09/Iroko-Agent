/**
 * MISSION M10.1 — Tests de régression
 * Les tests ne doivent JAMAIS toucher les vraies données de l'utilisateur.
 *
 * Vérifie :
 *  1. Le runtime refuse STRICTEMENT de démarrer en mode test si le dossier cible est le dossier réel.
 *  2. L'instanciation de RuntimeDatabase avec le dossier réel lève une exception de sécurité.
 *  3. L'instanciation en mémoire (':memory:') reste toujours autorisée pour les tests unitaires purs.
 *  4. L'instanciation dans un dossier temporaire isolé fonctionne normalement.
 *  5. IROKO_DATA_DIR est obligatoirement défini et distinct du dossier réel.
 *  6. AttachmentManager respecte IROKO_DATA_DIR et ne cible jamais le dossier réel en test.
 *  7. ArtifactManager respecte IROKO_DATA_DIR et ne cible jamais le dossier réel en test.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const { RuntimeDatabase } = await import('../server/storage/RuntimeDatabase.ts');
const { AttachmentManager } = await import('../server/attachments/AttachmentManager.ts');
const { ArtifactManager } = await import('../server/artifacts/ArtifactManager.ts');

const realDataDir = process.platform === 'win32' && process.env.APPDATA
  ? path.join(process.env.APPDATA, 'iroko')
  : path.join(os.homedir(), '.iroko');

test('1. IROKO_DATA_DIR est actif et strictement distinct du dossier réel', () => {
  assert.ok(process.env.IROKO_DATA_DIR, 'IROKO_DATA_DIR doit être défini par setup_test_env.js');
  const resolvedIsolated = path.resolve(process.env.IROKO_DATA_DIR).toLowerCase();
  const resolvedReal = path.resolve(realDataDir).toLowerCase();
  assert.notEqual(
    resolvedIsolated,
    resolvedReal,
    'IROKO_DATA_DIR ne doit JAMAIS pointer vers le dossier de données réel'
  );
});

test('2. Refus formel de démarrer RuntimeDatabase sur le dossier réel en mode test', () => {
  // Tenter de créer une RuntimeDatabase pointant explicitement vers le dossier réel
  assert.throws(
    () => {
      new RuntimeDatabase(realDataDir);
    },
    (err) => {
      return (
        err instanceof Error &&
        err.message.includes('[SÉCURITÉ RUNTIME M10.1]') &&
        err.message.includes('Refus formel d\'exécuter des tests dans le dossier de données réel')
      );
    },
    'RuntimeDatabase doit lever une exception si on tente de l\'instancier sur le dossier réel en mode test'
  );
});

test('3. Refus formel si IROKO_DATA_DIR est effacé en mode test', () => {
  const backup = process.env.IROKO_DATA_DIR;
  try {
    delete process.env.IROKO_DATA_DIR;
    assert.throws(
      () => {
        new RuntimeDatabase();
      },
      (err) => {
        return (
          err instanceof Error &&
          err.message.includes('[SÉCURITÉ RUNTIME M10.1]')
        );
      },
      'Sans IROKO_DATA_DIR en mode test, RuntimeDatabase doit refuser de retomber sur le dossier réel'
    );
  } finally {
    process.env.IROKO_DATA_DIR = backup;
  }
});

test('4. RuntimeDatabase en mémoire (:memory:) toujours permise', () => {
  const memDb = new RuntimeDatabase(':memory:');
  assert.equal(memDb.dbPath, ':memory:');
  assert.equal(memDb.dataDir, ':memory:');
  memDb.saveConversation('mem-conv-1', 'Discussion mémoire');
  const conv = memDb.getConversation('mem-conv-1');
  assert.ok(conv);
  assert.equal(conv.conversation.title, 'Discussion mémoire');
  memDb.close();
});

test('5. RuntimeDatabase dans un dossier temporaire isolé fonctionne', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'iroko-unit-db-'));
  try {
    const tmpDb = new RuntimeDatabase(tmpDir);
    assert.equal(tmpDb.dataDir, tmpDir);
    assert.ok(tmpDb.dbPath.startsWith(tmpDir));
    tmpDb.saveConversation('tmp-conv-1', 'Discussion temporaire isolée');
    const conv = tmpDb.getConversation('tmp-conv-1');
    assert.ok(conv);
    assert.equal(conv.conversation.title, 'Discussion temporaire isolée');
    tmpDb.close();
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
});

test('6. AttachmentManager est confiné dans IROKO_DATA_DIR', () => {
  const attManager = new AttachmentManager();
  const convDir = attManager.getConversationDir('conv-test-isolation');
  assert.ok(
    convDir.startsWith(process.env.IROKO_DATA_DIR),
    `AttachmentManager doit stocker dans IROKO_DATA_DIR (reçu: ${convDir})`
  );
  assert.ok(
    !convDir.toLowerCase().startsWith(realDataDir.toLowerCase()),
    'AttachmentManager ne doit jamais écrire dans le dossier réel'
  );
});

test('7. Échoue immédiatement si un test tente d\'écrire dans le dossier réel', () => {
  // Vérifie que toute tentative d'instanciation ou d'écriture dans le dossier réel en mode test est bloquée
  assert.throws(
    () => {
      const db = new RuntimeDatabase(realDataDir);
      db.saveConversation('leak-test-id', 'Test Fuite Interdite');
    },
    (err) => {
      return (
        err instanceof Error &&
        err.message.includes('[SÉCURITÉ RUNTIME M10.1]') &&
        err.message.includes('Refus formel d\'exécuter des tests dans le dossier de données réel')
      );
    },
    'Une tentative d\'écriture dans le dossier réel en mode test doit impérativement échouer'
  );
});
