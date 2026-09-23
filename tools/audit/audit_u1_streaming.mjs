import fs from 'node:fs';
import path from 'node:path';
import { launchAuditBrowser, setupAuditContext, rootDir } from './audit_helpers.mjs';
import { MockAuditProvider } from './fixtures/mock_provider.mjs';

const outDir = path.join(rootDir, 'docs', 'audit', 'a11y');

async function runStreamingAudit() {
  console.log('=== DÉMARRAGE MISSION U1 : AUDIT STREAMING ET ANNONCES LIVE ===\n');

  // Faux fournisseur configuré pour émettre un flux long de 5000 tokens à 120 tok/s
  const mockProvider = new MockAuditProvider({
    speed: 'fast',
    length: 5000,
    withThinking: true,
    withToolCalls: false
  });
  const port = await mockProvider.start();
  console.log(`Fournisseur mock démarré sur port ${port} (flux 5000 tokens, réflexion active)`);

  const browser = await launchAuditBrowser();

  const streamingFindings = {
    timestamp: new Date().toISOString(),
    liveRegionsFound: [],
    responseBodyIsLiveRegion: false,
    liveMutationsCount: 0,
    statusAnnouncements: [],
    focusRemainsInComposer: true,
    proof: 'MESURÉ'
  };

  try {
    const ctx = await setupAuditContext(browser, {
      theme: 'dark',
      models: [{
        id: 'mock-long-stream',
        name: 'Modèle Stream 5000 Tokens',
        provider: 'local',
        isAvailable: true,
        capabilities: { tools: true, vision: false }
      }]
    });

    const page = await ctx.newPage();
    await page.goto('http://127.0.0.1:5173', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(400);

    // 1. Détecter les régions aria-live initiales
    const initialLiveRegions = await page.evaluate(() => {
      const regions = Array.from(document.querySelectorAll('[aria-live], [role="status"], [role="alert"]'));
      return regions.map(r => ({
        tag: r.tagName.toLowerCase(),
        role: r.getAttribute('role'),
        ariaLive: r.getAttribute('aria-live'),
        ariaAtomic: r.getAttribute('aria-atomic'),
        id: r.id || r.className.slice(0, 30),
        text: r.textContent.trim().slice(0, 40)
      }));
    });
    streamingFindings.liveRegionsFound = initialLiveRegions;
    console.log(`Régions aria-live détectées initialement : ${initialLiveRegions.length}`);

    // 2. Observer les mutations sur les régions live pendant la génération
    await page.evaluate(() => {
      window.__iroko_live_mutations = [];
      const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
          window.__iroko_live_mutations.push({
            type: m.type,
            target: m.target.nodeName,
            addedText: m.target.textContent ? m.target.textContent.slice(0, 50) : '',
            time: Date.now()
          });
        }
      });

      const liveEls = document.querySelectorAll('[aria-live], [role="status"], [role="alert"]');
      for (const el of liveEls) {
        observer.observe(el, { childList: true, subtree: true, characterData: true });
      }
    });

    // 3. Saisir un prompt dans le composer
    const textarea = await page.waitForSelector('textarea');
    await textarea.fill('Analyse ergonomique sur flux de 5000 tokens.');
    await page.waitForTimeout(200);

    const sendBtn = await page.$('button[title*="Envoyer"], button[aria-label*="Envoyer"]');
    if (sendBtn) {
      await sendBtn.click().catch(() => {});
      console.log('Prompt envoyé, observation du streaming...');
      await page.waitForTimeout(1200); // laisser le streaming démarrer
    }

    // 4. Vérifier si le corps de réponse est lui-même une région live
    const responseCheck = await page.evaluate(() => {
      const messages = document.querySelectorAll('[class*="message"], [class*="prose"]');
      let bodyIsLive = false;
      for (const m of messages) {
        if (m.closest('[aria-live="polite"], [aria-live="assertive"]')) {
          bodyIsLive = true;
          break;
        }
      }
      return bodyIsLive;
    });
    streamingFindings.responseBodyIsLiveRegion = responseCheck;

    // 5. Vérifier si le bouton Envoyer est devenu un bouton "Arrêter" avec nom accessible
    const stopButtonStatus = await page.evaluate(() => {
      const stopBtn = document.querySelector('button[title*="Arrêter"], button[aria-label*="Arrêter"], button:has(svg.lucide-square)');
      return {
        found: Boolean(stopBtn),
        ariaLabel: stopBtn ? stopBtn.getAttribute('aria-label') : null,
        title: stopBtn ? stopBtn.getAttribute('title') : null
      };
    });
    streamingFindings.stopButtonStatus = stopButtonStatus;

    // 6. Récupérer les mutations de région live constatées
    const mutations = await page.evaluate(() => window.__iroko_live_mutations || []);
    streamingFindings.liveMutationsCount = mutations.length;
    streamingFindings.statusAnnouncements = mutations.slice(0, 10);

    // 7. Vérifier la persistance du focus dans le composer
    const isFocusInComposer = await page.evaluate(() => {
      const active = document.activeElement;
      return active ? active.tagName.toLowerCase() === 'textarea' : false;
    });
    streamingFindings.focusRemainsInComposer = isFocusInComposer;

    await ctx.close();
  } finally {
    await browser.close();
    await mockProvider.stop();
  }

  const reportPath = path.join(outDir, 'streaming_results.json');
  fs.writeFileSync(reportPath, JSON.stringify(streamingFindings, null, 2), 'utf-8');
  console.log(`\n=> Résultats de l'audit streaming enregistrés dans : ${reportPath}`);
  return streamingFindings;
}

runStreamingAudit().catch(err => {
  console.error('Erreur audit streaming :', err);
  process.exit(1);
});
