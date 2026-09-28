import { chromium } from 'playwright';
import { mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ensureServersRunning } from '../tests/helpers/ensure_servers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'docs', 'captures', 'r8e');
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
    } catch {}
    return filePath;
  }

  try {
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const page = await ctx.newPage();
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);

    // Ouvrir les paramètres via le bouton en bas de la sidebar
    const settingsBtn = await page.$('button[title="Paramètres"]');
    if (settingsBtn) {
      await settingsBtn.click();
      await page.waitForSelector('input[aria-label="Rechercher dans les réglages"]', { timeout: 5000 });
      await page.waitForTimeout(300);
    }

    // 1. Recherche vide (état initial complet)
    await shot(page, 'r8e_parametres_recherche_vide');

    // 2. Recherche d'un terme ne correspondant qu'à une seule page : "thème"
    const searchInput = await page.$('input[aria-label="Rechercher dans les réglages"]');
    if (searchInput) {
      await searchInput.fill('thème');
      await page.waitForTimeout(300);
      await shot(page, 'r8e_parametres_recherche_unique');

      // 3. Recherche sans résultat : "introuvable_xyz"
      await searchInput.fill('introuvable_xyz');
      await page.waitForTimeout(300);
      await shot(page, 'r8e_parametres_recherche_sans_resultat');

      // 4. Clic sur le bouton "Effacer la recherche" pour restaurer la liste complète
      const clearBtn = await page.$('button[aria-label="Effacer la recherche"]');
      if (clearBtn) {
        await clearBtn.click();
      } else {
        const textClearBtn = await page.$('text=Effacer la recherche');
        if (textClearBtn) await textClearBtn.click();
      }
      await page.waitForTimeout(300);
      await shot(page, 'r8e_parametres_recherche_restauree');
    }

    console.log('Toutes les captures de la Mission R8e ont été générées avec succès.');
  } catch (err) {
    console.error('Erreur lors de la capture :', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

capture();
