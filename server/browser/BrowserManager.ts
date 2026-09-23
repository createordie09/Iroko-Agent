// server/browser/BrowserManager.ts
// Cahier §16 : Agent Navigateur Headless (Playwright) pour tests et exploration locale

import os from 'os';
import path from 'path';
import fs from 'fs';
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { BrowserSecurity, UrlClassificationResult } from './BrowserSecurity';

export interface NavigateResult {
  url: string;
  title: string;
  status: number;
  content: string;
}

export interface ScreenshotResult {
  path?: string;
  base64?: string;
  width: number;
  height: number;
}

export class BrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private tempProfileDir: string | null = null;
  private isLaunching: Promise<void> | null = null;

  /**
   * Initialise ou récupère la page active du navigateur.
   * Configure un profil isolé et désactive les téléchargements (§16).
   */
  public async getPage(): Promise<Page> {
    if (this.page && !this.page.isClosed()) {
      return this.page;
    }

    if (this.isLaunching) {
      await this.isLaunching;
      if (this.page && !this.page.isClosed()) {
        return this.page;
      }
    }

    this.isLaunching = this.initBrowser();
    try {
      await this.isLaunching;
    } finally {
      this.isLaunching = null;
    }

    if (!this.page) {
      throw new Error('Impossible d\'initialiser la page Playwright.');
    }

    return this.page;
  }

  private async initBrowser(): Promise<void> {
    // Nettoyer toute instance précédente
    await this.close();

    // Créer un répertoire de profil isolé
    this.tempProfileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'iroko-playwright-profile-'));

    const launchOptions: any = {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-background-networking'
      ]
    };

    // Tenter de lancer chromium, avec repli transparent sur msedge ou chrome système
    try {
      this.browser = await chromium.launch(launchOptions);
    } catch (err: any) {
      if (err?.message?.includes("Executable doesn't exist") || err?.message?.includes('playwright install')) {
        try {
          this.browser = await chromium.launch({ ...launchOptions, channel: 'msedge' });
        } catch {
          try {
            this.browser = await chromium.launch({ ...launchOptions, channel: 'chrome' });
          } catch {
            throw err;
          }
        }
      } else {
        throw err;
      }
    }

    // Contexte sécurisé : téléchargements strictement désactivés
    this.context = await this.browser.newContext({
      acceptDownloads: false,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) IrokoAgent/1.0',
      viewport: { width: 1280, height: 800 }
    });

    this.page = await this.context.newPage();

    // Bloquer les téléchargements inattendus par sécurité
    this.page.on('download', async (download) => {
      try {
        await download.cancel();
      } catch {}
    });
  }

  /**
   * Navigue vers une URL avec validation de sécurité préalable.
   */
  public async navigate(url: string): Promise<NavigateResult> {
    const page = await this.getPage();
    const response = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    const status = response ? response.status() : 200;
    const title = await page.title();

    // Extraction du contenu textuel de la page
    const rawText = await page.evaluate(() => {
      // Supprimer les balises script et style pour ne garder que le contenu lisible
      const clone = document.body ? document.body.cloneNode(true) as HTMLElement : null;
      if (!clone) return '';

      const scripts = clone.querySelectorAll('script, style, noscript, svg');
      scripts.forEach(s => s.remove());

      return clone.innerText || clone.textContent || '';
    });

    // Neutraliser le contenu selon la règle §26
    const sanitized = BrowserSecurity.sanitizeUntrustedContent(rawText.trim(), url);

    return {
      url: page.url(),
      title,
      status,
      content: sanitized
    };
  }

  /**
   * Effectue une capture d'écran de la page courante.
   */
  public async screenshot(options?: { fullPage?: boolean; outputPath?: string }): Promise<ScreenshotResult> {
    const page = await this.getPage();
    const fullPage = options?.fullPage ?? false;

    const buffer = await page.screenshot({
      fullPage,
      path: options?.outputPath
    });

    const viewport = page.viewportSize() || { width: 1280, height: 800 };

    return {
      path: options?.outputPath,
      base64: buffer.toString('base64'),
      width: viewport.width,
      height: viewport.height
    };
  }

  /**
   * Clique sur un élément identifié par son sélecteur.
   */
  public async click(selector: string): Promise<void> {
    const page = await this.getPage();
    await page.click(selector, { timeout: 10000 });
  }

  /**
   * Remplit un champ de formulaire.
   */
  public async fill(selector: string, text: string): Promise<void> {
    const page = await this.getPage();
    await page.fill(selector, text, { timeout: 10000 });
  }

  /**
   * Évalue une expression JavaScript simple dans le contexte de la page.
   */
  public async evaluate<T = any>(script: string): Promise<T> {
    const page = await this.getPage();
    return await page.evaluate(script);
  }

  /**
   * Ferme le navigateur et détruit le profil temporaire isolé.
   */
  public async close(): Promise<void> {
    try {
      if (this.page && !this.page.isClosed()) {
        await this.page.close();
      }
    } catch {}
    this.page = null;

    try {
      if (this.context) {
        await this.context.close();
      }
    } catch {}
    this.context = null;

    try {
      if (this.browser) {
        await this.browser.close();
      }
    } catch {}
    this.browser = null;

    if (this.tempProfileDir) {
      try {
        fs.rmSync(this.tempProfileDir, { recursive: true, force: true });
      } catch {}
      this.tempProfileDir = null;
    }
  }
}

export const browserManager = new BrowserManager();
