import { IncomingMessage } from 'http';
import { Readable, PassThrough } from 'stream';

export interface MultipartField {
  name: string;
  value: string;
}

export interface MultipartFile {
  fieldName: string;
  filename: string;
  mimeType: string;
  stream: Readable;
}

export interface ParsedMultipart {
  fields: Record<string, string>;
  file?: MultipartFile;
}

/**
 * Parseur multipart/form-data streaming sans mise en mémoire tampon complète (§26).
 * Extrait le premier fichier sous forme de Readable stream directement consommable.
 */
export function parseMultipartStream(req: IncomingMessage): Promise<ParsedMultipart> {
  return new Promise((resolve, reject) => {
    const contentType = req.headers['content-type'] || '';
    const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
    if (!boundaryMatch) {
      return reject(new Error('En-tête Content-Type invalide : boundary manquant'));
    }

    const boundaryStr = boundaryMatch[1] || boundaryMatch[2];
    const boundary = Buffer.from(`--${boundaryStr}`);
    const endBoundary = Buffer.from(`--${boundaryStr}--`);

    const fields: Record<string, string> = {};
    let currentFile: {
      fieldName: string;
      filename: string;
      mimeType: string;
      passThrough: PassThrough;
    } | null = null;

    let buffer = Buffer.alloc(0);
    let state: 'WAITING_BOUNDARY' | 'READING_HEADERS' | 'READING_BODY' = 'WAITING_BOUNDARY';
    let currentPartHeaders = '';
    let isFile = false;
    let currentFieldName = '';
    let currentFilename = '';
    let currentMimeType = 'application/octet-stream';
    let resolved = false;

    const cleanup = () => {
      if (currentFile && !currentFile.passThrough.closed) {
        currentFile.passThrough.end();
      }
    };

    req.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);

      let processing = true;
      while (processing) {
        if (state === 'WAITING_BOUNDARY') {
          const idx = buffer.indexOf(boundary);
          if (idx !== -1) {
            // Avancer après le boundary et le CRLF
            buffer = buffer.subarray(idx + boundary.length);
            if (buffer.length >= 2 && buffer[0] === 0x0d && buffer[1] === 0x0a) {
              buffer = buffer.subarray(2);
            }
            state = 'READING_HEADERS';
          } else {
            processing = false;
          }
        } else if (state === 'READING_HEADERS') {
          const headerEnd = buffer.indexOf('\r\n\r\n');
          if (headerEnd !== -1) {
            currentPartHeaders = buffer.subarray(0, headerEnd).toString('utf-8');
            buffer = buffer.subarray(headerEnd + 4);

            // Parser les en-têtes de la partie
            const dispMatch = currentPartHeaders.match(/Content-Disposition:\s*form-data;\s*([^;\r\n]+)(?:;\s*filename="([^"]*)")?/i);
            const nameMatch = currentPartHeaders.match(/name="([^"]*)"/i);
            currentFieldName = nameMatch ? nameMatch[1] : '';

            const filenameMatch = currentPartHeaders.match(/filename="([^"]*)"/i);
            currentFilename = filenameMatch ? filenameMatch[1] : '';

            const typeMatch = currentPartHeaders.match(/Content-Type:\s*([^\r\n]+)/i);
            currentMimeType = typeMatch ? typeMatch[1].trim() : 'application/octet-stream';

            if (currentFilename) {
              isFile = true;
              const pt = new PassThrough();
              currentFile = {
                fieldName: currentFieldName,
                filename: currentFilename,
                mimeType: currentMimeType,
                passThrough: pt
              };
              state = 'READING_BODY';

              if (!resolved) {
                resolved = true;
                resolve({
                  fields,
                  file: {
                    fieldName: currentFieldName,
                    filename: currentFilename,
                    mimeType: currentMimeType,
                    stream: pt
                  }
                });
              }
            } else {
              isFile = false;
              state = 'READING_BODY';
            }
          } else {
            processing = false;
          }
        } else if (state === 'READING_BODY') {
          // Chercher le prochain boundary
          const nextBoundaryIdx = buffer.indexOf(boundary);
          if (nextBoundaryIdx !== -1) {
            // Extraire le corps avant le boundary
            // Enlever le CRLF précédant le boundary s'il existe
            let bodyChunk = buffer.subarray(0, nextBoundaryIdx);
            if (bodyChunk.length >= 2 && bodyChunk[bodyChunk.length - 2] === 0x0d && bodyChunk[bodyChunk.length - 1] === 0x0a) {
              bodyChunk = bodyChunk.subarray(0, bodyChunk.length - 2);
            }

            if (isFile && currentFile) {
              if (bodyChunk.length > 0) {
                currentFile.passThrough.write(bodyChunk);
              }
              currentFile.passThrough.end();
              currentFile = null;
            } else if (!isFile && currentFieldName) {
              fields[currentFieldName] = bodyChunk.toString('utf-8');
            }

            buffer = buffer.subarray(nextBoundaryIdx + boundary.length);
            // Vérifier si c'est la fin du multipart (--boundary--)
            if (buffer.length >= 2 && buffer[0] === 0x2d && buffer[1] === 0x2d) {
              processing = false;
              state = 'WAITING_BOUNDARY';
              if (!resolved) {
                resolved = true;
                resolve({ fields });
              }
              return;
            }
            if (buffer.length >= 2 && buffer[0] === 0x0d && buffer[1] === 0x0a) {
              buffer = buffer.subarray(2);
            }
            state = 'READING_HEADERS';
          } else {
            // Pas de boundary trouvé : envoyer ce qu'on peut en gardant une marge pour le boundary
            const safeLen = Math.max(0, buffer.length - (boundary.length + 4));
            if (safeLen > 0) {
              const chunkToWrite = buffer.subarray(0, safeLen);
              buffer = buffer.subarray(safeLen);
              if (isFile && currentFile) {
                currentFile.passThrough.write(chunkToWrite);
              }
            }
            processing = false;
          }
        }
      }
    });

    req.on('end', () => {
      cleanup();
      if (!resolved) {
        resolved = true;
        resolve({ fields });
      }
    });

    req.on('error', (err) => {
      cleanup();
      if (!resolved) {
        resolved = true;
        reject(err);
      }
    });
  });
}
