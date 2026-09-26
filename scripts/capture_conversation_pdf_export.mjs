/**
 * scripts/capture_conversation_pdf_export.mjs
 * Captures d'écran de l'Exportation PDF d'une conversation (Mission R4g)
 * [À VALIDER par le responsable]
 *
 * 1. export_pdf_menu_desktop.png — Menu d'export "…" ouvert affichant "Exporter en PDF (.pdf)"
 * 2. export_pdf_menu_mobile_375px.png — Vue mobile 375px avec le menu d'export adapté
 * 3. export_pdf_limite_depassee.png — Message d'alerte sobre en cas de dépassement de quota
 */
import { chromium } from 'playwright';
import { mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'docs', 'captures', 'r4g');
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
    // ── 1. Desktop : Menu d'export ouvert dans ClaudeTopbar ──
    {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor: 1
      });
      const page = await context.newPage();

      await page.route('**/api/conversations', async route => {
        if (route.request().method() === 'GET') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              conversations: [
                {
                  id: 'conv-demo-1',
                  title: 'Architecture du runtime Iroko & Sécurité',
                  topic: 'Architecture du runtime Iroko & Sécurité',
                  created_at: new Date().toISOString()
                }
              ]
            })
          });
        }
        return route.continue();
      });

      await page.route('**/api/conversations/conv-demo-1', async route => {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            conversation: {
              id: 'conv-demo-1',
              title: 'Architecture du runtime Iroko & Sécurité',
              topic: 'Architecture du runtime Iroko & Sécurité',
              created_at: new Date().toISOString()
            },
            messages: [
              { id: 'm1', role: 'user', content: 'Bonjour, comment fonctionne l\'export PDF ?' },
              { id: 'm2', role: 'assistant', content: 'L\'export PDF utilise pdf-lib pour générer un document sobre sans couleur d\'accent.' }
            ]
          })
        });
      });

      await page.goto(BASE_URL, { waitUntil: 'networkidle' });
      await page.waitForTimeout(500);

      // Cliquer sur la discussion dans la barre latérale pour l'ouvrir
      const convLink = page.locator('text=Architecture du runtime Iroko & Sécurité');
      if (await convLink.isVisible()) {
        await convLink.click();
        await page.waitForTimeout(500);
      }

      // Ouvrir le menu "…"
      const exportBtn = page.locator('button[title="Options d\'export"]');
      if (await exportBtn.isVisible()) {
        await exportBtn.click();
        await page.waitForTimeout(300);
      }

      await shot(page, 'export_pdf_menu_desktop');
      await context.close();
    }

    // ── 2. Mobile 375px : Menu d'export ──
    {
      const context = await browser.newContext({
        viewport: { width: 375, height: 667 },
        deviceScaleFactor: 1
      });
      const page = await context.newPage();

      await page.route('**/api/conversations', async route => {
        if (route.request().method() === 'GET') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              conversations: [
                {
                  id: 'conv-demo-mob',
                  title: 'Discussion mobile',
                  topic: 'Discussion mobile',
                  created_at: new Date().toISOString()
                }
              ]
            })
          });
        }
        return route.continue();
      });

      await page.route('**/api/conversations/conv-demo-mob', async route => {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            conversation: {
              id: 'conv-demo-mob',
              title: 'Discussion mobile',
              topic: 'Discussion mobile',
              created_at: new Date().toISOString()
            },
            messages: [
              { id: 'm1', role: 'user', content: 'Test mobile export PDF' },
              { id: 'm2', role: 'assistant', content: 'Affichage responsive confirmé.' }
            ]
          })
        });
      });

      await page.goto(BASE_URL, { waitUntil: 'networkidle' });
      await page.waitForTimeout(500);

      // Ouvrir le tiroir mobile
      const drawerBtn = page.locator('button[title="Ouvrir le menu"]');
      if (await drawerBtn.isVisible()) {
        await drawerBtn.click();
        await page.waitForTimeout(400);

        // Cliquer sur la discussion dans le tiroir
        const convLink = page.locator('text=Discussion mobile');
        if (await convLink.isVisible()) {
          await convLink.click();
          await page.waitForTimeout(500);
        }
      }

      // Ouvrir le menu d'export
      const exportBtn = page.locator('button[title="Options d\'export"]');
      if (await exportBtn.isVisible()) {
        await exportBtn.click();
        await page.waitForTimeout(300);
      }

      await shot(page, 'export_pdf_menu_mobile_375px');
      await context.close();
    }

    // ── 3. Desktop : Message de limite dépassée dans le menu ──
    {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor: 1
      });
      const page = await context.newPage();

      await page.route('**/api/conversations', async route => {
        if (route.request().method() === 'GET') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              conversations: [
                {
                  id: 'conv-demo-limit',
                  title: 'Discussion volumineuse',
                  topic: 'Discussion volumineuse',
                  created_at: new Date().toISOString()
                }
              ]
            })
          });
        }
        return route.continue();
      });

      await page.route('**/api/conversations/conv-demo-limit', async route => {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            conversation: {
              id: 'conv-demo-limit',
              title: 'Discussion volumineuse',
              topic: 'Discussion volumineuse',
              created_at: new Date().toISOString()
            },
            messages: [
              { id: 'm1', role: 'user', content: 'Message test' },
              { id: 'm2', role: 'assistant', content: 'Réponse volumineuse' }
            ]
          })
        });
      });

      // Intercepter l'export PDF pour simuler le dépassement de limite
      await page.route('**/api/conversations/export-pdf', async route => {
        return route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'La discussion est trop volumineuse pour un export PDF (120 messages). La limite maximale est de 100 messages. Veuillez utiliser l\'export Markdown ou JSON.'
          })
        });
      });

      await page.goto(BASE_URL, { waitUntil: 'networkidle' });
      await page.waitForTimeout(500);

      const convLink = page.locator('text=Discussion volumineuse');
      if (await convLink.isVisible()) {
        await convLink.click();
        await page.waitForTimeout(500);
      }

      const exportBtn = page.locator('button[title="Options d\'export"]');
      if (await exportBtn.isVisible()) {
        await exportBtn.click();
        await page.waitForTimeout(300);

        const pdfBtn = page.locator('button:has-text("Exporter en PDF")');
        if (await pdfBtn.isVisible()) {
          await pdfBtn.click();
          await page.waitForTimeout(400);
        }
      }

      await shot(page, 'export_pdf_limite_depassee');
      await context.close();
    }

  } finally {
    await browser.close();
  }
}

capture().catch(err => {
  console.error('Erreur lors de la capture :', err);
  process.exit(1);
});
