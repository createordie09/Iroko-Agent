import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const settingsPages = [
  'MemoryPage.tsx',
  'ThinkingPage.tsx',
  'CapabilitiesPage.tsx',
  'PrivacyPage.tsx',
  'SkillsPage.tsx',
  'ConnectorsPage.tsx',
  'CodePage.tsx',
  'StorageBreakdownSection.tsx'
];

test('Mission R8f — 1. Vérification de la limite stricte de 400 lignes sur toutes les pages de paramètres auditées', () => {
  for (const pageName of settingsPages) {
    const filePath = path.join(rootDir, 'src', 'features', 'settings', 'pages', pageName);
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').length;
    assert.ok(lines < 400, `${pageName} dépasse la limite de 400 lignes (${lines} lignes)`);
  }
});

test('Mission R8f — 2. Page Mémoire (MemoryPage.tsx) : tap-target-24 et état vide contextuel', () => {
  const content = fs.readFileSync(path.join(rootDir, 'src', 'features', 'settings', 'pages', 'MemoryPage.tsx'), 'utf-8');

  // Interrupteur principal avec tap-target-24
  assert.ok(content.includes('handleToggleMemory(!memoryEnabled)'), 'Interrupteur de mémoire doit être présent');
  assert.ok(content.includes('tap-target-24'), 'MemoryPage doit intégrer tap-target-24');

  // Boutons d'action des faits mémorisés
  assert.ok(content.includes('copy(m.fact, m.id)'), 'Bouton copier un fait mémorisé présent');
  assert.ok(content.includes('handleDeleteMemoryItem(m.id)'), 'Bouton supprimer un fait présent');

  // État vide contextuel filtré
  assert.ok(content.includes('filteredMemories'), 'Le filtrage par portée doit alimenter filteredMemories');
  assert.ok(content.includes('Aucun fait mémorisé pour ce filtre.'), 'Message sobre contextuel présent si la portée filtrée est vide');
});

test('Mission R8f — 3. Page Réfléchir (ThinkingPage.tsx) : tap-target-24 sur budget et sous-agents', () => {
  const content = fs.readFileSync(path.join(rootDir, 'src', 'features', 'settings', 'pages', 'ThinkingPage.tsx'), 'utf-8');

  // Routage des sous-agents
  assert.ok(content.includes('handleUpdateSubagentAutoRouting'), 'Routage automatique des sous-agents présent');
  assert.ok(content.includes('tap-target-24'), 'ThinkingPage doit intégrer tap-target-24');

  // Niveaux de réflexion
  assert.ok(content.includes("handleUpdateThinkingLevel('disabled')"), 'Niveau désactivé');
  assert.ok(content.includes("handleUpdateThinkingLevel('low')"), 'Niveau faible');
  assert.ok(content.includes("handleUpdateThinkingLevel('medium')"), 'Niveau moyen');
  assert.ok(content.includes("handleUpdateThinkingLevel('high')"), 'Niveau élevé');
});

test('Mission R8f — 4. Page Capacités (CapabilitiesPage.tsx) : tap-target-24 sur Tool Registry et recherche web', () => {
  const content = fs.readFileSync(path.join(rootDir, 'src', 'features', 'settings', 'pages', 'CapabilitiesPage.tsx'), 'utf-8');

  // Tool Registry switch
  assert.ok(content.includes('handleToggleTool(tool.name, tool.enabled)'), 'Bouton toggle outil présent');
  assert.ok(content.includes('tap-target-24'), 'CapabilitiesPage doit intégrer tap-target-24');

  // Recherche web options radio
  assert.ok(content.includes('web_search_permission'), 'Options de permission web présentes');
  assert.ok(content.includes('Aucun outil enregistré dans le Tool Registry.'), 'État vide sobre du Tool Registry');
});

test('Mission R8f — 5. Page Confidentialité & Stockage : tap-target-24 sur masquage, diagnostic et nettoyage', () => {
  const privacyContent = fs.readFileSync(path.join(rootDir, 'src', 'features', 'settings', 'pages', 'PrivacyPage.tsx'), 'utf-8');
  const storageContent = fs.readFileSync(path.join(rootDir, 'src', 'features', 'settings', 'pages', 'StorageBreakdownSection.tsx'), 'utf-8');

  // Secret masking switch
  assert.ok(privacyContent.includes('handleToggleMaskModel(!maskModelEnabled)'), 'Bouton toggle secret masking présent');
  assert.ok(privacyContent.includes('tap-target-24'), 'PrivacyPage doit intégrer tap-target-24');

  // Bouton copie diagnostic
  assert.ok(privacyContent.includes('copyField(item.value, item.id)'), 'Bouton copie de champ diagnostic');

  // Stockage nettoyage
  assert.ok(storageContent.includes('handleCleanStorageCategory'), 'Nettoyage catégorie stockage');
  assert.ok(storageContent.includes('tap-target-24'), 'StorageBreakdownSection doit intégrer tap-target-24');
});

test('Mission R8f — 6. Page Compétences (SkillsPage.tsx) : tap-target-24 sur bascule, édition et actions', () => {
  const content = fs.readFileSync(path.join(rootDir, 'src', 'features', 'settings', 'pages', 'SkillsPage.tsx'), 'utf-8');

  // Bascule compétence
  assert.ok(content.includes('handleToggleSkill(skill.name, skill.enabled)'), 'Bascule activation compétence');
  assert.ok(content.includes('setEditingSkill(skill)'), 'Édition compétence');
  assert.ok(content.includes('handleExportSkill(skill.name)'), 'Export compétence');
  assert.ok(content.includes('handleDeleteSkill(skill.name)'), 'Suppression compétence');
  assert.ok(content.includes('tap-target-24'), 'SkillsPage doit intégrer tap-target-24');
  assert.ok(content.includes('Aucune compétence configurée.'), 'État vide compétences');
});

test('Mission R8f — 7. Page Connecteurs MCP (ConnectorsPage.tsx) : tap-target-24 sur serveur et outils', () => {
  const content = fs.readFileSync(path.join(rootDir, 'src', 'features', 'settings', 'pages', 'ConnectorsPage.tsx'), 'utf-8');

  // Serveurs MCP
  assert.ok(content.includes('handleToggleMcpServer(server.name, server.enabled)'), 'Bascule serveur MCP');
  assert.ok(content.includes('handleDeleteMcpServer(server.name)'), 'Suppression serveur MCP');
  assert.ok(content.includes('handleToggleMcpTool(server.name, tool.name, tool.enabled)'), 'Bascule outil MCP');
  assert.ok(content.includes('tap-target-24'), 'ConnectorsPage doit intégrer tap-target-24');
  assert.ok(content.includes('Aucun connecteur configuré.'), 'État vide connecteurs');
});

test('Mission R8f — 8. Page Iroko Code (CodePage.tsx) : tap-target-24 sur permissions, timeouts et révocation', () => {
  const content = fs.readFileSync(path.join(rootDir, 'src', 'features', 'settings', 'pages', 'CodePage.tsx'), 'utf-8');

  // Modes d'autorisation
  assert.ok(content.includes("handleUpdatePermissionMode('ask')"), 'Permission ask');
  assert.ok(content.includes("handleUpdatePermissionMode('auto_edit')"), 'Permission auto_edit');
  assert.ok(content.includes("handleUpdatePermissionMode('read_only')"), 'Permission read_only');

  // Timeouts
  assert.ok(content.includes('handleUpdateTerminalTimeout(opt.ms)'), 'Timeout terminal');
  assert.ok(content.includes('handleUpdateFileTimeout(opt.ms)'), 'Timeout fichiers');

  // Révocation de règle mémorisée
  assert.ok(content.includes('handleRevokeRule(rule.id)'), 'Révocation règle');
  assert.ok(content.includes('tap-target-24'), 'CodePage doit intégrer tap-target-24');
  assert.ok(content.includes('Aucune règle mémorisée pour ce projet.'), 'État vide règles');
  assert.ok(content.includes('Aucun événement dans le journal d\'audit.'), 'État vide journal d\'audit');
});
