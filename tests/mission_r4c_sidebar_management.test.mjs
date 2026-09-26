import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { runtimeDatabase } from '../server/storage/RuntimeDatabase.ts';
import { deletionManager } from '../server/storage/DeletionManager.ts';
import { artifactManager } from '../server/artifacts/ArtifactManager.ts';
import { SidebarDiscussionItem } from '../src/components/sidebar/SidebarDiscussionItem.tsx';
import { SidebarFilterBar } from '../src/components/sidebar/SidebarFilterBar.tsx';

test('MISSION R4c — 1. Renommage inline : mise à jour du titre en base et persistance', async () => {
  const convId = 'conv-rename-test-' + Date.now();
  const initialTitle = 'Discussion Initiale';
  runtimeDatabase.saveConversation(convId, initialTitle);

  // 1. Vérification titre initial
  const convBefore = runtimeDatabase.getConversation(convId);
  assert.ok(convBefore);
  assert.equal(convBefore.conversation.title, initialTitle);

  // 2. Renommage
  const updatedTitle = 'Analyse Financière Q4';
  const success = runtimeDatabase.updateConversationTitle(convId, updatedTitle);
  assert.equal(success, true, 'updateConversationTitle doit retourner true');

  // 3. Vérification persistance en base SQLite
  const convAfter = runtimeDatabase.getConversation(convId);
  assert.ok(convAfter);
  assert.equal(convAfter.conversation.title, updatedTitle);
  assert.notEqual(convAfter.conversation.title, initialTitle);

  // Nettoyage
  runtimeDatabase.deleteConversation(convId);
});

test('MISSION R4c — 2. Duplication étanche : nouveau titre, nouveaux UUIDs et zéro ID partagé', async () => {
  const convId = 'conv-dup-orig-' + Date.now();
  const originalTitle = 'Plan Stratégique';
  runtimeDatabase.saveConversation(convId, originalTitle, 'C:\\workspace\\test');

  const msg1Id = 'msg-orig-1-' + Date.now();
  const msg2Id = 'msg-orig-2-' + Date.now();
  runtimeDatabase.addMessage({
    id: msg1Id,
    conversationId: convId,
    role: 'user',
    content: 'Pouvez-vous analyser ces données ?'
  });
  runtimeDatabase.addMessage({
    id: msg2Id,
    conversationId: convId,
    role: 'assistant',
    content: 'Voici l\'analyse détaillée.',
    thinkingLogs: ['Étape 1 : calcul des ratios\n', 'Étape 2 : synthèse\n'],
    metadata: { model: 'mock-model' }
  });

  // Duplication
  const result = runtimeDatabase.duplicateConversation(convId);
  assert.ok(result, 'duplicateConversation doit retourner un objet { conversation, messages }');

  const { conversation: dupConv, messages: dupMessages } = result;

  // 1. Vérification du nouveau titre avec préfixe 'Copie de '
  assert.equal(dupConv.title, 'Copie de ' + originalTitle);

  // 2. Vérification étanchéité de l'UUID de discussion
  assert.notEqual(dupConv.id, convId, 'L\'identifiant de la nouvelle discussion doit être distinct');
  assert.ok(dupConv.id && dupConv.id.length > 10);

  // 3. Vérification du nombre de messages et conservation fidèle du contenu
  assert.equal(dupMessages.length, 2, 'Tous les messages doivent être dupliqués');

  // 4. Vérification stricte : AUCUN partage d'identifiant de message
  const originalMessageIds = new Set([msg1Id, msg2Id]);
  for (const m of dupMessages) {
    assert.equal(originalMessageIds.has(m.id), false, `Le message dupliqué ${m.id} ne doit pas partager l'ID d'un message original`);
    assert.equal(m.conversation_id, dupConv.id, 'Le message dupliqué doit être rattaché à la nouvelle discussion');
  }

  // 5. Vérification fidèle du rôle et du contenu
  assert.equal(dupMessages[0].role, 'user');
  assert.equal(dupMessages[0].content, 'Pouvez-vous analyser ces données ?');
  assert.equal(dupMessages[1].role, 'assistant');
  assert.equal(dupMessages[1].content, 'Voici l\'analyse détaillée.');

  // 6. Vérification des logs de réflexion
  const parsedThinking = JSON.parse(dupMessages[1].thinking_logs || '[]');
  assert.equal(parsedThinking.length, 2);
  assert.equal(parsedThinking[0], 'Étape 1 : calcul des ratios\n');

  // 7. Duplication d'une copie : préfixe cumulatif
  const secondDup = runtimeDatabase.duplicateConversation(dupConv.id);
  assert.ok(secondDup);
  assert.equal(secondDup.conversation.title, 'Copie de Copie de ' + originalTitle);
  assert.notEqual(secondDup.conversation.id, dupConv.id);

  // Nettoyage
  runtimeDatabase.deleteConversation(convId);
  runtimeDatabase.deleteConversation(dupConv.id);
  runtimeDatabase.deleteConversation(secondDup.conversation.id);
});

test('MISSION R4c — 3. Suppression multiple et rétractation collective de 5 secondes', async () => {
  const conv1 = 'conv-batch-1-' + Date.now();
  const conv2 = 'conv-batch-2-' + Date.now();
  const conv3 = 'conv-batch-3-' + Date.now();

  runtimeDatabase.saveConversation(conv1, 'Discussion Lot A');
  runtimeDatabase.saveConversation(conv2, 'Discussion Lot B');
  runtimeDatabase.saveConversation(conv3, 'Discussion Lot C (Témoin)');

  // 1. Planification collective de suppression différée pour conv1 et conv2
  const idsToDelete = [conv1, conv2];
  for (const id of idsToDelete) {
    deletionManager.scheduleDeletion('conversation', id, 5000);
  }

  // 2. Vérification du masquage des deux éléments
  assert.ok(deletionManager.isPending('conversation', conv1));
  assert.ok(deletionManager.isPending('conversation', conv2));
  assert.equal(deletionManager.isPending('conversation', conv3), false);

  const activeList = runtimeDatabase.listConversations();
  const idsInList = new Set(activeList.map(c => c.id));
  assert.equal(idsInList.has(conv1), false, 'conv1 doit être masquée de la liste');
  assert.equal(idsInList.has(conv2), false, 'conv2 doit être masquée de la liste');
  assert.equal(idsInList.has(conv3), true, 'conv3 non supprimée doit rester visible');

  // 3. Rétractation collective : annulation simultanée de tout le groupe
  for (const id of idsToDelete) {
    const ok = deletionManager.cancelDeletion('conversation', id);
    assert.ok(ok, `L'annulation de ${id} doit retourner true`);
  }

  // 4. Restauration simultanée
  assert.equal(deletionManager.isPending('conversation', conv1), false);
  assert.equal(deletionManager.isPending('conversation', conv2), false);

  const restoredList = runtimeDatabase.listConversations();
  const restoredIds = new Set(restoredList.map(c => c.id));
  assert.ok(restoredIds.has(conv1), 'conv1 doit réapparaître intacte');
  assert.ok(restoredIds.has(conv2), 'conv2 doit réapparaître intacte');

  // 5. Purge collective après expiration
  for (const id of idsToDelete) {
    deletionManager.scheduleDeletion('conversation', id, 150);
  }
  await new Promise(r => setTimeout(r, 250));

  assert.equal(runtimeDatabase.getConversation(conv1), null, 'conv1 doit être purgée');
  assert.equal(runtimeDatabase.getConversation(conv2), null, 'conv2 doit être purgée');
  assert.ok(runtimeDatabase.getConversation(conv3), 'conv3 témoin doit demeurer intacte');

  // Nettoyage témoin
  runtimeDatabase.deleteConversation(conv3);
});

test('MISSION R4c — 4. Composant SidebarDiscussionItem : modes normal, édition et sélection', () => {
  const mockItem = {
    id: 'test-item-1',
    topic: 'Ma Discussion Importante',
    mode: 'chat',
    timestamp: Date.now()
  };

  // 1. Rendu en mode normal
  const normalHtml = renderToString(
    React.createElement(SidebarDiscussionItem, {
      item: mockItem,
      isActive: false,
      isRunning: false,
      isEditing: false,
      editingTitle: '',
      setEditingTitle: () => {},
      onSaveRename: () => {},
      onCancelRename: () => {},
      onStartRename: () => {},
      onDuplicate: () => {},
      onDelete: () => {},
      onSelect: () => {},
      isSelectionMode: false,
      isSelected: false,
      onToggleSelect: () => {}
    })
  );
  assert.ok(normalHtml.includes('Ma Discussion Importante'), 'Le sujet de la discussion doit être affiché');
  assert.ok(normalHtml.includes('double-clic pour renommer'), 'L\'infobulle doit informer sur le renommage par double-clic');
  assert.ok(!normalHtml.includes('<input'), 'Aucun input ne doit être affiché en mode normal');

  // 2. Rendu en mode édition inline
  const editHtml = renderToString(
    React.createElement(SidebarDiscussionItem, {
      item: mockItem,
      isActive: false,
      isRunning: false,
      isEditing: true,
      editingTitle: 'Titre en cours de saisie',
      setEditingTitle: () => {},
      onSaveRename: () => {},
      onCancelRename: () => {},
      onStartRename: () => {},
      onDuplicate: () => {},
      onDelete: () => {},
      onSelect: () => {},
      isSelectionMode: false,
      isSelected: false,
      onToggleSelect: () => {}
    })
  );
  assert.ok(editHtml.includes('<input'), 'Un champ input doit être présent en mode édition');
  assert.ok(editHtml.includes('Titre en cours de saisie'), 'La valeur saisie doit figurer dans l\'input');
  assert.ok(editHtml.includes('Modifier le titre de la discussion'), 'L\'input doit posséder un aria-label accessible');

  // 3. Rendu en mode sélection multiple
  const selectHtml = renderToString(
    React.createElement(SidebarDiscussionItem, {
      item: mockItem,
      isActive: false,
      isRunning: false,
      isEditing: false,
      editingTitle: '',
      setEditingTitle: () => {},
      onSaveRename: () => {},
      onCancelRename: () => {},
      onStartRename: () => {},
      onDuplicate: () => {},
      onDelete: () => {},
      onSelect: () => {},
      isSelectionMode: true,
      isSelected: true,
      onToggleSelect: () => {}
    })
  );
  assert.ok(selectHtml.includes('role="checkbox"'), 'Une case à cocher doit être présente en mode sélection');
  assert.ok(selectHtml.includes('aria-checked="true"'), 'La case doit refléter l\'état sélectionné');
});
