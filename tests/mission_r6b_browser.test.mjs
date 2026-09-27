// tests/mission_r6b_browser.test.mjs
// Suite de tests normatifs pour la Mission R6b : Agent Navigateur Playwright (Cahier §16)

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'http';
import path from 'path';
import os from 'os';
import fs from 'fs';

// Assurer l'isolation des données runtime
const testDataDir = path.join(os.tmpdir(), `iroko-r6b-data-${Date.now()}`);
process.env.IROKO_DATA_DIR = testDataDir;

import { browserManager } from '../server/browser/BrowserManager.ts';
import { BrowserSecurity } from '../server/browser/BrowserSecurity.ts';
import { BrowserNavigateTool } from '../server/tools/browser/browser_navigate.ts';
import { BrowserScreenshotTool } from '../server/tools/browser/browser_screenshot.ts';
import { BrowserClickTool } from '../server/tools/browser/browser_click.ts';
import { BrowserFillTool } from '../server/tools/browser/browser_fill.ts';
import { BrowserCloseTool } from '../server/tools/browser/browser_close.ts';
import { BrowserGetLogsTool } from '../server/tools/browser/browser_get_logs.ts';
import { ToolRegistry } from '../server/tools/ToolRegistry.ts';

describe('MISSION R6b : Agent Navigateur Playwright pour tester le projet (Cahier §16)', () => {
  const workspaceDir = path.join(os.tmpdir(), `iroko-r6b-ws-${Date.now()}`);
  let localServer;
  let localServerPort = 0;
  let localServerUrl = '';

  before(async () => {
    fs.mkdirSync(testDataDir, { recursive: true });
    fs.mkdirSync(workspaceDir, { recursive: true });

    // Création d'un serveur HTTP local déterministe pour tester l'application
    localServer = http.createServer((req, res) => {
      const url = new URL(req.url, `http://${req.headers.host}`);

      if (url.pathname === '/api/error-endpoint') {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Erreur interne de test' }));
        return;
      }

      if (url.pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<!DOCTYPE html>
<html>
<head>
  <title>Application Locale Projet Iroko</title>
</head>
<body>
  <h1>Bienvenue sur l'application de test</h1>
  <p id="desc">Plateforme de test autonome locale pour l'agent de code.</p>
  
  <input id="input-test" type="text" placeholder="Entrez un nom" />
  <button id="btn-action">Valider</button>
  <div id="output-result"></div>

  <script>
    console.log("LOG_CONSOLE_TEST_IROKO_OK");
    console.error("ERREUR_CONSOLE_SIMULEE_TEST");
    
    // Déclencher une requête réseau en erreur
    fetch('/api/error-endpoint').catch(() => {});

    let count = 0;
    document.getElementById('btn-action').addEventListener('click', () => {
      count++;
      const val = document.getElementById('input-test').value;
      document.getElementById('output-result').textContent = 'Succes ' + val + ' (' + count + ')';
    });
  </script>
</body>
</html>`);
        return;
      }

      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    });

    await new Promise((resolve) => {
      localServer.listen(0, '127.0.0.1', () => {
        localServerPort = localServer.address().port;
        localServerUrl = `http://127.0.0.1:${localServerPort}`;
        resolve();
      });
    });
  });

  after(async () => {
    try {
      await browserManager.close();
      if (localServer) {
        await new Promise(r => localServer.close(r));
      }
      fs.rmSync(workspaceDir, { recursive: true, force: true });
      fs.rmSync(testDataDir, { recursive: true, force: true });
    } catch {}
  });

  test('1. Enregistrement des 6 outils du navigateur dans ToolRegistry', () => {
    const registry = new ToolRegistry();
    const tools = registry.getAllTools().filter(t => t.category === 'browser');
    const toolNames = tools.map(t => t.name);

    assert.ok(toolNames.includes('browser_navigate'), 'browser_navigate doit être enregistré');
    assert.ok(toolNames.includes('browser_screenshot'), 'browser_screenshot doit être enregistré');
    assert.ok(toolNames.includes('browser_click'), 'browser_click doit être enregistré');
    assert.ok(toolNames.includes('browser_fill'), 'browser_fill doit être enregistré');
    assert.ok(toolNames.includes('browser_close'), 'browser_close doit être enregistré');
    assert.ok(toolNames.includes('browser_get_logs'), 'browser_get_logs doit être enregistré');
    assert.strictEqual(toolNames.length, 6, 'Exactement 6 outils navigateur attendus');
  });

  test('2. Navigation vers une adresse externe demande une autorisation (MEDIUM)', async () => {
    const navTool = new BrowserNavigateTool();

    // 1. Sans moteur de permission (refus par défaut)
    const resNoPerm = await navTool.execute(
      { url: 'https://example.com' },
      { workspacePath: workspaceDir }
    );
    assert.strictEqual(resNoPerm.success, false);
    assert.ok(resNoPerm.error?.includes('autorisation explicite est requise'));

    // 2. Avec moteur de permission qui refuse
    let permissionRequested = false;
    let requestedRiskLevel = '';
    const mockDenyEngine = {
      requestPermission: async (_tool, level, _reason) => {
        permissionRequested = true;
        requestedRiskLevel = level;
        return false;
      }
    };

    const resDeny = await navTool.execute(
      { url: 'https://example.com' },
      { workspacePath: workspaceDir, permissionEngine: mockDenyEngine }
    );
    assert.strictEqual(permissionRequested, true, 'La permission aurait dû être sollicitée');
    assert.strictEqual(requestedRiskLevel, 'MEDIUM', 'Le niveau requis pour une URL externe doit être MEDIUM');
    assert.strictEqual(resDeny.success, false);
    assert.ok(resDeny.error?.includes('refusée par la politique de sécurité'));
  });

  test('3. Adresse privée et file:// bloquées sans autorisation explicite (HIGH)', async () => {
    const navTool = new BrowserNavigateTool();

    // Test d'une adresse IP privée locale (RFC 1918)
    const resPrivateNoPerm = await navTool.execute(
      { url: 'http://192.168.1.1/admin' },
      { workspacePath: workspaceDir }
    );
    assert.strictEqual(resPrivateNoPerm.success, false);
    assert.ok(resPrivateNoPerm.error?.includes('autorisation explicite est requise'));

    // Test du protocole file://
    let requestedRiskLevel = '';
    const mockDenyEngine = {
      requestPermission: async (_tool, level, _reason) => {
        requestedRiskLevel = level;
        return false;
      }
    };

    const resFile = await navTool.execute(
      { url: 'file:///C:/Windows/win.ini' },
      { workspacePath: workspaceDir, permissionEngine: mockDenyEngine }
    );
    assert.strictEqual(resFile.success, false);
    assert.strictEqual(requestedRiskLevel, 'HIGH', 'Le protocole file:// doit requérir un risque HIGH');
  });

  test('4. Navigation vers localhost autorisée par défaut & neutralisation du contenu (§26)', async () => {
    const navTool = new BrowserNavigateTool();

    // Navigation locale sans besoin de permissionEngine
    const res = await navTool.execute(
      { url: localServerUrl },
      { workspacePath: workspaceDir }
    );

    assert.strictEqual(res.success, true);
    assert.ok(res.data);
    assert.strictEqual(res.data.status, 200);
    assert.strictEqual(res.data.title, 'Application Locale Projet Iroko');
    assert.ok(res.data.content.includes('[Contenu non fiable extrait de :'));
    assert.ok(res.data.content.includes('Plateforme de test autonome'));
    assert.ok(res.data.content.includes('[/Fin du contenu non fiable de :'));
  });

  test('5. Capture d\'écran d\'une page locale réussie et confinement au workspace', async () => {
    const screenTool = new BrowserScreenshotTool();

    // 1. Capture d'écran en mémoire (base64)
    const resBase64 = await screenTool.execute({}, { workspacePath: workspaceDir });
    assert.strictEqual(resBase64.success, true);
    assert.ok(resBase64.data?.base64);
    assert.ok(resBase64.data.base64.length > 100);
    assert.strictEqual(resBase64.data.width, 1280);
    assert.strictEqual(resBase64.data.height, 800);

    // 2. Capture d'écran enregistrée dans le workspace
    const outputPath = 'captures/test_app.png';
    const resFile = await screenTool.execute(
      { outputPath },
      { workspacePath: workspaceDir }
    );
    assert.strictEqual(resFile.success, true);
    const absPath = path.join(workspaceDir, outputPath);
    assert.ok(fs.existsSync(absPath), 'Le fichier de capture d\'écran doit être écrit sur disque');
    const bytes = fs.readFileSync(absPath);
    // Vérification de la signature binaire PNG (magic bytes)
    assert.strictEqual(bytes[0], 0x89);
    assert.strictEqual(bytes[1], 0x50); // P
    assert.strictEqual(bytes[2], 0x4E); // N
    assert.strictEqual(bytes[3], 0x47); // G

    // 3. Rejet d'un chemin de sortie hors workspace
    const resOutside = await screenTool.execute(
      { outputPath: '../../escaped_capture.png' },
      { workspacePath: workspaceDir }
    );
    assert.strictEqual(resOutside.success, false);
    assert.ok(resOutside.error?.includes('workspace') || resOutside.error?.includes('Accès refusé'));
  });

  test('6. Lecture de la console et des erreurs réseau (browser_get_logs)', async () => {
    const logsTool = new BrowserGetLogsTool();

    // Attendre la résolution des requêtes asynchrones de la page de test
    await new Promise(r => setTimeout(r, 500));

    const resLogs = await logsTool.execute({ limit: 10 }, { workspacePath: workspaceDir });
    assert.strictEqual(resLogs.success, true);
    assert.ok(resLogs.data);

    // Vérification de la console
    const conLogs = resLogs.data.consoleLogs;
    assert.ok(conLogs.length >= 2, 'Au moins 2 messages de console attendus');
    assert.ok(conLogs.some(c => c.text.includes('LOG_CONSOLE_TEST_IROKO_OK')));
    assert.ok(conLogs.some(c => c.type === 'error' && c.text.includes('ERREUR_CONSOLE_SIMULEE_TEST')));

    // Vérification des erreurs réseau (endpoint 500)
    const netErrors = resLogs.data.networkErrors;
    assert.ok(netErrors.length >= 1, 'Au moins 1 erreur réseau attendue');
    assert.ok(netErrors.some(e => e.url.includes('/api/error-endpoint')));
  });

  test('7. Interaction complète : saisie dans un champ et clic interactif', async () => {
    const fillTool = new BrowserFillTool();
    const clickTool = new BrowserClickTool();
    const context = { workspacePath: workspaceDir };

    // Saisie du nom
    const fillRes = await fillTool.execute({
      selector: '#input-test',
      text: 'Antigravity'
    }, context);
    assert.strictEqual(fillRes.success, true);

    // Clic sur le bouton de validation
    const clickRes = await clickTool.execute({
      selector: '#btn-action'
    }, context);
    assert.strictEqual(clickRes.success, true);

    // Vérification du DOM mis à jour
    const page = await browserManager.getPage();
    const resultText = await page.innerText('#output-result');
    assert.strictEqual(resultText, 'Succes Antigravity (1)');
  });

  test('8. Arrêt propre du navigateur et destruction de l\'arbre de processus (cohérent avec L8)', async () => {
    const pid = browserManager.getActivePid();
    const tempDir = browserManager.getTempProfileDir();

    assert.ok(pid && pid > 0, 'Le navigateur doit avoir un PID actif');
    assert.ok(tempDir && fs.existsSync(tempDir), 'Le dossier de profil temporaire doit exister');

    // Vérifier que le processus est en vie
    let isAliveBefore = false;
    try {
      isAliveBefore = process.kill(pid, 0);
    } catch {
      isAliveBefore = false;
    }
    assert.ok(isAliveBefore, 'Le processus navigateur doit être actif avant la fermeture');

    // Fermeture via l'outil browser_close
    const closeTool = new BrowserCloseTool();
    const closeRes = await closeTool.execute({}, { workspacePath: workspaceDir });
    assert.strictEqual(closeRes.success, true);

    // Pause pour laisser le temps à taskkill / killProcessTree de terminer
    await new Promise(r => setTimeout(r, 400));

    // Vérifier l'éradication du processus
    let isAliveAfter = true;
    try {
      process.kill(pid, 0);
    } catch {
      isAliveAfter = false;
    }
    assert.strictEqual(isAliveAfter, false, 'Le processus Chromium doit être entièrement détruit');

    // Vérifier la suppression du profil temporaire jetable
    assert.strictEqual(fs.existsSync(tempDir), false, 'Le répertoire de profil temporaire doit être supprimé');
  });
});
