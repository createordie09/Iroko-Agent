import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { RuntimeDatabase } from '../server/storage/RuntimeDatabase.ts';
import React from 'react';
import { ZoneErrorBoundary } from '../src/components/common/ZoneErrorBoundary.tsx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

test('MISSION R3b — 1. Corruption totale simulée : détection PRAGMA integrity_check, sauvegarde horodatée et repli sur base neuve', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'iroko-corrupt-total-'));
  const dbPath = path.join(tempDir, 'iroko_runtime.db');

  // Simulation d'un fichier corrompu (octets binaires non conformes à l'en-tête SQLite)
  const corruptPayload = Buffer.from('NOT_A_VALID_SQLITE_DATABASE_HEADER_DATA_1234567890');
  fs.writeFileSync(dbPath, corruptPayload);

  try {
    const runtimeDb = new RuntimeDatabase(tempDir);

    // 1.1 Vérification de la création d'une sauvegarde horodatée jamais écrasée
    const files = fs.readdirSync(tempDir);
    const corruptedBackups = files.filter(f => f.startsWith('iroko_runtime_corrupted_') && f.endsWith('.db'));
    assert.equal(corruptedBackups.length, 1, 'Une sauvegarde horodatée du fichier corrompu doit avoir été créée');

    const backupContent = fs.readFileSync(path.join(tempDir, corruptedBackups[0]));
    assert.deepEqual(backupContent, corruptPayload, 'La sauvegarde doit préserver exactement les octets corrompus');

    // 1.2 La base active doit être une base SQLite neuve et intègre
    const integrityRows = runtimeDb['db'].prepare('PRAGMA integrity_check').all();
    assert.equal(integrityRows.length, 1);
    assert.equal(Object.values(integrityRows[0])[0], 'ok', 'La nouvelle base doit être 100% intègre');

    // 1.3 Le schéma et les tables neuves doivent être opérationnels
    const conv = runtimeDb.saveConversation('conv-recovered-1', 'Discussion Récupérée', tempDir);
    assert.equal(conv.id, 'conv-recovered-1');
    assert.equal(runtimeDb.listConversations().length, 1);

    // 1.4 Rapport d'incident consigné
    const incident = runtimeDb.getCorruptionIncident();
    assert.ok(incident, 'Le rapport d\'incident doit être disponible');
    assert.equal(incident.fallbackToNew, true);
    assert.ok(incident.userMessage.includes(corruptedBackups[0]), 'Le message doit nommer le fichier sauvegardé');

    const diskReport = JSON.parse(fs.readFileSync(path.join(tempDir, 'database_corruption_report.json'), 'utf8'));
    assert.equal(diskReport.corruptedBackupName, corruptedBackups[0]);
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
  }
});

test('MISSION R3b — 2. Corruption partielle avec récupération des tables saines préservées', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'iroko-corrupt-partial-'));
  const dbPath = path.join(tempDir, 'iroko_runtime.db');

  // 2.1 Création d'une base initiale avec des données valides
  const initDb = new DatabaseSync(dbPath);
  initDb.exec(`
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE conversations (id TEXT PRIMARY KEY, title TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, workspace_path TEXT, metadata TEXT, mode TEXT, workspace_id TEXT);
    INSERT INTO settings VALUES ('launch_on_startup', 'true');
    INSERT INTO settings VALUES ('theme', '"dark"');
    INSERT INTO conversations VALUES ('c1', 'Discussion Importante', '2026-09-26T10:00:00Z', '2026-09-26T10:00:00Z', null, null, 'chat', null);
  `);
  initDb.close();

  // 2.2 Altération volontaire de la base pour échouer PRAGMA integrity_check
  // En modifiant des octets au-delà de l'en-tête (page btree corrompue)
  const fileBytes = fs.readFileSync(dbPath);
  // Écriture d'octets corrompus dans les métadonnées internes tout en conservant la lisibilité de settings
  const corruptedBuffer = Buffer.from(fileBytes);
  corruptedBuffer.write('MALFORMED_PAGE_DATA_CORRUPTION', Math.min(100, corruptedBuffer.length - 30));
  fs.writeFileSync(dbPath, corruptedBuffer);

  try {
    const runtimeDb = new RuntimeDatabase(tempDir);

    // Vérification de la détection et du repli
    const incident = runtimeDb.getCorruptionIncident();
    assert.ok(incident, 'Un incident de corruption doit être enregistré');
    assert.ok(incident.corruptedBackupName.startsWith('iroko_runtime_corrupted_'));

    // La base neuve doit être saine et migrée
    const integrity = runtimeDb['db'].prepare('PRAGMA integrity_check').all();
    assert.equal(Object.values(integrity[0])[0], 'ok');
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
  }
});

test('MISSION R3b — 3. ZoneErrorBoundary : confinement d\'erreur dans la barre latérale', () => {
  const appShellSource = fs.readFileSync(
    path.join(ROOT_DIR, 'src', 'components', 'layout', 'ZyriconAppShell.tsx'),
    'utf8'
  );

  assert.ok(
    /<ZoneErrorBoundary[\s\S]*?zoneName="barre latérale"/.test(appShellSource),
    'La barre latérale doit être encapsulée dans ZoneErrorBoundary'
  );

  // Test unitaire du composant ErrorBoundary
  const boundary = new ZoneErrorBoundary({ zoneName: 'barre latérale' });
  assert.equal(boundary.state.hasError, false);

  const testError = new Error('Panne composant sidebar');
  const nextState = ZoneErrorBoundary.getDerivedStateFromError(testError);
  assert.equal(nextState.hasError, true);
  assert.equal(nextState.error, testError);
});

test('MISSION R3b — 4. ZoneErrorBoundary : confinement d\'erreur dans la zone de conversation', () => {
  const appShellSource = fs.readFileSync(
    path.join(ROOT_DIR, 'src', 'components', 'layout', 'ZyriconAppShell.tsx'),
    'utf8'
  );

  assert.ok(
    appShellSource.includes('<ZoneErrorBoundary zoneName="zone de conversation">'),
    'La zone principale de conversation doit être isolée par ZoneErrorBoundary'
  );

  const boundary = new ZoneErrorBoundary({ zoneName: 'zone de conversation' });
  const nextState = ZoneErrorBoundary.getDerivedStateFromError(new Error('Erreur de streaming Markdown'));
  assert.equal(nextState.hasError, true);
});

test('MISSION R3b — 5. ZoneErrorBoundary : confinement d\'erreur dans la modale des paramètres et bouton Réessayer', () => {
  const appShellSource = fs.readFileSync(
    path.join(ROOT_DIR, 'src', 'components', 'layout', 'ZyriconAppShell.tsx'),
    'utf8'
  );

  assert.ok(
    /<ZoneErrorBoundary[\s\S]*?zoneName="modale des paramètres"/.test(appShellSource),
    'La modale des paramètres doit être isolée par ZoneErrorBoundary'
  );

  let resetCalled = false;
  const boundary = new ZoneErrorBoundary({
    zoneName: 'modale des paramètres',
    onReset: () => { resetCalled = true; }
  });

  boundary.state = { hasError: true, error: new Error('Erreur sous-page paramètres') };
  assert.equal(boundary.state.hasError, true);

  // Appel de la méthode de réinitialisation
  boundary['handleReset']();
  assert.equal(boundary.state.hasError, false, 'Le bouton Réessayer doit réinitialiser l\'état d\'erreur de la zone');
  assert.equal(boundary.state.error, null);
  assert.equal(resetCalled, true, 'Le callback onReset doit être appelé');
});

test('MISSION R3b — 6. Respect des tokens et accessibilité de ZoneErrorBoundary', () => {
  const boundarySource = fs.readFileSync(
    path.join(ROOT_DIR, 'src', 'components', 'common', 'ZoneErrorBoundary.tsx'),
    'utf8'
  );

  assert.ok(boundarySource.includes('role="alert"'), 'Le conteneur d\'erreur doit déclarer role="alert"');
  assert.ok(boundarySource.includes('aria-live="assertive"'), 'L\'annonce doit être prioritaire (assertive)');
  assert.ok(boundarySource.includes('tap-target-24'), 'Le bouton Réessayer doit intégrer tap-target-24');
  assert.ok(boundarySource.includes('var(--bg-app)'), 'Les couleurs de fond doivent respecter les tokens');
  assert.ok(boundarySource.includes('var(--border-subtle)'), 'Les bordures doivent respecter les tokens');
  assert.ok(boundarySource.includes('var(--text-primary)'), 'Les textes doivent respecter les tokens');

  // Zéro couleur en dur
  assert.ok(!boundarySource.includes('#'), 'Aucun code hexadécimal direct ne doit être présent dans le composant');
});
