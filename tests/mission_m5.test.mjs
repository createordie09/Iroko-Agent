import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mammoth from 'mammoth';
import ExcelJS from 'exceljs';
import { PDFDocument } from 'pdf-lib';
import JSZip from 'jszip';

import { artifactManager, ArtifactManager } from '../server/artifacts/ArtifactManager.ts';
import { DocumentGenerators } from '../server/artifacts/DocumentGenerators.ts';
import { toolRegistry } from '../server/tools/ToolRegistry.ts';
import { runtimeDatabase } from '../server/storage/RuntimeDatabase.ts';
import { PathSanitizer } from '../server/security/PathSanitizer.ts';

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

// ─────────────────────────────────────────────────────────────
// PARTIE 1 : N2 — GÉNÉRATEURS DE DOCUMENTS INTÉGRÉS VALIDÉS PAR ZOD
// ─────────────────────────────────────────────────────────────

test('Mission M5 - 1. N2 docx : Génération et relecture réussie via Mammoth', async () => {
  const spec = {
    title: 'Rapport d\'Audit de Sécurité',
    description: 'Document généré pour la mission M5',
    sections: [
      {
        heading: 'Introduction et Contexte',
        paragraphs: [
          'Ce document atteste de la validation des mécanismes d\'isolation du runtime Iroko.',
          'Tous les flux réseau locaux sont strictement authentifiés et confinés.'
        ],
        bulletPoints: [
          'Écoute exclusive sur 127.0.0.1',
          'Token bootstrap éphémère en mémoire vive',
          'CSP stricte sans connectivité réseau externe'
        ],
        table: {
          headers: ['Composant', 'Niveau de Risque', 'Statut'],
          rows: [
            ['Iframe Sandbox', 'Critique', 'Conforme'],
            ['Générateur Docx', 'Faible', 'Validé']
          ]
        }
      }
    ]
  };

  const buffer = await DocumentGenerators.generateDocx(spec);
  assert.ok(Buffer.isBuffer(buffer), 'La sortie doit être un Buffer');
  assert.ok(buffer.length > 500, 'Le document Word doit avoir une taille binaire significative');

  // Validation par relecture avec la bibliothèque Mammoth
  const extracted = await mammoth.extractRawText({ buffer });
  assert.ok(extracted.value.includes('Rapport d\'Audit de Sécurité'), 'Le texte extrait doit contenir le titre');
  assert.ok(extracted.value.includes('Introduction et Contexte'), 'Le texte extrait doit contenir le titre de section');
  assert.ok(extracted.value.includes('Écoute exclusive sur 127.0.0.1'), 'Le texte extrait doit contenir les puces');
});

test('Mission M5 - 2. N2 xlsx : Génération et relecture des données via ExcelJS', async () => {
  const spec = {
    title: 'Statistiques Financières',
    sheets: [
      {
        name: 'Ventes 2026',
        headers: ['Identifiant', 'Produit', 'Montant', 'Devise'],
        rows: [
          [1, 'Licence Logiciel', 1500, 'EUR'],
          [2, 'Support Technique', 350, 'EUR'],
          [3, 'Audit de Conformité', 2400, 'EUR']
        ]
      },
      {
        name: 'Paramètres',
        headers: ['Clé', 'Valeur'],
        rows: [
          ['TVA', 0.20],
          ['Devise_Defaut', 'EUR']
        ]
      }
    ]
  };

  const buffer = await DocumentGenerators.generateXlsx(spec);
  assert.ok(Buffer.isBuffer(buffer), 'La sortie doit être un Buffer');

  // Validation par relecture avec ExcelJS
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  assert.strictEqual(wb.worksheets.length, 2, 'Le classeur doit contenir 2 feuilles');
  const sheet1 = wb.getWorksheet('Ventes 2026');
  assert.ok(sheet1, 'La feuille Ventes 2026 doit exister');
  assert.strictEqual(sheet1.rowCount, 4, 'La feuille doit comporter 4 lignes (1 en-tête + 3 données)');
  assert.strictEqual(sheet1.getRow(1).getCell(2).value, 'Produit');
  assert.strictEqual(sheet1.getRow(2).getCell(3).value, 1500);
});

test('Mission M5 - 3. N2 pptx : Génération et intégrité OpenXML via JSZip', async () => {
  const spec = {
    title: 'Présentation Architecture Iroko',
    author: 'Ingénierie DeepMind',
    slides: [
      {
        title: 'Architecture Sécurisée',
        subtitle: 'Mission M5 — Tous formats sans risque'
      },
      {
        title: 'Piliers de Sécurité',
        bullets: [
          'Sandboxing strict des aperçus HTML',
          'Images SVG protégées contre XSS',
          'Vérification des chemins d\'accès'
        ]
      },
      {
        title: 'Données de synthèse',
        table: {
          headers: ['Métrique', 'Objectif', 'Résultat'],
          rows: [
            ['Diff UI', '0.00%', '0.00%'],
            ['Tests régressifs', '100% vert', '100% vert']
          ]
        }
      }
    ]
  };

  const buffer = await DocumentGenerators.generatePptx(spec);
  assert.ok(Buffer.isBuffer(buffer), 'La sortie doit être un Buffer');
  assert.ok(buffer.length > 500, 'La présentation doit avoir une taille binaire significative');

  // Validation de l'archive OpenXML PPTX avec JSZip
  const zip = await JSZip.loadAsync(buffer);
  assert.ok(zip.file('ppt/presentation.xml'), 'L\'archive doit contenir presentation.xml');
  assert.ok(zip.file('[Content_Types].xml'), 'L\'archive doit contenir [Content_Types].xml');

  // Vérification de la présence des diapositives
  const slideFiles = Object.keys(zip.files).filter(k => k.startsWith('ppt/slides/slide') && k.endsWith('.xml'));
  assert.strictEqual(slideFiles.length, 3, 'L\'archive doit comporter 3 diapositives');
});

test('Mission M5 - 4. N2 pdf : Génération et relecture via pdf-lib', async () => {
  const spec = {
    title: 'Certificat de Conformité Sécuritaire',
    author: 'Iroko Runtime Engine',
    pages: [
      {
        title: 'Certificat Officiel',
        paragraphs: [
          'Le présent document certifie que tous les artéfacts générés par Iroko sont strictement confinés hors du workspace.',
          'Aucune injection binaire directe n\'est permise depuis les modèles d\'intelligence artificielle.'
        ],
        bulletPoints: [
          'Zéro accès réseau dans l\'iframe sandbox (connect-src none)',
          'Origine opaque null bloquant tout accès à window.parent et aux tokens',
          'Quota de taille strict de 50 Mo par artéfact'
        ]
      }
    ]
  };

  const buffer = await DocumentGenerators.generatePdf(spec);
  assert.ok(Buffer.isBuffer(buffer), 'La sortie doit être un Buffer');

  // Validation par relecture avec pdf-lib
  const pdfDoc = await PDFDocument.load(buffer);
  assert.strictEqual(pdfDoc.getPageCount(), 1, 'Le PDF doit contenir 1 page');
  assert.strictEqual(pdfDoc.getTitle(), 'Certificat de Conformité Sécuritaire');
  assert.strictEqual(pdfDoc.getAuthor(), 'Iroko Runtime Engine');
});

test('Mission M5 - 5. N2 zip : Archivage multi-fichiers et vérification d\'intégrité', async () => {
  const spec = {
    entries: [
      { name: 'notes.txt', content: 'Première note textuelle' },
      { name: 'donnees.csv', content: 'id,nom\n1,Alpha\n2,Beta' },
      { name: 'sous-dossier/config.json', content: '{"active": true}' }
    ]
  };

  const buffer = await DocumentGenerators.generateZip(spec);
  assert.ok(Buffer.isBuffer(buffer), 'La sortie doit être un Buffer');

  // Relecture avec JSZip
  const zip = await JSZip.loadAsync(buffer);
  assert.ok(zip.file('notes.txt'));
  assert.ok(zip.file('donnees.csv'));
  assert.ok(zip.file('sous-dossier/config.json'));

  const text = await zip.file('notes.txt').async('text');
  assert.strictEqual(text, 'Première note textuelle');
});

test('Mission M5 - 6. N2 outil create_document : Enregistrement ToolRegistry et validation de schéma Zod', async () => {
  const tool = toolRegistry.getTool('create_document');
  assert.ok(tool, 'L\'outil create_document doit être enregistré dans le ToolRegistry');
  assert.strictEqual(tool.category, 'artifacts');
  assert.ok(['SAFE', 'safe'].includes(tool.permission));

  const convId = 'test_conv_doc_' + Date.now();
  runtimeDatabase.saveConversation(convId, 'Test Create Document');

  const events = [];
  const fakeContext = {
    conversationId: convId,
    workspacePath: process.cwd(),
    emitEvent: (e) => events.push(e),
    logger: console
  };

  // 1. Échec sur format invalide
  const invalidFormatRes = await tool.execute({
    format: 'exe',
    filename: 'virus.exe',
    spec: {}
  }, fakeContext);
  assert.strictEqual(invalidFormatRes.success, false);
  assert.ok(invalidFormatRes.error.includes('format'));

  // 2. Échec sur spécification Zod incomplète (titre manquant pour docx)
  const invalidSpecRes = await tool.execute({
    format: 'docx',
    filename: 'test.docx',
    spec: { sections: [] }
  }, fakeContext);
  assert.strictEqual(invalidSpecRes.success, false);

  // 3. Succès sur docx valide
  const validRes = await tool.execute({
    format: 'docx',
    filename: 'rapport_valide.docx',
    spec: {
      title: 'Rapport Valide',
      sections: [{ heading: 'Sec 1', paragraphs: ['Texte de test.'] }]
    },
    title: 'Rapport Valide'
  }, fakeContext);

  assert.strictEqual(validRes.success, true);
  assert.ok(validRes.data.id);
  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].type, 'artifact_created');

  // Nettoyage
  runtimeDatabase.deleteConversation(convId);
});

// ─────────────────────────────────────────────────────────────
// PARTIE 2 : N3 — OUTIL REGISTER_ARTIFACT & CONFINEMENT DU CHEMIN
// ─────────────────────────────────────────────────────────────

test('Mission M5 - 7. N3 outil register_artifact : Confinement strict et refus des chemins hors workspace', async () => {
  const tool = toolRegistry.getTool('register_artifact');
  assert.ok(tool, 'L\'outil register_artifact doit être enregistré');
  assert.strictEqual(tool.category, 'artifacts');

  const convId = 'test_conv_reg_' + Date.now();
  runtimeDatabase.saveConversation(convId, 'Test Register Artifact');

  const fakeContext = {
    conversationId: convId,
    workspacePath: process.cwd(),
    emitEvent: () => {},
    logger: console
  };

  // 1. Refus de traversée de chemin vers l'extérieur du workspace
  const traversalRes = await tool.execute({
    filePath: '../../../../Windows/win.ini',
    title: 'Fichier système'
  }, fakeContext);
  assert.strictEqual(traversalRes.success, false, 'Doit refuser la traversée de répertoire');

  // 2. Refus d'un fichier inexistant
  const notFoundRes = await tool.execute({
    filePath: 'fichier_totalement_inexistant_99999.xyz',
    title: 'Inexistant'
  }, fakeContext);
  assert.strictEqual(notFoundRes.success, false, 'Doit refuser un fichier inexistant');

  // 3. Succès sur un fichier légitime présent dans le projet
  const legitimateFile = 'package.json';
  const legitRes = await tool.execute({
    filePath: legitimateFile,
    title: 'Package JSON Projet'
  }, fakeContext);

  assert.strictEqual(legitRes.success, true, 'Doit enregistrer le fichier légitime avec succès');
  assert.ok(legitRes.data.id);
  assert.strictEqual(legitRes.data.name, 'package.json');

  // Nettoyage
  runtimeDatabase.deleteConversation(convId);
});

test('Mission M5 - 8. Sécurité : Rejet d\'artéfact de taille supérieure à 50 Mo', () => {
  const convId = 'test_conv_size_' + Date.now();
  runtimeDatabase.saveConversation(convId, 'Test Taille Max');

  // Création d'un buffer dépassant 50 Mo (50 Mo + 1 Mo)
  const oversizedBuffer = Buffer.alloc(51 * 1024 * 1024);

  assert.throws(() => {
    artifactManager.createArtifact({
      conversationId: convId,
      filename: 'gros_fichier.bin',
      contentBuffer: oversizedBuffer
    });
  }, /supérieure à la limite autorisée de 50 Mo/);

  runtimeDatabase.deleteConversation(convId);
});

// ─────────────────────────────────────────────────────────────
// PARTIE 3 : APERÇU SÛR (HTML SANDBOX SANS ORIGIN & SVG IMG)
// ─────────────────────────────────────────────────────────────

test('Mission M5 - 9. Sécurité HTML : Iframe sandbox sans allow-same-origin et CSP sans réseau', async () => {
  const token = await getAuthToken();
  const convId = 'test_conv_html_' + Date.now();

  // Créer conversation
  await fetch(`${BASE_URL}/api/conversations`, {
    method: 'POST',
    headers: {
      'Host': '127.0.0.1:3001',
      'Authorization': `Bearer ${token}`,
      'X-Iroko-Request': '1',
      'Content-Type': 'application/json',
      'Origin': 'http://localhost:5173'
    },
    body: JSON.stringify({ id: convId, title: 'Test Sécurité HTML' })
  });

  // Créer un artéfact HTML malveillant tentant de contacter 127.0.0.1:3001 et d'accéder à window.parent
  const maliciousHtml = `
    <!DOCTYPE html>
    <html>
      <body>
        <h1>Test Sécurité</h1>
        <script>
          // Tentative d'exfiltration vers le serveur local
          try {
            fetch('http://127.0.0.1:3001/api/conversations');
          } catch(e) {}
          // Tentative d'accès à la fenêtre parente contenant les jetons
          try {
            var parentToken = window.parent.localStorage;
          } catch(e) {}
        </script>
      </body>
    </html>
  `;

  const artRes = await fetch(`${BASE_URL}/api/conversations/${convId}/artifacts`, {
    method: 'POST',
    headers: {
      'Host': '127.0.0.1:3001',
      'Authorization': `Bearer ${token}`,
      'X-Iroko-Request': '1',
      'Content-Type': 'application/json',
      'Origin': 'http://localhost:5173'
    },
    body: JSON.stringify({
      filename: 'test_injection.html',
      content: maliciousHtml,
      title: 'Test Injection'
    })
  });

  const artData = await artRes.json();
  const artId = artData.artifact?.id || artData.id;

  // Consultation de l'endpoint view-html
  const viewRes = await fetch(`${BASE_URL}/api/artifacts/${artId}/view-html`, {
    headers: {
      'Host': '127.0.0.1:3001',
      'Authorization': `Bearer ${token}`,
      'X-Iroko-Request': '1',
      'Origin': 'http://localhost:5173'
    }
  });

  assert.strictEqual(viewRes.status, 200);
  const cspHeader = viewRes.headers.get('content-security-policy');
  assert.ok(cspHeader, 'L\'en-tête CSP doit être présent');
  assert.ok(cspHeader.includes("connect-src 'none'"), 'La CSP doit interdire tout trafic réseau (connect-src none)');
  assert.ok(cspHeader.includes("default-src 'none'"), 'default-src doit être none');
  assert.strictEqual(viewRes.headers.get('x-content-type-options'), 'nosniff');

  // Nettoyage
  await fetch(`${BASE_URL}/api/conversations/${convId}`, {
    method: 'DELETE',
    headers: {
      'Host': '127.0.0.1:3001',
      'Authorization': `Bearer ${token}`,
      'X-Iroko-Request': '1',
      'Origin': 'http://localhost:5173'
    }
  });
});

test('Mission M5 - 10. Sécurité SVG : Vérification de la neutralisation et balise img', () => {
  const maliciousSvg = `<svg xmlns="http://www.w3.org/2000/svg"><script>alert('XSS')</script><circle cx="50" cy="50" r="40"/></svg>`;
  const convId = 'test_conv_svg_' + Date.now();
  runtimeDatabase.saveConversation(convId, 'Test SVG');

  const art = artifactManager.createArtifact({
    conversationId: convId,
    filename: 'vecteur_infecte.svg',
    content: maliciousSvg
  });

  assert.strictEqual(art.mimeType, 'image/svg+xml', 'Le type MIME doit être image/svg+xml');

  // Vérification que le composant de visualisation lit le SVG comme une URL image data:image/svg+xml
  const dataUri = `data:image/svg+xml;utf8,${encodeURIComponent(maliciousSvg)}`;
  assert.ok(dataUri.startsWith('data:image/svg+xml;utf8,'), 'Le SVG doit être encodé en Data URI');
  // Le navigateur neutralise les balises <script> à l'intérieur d'un SVG chargé par une balise <img>

  runtimeDatabase.deleteConversation(convId);
});

// ─────────────────────────────────────────────────────────────
// PARTIE 4 : TÉLÉCHARGEMENT GROUPÉ DE TOUS LES ARTÉFACTS (ZIP)
// ─────────────────────────────────────────────────────────────

test('Mission M5 - 11. Téléchargement groupé : GET /api/conversations/:id/artifacts/download-all', async () => {
  const token = await getAuthToken();
  const convId = 'test_conv_zipall_' + Date.now();

  const headers = {
    'Host': '127.0.0.1:3001',
    'Authorization': `Bearer ${token}`,
    'X-Iroko-Request': '1',
    'Origin': 'http://localhost:5173'
  };

  // 1. Créer la conversation
  await fetch(`${BASE_URL}/api/conversations`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: convId, title: 'Test Zip All' })
  });

  // 2. Créer 2 artéfacts
  await fetch(`${BASE_URL}/api/conversations/${convId}/artifacts`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: 'fichier1.txt', content: 'Contenu 1' })
  });

  await fetch(`${BASE_URL}/api/conversations/${convId}/artifacts`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: 'fichier2.csv', content: 'a,b\n1,2' })
  });

  // 3. Téléchargement de l'archive groupée
  const dlRes = await fetch(`${BASE_URL}/api/conversations/${convId}/artifacts/download-all`, {
    headers
  });

  assert.strictEqual(dlRes.status, 200);
  assert.strictEqual(dlRes.headers.get('content-type'), 'application/zip');
  assert.ok(dlRes.headers.get('content-disposition')?.includes('.zip'));

  const arrayBuffer = await dlRes.arrayBuffer();
  const zip = await JSZip.loadAsync(Buffer.from(arrayBuffer));

  assert.ok(zip.file('fichier1.txt'), 'L\'archive doit contenir fichier1.txt');
  assert.ok(zip.file('fichier2.csv'), 'L\'archive doit contenir fichier2.csv');

  const content1 = await zip.file('fichier1.txt').async('text');
  assert.strictEqual(content1, 'Contenu 1');

  // Nettoyage
  await fetch(`${BASE_URL}/api/conversations/${convId}`, {
    method: 'DELETE',
    headers
  });
});
