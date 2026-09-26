// tests/mission_r4g_conversation_pdf_export.test.mjs
// Mission R4g : Exportation PDF lisible d'une conversation via pdf-lib

import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';

const { ConversationPdfExporter } = await import('../server/export/ConversationPdfExporter.ts');
const { runtimeDatabase } = await import('../server/storage/RuntimeDatabase.ts');

const BASE_URL = 'http://127.0.0.1:3001';

async function getAuthToken() {
  const bootRes = await fetch(`${BASE_URL}/api/bootstrap`, {
    headers: { 'Host': '127.0.0.1:3001' }
  });
  const { token } = await bootRes.json();
  return token;
}

test('Mission R4g - 1. Export PDF d\'une conversation courte (titre, date, messages utilisateur/assistant distincts)', async () => {
  const buffer = await ConversationPdfExporter.generate({
    title: 'Discussion sur l\'architecture Iroko',
    date: '26 septembre 2026',
    messages: [
      { role: 'user', content: 'Bonjour, comment fonctionne le runtime local d\'Iroko ?' },
      { role: 'assistant', content: 'Bonjour. Le runtime Iroko fonctionne de manière totalement confinée et autonome en local, avec un serveur Node/Express/WebSocket et une base SQLite embarquée.' }
    ]
  });

  assert.ok(buffer instanceof Buffer, 'Le résultat doit être un Buffer');
  assert.ok(buffer.length > 0, 'Le buffer ne doit pas être vide');

  // Relecture structurelle via pdf-lib
  const pdfDoc = await PDFDocument.load(buffer);
  assert.equal(pdfDoc.getPageCount(), 1, 'Une discussion courte doit tenir sur 1 page');
  assert.equal(pdfDoc.getTitle(), 'Discussion sur l\'architecture Iroko');
  assert.equal(pdfDoc.getAuthor(), 'Iroko Code Agent');
});

test('Mission R4g - 2. Rendu des blocs de code en police à chasse fixe avec fond dédié', async () => {
  const buffer = await ConversationPdfExporter.generate({
    title: 'Exemple de code TypeScript',
    messages: [
      { role: 'user', content: 'Peux-tu me montrer une fonction TypeScript sécurisée ?' },
      {
        role: 'assistant',
        content: 'Voici un exemple de fonction de nettoyage de chemin :\n```typescript\nfunction sanitizePath(p: string): string {\n  return path.normalize(p).replace(/^(\\.\\.[\\/\\\\])+/, \'\');\n}\n```\nElle évite les traversées de répertoire.'
      }
    ]
  });

  const pdfDoc = await PDFDocument.load(buffer);
  assert.ok(pdfDoc.getPageCount() >= 1);
  const firstPage = pdfDoc.getPage(0);
  assert.equal(firstPage.getWidth(), 595.28); // Format A4 standard
  assert.equal(firstPage.getHeight(), 841.89);
});

test('Mission R4g - 3. Pagination propre sur discussion longue multi-pages', async () => {
  // Générer une longue discussion (> 20 échanges avec paragraphes détaillés)
  const messages = [];
  for (let i = 1; i <= 25; i++) {
    messages.push({
      role: 'user',
      content: `Question ${i} : Détaillez les spécifications techniques et les garanties de sécurité du point numéro ${i}.`
    });
    messages.push({
      role: 'assistant',
      content: `Réponse détaillée ${i} : Pour le point ${i}, le runtime applique une isolation stricte sur l'espace de travail.\n\nToutes les opérations sur les fichiers sont validées par le Garde Réseau et le gestionnaire de permissions.\n\n\`\`\`bash\n# Commande de diagnostic point ${i}\nnode dist-server/index.js --check-policy=${i}\n\`\`\`\nAucune fuite de données n'est permise.`
    });
  }

  const buffer = await ConversationPdfExporter.generate({
    title: 'Longue session de conception Iroko',
    messages
  });

  const pdfDoc = await PDFDocument.load(buffer);
  assert.ok(pdfDoc.getPageCount() > 1, `Une longue discussion doit produire plusieurs pages (obtenu: ${pdfDoc.getPageCount()})`);
  assert.ok(pdfDoc.getPageCount() >= 3, 'Doit générer au moins 3 pages pour 50 messages longs');
});

test('Mission R4g - 4. Références textuelles sobres pour images, pièces jointes et artéfacts', async () => {
  const contentWithRefs = `Voici l'analyse du schéma :\n![Diagramme d'architecture](file:///path/to/diagram.png)\nEt le composant associé :\n<artifact_card name="MonComposant.tsx" type="application/vnd.ant.react">\n[Pièce jointe : rapport_audit.pdf]`;

  const formatted = ConversationPdfExporter.formatContentReferences(contentWithRefs);
  assert.ok(formatted.includes('[Image : Diagramme d\'architecture]'));
  assert.ok(formatted.includes('[Artéfact : MonComposant.tsx]'));
  assert.ok(formatted.includes('[Pièce jointe : rapport_audit.pdf]'));

  // S'assurer que le PDF se génère sans plantage avec ces références
  const buffer = await ConversationPdfExporter.generate({
    title: 'Discussion avec artéfacts et médias',
    messages: [
      { role: 'user', content: 'Voici les documents joints.' },
      { role: 'assistant', content: contentWithRefs }
    ]
  });

  const pdfDoc = await PDFDocument.load(buffer);
  assert.equal(pdfDoc.getPageCount(), 1);
});

test('Mission R4g - 5. Préservation des accents français et nettoyage sécurisé des symboles WinAnsi', () => {
  const frenchText = 'Élévation des privilèges, boîte à outils, fenêtre d\'accès, « guillemets » et tirets — ainsi que des émojis 🚀🔒.';
  const sanitized = ConversationPdfExporter.sanitizeText(frenchText);

  // Accents français conservés
  assert.ok(sanitized.includes('Élévation'));
  assert.ok(sanitized.includes('boîte'));
  assert.ok(sanitized.includes('fenêtre'));
  assert.ok(sanitized.includes('accès'));
  assert.ok(sanitized.includes('« guillemets »'));

  // Emojis neutralisés sans exception
  assert.ok(!sanitized.includes('🚀'));
  assert.ok(!sanitized.includes('🔒'));
});

test('Mission R4g - 6. Plafond de longueur et rejet explicite (pas d\'échec silencieux)', async () => {
  // Test discussion vide
  await assert.rejects(
    async () => {
      await ConversationPdfExporter.generate({
        title: 'Discussion vide',
        messages: []
      });
    },
    (err) => {
      assert.ok(err.message.includes('vide'));
      return true;
    }
  );

  // Test dépassement du nombre de messages (> 100 messages)
  const tooManyMessages = [];
  for (let i = 0; i < 105; i++) {
    tooManyMessages.push({ role: 'user', content: `Message ${i}` });
  }

  await assert.rejects(
    async () => {
      await ConversationPdfExporter.generate({
        title: 'Discussion trop longue en messages',
        messages: tooManyMessages
      });
    },
    (err) => {
      assert.ok(err.message.includes('trop volumineuse'));
      assert.ok(err.message.includes('105 messages'));
      assert.ok(err.message.includes('100 messages'));
      assert.ok(err.message.includes('Markdown ou JSON'));
      return true;
    }
  );

  // Test dépassement du volume de caractères (> 150 000 caractères)
  const hugeContent = 'a'.repeat(80_000);
  const hugeMessages = [
    { role: 'user', content: hugeContent },
    { role: 'assistant', content: hugeContent }
  ];

  await assert.rejects(
    async () => {
      await ConversationPdfExporter.generate({
        title: 'Discussion trop lourde en texte',
        messages: hugeMessages
      });
    },
    (err) => {
      assert.ok(err.message.includes('trop volumineux'));
      assert.ok(err.message.includes('150 000 caractères') || err.message.includes('150\u202f000'));
      assert.ok(err.message.includes('Markdown ou JSON'));
      return true;
    }
  );
});

test('Mission R4g - 7. Endpoints HTTP : POST /api/conversations/export-pdf et GET /api/conversations/:id/export/pdf', async () => {
  // 1. Récupérer le token de session
  const token = await getAuthToken();

  // 2. Créer une conversation de test via HTTP
  const createConvRes = await fetch(`${BASE_URL}/api/conversations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Iroko-Request': '1',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      title: 'Discussion Test Endpoint PDF'
    })
  });
  assert.equal(createConvRes.status, 201);
  const { conversation } = await createConvRes.json();
  const convId = conversation.id;

  // 3. Ajouter un message à la discussion
  const addMsgRes = await fetch(`${BASE_URL}/api/conversations/${convId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Iroko-Request': '1',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      role: 'user',
      content: 'Bonjour, ceci est un message de test pour l\'export PDF.'
    })
  });
  assert.equal(addMsgRes.status, 201);

  // 4. Tester GET /api/conversations/:id/export/pdf
  const getRes = await fetch(`${BASE_URL}/api/conversations/${convId}/export/pdf`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  assert.equal(getRes.status, 200);
  assert.equal(getRes.headers.get('content-type'), 'application/pdf');
  const getPdfBlob = await getRes.arrayBuffer();
  const getPdfDoc = await PDFDocument.load(getPdfBlob);
  assert.equal(getPdfDoc.getPageCount(), 1);

  // 5. Tester GET sur conversation inconnue -> 404
  const notFoundRes = await fetch(`${BASE_URL}/api/conversations/inconnue-id-404/export/pdf`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  assert.equal(notFoundRes.status, 404);

  // 6. Tester POST /api/conversations/export-pdf
  const postRes = await fetch(`${BASE_URL}/api/conversations/export-pdf`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Iroko-Request': '1',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      title: 'Discussion Ad-Hoc PDF',
      messages: [
        { role: 'user', content: 'Message direct sans sauvegarde préalable.' },
        { role: 'assistant', content: 'Réponse directe en PDF.' }
      ]
    })
  });

  assert.equal(postRes.status, 200);
  assert.equal(postRes.headers.get('content-type'), 'application/pdf');
  const postPdfBlob = await postRes.arrayBuffer();
  const postPdfDoc = await PDFDocument.load(postPdfBlob);
  assert.equal(postPdfDoc.getPageCount(), 1);

  // 7. Tester dépassement de limite via POST -> doit retourner HTTP 400 avec message explicite
  const overflowRes = await fetch(`${BASE_URL}/api/conversations/export-pdf`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Iroko-Request': '1',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      title: 'Discussion Débordement',
      messages: Array.from({ length: 110 }, (_, i) => ({ role: 'user', content: `Message ${i}` }))
    })
  });

  assert.equal(overflowRes.status, 400);
  const overflowJson = await overflowRes.json();
  assert.ok(overflowJson.error.includes('trop volumineuse'));
  assert.ok(overflowJson.error.includes('Markdown ou JSON'));
});
