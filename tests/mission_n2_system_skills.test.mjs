// tests/mission_n2_system_skills.test.mjs
// Mission N2 : Compétences Système pour la génération de fichiers & Construction progressive

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const { skillManager } = await import('../server/skills/SkillManager.ts');
const { runtimeDatabase } = await import('../server/storage/RuntimeDatabase.ts');
const { CreateDocumentTool } = await import('../server/tools/artifacts/create_document.ts');
const { SystemPrompt } = await import('../server/runtime/SystemPrompt.ts');
const { workspaceManager } = await import('../server/workspace/WorkspaceManager.ts');

test('Mission N2 - 1. Les 4 compétences système (docx, xlsx, pptx, pdf) sont découvertes, valides et marquées Système', async () => {
  await skillManager.init(process.cwd());

  const expectedFormats = ['docx', 'xlsx', 'pptx', 'pdf'];
  const libraries = {
    docx: 'docx',
    xlsx: 'exceljs',
    pptx: 'pptxgenjs',
    pdf: 'pdf-lib'
  };

  for (const fmt of expectedFormats) {
    const skill = skillManager.getSkill(fmt);
    assert.ok(skill, `La compétence système "${fmt}" doit exister`);
    assert.equal(skill.name, fmt);
    assert.equal(skill.isSystem, true, `La compétence "${fmt}" doit être marquée isSystem: true`);
    assert.equal(skill.enabled, true, `La compétence "${fmt}" doit être activée par défaut`);
    assert.ok(skill.instructions.length > 100, `Les instructions de "${fmt}" doivent être complètes`);

    // Vérifier la mention de la bibliothèque réelle de M5
    const expectedLib = libraries[fmt];
    assert.ok(
      skill.instructions.includes(expectedLib),
      `Les instructions de "${fmt}" doivent mentionner la bibliothèque réelle "${expectedLib}"`
    );

    // Vérifier les pièges et le schéma JSON
    assert.ok(
      skill.instructions.includes('Schéma JSON') || skill.instructions.includes('spec'),
      `Les instructions de "${fmt}" doivent documenter le schéma JSON`
    );
  }
});

test('Mission N2 - 2. Immutabilité des compétences système (interdiction de suppression)', async () => {
  await skillManager.init(process.cwd());

  // 2.1 Tentative de suppression via skillManager
  assert.throws(
    () => {
      skillManager.deleteSkill('docx');
    },
    /Impossible de supprimer la compétence système "docx"/,
    'La suppression d\'une compétence système via skillManager doit échouer'
  );

  // 2.2 Tentative de suppression directe via runtimeDatabase
  assert.throws(
    () => {
      runtimeDatabase.deleteSkill('xlsx');
    },
    /Impossible de supprimer la compétence système "xlsx"/,
    'La suppression d\'une compétence système via runtimeDatabase doit échouer'
  );

  // Vérifier qu'elles sont toujours présentes
  assert.ok(skillManager.getSkill('docx'), 'La compétence docx ne doit pas être supprimée');
  assert.ok(skillManager.getSkill('xlsx'), 'La compétence xlsx ne doit pas être supprimée');
});

test('Mission N2 - 3. Demander un xlsx déclenche la lecture de la compétence xlsx (événements et instructions)', async () => {
  await skillManager.init(process.cwd());

  // 3.1 Détection automatique de la compétence pertinente pour le prompt
  const userPrompt = 'Peux-tu me créer un fichier xlsx de budget prévisionnel pour 2026\u00A0?';
  const relevantSkills = skillManager.getRelevantSkills(userPrompt);
  assert.ok(
    relevantSkills.some(s => s.name === 'xlsx'),
    'La compétence xlsx doit être détectée comme pertinente pour le prompt demandant un xlsx'
  );

  const instructions = skillManager.getRelevantSkillInstructions(userPrompt);
  assert.ok(instructions, 'Les instructions de la compétence xlsx doivent être chargées');
  assert.ok(instructions.includes('exceljs'), 'Les instructions injectées doivent mentionner exceljs');

  // 3.2 Exécution de create_document avec compétence xlsx active
  runtimeDatabase.saveConversation('test_conv_n2', 'Conv Test 3');
  const tool = new CreateDocumentTool();
  const events = [];
  const mockContext = {
    conversationId: 'test_conv_n2',
    workspacePath: process.cwd(),
    conversationMode: 'code',
    emitEvent: (ev) => events.push(ev)
  };

  const validXlsxSpec = {
    title: 'Budget 2026',
    sheets: [
      {
        name: 'Ventes',
        headers: ['Produit', 'Montant'],
        rows: [['Abonnement', 1500], ['Conseil', 2500]]
      }
    ]
  };

  const result = await tool.execute({
    format: 'xlsx',
    filename: 'budget_test.xlsx',
    spec: validXlsxSpec,
    title: 'Budget Test'
  }, mockContext);

  assert.equal(result.success, true);
  assert.equal(result.data.skillUsed, 'xlsx');
  assert.equal(result.data.skillEnabled, true);

  // Vérifier l'émission de l'événement skill_invoked
  const skillEvent = events.find(e => e.type === 'skill_invoked');
  assert.ok(skillEvent, 'L\'événement skill_invoked doit être émis lors de la génération xlsx');
  assert.equal(skillEvent.skillName, 'xlsx');
  assert.equal(skillEvent.format, 'xlsx');
});

test('Mission N2 - 4. Désactiver la compétence système xlsx n\'empêche pas la génération (repli minimal)', async () => {
  await skillManager.init(process.cwd());

  // Désactiver temporairement la compétence xlsx
  skillManager.setSkillEnabled('xlsx', false);
  const disabledSkill = skillManager.getSkill('xlsx');
  assert.equal(disabledSkill.enabled, false);

  runtimeDatabase.saveConversation('test_conv_n2_disabled', 'Conv Test 4');
  const tool = new CreateDocumentTool();
  const events = [];
  const mockContext = {
    conversationId: 'test_conv_n2_disabled',
    workspacePath: process.cwd(),
    conversationMode: 'code',
    emitEvent: (ev) => events.push(ev)
  };

  const validXlsxSpec = {
    title: 'Budget Repli',
    sheets: [
      {
        name: 'Synthese',
        headers: ['Indicateur', 'Valeur'],
        rows: [['Total', 4000]]
      }
    ]
  };

  const result = await tool.execute({
    format: 'xlsx',
    filename: 'budget_repli.xlsx',
    spec: validXlsxSpec,
    title: 'Budget Repli'
  }, mockContext);

  // La génération doit TOUJOURS réussir
  assert.equal(result.success, true, 'La génération doit réussir même avec la compétence système désactivée');
  assert.equal(result.data.skillEnabled, false);
  assert.ok(result.data.warning, 'Un avertissement de repli doit être présent dans les données de sortie');
  assert.match(
    result.data.warning,
    /La compétence système "xlsx" est désactivée\. Génération effectuée avec les instructions minimales intégrées\./
  );

  // Vérifier l'événement skill_fallback
  const fallbackEvent = events.find(e => e.type === 'skill_fallback');
  assert.ok(fallbackEvent, 'L\'événement skill_fallback doit être émis');
  assert.equal(fallbackEvent.skillName, 'xlsx');

  // Réactiver la compétence pour les tests suivants
  skillManager.setSkillEnabled('xlsx', true);
  assert.equal(skillManager.getSkill('xlsx').enabled, true);
});

test('Mission N2 - 5. Génération valide des 4 formats bureautiques via create_document', async () => {
  await skillManager.init(process.cwd());
  runtimeDatabase.saveConversation('test_conv_n2_all', 'Conv Test 5');
  const tool = new CreateDocumentTool();
  const mockContext = {
    conversationId: 'test_conv_n2_all',
    workspacePath: process.cwd(),
    conversationMode: 'code',
    emitEvent: () => {}
  };

  // 5.1 docx
  const docxRes = await tool.execute({
    format: 'docx',
    filename: 'test.docx',
    spec: {
      title: 'Document Word',
      sections: [{ heading: 'Sec 1', paragraphs: ['Paragraphe test'] }]
    }
  }, mockContext);
  assert.equal(docxRes.success, true);
  assert.equal(docxRes.data.skillUsed, 'docx');

  // 5.2 pptx
  const pptxRes = await tool.execute({
    format: 'pptx',
    filename: 'test.pptx',
    spec: {
      title: 'Présentation PPTX',
      slides: [{ title: 'Slide 1', subtitle: 'Sous-titre' }]
    }
  }, mockContext);
  assert.equal(pptxRes.success, true);
  assert.equal(pptxRes.data.skillUsed, 'pptx');

  // 5.3 pdf
  const pdfRes = await tool.execute({
    format: 'pdf',
    filename: 'test.pdf',
    spec: {
      title: 'Rapport PDF',
      pages: [{ title: 'Page 1', paragraphs: ['Paragraphe PDF'] }]
    }
  }, mockContext);
  assert.equal(pdfRes.success, true);
  assert.equal(pdfRes.data.skillUsed, 'pdf');
});

test('Mission N2 - 6. Directive de construction progressive dans SystemPrompt v1.2.0', async () => {
  assert.ok(SystemPrompt.VERSION >= '1.2.0', `La version du prompt système (${SystemPrompt.VERSION}) doit être >= 1.2.0`);

  const mockMeta = await workspaceManager.analyze(process.cwd());
  const prompt = SystemPrompt.build(mockMeta);

  // Vérifier la directive 10
  assert.match(prompt, /10\.\s*Construction progressive des artéfacts/);
  assert.match(prompt, /moins d'environ 100 lignes.*create_artifact/);
  assert.match(prompt, /artéfact long est construit en plusieurs étapes visibles/);
  assert.match(prompt, /update_artifact entre les étapes/);
});
