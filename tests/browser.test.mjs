import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import path from 'path';
import os from 'os';
import fs from 'fs';
import http from 'http';

// Isolation stricte des données runtime
const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'iroko-browser-data-'));
process.env.IROKO_DATA_DIR = testDataDir;

import { BrowserSecurity } from '../server/browser/BrowserSecurity.ts';
import { browserManager } from '../server/browser/BrowserManager.ts';
import { BrowserNavigateTool } from '../server/tools/browser/browser_navigate.ts';
import { BrowserScreenshotTool } from '../server/tools/browser/browser_screenshot.ts';
import { BrowserClickTool } from '../server/tools/browser/browser_click.ts';
import { BrowserFillTool } from '../server/tools/browser/browser_fill.ts';
import { BrowserCloseTool } from '../server/tools/browser/browser_close.ts';
import { ToolRegistry } from '../server/tools/ToolRegistry.ts';

describe('MISSION L15b : Agent Navigateur Playwright (§16)', () => {
  let mockServer;
  let serverPort;
  const toolRegistry = new ToolRegistry();

  before(async () => {
    // Démarrer un serveur HTTP local de test
    mockServer = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`
        <!DOCTYPE html>
        <html>
        <head><title>Page de test Iroko</title></head>
        <body>
          <h1>Bienvenue sur l'application locale</h1>
          <form id="test-form" onsubmit="event.preventDefault(); document.getElementById('result').innerText = 'Recherche effectuée: ' + document.getElementById('search-input').value;">
            <input type="text" id="search-input" name="q" placeholder="Rechercher..." />
            <button type="submit" id="search-btn">Rechercher</button>
          </form>
          <div id="result">Initial</div>
        </body>
        </html>
      `);
    });

    await new Promise((resolve) => {
      mockServer.listen(0, '127.0.0.1', () => {
        const addr = mockServer.address();
        serverPort = typeof addr === 'object' && addr ? addr.port : 0;
        resolve();
      });
    });
  });

  after(async () => {
    await browserManager.close();
    if (mockServer) {
      await new Promise((resolve) => mockServer.close(resolve));
    }
    try {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    } catch {}
  });

  test('1. Sécurité & Classification des URL (BrowserSecurity)', () => {
    // 1.1 Localhost autorisé par défaut
    const lh1 = BrowserSecurity.classifyUrl('http://localhost:3000/app');
    assert.strictEqual(lh1.type, 'LOCALHOST');
    assert.strictEqual(lh1.allowedByDefault, true);
    assert.strictEqual(lh1.requiresPermission, false);

    const lh2 = BrowserSecurity.classifyUrl('http://127.0.0.1:5173');
    assert.strictEqual(lh2.type, 'LOCALHOST');
    assert.strictEqual(lh2.allowedByDefault, true);
    assert.strictEqual(lh2.requiresPermission, false);

    const lh3 = BrowserSecurity.classifyUrl('http://[::1]:8080');
    assert.strictEqual(lh3.type, 'LOCALHOST');
    assert.strictEqual(lh3.allowedByDefault, true);
    assert.strictEqual(lh3.requiresPermission, false);

    // 1.2 URL externe nécessitant autorisation
    const ext1 = BrowserSecurity.classifyUrl('https://example.com/docs');
    assert.strictEqual(ext1.type, 'EXTERNAL');
    assert.strictEqual(ext1.allowedByDefault, false);
    assert.strictEqual(ext1.requiresPermission, true);

    // 1.3 file:// bloqué sauf autorisation
    const file1 = BrowserSecurity.classifyUrl('file:///etc/passwd');
    assert.strictEqual(file1.type, 'FILE');
    assert.strictEqual(file1.allowedByDefault, false);
    assert.strictEqual(file1.requiresPermission, true);

    // 1.4 Adresses IP privées et métadonnées cloud bloquées sauf autorisation
    const priv1 = BrowserSecurity.classifyUrl('http://192.168.1.10/admin');
    assert.strictEqual(priv1.type, 'PRIVATE_NETWORK');
    assert.strictEqual(priv1.allowedByDefault, false);
    assert.strictEqual(priv1.requiresPermission, true);

    const priv2 = BrowserSecurity.classifyUrl('http://10.0.0.5/');
    assert.strictEqual(priv2.type, 'PRIVATE_NETWORK');
    assert.strictEqual(priv2.allowedByDefault, false);
    assert.strictEqual(priv2.requiresPermission, true);

    const priv3 = BrowserSecurity.classifyUrl('http://172.20.0.1/');
    assert.strictEqual(priv3.type, 'PRIVATE_NETWORK');
    assert.strictEqual(priv3.allowedByDefault, false);
    assert.strictEqual(priv3.requiresPermission, true);

    const meta = BrowserSecurity.classifyUrl('http://169.254.169.254/latest/meta-data');
    assert.strictEqual(meta.type, 'PRIVATE_NETWORK');
    assert.strictEqual(meta.allowedByDefault, false);
    assert.strictEqual(meta.requiresPermission, true);

    // 1.5 URL invalides
    const inv = BrowserSecurity.classifyUrl('pas-une-url');
    assert.strictEqual(inv.type, 'INVALID');
    assert.strictEqual(inv.allowedByDefault, false);
  });

  test('2. Neutralisation du contenu non fiable (BrowserSecurity.sanitizeUntrustedContent)', () => {
    const rawContent = 'Texte avec script injecté et secret \u0000 caché';
    const sanitized = BrowserSecurity.sanitizeUntrustedContent(rawContent, 'https://example.com');

    assert.ok(sanitized.startsWith('[Contenu non fiable extrait de : https://example.com]'));
    assert.ok(sanitized.endsWith('[/Fin du contenu non fiable de : https://example.com]'));
    assert.ok(!sanitized.includes('\u0000'), 'Les caractères de contrôle doivent être supprimés');

    // Plafonnement de longueur
    const longContent = 'A'.repeat(40000);
    const capped = BrowserSecurity.sanitizeUntrustedContent(longContent, 'https://example.com', 5000);
    assert.ok(capped.includes('Contenu tronqué à 5000 caractères'));
  });

  test('3. Enregistrement des outils navigateur dans ToolRegistry', () => {
    const nav = toolRegistry.getTool('browser_navigate');
    const screen = toolRegistry.getTool('browser_screenshot');
    const click = toolRegistry.getTool('browser_click');
    const fill = toolRegistry.getTool('browser_fill');
    const close = toolRegistry.getTool('browser_close');

    assert.ok(nav, 'browser_navigate doit être enregistré');
    assert.ok(screen, 'browser_screenshot doit être enregistré');
    assert.ok(click, 'browser_click doit être enregistré');
    assert.ok(fill, 'browser_fill doit être enregistré');
    assert.ok(close, 'browser_close doit être enregistré');

    assert.strictEqual(nav.category, 'browser');
    assert.strictEqual(screen.category, 'browser');
    assert.strictEqual(click.category, 'browser');
    assert.strictEqual(fill.category, 'browser');
    assert.strictEqual(close.category, 'browser');

    assert.strictEqual(nav.permission, 'MEDIUM');
    assert.strictEqual(screen.permission, 'SAFE');
    assert.strictEqual(click.permission, 'SAFE');
    assert.strictEqual(fill.permission, 'SAFE');
    assert.strictEqual(close.permission, 'SAFE');
  });

  test('4. Navigation localhost réelle avec Playwright, interaction DOM et capture', async () => {
    const navTool = new BrowserNavigateTool();
    const fillTool = new BrowserFillTool();
    const clickTool = new BrowserClickTool();
    const screenTool = new BrowserScreenshotTool();

    const mockContext = {
      workspacePath: os.tmpdir(),
      permissionEngine: {
        requestPermission: async () => false // Ne doit PAS être appelé pour localhost
      }
    };

    // 4.1 Navigation localhost autorisée par défaut
    const navUrl = `http://127.0.0.1:${serverPort}/`;
    const navRes = await navTool.execute({ url: navUrl }, mockContext);

    assert.strictEqual(navRes.success, true);
    assert.ok(navRes.data);
    assert.strictEqual(navRes.data.status, 200);
    assert.strictEqual(navRes.data.title, 'Page de test Iroko');
    assert.ok(navRes.data.content.includes('Bienvenue sur l\'application locale'));
    assert.ok(navRes.data.content.includes('[Contenu non fiable extrait de :'));

    // 4.2 Saisie dans le champ de recherche
    const fillRes = await fillTool.execute({
      selector: '#search-input',
      text: 'Playwright Iroko Test'
    }, mockContext);
    assert.strictEqual(fillRes.success, true);

    // 4.3 Clic sur le bouton de recherche
    const clickRes = await clickTool.execute({
      selector: '#search-btn'
    }, mockContext);
    assert.strictEqual(clickRes.success, true);

    // Vérifier l'état résultant dans le DOM
    const resultText = await browserManager.evaluate(`document.getElementById('result').innerText`);
    assert.strictEqual(resultText, 'Recherche effectuée: Playwright Iroko Test');

    // 4.4 Capture d'écran
    const screenRes = await screenTool.execute({}, mockContext);
    assert.strictEqual(screenRes.success, true);
    assert.ok(screenRes.data);
    assert.ok(screenRes.data.base64 && screenRes.data.base64.length > 100);
    assert.strictEqual(screenRes.data.width, 1280);
    assert.strictEqual(screenRes.data.height, 800);
  });

  test('5. Contrôle des permissions sur URL externe (refus d\'accès)', async () => {
    const navTool = new BrowserNavigateTool();
    let permissionRequested = false;

    const mockContext = {
      workspacePath: os.tmpdir(),
      permissionEngine: {
        requestPermission: async (tool, level, description, details) => {
          permissionRequested = true;
          assert.strictEqual(tool, 'browser_navigate');
          assert.strictEqual(level, 'MEDIUM');
          assert.strictEqual(details?.url, 'https://example.com/docs');
          return false; // Refus
        }
      }
    };

    const res = await navTool.execute({ url: 'https://example.com/docs' }, mockContext);
    assert.strictEqual(permissionRequested, true, 'Une autorisation doit être demandée pour URL externe');
    assert.strictEqual(res.success, false);
    assert.ok(res.error?.includes('refusée'));
  });

  test('6. Fermeture propre du navigateur et destruction du profil isolé', async () => {
    const closeTool = new BrowserCloseTool();
    const res = await closeTool.execute({}, { workspacePath: os.tmpdir() });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.data?.closed, true);
  });
});
