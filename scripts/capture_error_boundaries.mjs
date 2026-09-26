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
  console.log('--- Capture des Error Boundaries et de la Résilience (Mission R3b) ---');
  await ensureServersRunning();

  let browser;
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
  } catch (e) {
    browser = await chromium.launch({ headless: true });
  }

  const setupDefaultRoutes = async (ctx, customDiagnostic = null) => {
    await ctx.route('**/api/settings', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          settings: {
            theme: 'dark',
            conversationFont: 'sans',
            animations: 'system',
            voiceLang: 'Français',
            voiceURI: '',
            voiceSpeed: 'Normale',
            notificationsEnabled: false,
            onboarding_completed: true,
            launch_on_startup: false,
            minimize_to_tray: false
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
    await ctx.route('**/api/providers', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ providers: [], defaultProvider: null })
      })
    );
    await ctx.route('**/api/models', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ models: [], allModels: [] })
      })
    );
    await ctx.route('**/api/storage/breakdown', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          database: 1048576,
          wal: 0,
          attachments: 204800,
          artifacts: 512000,
          memory: 12288,
          total: 1777664
        })
      })
    );
    if (customDiagnostic) {
      await ctx.route('**/api/diagnostic', (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(customDiagnostic)
        })
      );
    }
  };

  // 1. Capture Error Boundary Barre Latérale
  {
    console.log('1/4 Capture Error Boundary Sidebar...');
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 }
    });
    await setupDefaultRoutes(context);

    const page = await context.newPage();
    await page.addInitScript(() => {
      localStorage.setItem('iroko_onboarding_completed', 'true');
      localStorage.setItem('iroko_theme', 'dark');
    });

    await page.goto('http://127.0.0.1:5173/?simulate_error=sidebar');
    await page.waitForSelector('text=Une erreur est survenue dans la barre latérale', { timeout: 10000 });
    await page.waitForTimeout(400);

    const valPath = path.join(validationDir, 'error_boundary_sidebar.png');
    await page.screenshot({ path: valPath });
    console.log(`Capture enregistrée : ${valPath}`);
    if (fs.existsSync(artifactDir)) {
      fs.copyFileSync(valPath, path.join(artifactDir, 'error_boundary_sidebar.png'));
    }
    await context.close();
  }

  // 2. Capture Error Boundary Zone de Discussion
  {
    console.log('2/4 Capture Error Boundary Zone de Discussion...');
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 }
    });
    await setupDefaultRoutes(context);

    const page = await context.newPage();
    await page.addInitScript(() => {
      localStorage.setItem('iroko_onboarding_completed', 'true');
      localStorage.setItem('iroko_theme', 'dark');
    });

    await page.goto('http://127.0.0.1:5173/?simulate_error=chat');
    await page.waitForSelector('text=Une erreur est survenue dans la zone de conversation', { timeout: 10000 });
    await page.waitForTimeout(400);

    const valPath = path.join(validationDir, 'error_boundary_chat.png');
    await page.screenshot({ path: valPath });
    console.log(`Capture enregistrée : ${valPath}`);
    if (fs.existsSync(artifactDir)) {
      fs.copyFileSync(valPath, path.join(artifactDir, 'error_boundary_chat.png'));
    }
    await context.close();
  }

  // 3. Capture Error Boundary Modale Paramètres
  {
    console.log('3/4 Capture Error Boundary Modale Paramètres...');
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 }
    });
    await setupDefaultRoutes(context);

    const page = await context.newPage();
    await page.addInitScript(() => {
      localStorage.setItem('iroko_onboarding_completed', 'true');
      localStorage.setItem('iroko_theme', 'dark');
    });

    await page.goto('http://127.0.0.1:5173/?simulate_error=settings');
    await page.waitForSelector('text=Paramètres', { timeout: 10000 });
    await page.click('text=Paramètres');
    await page.waitForSelector('text=Une erreur est survenue dans la modale des paramètres', { timeout: 10000 });
    await page.waitForTimeout(400);

    const valPath = path.join(validationDir, 'error_boundary_settings.png');
    await page.screenshot({ path: valPath });
    console.log(`Capture enregistrée : ${valPath}`);
    if (fs.existsSync(artifactDir)) {
      fs.copyFileSync(valPath, path.join(artifactDir, 'error_boundary_settings.png'));
    }
    await context.close();
  }

  // 4. Capture Diagnostic avec Incident de Corruption Base SQLite
  {
    console.log('4/4 Capture Diagnostic avec Incident de Corruption SQLite...');
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 }
    });
    await setupDefaultRoutes(context, {
      appVersion: '0.1.0',
      nodeVersion: 'v25.8.2',
      platform: 'win32',
      pid: 1234,
      uptimeSeconds: 42,
      runtimePort: 3001,
      database: { sizeBytes: 1048576, schemaVersion: 13 },
      databasePath: '~\\AppData\\Roaming\\iroko\\iroko_runtime.db',
      databaseSizeBytes: 1048576,
      databaseIntegrity: 'ok',
      connectedProviders: [],
      conversationsCount: 0,
      messagesCount: 0,
      mcpServers: [],
      recentErrors: [],
      restarts: [],
      corruptionIncident: {
        timestamp: '2026-09-26T10:15:30.123Z',
        corruptedBackupName: 'iroko_runtime_corrupted_1758881730123.db',
        fallbackToNew: true,
        userMessage: 'Base de données corrompue détectée. Une sauvegarde horodatée a été créée (iroko_runtime_corrupted_1758881730123.db) et une nouvelle base intègre a été initialisée.',
        recoveredTables: []
      }
    });

    const page = await context.newPage();
    await page.addInitScript(() => {
      localStorage.setItem('iroko_onboarding_completed', 'true');
      localStorage.setItem('iroko_theme', 'dark');
    });

    await page.goto('http://127.0.0.1:5173');
    await page.waitForSelector('text=Paramètres', { timeout: 10000 });
    await page.click('text=Paramètres');
    await page.waitForSelector('button:has-text("Confidentialité")', { timeout: 10000 });
    await page.click('button:has-text("Confidentialité")');
    const incidentLoc = page.locator('text=Incident base');
    await incidentLoc.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);

    const valPath = path.join(validationDir, 'diagnostic_avec_incident_corruption.png');
    await page.screenshot({ path: valPath });
    console.log(`Capture enregistrée : ${valPath}`);
    if (fs.existsSync(artifactDir)) {
      fs.copyFileSync(valPath, path.join(artifactDir, 'diagnostic_avec_incident_corruption.png'));
    }
    await context.close();
  }

  console.log('--- Toutes les captures R3b ont été générées avec succès ---');
  await browser.close();
  process.exit(0);
})().catch((err) => {
  console.error('Erreur lors de la capture des Error Boundaries:', err);
  process.exit(1);
});
