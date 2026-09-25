import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import zlib from 'zlib';
import { ensureServersRunning } from '../tests/helpers/ensure_servers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const refDir = path.join(rootDir, 'docs', 'ui-reference');
const tempDir = path.join(rootDir, 'docs', 'ui-reference', '.current');

if (!fs.existsSync(refDir)) {
  fs.mkdirSync(refDir, { recursive: true });
}
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

function extractRawImageData(pngBuf) {
  let offset = 8;
  const idatChunks = [];
  let width = 0, height = 0;

  while (offset < pngBuf.length) {
    const len = pngBuf.readUInt32BE(offset);
    const type = pngBuf.toString('ascii', offset + 4, offset + 8);
    if (type === 'IHDR') {
      width = pngBuf.readUInt32BE(offset + 8);
      height = pngBuf.readUInt32BE(offset + 12);
    } else if (type === 'IDAT') {
      idatChunks.push(pngBuf.subarray(offset + 8, offset + 8 + len));
    }
    offset += 12 + len;
  }

  const compressed = Buffer.concat(idatChunks);
  const decompressed = zlib.inflateSync(compressed);
  return { width, height, decompressed };
}

// Comparaison pixel décompressée réelle (tolérance de 1.5% pour micro-variations antialiasing)
function compareBuffers(bufA, bufB, tolerancePercent = 1.5) {
  if (bufA.length === bufB.length && bufA.equals(bufB)) {
    return { match: true, diffPercent: 0 };
  }
  try {
    const rawA = extractRawImageData(bufA);
    const rawB = extractRawImageData(bufB);
    if (rawA.width !== rawB.width || rawA.height !== rawB.height) {
      return { match: false, diffPercent: 100 };
    }
    const lenA = rawA.decompressed.length;
    const lenB = rawB.decompressed.length;
    const minLen = Math.min(lenA, lenB);
    const maxLen = Math.max(lenA, lenB);
    let diffBytes = maxLen - minLen;
    for (let i = 0; i < minLen; i++) {
      if (rawA.decompressed[i] !== rawB.decompressed[i]) diffBytes++;
    }
    const diffPercent = (diffBytes / maxLen) * 100;
    return {
      match: diffPercent <= tolerancePercent,
      diffPercent
    };
  } catch (e) {
    return { match: false, diffPercent: 100 };
  }
}

// Calcul de contraste WCAG AA
function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  const bigint = parseInt(clean, 16);
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255
  };
}

function getLuminance(r, g, b) {
  const a = [r, g, b].map(v => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

function getContrastRatio(hex1, hex2) {
  const rgb1 = hexToRgb(hex1);
  const rgb2 = hexToRgb(hex2);
  const lum1 = getLuminance(rgb1.r, rgb1.g, rgb1.b);
  const lum2 = getLuminance(rgb2.r, rgb2.g, rgb2.b);
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  return (brightest + 0.05) / (darkest + 0.05);
}

function verifyWcagAA() {
  console.log('\n--- Vérification des Contrastes WCAG AA (Thèmes Sombre et Clair) ---');
  const pairs = [
    { name: 'Sombre: Texte principal sur Fond App', fg: '#ededeb', bg: '#151515', min: 4.5 },
    { name: 'Sombre: Texte secondaire sur Fond App', fg: '#878684', bg: '#151515', min: 4.5 },
    { name: 'Sombre: Texte titre sur Fond Surface', fg: '#e5e4e2', bg: '#20201f', min: 3.0 },
    { name: 'Clair: Texte principal sur Fond App', fg: '#1a1a19', bg: '#ffffff', min: 4.5 },
    { name: 'Clair: Texte secondaire sur Fond App', fg: '#585755', bg: '#ffffff', min: 4.5 },
    { name: 'Clair: Texte titre sur Fond Surface', fg: '#111110', bg: '#f2f2f0', min: 3.0 },
    { name: 'Clair: Texte tertiaire sur Fond App', fg: '#878684', bg: '#ffffff', min: 3.0 }
  ];

  let wcagOk = true;
  for (const p of pairs) {
    const ratio = getContrastRatio(p.fg, p.bg);
    const pass = ratio >= p.min;
    if (pass) {
      console.log(`[PASS] ${p.name} : ${ratio.toFixed(2)}:1 (seuil requis: ${p.min}:1)`);
    } else {
      console.error(`[FAIL] ${p.name} : ${ratio.toFixed(2)}:1 < seuil requis: ${p.min}:1`);
      wcagOk = false;
    }
  }
  return wcagOk;
}

(async () => {
  console.log('--- Lancement du contrôle visuel Iroko (npm run ui:check) ---');
  await ensureServersRunning();
  let browser;
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
  } catch (e) {
    browser = await chromium.launch({ headless: true });
  }

  const states = [
    { name: '1920_accueil_sidebar_ouverte.png', width: 1920, height: 1080, isMobile: false, status: 'REFERENCE' },
    { name: '1920_accueil_sidebar_repliee.png', width: 1920, height: 1080, isMobile: false, status: 'REFERENCE' },
    { name: '1920_parametres.png', width: 1920, height: 1080, isMobile: false, status: 'REFERENCE' },
    { name: '375_accueil.png', width: 375, height: 812, isMobile: true, status: 'REFERENCE' },
    { name: '375_tiroir_ouvert.png', width: 375, height: 812, isMobile: true, status: 'REFERENCE' },
    { name: '1920_accueil_theme_clair.png', width: 1920, height: 1080, isMobile: false, status: 'À VALIDER' },
    { name: '1920_parametres_theme_clair.png', width: 1920, height: 1080, isMobile: false, status: 'À VALIDER' }
  ];

  let hasErrors = false;

  // Helper d'isolation stricte pour les contextes Playwright (Mission M10.1)
  // ui:check ne touche JAMAIS à la base réelle et présente un état neuf déterministe
  const setupIsolatedContext = async (ctx, theme = 'dark') => {
    await ctx.route('**/api/settings', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        settings: {
          theme,
          conversationFont: 'sans',
          animations: 'system',
          voiceLang: 'Français',
          voiceURI: '',
          voiceSpeed: 'Normale',
          notificationsEnabled: false
        }
      })
    }));
    await ctx.route('**/api/conversations', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ conversations: [] })
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
    await ctx.addInitScript((t) => {
      localStorage.removeItem('iroko_history');
      localStorage.removeItem('iroko_projects');
      localStorage.removeItem('iroko_active_model');
      localStorage.removeItem('iroko_recent_models');
      localStorage.setItem('iroko_font', 'sans');
      localStorage.setItem('iroko_theme', t);
      localStorage.setItem('iroko_animations', 'system');
      localStorage.setItem('iroko_voice_lang', 'Français');
      localStorage.setItem('iroko_voice_uri', '');
      localStorage.setItem('iroko_voice_speed', 'Normale');
      localStorage.setItem('iroko_notifications_enabled', 'false');
    }, theme);
  };

  // 1. Capture Desktop States (Thème Sombre)
  const desktopCtx = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1
  });
  await setupIsolatedContext(desktopCtx, 'dark');
  const pageDesk = await desktopCtx.newPage();
  await pageDesk.goto('http://localhost:5173');
  await pageDesk.waitForSelector('textarea:not([disabled])', { timeout: 10000 }).catch(() => {});
  await pageDesk.waitForTimeout(500);

  // 1.1 Accueil sidebar ouverte
  console.log('1/7 Vérification 1920_accueil_sidebar_ouverte...');
  const pathDeskOpen = path.join(tempDir, '1920_accueil_sidebar_ouverte.png');
  await pageDesk.screenshot({ path: pathDeskOpen });

  // 1.2 Paramètres
  console.log('2/7 Vérification 1920_parametres...');
  const settingsBtn = await pageDesk.$('button[title="Paramètres"]');
  if (settingsBtn) {
    await settingsBtn.click();
    await pageDesk.waitForSelector('text=Apparence', { timeout: 5000 }).catch(() => {});
    await pageDesk.waitForTimeout(400);
  }
  const pathDeskParam = path.join(tempDir, '1920_parametres.png');
  await pageDesk.screenshot({ path: pathDeskParam });
  await pageDesk.keyboard.press('Escape');
  await pageDesk.waitForTimeout(300);

  // 1.3 Accueil sidebar repliée
  console.log('3/7 Vérification 1920_accueil_sidebar_repliee...');
  const collapseBtn = await pageDesk.$('button[title="Réduire la barre latérale"]');
  if (collapseBtn) {
    await collapseBtn.click();
    await pageDesk.waitForTimeout(400);
  }
  const pathDeskReplie = path.join(tempDir, '1920_accueil_sidebar_repliee.png');
  await pageDesk.screenshot({ path: pathDeskReplie });
  await desktopCtx.close();

  // 2. Capture Mobile States
  const mobileCtx = await browser.newContext({
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 1,
    isMobile: true
  });
  await setupIsolatedContext(mobileCtx, 'dark');
  const pageMob = await mobileCtx.newPage();
  await pageMob.goto('http://localhost:5173');
  await pageMob.waitForSelector('textarea:not([disabled])', { timeout: 10000 }).catch(() => {});
  await pageMob.waitForTimeout(500);

  // 2.1 Accueil mobile
  console.log('4/7 Vérification 375_accueil...');
  const pathMobAccueil = path.join(tempDir, '375_accueil.png');
  await pageMob.screenshot({ path: pathMobAccueil });

  // 2.2 Tiroir mobile ouvert
  console.log('5/7 Vérification 375_tiroir_ouvert...');
  const drawerBtn = await pageMob.$('button[title="Ouvrir le menu"]');
  if (drawerBtn) {
    await drawerBtn.click();
    await pageMob.waitForTimeout(400);
  }
  const pathMobDrawer = path.join(tempDir, '375_tiroir_ouvert.png');
  await pageMob.screenshot({ path: pathMobDrawer });
  await mobileCtx.close();

  // 3. Capture Desktop States (Thème Clair [À VALIDER])
  const lightCtx = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1
  });
  await setupIsolatedContext(lightCtx, 'light');
  const pageLight = await lightCtx.newPage();
  await pageLight.goto('http://localhost:5173');
  await pageLight.waitForSelector('textarea:not([disabled])', { timeout: 10000 }).catch(() => {});
  await pageLight.waitForTimeout(500);

  // 3.1 Accueil thème clair
  console.log('6/7 Vérification [À VALIDER] 1920_accueil_theme_clair...');
  const pathLightAccueil = path.join(tempDir, '1920_accueil_theme_clair.png');
  await pageLight.screenshot({ path: pathLightAccueil });

  // 3.2 Paramètres thème clair
  console.log('7/7 Vérification [À VALIDER] 1920_parametres_theme_clair...');
  const settingsBtnLight = await pageLight.$('button[title="Paramètres"]');
  if (settingsBtnLight) {
    await settingsBtnLight.click();
    await pageLight.waitForTimeout(400);
  }
  const pathLightParam = path.join(tempDir, '1920_parametres_theme_clair.png');
  await pageLight.screenshot({ path: pathLightParam });
  await pageLight.keyboard.press('Escape');
  await pageLight.waitForTimeout(300);
  await lightCtx.close();

  await browser.close();

  // 4. Contrôle des contrastes WCAG AA
  const wcagValid = verifyWcagAA();
  if (!wcagValid) {
    hasErrors = true;
  }

  // 5. Comparaison avec les références
  console.log('\n--- Comparaison avec docs/ui-reference/ ---');
  for (const s of states) {
    const refPath = path.join(refDir, s.name);
    const currPath = path.join(tempDir, s.name);

    if (!fs.existsSync(refPath)) {
      console.log(`[INIT] Enregistrement de la référence : ${s.name} (${s.status})`);
      fs.copyFileSync(currPath, refPath);
    } else {
      const refBuf = fs.readFileSync(refPath);
      const currBuf = fs.readFileSync(currPath);
      const res = compareBuffers(refBuf, currBuf, 1.5);
      if (res.match) {
        console.log(`[PASS] ${s.name} (diff: ${res.diffPercent.toFixed(2)}%) [${s.status}]`);
      } else {
        console.error(`[FAIL] ${s.name} divergence détectée (${res.diffPercent.toFixed(2)}% > seuil 1.5%) [${s.status}]`);
        hasErrors = true;
      }
    }
  }

  // Nettoyage dossier temporaire uniquement si aucune erreur
  if (!hasErrors) {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {}
  }

  if (hasErrors) {
    console.error('\n❌ Échec du contrôle visuel : des régressions d\'interface ont été détectées.');
    process.exit(1);
  } else {
    console.log('\n✅ Contrôle visuel réussi : 100% conforme aux références d\'architecture.');
    process.exit(0);
  }
})();
