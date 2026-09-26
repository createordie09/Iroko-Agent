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
  console.log('--- Lancement de la capture des 4 étapes d\'onboarding (Mission R2d) ---');
  await ensureServersRunning();

  let browser;
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
  } catch (e) {
    browser = await chromium.launch({ headless: true });
  }

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });

  // Mocking pour simuler l'état neuf du premier lancement (0 conversation, 0 clé, onboarding non complété)
  await context.route('**/api/settings', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        settings: {
          theme: 'dark',
          conversationFont: 'sans',
          animations: 'system',
          onboarding_completed: false
        }
      })
    })
  );

  await context.route('**/api/conversations', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ conversations: [] })
    })
  );

  await context.route('**/api/providers', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ providers: [], defaultProvider: null })
    })
  );

  await context.route('**/api/models', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ models: [], allModels: [] })
    })
  );

  // Mock pour valider la clé lors du test à l'étape 3
  await context.route('**/api/credentials/test', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ valid: true, latencyMs: 142 })
    })
  );

  await context.route('**/api/credentials', (route) => {
    if (route.request().method() === 'POST') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true })
      });
    } else {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ credentials: [] })
      });
    }
  });

  const page = await context.newPage();
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  // Reset localStorage onboarding state
  await page.addInitScript(() => {
    localStorage.removeItem('iroko_onboarding_completed');
    localStorage.setItem('iroko_theme', 'dark');
  });

  await page.goto('http://127.0.0.1:5173');
  await page.waitForSelector('[data-testid="onboarding-step-1"]', { timeout: 10000 });

  const saveCapture = async (filename) => {
    const valPath = path.join(validationDir, filename);
    await page.screenshot({ path: valPath, fullPage: false });
    console.log(`Capture sauvegardée dans validation : ${valPath}`);
    if (fs.existsSync(artifactDir)) {
      const artPath = path.join(artifactDir, filename);
      fs.copyFileSync(valPath, artPath);
      console.log(`Capture copiée dans artifacts : ${artPath}`);
    }
  };

  // 1. Étape 1 : Bienvenue
  await saveCapture('onboarding_etape_1_bienvenue.png');

  // 2. Étape 2 : Choix du fournisseur
  await page.click('button:has-text("Commencer la configuration")');
  await page.waitForSelector('[data-testid="onboarding-step-2"]');
  await saveCapture('onboarding_etape_2_fournisseur.png');

  // 3. Étape 3 : Renseignez votre clé API
  await page.click('button:has-text("Continuer")');
  await page.waitForSelector('[data-testid="onboarding-step-3"]');
  await page.fill('input#onboarding-api-key', 'sk-or-v1-demo-valid-api-key-iroko');
  await saveCapture('onboarding_etape_3_cle_api.png');

  // 4. Étape 4 : Confirmation
  await page.click('button[type="submit"]:has-text("Tester et enregistrer")');
  await page.waitForSelector('[data-testid="onboarding-step-4"]', { timeout: 10000 });
  await saveCapture('onboarding_etape_4_confirmation.png');

  console.log('--- Captures des 4 étapes d\'onboarding terminées avec succès ---');
  await browser.close();
  process.exit(0);
})().catch((err) => {
  console.error('Erreur lors des captures d\'onboarding:', err);
  process.exit(1);
});
