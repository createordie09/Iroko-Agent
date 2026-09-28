import { chromium } from 'playwright';
import { mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ensureServersRunning } from '../tests/helpers/ensure_servers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'docs', 'captures', 'r8f');
const ARTIFACTS_DIR = 'C:\\Users\\DELL\\.gemini\\antigravity\\brain\\d7d76e62-85aa-46ae-912e-623108e41281';

mkdirSync(OUT_DIR, { recursive: true });

const BASE_URL = 'http://127.0.0.1:5173';

async function capture() {
  await ensureServersRunning();
  const browser = await chromium.launch({ headless: true });

  async function shot(page, name) {
    const filePath = join(OUT_DIR, `${name}.png`);
    await page.screenshot({ path: filePath, fullPage: false, caret: 'hide' });
    console.log(`[OK] ${name}.png`);
    try {
      copyFileSync(filePath, join(ARTIFACTS_DIR, `${name}.png`));
    } catch (e) {
      console.warn(`[WARN] Échec de copie d'artéfact pour ${name}:`, e.message);
    }
    return filePath;
  }

  try {
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const page = await ctx.newPage();
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);

    // Ouvrir les paramètres via le bouton en bas de la sidebar
    const settingsBtn = await page.$('button[title="Paramètres"]');
    if (settingsBtn) {
      await settingsBtn.click();
      await page.waitForSelector('input[aria-label="Rechercher dans les réglages"]', { timeout: 5000 });
      await page.waitForTimeout(400);
    }

    // Liste des 7 onglets à photographier
    const pagesToCapture = [
      { name: 'r8f_page_memoire', label: 'Mémoire' },
      { name: 'r8f_page_reflechir', label: 'Réfléchir' },
      { name: 'r8f_page_capacites', label: 'Capacités' },
      { name: 'r8f_page_confidentialite', label: 'Confidentialité' },
      { name: 'r8f_page_competences', label: 'Compétences' },
      { name: 'r8f_page_connecteurs', label: 'Connecteurs' },
      { name: 'r8f_page_iroko_code', label: 'Iroko Code' }
    ];

    for (const item of pagesToCapture) {
      // Trouver le bouton de l'onglet dans la colonne gauche de la modale
      const tabButton = await page.$(`button:has-text("${item.label}")`);
      if (tabButton) {
        await tabButton.click();
        await page.waitForTimeout(300);
        await shot(page, item.name);
      } else {
        console.warn(`[WARN] Onglet introuvable : ${item.label}`);
      }
    }

    console.log('Toutes les captures R8f ont été réalisées avec succès.');
  } finally {
    await browser.close();
  }
}

capture().catch(err => {
  console.error('[ERROR] Erreur durant la capture R8f:', err);
  process.exit(1);
});
