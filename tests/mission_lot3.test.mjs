import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

test('Mission Lot 3 - 1. Repères sémantiques et lien d\'évitement (WCAG 2.4.1, 1.3.1)', () => {
  // AppShell doit contenir le lien d'évitement et le repère <main id="main-content">
  const appShellPath = path.join(rootDir, 'src', 'components', 'layout', 'ZyriconAppShell.tsx');
  const appShellContent = fs.readFileSync(appShellPath, 'utf-8');

  assert.ok(appShellContent.includes('href="#main-content"'), 'ZyriconAppShell doit comporter un lien d\'évitement vers #main-content');
  assert.ok(appShellContent.includes('Aller au contenu'), 'Le lien d\'évitement doit être libellé "Aller au contenu" en français');
  assert.ok(appShellContent.includes('sr-only focus:not-sr-only'), 'Le lien d\'évitement doit être sr-only au repos et visible au focus');
  assert.ok(appShellContent.includes('<main id="main-content"'), 'ZyriconAppShell doit définir un repère sémantique <main id="main-content">');

  // Topbar doit être balisée en <header>
  const topbarPath = path.join(rootDir, 'src', 'components', 'layout', 'ClaudeTopbar.tsx');
  const topbarContent = fs.readFileSync(topbarPath, 'utf-8');
  assert.ok(topbarContent.includes('<header'), 'ClaudeTopbar doit être un repère sémantique <header>');
  assert.ok(topbarContent.includes('</header>'), 'ClaudeTopbar doit fermer sa balise </header>');

  // Sidebar doit contenir le repère <nav aria-label="Navigation">
  const sidebarPath = path.join(rootDir, 'src', 'components', 'layout', 'ClaudeSidebar.tsx');
  const sidebarContent = fs.readFileSync(sidebarPath, 'utf-8');
  assert.ok(sidebarContent.includes('<nav aria-label="Navigation"'), 'ClaudeSidebar doit comporter un repère sémantique <nav aria-label="Navigation">');
  assert.ok(sidebarContent.includes('</nav>'), 'ClaudeSidebar doit fermer sa balise </nav>');
});

test('Mission Lot 3 - 2. Régions live pour annonces d\'états et alertes (WCAG 4.1.3, Règle U6)', () => {
  const appShellPath = path.join(rootDir, 'src', 'components', 'layout', 'ZyriconAppShell.tsx');
  const appShellContent = fs.readFileSync(appShellPath, 'utf-8');

  // Doit consommer le hook useLiveAnnouncements
  assert.ok(appShellContent.includes('useLiveAnnouncements'), 'ZyriconAppShell doit consommer useLiveAnnouncements');

  // Région de statut polie
  assert.ok(
    appShellContent.includes('role="status"') && appShellContent.includes('aria-live="polite"'),
    'ZyriconAppShell doit déclarer une région role="status" avec aria-live="polite"'
  );
  assert.ok(appShellContent.includes('aria-atomic="true"'), 'La région role="status" doit avoir aria-atomic="true"');

  // Région d'alerte assertive
  assert.ok(
    appShellContent.includes('role="alert"') && appShellContent.includes('aria-live="assertive"'),
    'ZyriconAppShell doit déclarer une région role="alert" avec aria-live="assertive"'
  );

  // Vérification de useLiveAnnouncements.ts
  const hookPath = path.join(rootDir, 'src', 'hooks', 'useLiveAnnouncements.ts');
  assert.ok(fs.existsSync(hookPath), 'src/hooks/useLiveAnnouncements.ts doit exister');
  const hookContent = fs.readFileSync(hookPath, 'utf-8');

  // Initialement vides
  assert.ok(
    hookContent.includes("useState<string>('')") || hookContent.includes("useState('')"),
    'Les annonces doivent être initialement vides'
  );
  // Transitions de statut sans mise à jour par token
  assert.ok(hookContent.includes('Réflexion en cours…'), 'Doit annoncer "Réflexion en cours…" à la transition thinking');
  assert.ok(hookContent.includes('Génération en cours…'), 'Doit annoncer "Génération en cours…" au premier token/message');
  assert.ok(hookContent.includes('Réponse terminée.'), 'Doit annoncer "Réponse terminée." à l\'événement completed');
  assert.ok(hookContent.includes('Génération arrêtée.'), 'Doit annoncer "Génération arrêtée." lors de l\'annulation');
  assert.ok(hookContent.includes('iroko:task-cancelled'), 'Doit écouter l\'événement custom iroko:task-cancelled');
  assert.ok(hookContent.includes('Autorisation requise :'), 'Doit annoncer les demandes de permission en alerte assertive');
});

test('Mission Lot 3 - 3. Rôles ARIA, group et pressed sur le sélecteur Chat | Code (WCAG 4.1.2)', () => {
  const composerPath = path.join(rootDir, 'src', 'components', 'composer', 'ClaudeComposer.tsx');
  const composerContent = fs.readFileSync(composerPath, 'utf-8');

  // Contrôle segmenté Chat | Code
  assert.ok(
    composerContent.includes('role="group"') && composerContent.includes('aria-label="Mode"'),
    'Le sélecteur de mode doit avoir role="group" et aria-label="Mode"'
  );
  assert.ok(
    composerContent.includes("aria-pressed={composerMode === 'chat'}"),
    'Le bouton Chat doit refléter aria-pressed={composerMode === "chat"}'
  );
  assert.ok(
    composerContent.includes("aria-pressed={composerMode === 'code'}"),
    'Le bouton Code doit refléter aria-pressed={composerMode === "code"}'
  );
});

test('Mission Lot 3 - 4. Noms accessibles et descriptions sur les boutons du Composer (WCAG 4.1.2)', () => {
  const composerPath = path.join(rootDir, 'src', 'components', 'composer', 'ClaudeComposer.tsx');
  const composerContent = fs.readFileSync(composerPath, 'utf-8');

  // Textarea
  assert.ok(composerContent.includes('aria-label="Message"'), 'Le textarea doit avoir aria-label="Message"');

  // Bouton +
  assert.ok(
    composerContent.includes('aria-label="Options d\'ajout et gestion des outils"'),
    'Le bouton + doit avoir aria-label="Options d\'ajout et gestion des outils"'
  );
  assert.ok(composerContent.includes('aria-expanded={isToolsOpen}'), 'Le bouton + doit avoir aria-expanded');

  // Bouton Arrêter
  assert.ok(composerContent.includes('aria-label="Arrêter la génération"'), 'Le bouton d\'arrêt doit avoir aria-label="Arrêter la génération"');
  assert.ok(composerContent.includes('iroko:task-cancelled'), 'Le bouton d\'arrêt doit émettre iroko:task-cancelled');

  // Bouton Envoyer
  assert.ok(composerContent.includes('aria-label="Envoyer le message"'), 'Le bouton d\'envoi doit avoir aria-label="Envoyer le message"');
  assert.ok(composerContent.includes('aria-description='), 'Le bouton d\'envoi doit fournir une aria-description en cas d\'indisponibilité');

  // Bouton Saisie vocale
  assert.ok(composerContent.includes('aria-label={isListening ? "Arrêter la saisie vocale" : "Saisie vocale"}'), 'Le bouton micro doit avoir un aria-label dynamique');

  // Bouton Synthèse vocale
  assert.ok(composerContent.includes('aria-label={isSpeaking ? "Arrêter la lecture" : "Lecture de la dernière réponse"}'), 'Le bouton de lecture audio doit avoir un aria-label dynamique');
});

test('Mission Lot 3 - 5. Messages encapsulés dans des articles avec titres masqués (WCAG 1.3.1)', () => {
  const chatPath = path.join(rootDir, 'src', 'features', 'chat', 'ClaudeChat.tsx');
  const itemPath = path.join(rootDir, 'src', 'features', 'chat', 'ChatMessageItem.tsx');
  const chatContent = fs.readFileSync(chatPath, 'utf-8');
  const itemContent = fs.existsSync(itemPath) ? fs.readFileSync(itemPath, 'utf-8') : '';
  const combinedContent = chatContent + '\n' + itemContent;

  // Article pour chaque message
  assert.ok(
    combinedContent.includes('<article key={msg.id || idx} aria-labelledby={headingId}') ||
    (chatContent.includes('key={msg.id || idx}') && itemContent.includes('<article')) ||
    combinedContent.includes('aria-labelledby={headingId}'),
    'Chaque message doit être encapsulé dans un <article>'
  );
  assert.ok(combinedContent.includes('Vous avez dit\\u00A0:') || combinedContent.includes('Vous avez dit :'), 'Le message utilisateur doit comporter un titre sr-only "Vous avez dit :"');
  assert.ok(combinedContent.includes('Iroko a dit\\u00A0:') || combinedContent.includes('Iroko a dit :'), 'La réponse assistant doit comporter un titre sr-only "Iroko a dit :"');

  // Article pour le streaming en direct
  assert.ok(chatContent.includes('<article aria-labelledby="assistant-stream-heading"'), 'Le flux streaming doit être encapsulé dans un <article>');
});

test('Mission Lot 3 - 6. Cibles tactiles et interactives minimales (WCAG 2.5.8, tap-target-24)', () => {
  const cssPath = path.join(rootDir, 'src', 'index.css');
  const cssContent = fs.readFileSync(cssPath, 'utf-8');

  // Définition CSS conforme avec pseudo-élément sans impacter le layout visuel
  assert.ok(cssContent.includes('.tap-target-24'), 'src/index.css doit définir la classe .tap-target-24');
  assert.ok(cssContent.includes('min-width: 24px'), 'La classe .tap-target-24 doit garantir une largeur minimale de 24px');
  assert.ok(cssContent.includes('min-height: 24px'), 'La classe .tap-target-24 doit garantir une hauteur minimale de 24px');
  assert.ok(cssContent.includes('@media (pointer: coarse)'), 'La classe .tap-target-24 doit s\'étendre pour les pointeurs tactiles');
  assert.ok(cssContent.includes('min-width: 44px'), 'Sur pointer: coarse, la zone minimale doit être de 44px');

  // Présence sur les boutons compacts
  const sidebarPath = path.join(rootDir, 'src', 'components', 'layout', 'ClaudeSidebar.tsx');
  const sidebarContent = fs.readFileSync(sidebarPath, 'utf-8');
  assert.ok(sidebarContent.includes('tap-target-24'), 'Le bouton filtre de la sidebar doit posséder la classe tap-target-24');

  const composerPath = path.join(rootDir, 'src', 'components', 'composer', 'ClaudeComposer.tsx');
  const composerContent = fs.readFileSync(composerPath, 'utf-8');
  assert.ok(composerContent.includes('tap-target-24'), 'Les boutons de fermeture des puces doivent posséder la classe tap-target-24');
});
