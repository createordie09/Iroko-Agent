import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ensureServersRunning } from '../tests/helpers/ensure_servers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const validationDir = path.join(rootDir, 'docs', 'audit', 'validation');
const artifactDir = 'C:\\Users\\DELL\\.gemini\\antigravity\\brain\\d7d76e62-85aa-46ae-912e-623108e41281';

if (!fs.existsSync(validationDir)) {
  fs.mkdirSync(validationDir, { recursive: true });
}

(async () => {
  console.log('--- Capture du bloc Diagnostic avec redémarrages Watchdog (Mission R3a) ---');
  await ensureServersRunning();

  let browser;
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
  } catch (e) {
    browser = await chromium.launch({ headless: true });
  }

  const setupRoutes = async (ctx, customRestarts = []) => {
    await ctx.route('**/api/settings', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          settings: {
            theme: 'dark',
            conversationFont: 'sans',
            animations: 'system',
            onboarding_completed: true
          }
        })
      })
    );
    await ctx.route('**/api/conversations', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ conversations: [] })
      })
    );
    await ctx.route('**/api/projects', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ projects: [] })
      })
    );
    await ctx.route('**/api/diagnostic', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          appVersion: '1.0.0',
          nodeVersion: 'v20.18.0',
          platform: 'win32 x64 (10.0.22631)',
          runtimePort: 3001,
          database: { sizeBytes: 131072, schemaVersion: 13 },
          connectedProviders: ['Anthropic', 'OpenAI'],
          mcpServers: [],
          recentErrors: [],
          dataDir: '~/.iroko',
          restarts: customRestarts
        })
      })
    );
    await ctx.route('**/api/privacy/storage-breakdown', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          totalBytes: 250000,
          categories: [
            { category: 'attachments', label: 'Pièces jointes', bytes: 120000, itemCount: 4, canClean: true },
            { category: 'artifacts', label: 'Artéfacts', bytes: 80000, itemCount: 2, canClean: true },
            { category: 'database', label: 'Base de données', bytes: 50000, itemCount: 1, canClean: false }
          ]
        })
      })
    );
  };

  try {
    // 1. Capture avec redémarrages superviseur journalisés
    const ctx1 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await setupRoutes(ctx1, [
      {
        timestamp: '2026-09-26T10:15:32.140Z',
        exitCode: 1,
        signal: null,
        pid: 14280,
        reason: 'Sortie anormale avec code 1'
      },
      {
        timestamp: '2026-09-26T10:18:05.890Z',
        exitCode: null,
        signal: 'SIGTERM',
        pid: 17824,
        reason: 'Processus interrompu par signal SIGTERM'
      }
    ]);

    const page1 = await ctx1.newPage();
    await page1.goto('http://127.0.0.1:5173');
    await page1.waitForLoadState('networkidle');

    // Ouvrir les paramètres
    const settingsBtn = page1.locator('button[aria-label*="Paramètres"], button:has-text("Paramètres")').first();
    await settingsBtn.click();
    await page1.waitForSelector('role=dialog[name="Paramètres"]');

    // Cliquer sur l'onglet "Confidentialité"
    const privTab = page1.locator('button:has-text("Confidentialité")').first();
    await privTab.click();
    await page1.waitForTimeout(300);

    // Faire défiler jusqu'au bloc Diagnostic
    const diagTitle = page1.locator('text=Diagnostic système');
    await diagTitle.scrollIntoViewIfNeeded();
    await page1.waitForTimeout(300);

    const outPath1 = path.join(validationDir, 'diagnostic_avec_redemarrages_watchdog.png');
    await page1.screenshot({ path: outPath1 });
    console.log(`Capture sauvegardée : ${outPath1}`);

    if (fs.existsSync(artifactDir)) {
      fs.copyFileSync(outPath1, path.join(artifactDir, 'diagnostic_avec_redemarrages_watchdog.png'));
    }

    await ctx1.close();

    // 2. Capture sans redémarrage (état nominal)
    const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await setupRoutes(ctx2, []);

    const page2 = await ctx2.newPage();
    await page2.goto('http://127.0.0.1:5173');
    await page2.waitForLoadState('networkidle');

    const settingsBtn2 = page2.locator('button[aria-label*="Paramètres"], button:has-text("Paramètres")').first();
    await settingsBtn2.click();
    await page2.waitForSelector('role=dialog[name="Paramètres"]');

    const privTab2 = page2.locator('button:has-text("Confidentialité")').first();
    await privTab2.click();
    await page2.waitForTimeout(300);

    const diagTitle2 = page2.locator('text=Diagnostic système');
    await diagTitle2.scrollIntoViewIfNeeded();
    await page2.waitForTimeout(300);

    const outPath2 = path.join(validationDir, 'diagnostic_sans_redemarrage.png');
    await page2.screenshot({ path: outPath2 });
    console.log(`Capture sauvegardée : ${outPath2}`);

    if (fs.existsSync(artifactDir)) {
      fs.copyFileSync(outPath2, path.join(artifactDir, 'diagnostic_sans_redemarrage.png'));
    }

    await ctx2.close();
  } finally {
    await browser.close();
  }

  console.log('--- Captures terminées avec succès ---');
})();
