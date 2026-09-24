// tests/mission_n1_skills_level3.test.mjs
// Cahier §13, §15, Mission N1 : Tests d'Architecture de Compétences Niveau 3, validation et sécurité

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const { SkillScanner } = await import('../server/skills/SkillScanner.ts');
const { SkillManager, skillManager } = await import('../server/skills/SkillManager.ts');
const { ReadFileTool } = await import('../server/tools/filesystem/read_file.ts');
const { RunSkillScriptTool } = await import('../server/tools/skills/run_skill_script.ts');
const { runtimeDatabase } = await import('../server/storage/RuntimeDatabase.ts');

function createTempDir(prefix = 'iroko-skill-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('Mission N1 - 1. Validation frontmatter agentskills.io et rejet "claude"/"anthropic"', () => {
  // 1.1 Valide avec succès
  const valid = SkillScanner.validateFrontmatter({
    name: 'valid-skill-123',
    description: 'Une description concise et valide.',
    license: 'MIT',
    compatibility: '>=1.0.0',
    metadata: { version: '1.0' },
    'allowed-tools': ['read_file', 'execute_command']
  });
  assert.equal(valid.valid, true);
  assert.equal(valid.name, 'valid-skill-123');

  // 1.2 Rejet nom contenant "claude"
  const rejClaude = SkillScanner.validateFrontmatter({
    name: 'my-claude-helper',
    description: 'Aide pour claude.'
  });
  assert.equal(rejClaude.valid, false);
  assert.match(rejClaude.error, /claude|anthropic/i);

  // 1.3 Rejet nom contenant "anthropic"
  const rejAnthropic = SkillScanner.validateFrontmatter({
    name: 'anthropic-tools',
    description: 'Outils Anthropic.'
  });
  assert.equal(rejAnthropic.valid, false);
  assert.match(rejAnthropic.error, /claude|anthropic/i);

  // 1.4 Rejet caractères invalides (majuscules, espaces)
  const rejChars = SkillScanner.validateFrontmatter({
    name: 'Invalid_Skill_Name',
    description: 'Test majuscules.'
  });
  assert.equal(rejChars.valid, false);

  // 1.5 Rejet description vide
  const rejDesc = SkillScanner.validateFrontmatter({
    name: 'valid-name',
    description: '   '
  });
  assert.equal(rejDesc.valid, false);

  // 1.6 Rejet nom > 64 caractères
  const rejLongName = SkillScanner.validateFrontmatter({
    name: 'a'.repeat(65),
    description: 'Description valide.'
  });
  assert.equal(rejLongName.valid, false);
});

test('Mission N1 - 2. Tolérance des champs de harnais tiers et avertissements de taille non bloquants', () => {
  const tempDir = createTempDir();
  try {
    const skillMd = path.join(tempDir, 'SKILL.md');
    // Frontmatter avec champs tiers agentskills.io et corps volumineux
    const longBody = Array.from({ length: 550 }, (_, i) => `Ligne de documentation ${i + 1}`).join('\n');
    const content = `---
name: custom-thirdparty-skill
description: Compétence avec harnais étendu.
license: Apache-2.0
compatibility: node>=20
metadata:
  author: TestDev
  rating: 5
allowed-tools:
  - list_dir
  - run_skill_script
unknown-custom-field: ignored-safely
---
# Guide d'utilisation
${longBody}
`;
    fs.writeFileSync(skillMd, content, 'utf-8');

    const parsed = SkillScanner.parseSkillMd(skillMd, tempDir);
    assert.equal(parsed.name, 'custom-thirdparty-skill');
    assert.equal(parsed.metadata?.license, 'Apache-2.0');
    assert.equal(parsed.metadata?.compatibility, 'node>=20');
    assert.deepEqual(parsed.metadata?.['allowed-tools'], ['list_dir', 'run_skill_script']);
    // Avertissement de taille non bloquant présent (> 500 lignes)
    assert.ok(parsed.warnings.length > 0);
    assert.ok(parsed.warnings.some(w => w.includes('500 lignes')));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('Mission N1 - 3. Scanner de sécurité sur import (détection scripts, URLs, réseau, commandes)', () => {
  const tempDir = createTempDir();
  try {
    const scriptsDir = path.join(tempDir, 'scripts');
    fs.mkdirSync(scriptsDir, { recursive: true });

    // Script python avec appel réseau et exécution de commande
    const scriptPy = path.join(scriptsDir, 'scanner_test.py');
    fs.writeFileSync(scriptPy, `
import os
import requests

def run():
    url = "https://malicious-external-api.example.com/steal"
    res = requests.get(url)
    os.system("echo hacked")
`, 'utf-8');

    const scan = SkillScanner.scanDirectory(tempDir);
    assert.equal(scan.scripts.length, 1);
    assert.equal(scan.scripts[0], 'scripts/scanner_test.py');
    assert.ok(scan.urls.some(u => u.includes('malicious-external-api.example.com')));
    assert.ok(scan.networkCalls.some(n => n.includes('requests')));
    assert.ok(scan.commandExecutions.some(c => c.includes('os.system')));
    assert.equal(scan.hasSuspiciousActivity, true);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('Mission N1 - 4. Import compétence non-système : désactivée par défaut avec rapport de sécurité', async () => {
  const tempDir = createTempDir();
  try {
    const skillMd = path.join(tempDir, 'SKILL.md');
    fs.writeFileSync(skillMd, `---
name: imported-safe-skill
description: Compétence importée sans scripts suspects.
---
Instructions de la compétence sans scripts.
`, 'utf-8');

    const imported = await skillManager.importSkillFromDirectory(tempDir, { isSystem: false });
    assert.equal(imported.name, 'imported-safe-skill');
    assert.equal(imported.enabled, false, 'Une compétence importée doit être désactivée par défaut');
    assert.equal(imported.isSystem, false);
    assert.ok(imported.scanReport);
    assert.equal(imported.scanReport.hasSuspiciousActivity, false);

    // Vérifier en base
    const fromDb = skillManager.getSkill('imported-safe-skill');
    assert.ok(fromDb);
    assert.equal(fromDb.enabled, false);
    assert.equal(fromDb.isSystem, false);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('Mission N1 - 5. Lecture des références (Niveau 3) : référence non citée rejetée, citée acceptée', async () => {
  const tempDir = createTempDir();
  try {
    const refsDir = path.join(tempDir, 'references');
    fs.mkdirSync(refsDir, { recursive: true });

    const citedRef = path.join(refsDir, 'style_guide.md');
    fs.writeFileSync(citedRef, 'Contenu du guide de style officiel.', 'utf-8');

    const secretRef = path.join(refsDir, 'internal_notes.md');
    fs.writeFileSync(secretRef, 'Notes internes confidentielles.', 'utf-8');

    const skillMd = path.join(tempDir, 'SKILL.md');
    fs.writeFileSync(skillMd, `---
name: doc-style-skill
description: Guide de style et documentation.
---
Pour appliquer les règles, consultez obligatoirement style_guide.md.
`, 'utf-8');

    // Sauvegarde en base comme compétence active
    runtimeDatabase.saveSkill({
      name: 'doc-style-skill',
      description: 'Guide de style et documentation.',
      dirPath: tempDir,
      instructions: 'Pour appliquer les règles, consultez obligatoirement style_guide.md.',
      enabled: true,
      isSystem: false
    });

    const readFileTool = new ReadFileTool();
    const mockContext = {
      workspacePath: tempDir,
      sessionId: 'test-sess',
      permissionEngine: {
        requestPermission: async () => true
      },
      emitEvent: () => {}
    };

    // 5.1 Tentative de lire tout le dossier references/ -> Rejeté
    const dirResult = await readFileTool.execute({
      filePath: path.join(tempDir, 'references')
    }, mockContext);
    assert.equal(dirResult.success, false);
    assert.match(dirResult.error, /Lecture du dossier references\/ interdite/i);

    // 5.2 Tentative de lire une référence non citée -> Rejeté
    const uncitedResult = await readFileTool.execute({
      filePath: path.join(tempDir, 'references', 'internal_notes.md')
    }, mockContext);
    assert.equal(uncitedResult.success, false);
    assert.match(uncitedResult.error, /n'est pas citée dans le corps de SKILL\.md/i);

    // 5.3 Lecture d'une référence citée -> Réussi
    const citedResult = await readFileTool.execute({
      filePath: path.join(tempDir, 'references', 'style_guide.md')
    }, mockContext);
    assert.equal(citedResult.success, true);
    assert.ok(citedResult.data.content.includes('Contenu du guide de style officiel.'));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('Mission N1 - 6. Exécution de scripts (Niveau 3) : permission requise pour tiers, exemptée pour système, seul stdout/stderr dans contexte', async () => {
  const tempDir = createTempDir();
  try {
    const scriptsDir = path.join(tempDir, 'scripts');
    fs.mkdirSync(scriptsDir, { recursive: true });

    const testScript = path.join(scriptsDir, 'hello.js');
    const secretCommentInSource = '// SECRET_KEY_IN_SOURCE_CODE_SHOULD_NOT_LEAK';
    fs.writeFileSync(testScript, `
${secretCommentInSource}
console.log("HELLO FROM SKILL SCRIPT STDOUT");
console.error("DEBUG INFO ON STDERR");
process.exit(0);
`, 'utf-8');

    // Sauvegarde d'une compétence tierce
    runtimeDatabase.saveSkill({
      name: 'script-user-skill',
      description: 'Compétence utilisateur avec script.',
      dirPath: tempDir,
      instructions: 'Compétence exécutant hello.js.',
      enabled: true,
      isSystem: false
    });

    const runScriptTool = new RunSkillScriptTool();

    // 6.1 Compétence tierce : permission refusée par l'utilisateur
    let permissionRequested = false;
    let permissionDetails = null;

    const mockDenyContext = {
      workspacePath: tempDir,
      sessionId: 'test-sess',
      permissionEngine: {
        requestPermission: async (tool, level, description, details) => {
          permissionRequested = true;
          permissionDetails = details;
          return false; // refus
        }
      },
      emitEvent: () => {}
    };

    const deniedResult = await runScriptTool.execute({
      competenceId: 'script-user-skill',
      script: 'hello.js'
    }, mockDenyContext);

    assert.equal(permissionRequested, true, 'La compétence tierce doit demander une permission');
    assert.equal(permissionDetails.isSystem, false);
    assert.equal(deniedResult.success, false);
    assert.match(deniedResult.error, /refusée par l'utilisateur/i);

    // 6.2 Compétence tierce : permission accordée -> Exécution et vérification anti-fuite du code source
    const mockApproveContext = {
      workspacePath: tempDir,
      sessionId: 'test-sess',
      permissionEngine: {
        requestPermission: async () => true // accordée
      },
      emitEvent: () => {}
    };

    const allowedResult = await runScriptTool.execute({
      competenceId: 'script-user-skill',
      script: 'hello.js'
    }, mockApproveContext);

    assert.equal(allowedResult.success, true);
    assert.ok(allowedResult.data);
    assert.ok(allowedResult.data.stdout.includes('HELLO FROM SKILL SCRIPT STDOUT'));
    assert.ok(allowedResult.data.stderr.includes('DEBUG INFO ON STDERR'));
    assert.equal(allowedResult.data.exitCode, 0);

    // RÈGLE CRITIQUE : Le code source du script ne doit en aucun cas se trouver dans les données retournées
    const serializedData = JSON.stringify(allowedResult.data);
    assert.equal(
      serializedData.includes('SECRET_KEY_IN_SOURCE_CODE_SHOULD_NOT_LEAK'),
      false,
      'Le code source du script ne doit JAMAIS entrer dans les données de retour ni dans le contexte'
    );

    // 6.3 Compétence système (isSystem === true) : exemptée de demande de permission
    runtimeDatabase.saveSkill({
      name: 'system-official-skill',
      description: 'Compétence système officielle.',
      dirPath: tempDir,
      instructions: 'Compétence système.',
      enabled: true,
      isSystem: true
    });

    let systemPermissionRequested = false;
    const mockSystemContext = {
      workspacePath: tempDir,
      sessionId: 'test-sess',
      permissionEngine: {
        requestPermission: async () => {
          systemPermissionRequested = true;
          return true;
        }
      },
      emitEvent: () => {}
    };

    const systemResult = await runScriptTool.execute({
      competenceId: 'system-official-skill',
      script: 'hello.js'
    }, mockSystemContext);

    assert.equal(systemResult.success, true);
    assert.equal(
      systemPermissionRequested,
      false,
      'Une compétence système doit être exemptée de la demande de permission interactive'
    );
    assert.ok(systemResult.data.stdout.includes('HELLO FROM SKILL SCRIPT STDOUT'));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
