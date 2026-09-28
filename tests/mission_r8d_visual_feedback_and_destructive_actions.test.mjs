import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('MISSION R8d : Retour visuel cohérent sur toutes les actions et sécurisation des actions destructrices', () => {

  test('1. Le hook partagé useCopyFeedback existe et implémente le cycle de copie avec délai', () => {
    const hookPath = path.join(rootDir, 'src', 'hooks', 'useCopyFeedback.ts');
    assert.ok(fs.existsSync(hookPath), 'Le fichier useCopyFeedback.ts doit exister');
    const content = fs.readFileSync(hookPath, 'utf-8');

    assert.ok(content.includes('export function useCopyFeedback'), 'Doit exporter useCopyFeedback');
    assert.ok(content.includes('timeoutMs = 1500'), 'Délai par défaut standard de 1500 ms');
    assert.ok(content.includes('clipboard.writeText'), 'Utilise navigator.clipboard.writeText');
    assert.ok(content.includes('execCommand'), 'Dispose d\'un fallback document.execCommand');
  });

  test('2. MessageSources : chaque lien de source possède une action copier avec retour "Copié" et largeur fixe (sans CLS)', () => {
    const filePath = path.join(rootDir, 'src', 'features', 'chat', 'MessageSources.tsx');
    const content = fs.readFileSync(filePath, 'utf-8');

    assert.ok(content.includes('useCopyFeedback'), 'MessageSources doit utiliser useCopyFeedback');
    assert.ok(content.includes('copy(source.url, idx)'), 'Doit copier l\'URL de la source au clic');
    assert.ok(content.includes('w-[58px]'), 'Doit définir une largeur fixe w-[58px] anti-décalage visuel (CLS 0)');
    assert.ok(content.includes('>Copié</span>'), 'Affiche le texte "Copié"');
    assert.ok(content.includes('>Copier</span>'), 'Affiche le texte "Copier"');
    assert.ok(content.includes('aria-live="polite"'), 'Région accessible aria-live="polite" présente');
  });

  test('3. PrivacyPage : le bouton diagnostic a une largeur fixe sans "Copié !" et les identifiants techniques sont copiables', () => {
    const filePath = path.join(rootDir, 'src', 'features', 'settings', 'pages', 'PrivacyPage.tsx');
    const content = fs.readFileSync(filePath, 'utf-8');

    // Bouton principal du diagnostic
    assert.ok(content.includes('w-[145px]'), 'Le bouton diagnostic principal doit avoir une largeur fixe anti-layout shift');
    assert.ok(content.includes('<span>Copié</span>'), 'Le bouton doit afficher sobrement "Copié" sans point d\'exclamation');
    assert.ok(!content.includes('<span>Copié\u00A0!</span>') && !content.includes('<span>Copié !</span>'), 'Aucune variante avec point d\'exclamation');

    // Identifiants individuels dans le bloc
    assert.ok(content.includes('copyField'), 'Permet de copier les identifiants individuels du diagnostic');
    assert.ok(content.includes('w-[54px]'), 'Bouton de copie des identifiants avec largeur fixe w-[54px]');
  });

  test('4. ClaudeTopbar : le menu d\'export propose la copie directe de la discussion en Markdown', () => {
    const filePath = path.join(rootDir, 'src', 'components', 'layout', 'ClaudeTopbar.tsx');
    const content = fs.readFileSync(filePath, 'utf-8');

    assert.ok(content.includes('useCopyFeedback'), 'ClaudeTopbar doit utiliser useCopyFeedback');
    assert.ok(content.includes('handleCopyMarkdown'), 'Doit disposer de la méthode handleCopyMarkdown');
    assert.ok(content.includes("isCopied('markdown') ? 'Copié' : 'Copier en Markdown'"), 'Bascule fluide vers "Copié"');
    assert.ok(content.includes('aria-live="polite"'), 'Annonce d\'accessibilité vocale');
  });

  test('5. MemoryPage : chaque fait de mémoire dispose d\'un bouton de copie dédié', () => {
    const filePath = path.join(rootDir, 'src', 'features', 'settings', 'pages', 'MemoryPage.tsx');
    const content = fs.readFileSync(filePath, 'utf-8');

    assert.ok(content.includes('useCopyFeedback'), 'MemoryPage doit utiliser useCopyFeedback');
    assert.ok(content.includes('copy(m.fact, m.id)'), 'Permet de copier le fait de mémoire au clic');
    assert.ok(content.includes('isCopied(m.id) ? "Copié" : "Copier ce fait"'), 'Feedback d\'accessibilité "Copié"');
  });

  test('6. ChatMessageItem : retours accessibles et titres "Copié" sur les messages utilisateur et assistant', () => {
    const filePath = path.join(rootDir, 'src', 'features', 'chat', 'ChatMessageItem.tsx');
    const content = fs.readFileSync(filePath, 'utf-8');

    assert.ok(content.includes("copiedIndex === index ? 'Copié' : 'Copier'"), 'Titre dynamique "Copié" au clic');
    assert.ok(content.includes('aria-live="polite"'), 'Annonces d\'accessibilité présentes');
  });

  test('7. Actions destructrices : confirmation explicite avant suppression (Connecteurs, Plugins, Clés fournisseurs)', () => {
    // Connecteurs MCP
    const connectorsContent = fs.readFileSync(path.join(rootDir, 'src', 'features', 'settings', 'pages', 'ConnectorsPage.tsx'), 'utf-8');
    assert.ok(connectorsContent.includes('confirmDeleteServerName'), 'ConnectorsPage doit gérer confirmDeleteServerName');
    assert.ok(connectorsContent.includes("Supprimer{'\\u00A0'}?"), 'Demande de confirmation visible pour MCP');
    assert.ok(connectorsContent.includes('Annuler'), 'Bouton Annuler présent');
    assert.ok(connectorsContent.includes('Confirmer'), 'Bouton Confirmer présent');

    // Plugins
    const pluginsContent = fs.readFileSync(path.join(rootDir, 'src', 'features', 'settings', 'pages', 'PluginsPage.tsx'), 'utf-8');
    assert.ok(pluginsContent.includes('confirmDeletePluginId'), 'PluginsPage doit gérer confirmDeletePluginId');
    assert.ok(pluginsContent.includes("Supprimer{'\\u00A0'}?"), 'Demande de confirmation visible pour Plugin');

    // Fournisseurs IA
    const providersContent = fs.readFileSync(path.join(rootDir, 'src', 'features', 'settings', 'pages', 'ProvidersPage.tsx'), 'utf-8');
    assert.ok(providersContent.includes('confirmDeleteProviderId'), 'ProvidersPage doit gérer confirmDeleteProviderId');
    assert.ok(providersContent.includes("Supprimer{'\\u00A0'}?"), 'Demande de confirmation visible pour Fournisseur');

    // Clés de recherche
    const searchContent = fs.readFileSync(path.join(rootDir, 'src', 'features', 'settings', 'pages', 'SearchProvidersSection.tsx'), 'utf-8');
    assert.ok(searchContent.includes('confirmDeleteSearchKeyId'), 'SearchProvidersSection doit gérer confirmDeleteSearchKeyId');
    assert.ok(searchContent.includes("Supprimer{'\\u00A0'}?"), 'Demande de confirmation visible pour Clé de recherche');
  });

  test('8. Règle des 400 lignes respectée sur tous les fichiers modifiés', () => {
    const files = [
      'src/hooks/useCopyFeedback.ts',
      'src/features/chat/MessageSources.tsx',
      'src/features/settings/pages/PrivacyPage.tsx',
      'src/components/layout/ClaudeTopbar.tsx',
      'src/features/settings/pages/MemoryPage.tsx',
      'src/features/chat/ChatMessageItem.tsx',
      'src/features/settings/pages/ConnectorsPage.tsx',
      'src/features/settings/pages/PluginsPage.tsx',
      'src/features/settings/pages/ProvidersPage.tsx',
      'src/features/settings/pages/SearchProvidersSection.tsx'
    ];

    for (const relPath of files) {
      const fullPath = path.join(rootDir, relPath);
      const lineCount = fs.readFileSync(fullPath, 'utf-8').split('\n').length;
      assert.ok(lineCount < 400, `Le fichier ${relPath} compte ${lineCount} lignes (doit être < 400)`);
    }
  });
});
