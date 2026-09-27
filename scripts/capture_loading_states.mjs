/**
 * Capture d'écran des États de Chargement Harmonious (Mission R8b)
 * [À VALIDER par le responsable]
 *
 * États capturés (Avant / Après) :
 * 1. r8b_flux_video_avant.png / r8b_flux_video_apres.png
 * 2. r8b_contenu_artefact_avant.png / r8b_contenu_artefact_apres.png
 * 3. r8b_apercu_piece_jointe_avant.png / r8b_apercu_piece_jointe_apres.png
 * 4. r8b_diagnostic_avant.png / r8b_diagnostic_apres.png
 * 5. r8b_boutons_action_avant.png / r8b_boutons_action_apres.png
 */
import { chromium } from 'playwright';
import { mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'docs', 'captures', 'r8b');
const ARTIFACTS_DIR = 'C:\\Users\\DELL\\.gemini\\antigravity\\brain\\d7d76e62-85aa-46ae-912e-623108e41281';

mkdirSync(OUT_DIR, { recursive: true });

const HTML_PAGE = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Iroko - Captures R8b</title>
  <style>
    :root {
      --bg-app: #151515;
      --bg-surface: #20201f;
      --bg-surface-hover: #262625;
      --bg-active: #2b2a29;
      --bg-modal: #1a1a19;
      --border-subtle: #242423;
      --border-modal: #2d2d2b;
      --text-primary: #ededeb;
      --text-secondary: #bcbab5;
      --text-tertiary: #959390;
      --text-muted: #c4c3be;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg-app);
      color: var(--text-primary);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", sans-serif;
      padding: 32px;
    }
    .card {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 24px;
      max-width: 600px;
    }
    .card-title {
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 8px;
      color: var(--text-primary);
    }
    .card-sub {
      font-size: 12px;
      color: var(--text-secondary);
      margin-bottom: 12px;
    }
    .video-box {
      width: 100%;
      background: var(--bg-app);
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 32px 0;
    }
    .animate-pulse {
      animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: .4; }
    }
    .btn {
      padding: 6px 12px;
      background: var(--bg-surface);
      border: 1px solid var(--border-modal);
      color: var(--text-primary);
      font-size: 12px;
      border-radius: 6px;
      cursor: pointer;
    }
    .btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
    .btn-primary {
      background: var(--text-primary);
      color: var(--bg-app);
      font-weight: 500;
    }
  </style>
</head>
<body>
  <!-- Section 1 : Flux vidéo (ArtifactCard) -->
  <div id="section-video-avant" class="card">
    <div class="card-title">Flux vidéo sécurisé — AVANT (Statique, points ASCII)</div>
    <div class="video-box">
      <div style="font-size:12px; color:var(--text-secondary);">Chargement du flux vidéo sécurisé...</div>
    </div>
  </div>

  <div id="section-video-apres" class="card">
    <div class="card-title">Flux vidéo sécurisé — APRÈS (animate-pulse, ellipse typographique)</div>
    <div class="video-box">
      <div style="font-size:12px; color:var(--text-secondary);" class="animate-pulse">Chargement du flux vidéo sécurisé…</div>
    </div>
  </div>

  <!-- Section 2 : Contenu artéfact (ArtifactInspector) -->
  <div id="section-artefact-avant" class="card">
    <div class="card-title">Contenu artéfact — AVANT (Statique, points ASCII)</div>
    <div style="padding:16px; text-align:center; font-size:13px; color:var(--text-secondary);">
      Chargement du contenu...
    </div>
  </div>

  <div id="section-artefact-apres" class="card">
    <div class="card-title">Contenu artéfact — APRÈS (animate-pulse, ellipse typographique)</div>
    <div style="padding:16px; text-align:center; font-size:13px; color:var(--text-secondary);" class="animate-pulse">
      Chargement du contenu…
    </div>
  </div>

  <!-- Section 3 : Aperçu pièce jointe (ChatInspectorPanel) -->
  <div id="section-apercu-avant" class="card">
    <div class="card-title">Aperçu pièce jointe — AVANT (Statique, points ASCII)</div>
    <div style="padding:16px; text-align:center; font-size:13px; color:var(--text-secondary);">
      Chargement de l'aperçu...
    </div>
  </div>

  <div id="section-apercu-apres" class="card">
    <div class="card-title">Aperçu pièce jointe — APRÈS (animate-pulse, ellipse typographique)</div>
    <div style="padding:16px; text-align:center; font-size:13px; color:var(--text-secondary);" class="animate-pulse">
      Chargement de l'aperçu…
    </div>
  </div>

  <!-- Section 4 : Diagnostic runtime (PrivacyPage) -->
  <div id="section-diag-avant" class="card">
    <div class="card-title">Diagnostic système — AVANT (Statique, points ASCII)</div>
    <div style="background:var(--bg-app); border:1px solid var(--border-modal); border-radius:6px; padding:12px; font-size:12px;">
      <div>Chargement du diagnostic...</div>
    </div>
  </div>

  <div id="section-diag-apres" class="card">
    <div class="card-title">Diagnostic système — APRÈS (animate-pulse, style tokenisé, ellipse)</div>
    <div style="background:var(--bg-app); border:1px solid var(--border-modal); border-radius:6px; padding:12px; font-size:12px;">
      <div style="color:var(--text-secondary);" class="animate-pulse">Chargement du diagnostic…</div>
    </div>
  </div>

  <!-- Section 5 : Boutons d'action (PreferencesPage, ProvidersPage) -->
  <div id="section-boutons-avant" class="card">
    <div class="card-title">Boutons d'action en cours — AVANT (points ASCII)</div>
    <div style="display:flex; gap:12px;">
      <button type="button" class="btn" disabled>Enregistrement...</button>
      <button type="button" class="btn" disabled>Actualisation...</button>
    </div>
  </div>

  <div id="section-boutons-apres" class="card">
    <div class="card-title">Boutons d'action en cours — APRÈS (ellipse typographique unifiée)</div>
    <div style="display:flex; gap:12px;">
      <button type="button" class="btn" disabled>Enregistrement…</button>
      <button type="button" class="btn" disabled>Actualisation…</button>
    </div>
  </div>
</body>
</html>`;

async function main() {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(HTML_PAGE);
  });

  const port = await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${port}`);

  async function shotElement(selector, name) {
    const el = await page.$(selector);
    const filePath = join(OUT_DIR, `${name}.png`);
    await el.screenshot({ path: filePath });
    console.log(`[OK] ${name}.png`);
    try {
      copyFileSync(filePath, join(ARTIFACTS_DIR, `${name}.png`));
    } catch (err) {
      console.warn(`Copy to artifacts skipped: ${err.message}`);
    }
  }

  // Captures comparatives Avant / Après
  await shotElement('#section-video-avant', 'r8b_flux_video_avant');
  await shotElement('#section-video-apres', 'r8b_flux_video_apres');

  await shotElement('#section-artefact-avant', 'r8b_contenu_artefact_avant');
  await shotElement('#section-artefact-apres', 'r8b_contenu_artefact_apres');

  await shotElement('#section-apercu-avant', 'r8b_apercu_piece_jointe_avant');
  await shotElement('#section-apercu-apres', 'r8b_apercu_piece_jointe_apres');

  await shotElement('#section-diag-avant', 'r8b_diagnostic_avant');
  await shotElement('#section-diag-apres', 'r8b_diagnostic_apres');

  await shotElement('#section-boutons-avant', 'r8b_boutons_action_avant');
  await shotElement('#section-boutons-apres', 'r8b_boutons_action_apres');

  // Capture globale de synthèse
  const fullPath = join(OUT_DIR, 'r8b_synthese_etats_chargement.png');
  await page.screenshot({ path: fullPath, fullPage: true });
  console.log('[OK] r8b_synthese_etats_chargement.png');
  try {
    copyFileSync(fullPath, join(ARTIFACTS_DIR, 'r8b_synthese_etats_chargement.png'));
  } catch {}

  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  console.log('--- Toutes les captures R8b ont été générées avec succès ---');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
