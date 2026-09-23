import { chromium } from 'playwright';
import path from 'path';

const artifactDir = 'C:\\Users\\DELL\\.gemini\\antigravity\\brain\\d7d76e62-85aa-46ae-912e-623108e41281';

(async () => {
  console.log('--- Lancement des captures complètes M10.3 ---');
  let browser;
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
  } catch {
    browser = await chromium.launch({ headless: true });
  }

  // 1. Contexte avec état sans fournisseur
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1
  });
  const page = await ctx.newPage();
  await page.goto('http://localhost:5173');
  await page.waitForSelector('text=Ajoutez une clé API', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(500);

  // Capture 1 : Composer à l'état sans fournisseur
  await page.screenshot({
    path: path.join(artifactDir, 'm10_3_composer_etat_sans_fournisseur.png')
  });
  console.log('Capture 1 enregistrée : m10_3_composer_etat_sans_fournisseur.png');

  // Clic sur l'onglet Fournisseurs & Clés dans la modale
  const paramLink = await page.$('button:has-text("Paramètres")');
  if (paramLink) {
    await paramLink.click();
    await page.waitForTimeout(500);
  }
  const providersTabBtn = await page.$('button:has-text("Fournisseurs & Clés")');
  if (providersTabBtn) {
    await providersTabBtn.click();
    await page.waitForTimeout(600);
  }

  // Capture 2 : Fournisseurs & Clés avec les 12 presets
  await page.screenshot({
    path: path.join(artifactDir, 'm10_3_parametres_fournisseurs_presets.png')
  });
  console.log('Capture 2 enregistrée : m10_3_parametres_fournisseurs_presets.png');

  // Clic sur "Gérer les modèles"
  const manageModelsBtn = await page.$('button:has-text("Gérer les modèles")');
  if (manageModelsBtn) {
    await manageModelsBtn.click();
    await page.waitForTimeout(600);
  }

  // Capture 3 : Panneau Gérer les modèles
  await page.screenshot({
    path: path.join(artifactDir, 'm10_3_parametres_gerer_modeles.png')
  });
  console.log('Capture 3 enregistrée : m10_3_parametres_gerer_modeles.png');
  await ctx.close();

  // 2. Contexte isolé simulant des modèles disponibles pour capturer le ModelSelectorMenu
  const ctxMenu = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1
  });

  // Interception réseau pour simuler des modèles actifs
  await ctxMenu.route('**/api/providers', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      providers: [
        { id: 'openrouter', name: 'OpenRouter', activeKeys: 1, keyCount: 1, isLocal: false, modelsCount: 3, status: 'READY' }
      ]
    })
  }));

  await ctxMenu.route('**/api/models?view=short*', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      models: [
        {
          id: 'openrouter/anthropic/claude-3.5-sonnet',
          rawId: 'anthropic/claude-3.5-sonnet',
          name: 'Sonnet 3.5',
          publisher: 'Anthropic',
          providerName: 'OpenRouter',
          contextWindow: 200000,
          priceTier: 'standard',
          isFavorite: true,
          capabilities: { vision: true, nativePdf: true, audio: false, video: false, tools: true, reasoning: true }
        },
        {
          id: 'openrouter/openai/gpt-4o',
          rawId: 'openai/gpt-4o',
          name: 'GPT-4o',
          publisher: 'OpenAI',
          providerName: 'OpenRouter',
          contextWindow: 128000,
          priceTier: 'standard',
          isFavorite: false,
          capabilities: { vision: true, nativePdf: false, audio: false, video: false, tools: true, reasoning: true }
        },
        {
          id: 'openrouter/google/gemini-2.0-flash-001',
          rawId: 'google/gemini-2.0-flash-001',
          name: 'Gemini 2.0 Flash',
          publisher: 'Google',
          providerName: 'OpenRouter',
          contextWindow: 1000000,
          priceTier: 'free',
          isFavorite: false,
          capabilities: { vision: true, nativePdf: true, audio: true, video: true, tools: true, reasoning: true }
        }
      ],
      defaultModel: {
        id: 'openrouter/anthropic/claude-3.5-sonnet',
        name: 'Sonnet 3.5'
      }
    })
  }));

  await ctxMenu.route('**/api/models?view=all*', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      models: [
        {
          id: 'openrouter/anthropic/claude-3.5-sonnet',
          rawId: 'anthropic/claude-3.5-sonnet',
          name: 'Sonnet 3.5',
          publisher: 'Anthropic',
          providerName: 'OpenRouter',
          contextWindow: 200000,
          priceTier: 'standard',
          isFavorite: true,
          pricing: { prompt: '0.000003', completion: '0.000015' },
          capabilities: { vision: true, nativePdf: true, audio: false, video: false, tools: true, reasoning: true }
        },
        {
          id: 'openrouter/openai/gpt-4o',
          rawId: 'openai/gpt-4o',
          name: 'GPT-4o',
          publisher: 'OpenAI',
          providerName: 'OpenRouter',
          contextWindow: 128000,
          priceTier: 'standard',
          isFavorite: false,
          pricing: { prompt: '0.000005', completion: '0.000015' },
          capabilities: { vision: true, nativePdf: false, audio: false, video: false, tools: true, reasoning: true }
        },
        {
          id: 'openrouter/google/gemini-2.0-flash-001',
          rawId: 'google/gemini-2.0-flash-001',
          name: 'Gemini 2.0 Flash',
          publisher: 'Google',
          providerName: 'OpenRouter',
          contextWindow: 1000000,
          priceTier: 'free',
          isFavorite: false,
          pricing: { prompt: '0', completion: '0' },
          capabilities: { vision: true, nativePdf: true, audio: true, video: true, tools: true, reasoning: true }
        }
      ]
    })
  }));

  const pageMenu = await ctxMenu.newPage();
  await pageMenu.goto('http://localhost:5173');
  await pageMenu.waitForSelector('button:has-text("Sonnet 3.5")', { timeout: 15000 }).catch(() => {});
  await pageMenu.waitForTimeout(500);

  // Clic sur le sélecteur de modèle pour ouvrir le menu
  const selectorBtn = await pageMenu.$('button:has-text("Sonnet 3.5")');
  if (selectorBtn) {
    await selectorBtn.click();
    await pageMenu.waitForTimeout(400);
  }

  // Capture 4 : Menu déroulant du sélecteur de modèles (sections, tags sobres, recherche, navigation)
  await pageMenu.screenshot({
    path: path.join(artifactDir, 'm10_3_selecteur_menu_deroulant.png')
  });
  console.log('Capture 4 enregistrée : m10_3_selecteur_menu_deroulant.png');

  await ctxMenu.close();
  await browser.close();
  console.log('--- Fin des captures complètes M10.3 ---');
})();
