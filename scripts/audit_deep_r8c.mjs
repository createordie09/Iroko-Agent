// scripts/audit_deep_r8c.mjs
// Audit approfondi R8c :
// 1. Contrôle des placeholders vs labels accessibles (WCAG)
// 2. Explicitation des messages d'erreur (ce qui s'est passé + quoi faire)
// 3. Cohérence terminologique (discussion, projet, artéfact, dossier)
// 4. Anglicismes cachés (ex. reset, cancel, save, delete, error, upload, download, model, token, provider, etc.)

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

// 1. Vérification des placeholders
const placeholderIssues = [];
// 2. Recherche d'anglicismes visibles
const anglicisms = [];
// 3. Recherche de messages d'erreurs
const errorMessages = [];
// 4. Recherche de "conversation" ou "artefact"
const terminologyIssues = [];

const COMMON_ENGLISH_WORDS = [
  'cancel', 'save', 'delete', 'loading', 'warning', 'submit', 'search',
  'close', 'open', 'settings', 'history', 'chat', 'code', 'file', 'folder',
  'upload', 'download', 'preview', 'retry', 'edit', 'copy', 'copied',
  'back', 'next', 'previous', 'confirm', 'clear', 'default', 'custom'
];

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  const relPath = path.relative(rootDir, file).replace(/\\/g, '/');

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;

    // Check placeholder
    const placeholderMatch = line.match(/placeholder=["']([^"']+)["']/i);
    if (placeholderMatch) {
      const ph = placeholderMatch[1];
      const hasAriaLabel = line.includes('aria-label') || line.includes('aria-labelledby') || line.includes('id=');
      placeholderIssues.push({
        file: relPath,
        lineNum,
        placeholder: ph,
        hasAriaLabel,
        line: line.trim()
      });
    }

    // Check terminology in visible text
    // "conversation" in user-facing string
    const convMatch = line.match(/>([^<]*\bconversations?\b[^<]*)</i);
    if (convMatch) {
      terminologyIssues.push({
        file: relPath,
        lineNum,
        type: 'conversation',
        text: convMatch[1].trim()
      });
    }
    const convAttrMatch = line.match(/(?:title|aria-label|placeholder)=["']([^"']*\bconversations?\b[^"']*)["']/i);
    if (convAttrMatch) {
      terminologyIssues.push({
        file: relPath,
        lineNum,
        type: 'conversation (attr)',
        text: convAttrMatch[1].trim()
      });
    }

    // "artefact" without accent in visible text
    const artMatch = line.match(/>([^<]*\bartefacts?\b[^<]*)</i);
    if (artMatch) {
      terminologyIssues.push({
        file: relPath,
        lineNum,
        type: 'artefact sans accent',
        text: artMatch[1].trim()
      });
    }
    const artAttrMatch = line.match(/(?:title|aria-label|placeholder)=["']([^"']*\bartefacts?\b[^"']*)["']/i);
    if (artAttrMatch) {
      terminologyIssues.push({
        file: relPath,
        lineNum,
        type: 'artefact sans accent (attr)',
        text: artAttrMatch[1].trim()
      });
    }

    // Check for error text
    if (line.match(/(?:erreur|impossible|échec|invalide|refusé)/i) && (line.includes('>') || line.includes("title=") || line.includes("label="))) {
      const textMatch = line.match(/>([^<]+)</) || line.match(/["']([^"']*(?:erreur|impossible|échec|invalide)[^"']*)["']/);
      if (textMatch && !line.includes('console.') && !line.includes('import ') && !line.includes('type ')) {
        errorMessages.push({
          file: relPath,
          lineNum,
          text: textMatch[1].trim()
        });
      }
    }
  });
}

console.log('=== RÉSULTATS AUDIT APPROFONDI R8c ===');
console.log(`Placeholders trouvés : ${placeholderIssues.length}`);
console.log(`Problèmes terminologiques : ${terminologyIssues.length}`);
console.log(`Messages d'erreur/alerte analysés : ${errorMessages.length}`);

console.log('\n--- Terminologie détectée ---');
terminologyIssues.forEach(t => console.log(`[${t.file}:${t.lineNum}] (${t.type}) : "${t.text}"`));

console.log('\n--- Placeholders sans aria-label ou label explicite sur la même ligne ---');
placeholderIssues.filter(p => !p.hasAriaLabel).forEach(p => {
  console.log(`[${p.file}:${p.lineNum}] "${p.placeholder}" -> ${p.line}`);
});

console.log('\n--- Échantillon de messages d\'erreur inspectés ---');
errorMessages.slice(0, 15).forEach(e => {
  console.log(`[${e.file}:${e.lineNum}] "${e.text}"`);
});
