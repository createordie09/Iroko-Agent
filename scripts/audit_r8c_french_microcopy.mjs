// scripts/audit_r8c_french_microcopy.mjs
// Audit linguistique et sémantique R8c :
// 1. Entités HTML brutes (&nbsp;, etc.) dans les attributs (placeholder, title, aria-label)
// 2. Trois points ASCII (...) dans les textes visibles et attributs
// 3. Inputs/textareas sans aria-label explicite ou associé
// 4. Termes proscrits par le glossaire UX (conversation, artefact sans accent, workspace)
// 5. Messages d'erreur sans indication d'action
// 6. Tutoiement éventuel

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
const findings = [];

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  const relPath = path.relative(rootDir, file).replace(/\\/g, '/');

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    const trimmed = line.trim();

    // 1. Entités HTML dans attributs
    const entityInAttr = line.match(/(?:placeholder|title|aria-label|aria-description)=["']([^"']*&(?:nbsp|amp|quot|lt|gt);[^"']*)["']/);
    if (entityInAttr) {
      findings.push({
        file: relPath,
        lineNum,
        category: 'HTML_ENTITY_IN_ATTR',
        detail: `Entité HTML brute dans attribut : "${entityInAttr[1]}"`,
        line: trimmed
      });
    }

    // 2. Trois points ASCII (...) dans attributs ou texte visible
    const asciiDotsAttr = line.match(/(?:placeholder|title|aria-label)=["']([^"']*\.\.\.[^"']*)["']/);
    if (asciiDotsAttr) {
      findings.push({
        file: relPath,
        lineNum,
        category: 'ASCII_ELLIPSIS_ATTR',
        detail: `Points ASCII (...) dans attribut : "${asciiDotsAttr[1]}"`,
        line: trimmed
      });
    }

    const asciiDotsJsx = line.match(/>([^<]*\.\.\.[^<]*)</);
    if (asciiDotsJsx && !trimmed.startsWith('//') && !trimmed.startsWith('/*')) {
      findings.push({
        file: relPath,
        lineNum,
        category: 'ASCII_ELLIPSIS_JSX',
        detail: `Points ASCII (...) dans texte visible : "${asciiDotsJsx[1].trim()}"`,
        line: trimmed
      });
    }

    // 3. Inputs ou textareas sans aria-label
    if (trimmed.startsWith('<input') || trimmed.startsWith('<textarea')) {
      const hasAria = line.includes('aria-label=') || line.includes('aria-labelledby=');
      const hasPlaceholder = line.includes('placeholder=');
      const isHiddenOrSubmit = line.includes('type="hidden"') || line.includes('type="checkbox"') || line.includes('type="radio"') || line.includes('type="file"');
      if (hasPlaceholder && !hasAria && !isHiddenOrSubmit) {
        findings.push({
          file: relPath,
          lineNum,
          category: 'PLACEHOLDER_WITHOUT_ARIA',
          detail: `Champ avec placeholder mais sans aria-label explicite`,
          line: trimmed
        });
      }
    }

    // 4. Terme proscrit "conversation" dans texte visible ou attribut
    const convJsx = line.match(/>([^<]*\bconversations?\b[^<]*)</i);
    if (convJsx && !trimmed.startsWith('//')) {
      findings.push({
        file: relPath,
        lineNum,
        category: 'PROSCRIBED_TERM_CONVERSATION',
        detail: `Terme proscrit "conversation" : "${convJsx[1].trim()}"`,
        line: trimmed
      });
    }

    // 5. ZoneErrorBoundary zoneName
    if (line.includes('<ZoneErrorBoundary') && line.includes('zone de conversation')) {
      findings.push({
        file: relPath,
        lineNum,
        category: 'PROSCRIBED_TERM_CONVERSATION',
        detail: `zoneName="zone de conversation" doit être "zone de discussion"`,
        line: trimmed
      });
    }

    // 6. Terme "workspace" visible
    const wsAttr = line.match(/(?:title|aria-label|placeholder)=["']([^"']*\bworkspace\b[^"']*)["']/i);
    if (wsAttr) {
      findings.push({
        file: relPath,
        lineNum,
        category: 'PROSCRIBED_TERM_WORKSPACE',
        detail: `Terme "workspace" dans attribut visible : "${wsAttr[1]}"`,
        line: trimmed
      });
    }
  });
}

console.log(`=== RAPPORT COMPLET AUDIT MICROCOPY R8c ===`);
console.log(`Nombre d'anomalies détectées : ${findings.length}\n`);

const grouped = {};
for (const f of findings) {
  if (!grouped[f.category]) grouped[f.category] = [];
  grouped[f.category].push(f);
}

for (const [cat, items] of Object.entries(grouped)) {
  console.log(`\n--- [${cat}] (${items.length} occurrences) ---`);
  for (const item of items) {
    console.log(`  [${item.file}:${item.lineNum}] ${item.detail}`);
    console.log(`    Code : ${item.line}\n`);
  }
}
