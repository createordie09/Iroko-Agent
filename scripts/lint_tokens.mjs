import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const srcDir = path.join(rootDir, 'src');

// Extensions à analyser
const TARGET_EXTS = new Set(['.tsx', '.ts']);

// Répertoires ou fichiers exclus (par ex. CSS pur où les tokens sont définis)
const EXCLUDED_PATHS = [
  path.join(srcDir, 'index.css'),
  path.join(srcDir, 'vite-env.d.ts'),
];

// Regex de détection des couleurs arbitraires
// Détecte les classes Tailwind arbitraires : text-[#...], bg-[#...], border-[#...], etc.
// Détecte aussi les couleurs hexadécimales en dur dans les attributs style ou constantes de composants
const HEX_REGEX = /#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;
const ARBITRARY_RGB_REGEX = /(rgb|rgba|hsl|hsla)\(\s*\d+/g;

let totalErrors = 0;
const errorReports = [];

function scanDirectory(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (EXCLUDED_PATHS.some(ex => fullPath === ex || fullPath.startsWith(ex + path.sep))) {
      continue;
    }

    if (entry.isDirectory()) {
      scanDirectory(fullPath);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (TARGET_EXTS.has(ext)) {
        checkFile(fullPath);
      }
    }
  }
}

function checkFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/);
  const relPath = path.relative(rootDir, filePath).replace(/\\/g, '/');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Ignorer les commentaires stricts de code
    if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
      continue;
    }

    // Recherche de couleurs hexadécimales
    let match;
    HEX_REGEX.lastIndex = 0;
    while ((match = HEX_REGEX.exec(line)) !== null) {
      // Ignorer les URLs d'ancres (ex: href="#section") ou ids non couleur
      const precedingChar = match.index > 0 ? line[match.index - 1] : '';
      if (precedingChar === '&') continue; // entité HTML

      totalErrors++;
      errorReports.push({
        file: relPath,
        line: i + 1,
        match: match[0],
        snippet: trimmed.slice(0, 100)
      });
    }

    // Recherche de fonctions rgb/rgba/hsl arbitraires hors var()
    ARBITRARY_RGB_REGEX.lastIndex = 0;
    while ((match = ARBITRARY_RGB_REGEX.exec(line)) !== null) {
      totalErrors++;
      errorReports.push({
        file: relPath,
        line: i + 1,
        match: match[0],
        snippet: trimmed.slice(0, 100)
      });
    }
  }
}

console.log('--- Contrôle des Tokens de Design (npm run lint:tokens) ---');
scanDirectory(srcDir);

if (totalErrors > 0) {
  console.error(`\n❌ Échec du contrôle : ${totalErrors} couleur(s) arbitraire(s) détectée(s) dans les composants :\n`);
  for (const err of errorReports.slice(0, 50)) {
    console.error(`  - ${err.file}:${err.line} -> "${err.match}" dans : ${err.snippet}`);
  }
  if (errorReports.length > 50) {
    console.error(`  ... et ${errorReports.length - 50} autre(s) occurrence(s).`);
  }
  console.error('\nConsigne : Remplacez chaque couleur par son token CSS (ex. var(--text-primary), var(--bg-surface), var(--border-subtle)...).');
  process.exit(1);
} else {
  console.log('✅ Aucun code couleur en dur trouvé dans les composants. Tous les tokens du design system sont respectés.\n');
  process.exit(0);
}
