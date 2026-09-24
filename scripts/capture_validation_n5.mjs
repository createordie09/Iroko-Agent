import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const outDir = path.join(rootDir, 'docs', 'audit', 'validation');
const artifactDir = 'C:\\Users\\DELL\\.gemini\\antigravity\\brain\\d7d76e62-85aa-46ae-912e-623108e41281';

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

async function run() {
  console.log('--- Démarrage de la capture réelle des 9 états pour validation N5 ---');
  let browser;
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
  } catch (e) {
    browser = await chromium.launch({ headless: true });
  }

  const setupBaseRoutes = async (ctx, theme = 'dark', activeTasks = []) => {
    await ctx.route('**/api/bootstrap', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ token: 'mock-valid-token-12345678', workspace: 'C:\\test-workspace' })
    }));

    await ctx.route('**/api/ws-ticket', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ticket: 'mock-ws-ticket-abc' })
    }));

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

    await ctx.route('**/api/media/settings', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ isConfigured: true, provider: 'mock' })
    }));

    await ctx.route('**/api/media/video/settings', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ isConfigured: true, provider: 'mock' })
    }));

    await ctx.route('**/api/media/jobs*', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ jobs: [] })
    }));

    await ctx.route('**/api/artifacts*', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ artifacts: [] })
    }));

    await ctx.route('**/api/agent/active-tasks', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ activeConversationIds: activeTasks })
    }));

    await ctx.route('**/api/projects', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ projects: [] })
    }));

    await ctx.route('**/api/providers', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        providers: [{
          id: 'mock',
          name: 'Mock Local',
          hasKey: true,
          isConfigured: true,
          isActive: true
        }],
        defaultProvider: 'mock',
        fallbackPolicy: null,
        defaultStrategy: null
      })
    }));

    await ctx.route('**/api/models*', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        models: [{
          id: 'mock/claude-3-7-sonnet',
          name: 'Sonnet 3.7 (Local)',
          publisher: 'Anthropic',
          contextWindow: 200000,
          maxOutputTokens: 64000,
          priceTier: 'premium',
          capabilities: { vision: true, nativePdf: true, audio: false, video: true, tools: true, reasoning: true }
        }],
        total: 1,
        view: 'short',
        provider: 'mock',
        defaultModel: 'mock/claude-3-7-sonnet'
      })
    }));

    await ctx.addInitScript((t) => {
      // Mock WebSocket étanche pour simuler les événements du daemon agent
      class MockWebSocket extends EventTarget {
        constructor(url) {
          super();
          this.url = url;
          this.readyState = 1; // OPEN
          window.__mockWs = this;
          setTimeout(() => {
            if (this.onopen) this.onopen(new Event('open'));
            this.dispatchEvent(new Event('open'));
          }, 20);
        }
        send(data) {}
        close() {
          this.readyState = 3;
          if (this.onclose) this.onclose(new Event('close'));
        }
      }
      window.WebSocket = MockWebSocket;

      localStorage.removeItem('iroko_history');
      localStorage.removeItem('iroko_projects');
      localStorage.setItem('iroko_active_model', 'mock/claude-3-7-sonnet');
      localStorage.setItem('iroko_font', 'sans');
      localStorage.setItem('iroko_theme', t);
      localStorage.setItem('iroko_animations', 'system');
      localStorage.setItem('iroko_voice_lang', 'Français');
      localStorage.setItem('iroko_voice_uri', '');
      localStorage.setItem('iroko_voice_speed', 'Normale');
      localStorage.setItem('iroko_notifications_enabled', 'false');
    }, theme);
  };

  const saveBoth = (filename, buf) => {
    const dest1 = path.join(outDir, filename);
    fs.writeFileSync(dest1, buf);
    if (fs.existsSync(artifactDir)) {
      const dest2 = path.join(artifactDir, filename);
      fs.writeFileSync(dest2, buf);
    }
    console.log(`[OK] Capture enregistrée : ${filename}`);
  };

  // ─────────────────────────────────────────────────────────────
  // 1 & 2. THÈME CLAIR (ACCUEIL & PARAMÈTRES) - 1920x1080
  // ─────────────────────────────────────────────────────────────
  console.log('1/9 Capture theme_clair_accueil.png...');
  const ctxLight = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await setupBaseRoutes(ctxLight, 'light');
  await ctxLight.route('**/api/conversations', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ conversations: [] })
  }));

  const pageLight = await ctxLight.newPage();
  await pageLight.goto('http://127.0.0.1:5173');
  await pageLight.waitForSelector('textarea', { timeout: 10000 });
  await pageLight.waitForTimeout(500);

  const bufAccueilClair = await pageLight.screenshot();
  saveBoth('theme_clair_accueil.png', bufAccueilClair);

  console.log('2/9 Capture theme_clair_parametres.png...');
  const settingsBtn = await pageLight.$('button[title="Paramètres"]');
  if (settingsBtn) {
    await settingsBtn.click();
    await pageLight.waitForSelector('text=Apparence', { timeout: 5000 }).catch(() => {});
    await pageLight.waitForTimeout(500);
  }
  const bufParamClair = await pageLight.screenshot();
  saveBoth('theme_clair_parametres.png', bufParamClair);
  await ctxLight.close();

  // ─────────────────────────────────────────────────────────────
  // 3. SKIP LINK FOCUS - 1920x1080
  // ─────────────────────────────────────────────────────────────
  console.log('3/9 Capture skip_link_focus.png...');
  const ctxSkip = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await setupBaseRoutes(ctxSkip, 'dark');
  await ctxSkip.route('**/api/conversations', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ conversations: [] })
  }));
  const pageSkip = await ctxSkip.newPage();
  await pageSkip.goto('http://127.0.0.1:5173');
  await pageSkip.waitForSelector('textarea', { timeout: 10000 });
  await pageSkip.locator('a[href="#main-content"]').focus();
  await pageSkip.waitForTimeout(300);
  const bufSkip = await pageSkip.screenshot();
  saveBoth('skip_link_focus.png', bufSkip);
  await ctxSkip.close();

  // ─────────────────────────────────────────────────────────────
  // 4. SIDEBAR AVEC TÂCHE ACTIVE EN ARRIÈRE-PLAN (PASTILLE 8PX)
  // ─────────────────────────────────────────────────────────────
  console.log('4/9 Capture sidebar_tache_active_background.png...');
  const ctxTask = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const sampleConvId = 'conv-bg-task-42';
  await setupBaseRoutes(ctxTask, 'dark', [sampleConvId]);
  await ctxTask.route('**/api/conversations', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      conversations: [
        {
          id: sampleConvId,
          title: 'Refactorisation agent backend',
          updatedAt: Date.now(),
          mode: 'code'
        }
      ]
    })
  }));
  const pageTask = await ctxTask.newPage();
  await pageTask.goto('http://127.0.0.1:5173');
  await pageTask.waitForSelector('text=Refactorisation agent backend', { timeout: 10000 });
  await pageTask.waitForTimeout(500);
  const bufTask = await pageTask.screenshot();
  saveBoth('sidebar_tache_active_background.png', bufTask);
  await ctxTask.close();

  // ─────────────────────────────────────────────────────────────
  // 5 & 6. COMPOSER MENU '+' ET PUCES MÉDIAS
  // ─────────────────────────────────────────────────────────────
  console.log('5/9 Capture composer_menu_plus_medias.png...');
  const ctxMedia = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await setupBaseRoutes(ctxMedia, 'dark');
  await ctxMedia.route('**/api/conversations', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ conversations: [] })
  }));
  const pageMedia = await ctxMedia.newPage();
  await pageMedia.goto('http://127.0.0.1:5173');
  await pageMedia.waitForSelector('button[aria-label="Options d\'ajout et gestion des outils"]', { timeout: 10000 });
  await pageMedia.click('button[aria-label="Options d\'ajout et gestion des outils"]');
  await pageMedia.waitForSelector('text=Créer une image', { timeout: 5000 });
  await pageMedia.waitForTimeout(300);
  const bufMenuPlus = await pageMedia.screenshot();
  saveBoth('composer_menu_plus_medias.png', bufMenuPlus);

  console.log('6/9 Capture composer_puces_media.png...');
  // Cliquer sur "Créer une image"
  await pageMedia.click('text=Créer une image');
  await pageMedia.waitForTimeout(300);
  // Rouvrir le menu et cliquer sur "Créer une vidéo"
  await pageMedia.click('button[aria-label="Options d\'ajout et gestion des outils"]');
  await pageMedia.waitForSelector('text=Créer une vidéo', { timeout: 5000 });
  await pageMedia.click('text=Créer une vidéo');
  await pageMedia.waitForTimeout(400);

  const bufPuces = await pageMedia.screenshot();
  saveBoth('composer_puces_media.png', bufPuces);
  await ctxMedia.close();

  // ─────────────────────────────────────────────────────────────
  // 7, 8 & 9. CONVERSATION : MENU EXPORT, JAUGE 60% & REVENIR EN BAS
  // ─────────────────────────────────────────────────────────────
  console.log('7/9, 8/9 & 9/9 Configuration de la vue conversationnelle...');
  const ctxConv = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const activeConvId = 'conv-chat-audit-5';
  await setupBaseRoutes(ctxConv, 'dark');

  const longAssistantMessage = `### Analyse d'architecture logicielle

Voici l'analyse complète de l'application Iroko :

1. **Architecture modulaire** : Tous les composants respectent le plafond strict de 400 lignes et s'appuient sur un découpage en fonctionnalités dédiées.
2. **Confinement des chemins** : Le validateur de sécurité neutralise toutes les traversées de répertoires, les chemins UNC et les flux alternatifs NTFS.
3. **Chiffrement AES-256-GCM** : Toutes les clés API sont chiffrées avec un vecteur d'initialisation aléatoire de 12 octets et une clé maîtresse stockée hors du dépôt.
4. **Garde Réseau** : Zéro appel externe non vérifié, neutralisation complète de toute tentative d'exfiltration.
5. **Protection SSRF** : Filtrage strict des adresses IP locales et privées sur tous les téléchargements d'images et requêtes web.
6. **Accessibilité WCAG 2.2 AA** : Repères sémantiques complets, focus visible contrasté, régions en direct cadencées par phrase.

${Array.from({ length: 20 }, (_, i) => `Paragraphe d'analyse technique ${i + 1} détaillant les garanties de robustesse et d'étanchéité du runtime local. Chaque étape démontre l'absence de régression visuelle et de fuite de mémoire.`).join('\n\n')}`;

  await ctxConv.route('**/api/conversations', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      conversations: [
        {
          id: activeConvId,
          title: 'Audit de conformité architecturale',
          updatedAt: Date.now(),
          mode: 'chat'
        }
      ]
    })
  }));

  await ctxConv.route(`**/api/conversations/${activeConvId}`, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      conversation: {
        id: activeConvId,
        title: 'Audit de conformité architecturale',
        updated_at: new Date().toISOString(),
        mode: 'chat'
      },
      messages: [
        {
          id: 'msg-user-1',
          role: 'user',
          content: 'Fais-moi un rapport sur l\'architecture et les vérifications de sécurité.',
          created_at: new Date(Date.now() - 60000).toISOString()
        },
        {
          id: 'msg-asst-1',
          role: 'assistant',
          content: longAssistantMessage,
          created_at: new Date().toISOString()
        }
      ]
    })
  }));

  const pageConv = await ctxConv.newPage();
  await pageConv.goto('http://127.0.0.1:5173');
  await pageConv.waitForSelector('text=Audit de conformité architecturale', { timeout: 10000 });
  await pageConv.click('text=Audit de conformité architecturale');
  await pageConv.waitForSelector('article', { timeout: 10000 });
  await pageConv.waitForTimeout(500);

  // 7. Menu Export Topbar
  console.log('7/9 Capture topbar_menu_export_ouvert.png...');
  await pageConv.waitForSelector('button[title="Options d\'export"]', { timeout: 5000 });
  await pageConv.click('button[title="Options d\'export"]');
  await pageConv.waitForSelector('text=Exporter en Markdown (.md)', { timeout: 5000 });
  await pageConv.waitForTimeout(300);
  const bufExport = await pageConv.screenshot();
  saveBoth('topbar_menu_export_ouvert.png', bufExport);
  await pageConv.keyboard.press('Escape');
  await pageConv.waitForTimeout(300);

  // 8. Jauge de contexte 60%
  console.log('8/9 Capture composer_jauge_contexte_60.png...');
  await pageConv.evaluate(() => {
    if (window.__mockWs && window.__mockWs.onmessage) {
      window.__mockWs.onmessage({
        data: JSON.stringify({
          type: 'context_usage',
          usage: {
            inputTokens: 120000,
            outputTokens: 0,
            totalTokens: 120000,
            contextWindow: 200000,
            isEstimate: false,
            ratio: 0.60
          }
        })
      });
    }
  });
  await pageConv.waitForSelector('text=Contexte : 60 %', { timeout: 5000 });
  await pageConv.waitForTimeout(300);
  const bufJauge = await pageConv.screenshot();
  saveBoth('composer_jauge_contexte_60.png', bufJauge);

  // 9. Bouton "Revenir en bas"
  console.log('9/9 Capture chat_bouton_revenir_en_bas.png...');
  await pageConv.evaluate(() => {
    // Faire défiler le conteneur principal de discussion vers le haut
    const scrollables = Array.from(document.querySelectorAll('.overflow-y-auto'));
    for (const el of scrollables) {
      if (el.scrollHeight > el.clientHeight + 100) {
        el.scrollTop = 0;
        el.dispatchEvent(new Event('scroll'));
        el.dispatchEvent(new WheelEvent('wheel', { deltaY: -600 }));
      }
    }
  });
  await pageConv.waitForSelector('button:has-text("Revenir en bas")', { timeout: 5000 });
  await pageConv.waitForTimeout(300);
  const bufScrollBtn = await pageConv.screenshot();
  saveBoth('chat_bouton_revenir_en_bas.png', bufScrollBtn);

  await ctxConv.close();
  await browser.close();
  console.log('✅ Les 9 captures réelles ont été générées avec succès dans docs/audit/validation/ !');
}

run().catch(err => {
  console.error('Erreur lors des captures :', err);
  process.exit(1);
});
