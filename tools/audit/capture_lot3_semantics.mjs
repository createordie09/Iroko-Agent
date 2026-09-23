/**
 * tools/audit/capture_lot3_semantics.mjs
 * Script de capture visuelle pour la validation du Lot 3 :
 * - Lien d'évitement au focus ("Aller au contenu")
 * - Conversation avec articles et repères sémantiques
 * - Composer avec contrôle segmenté Chat | Code et cibles
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const outDir = path.resolve('docs/audit/a11y/captures_lot3');
const artifactDir = 'C:\\Users\\DELL\\.gemini\\antigravity\\brain\\d7d76e62-85aa-46ae-912e-623108e41281';

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

(async () => {
  let browser;
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
  } catch (e) {
    browser = await chromium.launch({ headless: true });
  }

  const setupCtx = async (ctx) => {
    await ctx.route('**/api/conversations', route => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ conversations: [] })
    }));
    await ctx.route('**/api/projects', route => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ projects: [] })
    }));
    await ctx.route('**/api/providers', route => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ providers: [], defaultProvider: null, fallbackPolicy: null, defaultStrategy: null })
    }));
    await ctx.route('**/api/models*', route => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ models: [], total: 0, view: 'short', provider: null, defaultModel: null })
    }));
    await ctx.addInitScript(() => {
      localStorage.removeItem('iroko_history');
      localStorage.removeItem('iroko_projects');
      localStorage.removeItem('iroko_active_model');
      localStorage.removeItem('iroko_recent_models');
      localStorage.setItem('iroko_theme', 'dark');
      localStorage.setItem('iroko_font', 'serif');
    });
  };

  // 1. Capture Skip Link révélé au premier Tab
  console.log('1. Capture Lien d\'évitement "Aller au contenu"...');
  const ctxSkip = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await setupCtx(ctxSkip);
  const pSkip = await ctxSkip.newPage();
  await pSkip.goto('http://127.0.0.1:5173');
  await pSkip.waitForSelector('textarea', { timeout: 10000 });
  await pSkip.waitForTimeout(300);

  // Focaliser explicitement le lien d'évitement pour révéler son état visible au focus
  await pSkip.locator('a[href="#main-content"]').focus();
  await pSkip.waitForTimeout(200);

  const skipPath = path.join(outDir, 'lot3_skiplink_focused.png');
  await pSkip.screenshot({ path: skipPath });
  const skipArt = path.join(artifactDir, 'lot3_skiplink_focused.png');
  fs.copyFileSync(skipPath, skipArt);
  await ctxSkip.close();

  // 2. Capture Conversation avec articles et repères sémantiques
  console.log('2. Capture Conversation et articles...');
  const ctxChat = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctxChat.route('**/api/conversations', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ conversations: [] })
  }));
  await ctxChat.route('**/api/projects', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ projects: [] })
  }));
  await ctxChat.route('**/api/providers', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({
      providers: [{ id: 'local', name: 'Fournisseur local', isReady: true, isLocal: true, activeKeys: 1 }],
      defaultProvider: 'local',
      fallbackPolicy: null,
      defaultStrategy: null
    })
  }));
  await ctxChat.route('**/api/models*', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({
      models: [{ id: 'local-model', name: 'Modèle local', providerId: 'local', isAvailable: true, capabilities: {} }],
      total: 1,
      view: 'short',
      provider: 'local',
      defaultModel: { id: 'local-model', name: 'Modèle local' }
    })
  }));
  await ctxChat.addInitScript(() => {
    localStorage.setItem('iroko_active_model', 'local-model');
    localStorage.setItem('iroko_theme', 'dark');
    localStorage.setItem('iroko_font', 'serif');
  });

  const pChat = await ctxChat.newPage();
  await pChat.goto('http://127.0.0.1:5173');
  await pChat.waitForSelector('textarea', { timeout: 10000 });
  await pChat.waitForTimeout(400);

  // Envoyer un message pour générer des articles et basculer en vue Chat
  await pChat.fill('textarea', 'Quels sont les repères sémantiques et régions live de Lot 3 ?');
  await pChat.keyboard.press('Enter');
  await pChat.waitForSelector('article', { timeout: 10000 });
  await pChat.waitForTimeout(600);

  const chatPath = path.join(outDir, 'lot3_chat_articles_landmarks.png');
  await pChat.screenshot({ path: chatPath });
  const chatArt = path.join(artifactDir, 'lot3_chat_articles_landmarks.png');
  fs.copyFileSync(chatPath, chatArt);

  // 3. Focus sur le contrôle segmenté [ Chat | Code ]
  console.log('3. Capture Contrôle segmenté Chat | Code...');
  const codeBtn = await pChat.locator('div[role="group"][aria-label="Mode"] button:has-text("Code")');
  await codeBtn.focus();
  await pChat.waitForTimeout(200);

  const compPath = path.join(outDir, 'lot3_composer_segmented_mode.png');
  await pChat.screenshot({ path: compPath });
  const compArt = path.join(artifactDir, 'lot3_composer_segmented_mode.png');
  fs.copyFileSync(compPath, compArt);

  await ctxChat.close();
  await browser.close();
  console.log('Captures Lot 3 terminées avec succès dans docs/audit/a11y/captures_lot3/');
})();
