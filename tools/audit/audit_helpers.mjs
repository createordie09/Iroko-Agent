import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateConversation, generateArtifactsSample, generateAttachmentsSample } from './fixtures/dataset_generator.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const rootDir = path.resolve(__dirname, '..', '..');
export const auditOutDir = path.join(rootDir, 'docs', 'audit');

/**
 * Lance une instance Chromium pour l'audit, préférant msedge si présent.
 */
export async function launchAuditBrowser() {
  try {
    return await chromium.launch({ channel: 'msedge', headless: true });
  } catch {
    return await chromium.launch({ headless: true });
  }
}

/**
 * Configure un contexte isolé sans toucher aux données réelles (M10.1)
 */
export async function setupAuditContext(browser, options = {}) {
  const {
    theme = 'dark',
    viewport = { width: 1920, height: 1080 },
    conversations = [],
    projects = [],
    isOffline = false,
    models = [
      { id: 'mock-audit-model', name: 'Modèle d\'audit local', provider: 'local', isAvailable: true, capabilities: { tools: true, vision: false } }
    ]
  } = options;

  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor: 1
  });

  // Interceptions API déterministes et isolées
  await ctx.route('**/api/conversations**', route => {
    if (route.request().method() === 'GET') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ conversations })
      });
    } else {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    }
  });

  await ctx.route('**/api/projects**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ projects })
    });
  });

  await ctx.route('**/api/models**', route => {
    if (isOffline) {
      route.abort('failed');
      return;
    }
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        models,
        providers: [{ id: 'local', name: 'Fournisseur Local d\'Audit', isConfigured: true, state: 'ready' }]
      })
    });
  });

  await ctx.route('**/api/tools**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ tools: [] })
    });
  });

  await ctx.route('**/api/settings**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        theme,
        font: 'serif',
        animations: 'system',
        voiceLang: 'Français',
        notificationsEnabled: false
      })
    });
  });

  // Injection LocalStorage d'initialisation
  await ctx.addInitScript(({ t, convs, projs }) => {
    localStorage.clear();
    localStorage.setItem('iroko_theme', t);
    localStorage.setItem('iroko_font', 'serif');
    localStorage.setItem('iroko_animations', 'system');
    localStorage.setItem('iroko_history', JSON.stringify(convs));
    localStorage.setItem('iroko_projects', JSON.stringify(projs));
  }, { t: theme, convs: conversations, projs: projects });

  return ctx;
}
