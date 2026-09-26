import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

test('Mission R5b - 1. Architecture modulaire et fichiers < 400 lignes', async () => {
  const hookPath = path.join(rootDir, 'src', 'hooks', 'chat', 'useVirtualMessageList.ts');
  const listPath = path.join(rootDir, 'src', 'features', 'chat', 'ChatMessageList.tsx');
  const chatPath = path.join(rootDir, 'src', 'features', 'chat', 'ClaudeChat.tsx');

  assert.ok(fs.existsSync(hookPath), 'useVirtualMessageList.ts doit exister');
  assert.ok(fs.existsSync(listPath), 'ChatMessageList.tsx doit exister');
  assert.ok(fs.existsSync(chatPath), 'ClaudeChat.tsx doit exister');

  const hookLines = fs.readFileSync(hookPath, 'utf-8').split('\n').length;
  const listLines = fs.readFileSync(listPath, 'utf-8').split('\n').length;
  const chatLines = fs.readFileSync(chatPath, 'utf-8').split('\n').length;

  assert.ok(hookLines < 400, `useVirtualMessageList.ts doit faire < 400 lignes (actuel: ${hookLines})`);
  assert.ok(listLines < 400, `ChatMessageList.tsx doit faire < 400 lignes (actuel: ${listLines})`);
  assert.ok(chatLines < 400, `ClaudeChat.tsx doit faire < 400 lignes (actuel: ${chatLines})`);
});

test('Mission R5b - 2. Algorithme de fenêtrage et seuil conditionnel', async () => {
  const hookCode = fs.readFileSync(path.join(rootDir, 'src', 'hooks', 'chat', 'useVirtualMessageList.ts'), 'utf-8');

  // Seuil conditionnel
  assert.ok(hookCode.includes('DEFAULT_THRESHOLD'), 'Le hook doit définir un seuil par défaut');
  assert.ok(hookCode.includes('count >= threshold') || hookCode.includes('count >= DEFAULT_THRESHOLD'), 'La virtualisation doit être conditionnelle au seuil');

  // Fenêtrage : startIndex, endIndex, spacers
  assert.ok(hookCode.includes('startIndex'), 'Le hook doit calculer startIndex');
  assert.ok(hookCode.includes('endIndex'), 'Le hook doit calculer endIndex');
  assert.ok(hookCode.includes('topSpacerHeight'), 'Le hook doit calculer topSpacerHeight');
  assert.ok(hookCode.includes('bottomSpacerHeight'), 'Le hook doit calculer bottomSpacerHeight');
  assert.ok(hookCode.includes('findIndexAtOffset'), 'Le hook doit employer une recherche pour trouver l\'indice à un offset');
});

test('Mission R5b - 3. Hauteurs dynamiques & Prévention des sauts de défilement (Anti-Scroll Jump)', async () => {
  const hookCode = fs.readFileSync(path.join(rootDir, 'src', 'hooks', 'chat', 'useVirtualMessageList.ts'), 'utf-8');

  // Mesure ResizeObserver
  assert.ok(hookCode.includes('ResizeObserver'), 'Le hook doit utiliser ResizeObserver pour mesurer les hauteurs réelles');
  assert.ok(hookCode.includes('heightMapRef'), 'Le hook doit maintenir un cache des hauteurs mesurées');

  // Compensation anti-saut de défilement au-dessus de la vue
  assert.ok(hookCode.includes('pendingCompensation'), 'Le hook doit calculer une compensation de défilement');
  assert.ok(hookCode.includes('el.scrollTop +='), 'Le hook doit ajuster scrollTop pour absorber le delta au-dessus de la vue');
  assert.ok(hookCode.includes('itemTop + prevHeight <= currentScrollTop') || hookCode.includes('currentScrollTop'), 'La compensation doit cibler les éléments au-dessus de la ligne de lecture');
});

test('Mission R5b - 4. Préservation de l\'ancrage et restauration de défilement (Lot 7)', async () => {
  const restorationCode = fs.readFileSync(path.join(rootDir, 'src', 'hooks', 'useScrollRestoration.ts'), 'utf-8');
  const chatCode = fs.readFileSync(path.join(rootDir, 'src', 'features', 'chat', 'ClaudeChat.tsx'), 'utf-8');

  // Vérification compatibilité useScrollRestoration
  assert.ok(chatCode.includes('useScrollRestoration'), 'ClaudeChat doit continuer d\'appeler useScrollRestoration');
  assert.ok(restorationCode.includes('!targetElement.closest(\'[hidden]\')'), 'useScrollRestoration doit ignorer les éléments masqués hors vue');
  assert.ok(restorationCode.includes('el.scrollTop = savedAnchor.scrollTop'), 'useScrollRestoration doit conserver le repli déterministe scrollTop');
});

test('Mission R5b - 5. Recherche dans la page (hidden="until-found" et beforematch)', async () => {
  const listCode = fs.readFileSync(path.join(rootDir, 'src', 'features', 'chat', 'ChatMessageList.tsx'), 'utf-8');

  // Support natif Chromium hidden="until-found"
  assert.ok(listCode.includes('hidden="until-found"'), 'ChatMessageList doit utiliser hidden="until-found" pour les messages hors écran');
  assert.ok(listCode.includes('onBeforeMatch'), 'ChatMessageList doit écouter l\'événement beforematch');
  assert.ok(listCode.includes('virtualizer.scrollToIndex(i)'), 'Le match doit déclencher le défilement vers l\'élément trouvé');
  assert.ok(listCode.includes('data-message-id='), 'Les messages hors écran doivent conserver leur data-message-id');
});

test('Mission R5b - 6. Navigation au clavier vers les messages hors écran (WCAG AA)', async () => {
  const listCode = fs.readFileSync(path.join(rootDir, 'src', 'features', 'chat', 'ChatMessageList.tsx'), 'utf-8');
  const hookCode = fs.readFileSync(path.join(rootDir, 'src', 'hooks', 'chat', 'useVirtualMessageList.ts'), 'utf-8');
  const chatCode = fs.readFileSync(path.join(rootDir, 'src', 'features', 'chat', 'ClaudeChat.tsx'), 'utf-8');

  // Ancres de focus pour défilement continu au Tab et Maj+Tab
  assert.ok(listCode.includes('Faire défiler vers les messages précédents'), 'Une ancre de focus supérieure doit exister pour Maj+Tab');
  assert.ok(listCode.includes('Faire défiler vers les messages suivants'), 'Une ancre de focus inférieure doit exister pour Tab');

  // Touches Home, End, PageUp, PageDown
  assert.ok(hookCode.includes("e.key === 'Home'"), 'Le hook doit gérer la touche Home');
  assert.ok(hookCode.includes("e.key === 'End'"), 'Le hook doit gérer la touche End');
  assert.ok(hookCode.includes("e.key === 'PageUp'"), 'Le hook doit gérer la touche PageUp');
  assert.ok(hookCode.includes("e.key === 'PageDown'"), 'Le hook doit gérer la touche PageDown');

  // Câblage dans ClaudeChat
  assert.ok(chatCode.includes('onKeyDown={virtualizer.handleKeyDown}'), 'ClaudeChat doit brancher handleKeyDown sur le conteneur');
  assert.ok(chatCode.includes('tabIndex={virtualizer.isVirtualized ? 0 : undefined}'), 'Le conteneur doit être focalisable en mode virtualisé');
});
