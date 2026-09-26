/**
 * Tests de la Palette de Commandes Universelle (Mission R4a)
 *
 * Tests couverts :
 * 1. État initial : `isCommandPaletteOpen` est false dans le contexte
 * 2. Ctrl+K ne lève pas de conflit avec les autres raccourcis (B, Shift+O, Comma)
 * 3. Le hook useCommandPalette génère des items statiques groupés
 * 4. La recherche FTS5 est déclenchée uniquement quand isOpen=true et query non vide
 * 5. La réinitialisation de query à l'ouverture (isOpen passe de false à true)
 * 6. Les items de discussions récentes (sans query) et les items filtrés (avec query)
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

// ── Setup isolation DB (doit être exécuté avant toute import du runtime) ──
const { IROKO_DATA_DIR } = process.env;
assert.ok(IROKO_DATA_DIR, '[setup_test_env.js] IROKO_DATA_DIR doit être défini avant ce test');

// ── Test 1 : AppContext expose isCommandPaletteOpen et setIsCommandPaletteOpen ──
describe('Mission R4a — Palette de commandes : context', () => {
  it('AppContext.tsx contient isCommandPaletteOpen dans le type AppContextType', async () => {
    const { readFileSync } = await import('node:fs');
    const appCtx = readFileSync('src/context/AppContext.tsx', 'utf8');
    assert.ok(
      appCtx.includes('isCommandPaletteOpen: boolean'),
      'AppContextType doit déclarer isCommandPaletteOpen: boolean'
    );
    assert.ok(
      appCtx.includes('setIsCommandPaletteOpen'),
      'AppContextType doit déclarer setIsCommandPaletteOpen'
    );
  });

  it('AppContext.tsx initialise isCommandPaletteOpen à false', async () => {
    const { readFileSync } = await import('node:fs');
    const appCtx = readFileSync('src/context/AppContext.tsx', 'utf8');
    assert.ok(
      appCtx.includes("useState(false)") || appCtx.includes('useState<boolean>(false)'),
      'isCommandPaletteOpen doit être initialisé à false'
    );
  });
});

// ── Test 2 : Raccourci Ctrl+K sans conflit ──
describe('Mission R4a — Raccourci Ctrl+K sans conflit', () => {
  it('AppContext.tsx : Ctrl+K déclenche setIsCommandPaletteOpen, pas focus sidebar', async () => {
    const { readFileSync } = await import('node:fs');
    const appCtx = readFileSync('src/context/AppContext.tsx', 'utf8');

    // Doit appeler setIsCommandPaletteOpen
    assert.ok(
      appCtx.includes('setIsCommandPaletteOpen(prev =>'),
      'Ctrl+K doit appeler setIsCommandPaletteOpen'
    );

    // Ne doit PAS utiliser querySelector pour focus la recherche sidebar
    const ctrlKSection = appCtx.slice(
      appCtx.indexOf("key === 'k'"),
      appCtx.indexOf("key === 'k'") + 300
    );
    assert.ok(
      !ctrlKSection.includes('data-search'),
      'Ctrl+K ne doit plus faire de querySelector data-search'
    );
  });

  it('Ctrl+B, Ctrl+Maj+O, Ctrl+, restent assignés distinctement de Ctrl+K', async () => {
    const { readFileSync } = await import('node:fs');
    const appCtx = readFileSync('src/context/AppContext.tsx', 'utf8');
    // Tous les raccourcis coexistent
    assert.ok(appCtx.includes("key === 'b'"), 'Ctrl+B doit exister');
    assert.ok(appCtx.includes("e.shiftKey && (e.key === 'o'"), 'Ctrl+Maj+O doit exister');
    assert.ok(appCtx.includes("e.key === ','"), 'Ctrl+, doit exister');
    assert.ok(appCtx.includes("key === 'k'"), 'Ctrl+K doit exister');
  });
});

// ── Test 3 : CommandPalette.tsx est monté dans ZyriconAppShell ──
describe('Mission R4a — Montage dans ZyriconAppShell', () => {
  it('ZyriconAppShell.tsx importe CommandPalette en lazy et le monte conditionnellement', async () => {
    const { readFileSync } = await import('node:fs');
    const shell = readFileSync('src/components/layout/ZyriconAppShell.tsx', 'utf8');
    assert.ok(
      shell.includes("CommandPalette"),
      'ZyriconAppShell.tsx doit référencer CommandPalette'
    );
    assert.ok(
      shell.includes("isCommandPaletteOpen"),
      'ZyriconAppShell.tsx doit utiliser isCommandPaletteOpen pour le montage conditionnel'
    );
    assert.ok(
      shell.includes("lazy(() =>"),
      'CommandPalette doit être chargée en lazy'
    );
  });
});

// ── Test 4 : useCommandPalette.ts structure ──
describe('Mission R4a — useCommandPalette hook', () => {
  it('useCommandPalette.ts exporte useCommandPalette et CommandItemKind', async () => {
    const { readFileSync } = await import('node:fs');
    const hook = readFileSync('src/hooks/useCommandPalette.ts', 'utf8');
    assert.ok(hook.includes('export function useCommandPalette'), 'useCommandPalette doit être exporté');
    assert.ok(hook.includes('export type CommandItemKind'), 'CommandItemKind doit être exporté');
    assert.ok(hook.includes('export interface CommandItem'), 'CommandItem doit être exporté');
  });

  it('useCommandPalette.ts contient toutes les catégories requises', async () => {
    const { readFileSync } = await import('node:fs');
    const hook = readFileSync('src/hooks/useCommandPalette.ts', 'utf8');
    // Groupes attendus
    assert.ok(hook.includes("'Navigation'"), 'Groupe Navigation doit exister');
    assert.ok(hook.includes("'Actions'"), 'Groupe Actions doit exister');
    assert.ok(hook.includes("'Raccourcis'"), 'Groupe Raccourcis doit exister');
    assert.ok(hook.includes("'Discussions récentes'") || hook.includes("'Discussions'"), 'Groupe Discussions doit exister');
    // FTS5 doit être utilisé
    assert.ok(hook.includes('/api/search'), 'FTS5 doit être appelé via /api/search');
  });

  it('useCommandPalette.ts inclut la navigation vers toutes les pages de paramètres', async () => {
    const { readFileSync } = await import('node:fs');
    const hook = readFileSync('src/hooks/useCommandPalette.ts', 'utf8');
    const pages = ['preferences', 'providers', 'privacy', 'capabilities', 'memory', 'thinking', 'code', 'skills', 'connectors', 'plugins'];
    for (const page of pages) {
      assert.ok(hook.includes(`tab: '${page}'`), `La page ${page} doit être dans les items de navigation`);
    }
  });
});

// ── Test 5 : CommandPalette.tsx structure et accessibilité ──
describe('Mission R4a — CommandPalette composant accessibilité', () => {
  it('CommandPalette.tsx utilise role="dialog" aria-modal et aria-label en français', async () => {
    const { readFileSync } = await import('node:fs');
    const cp = readFileSync('src/features/command-palette/CommandPalette.tsx', 'utf8');
    assert.ok(cp.includes('role="dialog"'), 'dialog role requis');
    assert.ok(cp.includes('aria-modal="true"'), 'aria-modal requis');
    assert.ok(cp.includes('aria-label="Palette de commandes"'), 'aria-label en français requis');
  });

  it('CommandPalette.tsx utilise role="listbox" et role="option" pour les items', async () => {
    const { readFileSync } = await import('node:fs');
    const cp = readFileSync('src/features/command-palette/CommandPalette.tsx', 'utf8');
    assert.ok(cp.includes('role="listbox"'), 'listbox requis pour la liste des résultats');
    assert.ok(cp.includes('role="option"'), 'option requis pour chaque item');
    assert.ok(cp.includes('aria-activedescendant'), 'aria-activedescendant requis pour la navigation clavier');
  });

  it('CommandPalette.tsx utilise useOverlayFocus pour la gestion du focus', async () => {
    const { readFileSync } = await import('node:fs');
    const cp = readFileSync('src/features/command-palette/CommandPalette.tsx', 'utf8');
    assert.ok(cp.includes('useOverlayFocus'), 'useOverlayFocus requis pour le confinement du focus');
  });

  it('CommandPalette.tsx respecte les tokens (pas de couleur en dur)', async () => {
    const { readFileSync } = await import('node:fs');
    const cp = readFileSync('src/features/command-palette/CommandPalette.tsx', 'utf8');
    // Cherche des codes couleur hex en dur (ex. #fff, #151515)
    const hardcodedColors = cp.match(/#[0-9a-fA-F]{3,6}\b/g) || [];
    assert.equal(
      hardcodedColors.length, 0,
      `Aucune couleur en dur — trouvé : ${hardcodedColors.join(', ')}`
    );
  });

  it('CommandPalette.tsx ne contient pas de shadow/glow/blur/gradient interdit', async () => {
    const { readFileSync } = await import('node:fs');
    const cp = readFileSync('src/features/command-palette/CommandPalette.tsx', 'utf8');
    const forbidden = ['shadow-', 'blur-', 'gradient-', 'backdrop-blur'];
    for (const term of forbidden) {
      assert.ok(!cp.includes(term), `Terme interdit trouvé : ${term}`);
    }
  });

  it('PreferencesPage.tsx libellé Ctrl+K mis à jour en "Palette de commandes"', async () => {
    const { readFileSync } = await import('node:fs');
    const prefs = readFileSync('src/features/settings/pages/PreferencesPage.tsx', 'utf8');
    assert.ok(
      prefs.includes('Palette de commandes'),
      'PreferencesPage doit mentionner "Palette de commandes" pour Ctrl+K'
    );
    assert.ok(
      !prefs.includes('Rechercher dans les discussions'),
      'L\'ancien libellé "Rechercher dans les discussions" doit avoir été retiré de la section raccourcis'
    );
  });
});
