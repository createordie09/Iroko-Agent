import dns from 'dns';
import http from 'http';
import https from 'https';
import { URL } from 'url';
import { IrokoTool, ToolContext, ToolResult } from '../types';
import { searchGateway } from '../../search/SearchGateway';
import { searchTracker } from '../../search/SearchTracker';
import { HtmlExtractor } from '../../search/HtmlExtractor';
import { SsrfGuard } from '../../media/security/SsrfGuard';

export interface WebFetchInput {
  url: string;
}

export interface WebFetchOutput {
  url: string;
  title?: string;
  content: string;
  truncated: boolean;
  length: number;
}

export class WebFetchTool implements IrokoTool<WebFetchInput, WebFetchOutput> {
  public readonly name = 'web_fetch';
  public readonly description = 'Lit et extrait le contenu textuel d\'une page web sécurisée issue d\'une recherche récente ou fournie par l\'utilisateur.';
  public readonly category = 'search';
  public readonly permission = 'MEDIUM';
  public readonly timeoutMs = 20000;

  private static readonly MAX_PAGE_BYTES = 2 * 1024 * 1024; // 2 Mo max
  private static readonly FETCH_TIMEOUT_MS = 15000; // 15 secondes
  private static readonly MAX_REDIRECTS = 5;

  public readonly parameters = {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'L\'adresse URL sécurisée (https://) de la page web à lire.'
      }
    },
    required: ['url']
  };

  public async execute(input: WebFetchInput, context: ToolContext): Promise<ToolResult<WebFetchOutput>> {
    if (!input || !input.url || typeof input.url !== 'string' || !input.url.trim()) {
      return {
        success: false,
        error: 'Le paramètre "url" est requis et ne peut être vide.'
      };
    }

    const rawUrl = input.url.trim();

    // 1. Contrôle préalable du réglage global de permission
    const globalPerm = searchGateway.getPermission();
    if (globalPerm === 'disabled') {
      return {
        success: false,
        error: 'La recherche et la consultation web sont désactivées dans les paramètres.'
      };
    }

    // 2. Vérification que l'adresse a été vue dans un résultat de recherche ou fournie par l'utilisateur
    if (!searchTracker.isUrlAllowed(rawUrl, context.conversationId)) {
      return {
        success: false,
        error: 'Accès refusé : L\'adresse n\'a pas été trouvée dans les résultats de recherche récents ni fournie dans votre message.'
      };
    }

    // 3. Validation d'autorisation interactive / automatique
    if (globalPerm === 'ask') {
      const allowed = await context.permissionEngine.requestPermission(
        this.name,
        this.permission,
        `Lecture de la page web : ${rawUrl}`,
        { url: rawUrl }
      );
      if (!allowed) {
        return {
          success: false,
          error: 'Autorisation refusée par l\'utilisateur pour consulter cette page web.'
        };
      }
    }

    // 4. Téléchargement sécurisé avec garde SSRF et suivi des redirections
    try {
      const { html, finalUrl } = await this.safeFetchHtml(rawUrl, 0, context.abortSignal);
      const { text, truncated } = HtmlExtractor.extractText(html, 20000);

      // Extraire le titre éventuel de la balise <title>
      let title: string | undefined;
      const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
      if (titleMatch && titleMatch[1]) {
        title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
      }

      return {
        success: true,
        data: {
          url: finalUrl,
          title,
          content: text,
          truncated,
          length: text.length
        }
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Erreur lors de la lecture de la page web : ${err.message}`
      };
    }
  }

  /**
   * Effectue une requête HTTPS sécurisée avec vérification SSRF stricte à chaque étape.
   */
  private async safeFetchHtml(
    targetUrl: string,
    redirectCount: number,
    abortSignal?: AbortSignal
  ): Promise<{ html: string; finalUrl: string }> {
    if (redirectCount > WebFetchTool.MAX_REDIRECTS) {
      throw new Error(`Nombre maximal de redirections (${WebFetchTool.MAX_REDIRECTS}) dépassé.`);
    }

    let parsed: URL;
    try {
      parsed = new URL(targetUrl);
    } catch {
      throw new Error(`URL invalide : "${targetUrl}".`);
    }

    // A. Protocole HTTPS obligatoire (jamais http:// ou file://)
    if (parsed.protocol !== 'https:') {
      throw new Error(`Protocole non sécurisé rejeté : "${parsed.protocol}". Seul le protocole HTTPS est autorisé.`);
    }

    const hostname = parsed.hostname;

    // B. Rejet immédiat si le hostname est une IP privée ou de loopback
    if (SsrfGuard.isPrivateOrLoopbackIp(hostname)) {
      throw new Error(`Accès refusé : l'adresse IP "${hostname}" est privée ou locale (protection SSRF).`);
    }

    // C. Résolution DNS stricte de toutes les adresses associées
    let resolvedIps: string[] = [];
    try {
      const records = await dns.promises.lookup(hostname, { all: true });
      resolvedIps = records.map(r => r.address);
    } catch (dnsErr: any) {
      throw new Error(`Échec de la résolution DNS pour "${hostname}" : ${dnsErr.message}`);
    }

    if (resolvedIps.length === 0) {
      throw new Error(`Aucune adresse IP résolue pour l'hôte "${hostname}".`);
    }

    for (const ip of resolvedIps) {
      if (SsrfGuard.isPrivateOrLoopbackIp(ip)) {
        throw new Error(`Accès refusé : l'hôte "${hostname}" résout vers l'adresse IP privée ou locale "${ip}" (protection SSRF).`);
      }
    }

    // D. Requête HTTPS native avec timeout et limite de taille
    return new Promise((resolve, reject) => {
      let req: http.ClientRequest;

      const timeoutTimer = setTimeout(() => {
        if (req) req.destroy(new Error('Délai d\'attente dépassé lors de la lecture de la page web (timeout 15s).'));
      }, WebFetchTool.FETCH_TIMEOUT_MS);

      if (abortSignal) {
        abortSignal.addEventListener('abort', () => {
          clearTimeout(timeoutTimer);
          if (req) req.destroy(new Error('Opération interrompue par l\'utilisateur.'));
        });
      }

      req = https.get(
        targetUrl,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5',
            'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8'
          }
        },
        res => {
          // Gestion des redirections (301, 302, 303, 307, 308)
          if (res.statusCode && [301, 302, 303, 307, 308].includes(res.statusCode)) {
            clearTimeout(timeoutTimer);
            const location = res.headers.location;
            if (!location) {
              return reject(new Error(`Redirection sans en-tête Location (HTTP ${res.statusCode}).`));
            }
            res.resume();
            const nextUrl = new URL(location, targetUrl).toString();
            // Revalider l'URL de redirection dans le SearchTracker
            searchTracker.addUrls([nextUrl]);
            return resolve(this.safeFetchHtml(nextUrl, redirectCount + 1, abortSignal));
          }

          if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
            clearTimeout(timeoutTimer);
            res.resume();
            return reject(new Error(`Échec de la requête HTTP : code ${res.statusCode}.`));
          }

          const chunks: Buffer[] = [];
          let totalBytes = 0;

          res.on('data', (chunk: Buffer) => {
            totalBytes += chunk.length;
            if (totalBytes > WebFetchTool.MAX_PAGE_BYTES) {
              clearTimeout(timeoutTimer);
              req.destroy();
              return reject(new Error(`Taille de la page (${(totalBytes / (1024 * 1024)).toFixed(1)} Mo) supérieure à la limite autorisée de 2 Mo.`));
            }
            chunks.push(chunk);
          });

          res.on('end', () => {
            clearTimeout(timeoutTimer);
            const buffer = Buffer.concat(chunks);
            const html = buffer.toString('utf-8');
            resolve({ html, finalUrl: targetUrl });
          });

          res.on('error', err => {
            clearTimeout(timeoutTimer);
            reject(err);
          });
        }
      );

      req.on('error', err => {
        clearTimeout(timeoutTimer);
        reject(err);
      });
    });
  }
}
