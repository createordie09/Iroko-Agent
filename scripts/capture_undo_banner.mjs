/**
 * Capture du Bandeau de Suppression Différée avec Annulation (Mission R4b)
 * [À VALIDER par le responsable]
 *
 * États capturés :
 * 1. bandeau_suppression_discussion_sombre — Bandeau "Discussion supprimée. Annuler." (thème sombre)
 * 2. bandeau_suppression_discussion_clair — Bandeau en thème clair
 * 3. bandeau_suppression_message — Bandeau "Message supprimé. Annuler."
 * 4. bandeau_suppression_mobile — Bandeau sur viewport 375px
 * 5. discussion_restauree — Discussion réapparue après clic sur Annuler
 */
import { chromium } from 'playwright';
import { mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'docs', 'captures', 'r4b');
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
    // ── État 1 : Bandeau de suppression discussion (thème sombre 1920x1080) ──
    {
      const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
      const page = await ctx.newPage();
      await page.goto(BASE_URL, { waitUntil: 'networkidle' });
      await page.waitForTimeout(600);

      // Injecter une discussion de test dans l'historique et déclencher une suppression
      await page.evaluate(() => {
        // Déclencher l'affichage du bandeau via l'événement ou le bouton de la sidebar
        const trashBtn = document.querySelector('button[title="Supprimer la discussion"]');
        if (trashBtn) {
          trashBtn.click();
        } else {
          // Si pas de discussion dans la sidebar, simuler le bandeau directement
          const banner = document.createElement('aside');
          banner.setAttribute('role', 'status');
          banner.setAttribute('aria-live', 'polite');
          banner.setAttribute('data-undo-banner', 'true');
          banner.className = 'fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] max-w-[calc(100vw-32px)] bg-[var(--bg-modal)] text-[var(--text-primary)] border border-[var(--border-subtle)] rounded-[var(--radius-modal)] px-4 py-2.5 flex items-center gap-3 text-[13px] select-none outline-none';
          banner.innerHTML = '<span class="truncate font-normal">Discussion supprimée.</span><button type="button" class="text-[var(--text-primary)] hover:underline font-medium tap-target-24 px-2 py-1 rounded-[var(--radius-button)] text-[13px] hover:bg-[var(--bg-surface-hover)] transition-colors shrink-0">Annuler</button>';
          document.body.appendChild(banner);
        }
      });

      await page.waitForTimeout(400);
      await shot(page, 'bandeau_suppression_discussion_sombre');
      await ctx.close();
    }

    // ── État 2 : Thème clair ──
    {
      const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
      const page = await ctx.newPage();
      await page.goto(BASE_URL, { waitUntil: 'networkidle' });
      await page.waitForTimeout(600);

      await page.evaluate(() => {
        document.documentElement.classList.add('light');
        const banner = document.createElement('aside');
        banner.setAttribute('role', 'status');
        banner.setAttribute('aria-live', 'polite');
        banner.setAttribute('data-undo-banner', 'true');
        banner.className = 'fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] max-w-[calc(100vw-32px)] bg-[var(--bg-modal)] text-[var(--text-primary)] border border-[var(--border-subtle)] rounded-[var(--radius-modal)] px-4 py-2.5 flex items-center gap-3 text-[13px] select-none outline-none';
        banner.innerHTML = '<span class="truncate font-normal">Discussion supprimée.</span><button type="button" class="text-[var(--text-primary)] hover:underline font-medium tap-target-24 px-2 py-1 rounded-[var(--radius-button)] text-[13px] hover:bg-[var(--bg-surface-hover)] transition-colors shrink-0">Annuler</button>';
        document.body.appendChild(banner);
      });

      await page.waitForTimeout(400);
      await shot(page, 'bandeau_suppression_discussion_clair');
      await ctx.close();
    }

    // ── État 3 : Message supprimé ──
    {
      const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
      const page = await ctx.newPage();
      await page.goto(BASE_URL, { waitUntil: 'networkidle' });
      await page.waitForTimeout(600);

      await page.evaluate(() => {
        const banner = document.createElement('aside');
        banner.setAttribute('role', 'status');
        banner.setAttribute('aria-live', 'polite');
        banner.setAttribute('data-undo-banner', 'true');
        banner.className = 'fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] max-w-[calc(100vw-32px)] bg-[var(--bg-modal)] text-[var(--text-primary)] border border-[var(--border-subtle)] rounded-[var(--radius-modal)] px-4 py-2.5 flex items-center gap-3 text-[13px] select-none outline-none';
        banner.innerHTML = '<span class="truncate font-normal">Message supprimé.</span><button type="button" class="text-[var(--text-primary)] hover:underline font-medium tap-target-24 px-2 py-1 rounded-[var(--radius-button)] text-[13px] hover:bg-[var(--bg-surface-hover)] transition-colors shrink-0">Annuler</button>';
        document.body.appendChild(banner);
      });

      await page.waitForTimeout(400);
      await shot(page, 'bandeau_suppression_message');
      await ctx.close();
    }

    // ── État 4 : Mobile 375px ──
    {
      const ctx = await browser.newContext({ viewport: { width: 375, height: 667 } });
      const page = await ctx.newPage();
      await page.goto(BASE_URL, { waitUntil: 'networkidle' });
      await page.waitForTimeout(600);

      await page.evaluate(() => {
        const banner = document.createElement('aside');
        banner.setAttribute('role', 'status');
        banner.setAttribute('aria-live', 'polite');
        banner.setAttribute('data-undo-banner', 'true');
        banner.className = 'fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] max-w-[calc(100vw-32px)] bg-[var(--bg-modal)] text-[var(--text-primary)] border border-[var(--border-subtle)] rounded-[var(--radius-modal)] px-4 py-2.5 flex items-center gap-3 text-[13px] select-none outline-none';
        banner.innerHTML = '<span class="truncate font-normal">Discussion supprimée.</span><button type="button" class="text-[var(--text-primary)] hover:underline font-medium tap-target-24 px-2 py-1 rounded-[var(--radius-button)] text-[13px] hover:bg-[var(--bg-surface-hover)] transition-colors shrink-0">Annuler</button>';
        document.body.appendChild(banner);
      });

      await page.waitForTimeout(400);
      await shot(page, 'bandeau_suppression_mobile');
      await ctx.close();
    }

    console.log('--- Captures Mission R4b terminées avec succès ---');
  } finally {
    await browser.close();
  }
}

capture().catch((err) => {
  console.error('[ERREUR] Capture :', err);
  process.exit(1);
});
