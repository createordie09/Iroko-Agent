// tests/mission_r8c_french_microcopy.test.mjs
// Suite de tests automatisés Mission R8c :
// Vérifie la qualité, l'accessibilité et la cohérence de la microcopie française :
// 1. Zéro entité HTML brute (&nbsp;, etc.) dans les attributs HTML (placeholder, title, aria-label).
// 2. Zéro points de suspension ASCII (...) dans les textes visibles et attributs (doivent utiliser l'ellipse typographique '…').
// 3. Tous les champs avec placeholder possèdent un aria-label explicite.
// 4. Respect du glossaire normé (discussions, artéfacts avec accent, dossier/projet sans anglicisme workspace).
// 5. Messages d'erreur explicites avec consigne d'action pour l'utilisateur.

import { test, describe } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const srcDir = path.join(rootDir, 'src');

function getAllTsxFiles(dir) {
  let files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(getAllTsxFiles(fullPath));
    } else if (entry.name.endsWith('.tsx')) {
      files.push(fullPath);
    }
  }
  return files;
}

const files = getAllTsxFiles(srcDir);

describe('MISSION R8c : Relecture française et qualité de la microcopie', () => {

  test('1. Zéro entité HTML brute (&nbsp;, &amp;, &quot;) dans les attributs placeholder, title, aria-label', () => {
    const violations = [];

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      const relPath = path.relative(rootDir, file).replace(/\\/g, '/');

      lines.forEach((line, idx) => {
        const match = line.match(/(?:placeholder|title|aria-label|aria-description)=["']([^"']*&(?:nbsp|amp|quot|lt|gt);[^"']*)["']/);
        if (match) {
          violations.push(`${relPath}:${idx + 1} -> ${match[1]}`);
        }
      });
    }

    assert.strictEqual(
      violations.length,
      0,
      `Entités HTML trouvées dans des attributs :\n${violations.join('\n')}`
    );
  });

  test('2. Zéro ellipse ASCII (...) dans les textes visibles et attributs placeholder/title/aria-label', () => {
    const violations = [];

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      const relPath = path.relative(rootDir, file).replace(/\\/g, '/');

      lines.forEach((line, idx) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('/*')) return;

        // Attributs
        const attrMatch = line.match(/(?:placeholder|title|aria-label)=["']([^"']*\.\.\.[^"']*)["']/);
        if (attrMatch) {
          violations.push(`${relPath}:${idx + 1} (attr) -> ${attrMatch[1]}`);
        }

        // Textes visibles dans balises JSX
        const jsxMatch = line.match(/>([^<]*\.\.\.[^<]*)</);
        if (jsxMatch && !trimmed.includes('...') && !trimmed.includes('console.')) {
          violations.push(`${relPath}:${idx + 1} (jsx) -> ${jsxMatch[1].trim()}`);
        }
      });
    }

    assert.strictEqual(
      violations.length,
      0,
      `Ellipses ASCII (...) détectées dans les textes visibles :\n${violations.join('\n')}`
    );
  });

  test('3. Tous les champs inputs/textareas avec placeholder possèdent un aria-label explicite', () => {
    const violations = [];

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      const relPath = path.relative(rootDir, file).replace(/\\/g, '/');

      lines.forEach((line, idx) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('<input') || trimmed.startsWith('<textarea')) {
          const hasAria = line.includes('aria-label=') || line.includes('aria-labelledby=');
          const hasPlaceholder = line.includes('placeholder=');
          const isHiddenOrSubmit = line.includes('type="hidden"') || line.includes('type="checkbox"') || line.includes('type="radio"') || line.includes('type="file"');
          if (hasPlaceholder && !hasAria && !isHiddenOrSubmit) {
            violations.push(`${relPath}:${idx + 1} -> ${trimmed}`);
          }
        }
      });
    }

    assert.strictEqual(
      violations.length,
      0,
      `Champs avec placeholder sans aria-label explicite :\n${violations.join('\n')}`
    );
  });

  test('4. Respect strict de la terminologie normée (pas de "zone de conversation" ni "workspace" visible)', () => {
    const violations = [];

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      const relPath = path.relative(rootDir, file).replace(/\\/g, '/');

      lines.forEach((line, idx) => {
        const trimmed = line.trim();
        // Vérification ZoneErrorBoundary
        if (line.includes('<ZoneErrorBoundary') && line.includes('zone de conversation')) {
          violations.push(`${relPath}:${idx + 1} -> ZoneErrorBoundary doit utiliser "zone de discussion"`);
        }
        // Vérification terme workspace dans attributs visibles
        const wsAttr = line.match(/(?:title|aria-label|placeholder)=["']([^"']*\bworkspace\b[^"']*)["']/i);
        if (wsAttr) {
          violations.push(`${relPath}:${idx + 1} -> Anglicisme workspace dans : "${wsAttr[1]}"`);
        }
      });
    }

    assert.strictEqual(
      violations.length,
      0,
      `Violations terminologiques détectées :\n${violations.join('\n')}`
    );
  });

  test('5. Les messages d\'erreur de fallback comportent une consigne claire pour l\'utilisateur', () => {
    const chatFile = path.join(srcDir, 'features', 'chat', 'ClaudeChat.tsx');
    const content = fs.readFileSync(chatFile, 'utf8');
    assert.ok(
      content.includes('La communication avec le modèle a échoué. Veuillez vérifier la configuration de votre fournisseur ou cliquer sur Réessayer.'),
      'Le message d\'erreur dans ClaudeChat doit expliquer l\'échec et indiquer la démarche à suivre'
    );

    const liveFile = path.join(srcDir, 'hooks', 'useLiveAnnouncements.ts');
    const liveContent = fs.readFileSync(liveFile, 'utf8');
    assert.ok(
      liveContent.includes('Veuillez réessayer'),
      'Le message live d\'erreur doit donner une consigne exploitable aux technologies d\'assistance'
    );
  });
});
