import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { runtimeDatabase, RuntimeDatabase } from '../server/storage/RuntimeDatabase.ts';
import { deletionManager, DeletionManager } from '../server/storage/DeletionManager.ts';
import { attachmentManager } from '../server/attachments/AttachmentManager.ts';
import { artifactManager } from '../server/artifacts/ArtifactManager.ts';
import { skillManager } from '../server/skills/SkillManager.ts';
import { UndoDeletionBanner } from '../src/components/common/UndoDeletionBanner.tsx';
import { UndoDeletionProvider } from '../src/context/UndoDeletionContext.tsx';

test('MISSION R4b — 1. Discussion : masquage logique, fichiers intacts sur disque, puis annulation réussie', async () => {
  const convId = 'conv-r4b-undo-test-' + Date.now();
  runtimeDatabase.saveConversation(convId, 'Discussion Projet Alpha');

  // Création d'un artéfact associé sur disque
  const art = artifactManager.createArtifact({
    conversationId: convId,
    filename: 'synthese.md',
    content: '# Rapport Alpha\nContenu critique.',
    mimeType: 'text/markdown'
  });
  const artFilePath = art.versions[0].filePath;
  assert.ok(fs.existsSync(artFilePath), 'Le fichier d\'artéfact doit être présent sur le disque');

  // Planification de la suppression différée (durée 3000ms)
  const pending = deletionManager.scheduleDeletion('conversation', convId, 3000);
  assert.equal(pending.id, convId);
  assert.equal(pending.itemType, 'conversation');

  // 1. Vérification : masqué des requêtes de liste et de lecture
  assert.ok(deletionManager.isPending('conversation', convId));
  const convInList = runtimeDatabase.listConversations().find(c => c.id === convId);
  assert.equal(convInList, undefined, 'La discussion doit être masquée de la liste');
  const convDetail = runtimeDatabase.getConversation(convId);
  assert.equal(convDetail, null, 'getConversation doit renvoyer null pendant la période d\'annulation');

  // 2. Vérification : le fichier associé reste STRICTEMENT intact sur le disque
  assert.ok(fs.existsSync(artFilePath), 'Le fichier d\'artéfact ne doit JAMAIS être supprimé avant expiration');

  // 3. Annulation avant expiration
  const cancelOk = deletionManager.cancelDeletion('conversation', convId);
  assert.ok(cancelOk, 'L\'annulation doit retourner true');
  assert.equal(deletionManager.isPending('conversation', convId), false);

  // 4. L'élément réapparaît intact avec ses données
  const restoredConv = runtimeDatabase.getConversation(convId);
  assert.ok(restoredConv, 'La discussion doit réapparaître après annulation');
  assert.equal(restoredConv.conversation.title, 'Discussion Projet Alpha');
  assert.ok(fs.existsSync(artFilePath), 'Le fichier associé reste présent et accessible');

  // Nettoyage
  artifactManager.deleteConversationArtifacts(convId);
  runtimeDatabase.deleteConversation(convId);
});

test('MISSION R4b — 2. Discussion : purge physique et suppression des fichiers à l\'expiration du délai', async () => {
  const convId = 'conv-r4b-purge-test-' + Date.now();
  runtimeDatabase.saveConversation(convId, 'Discussion Éphémère');

  const art = artifactManager.createArtifact({
    conversationId: convId,
    filename: 'donnees.csv',
    content: 'col1,col2\nval1,val2',
    mimeType: 'text/csv'
  });
  const artFilePath = art.versions[0].filePath;
  assert.ok(fs.existsSync(artFilePath));

  // Planification avec délai court pour le test (150ms)
  deletionManager.scheduleDeletion('conversation', convId, 150);

  // Immédiatement : fichier toujours sur le disque
  assert.ok(fs.existsSync(artFilePath), 'Le fichier doit exister immédiatement après planification');

  // Attente de l'expiration du délai
  await new Promise(r => setTimeout(r, 250));

  // Après expiration : purge physique exécutée
  assert.equal(deletionManager.isPending('conversation', convId), false);
  assert.equal(runtimeDatabase.getConversation(convId), null);
  assert.equal(fs.existsSync(artFilePath), false, 'Le fichier associé doit être supprimé du disque à la purge');
});

test('MISSION R4b — 3. Message : suppression différée, annulation et purge physique', async () => {
  const convId = 'conv-msg-test-' + Date.now();
  const msgId = 'msg-r4b-' + Date.now();
  runtimeDatabase.saveConversation(convId, 'Discussion Message');
  runtimeDatabase.addMessage({
    id: msgId,
    conversationId: convId,
    role: 'user',
    content: 'Message confidentiel à supprimer'
  });

  // 1. Planifier suppression différée
  deletionManager.scheduleDeletion('message', msgId, 2000);
  assert.ok(deletionManager.isPending('message', msgId));

  // Masqué des requêtes
  const inDbBefore = runtimeDatabase.getMessage(msgId);
  assert.equal(inDbBefore, null, 'Le message doit être masqué de getMessage');

  // 2. Annuler la suppression
  deletionManager.cancelDeletion('message', msgId);
  assert.equal(deletionManager.isPending('message', msgId), false);
  const inDbRestored = runtimeDatabase.getMessage(msgId);
  assert.ok(inDbRestored, 'Le message doit être restauré');
  assert.equal(inDbRestored.content, 'Message confidentiel à supprimer');

  // 3. Re-planifier avec purge à expiration
  deletionManager.scheduleDeletion('message', msgId, 100);
  await new Promise(r => setTimeout(r, 200));

  assert.equal(runtimeDatabase.getMessage(msgId), null);

  // Nettoyage
  runtimeDatabase.deleteConversation(convId);
});

test('MISSION R4b — 4. Mémoire : suppression différée, masquage et restauration sans perte', async () => {
  const memoryId = 'mem-r4b-' + Date.now();
  runtimeDatabase.saveMemory({
    id: memoryId,
    fact: 'L\'utilisateur préfère les thèmes sombres et sans-serif.',
    scope: 'global',
    category: 'preferences'
  });

  const memInitial = runtimeDatabase.getMemory(memoryId);
  assert.ok(memInitial);

  // Planification de la suppression
  deletionManager.scheduleDeletion('memory', memoryId, 1500);
  assert.ok(deletionManager.isPending('memory', memoryId));

  // Masqué de la liste des mémoires
  const list = runtimeDatabase.listMemories();
  assert.equal(list.some(m => m.id === memoryId), false, 'L\'élément ne doit plus apparaître dans listMemories');
  assert.equal(runtimeDatabase.getMemory(memoryId), null);

  // Annulation
  deletionManager.cancelDeletion('memory', memoryId);
  const memRestored = runtimeDatabase.getMemory(memoryId);
  assert.ok(memRestored, 'L\'élément doit réapparaître dans getMemory');
  assert.equal(memRestored.fact, 'L\'utilisateur préfère les thèmes sombres et sans-serif.');

  // Nettoyage physique final
  deletionManager.executePhysicalPurge('memory', memoryId);
  assert.equal(runtimeDatabase.getMemory(memoryId), null);
});

test('MISSION R4b — 5. Compétence importée : suppression différée, interdiction sur compétence système', async () => {
  await skillManager.init();
  // Test interdiction sur compétence système (docx, xlsx, pptx, pdf)
  const systemSkills = ['docx', 'xlsx', 'pptx', 'pdf'];
  for (const sName of systemSkills) {
    const skill = skillManager.getSkill(sName);
    assert.ok(skill?.isSystem, `${sName} doit être une compétence système`);
    assert.throws(
      () => deletionManager.scheduleDeletion('skill', sName),
      /Impossible de supprimer la compétence système/
    );
  }

  // Création d'une compétence importée de test
  const tempSkillDir = fs.mkdtempSync(path.join(os.tmpdir(), 'iroko-skill-r4b-'));
  const skillName = 'competence-test-r4b-' + Date.now();
  fs.writeFileSync(path.join(tempSkillDir, 'SKILL.md'), `---\nname: ${skillName}\ndescription: Test R4b\n---\n# Test instructions`);

  const importResult = await skillManager.importSkillFromDirectory(tempSkillDir);
  assert.ok(importResult);
  assert.equal(importResult.name, skillName);
  assert.equal(importResult.isSystem, false);

  // Planification suppression différée
  deletionManager.scheduleDeletion('skill', skillName, 2000);
  assert.ok(deletionManager.isPending('skill', skillName));

  // Masqué du catalogue
  const skillsList = skillManager.listSkills();
  assert.equal(skillsList.some(s => s.name === skillName), false, 'La compétence doit être masquée');

  // Annulation
  deletionManager.cancelDeletion('skill', skillName);
  const skillsAfterRestore = skillManager.listSkills();
  assert.ok(skillsAfterRestore.some(s => s.name === skillName), 'La compétence doit être restaurée');

  // Purge physique
  deletionManager.executePhysicalPurge('skill', skillName);
  const skillsFinal = skillManager.listSkills();
  assert.equal(skillsFinal.some(s => s.name === skillName), false);

  // Nettoyage dossier temporaire
  try { fs.rmSync(tempSkillDir, { recursive: true, force: true }); } catch {}
});

test('MISSION R4b — 6. Purge au redémarrage : suppression immédiate des éléments dont le délai est expiré', async () => {
  const convId = 'conv-startup-expired-' + Date.now();
  runtimeDatabase.saveConversation(convId, 'Discussion Oubliée');

  const art = artifactManager.createArtifact({
    conversationId: convId,
    filename: 'temporaire.txt',
    content: 'Contenu à purger au boot',
    mimeType: 'text/plain'
  });
  const artFilePath = art.versions[0].filePath;
  assert.ok(fs.existsSync(artFilePath));

  // Insertion directe d'une suppression en attente avec deadline passée (il y a 10 secondes)
  const expiredPurgeAt = new Date(Date.now() - 10000).toISOString();
  runtimeDatabase.getDb().prepare(`
    INSERT OR REPLACE INTO pending_deletions (id, item_type, deleted_at, purge_at, metadata)
    VALUES (?, ?, ?, ?, ?)
  `).run(convId, 'conversation', new Date(Date.now() - 15000).toISOString(), expiredPurgeAt, null);

  assert.ok(deletionManager.isPending('conversation', convId));

  // Simulation du redémarrage de l'application (purgeExpiredOnStartup)
  const report = deletionManager.purgeExpiredOnStartup();
  assert.ok(report.count >= 1, 'Au moins un élément doit avoir été purgé au démarrage');
  assert.ok(report.items.some(i => i.id === convId), 'La conversation expirée doit figurer dans les purges');

  // Vérification : discussion retirée de la base et fichier purgé du disque
  assert.equal(deletionManager.isPending('conversation', convId), false);
  assert.equal(runtimeDatabase.getConversation(convId), null);
  assert.equal(fs.existsSync(artFilePath), false, 'Le fichier doit être purgé du disque au redémarrage');
});

test('MISSION R4b — 7. Rendu visuel accessible du bandeau UndoDeletionBanner', () => {
  // Test de rendu HTML avec les tokens stricts du design system
  const html = renderToString(
    React.createElement(
      UndoDeletionProvider,
      null,
      React.createElement(UndoDeletionBanner)
    )
  );

  // Au repos sans suppression active : aucun DOM encombrant
  assert.equal(html, '');
});
