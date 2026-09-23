// server/browser/BrowserSecurity.ts
// Cahier §16 & §26 : Sécurité de navigation, filtrage des URL et neutralisation du contenu

import net from 'net';

export type UrlRiskType = 'LOCALHOST' | 'EXTERNAL' | 'PRIVATE_NETWORK' | 'FILE' | 'INVALID';

export interface UrlClassificationResult {
  url: string;
  parsed?: URL;
  type: UrlRiskType;
  allowedByDefault: boolean;
  requiresPermission: boolean;
  reason?: string;
}

/**
 * Vérifie si une adresse IPv4 appartient à une plage privée ou réservée (RFC 1918, link-local, metadata).
 */
function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) {
    return false;
  }

  const [b0, b1] = parts;

  // 0.0.0.0/8 (adresses courantes "ce réseau")
  if (b0 === 0) return true;

  // 10.0.0.0/8 (RFC 1918)
  if (b0 === 10) return true;

  // 172.16.0.0/12 (RFC 1918 : 172.16.x.x - 172.31.x.x)
  if (b0 === 172 && b1 >= 16 && b1 <= 31) return true;

  // 192.168.0.0/16 (RFC 1918)
  if (b0 === 192 && b1 === 168) return true;

  // 169.254.0.0/16 (Link-local & metadata cloud ex: 169.254.169.254)
  if (b0 === 169 && b1 === 254) return true;

  return false;
}

/**
 * Vérifie si une adresse IPv4 ou IPv6 est une boucle locale (localhost).
 */
function isLoopback(hostname: string): boolean {
  const cleanHost = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (cleanHost === 'localhost') return true;
  if (cleanHost === '::1') return true;
  if (cleanHost.startsWith('127.')) return true;
  return false;
}

export class BrowserSecurity {
  /**
   * Analyse et classifie une URL selon les exigences de sécurité du cahier des charges (§16).
   */
  public static classifyUrl(rawUrl: string): UrlClassificationResult {
    if (!rawUrl || typeof rawUrl !== 'string') {
      return {
        url: rawUrl,
        type: 'INVALID',
        allowedByDefault: false,
        requiresPermission: false,
        reason: 'URL invalide ou vide.'
      };
    }

    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return {
        url: rawUrl,
        type: 'INVALID',
        allowedByDefault: false,
        requiresPermission: false,
        reason: 'Format d\'URL non conforme.'
      };
    }

    const protocol = parsed.protocol.toLowerCase();

    // 1. Protocole file:// (accès au système de fichiers local)
    if (protocol === 'file:') {
      return {
        url: rawUrl,
        parsed,
        type: 'FILE',
        allowedByDefault: false,
        requiresPermission: true,
        reason: 'Le protocole file:// accède aux fichiers locaux et nécessite une autorisation explicite.'
      };
    }

    // Seuls http: et https: sont supportés pour le navigateur web
    if (protocol !== 'http:' && protocol !== 'https:') {
      return {
        url: rawUrl,
        parsed,
        type: 'INVALID',
        allowedByDefault: false,
        requiresPermission: false,
        reason: `Protocole "${protocol}" non supporté pour la navigation.`
      };
    }

    const hostname = parsed.hostname.toLowerCase();

    // 2. Localhost (autorisé par défaut pour tester l'application du projet)
    if (isLoopback(hostname)) {
      return {
        url: rawUrl,
        parsed,
        type: 'LOCALHOST',
        allowedByDefault: true,
        requiresPermission: false
      };
    }

    // 3. Adresses IP privées / réseaux locaux / métadonnées cloud (bloqués sauf autorisation)
    if (net.isIP(hostname)) {
      if (net.isIPv4(hostname) && isPrivateIpv4(hostname)) {
        return {
          url: rawUrl,
          parsed,
          type: 'PRIVATE_NETWORK',
          allowedByDefault: false,
          requiresPermission: true,
          reason: `L'adresse IP privée ou réservée ${hostname} nécessite une autorisation explicite.`
        };
      }
      // IPv6 link-local ou unique local
      if (net.isIPv6(hostname)) {
        const cleanIpv6 = hostname.replace(/^\[|\]$/g, '').toLowerCase();
        if (cleanIpv6.startsWith('fe80:') || cleanIpv6.startsWith('fc') || cleanIpv6.startsWith('fd')) {
          return {
            url: rawUrl,
            parsed,
            type: 'PRIVATE_NETWORK',
            allowedByDefault: false,
            requiresPermission: true,
            reason: `L'adresse IPv6 locale ${hostname} nécessite une autorisation explicite.`
          };
        }
      }
    }

    // Noms d'hôtes spéciaux de réseaux locaux (ex: *.local, *.lan, *.internal)
    if (hostname.endsWith('.local') || hostname.endsWith('.lan') || hostname.endsWith('.internal')) {
      return {
        url: rawUrl,
        parsed,
        type: 'PRIVATE_NETWORK',
        allowedByDefault: false,
        requiresPermission: true,
        reason: `Le domaine de réseau local ${hostname} nécessite une autorisation explicite.`
      };
    }

    // 4. URL externe classique (Internet public : demande systématiquement une autorisation)
    return {
      url: rawUrl,
      parsed,
      type: 'EXTERNAL',
      allowedByDefault: false,
      requiresPermission: true,
      reason: `Navigation vers l'URL externe ${parsed.origin} requiert une autorisation.`
    };
  }

  /**
   * Neutralise et encapsule le contenu textuel extrait d'une page (§26).
   * Prévient l'injection de prompt indirecte et plafonne la taille.
   */
  public static sanitizeUntrustedContent(content: string, url: string, maxLength: number = 30000): string {
    if (!content) return '';

    // Supprimer les caractères de contrôle invisibles sauf tabulations et sauts de ligne
    let cleaned = content.replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u007F-\u009F]/g, '');

    // Plafonner la longueur
    if (cleaned.length > maxLength) {
      cleaned = cleaned.slice(0, maxLength) + `\n[... Contenu tronqué à ${maxLength} caractères ...]`;
    }

    // Encapsuler dans des balises de confinement strictes
    return [
      `[Contenu non fiable extrait de : ${url}]`,
      cleaned,
      `[/Fin du contenu non fiable de : ${url}]`
    ].join('\n');
  }
}
