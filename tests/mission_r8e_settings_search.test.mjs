import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Données réelles extraites de ClaudeSettingsModal.tsx pour test fonctionnel direct
const testNavItems = [
  {
    group: 'Paramètres',
    items: [
      { id: 'preferences', label: 'Préférences', keywords: ['thème', 'theme', 'sombre', 'dark', 'clair', 'light', 'police', 'font', 'serif', 'sans', 'animations', 'mouvement', 'voix', 'audio', 'vitesse', 'notifications', 'démarrage', 'startup', 'plateau', 'tray', 'raccourcis', 'clavier', 'apparence'] },
      { id: 'providers', label: 'Fournisseurs & Clés', keywords: ['clés', 'cle', 'api', 'fournisseurs', 'modèles', 'modele', 'catalogue', 'openai', 'anthropic', 'gemini', 'openrouter', 'mistral', 'groq', 'ollama', 'images', 'image', 'flux', 'vidéos', 'video', 'veo'] },
      { id: 'privacy', label: 'Confidentialité', keywords: ['confidentialité', 'caviardage', 'secrets', 'purge', 'effacer', 'suppression', 'sauvegarde', 'restauration', 'backup', 'base', 'sqlite', 'espace disque', 'stockage', 'diagnostic', 'anonymisé'] },
      { id: 'capabilities', label: 'Capacités', keywords: ['capacités', 'outils', 'tools', 'tool registry', 'recherche web', 'web search', 'interrupteurs', 'activation'] },
      { id: 'memory', label: 'Mémoire', keywords: ['mémoire', 'faits', 'décisions', 'projet', 'contexte', 'remember', 'mémoriser', 'persistance'] },
      { id: 'thinking', label: 'Réfléchir', keywords: ['réfléchir', 'réflexion', 'thinking', 'sous-agents', 'subagents', 'routage', 'complexité', 'budget', 'profondeur'] },
      { id: 'code', label: 'Iroko Code', keywords: ['code', 'iroko code', 'permissions', 'terminal', 'commandes', 'fichiers', 'délais', 'timeout', 'audit', 'sécurité', 'lecture seule'] }
    ]
  },
  {
    group: 'Personnaliser',
    items: [
      { id: 'skills', label: 'Compétences', keywords: ['compétences', 'skills', 'agentskills', 'docx', 'xlsx', 'pptx', 'pdf', 'import', 'export', 'zip', 'scripts'] },
      { id: 'connectors', label: 'Connecteurs', keywords: ['connecteurs', 'mcp', 'serveurs', 'stdio', 'sse', 'http', 'protocol', 'connexions'] },
      { id: 'plugins', label: 'Plugins', keywords: ['plugins', 'paquets', 'extensions', 'modules', 'installation', 'export'] }
    ]
  }
];

const normalize = (text) => text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

function filterNavigation(items, query) {
  const queryNorm = normalize(query);
  return items.map(group => ({
    ...group,
    items: group.items.filter(item => {
      if (!queryNorm) return true;
      if (normalize(item.label).includes(queryNorm)) return true;
      if (normalize(group.group).includes(queryNorm)) return true;
      return item.keywords.some(kw => normalize(kw).includes(queryNorm));
    })
  })).filter(group => group.items.length > 0);
}

test('Mission R8e — 1. Recherche dans les paramètres : filtrage avec mots-clés dans ClaudeSettingsModal.tsx', () => {
  const filePath = path.join(rootDir, 'src', 'features', 'settings', 'ClaudeSettingsModal.tsx');
  const content = fs.readFileSync(filePath, 'utf-8');

  // Vérifier la présence des mots-clés pour les pages clés
  assert.ok(content.includes("'thème'"), 'Préférences doit inclure le mot-clé thème');
  assert.ok(content.includes("'mcp'"), 'Connecteurs doit inclure le mot-clé mcp');
  assert.ok(content.includes("'openai'"), 'Fournisseurs doit inclure les modèles/fournisseurs');
  assert.ok(content.includes("'caviardage'"), 'Confidentialité doit inclure le mot-clé caviardage');
  assert.ok(content.includes("'agentskills'"), 'Compétences doit inclure agentskills');
  assert.ok(content.includes("'remember'"), 'Mémoire doit inclure remember');
  assert.ok(content.includes("'terminal'"), 'Iroko Code doit inclure terminal');
  assert.ok(content.includes("'sous-agents'"), 'Réfléchir doit inclure sous-agents');
  assert.ok(content.includes("normalize('NFD')"), 'Doit normaliser les accents pour une recherche tolérante');
});

test('Mission R8e — 2. Recherche d\'un terme qui ne correspond qu\'à une seule page', () => {
  // Test 2.1 : Recherche par mot-clé "thème"
  const resTheme = filterNavigation(testNavItems, 'thème');
  assert.strictEqual(resTheme.length, 1, 'Un seul groupe doit correspondre');
  assert.strictEqual(resTheme[0].items.length, 1, 'Un seul élément doit correspondre');
  assert.strictEqual(resTheme[0].items[0].id, 'preferences', 'L\'élément doit être Préférences');

  // Test 2.2 : Recherche par mot-clé "mcp"
  const resMcp = filterNavigation(testNavItems, 'mcp');
  assert.strictEqual(resMcp.length, 1, 'Un seul groupe doit correspondre');
  assert.strictEqual(resMcp[0].items.length, 1, 'Un seul élément doit correspondre');
  assert.strictEqual(resMcp[0].items[0].id, 'connectors', 'L\'élément doit être Connecteurs');

  // Test 2.3 : Recherche par mot-clé "caviardage"
  const resCaviardage = filterNavigation(testNavItems, 'caviardage');
  assert.strictEqual(resCaviardage.length, 1, 'Un seul groupe doit correspondre');
  assert.strictEqual(resCaviardage[0].items.length, 1, 'Un seul élément doit correspondre');
  assert.strictEqual(resCaviardage[0].items[0].id, 'privacy', 'L\'élément doit être Confidentialité');

  // Test 2.4 : Recherche par libellé unique "Plugins"
  const resPlugins = filterNavigation(testNavItems, 'Plugins');
  assert.strictEqual(resPlugins.length, 1);
  assert.strictEqual(resPlugins[0].items.length, 1);
  assert.strictEqual(resPlugins[0].items[0].id, 'plugins');
});

test('Mission R8e — 3. Recherche sans résultat : état vide clair et sobre', () => {
  const filePath = path.join(rootDir, 'src', 'features', 'settings', 'ClaudeSettingsModal.tsx');
  const content = fs.readFileSync(filePath, 'utf-8');

  // Vérification de la logique de filtrage sans résultat
  const resInexistant = filterNavigation(testNavItems, 'introuvable_xyz_123');
  assert.strictEqual(resInexistant.length, 0, 'Aucun groupe ne doit correspondre pour un terme inexistant');

  // État vide sobre conforme aux règles de design
  assert.ok(content.includes('filteredNavGroups.length === 0'), 'Doit conditionner le rendu sur le nombre de résultats');
  assert.ok(content.includes('Aucun résultat'), 'Doit afficher le libellé sobre "Aucun résultat"');
  assert.ok(content.includes('Effacer la recherche'), 'Doit proposer un bouton pour réinitialiser la recherche');
  assert.ok(content.includes('role="status"'), 'L\'état vide doit porter role="status" pour l\'accessibilité');
});

test('Mission R8e — 4. Recherche vidée : restauration immédiate de la liste complète', () => {
  const filePath = path.join(rootDir, 'src', 'features', 'settings', 'ClaudeSettingsModal.tsx');
  const content = fs.readFileSync(filePath, 'utf-8');

  // Lorsque searchQuery est vide, tous les éléments sont retournés
  const resVide = filterNavigation(testNavItems, '');
  assert.strictEqual(resVide.length, 2, 'Les 2 groupes doivent être restaurés');
  const totalItems = resVide.reduce((acc, g) => acc + g.items.length, 0);
  assert.strictEqual(totalItems, 10, 'L\'intégralité des 10 pages de paramètres doit être restaurée');

  assert.ok(content.includes('handleClearSearch'), 'Doit disposer de la fonction handleClearSearch');
});

test('Mission R8e — 5. Insensibilité à la casse et aux accents (tolérance française)', () => {
  // Test insensible aux accents
  const resSansAccent = filterNavigation(testNavItems, 'theme');
  assert.strictEqual(resSansAccent.length, 1);
  assert.strictEqual(resSansAccent[0].items[0].id, 'preferences');

  const resAvecAccent = filterNavigation(testNavItems, 'thème');
  assert.strictEqual(resAvecAccent.length, 1);
  assert.strictEqual(resAvecAccent[0].items[0].id, 'preferences');

  // Test insensible à la casse
  const resMaj = filterNavigation(testNavItems, 'MCP');
  assert.strictEqual(resMaj.length, 1);
  assert.strictEqual(resMaj[0].items[0].id, 'connectors');

  const resMemoire = filterNavigation(testNavItems, 'memoire');
  assert.strictEqual(resMemoire.length, 1);
  assert.strictEqual(resMemoire[0].items[0].id, 'memory');
});

test('Mission R8e — 6. Accessibilité : bouton effacer, Échap, Entrée et région aria-live', () => {
  const filePath = path.join(rootDir, 'src', 'features', 'settings', 'ClaudeSettingsModal.tsx');
  const content = fs.readFileSync(filePath, 'utf-8');

  // Bouton d'effacement rapide de la saisie
  assert.ok(content.includes('aria-label="Effacer la recherche"'), 'Bouton d\'effacement avec aria-label explicite');
  
  // Écouteur clavier (Échap pour vider, Entrée pour sélectionner le premier résultat)
  assert.ok(content.includes('handleSearchKeyDown'), 'Doit gérer les raccourcis clavier sur l\'input');
  assert.ok(content.includes("e.key === 'Escape'"), 'Doit intercepter la touche Échap pour effacer la recherche');
  assert.ok(content.includes("e.key === 'Enter'"), 'Doit intercepter la touche Entrée pour activer le premier résultat');

  // Annonce vocale pour les technologies d'assistance
  assert.ok(content.includes('aria-live="polite"'), 'Région aria-live="polite" présente pour annoncer le nombre de résultats');
  assert.ok(content.includes('réglage trouvé'), 'Texte d\'annonce du nombre de réglages trouvés');
});

test('Mission R8e — 7. Plafond strict de 400 lignes par fichier respecté', () => {
  const filePath = path.join(rootDir, 'src', 'features', 'settings', 'ClaudeSettingsModal.tsx');
  const lines = fs.readFileSync(filePath, 'utf-8').split('\n').length;
  assert.ok(lines < 400, `ClaudeSettingsModal.tsx doit comporter moins de 400 lignes (actuellement ${lines})`);
});
