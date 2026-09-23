import { test } from 'node:test';
import assert from 'node:assert';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import JSZip from 'jszip';
import { AttachmentManager } from '../server/attachments/AttachmentManager.ts';
import { AttachmentReader, decodeTextBuffer } from '../server/attachments/AttachmentReader.ts';
import { detectMagicBytesFromFile } from '../server/attachments/magic_bytes.ts';
import { getModelCapabilities } from '../server/models/types.ts';
import { ReadAttachmentTool } from '../server/tools/attachments/read_attachment.ts';
import { runtimeDatabase } from '../server/storage/RuntimeDatabase.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE_URL = 'http://127.0.0.1:3001';

async function getAuthToken() {
  const res = await fetch(`${BASE_URL}/api/bootstrap`, {
    headers: { 'Host': '127.0.0.1:3001' }
  });
  const data = await res.json();
  return data.token;
}

test('Mission M2 - 1. Décodage multi-encodage (UTF-8, UTF-8 BOM, UTF-16LE, Windows-1252)', () => {
  // UTF-8 standard
  const bufUtf8 = Buffer.from('Bonjour le monde !', 'utf-8');
  assert.strictEqual(decodeTextBuffer(bufUtf8).text, 'Bonjour le monde !');

  // UTF-8 avec BOM
  const bufUtf8Bom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('Texte avec BOM', 'utf-8')]);
  const resUtf8Bom = decodeTextBuffer(bufUtf8Bom);
  assert.strictEqual(resUtf8Bom.text, 'Texte avec BOM');
  assert.strictEqual(resUtf8Bom.encoding, 'UTF-8 with BOM');

  // UTF-16LE avec BOM
  const bufUtf16Le = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('Texte UTF-16LE', 'utf16le')]);
  const resUtf16Le = decodeTextBuffer(bufUtf16Le);
  assert.strictEqual(resUtf16Le.text, 'Texte UTF-16LE');
  assert.strictEqual(resUtf16Le.encoding, 'UTF-16LE with BOM');

  // Windows-1252 (ex: caractères accentués spécifiques comme 'é', 'à', 'ç')
  const winBuffer = Buffer.from([0xe9, 0x74, 0xe9]); // "été" en Windows-1252
  const resWin = decodeTextBuffer(winBuffer);
  assert.ok(resWin.text.length > 0);
});

test('Mission M2 - 2. Sécurité : Rejet immédiat d\'un exécutable déguisé en .png (Magic Bytes)', async () => {
  const token = await getAuthToken();
  const convId = 'test-security-exec-' + Date.now();

  // Faux PNG contenant en réalité un en-tête exécutable Windows PE (MZ)
  const fakePngBuffer = Buffer.concat([
    Buffer.from('MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xff\xff\x00\x00'),
    Buffer.from('Contenu exécutable malveillant déguisé en image')
  ]);

  const res = await fetch(`${BASE_URL}/api/attachments?conversationId=${convId}&filename=malware.png`, {
    method: 'POST',
    headers: {
      'Host': '127.0.0.1:3001',
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'image/png',
      'X-Iroko-Request': '1'
    },
    body: fakePngBuffer
  });

  assert.strictEqual(res.status, 400, 'Un exécutable déguisé en .png doit être rejeté avec un code 400');
  const data = await res.json();
  assert.ok(data.error.includes('exécutable interdit') || data.error.includes('signature réelle'), 'Message d\'erreur explicite');
});

test('Mission M2 - 3. Sécurité : Protection Zip-Slip dans les archives', async () => {
  const zip = new JSZip();
  // Fichier malveillant avec traversée de répertoire
  zip.file('../../etc/passwd', 'root:x:0:0:root:/root:/bin/bash');
  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

  const tempDir = path.join(__dirname, 'fixtures');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  const zipPath = path.join(tempDir, 'zipslip_test.zip');
  fs.writeFileSync(zipPath, zipBuffer);

  const meta = {
    id: 'test-zipslip',
    conversationId: 'test-conv',
    name: 'zipslip_test.zip',
    originalName: 'zipslip_test.zip',
    size: zipBuffer.length,
    mimeType: 'application/zip',
    detectedType: 'archive',
    sha256: 'test',
    filePath: zipPath,
    createdAt: new Date().toISOString()
  };

  const readResult = await AttachmentReader.readAttachment(meta);
  assert.ok(readResult.error, 'Une archive avec zip-slip doit retourner une erreur');
  assert.ok(readResult.error.includes('zip-slip'), 'L\'erreur doit mentionner zip-slip');

  try { fs.unlinkSync(zipPath); } catch {}
});

test('Mission M2 - 4. Sécurité : Protection Bombe de décompression', async () => {
  const zip = new JSZip();
  // Données très répétitives créant un ratio de compression gigantesque (> 100)
  const hugeBuffer = Buffer.alloc(1024 * 1024 * 5, 0x41); // 5 Mo de 'A'
  zip.file('bomb.txt', hugeBuffer);
  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

  const tempDir = path.join(__dirname, 'fixtures');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  const bombPath = path.join(tempDir, 'bomb_test.zip');
  fs.writeFileSync(bombPath, zipBuffer);

  const meta = {
    id: 'test-bomb',
    conversationId: 'test-conv',
    name: 'bomb_test.zip',
    originalName: 'bomb_test.zip',
    size: zipBuffer.length,
    mimeType: 'application/zip',
    detectedType: 'archive',
    sha256: 'test',
    filePath: bombPath,
    createdAt: new Date().toISOString()
  };

  const readResult = await AttachmentReader.readAttachment(meta);
  assert.ok(readResult.error, 'Une bombe de décompression doit être rejetée');
  assert.ok(readResult.error.includes('bombe de décompression') || readResult.error.includes('ratio'), 'L\'erreur doit mentionner la bombe');

  try { fs.unlinkSync(bombPath); } catch {}
});

test('Mission M2 - 5. Validation : Rejet fichier vide (0 octet)', async () => {
  const token = await getAuthToken();
  const convId = 'test-empty-' + Date.now();

  const res = await fetch(`${BASE_URL}/api/attachments?conversationId=${convId}&filename=empty.txt`, {
    method: 'POST',
    headers: {
      'Host': '127.0.0.1:3001',
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'text/plain',
      'X-Iroko-Request': '1'
    },
    body: Buffer.alloc(0)
  });

  assert.strictEqual(res.status, 400, 'Un fichier vide doit être rejeté');
  const data = await res.json();
  assert.ok(data.error.includes('vide'), 'L\'erreur doit indiquer que le fichier est vide');
});

test('Mission M2 - 6. Validation : Quota de taille unitaire (50 Mo max)', async () => {
  const token = await getAuthToken();
  const convId = 'test-oversize-' + Date.now();

  // On simule une tentative de téléversement dépassant 50 Mo
  const mgr = new AttachmentManager(undefined, { maxFileSize: 1024 * 1024 }); // Plafond temporaire à 1 Mo pour le test
  const bigStream = fs.createReadStream(__filename); // Stream valide
  // Créer un buffer artificiellement supérieur à la limite
  const { Readable } = await import('stream');
  let sent = 0;
  const dummyStream = new Readable({
    read(size) {
      if (sent >= 2 * 1024 * 1024) {
        this.push(null);
      } else {
        const chunk = Buffer.alloc(64 * 1024, 0x30);
        sent += chunk.length;
        this.push(chunk);
      }
    }
  });

  await assert.rejects(
    async () => {
      await mgr.saveStream(convId, 'bigfile.dat', dummyStream);
    },
    /trop volumineux/,
    'Un fichier dépassant la limite autorisée doit lever une exception'
  );
});

test('Mission M2 - 7. Capacités modèles : Rejet de la vision pour un modèle sans vision', () => {
  const textModelCaps = getModelCapabilities('deepseek-coder-6.7b');
  assert.strictEqual(textModelCaps.vision, false, 'Un modèle texte pur ne doit pas supporter la vision');

  const visionModelCaps = getModelCapabilities('claude-3-5-sonnet-latest');
  assert.strictEqual(visionModelCaps.vision, true, 'Claude 3.5 Sonnet doit supporter la vision');

  const gpt4oCaps = getModelCapabilities('gpt-4o');
  assert.strictEqual(gpt4oCaps.vision, true, 'GPT-4o doit supporter la vision');
});

test('Mission M2 - 8. Outil read_attachment : Pagination offset et limit', async () => {
  const tempDir = path.join(__dirname, 'fixtures');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  const samplePath = path.join(tempDir, 'sample_pagination.txt');
  fs.writeFileSync(samplePath, '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ');

  const attId = 'test-pagination-' + Date.now();
  const convId = 'test-conv-pag-' + Date.now();
  runtimeDatabase.saveConversation(convId, 'Test Pagination');
  runtimeDatabase.recordAttachment({
    id: attId,
    conversationId: convId,
    name: 'sample_pagination.txt',
    originalName: 'sample_pagination.txt',
    size: 36,
    mimeType: 'text/plain',
    detectedType: 'text',
    sha256: 'dummy',
    filePath: samplePath
  });

  const tool = new ReadAttachmentTool();
  const res1 = await tool.execute({ attachment_id: attId, offset: 0, limit: 10 }, {});
  assert.strictEqual(res1.success, true);
  assert.strictEqual(res1.data.content, '0123456789');

  const res2 = await tool.execute({ attachment_id: attId, offset: 10, limit: 5 }, {});
  assert.strictEqual(res2.success, true);
  assert.strictEqual(res2.data.content, 'ABCDE');

  try { fs.unlinkSync(samplePath); } catch {}
});

test('Mission M2 - 9. Téléversement, consultation, aperçu et suppression de pièce jointe via API REST', async () => {
  const token = await getAuthToken();
  const convId = 'test-full-lifecycle-' + Date.now();

  // 1. Upload
  const fileContent = 'Ligne 1: Bonjour\nLigne 2: Test pièce jointe\nLigne 3: Fin';
  const uploadRes = await fetch(`${BASE_URL}/api/attachments?conversationId=${convId}&filename=notes.txt`, {
    method: 'POST',
    headers: {
      'Host': '127.0.0.1:3001',
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'text/plain',
      'X-Iroko-Request': '1'
    },
    body: fileContent
  });

  assert.strictEqual(uploadRes.status, 201);
  const uploadData = await uploadRes.json();
  const attachment = uploadData.attachment;
  assert.ok(attachment.id);
  assert.strictEqual(attachment.name, 'notes.txt');

  // 2. Consultation métadonnées
  const getRes = await fetch(`${BASE_URL}/api/attachments/${attachment.id}`, {
    headers: {
      'Host': '127.0.0.1:3001',
      'Authorization': `Bearer ${token}`
    }
  });
  assert.strictEqual(getRes.status, 200);
  const getData = await getRes.json();
  assert.strictEqual(getData.attachment.id, attachment.id);

  // 3. Aperçu
  const previewRes = await fetch(`${BASE_URL}/api/attachments/${attachment.id}/preview`, {
    headers: {
      'Host': '127.0.0.1:3001',
      'Authorization': `Bearer ${token}`
    }
  });
  assert.strictEqual(previewRes.status, 200);
  const previewData = await previewRes.json();
  assert.ok(previewData.preview.content.includes('Ligne 1: Bonjour'));

  // 4. Liste des pièces jointes de la discussion
  const listRes = await fetch(`${BASE_URL}/api/conversations/${convId}/attachments`, {
    headers: {
      'Host': '127.0.0.1:3001',
      'Authorization': `Bearer ${token}`
    }
  });
  assert.strictEqual(listRes.status, 200);
  const listData = await listRes.json();
  assert.strictEqual(listData.attachments.length, 1);

  // 5. Suppression
  const delRes = await fetch(`${BASE_URL}/api/attachments/${attachment.id}`, {
    method: 'DELETE',
    headers: {
      'Host': '127.0.0.1:3001',
      'Authorization': `Bearer ${token}`,
      'X-Iroko-Request': '1'
    }
  });
  assert.strictEqual(delRes.status, 200);
  const delData = await delRes.json();
  assert.strictEqual(delData.success, true);
});

test('Mission M2 - 10. Suppression d\'une conversation supprime physiquement ses fichiers joints', async () => {
  const token = await getAuthToken();
  const convId = 'test-conv-purge-' + Date.now();

  // Créer une discussion
  await fetch(`${BASE_URL}/api/conversations`, {
    method: 'POST',
    headers: {
      'Host': '127.0.0.1:3001',
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Iroko-Request': '1'
    },
    body: JSON.stringify({ id: convId, title: 'Discussion à purger' })
  });

  // Téléverser un fichier
  const upRes = await fetch(`${BASE_URL}/api/attachments?conversationId=${convId}&filename=purge_me.txt`, {
    method: 'POST',
    headers: {
      'Host': '127.0.0.1:3001',
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'text/plain',
      'X-Iroko-Request': '1'
    },
    body: 'Fichier qui doit disparaître du disque'
  });
  assert.strictEqual(upRes.status, 201);
  const upData = await upRes.json();
  const attId = upData.attachment.id;

  // Supprimer la conversation
  const delConvRes = await fetch(`${BASE_URL}/api/conversations/${convId}`, {
    method: 'DELETE',
    headers: {
      'Host': '127.0.0.1:3001',
      'Authorization': `Bearer ${token}`,
      'X-Iroko-Request': '1'
    }
  });
  assert.strictEqual(delConvRes.status, 200);

  // Vérifier que la pièce jointe n'existe plus
  const getRes = await fetch(`${BASE_URL}/api/attachments/${attId}`, {
    headers: {
      'Host': '127.0.0.1:3001',
      'Authorization': `Bearer ${token}`
    }
  });
  assert.strictEqual(getRes.status, 404, 'La pièce jointe doit avoir été supprimée avec sa conversation');
});
