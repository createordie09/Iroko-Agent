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
  console.log('--- Capture des préférences système et bureau (Mission R2e) ---');
  await ensureServersRunning();

  let browser;
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
  } catch (e) {
    browser = await chromium.launch({ headless: true });
  }

  const setupRoutes = async (ctx) => {
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
  };

  // 1. Capture en Mode Web (interrupteur désactivé avec raison accessible)
  {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 }
    });
    await setupRoutes(context);

    const page = await context.newPage();
    await page.addInitScript(() => {
      localStorage.setItem('iroko_onboarding_completed', 'true');
      localStorage.setItem('iroko_theme', 'dark');
    });

    await page.goto('http://127.0.0.1:5173');
    await page.waitForSelector('text=Paramètres', { timeout: 10000 });
    await page.click('text=Paramètres');
    await page.waitForSelector('h3:has-text("Système & Bureau")', { timeout: 10000 });
    await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll('h3')).find(h => h.textContent && h.textContent.includes('Système & Bureau'));
      if (el) el.scrollIntoView({ block: 'center', behavior: 'instant' });
    });
    await page.waitForTimeout(400);

    const valPath = path.join(validationDir, 'preferences_systeme_bureau_web.png');
    await page.screenshot({ path: valPath });
    console.log(`Capture web sauvegardée : ${valPath}`);
    if (fs.existsSync(artifactDir)) {
      fs.copyFileSync(valPath, path.join(artifactDir, 'preferences_systeme_bureau_web.png'));
    }
    await context.close();
  }

  // 2. Capture en Mode Bureau (simulation environnement Electron avec injection electronAPI)
  {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 }
    });
    await setupRoutes(context);

    const page = await context.newPage();
    await page.addInitScript(() => {
      localStorage.setItem('iroko_onboarding_completed', 'true');
      localStorage.setItem('iroko_theme', 'dark');
      // Mock window.electronAPI pour simuler l'environnement desktop
      window.electronAPI = {
        isDesktop: true,
        platform: 'win32',
        getDesktopCapabilities: async () => ({
          isDesktop: true,
          platform: 'win32',
          canAutoLaunch: true,
          canTray: true,
          autoLaunch: false,
          closeToTray: false
        }),
        setAutoLaunch: async (val) => ({ success: true, enabled: val }),
        setMinimizeToTray: async (val) => ({ success: true, enabled: val })
      };
    });

    await page.goto('http://127.0.0.1:5173');
    await page.waitForSelector('text=Paramètres', { timeout: 10000 });
    await page.click('text=Paramètres');
    await page.waitForSelector('h3:has-text("Système & Bureau")', { timeout: 10000 });
    await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll('h3')).find(h => h.textContent && h.textContent.includes('Système & Bureau'));
      if (el) el.scrollIntoView({ block: 'center', behavior: 'instant' });
    });
    await page.waitForTimeout(400);

    const valPath = path.join(validationDir, 'preferences_systeme_bureau_desktop.png');
    await page.screenshot({ path: valPath });
    console.log(`Capture bureau sauvegardée : ${valPath}`);
    if (fs.existsSync(artifactDir)) {
      fs.copyFileSync(valPath, path.join(artifactDir, 'preferences_systeme_bureau_desktop.png'));
    }
    await context.close();
  }

  console.log('--- Captures des préférences système et bureau terminées avec succès ---');
  await browser.close();
  process.exit(0);
})().catch((err) => {
  console.error('Erreur lors des captures des préférences bureau:', err);
  process.exit(1);
});
