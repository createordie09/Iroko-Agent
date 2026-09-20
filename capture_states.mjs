import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1
  });
  const page = await context.newPage();

  // State 2: Accueil avec sidebar (Capture 3)
  console.log('Capturing State 2 (Accueil avec sidebar)...');
  await page.goto('http://localhost:5173');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(__dirname, 'rendu_state_3_accueil_sidebar.png') });

  // State 1: Accueil sidebar repliée (Capture 1)
  console.log('Capturing State 1 (Accueil sidebar repliée)...');
  const collapseBtn = await page.$('button[title="Réduire la barre latérale"]');
  if (collapseBtn) {
    await collapseBtn.click();
    await page.waitForTimeout(400);
  }
  await page.screenshot({ path: path.join(__dirname, 'rendu_state_1_accueil_replie.png') });

  // Re-open sidebar
  const openBtn = await page.$('button[title="Ouvrir la barre latérale"]');
  if (openBtn) {
    await openBtn.click();
    await page.waitForTimeout(400);
  }

  // State 3: Fenêtre de paramètres (Capture 2)
  console.log('Capturing State 3 (Fenêtre de paramètres)...');
  const settingsBtn = await page.$('button[title="Paramètres"]');
  if (settingsBtn) {
    await settingsBtn.click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(__dirname, 'rendu_state_2_parametres.png') });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }

  // State 4: Conversation (Capture 4)
  console.log('Capturing State 4 (Conversation)...');
  const chatItem = await page.$('button:has-text("Nouveau")');
  if (chatItem) {
    await chatItem.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(__dirname, 'rendu_state_4_conversation.png') });
  }

  await browser.close();
  console.log('All screenshots captured successfully!');
})();
