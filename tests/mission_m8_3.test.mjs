import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { runtimeDatabase, sanitizeFts5Query } from '../server/storage/RuntimeDatabase.ts';
import { MockOpenAIServer } from './fixtures/mock_openai_server.mjs';
import { getModelContextWindow } from '../server/runtime/AgentLoop.ts';

describe('Mission M8.3 — Vérifications Exhaustives des 6 Piliers', () => {

  // ─────────────────────────────────────────────────────────────
  // Pilier P2 : Recherche Plein Texte SQLite FTS5 & Assainissement
  // ─────────────────────────────────────────────────────────────
  describe('P2 : Moteur de Recherche SQLite FTS5', () => {
    test('sanitizeFts5Query assainit correctement les caractères réservés et opérateurs', () => {
      // 1. Chaîne standard
      const s1 = sanitizeFts5Query('recherche test');
      assert.equal(s1, '"recherche"* "test"*');

      // 2. Requête avec ponctuation FTS5 réservée
      const s2 = sanitizeFts5Query('calcul*ateTax:');
      assert.equal(s2, '"calcul"* "ateTax"*');

      // 3. Opérateurs booléens FTS5 bruts
      const s3 = sanitizeFts5Query('mot1 AND mot2 OR NOT mot3');
      assert.equal(s3, '"mot1"* "mot2"* "mot3"*');

      // 4. Chaîne uniquement composée de ponctuation
      const s4 = sanitizeFts5Query('***:::---""^^^');
      assert.equal(s4, '');

      // 5. Guillemets et caractères spéciaux
      const s5 = sanitizeFts5Query('"test\'injection"');
      assert.equal(s5, '"test"* "injection"*');
    });

    test('searchFullText retourne un résultat vide sans lever d\'erreur pour une chaîne malveillante ou vide', () => {
      const resEmpty = runtimeDatabase.searchFullText('***:::---');
      assert.deepEqual(resEmpty, []);

      const resSpecial = runtimeDatabase.searchFullText('"OR "" NOT MATCH *');
      assert.ok(Array.isArray(resSpecial));
    });

    test('Index FTS5 synchronisé automatiquement par triggers (INSERT et DELETE)', () => {
      const convId = `test_fts_conv_${Date.now()}`;
      const msgId = `test_fts_msg_${Date.now()}`;

      // 1. Créer une discussion et un message contenant un mot-clé unique
      const keyword = `XylophoneMagique_${Date.now()}`;
      runtimeDatabase.saveConversation(convId, `Discussion ${keyword}`);
      runtimeDatabase.addMessage({
        id: msgId,
        conversationId: convId,
        role: 'user',
        content: `Ceci contient le terme spécial ${keyword} pour tester FTS5.`
      });

      // 2. Vérifier que la recherche FTS5 trouve le message
      const hits = runtimeDatabase.searchFullText(keyword);
      assert.ok(hits.length >= 1, 'Le mot-clé doit être indexé et trouvé dans FTS5');
      const foundMsg = hits.find(h => h.itemId === msgId);
      assert.ok(foundMsg, 'Le message doit correspondre à l\'item trouvé');
      assert.equal(foundMsg.conversationId, convId);
      assert.ok(foundMsg.snippet.includes(keyword) || foundMsg.itemTitle?.includes(keyword) || foundMsg.conversationTitle?.includes(keyword));

      // 3. Supprimer le message et vérifier que FTS5 est synchronisé (trigger trg_messages_ad)
      runtimeDatabase.deleteMessage(msgId);
      const hitsAfterDelete = runtimeDatabase.searchFullText(keyword);
      const deletedHit = hitsAfterDelete.find(h => h.itemId === msgId);
      assert.equal(deletedHit, undefined, 'Le message supprimé ne doit plus apparaître dans search_fts');

      // Nettoyage
      runtimeDatabase.deleteConversation(convId);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Pilier P4 : Actions sur les messages & Troncature sécurisée
  // ─────────────────────────────────────────────────────────────
  describe('P4 : Actions sur les messages, Cascade et Troncature', () => {
    test('deleteMessage supprime le message et supprime en cascade les pièces jointes et artéfacts réels', () => {
      const convId = `test_cascade_conv_${Date.now()}`;
      const msgId = `test_cascade_msg_${Date.now()}`;
      const attId = `test_cascade_att_${Date.now()}`;
      const artId = `test_cascade_art_${Date.now()}`;

      runtimeDatabase.saveConversation(convId, 'Discussion cascade');

      // Créer des fichiers physiques temporaires
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'iroko-cascade-test-'));
      const attFile = path.join(tempDir, 'sample_attachment.txt');
      const artFile = path.join(tempDir, 'sample_artifact.txt');
      fs.writeFileSync(attFile, 'contenu piece jointe');
      fs.writeFileSync(artFile, 'contenu artefact');

      // Enregistrer le message avec metadata et liaisons
      runtimeDatabase.recordAttachment({
        id: attId,
        conversationId: convId,
        messageId: msgId,
        name: 'sample_attachment.txt',
        originalName: 'sample_attachment.txt',
        size: 21,
        mimeType: 'text/plain',
        detectedType: 'text',
        sha256: 'abc123sha',
        filePath: attFile
      });

      runtimeDatabase.recordArtifact({
        id: artId,
        conversationId: convId,
        messageId: msgId,
        name: 'sample_artifact.txt',
        title: 'Artéfact de test',
        mimeType: 'text/plain',
        size: 16,
        filePath: artFile
      });

      runtimeDatabase.addMessage({
        id: msgId,
        conversationId: convId,
        role: 'user',
        content: 'Message avec pièces jointes et artéfact',
        metadata: { attachmentIds: [attId], artifacts: [{ id: artId }] }
      });

      // Supprimer le message
      const delRes = runtimeDatabase.deleteMessage(msgId);
      assert.equal(delRes.success, true);
      assert.ok(delRes.deletedAttachmentIds.includes(attId));
      assert.ok(delRes.deletedArtifactIds.includes(artId));

      // Vérifier que les fichiers physiques ont été supprimés
      assert.equal(fs.existsSync(attFile), false, 'Le fichier de la pièce jointe doit être supprimé du disque');
      assert.equal(fs.existsSync(artFile), false, 'Le fichier de l\'artéfact doit être supprimé du disque');

      // Vérifier que la DB a nettoyé les enregistrements
      assert.equal(runtimeDatabase.getAttachment(attId), null);
      assert.equal(runtimeDatabase.getArtifact(artId), null);

      // Nettoyage
      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
      runtimeDatabase.deleteConversation(convId);
    });

    test('checkTruncateImpact détecte les fichiers modifiés par l\'agent en mode Code', () => {
      const convId = `test_truncate_conv_${Date.now()}`;
      const msg1 = `msg_1_${Date.now()}`;
      const msg2 = `msg_2_${Date.now()}`;
      const taskId = `task_${Date.now()}`;

      runtimeDatabase.saveConversation(convId, 'Discussion Code', undefined, undefined, 'code');

      // Msg 1 (ancien)
      runtimeDatabase.addMessage({
        id: msg1,
        conversationId: convId,
        role: 'user',
        content: 'Écris du code',
        createdAt: '2026-09-01T10:00:00.000Z'
      });

      // Tâche exécutée après msg1 ayant modifié un fichier
      runtimeDatabase.recordTask({
        id: taskId,
        sessionId: 'sess_1',
        conversationId: convId,
        prompt: 'Modification fichier',
        status: 'completed',
        mode: 'code',
        createdAt: '2026-09-01T10:01:00.000Z'
      });

      runtimeDatabase.recordToolCall({
        id: `call_${Date.now()}`,
        taskId: taskId,
        toolName: 'write_file',
        arguments: { path: 'src/services/UserService.ts', content: '// code' },
        status: 'success',
        result: { success: true },
        createdAt: '2026-09-01T10:01:05.000Z'
      });

      // Msg 2 (plus récent)
      runtimeDatabase.addMessage({
        id: msg2,
        conversationId: convId,
        role: 'assistant',
        content: 'Fichier créé.',
        createdAt: '2026-09-01T10:02:00.000Z'
      });

      // Vérifier l'impact si on tronque depuis msg1
      const impact = runtimeDatabase.checkTruncateImpact(convId, msg1);
      assert.equal(impact.subsequentCount, 1);
      assert.equal(impact.filesWereModified, true);
      assert.ok(impact.modifiedFiles.includes('src/services/UserService.ts'));

      // Troncature effective avec includeTarget = false (supprime msg2)
      const truncRes = runtimeDatabase.truncateConversationFrom(convId, msg1, false);
      assert.equal(truncRes.success, true);
      assert.equal(truncRes.deletedCount, 1);
      assert.equal(runtimeDatabase.getMessage(msg2), null);
      assert.ok(runtimeDatabase.getMessage(msg1) !== null);

      // Nettoyage
      runtimeDatabase.deleteConversation(convId);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Pilier P7 : Contexte Utilisé, Fenêtres de Contexte et Résumé
  // ─────────────────────────────────────────────────────────────
  describe('P7 : Suivi du Contexte & Modèles', () => {
    test('getModelContextWindow retourne la fenêtre correcte ou la valeur par défaut', () => {
      assert.equal(getModelContextWindow('anthropic/claude-3.5-sonnet'), 200000);
      assert.equal(getModelContextWindow('anthropic/claude-3-haiku'), 200000);
      assert.equal(getModelContextWindow('openai/gpt-4o'), 128000);
      assert.equal(getModelContextWindow('google/gemini-pro-1.5'), 1000000);
      assert.equal(getModelContextWindow('modèle-inconnu'), 128000);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Pilier P9 : Espace Disque & Nettoyage Sécurisé
  // ─────────────────────────────────────────────────────────────
  describe('P9 : Espace Disque par Catégorie', () => {
    test('getStorageBreakdown retourne des volumes réels chiffrés pour les 5 catégories', () => {
      const breakdown = runtimeDatabase.getStorageBreakdown();

      assert.ok(typeof breakdown.totalBytes === 'number');
      assert.ok(Array.isArray(breakdown.categories));
      assert.equal(breakdown.categories.length, 5);

      const catMap = Object.fromEntries(breakdown.categories.map(c => [c.category, c]));
      assert.ok(catMap.attachments && typeof catMap.attachments.bytes === 'number');
      assert.ok(catMap.artifacts && typeof catMap.artifacts.bytes === 'number');
      assert.ok(catMap.media && typeof catMap.media.bytes === 'number');
      assert.ok(catMap.database && typeof catMap.database.bytes === 'number');
      assert.ok(catMap.tempWorkspaces && typeof catMap.tempWorkspaces.bytes === 'number');
      assert.ok(catMap.database.bytes > 0, 'La base SQLite doit avoir une taille réelle positive');
    });

    test('cleanStorage category "database" compacte la base via VACUUM sans perte de données', () => {
      const convId = `test_vacuum_${Date.now()}`;
      runtimeDatabase.saveConversation(convId, 'Test Vacuum');

      const res = runtimeDatabase.cleanStorage('database');
      assert.equal(res.success, true);
      assert.equal(res.category, 'database');

      // Vérifier que les données sont intactes
      const conv = runtimeDatabase.getConversation(convId);
      assert.ok(conv !== null);
      assert.equal(conv.conversation.title, 'Test Vacuum');

      runtimeDatabase.deleteConversation(convId);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Pilier P14 : Serveur Mock OpenAI compatible & Streaming SSE
  // ─────────────────────────────────────────────────────────────
  describe('P14 : Serveur Mock OpenAI local avec Streaming SSE', () => {
    let mockServer;
    let mockPort;

    before(async () => {
      mockServer = new MockOpenAIServer();
      mockPort = await mockServer.start();
    });

    after(async () => {
      if (mockServer) {
        await mockServer.stop();
      }
    });

    test('Le serveur mock écoute sur un port éphémère et répond aux requêtes non-stream avec usage tokens', async () => {
      mockServer.setResponse('Bonjour test', {
        content: 'Salutations déterministes !',
        promptTokens: 12,
        completionTokens: 8
      });

      const res = await fetch(`http://127.0.0.1:${mockPort}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'mock-gpt',
          messages: [{ role: 'user', content: 'Bonjour test' }],
          stream: false
        })
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.choices[0].message.content, 'Salutations déterministes !');
      assert.equal(data.usage.prompt_tokens, 12);
      assert.equal(data.usage.completion_tokens, 8);
      assert.equal(data.usage.total_tokens, 20);
    });

    test('Le serveur mock émet un flux SSE avec chunks progressifs et usage tokens final', async () => {
      mockServer.setResponse('Flux stream', {
        content: 'Un deux trois',
        promptTokens: 15,
        completionTokens: 5
      });

      const res = await fetch(`http://127.0.0.1:${mockPort}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'mock-gpt',
          messages: [{ role: 'user', content: 'Flux stream' }],
          stream: true
        })
      });

      assert.equal(res.status, 200);
      assert.ok(res.headers.get('content-type')?.includes('text/event-stream'));

      const text = await res.text();
      assert.ok(text.includes('data: {"id"'));
      assert.ok(text.includes('data: [DONE]'));
      assert.ok(text.includes('"usage":{'));
      assert.ok(text.includes('"total_tokens":20'));
    });
  });

});
