import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

test('Mission Lot 2 - 1. Primitive useOverlayFocus conforme WCAG', () => {
  const filePath = path.join(rootDir, 'src', 'hooks', 'useOverlayFocus.ts');
  assert.ok(fs.existsSync(filePath), 'src/hooks/useOverlayFocus.ts doit exister');

  const content = fs.readFileSync(filePath, 'utf-8');

  // Confinement et boucle Tab/Shift+Tab
  assert.ok(content.includes('overlayStack'), 'useOverlayFocus doit gérer une pile de calques');
  assert.ok(content.includes("e.key === 'Escape'"), 'useOverlayFocus doit intercepter la touche Échap');
  assert.ok(content.includes("e.key === 'Tab'"), 'useOverlayFocus doit gérer la touche Tab pour boucler');
  assert.ok(content.includes('e.shiftKey'), 'useOverlayFocus doit gérer Shift+Tab');
  assert.ok(content.includes("setAttribute('inert'"), 'useOverlayFocus doit poser l\'attribut inert sur les frères');
  assert.ok(content.includes("removeAttribute('inert')"), 'useOverlayFocus doit nettoyer l\'attribut inert');
  assert.ok(content.includes('triggerElement'), 'useOverlayFocus doit mémoriser et restituer le focus au déclencheur');
});

test('Mission Lot 2 - 2. Modale Paramètres accessible et confinée', () => {
  const filePath = path.join(rootDir, 'src', 'features', 'settings', 'ClaudeSettingsModal.tsx');
  const content = fs.readFileSync(filePath, 'utf-8');

  assert.ok(content.includes('useOverlayFocus'), 'ClaudeSettingsModal doit consommer useOverlayFocus');
  assert.ok(content.includes('role="dialog"'), 'ClaudeSettingsModal doit avoir role="dialog"');
  assert.ok(content.includes('aria-modal="true"'), 'ClaudeSettingsModal doit avoir aria-modal="true"');
  assert.ok(content.includes('aria-label='), 'ClaudeSettingsModal doit avoir un aria-label accessible');
  assert.ok(content.includes('data-overlay-backdrop="true"'), 'ClaudeSettingsModal doit marquer son voile data-overlay-backdrop');
});

test('Mission Lot 2 - 3. Tiroir mobile inerte et accessible', () => {
  const filePath = path.join(rootDir, 'src', 'components', 'layout', 'ZyriconAppShell.tsx');
  const content = fs.readFileSync(filePath, 'utf-8');

  assert.ok(content.includes('useOverlayFocus'), 'ZyriconAppShell doit consommer useOverlayFocus pour le tiroir');
  assert.ok(content.includes('data-overlay-backdrop="true"'), 'Le voile mobile doit avoir data-overlay-backdrop="true"');
  assert.ok(content.includes("role={isMobileSidebarOpen ? 'dialog' : undefined}"), 'Le tiroir doit avoir role="dialog" quand ouvert');
  assert.ok(content.includes("aria-modal={isMobileSidebarOpen ? 'true' : undefined}"), 'Le tiroir doit avoir aria-modal="true" quand ouvert');
});

test('Mission Lot 2 - 4. Sidebar repliée rendue inerte', () => {
  const filePath = path.join(rootDir, 'src', 'components', 'layout', 'ClaudeSidebar.tsx');
  const content = fs.readFileSync(filePath, 'utf-8');

  assert.ok(
    content.includes('inert={isSidebarCollapsed ? true : undefined}'),
    'ClaudeSidebar doit être inerte au clavier lorsqu\'elle est repliée'
  );
  assert.ok(
    content.includes('Ouvrir la barre latérale'),
    'ClaudeSidebar doit restituer le focus au bouton d\'ouverture si le focus était dans la sidebar'
  );
});

test('Mission Lot 2 - 5. Actions de messages non restreintes au hover seul', () => {
  const itemPath = path.join(rootDir, 'src', 'features', 'chat', 'ChatMessageItem.tsx');
  const chatPath = path.join(rootDir, 'src', 'features', 'chat', 'ClaudeChat.tsx');
  const content = fs.existsSync(itemPath) ? fs.readFileSync(itemPath, 'utf-8') : fs.readFileSync(chatPath, 'utf-8');

  assert.ok(
    content.includes('data-message-actions="true"'),
    'Les blocs d\'actions doivent être identifiés data-message-actions'
  );
  assert.ok(
    content.includes('focus-within:opacity-100'),
    'Les actions doivent être visibles lors du focus-within clavier'
  );
  assert.ok(
    content.includes('hover:none'),
    'Les actions doivent être visibles sur terminaux tactiles sans hover'
  );
});

test('Mission Lot 2 - 6. Titre de document dynamique', () => {
  const filePath = path.join(rootDir, 'src', 'context', 'AppContext.tsx');
  const content = fs.readFileSync(filePath, 'utf-8');

  assert.ok(
    content.includes('document.title = `${history[0].topic.trim()} — Iroko`') &&
    content.includes("document.title = 'Iroko'"),
    'AppContext doit mettre à jour document.title dynamiquement avec le sujet ou repli sur Iroko'
  );
});

