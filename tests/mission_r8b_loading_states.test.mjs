// tests/mission_r8b_loading_states.test.mjs
// Suite de tests automatisés Mission R8b :
// Vérifie l'unification et la conformité des états de chargement dans l'application :
// 1. Détection des zones d'attente de contenu (doivent comporter animate-pulse).
// 2. Vérification des boutons d'action (doivent être disabled avec ellipse typographique '…').
// 3. Audit statique du code source src/ pour proscrire les ellipses ASCII '...' dans les labels de chargement.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// ─────────────────────────────────────────────────────────────────────────────
// Serveur HTML de test — maquette des états de chargement
// ─────────────────────────────────────────────────────────────────────────────
const HTML_TEST = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Test États de Chargement</title>
  <style>
    .animate-pulse { animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }
  </style>
</head>
<body style="background:#151515; color:#ededeb; font-family:sans-serif;">
  <!-- État 1 : Zone de chargement harmonisée (ArtifactCard flux vidéo) -->
  <div id="video-loading" class="animate-pulse">Chargement du flux vidéo sécurisé…</div>

  <!-- État 2 : Zone de chargement harmonisée (ArtifactInspector contenu) -->
  <div id="content-loading" class="animate-pulse">Chargement du contenu…</div>

  <!-- État 3 : Zone de chargement harmonisée (ChatInspectorPanel aperçu) -->
  <div id="preview-loading" class="animate-pulse">Chargement de l'aperçu…</div>

  <!-- État 4 : Zone de chargement harmonisée (PrivacyPage diagnostic) -->
  <div id="diag-loading" class="animate-pulse">Chargement du diagnostic…</div>

  <!-- État 5 : Bouton d'action en cours (PreferencesPage) -->
  <button id="btn-save" type="button" disabled>Enregistrement…</button>

  <!-- État 6 : Bouton d'action en cours (ProvidersPage) -->
  <button id="btn-refresh" type="button" disabled>Actualisation…</button>

  <!-- État 7 : Violation artificielle pour le test de détection -->
  <div id="bad-loading" class="static-text">Chargement du contenu...</div>
</body>
</html>`;

describe('MISSION R8b : Unification des états de chargement', () => {
  let server;
  let port;
  let browser;
  let page;

  before(async () => {
    server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(HTML_TEST);
    });

    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        port = server.address().port;
        resolve();
      });
    });

    browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext();
    page = await ctx.newPage();
    await page.goto(`http://127.0.0.1:${port}`);
  });

  after(async () => {
    if (page) await page.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  // ── Test 1 : Les zones de chargement harmonisées utilisent bien animate-pulse ─
  test('Zones de contenu : les 4 zones harmonisées possèdent la classe animate-pulse', async () => {
    const ids = ['video-loading', 'content-loading', 'preview-loading', 'diag-loading'];
    for (const id of ids) {
      const hasPulse = await page.$eval(`#${id}`, el => el.classList.contains('animate-pulse'));
      assert.strictEqual(hasPulse, true, `L'élément #${id} doit comporter animate-pulse`);
      const text = await page.$eval(`#${id}`, el => el.textContent.trim());
      assert.ok(text.endsWith('…'), `Le texte de #${id} ("${text}") doit se terminer par une ellipse typographique '…'`);
    }
  });

  // ── Test 2 : Les boutons d'action en chargement sont disabled avec '…' ─
  test('Boutons d\'action : désactivés et formatés avec ellipse typographique', async () => {
    const btnIds = ['btn-save', 'btn-refresh'];
    for (const id of btnIds) {
      const isDisabled = await page.$eval(`#${id}`, el => el.disabled);
      assert.strictEqual(isDisabled, true, `Le bouton #${id} doit être désactivé pendant l'action`);
      const text = await page.$eval(`#${id}`, el => el.textContent.trim());
      assert.ok(text.endsWith('…'), `Le texte du bouton #${id} ("${text}") doit se terminer par '…'`);
    }
  });

  // ── Test 3 : Détecteur de non-conformité — repère un état statique avec '...' ─
  test('Détection d\'anomalie : un état sans animate-pulse ou avec trois points est identifié', async () => {
    const isBad = await page.$eval('#bad-loading', el => {
      const hasPulse = el.classList.contains('animate-pulse');
      const hasAsciiDots = el.textContent.includes('...');
      return !hasPulse || hasAsciiDots;
    });
    assert.strictEqual(isBad, true, 'L\'élément non harmonisé #bad-loading doit être détecté comme non conforme');
  });

  // ── Test 4 : Audit statique du code source de production ─
  test('Audit statique : absence de points ASCII (...) dans les labels de chargement sous src/', () => {
    const filesToCheck = [
      'src/features/chat/ArtifactCard.tsx',
      'src/features/chat/ArtifactInspector.tsx',
      'src/features/chat/ChatInspectorPanel.tsx',
      'src/features/settings/pages/PrivacyPage.tsx',
      'src/features/settings/pages/PreferencesPage.tsx',
      'src/features/settings/pages/ProvidersPage.tsx',
      'src/features/settings/pages/ManageModelsSection.tsx'
    ];

    const forbiddenPatterns = [
      /Chargement\.\.\./,
      /Enregistrement\.\.\./,
      /Actualisation\.\.\./,
      /Sauvegarde\.\.\./
    ];

    for (const relPath of filesToCheck) {
      const fullPath = path.join(rootDir, relPath);
      assert.ok(fs.existsSync(fullPath), `Le fichier source ${relPath} doit exister`);
      const content = fs.readFileSync(fullPath, 'utf8');

      for (const pattern of forbiddenPatterns) {
        const match = content.match(pattern);
        assert.strictEqual(
          match,
          null,
          `Violation trouvée dans ${relPath} : "${match?.[0]}" (doit utiliser l'ellipse typographique '…')`
        );
      }
    }
  });

  // ── Test 5 : Vérification de la présence d'animate-pulse dans les fichiers sources cibles ─
  test('Audit statique : présence d\'animate-pulse dans les 4 zones harmonisées', () => {
    const checks = [
      { file: 'src/features/chat/ArtifactCard.tsx', expectedText: 'Chargement du flux vidéo sécurisé…' },
      { file: 'src/features/chat/ArtifactInspector.tsx', expectedText: 'Chargement du contenu…' },
      { file: 'src/features/chat/ChatInspectorPanel.tsx', expectedText: 'Chargement de l\'aperçu…' },
      { file: 'src/features/settings/pages/PrivacyPage.tsx', expectedText: 'Chargement du diagnostic…' }
    ];

    for (const { file, expectedText } of checks) {
      const fullPath = path.join(rootDir, file);
      const content = fs.readFileSync(fullPath, 'utf8');
      assert.ok(
        content.includes(expectedText),
        `${file} doit contenir le texte harmonisé "${expectedText}"`
      );
      assert.ok(
        content.includes('animate-pulse'),
        `${file} doit inclure la classe CSS "animate-pulse"`
      );
    }
  });
});
