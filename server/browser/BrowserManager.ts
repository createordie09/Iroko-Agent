// server/browser/BrowserManager.ts
// Cahier §16 : Agent Navigateur Headless (Playwright) pour tests et exploration locale

import os from 'os';
import path from 'path';
import fs from 'fs';
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { BrowserSecurity } from './BrowserSecurity';
import { ProcessManager } from '../tools/terminal/ProcessManager';

export interface BrowserConsoleLog {
  type: string;
  text: string;
  location?: string;
  timestamp: number;
}

export interface BrowserNetworkError {
  url: string;
  method: string;
  failure: string;
  status?: number;
  timestamp: number;
}

export interface NavigateResult {
  url: string;
  title: string;
  status: number;
  content: string;
  consoleLogs?: BrowserConsoleLog[];
  networkErrors?: BrowserNetworkError[];
}

export interface ScreenshotResult {
  path?: string;
  base64?: string;
  width: number;
  height: number;
}

export class BrowserManager {
  private server: any = null;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private tempProfileDir: string | null = null;
  private browserPid: number | null = null;
  private isLaunching: Promise<void> | null = null;
  private consoleLogs: BrowserConsoleLog[] = [];
  private networkErrors: BrowserNetworkError[] = [];
  private registeredShutdown = false;

  constructor() {
    this.registerShutdownHooks();
  }

  private registerShutdownHooks(): void {
    if (this.registeredShutdown) return;
    this.registeredShutdown = true;
    const cleanup = () => {
      this.closeSync();
    };
    process.on('exit', cleanup);
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  }

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
    await this.close();

    // Profil de navigateur isolé et jetable (§16)
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

    try {
      this.server = await chromium.launchServer(launchOptions);
    } catch (err: any) {
      if (err?.message?.includes("Executable doesn't exist") || err?.message?.includes('playwright install')) {
        try {
          this.server = await chromium.launchServer({ ...launchOptions, channel: 'msedge' });
        } catch {
          this.server = await chromium.launchServer({ ...launchOptions, channel: 'chrome' });
        }
      } else {
        throw err;
      }
    }

    this.browserPid = this.server.process()?.pid || null;
    this.browser = await chromium.connect(this.server.wsEndpoint());

    // Contexte sécurisé : téléchargements strictement désactivés par défaut (§16)
    this.context = await this.browser.newContext({
      acceptDownloads: false,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) IrokoAgent/1.0',
      viewport: { width: 1280, height: 800 }
    });

    this.page = await this.context.newPage();

    // 1. Capture de la console de la page
    this.page.on('console', (msg) => {
      const loc = msg.location();
      const locStr = loc && loc.url ? `${path.basename(loc.url)}:${loc.lineNumber}:${loc.columnNumber}` : undefined;
      const entry: BrowserConsoleLog = {
        type: msg.type(),
        text: msg.text().slice(0, 500),
        location: locStr,
        timestamp: Date.now()
      };
      this.consoleLogs.push(entry);
      if (this.consoleLogs.length > 100) this.consoleLogs.shift();
    });

    // 2. Capture des erreurs d'exécution de script (pageerror)
    this.page.on('pageerror', (err) => {
      this.consoleLogs.push({
        type: 'error',
        text: `[PageError] ${err.message || String(err)}`.slice(0, 500),
        timestamp: Date.now()
      });
      if (this.consoleLogs.length > 100) this.consoleLogs.shift();
    });

    // 3. Capture des requêtes réseau échouées (requestfailed)
    this.page.on('requestfailed', (req) => {
      const failure = req.failure()?.errorText || 'Échec réseau';
      this.networkErrors.push({
        url: req.url().slice(0, 300),
        method: req.method(),
        failure: failure.slice(0, 200),
        timestamp: Date.now()
      });
      if (this.networkErrors.length > 100) this.networkErrors.shift();
    });

    // 4. Capture des réponses HTTP 4xx et 5xx
    this.page.on('response', (res) => {
      const status = res.status();
      if (status >= 400) {
        this.networkErrors.push({
          url: res.url().slice(0, 300),
          method: res.request().method(),
          status,
          failure: `HTTP ${status} ${res.statusText()}`,
          timestamp: Date.now()
        });
        if (this.networkErrors.length > 100) this.networkErrors.shift();
      }
    });

    // 5. Blocage absolu des téléchargements
    this.page.on('download', async (download) => {
      try {
        await download.cancel();
      } catch {}
    });
  }

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
      const clone = document.body ? document.body.cloneNode(true) as HTMLElement : null;
      if (!clone) return '';
      const scripts = clone.querySelectorAll('script, style, noscript, svg');
      scripts.forEach(s => s.remove());
      return clone.innerText || clone.textContent || '';
    });

    // Neutraliser et plafonner le contenu selon la règle §26
    const sanitized = BrowserSecurity.sanitizeUntrustedContent(rawText.trim(), url);

    return {
      url: page.url(),
      title,
      status,
      content: sanitized,
      consoleLogs: this.getConsoleLogs(10),
      networkErrors: this.getNetworkErrors(10)
    };
  }

  public async screenshot(options?: { fullPage?: boolean; outputPath?: string }): Promise<ScreenshotResult> {
    const page = await this.getPage();
    const fullPage = options?.fullPage ?? false;

    if (options?.outputPath) {
      const dir = path.dirname(options.outputPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

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

  public async click(selector: string): Promise<void> {
    const page = await this.getPage();
    await page.click(selector, { timeout: 10000 });
  }

  public async fill(selector: string, text: string): Promise<void> {
    const page = await this.getPage();
    await page.fill(selector, text, { timeout: 10000 });
  }

  public async evaluate<T = any>(script: string): Promise<T> {
    const page = await this.getPage();
    return await page.evaluate(script);
  }

  public getConsoleLogs(limit: number = 50): BrowserConsoleLog[] {
    const capped = Math.min(Math.max(1, limit), 50);
    return this.consoleLogs.slice(-capped);
  }

  public getNetworkErrors(limit: number = 50): BrowserNetworkError[] {
    const capped = Math.min(Math.max(1, limit), 50);
    return this.networkErrors.slice(-capped);
  }

  public clearLogs(): void {
    this.consoleLogs = [];
    this.networkErrors = [];
  }

  public getActivePid(): number | null {
    return this.browserPid;
  }

  public getTempProfileDir(): string | null {
    return this.tempProfileDir;
  }

  /**
   * Arrêt propre du navigateur et destruction de son arbre de processus (cohérent avec L8).
   */
  public async close(): Promise<void> {
    try {
      if (this.page && !this.page.isClosed()) await this.page.close();
    } catch {}
    this.page = null;

    try {
      if (this.context) await this.context.close();
    } catch {}
    this.context = null;

    try {
      if (this.browser) await this.browser.close();
    } catch {}
    this.browser = null;

    try {
      if (this.server) await this.server.close();
    } catch {}
    this.server = null;

    // Destruction de l'arbre de processus Chromium via ProcessManager
    if (this.browserPid) {
      ProcessManager.killProcessTree(this.browserPid);
      this.browserPid = null;
    }

    if (this.tempProfileDir) {
      try {
        fs.rmSync(this.tempProfileDir, { recursive: true, force: true });
      } catch {}
      this.tempProfileDir = null;
    }

    this.clearLogs();
  }

  /**
   * Nettoyage synchrone d'urgence lors de l'arrêt du processus Node.
   */
  private closeSync(): void {
    if (this.browserPid) {
      ProcessManager.killProcessTree(this.browserPid);
      this.browserPid = null;
    }
    if (this.tempProfileDir) {
      try {
        fs.rmSync(this.tempProfileDir, { recursive: true, force: true });
      } catch {}
      this.tempProfileDir = null;
    }
  }
}

export const browserManager = new BrowserManager();
