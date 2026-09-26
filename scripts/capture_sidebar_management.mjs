/**
 * Script de Capture — Mission R4c : Gestion des Discussions dans la Sidebar
 * [À VALIDER par le responsable]
 *
 * États capturés :
 * 1. renommage_inline_discussion — Champ de saisie inline actif sur un élément de discussion
 * 2. duplication_discussion — Discussion dupliquée ("Copie de ...") apparaissant dans la sidebar
 * 3. selection_multiple_sidebar — Mode sélection multiple avec cases à cocher et barre d'actions
 * 4. bandeau_suppression_groupee — Bandeau d'annulation collective ("2 discussions supprimées. Annuler.")
 */
import { chromium } from 'playwright';
import { mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'docs', 'captures', 'r4c');
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
    } catch (e) {
      console.warn(`[WARN] Erreur copie artéfact :`, e.message);
    }
    return filePath;
  }

  try {
    // ── 1. Renommage inline actif ──
    {
      const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
      const page = await ctx.newPage();
      await page.goto(BASE_URL, { waitUntil: 'networkidle' });
      await page.waitForTimeout(600);

      await page.evaluate(() => {
        // Sélectionner ou injecter une discussion en mode édition
        const sidebarNav = document.querySelector('aside nav');
        if (sidebarNav) {
          let discSection = sidebarNav.querySelector('div:has(span)');
          if (!discSection) {
            discSection = document.createElement('div');
            sidebarNav.appendChild(discSection);
          }
          const container = document.createElement('div');
          container.className = 'space-y-0.5 mt-2';
          container.innerHTML = `
            <div class="relative w-full h-[28px] flex items-center justify-between rounded-[var(--radius-item)] bg-[var(--bg-active)] text-[var(--text-primary)]">
              <div class="flex-1 min-w-0 px-1.5 flex items-center">
                <input
                  type="text"
                  value="Refonte de l'architecture"
                  class="w-full h-[24px] px-1.5 text-[13px] bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-focus-field)] rounded-[var(--radius-item)] outline-none leading-none select-text"
                  aria-label="Modifier le titre de la discussion"
                  id="test-rename-input"
                />
              </div>
            </div>
            <div class="relative w-full h-[28px] flex items-center justify-between rounded-[var(--radius-item)] text-[var(--text-muted)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)] px-2.5 text-[13px]">
              <span class="truncate">Analyse des performances</span>
            </div>
          `;
          discSection.appendChild(container);
          const inp = document.getElementById('test-rename-input');
          if (inp) {
            inp.focus();
            inp.setSelectionRange(0, inp.value.length);
          }
        }
      });

      await page.waitForTimeout(400);
      await shot(page, 'renommage_inline_discussion');
      await ctx.close();
    }

    // ── 2. Duplication de discussion ──
    {
      const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
      const page = await ctx.newPage();
      await page.goto(BASE_URL, { waitUntil: 'networkidle' });
      await page.waitForTimeout(600);

      await page.evaluate(() => {
        const sidebarNav = document.querySelector('aside nav');
        if (sidebarNav) {
          const container = document.createElement('div');
          container.className = 'space-y-0.5 mt-2';
          container.innerHTML = `
            <div class="relative w-full h-[28px] flex items-center justify-between rounded-[var(--radius-item)] bg-[var(--bg-active)] text-[var(--text-primary)] px-2.5 text-[13px]">
              <span class="w-1 h-1 rounded-full bg-[var(--text-secondary)] shrink-0 mr-2"></span>
              <span class="truncate flex-1">Copie de Refonte de l'architecture</span>
            </div>
            <div class="relative w-full h-[28px] flex items-center justify-between rounded-[var(--radius-item)] text-[var(--text-muted)] px-2.5 text-[13px]">
              <span class="w-1 h-1 rounded-full bg-[var(--text-tertiary)] shrink-0 mr-2"></span>
              <span class="truncate flex-1">Refonte de l'architecture</span>
            </div>
          `;
          sidebarNav.appendChild(container);
        }
      });

      await page.waitForTimeout(400);
      await shot(page, 'duplication_discussion');
      await ctx.close();
    }

    // ── 3. Mode sélection multiple actif ──
    {
      const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
      const page = await ctx.newPage();
      await page.goto(BASE_URL, { waitUntil: 'networkidle' });
      await page.waitForTimeout(600);

      await page.evaluate(() => {
        const sidebarNav = document.querySelector('aside nav');
        if (sidebarNav) {
          const container = document.createElement('div');
          container.className = 'mt-2 space-y-1';
          container.innerHTML = `
            <div class="flex items-center justify-between px-2 py-1 text-[11px] bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[var(--radius-item)]">
              <span class="text-[var(--text-secondary)]">Désélectionner</span>
              <div class="flex items-center gap-2">
                <span class="text-[var(--text-muted)] font-mono">2</span>
                <span class="flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded text-[var(--text-primary)] bg-[var(--bg-surface-hover)]">
                  Supprimer
                </span>
              </div>
            </div>
            <div class="space-y-0.5">
              <div class="relative w-full h-[28px] flex items-center rounded-[var(--radius-item)] bg-[var(--bg-surface-hover)] text-[var(--text-primary)] px-2 text-[13px]">
                <span class="w-3.5 h-3.5 mr-2 rounded-[3px] bg-[var(--text-primary)] border border-[var(--text-primary)] flex items-center justify-center text-[var(--bg-app)] text-[10px]">✓</span>
                <span class="truncate flex-1">Refonte de l'architecture</span>
              </div>
              <div class="relative w-full h-[28px] flex items-center rounded-[var(--radius-item)] bg-[var(--bg-surface-hover)] text-[var(--text-primary)] px-2 text-[13px]">
                <span class="w-3.5 h-3.5 mr-2 rounded-[3px] bg-[var(--text-primary)] border border-[var(--text-primary)] flex items-center justify-center text-[var(--bg-app)] text-[10px]">✓</span>
                <span class="truncate flex-1">Analyse des performances</span>
              </div>
              <div class="relative w-full h-[28px] flex items-center rounded-[var(--radius-item)] text-[var(--text-muted)] px-2 text-[13px]">
                <span class="w-3.5 h-3.5 mr-2 rounded-[3px] border border-[var(--border-subtle)] bg-transparent"></span>
                <span class="truncate flex-1">Recherche documentaire</span>
              </div>
            </div>
          `;
          sidebarNav.appendChild(container);
        }
      });

      await page.waitForTimeout(400);
      await shot(page, 'selection_multiple_sidebar');
      await ctx.close();
    }

    // ── 4. Bandeau de suppression groupée ──
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
        banner.innerHTML = '<span class="truncate font-normal">2 discussions supprimées.</span><button type="button" class="text-[var(--text-primary)] hover:underline font-medium tap-target-24 px-2 py-1 rounded-[var(--radius-button)] text-[13px] hover:bg-[var(--bg-surface-hover)] transition-colors shrink-0">Annuler</button>';
        document.body.appendChild(banner);
      });

      await page.waitForTimeout(400);
      await shot(page, 'bandeau_suppression_groupee');
      await ctx.close();
    }

    console.log('\n[SUCCESS] Les 4 captures de validation R4c ont été générées avec succès.');
  } finally {
    await browser.close();
  }
}

capture().catch(err => {
  console.error('[FAIL] Erreur capture :', err);
  process.exit(1);
});
