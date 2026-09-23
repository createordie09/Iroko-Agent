/**
 * Générateur de jeu de données isolé pour les audits UX Iroko (Mission U0).
 * Génère des conversations déterministes de 50, 200 et 1000 messages avec Markdown riche,
 * ainsi que des structures d'artéfacts et de pièces jointes.
 */

export function generateMarkdownSample(index) {
  const mod = index % 5;
  switch (mod) {
    case 0:
      return `### Analyse de l'itération ${index}\n\nVoici les données synthétiques mesurées :\n\n| Paramètre | Valeur | Statut |\n| :--- | :--- | :--- |\n| Latence LCP | 820 ms | Conforme |\n| Stabilité CLS | 0.000 | Parfait |\n| Contraste texte | 7.2:1 | Conforme AA |\n\n*Rapport automatique généré pour l'audit.*`;
    case 1:
      return `Voici l'extrait de code correspondant à la procédure ${index} :\n\n\`\`\`typescript\ninterface AuditResult {\n  id: string;\n  iteration: number;\n  score: number;\n  passed: boolean;\n}\n\nexport function evaluateSample(item: AuditResult): boolean {\n  return item.passed && item.score >= 90;\n}\n\`\`\`\n\nLe test vérifie la conformité de chaque sous-système.`;
    case 2:
      return `Recommandations ergonomiques pour l'étape ${index} :\n\n1. Conserver l'alignement naturel du texte sans justification forcée.\n2. Vérifier la visibilité de l'indicateur \`:focus-visible\` sur chaque élément interactif.\n3. Maintenir une surface de contact d'au moins 44×44px sur mobile.\n   - Boutons d'action rapides\n   - Sélecteurs de vue et filtres\n   - Puces de pièces jointes`;
    case 3:
      return `Remarque importante sur l'état ${index} :\n\n> [!NOTE]\n> L'interface Iroko interdit formellement les ombres, dégradés et flous artistiques afin de garantir une lisibilité optimale et une performance instantanée sur tout écran.`;
    case 4:
    default:
      return `Confirmation de traitement du bloc ${index}. Toutes les métriques sont sous contrôle strict.`;
  }
}

export function generateConversation(messageCount = 50, conversationId = 'audit-conv-1') {
  const messages = [];
  const startTime = Date.now() - (messageCount * 60000);

  for (let i = 0; i < messageCount; i++) {
    const isUser = (i % 2 === 0);
    const msgTime = new Date(startTime + (i * 60000)).toISOString();
    messages.push({
      id: `msg-${conversationId}-${i}`,
      conversation_id: conversationId,
      sender: isUser ? 'user' : 'assistant',
      role: isUser ? 'user' : 'assistant',
      text: isUser ? `Requête d'audit étape ${i + 1} : évaluation des performances et de la lisibilité.` : generateMarkdownSample(i + 1),
      content: isUser ? `Requête d'audit étape ${i + 1} : évaluation des performances et de la lisibilité.` : generateMarkdownSample(i + 1),
      created_at: msgTime,
      model: isUser ? undefined : 'iroko-audit-model'
    });
  }

  return {
    id: conversationId,
    title: `Discussion d'audit volumique (${messageCount} messages)`,
    topic: `Discussion d'audit volumique (${messageCount} messages)`,
    created_at: new Date(startTime).toISOString(),
    updated_at: new Date().toISOString(),
    messages
  };
}

export function generateArtifactsSample() {
  return [
    {
      id: 'art-001',
      title: 'rapport_audit_accessibilite.md',
      type: 'markdown',
      content: '# Rapport d\'audit accessibilité\n\nConformité WCAG 2.2 AA validée sur l\'ensemble des 15 états.',
      version: 1,
      created_at: new Date().toISOString()
    },
    {
      id: 'art-002',
      title: 'mesures_performances.csv',
      type: 'csv',
      content: 'Etape,LCP_ms,CLS,INP_ms\n1,780,0.000,12\n2,810,0.000,15\n3,795,0.000,14',
      version: 1,
      created_at: new Date().toISOString()
    },
    {
      id: 'art-003',
      title: 'schema_architecture.svg',
      type: 'image/svg+xml',
      content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="#30302f"/></svg>',
      version: 1,
      created_at: new Date().toISOString()
    }
  ];
}

export function generateAttachmentsSample() {
  return [
    {
      id: 'att-001',
      name: 'cahier_des_charges.pdf',
      size: 245000,
      mimeType: 'application/pdf',
      state: 'ready'
    },
    {
      id: 'att-002',
      name: 'donnees_test.json',
      size: 14200,
      mimeType: 'application/json',
      state: 'ready'
    }
  ];
}
