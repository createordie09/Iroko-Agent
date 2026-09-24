import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const artifactsDir = 'C:\\Users\\DELL\\.gemini\\antigravity\\brain\\d7d76e62-85aa-46ae-912e-623108e41281';

const sampleSources = [
  {
    url: 'https://developer.mozilla.org/fr/docs/Web/JavaScript/Guide/Modules',
    title: 'Modules JavaScript - Guide MDN',
    domain: 'developer.mozilla.org'
  },
  {
    url: 'https://nodejs.org/api/esm.html',
    title: 'ECMAScript Modules | Node.js Documentation',
    domain: 'nodejs.org'
  },
  {
    url: 'https://www.typescriptlang.org/docs/handbook/2/modules.html',
    title: 'Modules - TypeScript Handbook',
    domain: 'typescriptlang.org'
  },
  {
    url: 'https://tc39.es/ecma262/',
    title: 'ECMAScript Language Specification - TC39',
    domain: 'tc39.es'
  },
  {
    url: 'https://v8.dev/features/modules',
    title: 'JavaScript modules - V8 Dev Guide',
    domain: 'v8.dev'
  }
];

async function capture() {
  let browser;
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
  } catch {
    browser = await chromium.launch({ headless: true });
  }

  const setupMockRoute = async (ctx, includeSources = true) => {
    await ctx.route('**/api/settings', route => route.fulfill({
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
          notificationsEnabled: false
        }
      })
    }));

    await ctx.route('**/api/conversations/conv-sources', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        conversation: {
          id: 'conv-sources',
          title: 'Modules ECMAScript',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          workspace_path: null,
          metadata: null,
          mode: 'chat',
          workspace_id: null
        },
        messages: [
          {
            id: 'msg-user-1',
            conversation_id: 'conv-sources',
            role: 'user',
            content: 'Comment fonctionnent les modules ESM en JavaScript et TypeScript ?',
            created_at: new Date(Date.now() - 60000).toISOString(),
            thinking_logs: null,
            metadata: null
          },
          {
            id: 'msg-assistant-1',
            conversation_id: 'conv-sources',
            role: 'assistant',
            content: 'Les modules ECMAScript (ESM) constituent le standard officiel pour structurer le code en JavaScript et TypeScript. Ils reposent sur les directives `import` et `export`, avec une résolution asynchrone des dépendances et un chargement optimisé par le runtime.\n\nPour en savoir plus, consultez la documentation officielle [MDN Modules](https://developer.mozilla.org/fr/docs/Web/JavaScript/Guide/Modules) ainsi que les spécifications sur https://nodejs.org/api/esm.html.',
            created_at: new Date().toISOString(),
            thinking_logs: null,
            metadata: includeSources ? JSON.stringify({
              artifacts: [
                {
                  id: 'art-guide-esm',
                  conversationId: 'conv-sources',
                  name: 'guide_modules_esm.md',
                  title: 'Guide des Modules ESM',
                  mimeType: 'text/markdown',
                  size: 1420,
                  currentVersion: 1,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  versions: []
                }
              ],
              sources: sampleSources
            }) : null
          }
        ]
      })
    }));

    await ctx.route('**/api/conversations', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        conversations: [
          {
            id: 'conv-sources',
            title: 'Modules ECMAScript',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            workspace_path: null,
            metadata: null,
            mode: 'chat',
            workspace_id: null
          }
        ]
      })
    }));

    await ctx.route('**/api/projects', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ projects: [] })
    }));

    await ctx.route('**/api/providers', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ providers: [], defaultProvider: null, fallbackPolicy: null, defaultStrategy: null })
    }));

    await ctx.route('**/api/models*', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ models: [], total: 0, view: 'short', provider: null, defaultModel: null })
    }));

    await ctx.addInitScript(() => {
      localStorage.setItem('iroko_font', 'sans');
      localStorage.setItem('iroko_theme', 'dark');
      localStorage.setItem('iroko_animations', 'system');
    });
  };

  // 1. Capture Desktop (1920x1080) avec sources (repli par défaut à 4)
  const deskCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await setupMockRoute(deskCtx, true);
  const deskPage = await deskCtx.newPage();
  await deskPage.goto('http://localhost:5173/');
  const convBtn = await deskPage.waitForSelector('button:has-text("Modules ECMAScript")', { timeout: 8000 });
  await convBtn.click();
  await deskPage.waitForSelector('[data-message-sources="true"]', { timeout: 8000 });
  await deskPage.waitForTimeout(600);

  const pathDeskReplie = path.join(artifactsDir, 'n4_1920_reponse_avec_sources_replie.png');
  await deskPage.screenshot({ path: pathDeskReplie });
  console.log(`Capture enregistrée : ${pathDeskReplie}`);

  // 2. Dépliage des sources sur desktop
  const expandBtn = await deskPage.waitForSelector('[data-message-sources="true"] button', { timeout: 5000 }).catch(() => null);
  if (expandBtn) {
    await expandBtn.click();
    await deskPage.waitForTimeout(400);
    const pathDeskDeplie = path.join(artifactsDir, 'n4_1920_reponse_avec_sources_deplie.png');
    await deskPage.screenshot({ path: pathDeskDeplie });
    console.log(`Capture enregistrée : ${pathDeskDeplie}`);
  } else {
    console.warn('Bouton de repli non trouvé !');
  }
  await deskCtx.close();

  // 3. Capture Desktop SANS sources ("Avant / sans recherche")
  const deskNoSourcesCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await setupMockRoute(deskNoSourcesCtx, false);
  const deskNoSourcesPage = await deskNoSourcesCtx.newPage();
  await deskNoSourcesPage.goto('http://localhost:5173/');
  const convBtnNoSources = await deskNoSourcesPage.waitForSelector('button:has-text("Modules ECMAScript")', { timeout: 8000 });
  await convBtnNoSources.click();
  await deskNoSourcesPage.waitForSelector('article', { timeout: 8000 });
  await deskNoSourcesPage.waitForTimeout(600);

  const pathDeskNoSources = path.join(artifactsDir, 'n4_1920_reponse_sans_sources_avant.png');
  await deskNoSourcesPage.screenshot({ path: pathDeskNoSources });
  console.log(`Capture enregistrée : ${pathDeskNoSources}`);
  await deskNoSourcesCtx.close();

  // 4. Capture Mobile (375x812) avec sources (lisible sans débordement horizontal)
  const mobCtx = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true });
  await setupMockRoute(mobCtx, true);
  const mobPage = await mobCtx.newPage();
  await mobPage.goto('http://localhost:5173/');
  const drawerBtn = await mobPage.waitForSelector('button[title="Ouvrir le menu"]', { timeout: 8000 });
  await drawerBtn.click();
  const mobConvBtn = await mobPage.waitForSelector('button:has-text("Modules ECMAScript")', { timeout: 5000 });
  await mobConvBtn.click();
  await mobPage.waitForSelector('[data-message-sources="true"]', { timeout: 8000 });
  await mobPage.waitForTimeout(600);

  const pathMob = path.join(artifactsDir, 'n4_375_reponse_avec_sources_mobile.png');
  await mobPage.screenshot({ path: pathMob });
  console.log(`Capture enregistrée : ${pathMob}`);
  await mobCtx.close();

  await browser.close();
  console.log('Toutes les captures Mission N4 ont été générées avec succès.');
}

capture().catch(err => {
  console.error('Erreur lors de la capture :', err);
  process.exit(1);
});
