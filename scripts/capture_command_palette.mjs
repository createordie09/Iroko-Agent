/**
 * Capture de la Palette de Commandes Universelle (Mission R4a)
 * [À VALIDER par le responsable]
 *
 * États capturés :
 * 1. palette_fermee — accueil normal (Ctrl+K pas encore pressé)
 * 2. palette_ouverte_vide — palette ouverte, aucune frappe
 * 3. palette_filtree — palette filtrée avec la requête "param"
 * 4. palette_discussions — palette avec résultats de discussions (requête "test")
 * 5. palette_375px — palette sur mobile 375px
 * 6. palette_clair — palette en thème clair
 */
import { chromium } from 'playwright';
import { mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'docs', 'captures', 'r4a');

mkdirSync(OUT_DIR, { recursive: true });

const BASE_URL = 'http://127.0.0.1:5173';

async function capture() {
  const browser = await chromium.launch({ headless: true });
  const errors = [];

  async function shot(page, name) {
    const path = join(OUT_DIR, `${name}.png`);
    await page.screenshot({ path, fullPage: false });
    console.log(`[OK] ${name}.png`);
    return path;
  }

  try {
    // ── État 1 : Interface normale (palette fermée) ──
    {
      const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
      const page = await ctx.newPage();
      await page.goto(BASE_URL, { waitUntil: 'networkidle' });
      await page.waitForTimeout(800);
      await shot(page, '1_palette_fermee');
      await ctx.close();
    }

    // ── État 2 : Palette ouverte vide ──
    {
      const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
      const page = await ctx.newPage();
      await page.goto(BASE_URL, { waitUntil: 'networkidle' });
      await page.waitForTimeout(600);
      // Ouvrir la palette via Ctrl+K
      await page.keyboard.press('Control+k');
      await page.waitForTimeout(400);
      await shot(page, '2_palette_ouverte_vide');
      await ctx.close();
    }

    // ── État 3 : Palette filtrée "param" ──
    {
      const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
      const page = await ctx.newPage();
      await page.goto(BASE_URL, { waitUntil: 'networkidle' });
      await page.waitForTimeout(600);
      await page.keyboard.press('Control+k');
      await page.waitForTimeout(300);
      await page.keyboard.type('param');
      await page.waitForTimeout(400);
      await shot(page, '3_palette_filtree_param');
      await ctx.close();
    }

    // ── État 4 : Navigation clavier (item actif descendu de 2 crans) ──
    {
      const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
      const page = await ctx.newPage();
      await page.goto(BASE_URL, { waitUntil: 'networkidle' });
      await page.waitForTimeout(600);
      await page.keyboard.press('Control+k');
      await page.waitForTimeout(300);
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(200);
      await shot(page, '4_palette_navigation_clavier');
      await ctx.close();
    }

    // ── État 5 : Palette 375px (mobile) ──
    {
      const ctx = await browser.newContext({ viewport: { width: 375, height: 667 } });
      const page = await ctx.newPage();
      await page.goto(BASE_URL, { waitUntil: 'networkidle' });
      await page.waitForTimeout(600);
      await page.keyboard.press('Control+k');
      await page.waitForTimeout(400);
      await shot(page, '5_palette_375px_mobile');
      await ctx.close();
    }

    // ── État 6 : Palette thème clair ──
    {
      const ctx = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        colorScheme: 'light'
      });
      const page = await ctx.newPage();
      // Forcer thème clair via localStorage
      await page.addInitScript(() => {
        localStorage.setItem('iroko_settings', JSON.stringify({ theme: 'light' }));
      });
      await page.goto(BASE_URL, { waitUntil: 'networkidle' });
      await page.waitForTimeout(600);
      await page.keyboard.press('Control+k');
      await page.waitForTimeout(400);
      await shot(page, '6_palette_theme_clair');
      await ctx.close();
    }

    console.log(`\n✅ 6 captures enregistrées dans : ${OUT_DIR}`);

  } catch (e) {
    console.error('Erreur lors de la capture :', e.message);
    errors.push(e.message);
  } finally {
    await browser.close();
  }

  if (errors.length > 0) {
    process.exit(1);
  }
}

capture();
