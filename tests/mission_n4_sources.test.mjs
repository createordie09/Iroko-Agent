import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { AgentLoop } from '../server/runtime/AgentLoop.ts';
import { runtimeDatabase } from '../server/storage/RuntimeDatabase.ts';

test('MISSION N4 : AFFICHAGE DES SOURCES DE RECHERCHE', async (t) => {
  const agentLoop = new AgentLoop();

  await t.test('1. Données : Seules les sources effectivement citées dans la réponse sont extraites', () => {
    const searchResults = [
      {
        url: 'https://developer.mozilla.org/fr/docs/Web/JavaScript',
        title: 'JavaScript | MDN',
        snippet: 'Guide JavaScript complet...',
        source: 'brave'
      },
      {
        url: 'https://nodejs.org/docs/latest/api/',
        title: 'Node.js Documentation',
        snippet: 'Documentation officielle Node.js...',
        source: 'brave'
      },
      {
        url: 'https://unused-search-engine.org/article',
        title: 'Article non utilisé',
        snippet: 'Cet article n\'a pas été cité...',
        source: 'brave'
      }
    ];

    // Réponse assistant qui ne cite que MDN et Node.js
    const assistantText = `
D'après la documentation officielle sur [JavaScript MDN](https://developer.mozilla.org/fr/docs/Web/JavaScript),
les modules ECMAScript sont pris en charge nativement. Vous pouvez également consulter
la documentation Node.js sur https://nodejs.org/docs/latest/api/ pour plus de détails.
`;

    const used = agentLoop.extractUsedSources(assistantText, searchResults);

    assert.equal(used.length, 2, 'Seules 2 sources doivent être extraites');
    assert.equal(used[0].url, 'https://developer.mozilla.org/fr/docs/Web/JavaScript');
    assert.equal(used[0].title, 'JavaScript | MDN');
    assert.equal(used[0].domain, 'developer.mozilla.org');

    assert.equal(used[1].url, 'https://nodejs.org/docs/latest/api/');
    assert.equal(used[1].domain, 'nodejs.org');

    // Vérifier que la source non citée est formellement exclue
    assert.equal(used.some(s => s.url.includes('unused-search-engine.org')), false, 'La source non citée ne doit pas apparaître');
  });

  await t.test('2. Données : Réponse sans recherche ou sans citations = liste vide', () => {
    const searchResults = [
      {
        url: 'https://example.com/test',
        title: 'Test',
        snippet: 'Snippet',
        source: 'brave'
      }
    ];

    // Réponse sans aucune URL
    const plainText = 'Voici une réponse purement textuelle ne citant aucune source externe.';
    const emptySources = agentLoop.extractUsedSources(plainText, searchResults);
    assert.deepEqual(emptySources, [], 'La liste des sources doit être vide');

    // Réponse avec liste de résultats vide
    const noResults = agentLoop.extractUsedSources(plainText, []);
    assert.deepEqual(noResults, [], 'Aucune source si aucun résultat de recherche');
  });

  await t.test('3. Données : Tolérance sur trailing slash et normalisation de domaine', () => {
    const searchResults = [
      {
        url: 'https://www.typescriptlang.org/docs/',
        title: 'TypeScript Documentation',
        snippet: 'Documentation TS',
        source: 'brave'
      }
    ];

    // Modèle citant sans le slash final ou avec www nettoyé
    const text = 'Consultez https://www.typescriptlang.org/docs pour les types.';
    const used = agentLoop.extractUsedSources(text, searchResults);

    assert.equal(used.length, 1);
    assert.equal(used[0].domain, 'typescriptlang.org', 'Le préfixe www. doit être retiré du domaine affiché');
    assert.equal(used[0].title, 'TypeScript Documentation');
  });

  await t.test('4. Persistance : Enregistrement et restitution des sources dans la base SQLite', () => {
    const convId = 'test-conv-n4-sources-' + Date.now();
    runtimeDatabase.saveConversation(convId, 'Discussion Sources N4');

    const msgId = 'msg-sources-' + Date.now();
    const sourcesData = [
      { url: 'https://react.dev/reference', title: 'React Reference', domain: 'react.dev' },
      { url: 'https://vite.dev/guide', title: 'Vite Guide', domain: 'vite.dev' }
    ];

    // Ajout du message avec metadata.sources
    runtimeDatabase.addMessage({
      id: msgId,
      conversationId: convId,
      role: 'assistant',
      content: 'Voici les réponses documentées sur React et Vite.',
      metadata: {
        sources: sourcesData
      }
    });

    // Lecture via getMessage
    const retrievedMsg = runtimeDatabase.getMessage(msgId);
    assert.ok(retrievedMsg, 'Le message doit être retrouvé');
    const parsedMetadata = JSON.parse(retrievedMsg.metadata || '{}');
    assert.ok(parsedMetadata.sources, 'metadata.sources doit être présent');
    assert.equal(parsedMetadata.sources.length, 2);
    assert.equal(parsedMetadata.sources[0].url, 'https://react.dev/reference');
    assert.equal(parsedMetadata.sources[1].domain, 'vite.dev');

    // Lecture via getConversation
    const conv = runtimeDatabase.getConversation(convId);
    assert.ok(conv, 'La conversation doit être retrouvée');
    const msgInConv = conv.messages.find(m => m.id === msgId);
    assert.ok(msgInConv, 'Le message doit être dans la conversation');
    const metaInConv = JSON.parse(msgInConv.metadata || '{}');
    assert.deepEqual(metaInConv.sources, sourcesData);

    // Message sans sources : metadata.sources absent
    const plainMsgId = 'msg-plain-' + Date.now();
    runtimeDatabase.addMessage({
      id: plainMsgId,
      conversationId: convId,
      role: 'assistant',
      content: 'Message simple sans recherche.'
    });
    const retrievedPlain = runtimeDatabase.getMessage(plainMsgId);
    const parsedPlainMeta = JSON.parse(retrievedPlain.metadata || '{}');
    assert.equal(parsedPlainMeta.sources, undefined, 'Pas de sources pour un message simple');
  });

  await t.test('5. UI : Le composant MessageSources gère le repli au-delà de 3 sources', () => {
    const componentPath = path.resolve(process.cwd(), 'src/features/chat/MessageSources.tsx');
    assert.ok(fs.existsSync(componentPath), 'MessageSources.tsx doit exister');
    const code = fs.readFileSync(componentPath, 'utf8');

    // Vérifier l'état vide strict (retour null si vide)
    assert.ok(code.includes('if (!sources || sources.length === 0)'), 'Doit retourner null si sources est vide');
    assert.ok(code.includes('return null;'), 'Doit renvoyer null sans afficher de bloc vide');

    // Vérifier le seuil de 3 sources
    assert.ok(code.includes('sources.length > 3'), 'Seuil de repli au-delà de 3 sources');
    assert.ok(code.includes('sources.slice(0, 3)'), 'Affiche 3 sources par défaut');

    // Vérifier la présence des libellés de bascule
    assert.ok(code.includes('Afficher moins'), 'Bouton pour replier');
    assert.ok(code.includes('autres sources'), 'Bouton pour déplier le surplus');
  });

  await t.test('6. Accessibilité : Cibles tactiles ≥ 24 px, focus visible et liens sécurisés', () => {
    const componentPath = path.resolve(process.cwd(), 'src/features/chat/MessageSources.tsx');
    const code = fs.readFileSync(componentPath, 'utf8');

    // target="_blank" et rel="noopener noreferrer"
    assert.ok(code.includes('target="_blank"'), 'Les liens doivent ouvrir un nouvel onglet');
    assert.ok(code.includes('rel="noopener noreferrer"'), 'rel="noopener noreferrer" obligatoire pour la sécurité');

    // Accessible name complet
    assert.ok(code.includes('aria-label='), 'aria-label obligatoire pour le nom accessible complet');
    assert.ok(code.includes('source.domain'), 'aria-label doit intégrer le domaine');

    // Focus visible
    assert.ok(code.includes('focus-visible:'), 'Indicateur focus-visible obligatoire');

    // Cible interactive ≥ 24px (min-h-[30px] et tap-target-24)
    assert.ok(code.includes('min-h-[30px]') || code.includes('min-h-[28px]'), 'Hauteur de cible ≥ 24px');
    assert.ok(code.includes('tap-target-24'), 'Classe tap-target-24 pour extension tactile sur mobile');
  });

  await t.test('7. Outil en direct : LiveToolExecutions affiche "Recherche : <requête>"', () => {
    const liveToolsPath = path.resolve(process.cwd(), 'src/features/chat/LiveToolExecutions.tsx');
    const code = fs.readFileSync(liveToolsPath, 'utf8');

    assert.ok(code.includes("te.tool === 'web_search'"), 'Détection spécifique de l\'outil web_search');
    assert.ok(code.includes('Recherche'), 'Libellé Recherche dans l\'étape live');
    assert.ok(code.includes('te.input?.query'), 'Affiche la requête recherchée');
  });

  await t.test('8. ChatMessageItem : Intègre MessageSources sous la réponse sans bloc vide', () => {
    const itemPath = path.resolve(process.cwd(), 'src/features/chat/ChatMessageItem.tsx');
    const code = fs.readFileSync(itemPath, 'utf8');

    assert.ok(code.includes('MessageSources'), 'ChatMessageItem doit importer MessageSources');
    assert.ok(code.includes('msg.metadata?.sources'), 'Doit lire les sources dans msg.metadata');
    assert.ok(code.includes('msg.metadata.sources.length > 0'), 'Ne doit afficher MessageSources que s\'il y a des sources');
  });
});
