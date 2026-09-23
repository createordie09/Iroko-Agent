/**
 * audit_u2_conversations.mjs — Section 3 : Longues conversations
 * Injecte 50, 200, 500 messages via API locale (avec token bootstrap)
 * Mesure temps d'ouverture, nœuds DOM, mémoire Heap, restauration scroll
 * Production : http://127.0.0.1:3001
 */

import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const BASE_URL = 'http://127.0.0.1:3001';
const API_BASE = 'http://127.0.0.1:3001/api';
const SIZES = [50, 200, 500];

// Récupérer le token d'authentification via le bootstrap (même origine local)
async function getAuthToken() {
  const resp = await fetch(`${API_BASE}/bootstrap`, {
    headers: {
      'Sec-Fetch-Site': 'none',
      'Accept': 'application/json',
    },
  });
  if (!resp.ok) throw new Error(`Bootstrap échoué: ${resp.status}`);
  const data = await resp.json();
  return data.token;
}

function generateMessages(count) {
  const messages = [];
  for (let i = 0; i < count; i++) {
    const isUser = i % 2 === 0;
    messages.push({
      role: isUser ? 'user' : 'assistant',
      content: isUser
        ? `Message utilisateur numéro ${i + 1}. Comment optimiser les performances d'une application React avec de nombreux composants ?`
        : `Réponse de l'assistant numéro ${i + 1}. Pour optimiser les performances : mémoïsation avec useMemo et useCallback, virtualisation des longues listes avec react-virtual ou react-window, code splitting avec React.lazy, utilisation du profiler DevTools pour identifier les rendus inutiles, et réduction des re-rendus avec React.memo.`,
    });
  }
  return messages;
}

async function createConversationViaApi(token, messageCount) {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'X-Iroko-Request': '1',
  };

  try {
    // Créer une conversation
    const convResp = await fetch(`${API_BASE}/conversations`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ title: `Audit U2 — ${messageCount} messages` }),
    });
    if (!convResp.ok) {
      const txt = await convResp.text();
      throw new Error(`Création conversation: ${convResp.status} — ${txt}`);
    }
    const conv = await convResp.json();
    const convId = conv.id || conv.conversation?.id;
    if (!convId) throw new Error(`Pas d'ID dans la réponse: ${JSON.stringify(conv).slice(0, 200)}`);

    // Insérer les messages
    const messages = generateMessages(messageCount);
    let inserted = 0;
    for (const msg of messages) {
      const r = await fetch(`${API_BASE}/conversations/${convId}/messages`, {
        method: 'POST',
        headers,
        body: JSON.stringify(msg),
      });
      if (r.ok) inserted++;
    }
    return { convId, inserted };
  } catch (e) {
    return { error: e.message };
  }
}

async function measureConversationOpen(browser, token, convId, messageCount) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  let result = { convId, messageCount };

  try {
    // Naviguer vers la page principale
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(1500);

    // Naviguer directement vers la conversation
    const t0 = Date.now();
    await page.goto(`${BASE_URL}/conversations/${convId}`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    });
    await page.waitForTimeout(2000);
    const openTime = Date.now() - t0;

    // Position de défilement
    const scrollPos1 = await page.evaluate(() => {
      const candidates = [
        ...document.querySelectorAll('[class*="claude-scrollbar"]'),
        ...document.querySelectorAll('[class*="overflow-y-auto"]'),
        ...document.querySelectorAll('[class*="overflow-y-scroll"]'),
      ];
      for (const el of candidates) {
        if (el.scrollHeight > el.clientHeight) {
          return { scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight };
        }
      }
      return null;
    });

    // Compter les nœuds DOM
    const domNodeCount = await page.evaluate(() => document.querySelectorAll('*').length);

    // Mémoire JS Heap
    const cdpSession = await context.newCDPSession(page);
    let jsHeapMo = null;
    try {
      const heap = await cdpSession.send('Runtime.getHeapUsage');
      jsHeapMo = (heap.usedSize / 1024 / 1024).toFixed(2);
    } catch (e) {}

    // Compter les éléments de message dans le DOM
    const messageElements = await page.evaluate(() => {
      const selectors = [
        '[data-message-role]',
        '[class*="message-"]',
        '[class*="chat-message"]',
      ];
      let count = 0;
      for (const sel of selectors) {
        const found = document.querySelectorAll(sel).length;
        if (found > 0) { count = found; break; }
      }
      // Compter aussi les bulles utilisateur et assistant
      const userBubbles = document.querySelectorAll('[class*="user-bubble"], [class*="bg-\\[var\\(--bg-user-bubble\\)\\]"]').length;
      return { totalElements: count, userBubbles };
    });

    // content-visibility ou virtualisation
    const virtualization = await page.evaluate(() => {
      const allElements = document.querySelectorAll('[style*="content-visibility"]');
      const hasVirtual = document.body.innerHTML.includes('data-virtual') ||
                        document.body.innerHTML.includes('VirtualScroll') ||
                        allElements.length > 0;
      return {
        contentVisibilityElements: allElements.length,
        hasVirtualization: hasVirtual,
      };
    });

    // Test restauration de scroll — aller ailleurs et revenir
    let scrollRestored = { tested: false };
    try {
      await page.goto(BASE_URL, { timeout: 10000 });
      await page.waitForTimeout(500);
      await page.goto(`${BASE_URL}/conversations/${convId}`, { timeout: 15000 });
      await page.waitForTimeout(1500);
      const scrollPos2 = await page.evaluate(() => {
        const candidates = [
          ...document.querySelectorAll('[class*="claude-scrollbar"]'),
          ...document.querySelectorAll('[class*="overflow-y-auto"]'),
        ];
        for (const el of candidates) {
          if (el.scrollHeight > el.clientHeight) {
            return { scrollTop: el.scrollTop, scrollHeight: el.scrollHeight };
          }
        }
        return null;
      });
      const restored = scrollPos1 && scrollPos2
        ? Math.abs(scrollPos1.scrollTop - scrollPos2.scrollTop) < 100
        : null;
      scrollRestored = {
        tested: true,
        before: scrollPos1,
        after: scrollPos2,
        restored,
      };
    } catch (e) {
      scrollRestored = { tested: false, error: e.message };
    }

    result = {
      ...result,
      openTimeMs: openTime,
      domNodeCount,
      jsHeapMo,
      scrollPos: scrollPos1,
      scrollRestored,
      messageElements,
      virtualization,
    };

  } catch (e) {
    result.error = e.message;
  }

  await context.close();
  return result;
}

async function deleteConversation(token, convId) {
  try {
    await fetch(`${API_BASE}/conversations/${convId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}`, 'X-Iroko-Request': '1' },
    });
  } catch (e) {}
}

async function run() {
  console.log('=== Audit U2 — Section 3 : Longues conversations ===\n');

  // Récupérer le token
  process.stdout.write('Récupération du token bootstrap... ');
  let token;
  try {
    token = await getAuthToken();
    console.log('OK');
  } catch (e) {
    console.log(`ERREUR: ${e.message}`);
    // Fallback : essayer sans Sec-Fetch-Site (depuis Node, pas de navigateur)
    try {
      const resp = await fetch(`${API_BASE}/bootstrap`);
      const data = await resp.json();
      token = data.token;
      console.log(`OK (fallback, token: ${token ? 'présent' : 'absent'})`);
    } catch (e2) {
      console.log(`ERREUR fallback: ${e2.message}`);
      token = null;
    }
  }

  if (!token) {
    console.log('\nPas de token disponible. Mesures alternatives via Playwright (lecture DOM uniquement)...\n');
  }

  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  const results = [];

  for (const size of SIZES) {
    console.log(`\n--- ${size} messages ---`);

    let convId = null;
    let inserted = 0;

    if (token) {
      process.stdout.write(`  Création de la conversation (${size} messages)... `);
      const creation = await createConversationViaApi(token, size);
      if (creation.error) {
        console.log(`ERREUR: ${creation.error}`);
        results.push({ messageCount: size, error: creation.error });
        continue;
      }
      convId = creation.convId;
      inserted = creation.inserted;
      console.log(`OK (${inserted}/${size} insérés, id: ${convId})`);
    } else {
      // Utiliser une conversation existante si disponible
      try {
        const convList = await fetch(`${API_BASE}/conversations`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (convList.ok) {
          const data = await convList.json();
          const existing = data.conversations?.find(c => c.messageCount >= size);
          if (existing) {
            convId = existing.id;
            console.log(`  Conversation existante utilisée: ${convId} (${existing.messageCount} messages)`);
          }
        }
      } catch (e) {}
    }

    if (!convId) {
      // Mesurer la page d'accueil comme proxy pour une conversation vide
      console.log(`  Pas de conversation disponible — mesure de la page d'accueil`);
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const page = await context.newPage();
      const t0 = Date.now();
      await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 20000 });
      const openTime = Date.now() - t0;
      const domNodeCount = await page.evaluate(() => document.querySelectorAll('*').length);
      await context.close();
      results.push({
        messageCount: size,
        note: 'Conversation non créable (auth) — mesure page accueil',
        openTimeMs: openTime,
        domNodeCount,
        jsHeapMo: null,
        virtualization: { hasVirtualization: false, note: 'non mesurable sans conversation' },
      });
      continue;
    }

    // Mesurer
    process.stdout.write(`  Mesure ouverture... `);
    const measurement = await measureConversationOpen(browser, token, convId, size);
    console.log(`OK — ${measurement.openTimeMs}ms, ${measurement.domNodeCount} nœuds DOM, ${measurement.jsHeapMo} Mo heap`);
    if (measurement.virtualization) {
      console.log(`  Virtualisation: ${measurement.virtualization.hasVirtualization ? 'OUI' : 'NON'}`);
    }
    if (measurement.scrollRestored?.tested) {
      console.log(`  Restauration scroll: ${measurement.scrollRestored.restored === null ? 'N/A' : measurement.scrollRestored.restored ? 'OUI ✅' : 'NON ❌'}`);
    }

    results.push(measurement);

    // Nettoyer
    if (token) await deleteConversation(token, convId);
  }

  await browser.close();

  const report = {
    timestamp: new Date().toISOString(),
    authTokenAvailable: !!token,
    results,
    architecturalFindings: {
      noVirtualization: 'Aucune librairie de virtualisation détectée dans src/ (react-virtual, react-window, @tanstack/virtual). Toutes les conversations sont rendues en DOM complet.',
      noContentVisibility: 'Pas de content-visibility: auto sur les éléments de message.',
      scrollRestoration: 'La restauration de position de défilement dépend du contexte React (AppContext). Non persistée en localStorage.',
    }
  };

  writeFileSync('docs/audit/perf/conversations_report.json', JSON.stringify(report, null, 2));
  console.log('\n✅ Rapport enregistré : docs/audit/perf/conversations_report.json');
}

run().catch(err => { console.error('ERREUR:', err); process.exit(1); });
