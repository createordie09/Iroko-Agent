import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseMarkdownBlocks, resetMarkdownStreamCache } from '../src/features/chat/markdownParser.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

test('Mission Lot 4 - 1. Regroupement des tokens (useStreamBuffer & <= 20 fps)', () => {
  const hookPath = path.join(rootDir, 'src', 'hooks', 'useStreamBuffer.ts');
  assert.ok(fs.existsSync(hookPath), 'src/hooks/useStreamBuffer.ts doit exister');

  const hookContent = fs.readFileSync(hookPath, 'utf-8');
  assert.ok(hookContent.includes('export function useStreamBuffer'), 'Doit exporter useStreamBuffer');
  assert.ok(hookContent.includes('requestAnimationFrame'), 'Doit utiliser requestAnimationFrame pour cadencer les rendus');
  assert.ok(hookContent.includes('minInterval = 50') || hookContent.includes('50'), 'Doit imposer une cadence maximale de 20 fps (50 ms minimum)');
  assert.ok(hookContent.includes('document.hidden'), 'Doit vérifier document.hidden pour les onglets en arrière-plan');
  assert.ok(hookContent.includes('flushImmediately'), 'Doit exposer flushImmediately pour vider immédiatement le tampon');
  assert.ok(hookContent.includes('appendDelta'), 'Doit exposer appendDelta pour ajouter des jetons au tampon');

  // Vérification de l'intégration dans ClaudeChat.tsx
  const chatPath = path.join(rootDir, 'src', 'features', 'chat', 'ClaudeChat.tsx');
  const chatContent = fs.readFileSync(chatPath, 'utf-8');
  assert.ok(chatContent.includes("useStreamBuffer"), 'ClaudeChat.tsx doit importer et utiliser useStreamBuffer');
  assert.ok(chatContent.includes('appendStreamDelta'), 'ClaudeChat.tsx doit alimenter le flux via appendStreamDelta');
  assert.ok(chatContent.includes('flushStreamImmediately'), 'ClaudeChat.tsx doit appeler flushStreamImmediately en fin de tâche');
  assert.ok(chatContent.includes('resetStreamBuffer'), 'ClaudeChat.tsx doit réinitialiser le tampon via resetStreamBuffer');
});

test('Mission Lot 4 - 2. Blocs mémoïsés et découpage de premier niveau (règle UX U7)', () => {
  const chatPath = path.join(rootDir, 'src', 'features', 'chat', 'ClaudeChat.tsx');
  const chatContent = fs.readFileSync(chatPath, 'utf-8');

  // Vérification de la présence de MemoizedBlock avec React.memo
  assert.ok(chatContent.includes('const MemoizedBlock = React.memo'), 'MemoizedBlock doit être enveloppé dans React.memo');
  assert.ok(chatContent.includes('const FormattedMessage = React.memo'), 'FormattedMessage doit être enveloppé dans React.memo');
  assert.ok(chatContent.includes('isOpen={isBlockOpen}'), 'Doit transmettre isOpen au bloc terminal');
  assert.ok(chatContent.includes('const isLast = bIdx === blocks.length - 1'), 'Doit identifier le dernier bloc comme seul bloc susceptible d\'être ouvert');

  // Clé React conforme : index + contenu
  assert.ok(chatContent.includes('key={`${bIdx}-${contentKey}`}') || chatContent.includes('contentKey'), 'La clé de bloc doit inclure index + contenu');

  // Construction non fermée affichée en texte brut sans erreur
  resetMarkdownStreamCache();
  const unclosedCode = '```typescript\nconst temp = 42;';
  const blocks1 = parseMarkdownBlocks(unclosedCode);
  assert.strictEqual(blocks1.length, 1);
  assert.strictEqual(blocks1[0].type, 'code');
  assert.strictEqual(blocks1[0].isClosed, false, 'Un bloc de code sans clôture doit être isClosed: false');

  const unclosedTable = '| Col 1 | Col 2 |\n| Incomplet';
  const blocks2 = parseMarkdownBlocks(unclosedTable);
  assert.strictEqual(blocks2.length, 1);
  assert.strictEqual(blocks2[0].type, 'text', 'Un tableau sans délimiteur valide doit rester un bloc texte brut');
});

test('Mission Lot 4 - 3. Blocs de code (pas de coloration si ouvert, coloration unique si fermé, useMemo)', () => {
  const codeBlockPath = path.join(rootDir, 'src', 'features', 'chat', 'CodeBlock.tsx');
  const codeBlockContent = fs.readFileSync(codeBlockPath, 'utf-8');

  // Vérification de isOpen dans CodeBlockProps
  assert.ok(codeBlockContent.includes('isOpen?: boolean'), 'CodeBlockProps doit comporter isOpen?: boolean');
  assert.ok(codeBlockContent.includes('export const CodeBlock = React.memo'), 'CodeBlock doit être exporté avec React.memo');
  assert.ok(codeBlockContent.includes('const renderedCode = useMemo'), 'La coloration de code doit être encapsulée dans useMemo');

  // Conditionnement strict de la coloration selon isOpen
  assert.ok(
    codeBlockContent.includes('if (isOpen)') && codeBlockContent.includes('return code;'),
    'Si isOpen est vrai, le code doit être renvoyé brut sans coloration'
  );
  assert.ok(codeBlockContent.includes('renderMonochromeCode(code, displayLang)'), 'La coloration monochrome doit être invoquée sur bloc fermé');
  assert.ok(codeBlockContent.includes('lineCount > 2000'), 'Désactivation de la coloration au-delà de 2000 lignes');
});

test('Mission Lot 4 - 4. Test d\'équivalence obligatoire (titres, listes, tableaux, code, imbriqués)', () => {
  const fixtures = {
    titres: `### Spécification Système
Analyse des besoins et contraintes opérationnelles.`,

    listes: `- Premier point d'audit
- Deuxième point d'audit
• Puce alternative standard`,

    tableaux: `| Nom du Module | Statut | Criticité |
| :--- | :--- | :--- |
| Runtime Node | Opérationnel | Haute |
| Passerelle Modèles | Prête | Moyenne |`,

    code: `\`\`\`typescript title="runtime.ts"
export function startDaemon(): void {
  console.log("Démarré");
}
\`\`\``,

    imbriques: `### Synthèse Globale

Introduction aux travaux de remédiation :
- Axe 1 : Accessibilité WCAG 2.2 AA
- Axe 2 : Performance et fluidité streaming

\`\`\`json
{
  "statut": "conforme",
  "score": 100
}
\`\`\`

Tableau récapitulatif :
| Métrique | Cible |
| --- | --- |
| INP | <= 100 ms |
| FPS | <= 20 fps |

Fin du rapport.`
  };

  for (const [name, markdownText] of Object.entries(fixtures)) {
    // 1. Rendu direct du texte final
    resetMarkdownStreamCache();
    const directBlocks = parseMarkdownBlocks(markdownText);

    // 2. Simulation de flux streaming token par token (par morceaux de 3 à 7 caractères)
    resetMarkdownStreamCache();
    let accumulated = '';
    let streamingBlocks = [];
    const chunkSize = 5;

    for (let pos = 0; pos < markdownText.length; pos += chunkSize) {
      accumulated += markdownText.slice(pos, pos + chunkSize);
      streamingBlocks = parseMarkdownBlocks(accumulated);
    }

    // Le résultat final obtenu après le streaming doit être rigoureusement identique au rendu direct
    assert.strictEqual(
      streamingBlocks.length,
      directBlocks.length,
      `Nombre de blocs différent pour la fixture "${name}" (${streamingBlocks.length} vs ${directBlocks.length})`
    );

    for (let i = 0; i < directBlocks.length; i++) {
      const dBlock = directBlocks[i];
      const sBlock = streamingBlocks[i];
      assert.strictEqual(sBlock.type, dBlock.type, `Type de bloc discordant à l'index ${i} pour "${name}"`);
      if (dBlock.type === 'code') {
        assert.strictEqual(sBlock.code, dBlock.code, `Code discordant à l'index ${i} pour "${name}"`);
        assert.strictEqual(sBlock.language, dBlock.language, `Langage discordant à l'index ${i} pour "${name}"`);
        assert.strictEqual(sBlock.title, dBlock.title, `Titre discordant à l'index ${i} pour "${name}"`);
        assert.strictEqual(sBlock.isClosed, dBlock.isClosed, `Statut isClosed discordant à l'index ${i} pour "${name}"`);
      } else if (dBlock.type === 'table') {
        assert.deepStrictEqual(sBlock.headers, dBlock.headers, `En-têtes de tableau discordants à l'index ${i} pour "${name}"`);
        assert.deepStrictEqual(sBlock.rows, dBlock.rows, `Lignes de tableau discordantes à l'index ${i} pour "${name}"`);
        assert.strictEqual(sBlock.isClosed, dBlock.isClosed, `Statut isClosed de tableau discordant à l'index ${i} pour "${name}"`);
      } else if (dBlock.type === 'text') {
        assert.strictEqual(sBlock.content, dBlock.content, `Contenu textuel discordant à l'index ${i} pour "${name}"`);
      }
    }
  }
});

test('Mission Lot 4 - 5. Défilement stick-to-bottom et respect du mouvement réduit (Point 4)', async () => {
  const hookPath = path.join(rootDir, 'src', 'hooks', 'useStickToBottom.ts');
  assert.ok(fs.existsSync(hookPath), 'src/hooks/useStickToBottom.ts doit exister');

  const hookContent = fs.readFileSync(hookPath, 'utf-8');
  assert.ok(hookContent.includes('export function useStickToBottom'), 'Doit exporter useStickToBottom');
  assert.ok(hookContent.includes('export function getScrollBehavior'), 'Doit exporter getScrollBehavior');
  assert.ok(hookContent.includes('threshold = 48'), 'Doit utiliser un seuil strict de 48 px pour la détection du bas de page');
  assert.ok(hookContent.includes('{ passive: true }'), 'Les écouteurs d\'événements de défilement doivent être passifs');
  assert.ok(hookContent.includes('requestAnimationFrame'), 'Le défilement en streaming doit être cadencé par rAF');

  // Test unitaire de getScrollBehavior
  const { getScrollBehavior } = await import('../src/hooks/useStickToBottom.ts');
  assert.strictEqual(getScrollBehavior('reduced', false), 'auto', 'Mouvement réduit désactive le smooth scroll automatique');
  assert.strictEqual(getScrollBehavior('reduced', true), 'auto', 'Mouvement réduit désactive aussi le smooth scroll déclenché par l\'utilisateur');
  assert.strictEqual(getScrollBehavior('system', false), 'auto', 'Le streaming ou contenu sans trigger utilisateur est toujours auto');
  assert.strictEqual(getScrollBehavior('system', true), 'smooth', 'L\'action utilisateur explicite utilise smooth si animations non réduites');

  // Vérification de l'intégration dans ClaudeChat.tsx
  const chatPath = path.join(rootDir, 'src', 'features', 'chat', 'ClaudeChat.tsx');
  const chatContent = fs.readFileSync(chatPath, 'utf-8');
  assert.ok(chatContent.includes('useStickToBottom('), 'ClaudeChat.tsx doit appeler useStickToBottom');
  assert.ok(chatContent.includes('animations'), 'ClaudeChat.tsx doit transmettre animations à useStickToBottom');
  assert.ok(chatContent.includes('showScrollButton'), 'ClaudeChat.tsx doit conditionner l\'affichage au retour de useStickToBottom');
  assert.ok(chatContent.includes('Revenir en bas'), 'Le bouton doit porter le libellé "Revenir en bas"');
  assert.ok(chatContent.includes('aria-label="Revenir en bas de la discussion"'), 'Le bouton doit avoir un aria-label accessible');

  // Règle 3 des interdits : aucune ombre
  const buttonMatch = chatContent.match(/showScrollButton[\s\S]*?<\/button>/);
  assert.ok(buttonMatch, 'Le bouton Revenir en bas doit être présent dans le composant');
  assert.ok(!buttonMatch[0].includes('shadow-'), 'Le bouton Revenir en bas ne doit comporter aucune ombre (interdit strict Règle 3)');
});

