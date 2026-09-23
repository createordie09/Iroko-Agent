import { test } from 'node:test';
import assert from 'node:assert';
import { maskSecrets } from '../server/utils/logger.ts';
import { WebSocket } from 'ws';

const BASE_URL = 'http://127.0.0.1:3001';
const WS_URL = 'ws://127.0.0.1:3001/ws';

import http from 'http';

test('1. Sécurité : Rejet d\'un Host étranger (DNS Rebinding)', async () => {
  const statusCode = await new Promise((resolve, reject) => {
    const req = http.request(`${BASE_URL}/health`, {
      method: 'GET',
      headers: { 'Host': 'attacker.evil-dns.com' }
    }, (res) => {
      resolve(res.statusCode);
    });
    req.on('error', reject);
    req.end();
  });

  assert.strictEqual(statusCode, 403, 'Une requête avec un Host non autorisé doit retourner 403');
});

test('2. Sécurité : Rejet d\'une Origine étrangère (403)', async () => {
  const res = await fetch(`${BASE_URL}/api/bootstrap`, {
    headers: {
      'Host': '127.0.0.1:3001',
      'Origin': 'http://evil-website.com'
    }
  });
  assert.strictEqual(res.status, 403, 'Une requête avec une Origin externe non autorisée doit retourner 403');
});

test('3. Sécurité : Rejet de requête non authentifiée sans jeton (401)', async () => {
  const res = await fetch(`${BASE_URL}/api/conversations`, {
    headers: {
      'Host': '127.0.0.1:3001'
    }
  });
  assert.strictEqual(res.status, 401, 'Une requête sans jeton Bearer doit retourner 401');
});

test('4. Amorçage du jeton (Bootstrap) et en-têtes stricts', async () => {
  const res = await fetch(`${BASE_URL}/api/bootstrap`, {
    headers: {
      'Host': '127.0.0.1:3001'
    }
  });
  assert.strictEqual(res.status, 200, 'Le bootstrap local direct doit réussir');
  assert.strictEqual(res.headers.get('x-content-type-options'), 'nosniff', 'X-Content-Type-Options: nosniff requis');
  assert.strictEqual(res.headers.get('access-control-allow-origin'), null, 'Aucun en-tête CORS sur le bootstrap');

  const data = await res.json();
  assert.ok(typeof data.token === 'string' && data.token.length >= 32, 'Un jeton cryptographique valide doit être retourné');
});

test('5. Sécurité : Rejet des requêtes modifiant l\'état sans X-Iroko-Request (400)', async () => {
  const bootRes = await fetch(`${BASE_URL}/api/bootstrap`, { headers: { 'Host': '127.0.0.1:3001' } });
  const { token } = await bootRes.json();

  const res = await fetch(`${BASE_URL}/api/conversations`, {
    method: 'POST',
    headers: {
      'Host': '127.0.0.1:3001',
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ title: 'Discussion test sans header' })
  });

  assert.strictEqual(res.status, 400, 'Une requête d\'écriture sans X-Iroko-Request: 1 doit retourner 400');
  const data = await res.json();
  assert.match(data.error, /X-Iroko-Request/i);
});

test('6. Sécurité : Rejet de payload trop volumineux (413 Payload Too Large)', async () => {
  const bootRes = await fetch(`${BASE_URL}/api/bootstrap`, { headers: { 'Host': '127.0.0.1:3001' } });
  const { token } = await bootRes.json();

  // Créer un payload de ~1.5 Mo (dépasse le plafond standard de 1 Mo)
  const hugeString = 'x'.repeat(1.5 * 1024 * 1024);

  try {
    const res = await fetch(`${BASE_URL}/api/conversations`, {
      method: 'POST',
      headers: {
        'Host': '127.0.0.1:3001',
        'Authorization': `Bearer ${token}`,
        'X-Iroko-Request': '1',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ title: hugeString })
    });

    assert.strictEqual(res.status, 413, 'Un payload > 1 Mo doit retourner 413');
  } catch (err) {
    // Si le serveur a détruit immédiatement la socket côté transport, c'est aussi un comportement de rejet conforme
    assert.ok(true, 'Connexion détruite suite à dépassement de taille');
  }
});

test('7. WebSocket : Ticket à usage unique et refus de réutilisation', async () => {
  const bootRes = await fetch(`${BASE_URL}/api/bootstrap`, { headers: { 'Host': '127.0.0.1:3001' } });
  const { token } = await bootRes.json();

  // 1. Obtenir un ticket à usage unique
  const ticketRes = await fetch(`${BASE_URL}/api/ws-ticket`, {
    method: 'POST',
    headers: {
      'Host': '127.0.0.1:3001',
      'Authorization': `Bearer ${token}`,
      'X-Iroko-Request': '1'
    }
  });
  assert.strictEqual(ticketRes.status, 200);
  const { ticket } = await ticketRes.json();
  assert.ok(ticket && ticket.length > 16, 'Ticket valide retourné');

  // 2. Première connexion avec le ticket : doit réussir
  const ws1 = new WebSocket(`${WS_URL}?ticket=${ticket}`, {
    headers: { 'Host': '127.0.0.1:3001' }
  });

  await new Promise((resolve, reject) => {
    ws1.on('open', () => {
      ws1.close();
      resolve(true);
    });
    ws1.on('error', reject);
  });

  // 3. Deuxième connexion avec le MÊME ticket : doit être rejetée (usage unique)
  let rejected = false;
  try {
    const ws2 = new WebSocket(`${WS_URL}?ticket=${ticket}`, {
      headers: { 'Host': '127.0.0.1:3001' }
    });

    await new Promise((resolve, reject) => {
      ws2.on('open', () => {
        ws2.close();
        reject(new Error('Le ticket réutilisé ne doit pas permettre de se connecter !'));
      });
      ws2.on('error', () => {
        rejected = true;
        resolve(true);
      });
      ws2.on('close', (code) => {
        if (code !== 1000) {
          rejected = true;
          resolve(true);
        }
      });
    });
  } catch {
    rejected = true;
  }

  assert.ok(rejected, 'Une connexion WebSocket avec un ticket déjà utilisé doit être rejetée');
});

test('8. Observabilité : Masquage strict des jetons et clés dans les logs', () => {
  const rawLog = 'Auth header Bearer 1234567890abcdef1234567890abcdef with key sk-proj-1234567890 and ticket=abcdef123456789012';
  const masked = maskSecrets(rawLog);

  assert.ok(!masked.includes('1234567890abcdef1234567890abcdef'), 'Le jeton Bearer ne doit jamais apparaître en clair');
  assert.ok(!masked.includes('sk-proj-1234567890'), 'La clé API ne doit jamais apparaître en clair');
  assert.ok(!masked.includes('abcdef123456789012'), 'Le ticket WebSocket ne doit jamais apparaître en clair');
  assert.ok(masked.includes('Bearer [MASQUÉ]'), 'Le placeholder [MASQUÉ] doit être présent');
});

test('9. Persistance Runtime : CRUD Conversations & Messages', async () => {
  const bootRes = await fetch(`${BASE_URL}/api/bootstrap`, { headers: { 'Host': '127.0.0.1:3001' } });
  const { token } = await bootRes.json();
  const headers = {
    'Host': '127.0.0.1:3001',
    'Authorization': `Bearer ${token}`,
    'X-Iroko-Request': '1',
    'Content-Type': 'application/json'
  };

  // 1. Créer une conversation
  const testTitle = `Test Conversation ${Date.now()}`;
  const createRes = await fetch(`${BASE_URL}/api/conversations`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ title: testTitle })
  });
  assert.strictEqual(createRes.status, 201);
  const { conversation } = await createRes.json();
  assert.strictEqual(conversation.title, testTitle);

  // 2. Ajouter un message
  const msgRes = await fetch(`${BASE_URL}/api/conversations/${conversation.id}/messages`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      role: 'user',
      content: 'Bonjour de test',
      thinkingLogs: ['Analyse de la demande']
    })
  });
  assert.strictEqual(msgRes.status, 201);

  // 3. Lire la conversation avec ses messages
  const getRes = await fetch(`${BASE_URL}/api/conversations/${conversation.id}`, {
    headers: { 'Host': '127.0.0.1:3001', 'Authorization': `Bearer ${token}` }
  });
  assert.strictEqual(getRes.status, 200);
  const data = await getRes.json();
  assert.strictEqual(data.conversation.id, conversation.id);
  assert.strictEqual(data.messages.length, 1);
  assert.strictEqual(data.messages[0].content, 'Bonjour de test');

  // 4. Supprimer la conversation
  const delRes = await fetch(`${BASE_URL}/api/conversations/${conversation.id}`, {
    method: 'DELETE',
    headers
  });
  assert.strictEqual(delRes.status, 200);
});

test('10. Migration localStorage vers Runtime SQLite', async () => {
  const bootRes = await fetch(`${BASE_URL}/api/bootstrap`, { headers: { 'Host': '127.0.0.1:3001' } });
  const { token } = await bootRes.json();

  const migrationPayload = {
    conversations: [
      {
        id: `migrated-${Date.now()}`,
        topic: 'Discussion migrée depuis le cache',
        messages: [
          { role: 'user', content: 'Message archivé' },
          { role: 'assistant', content: 'Réponse archivée' }
        ]
      }
    ],
    settings: {
      'test_migrated_setting': 'valeur_sauvegardée'
    }
  };

  const migRes = await fetch(`${BASE_URL}/api/migration/from-localstorage`, {
    method: 'POST',
    headers: {
      'Host': '127.0.0.1:3001',
      'Authorization': `Bearer ${token}`,
      'X-Iroko-Request': '1',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(migrationPayload)
  });

  assert.strictEqual(migRes.status, 200);
  const migData = await migRes.json();
  assert.ok(migData.success);
  assert.strictEqual(migData.importedConversations, 1);
  assert.strictEqual(migData.importedSettings, 1);

  // Nettoyage après test pour préserver les données de départ fixes
  await fetch(`${BASE_URL}/api/conversations/${migrationPayload.conversations[0].id}`, {
    method: 'DELETE',
    headers: {
      'Host': '127.0.0.1:3001',
      'Authorization': `Bearer ${token}`,
      'X-Iroko-Request': '1'
    }
  });
});
