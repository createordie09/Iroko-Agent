import fs from 'fs';

export interface DetectedType {
  mimeType: string;
  category: 'image' | 'pdf' | 'text' | 'document' | 'spreadsheet' | 'archive' | 'audio' | 'video' | 'executable' | 'binary';
  extension?: string;
  isExecutable: boolean;
}

export function detectMagicBytes(buffer: Buffer): DetectedType {
  if (buffer.length < 4) {
    return {
      mimeType: 'application/octet-stream',
      category: 'binary',
      isExecutable: false
    };
  }

  // 1. Exécutables (Priorité de sécurité absolue pour bloquer les faux fichiers)
  // Windows PE (MZ)
  if (buffer[0] === 0x4d && buffer[1] === 0x5a) {
    return {
      mimeType: 'application/x-dosexec',
      category: 'executable',
      extension: 'exe',
      isExecutable: true
    };
  }

  // Linux ELF (\x7fELF)
  if (buffer[0] === 0x7f && buffer[1] === 0x45 && buffer[2] === 0x4c && buffer[3] === 0x46) {
    return {
      mimeType: 'application/x-executable',
      category: 'executable',
      extension: 'elf',
      isExecutable: true
    };
  }

  // macOS Mach-O
  if (
    (buffer[0] === 0xfe && buffer[1] === 0xed && buffer[2] === 0xfa && (buffer[3] === 0xce || buffer[3] === 0xcf)) ||
    (buffer[0] === 0xcf && buffer[1] === 0xfa && buffer[2] === 0xed && buffer[3] === 0xfe) ||
    (buffer[0] === 0xce && buffer[1] === 0xfa && buffer[2] === 0xed && buffer[3] === 0xfe)
  ) {
    return {
      mimeType: 'application/x-mach-binary',
      category: 'executable',
      extension: 'dylib',
      isExecutable: true
    };
  }

  // 2. Images
  // PNG: \x89PNG\r\n\x1a\n
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
    buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
  ) {
    return {
      mimeType: 'image/png',
      category: 'image',
      extension: 'png',
      isExecutable: false
    };
  }

  // JPEG: \xff\xd8\xff
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return {
      mimeType: 'image/jpeg',
      category: 'image',
      extension: 'jpg',
      isExecutable: false
    };
  }

  // GIF: GIF87a ou GIF89a
  if (
    buffer.length >= 6 &&
    buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38 &&
    (buffer[4] === 0x37 || buffer[4] === 0x39) && buffer[5] === 0x61
  ) {
    return {
      mimeType: 'image/gif',
      category: 'image',
      extension: 'gif',
      isExecutable: false
    };
  }

  // WEBP: RIFF....WEBP
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  ) {
    return {
      mimeType: 'image/webp',
      category: 'image',
      extension: 'webp',
      isExecutable: false
    };
  }

  // 3. PDF: %PDF-
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    return {
      mimeType: 'application/pdf',
      category: 'pdf',
      extension: 'pdf',
      isExecutable: false
    };
  }

  // 4. Archives ZIP / Office Documents
  if (
    (buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04) ||
    (buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x05 && buffer[3] === 0x06) ||
    (buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x07 && buffer[3] === 0x08)
  ) {
    // Vérifier si c'est un format Office spécifique dans les premiers 2048 octets
    const searchSlice = buffer.subarray(0, Math.min(buffer.length, 4096)).toString('binary');
    if (searchSlice.includes('word/')) {
      return {
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        category: 'document',
        extension: 'docx',
        isExecutable: false
      };
    }
    if (searchSlice.includes('xl/')) {
      return {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        category: 'spreadsheet',
        extension: 'xlsx',
        isExecutable: false
      };
    }
    if (searchSlice.includes('ppt/')) {
      return {
        mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        category: 'document',
        extension: 'pptx',
        isExecutable: false
      };
    }
    if (searchSlice.includes('mimetypeapplication/vnd.oasis.opendocument.text')) {
      return {
        mimeType: 'application/vnd.oasis.opendocument.text',
        category: 'document',
        extension: 'odt',
        isExecutable: false
      };
    }
    if (searchSlice.includes('mimetypeapplication/vnd.oasis.opendocument.spreadsheet')) {
      return {
        mimeType: 'application/vnd.oasis.opendocument.spreadsheet',
        category: 'spreadsheet',
        extension: 'ods',
        isExecutable: false
      };
    }

    return {
      mimeType: 'application/zip',
      category: 'archive',
      extension: 'zip',
      isExecutable: false
    };
  }

  // 5. GZIP (\x1f\x8b)
  if (buffer[0] === 0x1f && buffer[1] === 0x8b) {
    return {
      mimeType: 'application/gzip',
      category: 'archive',
      extension: 'gz',
      isExecutable: false
    };
  }

  // 6. Audio / Vidéo
  // MP3: ID3 ou frame sync \xff\xfb, \xff\xf3, \xff\xf2
  if (
    (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) ||
    (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)
  ) {
    return {
      mimeType: 'audio/mpeg',
      category: 'audio',
      extension: 'mp3',
      isExecutable: false
    };
  }

  // WAV: RIFF....WAVE
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x41 && buffer[10] === 0x56 && buffer[11] === 0x45
  ) {
    return {
      mimeType: 'audio/wav',
      category: 'audio',
      extension: 'wav',
      isExecutable: false
    };
  }

  // Ogg: OggS
  if (buffer[0] === 0x4f && buffer[1] === 0x67 && buffer[2] === 0x67 && buffer[3] === 0x53) {
    return {
      mimeType: 'audio/ogg',
      category: 'audio',
      extension: 'ogg',
      isExecutable: false
    };
  }

  // MP4: ....ftyp
  if (
    buffer.length >= 8 &&
    buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70
  ) {
    return {
      mimeType: 'video/mp4',
      category: 'video',
      extension: 'mp4',
      isExecutable: false
    };
  }

  // WebM / Matroska: \x1a\x45\xdf\xa3
  if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
    return {
      mimeType: 'video/webm',
      category: 'video',
      extension: 'webm',
      isExecutable: false
    };
  }

  // 7. Fichiers texte avec BOM
  // UTF-8 BOM (\xef\xbb\xbf)
  if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return {
      mimeType: 'text/plain; charset=utf-8',
      category: 'text',
      extension: 'txt',
      isExecutable: false
    };
  }

  // UTF-16LE BOM (\xff\xfe)
  if (buffer[0] === 0xff && buffer[1] === 0xfe) {
    return {
      mimeType: 'text/plain; charset=utf-16le',
      category: 'text',
      extension: 'txt',
      isExecutable: false
    };
  }

  // UTF-16BE BOM (\xfe\xff)
  if (buffer[0] === 0xfe && buffer[1] === 0xff) {
    return {
      mimeType: 'text/plain; charset=utf-16be',
      category: 'text',
      extension: 'txt',
      isExecutable: false
    };
  }

  // 8. Détection heuristique de texte brut (aucun octet nul \x00 dans les premiers 512 octets)
  const checkLength = Math.min(buffer.length, 512);
  let nullBytes = 0;
  for (let i = 0; i < checkLength; i++) {
    if (buffer[i] === 0x00) nullBytes++;
  }

  if (nullBytes === 0) {
    return {
      mimeType: 'text/plain',
      category: 'text',
      extension: 'txt',
      isExecutable: false
    };
  }

  // Binaire indéterminé
  return {
    mimeType: 'application/octet-stream',
    category: 'binary',
    isExecutable: false
  };
}

export function detectMagicBytesFromFile(filePath: string): DetectedType {
  const fd = fs.openSync(filePath, 'r');
  const buffer = Buffer.alloc(4096);
  const bytesRead = fs.readSync(fd, buffer, 0, 4096, 0);
  fs.closeSync(fd);
  return detectMagicBytes(buffer.subarray(0, bytesRead));
}
