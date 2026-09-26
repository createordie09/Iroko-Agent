/**
 * Capture d'écran de l'Épinglage des discussions (Mission R4e)
 * [À VALIDER par le responsable]
 *
 * États capturés :
 * 1. epinglage_section_absente_etat_neuf.png — Section Épinglés totalement absente lorsqu'aucune discussion n'est épinglée
 * 2. epinglage_menu_action.png — Menu « … » d'une discussion affichant l'action sobre "Épingler"
 * 3. epinglage_section_visible_avec_epingles.png — Section "Épinglés" affichée en tête avec ses discussions et icône Pin
 * 4. epinglage_menu_desepingler_et_ordre.png — Menu « … » d'un élément épinglé avec "Désépingler", "Monter", "Descendre"
 * 5. epinglage_mobile_375px.png — Vue mobile (375px) avec tiroir ouvert affichant la section Épinglés
 */
import { chromium } from 'playwright';
import { mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'docs', 'captures', 'r4e');
const ARTIFACTS_DIR = 'C:\\Users\\DELL\\.gemini\\antigravity\\brain\\d7d76e62-85aa-46ae-912e-623108e41281';

mkdirSync(OUT_DIR, { recursive: true });

const BASE_URL = 'http://127.0.0.1:5173';

async function capture() {
  const browser = await chromium.launch({ headless: true });

  async function shot(page, name) {
    const filePath = join(OUT_DIR, `${name}.png`);
    await page.screenshot({ path: filePath, fullPage: false });
    console.log(`[OK] ${name}.png`);
    try {
      copyFileSync(filePath, join(ARTIFACTS_DIR, `${name}.png`));
    } catch {}
    return filePath;
  }

  try {
    // ── État 1 : Section Épinglés totalement absente (0 épinglé) ──
    {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const page = await ctx.newPage();

      // Intercepter /api/conversations pour simuler 3 discussions non-épinglées
      await page.route('**/api/conversations', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            conversations: [
              { id: 'c1', title: 'Refonte de l\'interface 2026', mode: 'chat', updated_at: new Date(Date.now() - 3600000).toISOString(), is_pinned: 0 },
              { id: 'c2', title: 'Audit des performances SQLite', mode: 'code', updated_at: new Date(Date.now() - 7200000).toISOString(), is_pinned: 0 },
              { id: 'c3', title: 'Notes de réunion technique', mode: 'chat', updated_at: new Date(Date.now() - 86400000).toISOString(), is_pinned: 0 }
            ]
          })
        });
      });

      await page.goto(BASE_URL, { waitUntil: 'networkidle' });
      await page.waitForTimeout(600);

      await shot(page, 'epinglage_section_absente_etat_neuf');
      await ctx.close();
    }

    // ── État 2 : Menu « … » ouvert avec l'action "Épingler" ──
    {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const page = await ctx.newPage();

      await page.route('**/api/conversations', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            conversations: [
              { id: 'c1', title: 'Refonte de l\'interface 2026', mode: 'chat', updated_at: new Date(Date.now() - 3600000).toISOString(), is_pinned: 0 },
              { id: 'c2', title: 'Audit des performances SQLite', mode: 'code', updated_at: new Date(Date.now() - 7200000).toISOString(), is_pinned: 0 }
            ]
          })
        });
      });

      await page.goto(BASE_URL, { waitUntil: 'networkidle' });
      await page.waitForTimeout(600);

      // Survoler le premier élément pour faire apparaître les actions
      const firstItem = page.locator('aside nav button[aria-label^="Refonte"]').first();
      await firstItem.hover();
      await page.waitForTimeout(200);

      // Cliquer sur le menu "…"
      const menuBtn = page.locator('aside nav button[aria-label="Options de la discussion"]').first();
      if (await menuBtn.count() > 0) {
        await menuBtn.click();
        await page.waitForTimeout(300);
      }

      await shot(page, 'epinglage_menu_action');
      await ctx.close();
    }

    // ── État 3 : Section Épinglés visible avec 2 discussions épinglées ──
    {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const page = await ctx.newPage();

      await page.route('**/api/conversations', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            conversations: [
              { id: 'p1', title: 'Roadmap Prioritaire Q3', mode: 'chat', updated_at: new Date(Date.now() - 1000).toISOString(), is_pinned: 1, pinned_at: new Date(Date.now() - 1000).toISOString(), pinned_order: 1 },
              { id: 'p2', title: 'Architecture Moteur Agent', mode: 'code', updated_at: new Date(Date.now() - 2000).toISOString(), is_pinned: 1, pinned_at: new Date(Date.now() - 2000).toISOString(), pinned_order: 2 },
              { id: 'c1', title: 'Refonte de l\'interface 2026', mode: 'chat', updated_at: new Date(Date.now() - 3600000).toISOString(), is_pinned: 0 },
              { id: 'c2', title: 'Audit des performances SQLite', mode: 'code', updated_at: new Date(Date.now() - 7200000).toISOString(), is_pinned: 0 }
            ]
          })
        });
      });

      await page.goto(BASE_URL, { waitUntil: 'networkidle' });
      await page.waitForTimeout(600);

      await shot(page, 'epinglage_section_visible_avec_epingles');
      await ctx.close();
    }

    // ── État 4 : Menu « … » sur une discussion épinglée (Désépingler, Monter, Descendre) ──
    {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const page = await ctx.newPage();

      await page.route('**/api/conversations', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            conversations: [
              { id: 'p1', title: 'Roadmap Prioritaire Q3', mode: 'chat', updated_at: new Date(Date.now() - 1000).toISOString(), is_pinned: 1, pinned_at: new Date(Date.now() - 1000).toISOString(), pinned_order: 1 },
              { id: 'p2', title: 'Architecture Moteur Agent', mode: 'code', updated_at: new Date(Date.now() - 2000).toISOString(), is_pinned: 1, pinned_at: new Date(Date.now() - 2000).toISOString(), pinned_order: 2 },
              { id: 'c1', title: 'Refonte de l\'interface 2026', mode: 'chat', updated_at: new Date(Date.now() - 3600000).toISOString(), is_pinned: 0 }
            ]
          })
        });
      });

      await page.goto(BASE_URL, { waitUntil: 'networkidle' });
      await page.waitForTimeout(600);

      // Survoler le premier élément de la section épinglée
      const pinnedSection = page.locator('aside nav div[data-section="pinned"]');
      const firstPinned = pinnedSection.locator('button[aria-label^="Roadmap"]').first();
      await firstPinned.hover();
      await page.waitForTimeout(200);

      // Ouvrir le menu "…"
      const menuBtn = pinnedSection.locator('button[aria-label="Options de la discussion"]').first();
      if (await menuBtn.count() > 0) {
        await menuBtn.click();
        await page.waitForTimeout(300);
      }

      await shot(page, 'epinglage_menu_desepingler_et_ordre');
      await ctx.close();
    }

    // ── État 5 : Rendu mobile 375px avec tiroir ouvert ──
    {
      const ctx = await browser.newContext({
        viewport: { width: 375, height: 667 },
        hasTouch: true,
        isMobile: true
      });
      const page = await ctx.newPage();

      await page.route('**/api/conversations', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            conversations: [
              { id: 'p1', title: 'Roadmap Prioritaire Q3', mode: 'chat', updated_at: new Date(Date.now() - 1000).toISOString(), is_pinned: 1, pinned_at: new Date(Date.now() - 1000).toISOString(), pinned_order: 1 },
              { id: 'c1', title: 'Refonte de l\'interface 2026', mode: 'chat', updated_at: new Date(Date.now() - 3600000).toISOString(), is_pinned: 0 }
            ]
          })
        });
      });

      await page.goto(BASE_URL, { waitUntil: 'networkidle' });
      await page.waitForTimeout(500);

      // Ouvrir le tiroir mobile
      const drawerBtn = page.locator('button[aria-label="Ouvrir le menu"]').first();
      if (await drawerBtn.count() > 0) {
        await drawerBtn.click();
        await page.waitForTimeout(500);
      }

      await shot(page, 'epinglage_mobile_375px');
      await ctx.close();
    }

    console.log('--- Toutes les captures d\'écran de la Mission R4e ont été générées avec succès ---');
  } finally {
    await browser.close();
  }
}

capture().catch(err => {
  console.error('[ERREUR] Échec de la génération des captures :', err);
  process.exit(1);
});
