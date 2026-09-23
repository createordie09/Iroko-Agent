import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { chromium } from 'playwright';
import { networkGuard } from '../server/security/NetworkGuard.ts';

// ─────────────────────────────────────────────────────────────
// 1. SCAN DU BUNDLE COMPILÉ DIST/ (ZÉRO SECRET, ZÉRO SUPABASE)
// ─────────────────────────────────────────────────────────────

test('Garde Réseau - 1. Le bundle client dist/ ne contient aucune clé d\'API ni référence à Supabase', () => {
  const distDir = path.resolve(process.cwd(), 'dist');
  assert.ok(fs.existsSync(distDir), 'Le dossier dist/ doit exister (exécuter npm run build si nécessaire).');

  const filesToScan = [];
  function collectFiles(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        collectFiles(fullPath);
      } else if (/\.(js|html|css|json)$/i.test(entry.name)) {
        filesToScan.push(fullPath);
      }
    }
  }
  collectFiles(distDir);
  assert.ok(filesToScan.length > 0, 'Des fichiers compilés doivent être présents dans dist/');

  const forbiddenPatterns = [
    { name: 'Supabase domain', regex: /supabase\.co/i },
    { name: 'Supabase anon key', regex: /sb_publishable_[a-zA-Z0-9_-]+/ },
    { name: 'Clé OpenAI hardcodée', regex: /sk-[a-zA-Z0-9]{20,}/ },
    { name: 'Clé Gemini / Google hardcodée', regex: /AIza[0-9A-Za-z-_]{35}/ },
    { name: 'Clé Anthropic hardcodée', regex: /sk-ant-[a-zA-Z0-9_-]{20,}/ },
    { name: 'Police Google distante', regex: /fonts\.googleapis\.com/i },
    { name: 'CDN noelshack favicon', regex: /noelshack\.com/i }
  ];

  for (const filePath of filesToScan) {
    const content = fs.readFileSync(filePath, 'utf8');
    for (const pattern of forbiddenPatterns) {
      const match = content.match(pattern.regex);
      assert.strictEqual(
        match,
        null,
        `Violation de confidentialité : Motif interdit trouvé dans ${path.relative(process.cwd(), filePath)} : ${pattern.name} (correspondance: ${match ? match[0] : ''})`
      );
    }
  }
});

// ─────────────────────────────────────────────────────────────
// 2. GARDE RÉSEAU DU RUNTIME (WHITELIST STRICTE DOCS/NETWORK.MD)
// ─────────────────────────────────────────────────────────────

test('Garde Réseau - 2. Validation stricte des destinations sortantes du runtime', async () => {
  // Test 2a. Destinations autorisées
  const allowedUrls = [
    'http://127.0.0.1:3001/api/health',
    'http://localhost:5173',
    'https://api.anthropic.com/v1/messages',
    'https://api.openai.com/v1/chat/completions',
    'https://generativelanguage.googleapis.com/v1beta/models',
    'https://openrouter.ai/api/v1',
    'https://api.cloudflare.com/client/v4/accounts',
    'https://api.replicate.com/v1/predictions',
    'https://queue.fal.run/fal-ai/fast-svd'
  ];

  for (const url of allowedUrls) {
    const check = networkGuard.isDestinationAllowed(url);
    assert.strictEqual(check.allowed, true, `L'URL autorisée ${url} doit être acceptée`);
  }

  // Test 2b. Destinations non autorisées bloquées
  const blockedUrls = [
    'https://pqauyxkmxnpycjiegfob.supabase.co/rest/v1/projects',
    'https://telemetry.iroko.dev/collect',
    'https://google-analytics.com/collect',
    'https://stats.segment.io/v1/t',
    'https://evil.attacker.com/leak',
    'https://fonts.googleapis.com/css',
    'http://192.168.1.50/admin'
  ];

  for (const url of blockedUrls) {
    const check = networkGuard.isDestinationAllowed(url);
    assert.strictEqual(check.allowed, false, `L'URL non répertoriée ${url} doit être bloquée`);
    assert.ok(check.reason && check.reason.includes('non autorisé'));
  }

  // Test 2c. Blocage effectif via l'intercepteur fetch
  networkGuard.install();
  try {
    await assert.rejects(
      async () => {
        await fetch('https://google-analytics.com/v1/collect');
      },
      (err) => {
        return err.code === 'ERR_NETWORK_GUARD_BLOCKED' || /Garde Réseau/i.test(err.message);
      },
      'L\'appel fetch vers un domaine non autorisé doit lever une exception bloquante'
    );
  } finally {
    networkGuard.uninstall();
  }
});

// ─────────────────────────────────────────────────────────────
// 3. TEST PLAYWRIGHT : CHARGEMENT DU FRONTEND EN CIRCUIT FERMÉ
// ─────────────────────────────────────────────────────────────

test('Garde Réseau - 3. Chargement de l\'application : zéro requête externe hors 127.0.0.1', async () => {
  let browser;
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
  } catch (e) {
    try {
      browser = await chromium.launch({ channel: 'chrome', headless: true });
    } catch {
      browser = await chromium.launch({ headless: true });
    }
  }
  const context = await browser.newContext();

  const externalRequests = [];
  const allowedHostRegex = /^(127\.0\.0\.1|localhost)(:\d+)?$/;

  // Intercepter et surveiller TOUTES les requêtes réseau émises par la page
  await context.route('**/*', (route) => {
    const reqUrl = new URL(route.request().url());
    const isDataOrBlob = reqUrl.protocol === 'data:' || reqUrl.protocol === 'blob:';

    if (!isDataOrBlob && !allowedHostRegex.test(reqUrl.host)) {
      externalRequests.push(route.request().url());
      route.abort('failed');
      return;
    }

    route.continue();
  });

  const page = await context.newPage();

  try {
    // Naviguer sur l'application locale
    await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle', timeout: 15000 });

    // Attendre que l'interface soit interactive
    await page.waitForSelector('textarea', { timeout: 10000 });

    // Vérifier qu'aucune requête externe n'a été tentée
    assert.strictEqual(
      externalRequests.length,
      0,
      `Des requêtes réseau sortantes externes ont été tentées par le frontend : ${JSON.stringify(externalRequests)}`
    );
  } finally {
    await browser.close();
  }
});

// ─────────────────────────────────────────────────────────────
// 4. EN-TÊTES DE SÉCURITÉ HTTP (CSP, NOSNIFF, NO-REFERRER)
// ─────────────────────────────────────────────────────────────

test('Garde Réseau - 4. Présence des en-têtes de sécurité stricts sur le runtime Express', async () => {
  const res = await fetch('http://127.0.0.1:3001/api/health', {
    headers: { 'Host': '127.0.0.1:3001' }
  });

  const nosniff = res.headers.get('x-content-type-options');
  const frameOptions = res.headers.get('x-frame-options');
  const referrerPolicy = res.headers.get('referrer-policy');
  const csp = res.headers.get('content-security-policy');

  assert.strictEqual(nosniff, 'nosniff', 'X-Content-Type-Options doit être nosniff');
  assert.strictEqual(frameOptions, 'DENY', 'X-Frame-Options doit être DENY');
  assert.strictEqual(referrerPolicy, 'no-referrer', 'Referrer-Policy doit être no-referrer');
  assert.ok(csp, 'L\'en-tête Content-Security-Policy doit être présent');
  assert.ok(!csp.includes('https:'), 'La CSP ne doit autoriser aucune source HTTPS externe par défaut');
});
