// tests/mission_r4f_share_skills.test.mjs
// Mission R4f : Partager une compétence entre collaborateurs (Export & Import ZIP sécurisé)

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import JSZip from 'jszip';

const { SkillScanner } = await import('../server/skills/SkillScanner.ts');
const { SkillArchiveManager } = await import('../server/skills/SkillArchiveManager.ts');
const { SkillManager, skillManager } = await import('../server/skills/SkillManager.ts');
const { runtimeDatabase } = await import('../server/storage/RuntimeDatabase.ts');

function createTempDir(prefix = 'iroko-skill-r4f-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('Mission R4f - 1. Export d\'une compétence importée sous forme d\'archive .zip complète', async () => {
  const tempDir = createTempDir();
  try {
    // 1. Créer une compétence complète avec références, scripts et assets
    const skillMd = path.join(tempDir, 'SKILL.md');
    fs.writeFileSync(skillMd, `---
name: exportable-skill
description: Compétence complète pour test d'exportation.
license: MIT
compatibility: node>=20
metadata:
  version: 1.2.0
---
# Instructions
Pour exporter et partager, consultez guide.md.
`, 'utf-8');

    const refsDir = path.join(tempDir, 'references');
    fs.mkdirSync(refsDir, { recursive: true });
    fs.writeFileSync(path.join(refsDir, 'guide.md'), 'Guide de référence pour la compétence.', 'utf-8');

    const scriptsDir = path.join(tempDir, 'scripts');
    fs.mkdirSync(scriptsDir, { recursive: true });
    fs.writeFileSync(path.join(scriptsDir, 'run.py'), 'print("ok")', 'utf-8');

    const assetsDir = path.join(tempDir, 'assets');
    fs.mkdirSync(assetsDir, { recursive: true });
    fs.writeFileSync(path.join(assetsDir, 'icon.svg'), '<svg></svg>', 'utf-8');

    // 2. Enregistrer en base
    runtimeDatabase.saveSkill({
      name: 'exportable-skill',
      description: 'Compétence complète pour test d\'exportation.',
      dirPath: tempDir,
      instructions: '# Instructions\nPour exporter et partager, consultez guide.md.',
      enabled: true,
      isSystem: false,
      metadata: { version: '1.2.0' }
    });

    // 3. Exporter via SkillManager
    const exported = await skillManager.exportSkill('exportable-skill');
    assert.equal(exported.filename, 'exportable-skill.zip');
    assert.ok(exported.buffer instanceof Buffer);
    assert.ok(exported.buffer.length > 0);

    // 4. Inspecter l'archive avec JSZip
    const zip = await JSZip.loadAsync(exported.buffer);
    const files = Object.keys(zip.files);

    assert.ok(files.includes('SKILL.md'), 'SKILL.md doit être présent à la racine du zip');
    assert.ok(files.includes('references/guide.md'), 'references/guide.md doit être inclus');
    assert.ok(files.includes('scripts/run.py'), 'scripts/run.py doit être inclus');
    assert.ok(files.includes('assets/icon.svg'), 'assets/icon.svg doit être inclus');

    const readSkillMd = await zip.file('SKILL.md').async('string');
    assert.ok(readSkillMd.includes('name: exportable-skill'));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('Mission R4f - 2. Refus formel d\'exporter une compétence système', async () => {
  const tempDir = createTempDir();
  try {
    const skillMd = path.join(tempDir, 'SKILL.md');
    fs.writeFileSync(skillMd, `---
name: docx-system-export-test
description: Compétence système de test.
---
Instructions système.
`, 'utf-8');

    runtimeDatabase.saveSkill({
      name: 'docx-system-export-test',
      description: 'Compétence système de test.',
      dirPath: tempDir,
      instructions: 'Instructions système.',
      enabled: true,
      isSystem: true
    });

    await assert.rejects(
      async () => {
        await skillManager.exportSkill('docx-system-export-test');
      },
      /Impossible d'exporter la compétence système/i
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('Mission R4f - 3. Export puis réimport d\'une même compétence produit un résultat identique', async () => {
  const originDir = createTempDir('origin-');
  const tempZipFile = path.join(os.tmpdir(), `exported_skill_${Date.now()}.zip`);

  try {
    // 1. Préparation de la compétence initiale
    const skillMd = path.join(originDir, 'SKILL.md');
    fs.writeFileSync(skillMd, `---
name: roundtrip-skill
description: Compétence pour test aller-retour export/réimport.
license: Apache-2.0
metadata:
  tag: roundtrip
---
Instructions complètes pour roundtrip. Voir ref.txt.
`, 'utf-8');

    const refsDir = path.join(originDir, 'references');
    fs.mkdirSync(refsDir, { recursive: true });
    fs.writeFileSync(path.join(refsDir, 'ref.txt'), 'Référence critique pour le test.', 'utf-8');

    const originSkill = await skillManager.importSkillFromDirectory(originDir, { isSystem: false });
    assert.equal(originSkill.name, 'roundtrip-skill');

    // 2. Exportation vers fichier .zip
    const exported = await skillManager.exportSkill('roundtrip-skill');
    fs.writeFileSync(tempZipFile, exported.buffer);
    assert.ok(fs.existsSync(tempZipFile));

    // 3. Réimportation depuis le fichier .zip
    const reimported = await skillManager.importSkillFromDirectory(tempZipFile);

    assert.equal(reimported.name, originSkill.name);
    assert.equal(reimported.description, originSkill.description);
    assert.equal(reimported.instructions, originSkill.instructions);
    assert.equal(reimported.isSystem, false);
    assert.equal(reimported.enabled, false, 'Compétence réimportée désactivée par défaut avant confirmation');
    assert.ok(reimported.scanReport, 'Le scan de sécurité doit être généré à la réimportation');

    // 4. Vérifier que les fichiers sont restaurés sur le disque
    const reimportedSkill = skillManager.getSkill('roundtrip-skill');
    assert.ok(reimportedSkill);
    const restoredSkillMd = path.join(reimportedSkill.dirPath, 'SKILL.md');
    const restoredRef = path.join(reimportedSkill.dirPath, 'references', 'ref.txt');

    assert.ok(fs.existsSync(restoredSkillMd), 'SKILL.md restauré');
    assert.ok(fs.existsSync(restoredRef), 'Fichier de référence restauré');
    assert.equal(fs.readFileSync(restoredRef, 'utf-8'), 'Référence critique pour le test.');
  } finally {
    fs.rmSync(originDir, { recursive: true, force: true });
    try { fs.unlinkSync(tempZipFile); } catch {}
  }
});

test('Mission R4f - 4. Archive piégée (Zip-Slip) catégoriquement refusée', async () => {
  const zip = new JSZip();
  // Injection de traversée de chemin dans le zip
  zip.file('../../malicious_payload.txt', 'Contenu malveillant tentant de s\'échapper du dossier');
  zip.file('SKILL.md', `---
name: evil-slip-skill
description: Compétence avec zip slip.
---
Instructions evil.
`);

  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
  const tempSkillsDir = createTempDir('skills-dest-');

  try {
    await assert.rejects(
      async () => {
        await SkillArchiveManager.importSkillFromZip(zipBuffer, tempSkillsDir);
      },
      /traversée de répertoire zip-slip/i
    );

    // Vérifier qu'aucun fichier n'a fuité hors du dossier
    const parentDir = path.dirname(tempSkillsDir);
    assert.equal(fs.existsSync(path.join(parentDir, 'malicious_payload.txt')), false);
  } finally {
    fs.rmSync(tempSkillsDir, { recursive: true, force: true });
  }
});

test('Mission R4f - 5. Archive sans SKILL.md refusée avec message clair', async () => {
  const zip = new JSZip();
  // Archive avec des scripts et documents mais PAS de SKILL.md
  zip.file('README.md', '# Juste un README sans SKILL.md');
  zip.file('scripts/run.py', 'print("hello")');

  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
  const tempSkillsDir = createTempDir('skills-dest-');

  try {
    await assert.rejects(
      async () => {
        await SkillArchiveManager.importSkillFromZip(zipBuffer, tempSkillsDir);
      },
      /aucun fichier SKILL\.md valide/i
    );
  } finally {
    fs.rmSync(tempSkillsDir, { recursive: true, force: true });
  }
});

test('Mission R4f - 6. Import direct via Buffer (téléversement) et support sous-dossier dans l\'archive', async () => {
  const zip = new JSZip();
  // Simule une archive créée en compressant un dossier parent `mon-pack/`
  zip.file('mon-pack/SKILL.md', `---
name: nested-pack-skill
description: Compétence contenue dans un sous-dossier d'archive.
---
Instructions imbriquées.
`);
  zip.file('mon-pack/references/extra.txt', 'Données utiles.');

  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

  const imported = await skillManager.importSkillFromBuffer(zipBuffer, 'pack.zip');
  assert.equal(imported.name, 'nested-pack-skill');
  assert.equal(imported.enabled, false);

  const found = skillManager.getSkill('nested-pack-skill');
  assert.ok(found);
  assert.ok(fs.existsSync(path.join(found.dirPath, 'SKILL.md')));
  assert.ok(fs.existsSync(path.join(found.dirPath, 'references', 'extra.txt')));
});

test('Mission R4f - 7. Endpoints HTTP GET /api/skills/:name/export et POST /api/skills/import', async () => {
  const bootRes = await fetch('http://127.0.0.1:3001/api/bootstrap', { headers: { 'Host': '127.0.0.1:3001' } });
  const { token } = await bootRes.json();
  const authHeaders = {
    'Authorization': `Bearer ${token}`,
    'X-Iroko-Request': '1',
    'Host': '127.0.0.1:3001'
  };

  const tempDir = createTempDir('api-skill-');
  try {
    fs.writeFileSync(path.join(tempDir, 'SKILL.md'), `---
name: api-export-skill
description: Compétence testée via HTTP.
---
Instructions HTTP.
`, 'utf-8');

    // 1. Enregistrer la compétence sur le serveur via l'API HTTP
    const setupRes = await fetch('http://127.0.0.1:3001/api/skills/import', {
      method: 'POST',
      headers: {
        ...authHeaders,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ dirPath: tempDir })
    });
    assert.equal(setupRes.status, 200);

    // 2. Tester l'export via GET /api/skills/api-export-skill/export
    const exportRes = await fetch('http://127.0.0.1:3001/api/skills/api-export-skill/export', {
      headers: authHeaders
    });
    assert.equal(exportRes.status, 200);
    assert.equal(exportRes.headers.get('content-type'), 'application/zip');
    assert.ok(exportRes.headers.get('content-disposition')?.includes('api-export-skill.zip'));

    const arrayBuf = await exportRes.arrayBuffer();
    const zipBuf = Buffer.from(arrayBuf);
    assert.ok(zipBuf.length > 0);

    // 2. Tester l'import via POST /api/skills/import avec Content-Type: application/zip
    const importRes = await fetch('http://127.0.0.1:3001/api/skills/import', {
      method: 'POST',
      headers: {
        ...authHeaders,
        'Content-Type': 'application/zip',
        'X-Filename': encodeURIComponent('api-export-skill.zip')
      },
      body: zipBuf
    });
    assert.equal(importRes.status, 200);
    const importJson = await importRes.json();
    assert.equal(importJson.success, true);
    assert.equal(importJson.skill.name, 'api-export-skill');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
