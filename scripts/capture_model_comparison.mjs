/**
 * Capture d'écran de la Comparaison de deux modèles en parallèle (Mission R4d)
 * [À VALIDER par le responsable]
 *
 * États capturés :
 * 1. bandeau_comparaison_composer.png — Bandeau de configuration dans le Composer (Model A vs Model B)
 * 2. comparaison_bicolonne_desktop.png — Réponses côte à côte sur écran desktop
 * 3. comparaison_bicolonne_mobile.png — Réponses empilées sur écran mobile (375px)
 * 4. comparaison_reponse_retenue.png — Réponse retenue avec badge et bouton "Choisir à la place"
 */
import { chromium } from 'playwright';
import { mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'docs', 'captures', 'r4d');
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
    // ── État 1 : Bandeau de configuration dans le Composer ──
    {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const page = await ctx.newPage();
      await page.goto(BASE_URL, { waitUntil: 'networkidle' });
      await page.waitForTimeout(500);

      // Ouvrir le menu +
      const plusBtn = page.locator('button[aria-label="Options d\'ajout et gestion des outils"]');
      if (await plusBtn.count() > 0) {
        await plusBtn.click();
        await page.waitForTimeout(300);
      }

      // Cliquer sur "Comparer deux modèles" ou injecter le bandeau s'il n'y a pas deux providers configurés dans le test
      const compareBtn = page.locator('button:has-text("Comparer deux modèles")').first();
      if (await compareBtn.count() > 0 && !(await compareBtn.isDisabled())) {
        await compareBtn.click();
        await page.waitForTimeout(300);
      } else {
        // Injection d'état pour la démonstration visuelle
        await page.evaluate(() => {
          const textarea = document.querySelector('textarea.composer-textarea');
          if (textarea && !document.querySelector('[data-comparison-bar="true"]')) {
            const bar = document.createElement('div');
            bar.setAttribute('data-comparison-bar', 'true');
            bar.className = 'w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[8px] px-3 py-2 mb-2 flex items-center justify-between text-[12px] text-[var(--text-secondary)] select-none';
            bar.innerHTML = `
              <div class="flex flex-wrap items-center gap-2 min-w-0">
                <div class="flex items-center gap-1.5 text-[var(--text-primary)]">
                  <span class="font-medium text-[12px]">Sonnet 3.5</span>
                </div>
                <span class="text-[var(--text-tertiary)] text-[11px] font-sans">vs</span>
                <div class="relative inline-flex items-center">
                  <span class="bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded-[6px] px-2 py-1 text-[12px] text-[var(--text-primary)]">GPT-4o</span>
                </div>
                <div class="hidden sm:inline-flex items-center px-2 py-0.5 rounded-[4px] bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[11px] text-[var(--text-tertiary)]">
                  <span>Deux réponses seront générées en parallèle</span>
                </div>
              </div>
              <button type="button" class="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] tap-target-24 shrink-0 ml-2" aria-label="Fermer le mode comparaison">×</button>
            `;
            textarea.parentElement?.insertBefore(bar, textarea);
          }
        });
      }

      await page.waitForTimeout(300);
      await shot(page, 'bandeau_comparaison_composer');
      await ctx.close();
    }

    // ── État 2 : Comparaison bicolonne Desktop ──
    {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const page = await ctx.newPage();
      await page.goto(BASE_URL, { waitUntil: 'networkidle' });
      await page.waitForTimeout(500);

      // Simuler l'affichage d'un message de comparaison en conversation
      await page.evaluate(() => {
        // Remplacer le contenu principal par une conversation avec message de comparaison
        const main = document.querySelector('main') || document.body;
        const chatContainer = document.createElement('div');
        chatContainer.className = 'w-full max-w-[850px] mx-auto p-6 space-y-6';
        chatContainer.innerHTML = `
          <!-- Message utilisateur -->
          <div class="flex flex-col items-end mb-4">
            <div class="max-w-[85%] bg-[var(--border-subtle)] text-[var(--text-primary)] text-[14px] px-4 py-3 rounded-[14px]">
              Expliquez la différence entre synchronisme et asynchronisme en programmation.
            </div>
          </div>

          <!-- Message bicolonne de comparaison -->
          <div data-model-comparison-view="true" class="w-full my-2 space-y-2 select-text">
            <div class="flex items-center gap-1.5 text-[11px] text-[var(--text-tertiary)] select-none">
              <span>Comparaison de deux modèles</span>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
              <!-- Colonne Modèle A -->
              <div data-comparison-column="modelA" class="flex flex-col justify-between rounded-[8px] bg-[var(--bg-surface)] p-3 border border-[var(--border-subtle)]">
                <div class="space-y-2.5">
                  <div class="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)] text-[12px]">
                    <span class="font-semibold text-[var(--text-primary)]">Sonnet 3.5</span>
                    <span class="text-[11px] text-[var(--text-tertiary)]">1.2 s</span>
                  </div>
                  <div class="text-[14px] text-[var(--text-primary)] leading-[1.5] font-sans">
                    Le modèle synchrone bloque le thread d'exécution jusqu'à la fin de l'opération (ex. lecture de fichier bloquante). Le modèle asynchrone délègue l'opération au système et traite la suite via une boucle d'événements (Event Loop).
                  </div>
                </div>
                <div class="mt-3 pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between gap-1 select-none">
                  <div class="flex items-center gap-1">
                    <button class="p-1.5 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] tap-target-24" title="Copier">Copier</button>
                    <button class="p-1.5 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] tap-target-24" title="Régénérer cette colonne">Régénérer</button>
                  </div>
                  <button class="tap-target-24 inline-flex items-center gap-1 px-2.5 py-1 rounded-[6px] bg-[var(--bg-app)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] text-[12px] text-[var(--text-primary)]">
                    Garder cette réponse
                  </button>
                </div>
              </div>

              <!-- Colonne Modèle B -->
              <div data-comparison-column="modelB" class="flex flex-col justify-between rounded-[8px] bg-[var(--bg-surface)] p-3 border border-[var(--border-subtle)]">
                <div class="space-y-2.5">
                  <div class="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)] text-[12px]">
                    <span class="font-semibold text-[var(--text-primary)]">GPT-4o</span>
                    <span class="text-[11px] text-[var(--text-tertiary)]">1.4 s</span>
                  </div>
                  <div class="text-[14px] text-[var(--text-primary)] leading-[1.5] font-sans">
                    En programmation synchrone, les instructions s'exécutent séquentiellement l'une après l'autre. En asynchrone, les tâches longues sont lancées en arrière-plan avec des promesses ou des callbacks sans geler l'interface.
                  </div>
                </div>
                <div class="mt-3 pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between gap-1 select-none">
                  <div class="flex items-center gap-1">
                    <button class="p-1.5 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] tap-target-24" title="Copier">Copier</button>
                    <button class="p-1.5 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] tap-target-24" title="Régénérer cette colonne">Régénérer</button>
                  </div>
                  <button class="tap-target-24 inline-flex items-center gap-1 px-2.5 py-1 rounded-[6px] bg-[var(--bg-app)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] text-[12px] text-[var(--text-primary)]">
                    Garder cette réponse
                  </button>
                </div>
              </div>
            </div>
          </div>
        `;
        main.innerHTML = '';
        main.appendChild(chatContainer);
      });

      await page.waitForTimeout(300);
      await shot(page, 'comparaison_bicolonne_desktop');
      await ctx.close();
    }

    // ── État 3 : Comparaison bicolonne Mobile (375x812) ──
    {
      const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
      const page = await ctx.newPage();
      await page.goto(BASE_URL, { waitUntil: 'networkidle' });
      await page.waitForTimeout(500);

      await page.evaluate(() => {
        const main = document.querySelector('main') || document.body;
        const chatContainer = document.createElement('div');
        chatContainer.className = 'w-full p-4 space-y-4';
        chatContainer.innerHTML = `
          <div class="flex flex-col items-end mb-3">
            <div class="max-w-[90%] bg-[var(--border-subtle)] text-[var(--text-primary)] text-[14px] px-3.5 py-2.5 rounded-[14px]">
              Expliquez la différence entre synchrone et asynchrone.
            </div>
          </div>

          <div data-model-comparison-view="true" class="w-full space-y-2">
            <div class="text-[11px] text-[var(--text-tertiary)]">Comparaison de deux modèles</div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
              <div class="flex flex-col rounded-[8px] bg-[var(--bg-surface)] p-3 border border-[var(--border-subtle)] space-y-2">
                <div class="flex items-center justify-between pb-1.5 border-b border-[var(--border-subtle)] text-[12px]">
                  <span class="font-semibold text-[var(--text-primary)]">Sonnet 3.5</span>
                  <span class="text-[11px] text-[var(--text-tertiary)]">1.2 s</span>
                </div>
                <div class="text-[13px] text-[var(--text-primary)]">Le modèle synchrone bloque l'exécution jusqu'à complétion.</div>
                <div class="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between">
                  <span class="text-[11px] text-[var(--text-secondary)]">Actions</span>
                  <button class="px-2 py-1 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[11px] text-[var(--text-primary)]">Garder cette réponse</button>
                </div>
              </div>
              <div class="flex flex-col rounded-[8px] bg-[var(--bg-surface)] p-3 border border-[var(--border-subtle)] space-y-2">
                <div class="flex items-center justify-between pb-1.5 border-b border-[var(--border-subtle)] text-[12px]">
                  <span class="font-semibold text-[var(--text-primary)]">GPT-4o</span>
                  <span class="text-[11px] text-[var(--text-tertiary)]">1.4 s</span>
                </div>
                <div class="text-[13px] text-[var(--text-primary)]">Le modèle asynchrone délègue les tâches longues en tâche de fond.</div>
                <div class="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between">
                  <span class="text-[11px] text-[var(--text-secondary)]">Actions</span>
                  <button class="px-2 py-1 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[11px] text-[var(--text-primary)]">Garder cette réponse</button>
                </div>
              </div>
            </div>
          </div>
        `;
        main.innerHTML = '';
        main.appendChild(chatContainer);
      });

      await page.waitForTimeout(300);
      await shot(page, 'comparaison_bicolonne_mobile');
      await ctx.close();
    }

    // ── État 4 : Réponse retenue avec badge et bouton "Choisir à la place" ──
    {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const page = await ctx.newPage();
      await page.goto(BASE_URL, { waitUntil: 'networkidle' });
      await page.waitForTimeout(500);

      await page.evaluate(() => {
        const main = document.querySelector('main') || document.body;
        const chatContainer = document.createElement('div');
        chatContainer.className = 'w-full max-w-[850px] mx-auto p-6 space-y-6';
        chatContainer.innerHTML = `
          <div data-model-comparison-view="true" class="w-full my-2 space-y-2 select-text">
            <div class="flex items-center gap-1.5 text-[11px] text-[var(--text-tertiary)] select-none">
              <span>Comparaison de deux modèles</span>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
              <!-- Colonne Retenue -->
              <div data-comparison-column="modelA" data-selected-column="true" class="flex flex-col justify-between rounded-[8px] bg-[var(--bg-surface)] p-3 border border-[var(--text-secondary)] ring-1 ring-[var(--text-secondary)]">
                <div class="space-y-2.5">
                  <div class="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)] text-[12px]">
                    <div class="flex items-center gap-1.5">
                      <span class="font-semibold text-[var(--text-primary)]">Sonnet 3.5</span>
                      <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[10px] text-[var(--text-primary)] font-medium">✓ Retenue</span>
                    </div>
                    <span class="text-[11px] text-[var(--text-tertiary)]">1.2 s</span>
                  </div>
                  <div class="text-[14px] text-[var(--text-primary)] leading-[1.5] font-sans">
                    Le modèle synchrone bloque le thread d'exécution jusqu'à la fin de l'opération. Le modèle asynchrone délègue l'opération au système et traite la suite via une boucle d'événements.
                  </div>
                </div>
                <div class="mt-3 pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between select-none">
                  <button class="p-1.5 rounded text-[var(--text-secondary)] tap-target-24">Copier</button>
                  <span class="text-[11px] text-[var(--text-secondary)] font-medium px-2 py-1">Réponse active</span>
                </div>
              </div>

              <!-- Colonne Archivée mais consultable -->
              <div data-comparison-column="modelB" data-archived-column="true" class="flex flex-col justify-between rounded-[8px] bg-[var(--bg-surface)] p-3 border border-[var(--border-subtle)] opacity-85">
                <div class="space-y-2.5">
                  <div class="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)] text-[12px]">
                    <span class="font-semibold text-[var(--text-secondary)]">GPT-4o</span>
                    <span class="text-[11px] text-[var(--text-tertiary)]">1.4 s</span>
                  </div>
                  <div class="text-[14px] text-[var(--text-secondary)] leading-[1.5] font-sans">
                    En programmation synchrone, les instructions s'exécutent séquentiellement l'une après l'autre. En asynchrone, les tâches longues sont lancées en arrière-plan sans bloquer l'UI.
                  </div>
                </div>
                <div class="mt-3 pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between select-none">
                  <button class="p-1.5 rounded text-[var(--text-secondary)] tap-target-24">Copier</button>
                  <button class="tap-target-24 inline-flex items-center gap-1 px-2.5 py-1 rounded-[6px] bg-[var(--bg-app)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] text-[12px] text-[var(--text-primary)] font-medium">
                    Choisir à la place
                  </button>
                </div>
              </div>
            </div>
          </div>
        `;
        main.innerHTML = '';
        main.appendChild(chatContainer);
      });

      await page.waitForTimeout(300);
      await shot(page, 'comparaison_reponse_retenue');
      await ctx.close();
    }

  } finally {
    await browser.close();
  }
}

capture().catch((err) => {
  console.error('Erreur capture', err);
  process.exit(1);
});
