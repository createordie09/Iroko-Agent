import dns from 'dns';
import https from 'https';
import fs from 'fs';
import { URL } from 'url';

export interface ImageSignatureValidation {
  valid: boolean;
  detectedMime?: string;
  error?: string;
}

/**
 * Gardien de sécurité SSRF (Server-Side Request Forgery) pour le téléchargement
 * sécurisé d'images renvoyées sous forme d'URL par les fournisseurs de médias.
 * Conforme au Cahier des Charges §26.
 */
export class SsrfGuard {
  public static readonly MAX_IMAGE_BYTES = 20 * 1024 * 1024; // 20 Mo
  public static readonly DOWNLOAD_TIMEOUT_MS = 30000; // 30 secondes

  /**
   * Vérifie si une adresse IP est privée, de bouclage (loopback) ou link-local.
   */
  public static isPrivateOrLoopbackIp(ip: string): boolean {
    // Normalisation IPv6-mapped IPv4 (::ffff:127.0.0.1 -> 127.0.0.1)
    if (ip.startsWith('::ffff:')) {
      ip = ip.substring(7);
    }

    // IPv4 checks
    if (ip.includes('.')) {
      const parts = ip.split('.').map(p => parseInt(p, 10));
      if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) {
        return true; // Malformé = refusé
      }

      // 0.0.0.0/8 (Réseau courant)
      if (parts[0] === 0) return true;

      // 127.0.0.0/8 (Loopback)
      if (parts[0] === 127) return true;

      // 10.0.0.0/8 (Privé RFC 1918)
      if (parts[0] === 10) return true;

      // 172.16.0.0/12 (Privé RFC 1918)
      if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;

      // 192.168.0.0/16 (Privé RFC 1918)
      if (parts[0] === 192 && parts[1] === 168) return true;

      // 169.254.0.0/16 (Link-local RFC 3927)
      if (parts[0] === 169 && parts[1] === 254) return true;

      // 224.0.0.0/4 (Multicast)
      if (parts[0] >= 224 && parts[0] <= 239) return true;

      // 240.0.0.0/4 (Réservé)
      if (parts[0] >= 240) return true;

      return false;
    }

    // IPv6 checks
    const lower = ip.toLowerCase();
    // Loopback
    if (lower === '::1' || lower === '0:0:0:0:0:0:0:1') return true;
    // Unspecified
    if (lower === '::' || lower === '0:0:0:0:0:0:0:0') return true;
    // Unique Local (fc00::/7)
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
    // Link-local (fe80::/10)
    if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) return true;
    // Multicast (ff00::/8)
    if (lower.startsWith('ff')) return true;

    return false;
  }

  /**
   * Valide la signature des octets magiques (Magic Bytes) d'une image.
   */
  public static validateImageMagicBytes(buffer: Buffer): ImageSignatureValidation {
    if (!buffer || buffer.length < 4) {
      return { valid: false, error: 'Données binaires insuffisantes pour valider l\'image.' };
    }

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    ) {
      return { valid: true, detectedMime: 'image/png' };
    }

    // JPEG: FF D8 FF
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return { valid: true, detectedMime: 'image/jpeg' };
    }

    // GIF: 47 49 46 38 (GIF8)
    if (
      buffer.length >= 6 &&
      buffer[0] === 0x47 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x38 &&
      (buffer[4] === 0x37 || buffer[4] === 0x39) &&
      buffer[5] === 0x61
    ) {
      return { valid: true, detectedMime: 'image/gif' };
    }

    // WEBP: RIFF .... WEBP
    if (
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    ) {
      return { valid: true, detectedMime: 'image/webp' };
    }

    return { valid: false, error: 'Signature binaire de format image non reconnue (formats autorisés : PNG, JPEG, WEBP, GIF).' };
  }

  /**
   * Télécharge une image distante de manière sécurisée en prévenant les attaques SSRF.
   */
  public static async safeDownloadImage(
    imageUrl: string,
    abortSignal?: AbortSignal
  ): Promise<{ buffer: Buffer; mimeType: string }> {
    let parsed: URL;
    try {
      parsed = new URL(imageUrl);
    } catch {
      throw new Error(`URL d'image invalide : "${imageUrl}"`);
    }

    // 1. Protocole HTTPS obligatoire (jamais http:// ou file://)
    if (parsed.protocol !== 'https:') {
      throw new Error(`Protocole non sécurisé rejeté : "${parsed.protocol}". Seul le protocole HTTPS est autorisé.`);
    }

    const hostname = parsed.hostname;

    // 2. Vérification immédiate si le hostname est une IP littérale
    if (SsrfGuard.isPrivateOrLoopbackIp(hostname)) {
      throw new Error(`Accès refusé : l'adresse IP "${hostname}" est privée ou locale (protection SSRF).`);
    }

    // 3. Résolution DNS stricte de toutes les adresses associées au nom de domaine
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

    // 4. Téléchargement avec timeout et limite stricte de taille
    return new Promise<{ buffer: Buffer; mimeType: string }>((resolve, reject) => {
      const timeoutTimer = setTimeout(() => {
        req.destroy(new Error('Délai d\'attente dépassé lors du téléchargement de l\'image (timeout 30s).'));
      }, SsrfGuard.DOWNLOAD_TIMEOUT_MS);

      if (abortSignal) {
        abortSignal.addEventListener('abort', () => {
          clearTimeout(timeoutTimer);
          req.destroy(new Error('Téléchargement interrompu par l\'utilisateur.'));
        });
      }

      const req = https.get(
        imageUrl,
        {
          headers: {
            'User-Agent': 'Iroko-Agent/1.0 (MediaDownloader; +https://iroko.local)',
            'Accept': 'image/png,image/jpeg,image/webp,image/*;q=0.8'
          }
        },
        res => {
          if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
            clearTimeout(timeoutTimer);
            res.resume();
            return reject(new Error(`Échec du téléchargement de l'image : code HTTP ${res.statusCode}.`));
          }

          const chunks: Buffer[] = [];
          let totalBytes = 0;

          res.on('data', chunk => {
            totalBytes += chunk.length;
            if (totalBytes > SsrfGuard.MAX_IMAGE_BYTES) {
              clearTimeout(timeoutTimer);
              req.destroy();
              return reject(new Error(`Taille de l'image (${(totalBytes / (1024 * 1024)).toFixed(1)} Mo) supérieure à la limite maximale de 20 Mo.`));
            }
            chunks.push(chunk);
          });

          res.on('end', () => {
            clearTimeout(timeoutTimer);
            const fullBuffer = Buffer.concat(chunks);

            // 5. Validation des Magic Bytes
            const validation = SsrfGuard.validateImageMagicBytes(fullBuffer);
            if (!validation.valid) {
              return reject(new Error(validation.error || 'Fichier image invalide.'));
            }

            resolve({
              buffer: fullBuffer,
              mimeType: validation.detectedMime || 'image/png'
            });
          });
        }
      );

      req.on('error', err => {
        clearTimeout(timeoutTimer);
        reject(err);
      });
    });
  }

  /**
   * Valide la signature des octets magiques (Magic Bytes) d'une vidéo (MP4, WEBM, MOV).
   */
  public static validateVideoMagicBytes(buffer: Buffer): ImageSignatureValidation {
    if (!buffer || buffer.length < 8) {
      return { valid: false, error: 'Données binaires insuffisantes pour valider la vidéo.' };
    }

    // MP4: ISO Base Media File Format (bytes 4..7 === 'ftyp')
    if (buffer.length >= 12 && buffer.subarray(4, 8).toString('ascii') === 'ftyp') {
      return { valid: true, detectedMime: 'video/mp4' };
    }

    // WEBM: 1A 45 DF A3 (EBML)
    if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
      return { valid: true, detectedMime: 'video/webm' };
    }

    // QuickTime MOV
    if (buffer.length >= 8) {
      const boxType = buffer.subarray(4, 8).toString('ascii');
      if (['moov', 'mdat', 'wide', 'qt  '].includes(boxType)) {
        return { valid: true, detectedMime: 'video/quicktime' };
      }
    }

    return { valid: false, error: 'Signature binaire de format vidéo non reconnue (formats autorisés : MP4, WEBM, MOV).' };
  }

  /**
   * Télécharge un flux vidéo distant en streaming direct sur disque avec confinement SSRF et contrôle Magic Bytes.
   */
  public static async safeStreamDownloadVideo(
    videoUrl: string,
    destFilePath: string,
    options?: {
      maxBytes?: number;
      timeoutMs?: number;
      abortSignal?: AbortSignal;
    }
  ): Promise<{ size: number; mimeType: string }> {
    let parsed: URL;
    try {
      parsed = new URL(videoUrl);
    } catch {
      throw new Error(`URL de vidéo invalide : "${videoUrl}"`);
    }

    // 1. Protocole HTTPS obligatoire (jamais http:// ou file://)
    if (parsed.protocol !== 'https:') {
      throw new Error(`Protocole non sécurisé rejeté : "${parsed.protocol}". Seul le protocole HTTPS est autorisé.`);
    }

    const hostname = parsed.hostname;

    // 2. Vérification immédiate si le hostname est une IP littérale
    if (SsrfGuard.isPrivateOrLoopbackIp(hostname)) {
      throw new Error(`Accès refusé : l'adresse IP "${hostname}" est privée ou locale (protection SSRF).`);
    }

    // 3. Résolution DNS stricte de toutes les adresses associées au nom de domaine
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

    const maxBytes = options?.maxBytes || 200 * 1024 * 1024; // 200 Mo par défaut
    const timeoutMs = options?.timeoutMs || 120000; // 2 min par défaut

    // 4. Téléchargement streaming avec validation des magic bytes sur le premier bloc
    return new Promise<{ size: number; mimeType: string }>((resolve, reject) => {
      const timeoutTimer = setTimeout(() => {
        cleanup();
        req.destroy(new Error('Délai d\'attente dépassé lors du téléchargement de la vidéo.'));
      }, timeoutMs);

      if (options?.abortSignal) {
        options.abortSignal.addEventListener('abort', () => {
          cleanup();
          req.destroy(new Error('Téléchargement de la vidéo interrompu par l\'utilisateur.'));
        });
      }

      let fileStream: fs.WriteStream | null = null;
      let totalBytes = 0;
      let detectedMime = 'video/mp4';
      let firstChunkVerified = false;
      let initialChunkBuffer: Buffer = Buffer.alloc(0);

      const cleanup = () => {
        clearTimeout(timeoutTimer);
        if (fileStream) {
          try { fileStream.close(); } catch {}
        }
        if (fs.existsSync(destFilePath)) {
          try { fs.unlinkSync(destFilePath); } catch {}
        }
      };

      const req = https.get(
        videoUrl,
        {
          headers: {
            'User-Agent': 'Iroko-Agent/1.0 (VideoDownloader; +https://iroko.local)',
            'Accept': 'video/mp4,video/webm,video/*;q=0.8'
          }
        },
        res => {
          if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
            cleanup();
            res.resume();
            return reject(new Error(`Échec du téléchargement de la vidéo : code HTTP ${res.statusCode}.`));
          }

          fileStream = fs.createWriteStream(destFilePath);

          res.on('data', chunk => {
            totalBytes += chunk.length;

            if (totalBytes > maxBytes) {
              cleanup();
              req.destroy();
              return reject(new Error(`Taille de la vidéo (${(totalBytes / (1024 * 1024)).toFixed(1)} Mo) supérieure à la limite maximale autorisée (${(maxBytes / (1024 * 1024)).toFixed(0)} Mo).`));
            }

            if (!firstChunkVerified) {
              initialChunkBuffer = Buffer.concat([initialChunkBuffer, chunk]);
              if (initialChunkBuffer.length >= 12) {
                const check = SsrfGuard.validateVideoMagicBytes(initialChunkBuffer);
                if (!check.valid) {
                  cleanup();
                  req.destroy();
                  return reject(new Error(check.error || 'Fichier vidéo corrompu ou invalide.'));
                }
                detectedMime = check.detectedMime || 'video/mp4';
                firstChunkVerified = true;
              }
            }

            fileStream.write(chunk);
          });

          res.on('end', () => {
            clearTimeout(timeoutTimer);
            if (!firstChunkVerified && initialChunkBuffer.length > 0) {
              const check = SsrfGuard.validateVideoMagicBytes(initialChunkBuffer);
              if (!check.valid) {
                cleanup();
                return reject(new Error(check.error || 'Fichier vidéo corrompu ou invalide.'));
              }
              detectedMime = check.detectedMime || 'video/mp4';
            }

            if (fileStream) {
              fileStream.end(() => {
                resolve({ size: totalBytes, mimeType: detectedMime });
              });
            } else {
              resolve({ size: totalBytes, mimeType: detectedMime });
            }
          });

          res.on('error', err => {
            cleanup();
            reject(err);
          });
        }
      );

      req.on('error', err => {
        cleanup();
        reject(err);
      });
    });
  }
}
