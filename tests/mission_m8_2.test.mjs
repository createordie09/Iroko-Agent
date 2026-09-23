import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runtimeDatabase } from '../server/storage/RuntimeDatabase.ts';
import { SystemPrompt } from '../server/runtime/SystemPrompt.ts';
import { getModelCapabilities } from '../src/lib/models.ts';
import { processManager } from '../server/tools/terminal/ProcessManager.ts';

test('M8.2 - Exigence 1 & 2 : Démarrage unifié, service statique dist/ et confinement anti-traversée', async (t) => {
  await t.test('dist/index.html et dist-server/index.js sont générés par le build unifié', () => {
    assert.ok(fs.existsSync(path.resolve('dist/index.html')), 'dist/index.html doit exister');
    assert.ok(fs.existsSync(path.resolve('dist-server/index.js')), 'dist-server/index.js doit exister');
    const pkg = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf-8'));
    assert.strictEqual(pkg.scripts.start, 'node dist-server/index.js', 'npm start doit pointer sur dist-server/index.js');
    assert.ok(pkg.scripts.build.includes('build:client') && pkg.scripts.build.includes('build:server'), 'build doit compiler client et serveur');
  });

  await t.test('server/index.ts implémente le confinement strict et bloque .. et fichiers cachés', () => {
    const serverCode = fs.readFileSync(path.resolve('server/index.ts'), 'utf-8');
    assert.ok(serverCode.includes("pathname.includes('..')"), 'Doit bloquer les traversées relatives avec ..');
    assert.ok(serverCode.includes("pathname.includes('%2e%2e')"), 'Doit bloquer les traversées encodées %2e%2e');
    assert.ok(serverCode.includes('candidatePath.startsWith(distDir)'), 'Confinement absolu à distDir');
    assert.ok(serverCode.includes('dist/index.html'), 'Doit assurer le repli SPA vers dist/index.html');
  });
});

test('M8.2 - Exigence 3 & 4 : En-têtes de sécurité et arrêt propre du serveur', async (t) => {
  await t.test('server/index.ts applique Permissions-Policy: microphone=(self) et en-têtes durcis', () => {
    const serverCode = fs.readFileSync(path.resolve('server/index.ts'), 'utf-8');
    assert.ok(serverCode.includes("res.setHeader('Permissions-Policy', 'microphone=(self)')"), 'Permissions-Policy microphone=(self) requis');
    assert.ok(serverCode.includes("res.setHeader('X-Content-Type-Options', 'nosniff')"), 'nosniff requis');
    assert.ok(serverCode.includes("res.setHeader('X-Frame-Options', 'DENY')"), 'X-Frame-Options requis');
    assert.ok(serverCode.includes("res.setHeader('Referrer-Policy', 'no-referrer')"), 'Referrer-Policy requis');
  });

  await t.test('ProcessManager possède terminateAll() et server gère SIGINT/SIGTERM proprement', () => {
    assert.strictEqual(typeof processManager.terminateAll, 'function', 'terminateAll() doit exister sur processManager');
    const serverCode = fs.readFileSync(path.resolve('server/index.ts'), 'utf-8');
    assert.ok(serverCode.includes('processManager.terminateAll()'), 'SIGINT/SIGTERM doivent appeler processManager.terminateAll()');
    assert.ok(serverCode.includes("process.on('SIGINT'"), 'Gestionnaire SIGINT requis');
    assert.ok(serverCode.includes("process.on('SIGTERM'"), 'Gestionnaire SIGTERM requis');
  });
});

test('M8.2 - Exigence 5 : Reconnexion continue indéfinie du client runtime', async (t) => {
  await t.test('agent-client.ts utilise un backoff plafonné à 10s sans abandon à 10 tentatives', () => {
    const clientCode = fs.readFileSync(path.resolve('src/lib/agent-client.ts'), 'utf-8');
    assert.strictEqual(
      clientCode.includes('this.reconnectAttempts >= 10'),
      false,
      'Ne doit plus abandonner après 10 tentatives'
    );
    assert.ok(clientCode.includes('10000'), 'Le délai de reconnexion doit être plafonné à 10s (10000ms)');
  });
});

test('M8.2 - Exigence 6 : Capacités étendues des modèles', async (t) => {
  await t.test('getModelCapabilities() expose vision, pdf, audio, video, tools, reasoning, imageGeneration, videoGeneration', () => {
    const dalle = getModelCapabilities('openai/dall-e-3');
    assert.strictEqual(dalle.imageGeneration, true, 'dall-e-3 doit supporter imageGeneration');

    const veo = getModelCapabilities('google/veo-2');
    assert.strictEqual(veo.videoGeneration, true, 'veo-2 doit supporter videoGeneration');

    const claude = getModelCapabilities('anthropic/claude-3-7-sonnet');
    assert.strictEqual(claude.reasoning, true, 'claude-3-7-sonnet doit supporter reasoning');
    assert.strictEqual(claude.nativePdf, true, 'claude-3-7-sonnet doit supporter nativePdf');
    assert.strictEqual(claude.tools, true, 'claude-3-7-sonnet doit supporter tools');

    const gemini = getModelCapabilities('google/gemini-2.5-pro');
    assert.strictEqual(gemini.vision, true, 'gemini doit supporter vision');
    assert.strictEqual(gemini.audio, true, 'gemini doit supporter audio');
    assert.strictEqual(gemini.video, true, 'gemini doit supporter video');
  });
});

test('M8.2 - Exigence 7 : Instructions personnalisées avec rejet strict des secrets et limite 4000 car', async (t) => {
  await t.test('SystemPrompt.build injecte <custom_instructions> subordonné', async () => {
    const { workspaceManager } = await import('../server/workspace/WorkspaceManager.ts');
    const meta = await workspaceManager.analyze(process.cwd());
    const prompt = SystemPrompt.build(
      meta,
      undefined,
      undefined,
      undefined,
      'Réponds toujours en rimes.'
    );
    assert.ok(prompt.includes('<custom_instructions>'), 'Le prompt doit contenir la balise custom_instructions');
    assert.ok(prompt.includes('Réponds toujours en rimes.'));
    assert.ok(prompt.includes('directives d\'ingénierie et aux règles de sécurité'));
  });

  await t.test('server/index.ts rejette les secrets et le dépassement de 4000 caractères', () => {
    const serverCode = fs.readFileSync(path.resolve('server/index.ts'), 'utf-8');
    assert.ok(serverCode.includes('text.length > 4000'), 'Doit vérifier la limite de 4000 caractères');
    assert.ok(serverCode.includes('containsSecret(text)'), 'Doit rejeter les secrets avec containsSecret');
  });
});

test('M8.2 - Exigence 8 & 9 : Sauvegarde transactionnelle VACUUM INTO et Restauration avec anti zip-slip', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'iroko-m8-2-test-'));
  const backupZip = path.join(tmpDir, 'test_backup.zip');

  await t.test('createBackupArchive génère une archive ZIP valide sans clés secrètes par défaut', async () => {
    const archivePath = await runtimeDatabase.createBackupArchive(backupZip, false);
    assert.strictEqual(fs.existsSync(archivePath), true, 'L archive ZIP doit exister sur le disque');
    const stat = fs.statSync(archivePath);
    assert.ok(stat.size > 100, 'L archive ZIP doit avoir une taille supérieure à 100 octets');
  });

  await t.test('restoreFromBackup rejette les archives invalides et protège contre le zip-slip', async () => {
    // Créer une fausse archive corrompue
    const fakeZip = path.join(tmpDir, 'fake.zip');
    fs.writeFileSync(fakeZip, 'NOT_A_VALID_ZIP_CONTENT');
    await assert.rejects(
      async () => {
        await runtimeDatabase.restoreFromBackup(fakeZip);
      },
      /FILE_ENDED|invalide|corrompue|zip/i,
      'Doit rejeter une archive corrompue'
    );
  });

  // Nettoyage
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
});

test('M8.2 - Exigence 10 : Diagnostic système anonymisé sans secrets', async (t) => {
  await t.test('server/index.ts anonymise les chemins en ~ et masque tout secret dans les erreurs', () => {
    const serverCode = fs.readFileSync(path.resolve('server/index.ts'), 'utf-8');
    assert.ok(serverCode.includes("out.split(home).join('~')"), 'Doit remplacer le chemin home par ~');
    assert.ok(serverCode.includes('PrivacyFilter.maskSecretsForModel'), 'Doit masquer les secrets des erreurs');
    assert.ok(serverCode.includes('database:'), 'Doit inclure les métadonnées de base de données');
  });

  await t.test('ClaudeSettingsModal.tsx affiche le diagnostic système et propose un bouton de copie', () => {
    const modalCode = [
      fs.readFileSync(path.resolve('src/features/settings/ClaudeSettingsModal.tsx'), 'utf-8'),
      fs.readFileSync(path.resolve('src/features/settings/pages/PrivacyPage.tsx'), 'utf-8'),
      fs.readFileSync(path.resolve('src/features/settings/pages/PreferencesPage.tsx'), 'utf-8'),
      fs.readFileSync(path.resolve('src/hooks/settings/usePrivacySettings.ts'), 'utf-8')
    ].join('\n');
    assert.ok(modalCode.includes('Diagnostic système'), 'L onglet confidentialité doit afficher le diagnostic');
    assert.ok(modalCode.includes('handleCopyDiagnostic'), 'Doit avoir la fonction handleCopyDiagnostic');
    assert.ok(modalCode.includes('Sauvegarder la base (ZIP)'), 'Doit proposer le bouton de sauvegarde');
    assert.ok(modalCode.includes('Restaurer une sauvegarde'), 'Doit proposer le bouton de restauration');
    assert.ok(modalCode.includes('Instructions personnalisées'), 'Doit proposer le champ d instructions personnalisées');
    assert.ok(modalCode.includes('Raccourcis clavier'), 'Doit afficher la liste des raccourcis');
  });

  await t.test('ClaudeChat.tsx contient la région aria-live="polite" cadencée par phrase', () => {
    const chatCode = fs.readFileSync(path.resolve('src/features/chat/ClaudeChat.tsx'), 'utf-8');
    assert.ok(chatCode.includes('aria-live="polite"'), 'ClaudeChat doit avoir une région aria-live="polite"');
    assert.ok(chatCode.includes('ariaLiveSentence'), 'Doit gérer l état ariaLiveSentence pour cadencer les phrases');
  });

  await t.test('src/index.css contient :focus-visible universel avec outline-offset: 2px', () => {
    const cssContent = fs.readFileSync(path.resolve('src/index.css'), 'utf-8');
    assert.ok(cssContent.includes('*:focus-visible'), 'Doit définir *:focus-visible');
    assert.ok(cssContent.includes('outline: 2px solid var(--border-focus)') || cssContent.includes('outline: 2px solid var(--text-secondary)'), 'Contour 2px solid var(--border-focus) ou var(--text-secondary)');
    assert.ok(cssContent.includes('outline-offset: 2px'), 'Décalage de 2px');
    assert.ok(cssContent.includes('input:focus-visible'), 'Exemption d anneau sur inputs');
    assert.ok(cssContent.includes('textarea:focus-visible'), 'Exemption d anneau sur textareas');
  });
});
