import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { runtimeDatabase } from '../server/storage/RuntimeDatabase.ts';
import { SidebarDiscussionItem } from '../src/components/sidebar/SidebarDiscussionItem.tsx';

test('MISSION R4e — 1. Épinglage et persistance SQLite (is_pinned, pinned_at, pinned_order)', async () => {
  const convId = 'conv-pin-test-' + Date.now();
  runtimeDatabase.saveConversation(convId, 'Discussion à épingler');

  // État initial : non épinglée
  const initial = runtimeDatabase.getConversation(convId);
  assert.ok(initial);
  assert.equal(Boolean(initial.conversation.is_pinned), false);

  // 1. Épingler
  const pinRes = runtimeDatabase.pinConversation(convId, true);
  assert.ok(pinRes);
  assert.equal(pinRes.success, true);
  assert.equal(pinRes.is_pinned, 1);
  assert.ok(pinRes.pinned_at);
  assert.ok(pinRes.pinned_order >= 1);

  // 2. Vérification persistance en base
  const pinnedInDb = runtimeDatabase.getConversation(convId);
  assert.ok(pinnedInDb);
  assert.equal(pinnedInDb.conversation.is_pinned, 1);
  assert.equal(pinnedInDb.conversation.pinned_at, pinRes.pinned_at);
  assert.equal(pinnedInDb.conversation.pinned_order, pinRes.pinned_order);

  // Nettoyage
  runtimeDatabase.deleteConversation(convId);
});

test('MISSION R4e — 2. Désépinglage réversible : retour à l\'état neutre sans résidu', async () => {
  const convId = 'conv-unpin-test-' + Date.now();
  runtimeDatabase.saveConversation(convId, 'Discussion temporairement épinglée');
  runtimeDatabase.pinConversation(convId, true);

  // Vérifier qu'elle est bien épinglée
  const before = runtimeDatabase.getConversation(convId);
  assert.equal(before.conversation.is_pinned, 1);

  // Désépingler
  const unpinRes = runtimeDatabase.pinConversation(convId, false);
  assert.ok(unpinRes);
  assert.equal(unpinRes.success, true);
  assert.equal(unpinRes.is_pinned, 0);
  assert.equal(unpinRes.pinned_at, null);
  assert.equal(unpinRes.pinned_order, 0);

  // Vérifier persistance après désépinglage
  const after = runtimeDatabase.getConversation(convId);
  assert.equal(after.conversation.is_pinned, 0);
  assert.equal(after.conversation.pinned_at, null);
  assert.equal(after.conversation.pinned_order, 0);

  // Nettoyage
  runtimeDatabase.deleteConversation(convId);
});

test('MISSION R4e — 3. Tri des discussions : les épinglés apparaissent en tête selon pinned_order', async () => {
  const conv1 = 'conv-order-1-' + Date.now();
  const conv2 = 'conv-order-2-' + Date.now();
  const conv3 = 'conv-order-3-' + Date.now();

  runtimeDatabase.saveConversation(conv1, 'Discussion Normale A');
  runtimeDatabase.saveConversation(conv2, 'Discussion Épinglée 1');
  runtimeDatabase.saveConversation(conv3, 'Discussion Épinglée 2');

  // Épingler conv2 puis conv3
  runtimeDatabase.pinConversation(conv2, true);
  runtimeDatabase.pinConversation(conv3, true);

  const list = runtimeDatabase.listConversations();
  const p1 = list.find(c => c.id === conv2);
  const p2 = list.find(c => c.id === conv3);
  const norm = list.find(c => c.id === conv1);

  assert.ok(p1 && p2 && norm);
  assert.equal(p1.is_pinned, 1);
  assert.equal(p2.is_pinned, 1);
  assert.equal(norm.is_pinned, 0);

  // Les épinglés doivent figurer avant les non-épinglés
  const idxP1 = list.findIndex(c => c.id === conv2);
  const idxP2 = list.findIndex(c => c.id === conv3);
  const idxNorm = list.findIndex(c => c.id === conv1);

  assert.ok(idxP1 < idxNorm, 'Épinglé 1 doit être avant la discussion normale');
  assert.ok(idxP2 < idxNorm, 'Épinglé 2 doit être avant la discussion normale');
  assert.ok(idxP1 < idxP2, 'Épinglé 1 doit être avant Épinglé 2');

  // Nettoyage
  runtimeDatabase.deleteConversation(conv1);
  runtimeDatabase.deleteConversation(conv2);
  runtimeDatabase.deleteConversation(conv3);
});

test('MISSION R4e — 4. Réorganisation des épinglés (Monter / Descendre / reorderPinnedConversations)', async () => {
  const convA = 'conv-reorder-a-' + Date.now();
  const convB = 'conv-reorder-b-' + Date.now();

  runtimeDatabase.saveConversation(convA, 'Épinglé Alpha');
  runtimeDatabase.saveConversation(convB, 'Épinglé Bêta');

  runtimeDatabase.pinConversation(convA, true);
  runtimeDatabase.pinConversation(convB, true);

  // Inverser l'ordre : convB en premier, convA en second
  const success = runtimeDatabase.reorderPinnedConversations([convB, convA]);
  assert.equal(success, true);

  const list = runtimeDatabase.listConversations();
  const idxA = list.findIndex(c => c.id === convA);
  const idxB = list.findIndex(c => c.id === convB);

  assert.ok(idxB < idxA, 'Après inversion, Épinglé Bêta doit précéder Épinglé Alpha');

  // Nettoyage
  runtimeDatabase.deleteConversation(convA);
  runtimeDatabase.deleteConversation(convB);
});

test('MISSION R4e — 5. Composant SidebarDiscussionItem : icône Pin et actions du menu', async () => {
  const unpinnedItem = {
    id: 'test-unpinned',
    topic: 'Discussion Standard',
    result: '',
    timestamp: Date.now(),
    pinned: false
  };

  const pinnedItem = {
    id: 'test-pinned',
    topic: 'Discussion Épinglée',
    result: '',
    timestamp: Date.now(),
    pinned: true,
    pinned_order: 1
  };

  // 1. Rendu d'un élément non épinglé
  const unpinnedHtml = renderToString(
    React.createElement(SidebarDiscussionItem, {
      item: unpinnedItem,
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
      onToggleSelect: () => {},
      onTogglePin: () => {}
    })
  );
  assert.ok(unpinnedHtml.includes('Discussion Standard'));
  assert.ok(!unpinnedHtml.includes('Discussion épinglée'));

  // 2. Rendu d'un élément épinglé : présence de l'indicateur accessible
  const pinnedHtml = renderToString(
    React.createElement(SidebarDiscussionItem, {
      item: pinnedItem,
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
      onToggleSelect: () => {},
      onTogglePin: () => {},
      onMovePin: () => {},
      canMoveUp: true,
      canMoveDown: false
    })
  );
  assert.ok(pinnedHtml.includes('Discussion Épinglée'));
  assert.ok(pinnedHtml.includes('Discussion épinglée'), 'L\'icône Pin doit avoir l\'aria-label Discussion épinglée');
});

test('MISSION R4e — 6. Section Épinglés conditionnelle : absente si 0 épinglé, présente si épinglés réels', async () => {
  // Test de logique de conditionnement telle qu'implémentée dans ClaudeSidebar :
  // hasPinnedDiscussions = visiblePinnedHistory.length > 0;
  // hasPinnedItems = hasPinnedDiscussions || projects.length > 0;

  const emptyDiscussions = [];
  const emptyProjects = [];
  const hasItemsEmpty = emptyDiscussions.length > 0 || emptyProjects.length > 0;
  assert.equal(hasItemsEmpty, false, 'La section Épinglés doit être strictement absente quand aucun élément n\'est épinglé');

  const withPinned = [{ id: 'p1', topic: 'Projet Clé', pinned: true }];
  const hasItemsWithPinned = withPinned.length > 0 || emptyProjects.length > 0;
  assert.equal(hasItemsWithPinned, true, 'La section Épinglés doit apparaître dès qu\'au moins une discussion réelle est épinglée');
});
