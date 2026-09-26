import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { runtimeDatabase } from '../server/storage/RuntimeDatabase.ts';
import { modelGateway } from '../server/models/ModelGateway.ts';
import { ModelComparisonService, modelComparisonService } from '../server/models/ModelComparisonService.ts';
import { ComparisonBar } from '../src/components/composer/ComparisonBar.tsx';
import { ComparisonMessageView } from '../src/components/chat/ComparisonMessageView.tsx';
import { ChatMessageItem } from '../src/features/chat/ChatMessageItem.tsx';

test('MISSION R4d — 1. Disponibilité : Désactivée si < 2 fournisseurs/modèles prêts avec raison accessible', () => {
  const service = new ModelComparisonService();
  const status = service.isComparisonAvailable();

  assert.ok(typeof status.available === 'boolean');
  if (!status.available) {
    assert.ok(status.reason, 'Une raison explicative accessible doit être fournie');
    assert.match(status.reason, /au moins deux fournisseurs/i);
    assert.ok(status.readyProvidersCount < 2);
  } else {
    assert.ok(status.readyProvidersCount >= 2);
  }
});

test('MISSION R4d — 2. Génération parallèle réelle : chevauchement vérifiable des horodatages T_start et T_end', async () => {
  const service = new ModelComparisonService();

  // On simule deux streams asynchrones avec latence mesurable pour valider l'exécution concurrente
  const origGenerateStream = modelGateway.generateStream.bind(modelGateway);
  try {
    modelGateway.generateStream = async function* (req, providerId) {
      // Latence intentionnelle de 60ms par modèle pour prouver le parallélisme réel
      await new Promise(r => setTimeout(r, 60));
      yield { type: 'text_delta', text: `Réponse de ${req.modelId}` };
    };

    const prompt = 'Quelle est la différence entre un thread et un processus ?';
    const result = await service.runComparison(prompt, 'providerA/model-1', 'providerB/model-2');

    assert.ok(result);
    assert.equal(result.prompt, prompt);
    assert.ok(result.modelA);
    assert.ok(result.modelB);

    // Vérification du chevauchement temporel réel (§ Mission R4d)
    const { startTime: startA, endTime: endA } = result.modelA;
    const { startTime: startB, endTime: endB } = result.modelB;

    assert.ok(startA > 0 && endA > startA, 'Model A doit avoir des horodatages valides');
    assert.ok(startB > 0 && endB > startB, 'Model B doit avoir des horodatages valides');

    // Pour être en parallèle réel, le modèle B doit avoir débuté avant la fin du modèle A,
    // et le modèle A avant la fin du modèle B
    const overlaps = (startB < endA) && (startA < endB);
    assert.ok(overlaps, `Les exécutions doivent se chevaucher dans le temps : A=[${startA}, ${endA}], B=[${startB}, ${endB}]`);

    assert.equal(result.modelA.content, 'Réponse de providerA/model-1');
    assert.equal(result.modelB.content, 'Réponse de providerB/model-2');
    assert.equal(result.selectedModel, null, 'Aucun modèle ne doit être sélectionné par défaut');
  } finally {
    modelGateway.generateStream = origGenerateStream;
  }
});

test('MISSION R4d — 3. "Garder cette réponse" bidirectionnel : réversibilité Model A -> Model B -> Model A avec persistance SQLite', async () => {
  const convId = 'conv-compare-test-' + Date.now();
  runtimeDatabase.saveConversation(convId, 'Test Comparaison Modèles');

  const msgId = 'msg-compare-' + Date.now();
  const initialComparison = {
    prompt: 'Expliquer le théorème de Bayes',
    modelA: {
      modelId: 'anthropic/claude-3-5-sonnet',
      modelName: 'Sonnet 3.5',
      content: 'Contenu produit par le Modèle A (Sonnet).',
      startTime: Date.now() - 500,
      endTime: Date.now() - 100,
      status: 'completed'
    },
    modelB: {
      modelId: 'openai/gpt-4o',
      modelName: 'GPT-4o',
      content: 'Contenu produit par le Modèle B (GPT-4o).',
      startTime: Date.now() - 480,
      endTime: Date.now() - 80,
      status: 'completed'
    },
    selectedModel: null,
    archivedModel: null
  };

  runtimeDatabase.addMessage({
    id: msgId,
    conversationId: convId,
    role: 'assistant',
    content: '',
    metadata: { comparison: initialComparison }
  });

  // 1. L'utilisateur choisit d'abord "Garder cette réponse" sur le Modèle A
  const selectResA = modelComparisonService.selectResponse(msgId, 'modelA');
  assert.equal(selectResA.success, true);

  const dbMsgA = runtimeDatabase.getMessage(msgId);
  assert.ok(dbMsgA);
  assert.equal(dbMsgA.content, initialComparison.modelA.content, 'Le message actif doit avoir le contenu du Modèle A');
  const metaA = typeof dbMsgA.metadata === 'string' ? JSON.parse(dbMsgA.metadata) : dbMsgA.metadata;
  assert.equal(metaA.comparison.selectedModel, 'modelA');
  assert.equal(metaA.comparison.archivedModel, 'modelB');
  assert.equal(metaA.comparison.modelB.content, initialComparison.modelB.content, 'La réponse B reste archivée et intacte');

  // 2. L'utilisateur change d'avis et choisit "Garder cette réponse" sur le Modèle B (réversibilité)
  const selectResB = modelComparisonService.selectResponse(msgId, 'modelB');
  assert.equal(selectResB.success, true);

  const dbMsgB = runtimeDatabase.getMessage(msgId);
  assert.ok(dbMsgB);
  assert.equal(dbMsgB.content, initialComparison.modelB.content, 'Le message actif doit désormais avoir le contenu du Modèle B');
  const metaB = typeof dbMsgB.metadata === 'string' ? JSON.parse(dbMsgB.metadata) : dbMsgB.metadata;
  assert.equal(metaB.comparison.selectedModel, 'modelB');
  assert.equal(metaB.comparison.archivedModel, 'modelA');
  assert.equal(metaB.comparison.modelA.content, initialComparison.modelA.content, 'La réponse A reste archivée et intacte');

  // 3. Retour au Modèle A pour prouver la parfaite bidirectionnalité
  const selectResA2 = modelComparisonService.selectResponse(msgId, 'modelA');
  assert.equal(selectResA2.success, true);

  const dbMsgA2 = runtimeDatabase.getMessage(msgId);
  assert.equal(dbMsgA2.content, initialComparison.modelA.content);

  // Nettoyage
  runtimeDatabase.deleteConversation(convId);
});

test('MISSION R4d — 4. Régénération isolée d\'une seule colonne : préserve l\'autre colonne inchangée', async () => {
  const convId = 'conv-regen-col-' + Date.now();
  runtimeDatabase.saveConversation(convId, 'Test Régénération Colonne');

  const msgId = 'msg-regen-' + Date.now();
  const initialComparison = {
    prompt: 'Quelle est la vitesse de la lumière ?',
    modelA: {
      modelId: 'providerA/model-a',
      modelName: 'Modèle Alpha',
      content: 'Alpha version initiale',
      startTime: 1000,
      endTime: 1200,
      status: 'completed'
    },
    modelB: {
      modelId: 'providerB/model-b',
      modelName: 'Modèle Bêta',
      content: 'Bêta version intouchée',
      startTime: 1050,
      endTime: 1250,
      status: 'completed'
    },
    selectedModel: null,
    archivedModel: null
  };

  runtimeDatabase.addMessage({
    id: msgId,
    conversationId: convId,
    role: 'assistant',
    content: '',
    metadata: { comparison: initialComparison }
  });

  const origGenerateStream = modelGateway.generateStream.bind(modelGateway);
  try {
    modelGateway.generateStream = async function* () {
      yield { type: 'text_delta', text: 'Alpha nouveau texte régénéré' };
    };

    const regenRes = await modelComparisonService.regenerateColumn(msgId, 'modelA');
    assert.equal(regenRes.success, true);
    assert.equal(regenRes.result.content, 'Alpha nouveau texte régénéré');

    // Vérification en base SQLite : Modèle B doit être strictement inchangé
    const dbMsg = runtimeDatabase.getMessage(msgId);
    const meta = typeof dbMsg.metadata === 'string' ? JSON.parse(dbMsg.metadata) : dbMsg.metadata;

    assert.equal(meta.comparison.modelA.content, 'Alpha nouveau texte régénéré');
    assert.equal(meta.comparison.modelB.content, 'Bêta version intouchée', 'La colonne B doit rester inchangée');
    assert.equal(meta.comparison.modelB.startTime, 1050);
  } finally {
    modelGateway.generateStream = origGenerateStream;
    runtimeDatabase.deleteConversation(convId);
  }
});

test('MISSION R4d — 5. Rendu React : ComparisonBar et ComparisonMessageView sont conformes WCAG et tokens', () => {
  // Test de rendu de ComparisonBar
  const barHtml = renderToString(
    React.createElement(ComparisonBar, {
      modelAName: 'Sonnet 3.5',
      modelBId: 'gpt-4o',
      availableModels: [
        { id: 'gpt-4o', name: 'GPT-4o' },
        { id: 'mistral-large', name: 'Mistral Large' }
      ],
      onSelectModelB: () => {},
      onClose: () => {}
    })
  );

  assert.ok(barHtml.includes('Sonnet 3.5'));
  assert.ok(barHtml.includes('GPT-4o'));
  assert.ok(barHtml.includes('Deux réponses seront générées en parallèle'), 'La mention implicite de coût doit être affichée');
  assert.ok(barHtml.includes('data-comparison-bar="true"'));
  assert.ok(barHtml.includes('tap-target-24'), 'Tous les contrôles doivent avoir tap-target-24');

  // Test de rendu de ComparisonMessageView
  const dummyComparisonMsg = {
    id: 'msg-view-test',
    conversationId: 'conv-test',
    role: 'assistant',
    content: 'Sonnet content',
    metadata: {
      comparison: {
        prompt: 'Calculer la somme 1 à 100',
        modelA: {
          modelId: 'anthropic/claude-3-5-sonnet',
          modelName: 'Sonnet 3.5',
          content: 'La somme vaut 5050 selon Gauss.',
          startTime: 1000,
          endTime: 1300,
          status: 'completed'
        },
        modelB: {
          modelId: 'openai/gpt-4o',
          modelName: 'GPT-4o',
          content: 'La formule n(n+1)/2 donne 5050.',
          startTime: 1020,
          endTime: 1290,
          status: 'completed'
        },
        selectedModel: 'modelA',
        archivedModel: 'modelB'
      }
    }
  };

  const viewHtml = renderToString(
    React.createElement(ComparisonMessageView, {
      msg: dummyComparisonMsg,
      conversationFont: 'sans'
    })
  );

  assert.ok(viewHtml.includes('data-model-comparison-view="true"'));
  assert.ok(viewHtml.includes('grid-cols-1 md:grid-cols-2'), 'Mise en page bicolonne responsive');
  assert.ok(viewHtml.includes('data-selected-column="true"'));
  assert.ok(viewHtml.includes('data-archived-column="true"'));
  assert.ok(viewHtml.includes('Choisir à la place'), 'Bouton de réversibilité sur la colonne archivée');
  assert.ok(viewHtml.includes('tap-target-24'));
});

test('MISSION R4d — 6. Intégration dans ChatMessageItem : rendu automatique si métadonnée comparison', () => {
  const dummyMsg = {
    id: 'msg-chat-item-test',
    conversationId: 'conv-test',
    role: 'assistant',
    content: '',
    metadata: {
      comparison: {
        prompt: 'Question test',
        modelA: { modelId: 'mA', modelName: 'Modèle A', content: 'Rép A', startTime: 0, endTime: 0, status: 'completed' },
        modelB: { modelId: 'mB', modelName: 'Modèle B', content: 'Rép B', startTime: 0, endTime: 0, status: 'completed' },
        selectedModel: null,
        archivedModel: null
      }
    }
  };

  const itemHtml = renderToString(
    React.createElement(ChatMessageItem, {
      msg: dummyMsg,
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
      attachmentsMap: {}
    })
  );

  assert.ok(itemHtml.includes('data-model-comparison-view="true"'), 'ChatMessageItem doit déléguer à ComparisonMessageView');
});
