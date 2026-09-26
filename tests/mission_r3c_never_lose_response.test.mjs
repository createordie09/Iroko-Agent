import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { ActiveJobManager } from '../server/runtime/ActiveJobManager.ts';
import { RuntimeDatabase } from '../server/storage/RuntimeDatabase.ts';
import { ChatMessageItem } from '../src/features/chat/ChatMessageItem.tsx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

test('MISSION R3c — 1. Détachement côté runtime : le job accumule et persiste le flux sans dépendre d\'un socket', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'iroko-r3c-job-'));
  const runtimeDb = new RuntimeDatabase(tempDir);

  const manager = new ActiveJobManager(runtimeDb);
  const convId = 'conv-r3c-1';
  const taskId = 'task-r3c-1';
  const assistantMsgId = 'msg-asst-1';

  runtimeDb.saveConversation(convId, 'Discussion Test R3c');
  runtimeDb.addMessage({
    id: assistantMsgId,
    conversationId: convId,
    role: 'assistant',
    content: '',
    metadata: { taskId, status: 'generating', interrupted: true, canContinue: true }
  });

  const fakeRuntime = {
    sessionId: 'session-fake-1',
    cancelTask: () => {}
  };

  const receivedEvents = [];
  const initialSubscriber = (event) => {
    receivedEvents.push(event);
  };

  const job = manager.registerJob({
    taskId,
    conversationId: convId,
    prompt: 'Explique la mécanique quantique',
    mode: 'chat',
    assistantMessageId: assistantMsgId,
    runtime: fakeRuntime,
    initialSubscriber
  });

  assert.equal(manager.getActiveJob(convId)?.taskId, taskId);
  assert.equal(manager.getRunningCount(), 1);

  // Simulation d'émissions de tokens en continu
  manager.handleEvent(convId, { type: 'thinking', content: 'Réflexion...' });
  manager.handleEvent(convId, { type: 'message', role: 'assistant', content: 'La mécanique ' });
  manager.handleEvent(convId, { type: 'message', role: 'assistant', content: 'quantique étudie ' });

  // Forcer le flush en base pour simuler le délai/intervalle régulé
  manager.flushJobToDatabase(job, true);

  // Vérification de la persistance continue sur le disque dans SQLite
  const inDbMsg = runtimeDb.getMessage(assistantMsgId);
  assert.ok(inDbMsg, 'Le message doit être présent en base');
  assert.equal(inDbMsg.content, 'La mécanique quantique étudie ');
  assert.equal(inDbMsg.thinking_logs, JSON.stringify(['Réflexion...']));

  // Fermeture du socket initial (désabonnement) : le job continue de tourner !
  manager.unsubscribe(convId, initialSubscriber);
  assert.equal(job.subscribers.size, 0);

  // Le modèle continue d'émettre des tokens côté serveur
  manager.handleEvent(convId, { type: 'message', role: 'assistant', content: 'l\'infiniment petit.' });
  manager.flushJobToDatabase(job, true);

  const inDbMsg2 = runtimeDb.getMessage(assistantMsgId);
  assert.equal(inDbMsg2.content, 'La mécanique quantique étudie l\'infiniment petit.');

  try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
});

test('MISSION R3c — 2. Reconnexion sans duplication : le nouvel abonné reçoit task_resumed avec le contenu exact', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'iroko-r3c-reconnect-'));
  const runtimeDb = new RuntimeDatabase(tempDir);
  const manager = new ActiveJobManager(runtimeDb);
  const convId = 'conv-r3c-2';
  const taskId = 'task-r3c-2';
  const assistantMsgId = 'msg-asst-2';

  runtimeDb.saveConversation(convId, 'Discussion Reconnexion');
  runtimeDb.addMessage({
    id: assistantMsgId,
    conversationId: convId,
    role: 'assistant',
    content: '',
    metadata: { taskId, status: 'generating', interrupted: true, canContinue: true }
  });

  const fakeRuntime = { sessionId: 'session-fake-2', cancelTask: () => {} };

  const job = manager.registerJob({
    taskId,
    conversationId: convId,
    prompt: 'Rédige un poème',
    mode: 'chat',
    assistantMessageId: assistantMsgId,
    runtime: fakeRuntime
  });

  // Streaming de la première strophe en arrière-plan
  manager.handleEvent(convId, { type: 'message', role: 'assistant', content: 'Vers un ciel sans nuage,\n' });
  manager.handleEvent(convId, { type: 'message', role: 'assistant', content: 'S\'envole un doux mirage.' });

  // Un client se reconnecte et s'abonne à la tâche active
  const reconnectedEvents = [];
  const { unsubscribe } = manager.subscribe(convId, (ev) => {
    reconnectedEvents.push(ev);
  });

  // 2.1 Le client reçoit immédiatement l'événement de reprise `task_resumed` avec l'état courant exact
  assert.equal(reconnectedEvents.length, 1);
  assert.equal(reconnectedEvents[0].type, 'task_resumed');
  assert.equal(reconnectedEvents[0].payload.content, 'Vers un ciel sans nuage,\nS\'envole un doux mirage.');

  // 2.2 Suite de la génération : les nouveaux tokens arrivent sans ré-émettre le début
  manager.handleEvent(convId, { type: 'message', role: 'assistant', content: '\nEt le vent chante.' });
  manager.handleEvent(convId, { type: 'completed', summary: 'Vers un ciel sans nuage,\nS\'envole un doux mirage.\nEt le vent chante.' });

  assert.equal(reconnectedEvents.length, 3);
  assert.equal(reconnectedEvents[1].type, 'message');
  assert.equal(reconnectedEvents[1].content, '\nEt le vent chante.');
  assert.equal(reconnectedEvents[2].type, 'completed');

  // 2.3 Vérification en base de données : aucun doublon de strophe
  const finalMsg = runtimeDb.getMessage(assistantMsgId);
  assert.equal(finalMsg.content, 'Vers un ciel sans nuage,\nS\'envole un doux mirage.\nEt le vent chante.');
  const finalMeta = JSON.parse(finalMsg.metadata);
  assert.equal(finalMeta.status, 'completed');
  assert.equal(finalMeta.interrupted, false);

  unsubscribe();
  try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
});

test('MISSION R3c — 3. Arrêt violent du runtime : persistance du texte partiel et récupération au redémarrage', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'iroko-r3c-crash-'));
  const convId = 'conv-r3c-crash';
  const taskId = 'task-r3c-crash';
  const assistantMsgId = 'msg-asst-crash';

  // 3.1 Session initiale : le runtime enregistre la tâche et le texte partiel au fur et à mesure
  {
    const runtimeDb = new RuntimeDatabase(tempDir);
    runtimeDb.saveConversation(convId, 'Discussion Crash');
    runtimeDb.recordTask({
      id: taskId,
      sessionId: 'session-crash',
      conversationId: convId,
      prompt: 'Génère un rapport financier complet',
      status: 'running',
      mode: 'chat'
    });

    runtimeDb.addMessage({
      id: assistantMsgId,
      conversationId: convId,
      role: 'assistant',
      content: 'Chapitre 1 : Introduction et contexte macroéconomique...',
      metadata: { taskId, status: 'generating', interrupted: true, canContinue: true, prompt: 'Génère un rapport financier complet' }
    });

    // Crash brutal simulé : la base est fermée brusquement sans exécuter de routine de finalisation
    runtimeDb.close();
  }

  // 3.2 Redémarrage du serveur runtime sur la même base
  {
    const recoveredDb = new RuntimeDatabase(tempDir);
    const recoveryReport = recoveredDb.recoverInterruptedGenerations();

    // Vérification du rapport de récupération
    assert.equal(recoveryReport.recoveredTasksCount, 1, 'La tâche active doit être identifiée comme interrompue');
    assert.equal(recoveryReport.interruptedMessagesCount, 1, 'Le message assistant partiel doit être marqué');

    // Vérification de la tâche dans SQLite
    const taskStmt = recoveredDb['db'].prepare('SELECT status, error FROM agent_tasks WHERE id = ?').get(taskId);
    assert.equal(taskStmt.status, 'interrupted');
    assert.ok(taskStmt.error.includes('Interrompu'));

    // Vérification du message assistant dans SQLite : texte partiel 100% conservé !
    const msg = recoveredDb.getMessage(assistantMsgId);
    assert.ok(msg);
    assert.equal(msg.content, 'Chapitre 1 : Introduction et contexte macroéconomique...');
    const meta = JSON.parse(msg.metadata);
    assert.equal(meta.interrupted, true, 'Le message doit être marqué comme interrompu');
    assert.equal(meta.canContinue, true, 'Le message doit proposer de continuer');
    assert.equal(meta.prompt, 'Génère un rapport financier complet');

    // Vérification de l'interrogation via getConversation
    const convData = recoveredDb.getConversation(convId);
    assert.ok(convData);
    assert.equal(convData.messages.length, 1);
    assert.equal(convData.messages[0].content, 'Chapitre 1 : Introduction et contexte macroéconomique...');

    recoveredDb.close();
  }

  try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
});

test('MISSION R3c — 4. Rendu sobre de l\'indicateur Interrompu et bouton Continuer dans ChatMessageItem', async () => {
  let continueCalled = false;
  let continueMsg = null;

  const mockInterruptedMsg = {
    id: 'asst-interrupted-1',
    role: 'assistant',
    content: 'Début du code source implémenté avant coupure...',
    metadata: {
      interrupted: true,
      canContinue: true,
      prompt: 'Crée un script Node.js'
    }
  };

  const html = renderToString(
    React.createElement(ChatMessageItem, {
      msg: mockInterruptedMsg,
      index: 1,
      isOptimizedVisibility: false,
      conversationFont: 'sans',
      copiedIndex: null,
      chatStatus: 'idle',
      isCheckingImpact: false,
      onCopy: () => {},
      onStartEdit: () => {},
      onDeleteConfirm: () => {},
      onRegenerateFrom: () => {},
      onOpenAttachmentPreview: () => {},
      onOpenArtifact: () => {},
      onRegenerateImage: () => {},
      onReuseArtifactAsAttachment: () => {},
      onContinue: (m, i) => {
        continueCalled = true;
        continueMsg = m;
      },
      attachmentsMap: {}
    })
  );

  // 4.1 Présence du texte sobre "Interrompu"
  assert.ok(html.includes('Interrompu'), 'Le texte Interrompu doit être visible dans le rendu');

  // 4.2 Présence du bouton accessible "Continuer"
  assert.ok(html.includes('Continuer'), 'Le libellé Continuer doit être présent');
  assert.ok(html.includes('aria-label="Continuer la génération"'), 'Le bouton doit posséder un aria-label accessible');
  assert.ok(html.includes('tap-target-24'), 'Le bouton doit respecter la classe de cible tactile tap-target-24');

  // 4.3 Absence stricte d'interdits visuels (pas de glow, pas d'ombres, pas de dégradés)
  assert.equal(html.includes('box-shadow'), false);
  assert.equal(html.includes('linear-gradient'), false);
  assert.equal(html.includes('drop-shadow'), false);
});
