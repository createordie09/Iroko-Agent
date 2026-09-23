import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';
import mammoth from 'mammoth';
import { AttachmentMetadata, AttachmentReaderResult } from './types';

// Extraction PDF sécurisée avec pdfjs-dist
async function extractPdfText(buffer: Buffer): Promise<{
  text: string;
  pageCount: number;
  isScanned: boolean;
  isEncrypted: boolean;
}> {
  try {
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.js');
    // Convert Buffer to Uint8Array for pdfjs-dist
    const uint8Array = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);

    const loadingTask = pdfjsLib.getDocument({
      data: uint8Array,
      isEvalSupported: false,
      useSystemFonts: true
    });

    let doc;
    try {
      doc = await loadingTask.promise;
    } catch (err: any) {
      if (err?.name === 'PasswordException' || (err?.message && err.message.toLowerCase().includes('password'))) {
        return { text: '', pageCount: 0, isScanned: false, isEncrypted: true };
      }
      throw err;
    }

    const pageCount = doc.numPages;
    const pageTexts: string[] = [];
    let totalChars = 0;

    for (let i = 1; i <= pageCount; i++) {
      const page = await doc.getPage(i);
      const textContent = await page.getTextContent();
      const items = textContent.items as Array<{ str: string }>;
      const pageText = items.map(item => item.str).join(' ').trim();
      if (pageText) {
        pageTexts.push(`--- Page ${i} ---\n${pageText}`);
        totalChars += pageText.length;
      }
    }

    const isScanned = totalChars === 0 && pageCount > 0;
    return {
      text: pageTexts.join('\n\n'),
      pageCount,
      isScanned,
      isEncrypted: false
    };
  } catch (err: any) {
    if (err?.name === 'PasswordException' || (err?.message && err.message.toLowerCase().includes('password'))) {
      return { text: '', pageCount: 0, isScanned: false, isEncrypted: true };
    }
    throw err;
  }
}

// Décodage texte avec détection d'encodage (BOM, UTF-8, Windows-1252)
export function decodeTextBuffer(buffer: Buffer): { text: string; encoding: string } {
  // 1. Détection par BOM
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return { text: buffer.subarray(3).toString('utf-8'), encoding: 'UTF-8 with BOM' };
  }
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return { text: buffer.subarray(2).toString('utf16le'), encoding: 'UTF-16LE with BOM' };
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    // UTF-16BE: swap bytes and read as UTF-16LE
    const swapped = Buffer.from(buffer.subarray(2));
    swapped.swap16();
    return { text: swapped.toString('utf16le'), encoding: 'UTF-16BE with BOM' };
  }

  // 2. Tenter UTF-8 standard
  try {
    const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
    const text = utf8Decoder.decode(buffer);
    return { text, encoding: 'UTF-8' };
  } catch {
    // 3. Fallback Windows-1252 / ISO-8859-1
    try {
      const winDecoder = new TextDecoder('windows-1252');
      const text = winDecoder.decode(buffer);
      return { text, encoding: 'Windows-1252' };
    } catch {
      return { text: buffer.toString('latin1'), encoding: 'ISO-8859-1' };
    }
  }
}

// Extraction Excel / Tableur (XLSX)
async function extractSpreadsheet(buffer: Buffer): Promise<{ content: string; sheetNames: string[] }> {
  const zip = await JSZip.loadAsync(buffer);
  const sheetNames: string[] = [];
  const sheetsContent: string[] = [];

  // 1. Lire sharedStrings.xml si présent
  const sharedStrings: string[] = [];
  const sharedStringsFile = zip.file('xl/sharedStrings.xml');
  if (sharedStringsFile) {
    const xml = await sharedStringsFile.async('text');
    const matches = xml.matchAll(/<t[^>]*>(.*?)<\/t>/gs);
    for (const match of matches) {
      sharedStrings.push(match[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
    }
  }

  // 2. Lire workbook.xml pour les noms de feuilles
  const workbookFile = zip.file('xl/workbook.xml');
  if (workbookFile) {
    const xml = await workbookFile.async('text');
    const sheetMatches = xml.matchAll(/<sheet[^>]*name="([^"]+)"[^>]*sheetId="([^"]+)"/g);
    for (const m of sheetMatches) {
      sheetNames.push(m[1]);
    }
  }

  // 3. Lire les feuilles (worksheets/sheet*.xml)
  const worksheetFiles = Object.keys(zip.files).filter(k => k.startsWith('xl/worksheets/sheet') && k.endsWith('.xml'));
  for (let idx = 0; idx < worksheetFiles.length; idx++) {
    const file = zip.file(worksheetFiles[idx]);
    if (!file) continue;
    const name = sheetNames[idx] || `Feuille ${idx + 1}`;
    const xml = await file.async('text');

    // Parser les lignes et cellules
    const rows: string[][] = [];
    const rowMatches = xml.matchAll(/<row[^>]*>(.*?)<\/row>/gs);

    let rowCount = 0;
    for (const rMatch of rowMatches) {
      if (rowCount++ >= 50) break; // Limite 50 premières lignes
      const rowXml = rMatch[1];
      const cells: string[] = [];
      const cellMatches = rowXml.matchAll(/<c[^>]*?(?:t="([^"]*)")?[^>]*>(?:<v>(.*?)<\/v>)?<\/c>/gs);

      let colCount = 0;
      for (const cMatch of cellMatches) {
        if (colCount++ >= 20) break; // Limite 20 colonnes
        const type = cMatch[1];
        let val = cMatch[2] || '';
        if (type === 's' && sharedStrings[parseInt(val, 10)] !== undefined) {
          val = sharedStrings[parseInt(val, 10)];
        }
        cells.push(val.replace(/[\r\n\t]/g, ' ').trim());
      }
      if (cells.some(c => c.length > 0)) {
        rows.push(cells);
      }
    }

    if (rows.length > 0) {
      const mdRows = rows.map(r => `| ${r.join(' | ')} |`).join('\n');
      const headerSep = rows[0] ? `| ${rows[0].map(() => '---').join(' | ')} |` : '';
      sheetsContent.push(`### Feuille : ${name}\n\n${rows[0] ? `| ${rows[0].join(' | ')} |\n${headerSep}\n` + rows.slice(1).map(r => `| ${r.join(' | ')} |`).join('\n') : mdRows}`);
    }
  }

  return {
    content: sheetsContent.join('\n\n') || 'Tableur vide.',
    sheetNames
  };
}

// Extraction OpenDocument (ODT / ODS)
async function extractOpenDocument(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const contentFile = zip.file('content.xml');
  if (!contentFile) return 'Document OpenDocument sans contenu XML.';
  const xml = await contentFile.async('text');
  // Extraire le texte des balises <text:p> et <text:h>
  const paragraphs: string[] = [];
  const matches = xml.matchAll(/<text:[ph][^>]*>(.*?)<\/text:[ph]>/gs);
  for (const m of matches) {
    const clean = m[1].replace(/<[^>]+>/g, '').trim();
    if (clean) paragraphs.push(clean);
  }
  return paragraphs.join('\n\n');
}

// Inspection d'archive ZIP avec protection zip-slip et bombes
async function inspectZipArchive(buffer: Buffer): Promise<{
  entries: Array<{ name: string; size: number }>;
  isZipSlip: boolean;
  isCompressionBomb: boolean;
}> {
  const zip = await JSZip.loadAsync(buffer);
  const entries: Array<{ name: string; size: number }> = [];

  let totalCompressed = 0;
  let totalUncompressed = 0;
  let isZipSlip = false;

  for (const [filename, fileObj] of Object.entries(zip.files)) {
    // 1. Vérification Zip-Slip
    // Normaliser le chemin et vérifier qu'il ne contient pas '..' ou ne commence pas par '/' ou '\\'
    const normalized = path.normalize(filename);
    if (
      normalized.startsWith('..') ||
      path.isAbsolute(normalized) ||
      filename.includes('..') ||
      filename.startsWith('/') ||
      filename.startsWith('\\')
    ) {
      isZipSlip = true;
      break;
    }

    const uncompressedSize = (fileObj as any)._data?.uncompressedSize || 0;
    const compressedSize = (fileObj as any)._data?.compressedSize || 0;

    totalUncompressed += uncompressedSize;
    totalCompressed += compressedSize;

    entries.push({
      name: filename,
      size: uncompressedSize
    });
  }

  // 2. Vérification Bombe de décompression
  // Ratio > 100:1 avec taille décompressée > 10 Mo OU taille décompressée totale > 100 Mo
  const isCompressionBomb =
    totalUncompressed > 100 * 1024 * 1024 ||
    (totalCompressed > 0 && (totalUncompressed / totalCompressed) > 100 && totalUncompressed > 1024 * 1024);

  return {
    entries,
    isZipSlip,
    isCompressionBomb
  };
}

export class AttachmentReader {
  public static async readAttachment(
    attachment: AttachmentMetadata,
    options: {
      maxCharacters?: number;
      offset?: number;
      limit?: number;
      timeoutMs?: number;
    } = {}
  ): Promise<AttachmentReaderResult> {
    const maxChars = options.maxCharacters ?? 30000;
    const timeoutMs = options.timeoutMs ?? 30000;
    const filePath = attachment.filePath;

    if (!filePath || !fs.existsSync(filePath)) {
      return {
        type: 'binary',
        error: `Fichier introuvable sur le disque (${attachment.name}).`
      };
    }

    // Exécution bornée par un timeout strict (30 secondes)
    return Promise.race([
      AttachmentReader.executeExtraction(attachment, filePath, maxChars, options),
      new Promise<AttachmentReaderResult>((_, reject) =>
        setTimeout(() => reject(new Error('Délai d\'extraction dépassé (timeout 30 s).')), timeoutMs)
      )
    ]);
  }

  private static async executeExtraction(
    attachment: AttachmentMetadata,
    filePath: string,
    maxChars: number,
    options: { offset?: number; limit?: number }
  ): Promise<AttachmentReaderResult> {
    const buffer = fs.readFileSync(filePath);
    const category = attachment.detectedType;

    // 1. Images
    if (category === 'image') {
      const base64 = buffer.toString('base64');
      return {
        type: 'image',
        content: `data:${attachment.mimeType};base64,${base64}`,
        metadata: {
          size: attachment.size,
          mimeType: attachment.mimeType
        }
      };
    }

    // 2. Documents PDF
    if (category === 'pdf') {
      const result = await extractPdfText(buffer);
      if (result.isEncrypted) {
        return {
          type: 'pdf',
          pageCount: 0,
          error: 'Ce document PDF est protégé par un mot de passe et ne peut pas être lu.'
        };
      }
      if (result.isScanned) {
        return {
          type: 'pdf',
          pageCount: result.pageCount,
          content: `[Document PDF scanné (${result.pageCount} page(s)) : aucune couche de texte numérique détectée. Ce document nécessite une analyse visuelle.]`
        };
      }

      let content = result.text;
      let truncated = false;
      if (content.length > maxChars) {
        content = content.slice(0, maxChars) + `\n\n[... Texte PDF tronqué à ${maxChars} caractères. Utilisez l'outil read_attachment('${attachment.id}') pour lire la suite.]`;
        truncated = true;
      }

      return {
        type: 'pdf',
        content,
        pageCount: result.pageCount,
        truncated
      };
    }

    // 3. Documents Word (DOCX)
    if (attachment.mimeType.includes('wordprocessingml') || attachment.name.endsWith('.docx')) {
      try {
        const docxResult = await (mammoth as any).convertToMarkdown({ path: filePath });
        let text = docxResult.value || '';
        let truncated = false;
        if (text.length > maxChars) {
          text = text.slice(0, maxChars) + `\n\n[... Document tronqué à ${maxChars} caractères. Utilisez read_attachment pour lire la suite.]`;
          truncated = true;
        }
        return {
          type: 'document',
          content: text,
          truncated
        };
      } catch (err: any) {
        return {
          type: 'document',
          error: `Erreur d'extraction du document Word : ${err.message}`
        };
      }
    }

    // 4. Tableurs (XLSX)
    if (attachment.mimeType.includes('spreadsheetml') || attachment.name.endsWith('.xlsx')) {
      try {
        const spread = await extractSpreadsheet(buffer);
        let text = spread.content;
        let truncated = false;
        if (text.length > maxChars) {
          text = text.slice(0, maxChars) + `\n\n[... Tableur tronqué à ${maxChars} caractères.]`;
          truncated = true;
        }
        return {
          type: 'spreadsheet',
          content: text,
          sheetNames: spread.sheetNames,
          truncated
        };
      } catch (err: any) {
        return {
          type: 'spreadsheet',
          error: `Erreur d'extraction du tableur : ${err.message}`
        };
      }
    }

    // 5. OpenDocument (ODT / ODS)
    if (attachment.name.endsWith('.odt') || attachment.name.endsWith('.ods')) {
      try {
        const text = await extractOpenDocument(buffer);
        let content = text;
        let truncated = false;
        if (content.length > maxChars) {
          content = content.slice(0, maxChars) + `\n\n[... Contenu tronqué à ${maxChars} caractères.]`;
          truncated = true;
        }
        return {
          type: attachment.name.endsWith('.ods') ? 'spreadsheet' : 'document',
          content,
          truncated
        };
      } catch (err: any) {
        return {
          type: 'document',
          error: `Erreur de lecture OpenDocument : ${err.message}`
        };
      }
    }

    // 6. Archives ZIP
    if (category === 'archive' && (attachment.mimeType === 'application/zip' || attachment.name.endsWith('.zip'))) {
      try {
        const archiveInfo = await inspectZipArchive(buffer);
        if (archiveInfo.isZipSlip) {
          return {
            type: 'archive',
            error: 'Archive rejetée pour des raisons de sécurité : détection de chemins suspects (tentative de traversée de répertoire zip-slip).'
          };
        }
        if (archiveInfo.isCompressionBomb) {
          return {
            type: 'archive',
            error: 'Archive rejetée pour des raisons de sécurité : ratio de compression anormalement élevé (bombe de décompression suspectée).'
          };
        }

        const listStr = archiveInfo.entries
          .map(e => `• ${e.name} (${(e.size / 1024).toFixed(1)} Ko)`)
          .join('\n');

        return {
          type: 'archive',
          content: `Archive ZIP (${archiveInfo.entries.length} fichier(s)) :\n${listStr}`,
          entries: archiveInfo.entries
        };
      } catch (err: any) {
        return {
          type: 'archive',
          error: `Erreur de lecture de l'archive : ${err.message}`
        };
      }
    }

    // 7. Fichiers texte, code, JSON, logs, markdown, etc.
    if (category === 'text' || attachment.mimeType.startsWith('text/')) {
      const decoded = decodeTextBuffer(buffer);
      let content = decoded.text;
      let truncated = false;

      // Support de pagination par offset / limit si demandé
      if (options.offset !== undefined || options.limit !== undefined) {
        const start = options.offset || 0;
        const end = options.limit ? start + options.limit : start + maxChars;
        content = content.slice(start, end);
      } else if (content.length > maxChars) {
        content = content.slice(0, maxChars) + `\n\n[... Fichier texte tronqué à ${maxChars} caractères. Utilisez read_attachment('${attachment.id}') pour lire la suite.]`;
        truncated = true;
      }

      return {
        type: 'text',
        content,
        truncated,
        metadata: {
          encoding: decoded.encoding
        }
      };
    }

    // 8. Audio / Vidéo
    if (category === 'audio' || category === 'video') {
      return {
        type: category,
        content: `[Fichier ${category} : ${attachment.name} (${(attachment.size / (1024 * 1024)).toFixed(2)} Mo, format ${attachment.mimeType})]`,
        metadata: {
          mimeType: attachment.mimeType,
          size: attachment.size
        }
      };
    }

    // 9. Autre binaire
    return {
      type: 'binary',
      content: `[Fichier binaire : ${attachment.name} (${(attachment.size / 1024).toFixed(1)} Ko, type ${attachment.mimeType}, SHA-256: ${attachment.sha256})]`,
      metadata: {
        size: attachment.size,
        mimeType: attachment.mimeType,
        sha256: attachment.sha256
      }
    };
  }
}
