import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { toolRegistry } from '../server/tools/ToolRegistry.ts';

test('M8.1 - Éradication du code mort et des types orphelins', async (t) => {
  await t.test('TasksWorkspace.tsx et ProvidersSettings.tsx sont supprimés', () => {
    assert.strictEqual(
      fs.existsSync(path.resolve('src/features/tasks/TasksWorkspace.tsx')),
      false,
      'TasksWorkspace.tsx ne doit plus exister'
    );
    assert.strictEqual(
      fs.existsSync(path.resolve('src/features/settings/ProvidersSettings.tsx')),
      false,
      'ProvidersSettings.tsx ne doit plus exister'
    );
  });

  await t.test('types/index.ts ne contient aucun des types orphelins', () => {
    const typesContent = fs.readFileSync(path.resolve('src/types/index.ts'), 'utf-8');
    assert.strictEqual(/\bPersona\b/.test(typesContent), false, 'Persona doit être retiré');
    assert.strictEqual(/\bKnowledgeItem\b/.test(typesContent), false, 'KnowledgeItem doit être retiré');
    assert.strictEqual(/\bProjectSource\b/.test(typesContent), false, 'ProjectSource doit être retiré');
    assert.strictEqual(/\bCalendarItem\b/.test(typesContent), false, 'CalendarItem doit être retiré');
  });

  await t.test('Aucune occurrence de pointer-events-none dans tout src/', () => {
    function scanDir(dir) {
      let matches = [];
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          matches = matches.concat(scanDir(full));
        } else if (/\.(tsx|ts|jsx|js)$/.test(entry.name)) {
          const content = fs.readFileSync(full, 'utf-8');
          if (content.includes('pointer-events-none')) {
            matches.push(full);
          }
        }
      }
      return matches;
    }
    const filesWithPointerEventsNone = scanDir(path.resolve('src'));
    assert.deepStrictEqual(
      filesWithPointerEventsNone,
      [],
      `pointer-events-none interdit dans l'UI : trouvé dans ${filesWithPointerEventsNone.join(', ')}`
    );
  });
});

test('M8.1 - Sidebar et Topbar : Dépliage et point d\'accès unique aux paramètres', async (t) => {
  await t.test('ClaudeSidebar contient la logique de dépliage et recoupement à 10', () => {
    const sidebarContent = fs.readFileSync(path.resolve('src/components/layout/ClaudeSidebar.tsx'), 'utf-8');
    assert.ok(sidebarContent.includes('showAll'), 'Doit posséder un état showAll');
    assert.ok(sidebarContent.includes('Afficher moins'), 'Doit afficher "Afficher moins" après dépliage');
    assert.ok(sidebarContent.includes('Tout afficher'), 'Doit afficher "Tout afficher" quand replié');
    assert.ok(sidebarContent.includes('HISTORY_PAGE_SIZE'), 'Doit utiliser une pagination (10 discussions)');
    // Vérifier que "Tout afficher" ne réinitialise plus le chat
    assert.strictEqual(
      sidebarContent.includes('onClick={handleNewChat}>\n                  Tout afficher'),
      false,
      'Tout afficher ne doit plus appeler handleNewChat'
    );
  });

  await t.test('Bouton Partager retiré de ClaudeTopbar', () => {
    const topbarContent = fs.readFileSync(path.resolve('src/components/layout/ClaudeTopbar.tsx'), 'utf-8');
    assert.strictEqual(
      topbarContent.includes('Partager'),
      false,
      'Le bouton Partager doit être totalement supprimé'
    );
  });

  await t.test('Engrenage Paramètres présent conditionnellement dans Topbar (repliée ou mobile)', () => {
    const topbarContent = fs.readFileSync(path.resolve('src/components/layout/ClaudeTopbar.tsx'), 'utf-8');
    assert.ok(
      topbarContent.includes('isSidebarCollapsed &&'),
      'Engrenage desktop visible seulement si la sidebar est repliée'
    );
    assert.ok(
      topbarContent.includes('className="md:hidden'),
      'Engrenage mobile toujours disponible dans la topbar'
    );
  });

  await t.test('Bouton Personnaliser ouvre les Paramètres sur l\'onglet Compétences', () => {
    const shellContent = fs.readFileSync(path.resolve('src/components/layout/ZyriconAppShell.tsx'), 'utf-8');
    assert.ok(
      shellContent.includes("setActiveSettingsTab('skills')"),
      'Personnaliser doit ouvrir l\'onglet skills (Compétences)'
    );
    assert.ok(
      shellContent.includes('setIsSettingsOpen(true)'),
      'Personnaliser doit ouvrir la modale des paramètres'
    );
    assert.strictEqual(
      shellContent.includes('Personnaliser : Ma Voix & Style'),
      false,
      'La fausse modale persona doit être supprimée'
    );
  });
});

test('M8.1 - Panneau droit : Onglets conditionnels sans compteur (0)', async (t) => {
  const chatContent = fs.readFileSync(path.resolve('src/features/chat/ClaudeChat.tsx'), 'utf-8');

  await t.test('availableTabs filtre les onglets selon le contenu réel', () => {
    assert.ok(chatContent.includes('availableTabs'), 'Doit calculer availableTabs dynamiquement');
    assert.ok(chatContent.includes('changedFiles.length > 0'), 'Modifications requiert des fichiers modifiés');
    assert.ok(chatContent.includes('planSteps.length > 0'), 'Plan requiert des étapes de plan');
  });

  await t.test('Aucun compteur (0) dans les onglets', () => {
    assert.strictEqual(
      chatContent.includes('Modifications ({changedFiles.length})'),
      false,
      'Ne doit plus afficher de compteur (0) inconditionnel pour Modifications'
    );
    assert.strictEqual(
      chatContent.includes('Plan ({planSteps.length})'),
      false,
      'Ne doit plus afficher de compteur (0) inconditionnel pour Plan'
    );
    assert.strictEqual(
      chatContent.includes('Artéfacts ({artifacts.length})'),
      false,
      'Ne doit plus afficher de compteur (0) inconditionnel pour Artéfacts'
    );
  });
});

test('M8.1 - ToolRegistry et synchronisation des catégories', async (t) => {
  await t.test('ToolRegistry contient les outils de base opérationnels', () => {
    const allTools = toolRegistry.getAllToolsStatus();
    assert.ok(allTools.length >= 15, 'Au moins 15 outils doivent être enregistrés');
    const categories = new Set(allTools.map(t => t.category));
    assert.ok(categories.has('filesystem'), 'Catégorie filesystem présente');
    assert.ok(categories.has('terminal'), 'Catégorie terminal présente');
    assert.ok(categories.has('git'), 'Catégorie git présente');
  });

  await t.test('ClaudeComposer utilise le menu Outils dynamique et le lien Capacités', () => {
    const composerContent = fs.readFileSync(path.resolve('src/components/composer/ClaudeComposer.tsx'), 'utf-8');
    assert.ok(composerContent.includes('/api/tools/categories'), 'Doit interroger /api/tools/categories');
    assert.ok(composerContent.includes('Gérer dans Capacités'), 'Doit inclure le lien "Gérer dans Capacités"');
    assert.ok(composerContent.includes("setActiveSettingsTab('capabilities')"), 'Lien doit router vers capabilities');
    // Vérifier l'absence des anciennes cases en dur
    assert.strictEqual(
      composerContent.includes("setEnabledTools(prev => prev.includes('filesystem')"),
      false,
      'Les cases à cocher en dur doivent être retirées'
    );
  });
});
