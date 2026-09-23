/**
 * tools/audit/capture_lot2_overlays.mjs
 * Script de capture visuelle pour la validation du Lot 2 :
 * - Modale des Paramètres avec focus confiné et fond inerte
 * - Tiroir mobile avec arrière-plan inerte
 * - Actions de messages avec :focus-within
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const outDir = path.resolve('docs/audit/a11y/captures_lot2');
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

  // 1. Capture Desktop 1440px - Modale des paramètres avec focus confiné
  console.log('1. Capture Desktop 1440px - Modale Paramètres...');
  const ctx1440 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await setupCtx(ctx1440);
  const p1440 = await ctx1440.newPage();
  await p1440.goto('http://127.0.0.1:5173');
  await p1440.waitForSelector('textarea', { timeout: 10000 });
  await p1440.waitForTimeout(400);

  // Ouvrir la modale paramètres via le raccourci ou clic
  const settingsBtn = await p1440.$('button[title="Paramètres"]');
  if (settingsBtn) {
    await settingsBtn.click();
  } else {
    await p1440.keyboard.press('Control+,');
  }
  await p1440.waitForSelector('[data-modal="true"]', { timeout: 5000 });
  await p1440.waitForTimeout(400);

  // Tabuler plusieurs fois pour prouver le focus confiné
  await p1440.keyboard.press('Tab');
  await p1440.keyboard.press('Tab');
  await p1440.waitForTimeout(200);

  const pathModal = path.join(outDir, 'lot2_1440_settings_modal_trapped.png');
  await p1440.screenshot({ path: pathModal });
  fs.copyFileSync(pathModal, path.join(artifactDir, 'lot2_1440_settings_modal_trapped.png'));

  // Fermer par Échap
  await p1440.keyboard.press('Escape');
  await p1440.waitForTimeout(300);
  await ctx1440.close();

  // 2. Capture Mobile 375px - Tiroir mobile ouvert avec fond inerte
  console.log('2. Capture Mobile 375px - Tiroir navigation inerte...');
  const ctx375 = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true });
  await setupCtx(ctx375);
  const p375 = await ctx375.newPage();
  await p375.goto('http://127.0.0.1:5173');
  await p375.waitForSelector('button[title="Ouvrir le menu"]', { timeout: 10000 });
  await p375.waitForTimeout(400);

  // Cliquer sur le bouton menu pour ouvrir le tiroir
  await p375.click('button[title="Ouvrir le menu"]');
  await p375.waitForSelector('div[aria-label="Menu de navigation"]', { timeout: 5000 });

  await p375.waitForTimeout(400);

  const pathDrawer = path.join(outDir, 'lot2_375_mobile_drawer_inert.png');
  await p375.screenshot({ path: pathDrawer });
  fs.copyFileSync(pathDrawer, path.join(artifactDir, 'lot2_375_mobile_drawer_inert.png'));

  // Fermer par Échap
  await p375.keyboard.press('Escape');
  await p375.waitForTimeout(300);
  await ctx375.close();

  // 3. Capture Desktop Chat - Actions de messages visibles au focus clavier
  console.log('3. Capture Desktop Chat - Actions messages avec :focus-within...');
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

  // Envoyer un message depuis le hero
  await pChat.fill('textarea', 'Bonjour Iroko, validation des actions au clavier.');
  await pChat.keyboard.press('Enter');
  await pChat.waitForTimeout(800);

  // Focaliser le bouton Copier ou Modifier du message
  const actionBtn = await pChat.$('[data-message-actions="true"] button, button[aria-label*="Copier"], button[title*="Copier"]');
  if (actionBtn) {
    await actionBtn.focus();
    await pChat.waitForTimeout(300);
  }

  const pathActions = path.join(outDir, 'lot2_actions_messages_focused.png');
  await pChat.screenshot({ path: pathActions });
  fs.copyFileSync(pathActions, path.join(artifactDir, 'lot2_actions_messages_focused.png'));
  await ctxChat.close();

  await browser.close();
  console.log('Captures Lot 2 terminées avec succès dans docs/audit/a11y/captures_lot2 et artifacts !');
})();

