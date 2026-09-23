import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const srcDir = path.join(rootDir, 'src');

function getSourceFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      results = results.concat(getSourceFiles(fullPath));
    } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
      if (!file.includes('.test.') && !file.endsWith('.d.ts')) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

// Regex pour détecter les espaces ordinaires (ASCII 32) devant : ; ? ! ou dans « »
// On cherche [caractère mot/chiffre/guillemet/parenthèse] suivi d'un espace ASCII 32 suivi de : ; ? !
// En excluant :
// - URLs : http:// https://
// - Heures : 12:30
// - Clés JSON / ternaires
function lintContent(filePath, content) {
  const issues = [];
  const lines = content.split('\n');

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    const trimmed = line.trim();

    // Ignorer les imports, commentaires purs, classes Tailwind
    if (trimmed.startsWith('import ') || trimmed.startsWith('export *') || trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
      return;
    }

    // Extraction des textes JSX : >texte<
    const jsxMatches = line.matchAll(/>([^<>{}\n]+)</g);
    for (const m of jsxMatches) {
      const text = m[1];
      checkString(text, 'jsx-text', lineNum, filePath, issues, line);
    }

    // Extraction des attributs aria-label, title, placeholder, aria-description
    const attrMatches = line.matchAll(/(aria-label|title|placeholder|aria-description|alt)=(?:{"([^"]+)"}|'([^']+)'|"([^"]+)")/g);
    for (const m of attrMatches) {
      const attrName = m[1];
      const val = m[2] || m[3] || m[4];
      if (val) {
        checkString(val, attrName, lineNum, filePath, issues, line);
      }
    }

    // Chaînes littérales de messages UI dans les templates ou fonctions d'état
    // Ex: "Impossible de charger :", 'Confirmer la suppression ?'
    if (!trimmed.startsWith('console.') && !trimmed.startsWith('logger.') && !trimmed.includes('!==') && !trimmed.includes('!=') && !trimmed.includes(' ? ')) {
      const stringLiterals = line.matchAll(/(?:['"`])([^'"`\n\r]*[a-zA-ZÀ-ÿ0-9][ \t]+[:;?!][^'"`\n\r]*)(?:['"`])/g);
      for (const m of stringLiterals) {
        const val = m[1];
        // Ignorer si c'est du code ou ternaire ou URL
        if (
          val.includes('http://') ||
          val.includes('https://') ||
          val.includes('ws://') ||
          val.includes('wss://') ||
          val.includes('127.0.0.1') ||
          val.includes('localhost') ||
          val.includes('SELECT ') ||
          val.includes('FROM ') ||
          val.includes('className') ||
          val.includes('Bearer ') ||
          val.includes('typeof ') ||
          val.includes('${') ||
          val.startsWith('[') // Tag technique comme [AgentClient]
        ) {
          continue;
        }
        checkString(val, 'string-literal', lineNum, filePath, issues, line);
      }
    }
  });

  return issues;
}

function checkString(str, context, lineNum, filePath, issues, fullLine) {
  // Ignorer si URL ou format horaire pur ou tag de log
  if (/^https?:\/\//.test(str) || /^wss?:\/\//.test(str) || /^\[.*\]/.test(str)) return;
  if (fullLine.includes('console.') || fullLine.includes('logger.')) return;

  // 1. Espace ordinaire avant deux-points : [a-zA-ZÀ-ÿ0-9)] :
  // Attention à ne pas signaler 12:30 ou http:// ou adresse IP
  const colonMatch = str.match(/([a-zA-ZÀ-ÿ0-9\)»])[ \t]+:(?=[\s'"»\)\]\}>,;.]|$)/);
  if (colonMatch && !colonMatch[0].includes('\u00A0') && !colonMatch[0].includes('\u202F')) {
    // Vérifier que ce n'est pas une heure (ex: 12:30) ou clé d'objet JS/CSS ou IP
    const afterColon = str.slice(colonMatch.index + colonMatch[0].length).trim();
    const isHour = /^\d{2}/.test(afterColon) && /\d/.test(colonMatch[1]);
    const isIpPort = /\d+\.\d+\.\d+\.\d+/.test(str);
    const isCodeKey = /^[a-zA-Z0-9_]+:\s*[a-zA-Z0-9_]/.test(str) && context === 'string-literal';

    if (!isHour && !isIpPort && !isCodeKey) {
      issues.push({
        type: 'colon',
        char: ':',
        message: 'Espace ordinaire avant deux-points ":" au lieu d\'une espace insécable (\\u00A0)',
        context,
        lineNum,
        filePath,
        snippet: str.trim(),
        line: fullLine.trim()
      });
    }
  }

  // 2. Espace ordinaire avant point d'interrogation : [a-zA-ZÀ-ÿ0-9)] ?
  const questionMatch = str.match(/([a-zA-ZÀ-ÿ0-9\)»])[ \t]+\?(?=[\s'"»\)\]\}>,;.]|$)/);
  if (questionMatch && !questionMatch[0].includes('\u00A0') && !questionMatch[0].includes('\u202F')) {
    // Éviter ternaire JS
    if (!str.includes(' ? ') || context !== 'string-literal' || str.endsWith('?')) {
      issues.push({
        type: 'question',
        char: '?',
        message: 'Espace ordinaire avant point d\'interrogation "?" au lieu d\'une espace insécable (\\u00A0)',
        context,
        lineNum,
        filePath,
        snippet: str.trim(),
        line: fullLine.trim()
      });
    }
  }

  // 3. Espace ordinaire avant point d'exclamation : [a-zA-ZÀ-ÿ0-9)] !
  // Ne pas confondre avec l'opérateur JS != ou !== ou non-null assertion ou negation logique
  const exclMatch = str.match(/([a-zA-ZÀ-ÿ0-9\)»])[ \t]+!(?=[\s'"»\)\]\}>,;.]|$)/);
  if (exclMatch && !exclMatch[0].includes('\u00A0') && !exclMatch[0].includes('\u202F')) {
    if (!str.includes('return !') && !str.includes('&& !') && !str.includes('|| !')) {
      issues.push({
        type: 'exclamation',
        char: '!',
        message: 'Espace ordinaire avant point d\'exclamation "!" au lieu d\'une espace insécable (\\u00A0)',
        context,
        lineNum,
        filePath,
        snippet: str.trim(),
        line: fullLine.trim()
      });
    }
  }

  // 4. Espace ordinaire avant point-virgule : [a-zA-ZÀ-ÿ0-9)] ;
  const semiMatch = str.match(/([a-zA-ZÀ-ÿ0-9\)»])[ \t]+;(?=[\s'"»\)\]\}>,;.]|$)/);
  if (semiMatch && !semiMatch[0].includes('\u00A0') && !semiMatch[0].includes('\u202F')) {
    issues.push({
      type: 'semicolon',
      char: ';',
      message: 'Espace ordinaire avant point-virgule ";" au lieu d\'une espace insécable (\\u00A0)',
      context,
      lineNum,
      filePath,
      snippet: str.trim(),
      line: fullLine.trim()
    });
  }

  // 5. Guillemets français « »
  // « suivi d'espace ordinaire ou espace ordinaire suivi de »
  if (/«[ \t]+/.test(str) && !str.includes('«\u00A0') && !str.includes('«\u202F')) {
    issues.push({
      type: 'quote_open',
      char: '«',
      message: 'Espace ordinaire après guillemet ouvrant « au lieu d\'une espace insécable (\\u00A0)',
      context,
      lineNum,
      filePath,
      snippet: str.trim(),
      line: fullLine.trim()
    });
  }
  if (/[ \t]+»/.test(str) && !str.includes('\u00A0»') && !str.includes('\u202F»')) {
    issues.push({
      type: 'quote_close',
      char: '»',
      message: 'Espace ordinaire avant guillemet fermant » au lieu d\'une espace insécable (\\u00A0)',
      context,
      lineNum,
      filePath,
      snippet: str.trim(),
      line: fullLine.trim()
    });
  }
}

export function runLintFr(options = { exitOnError: true }) {
  console.log('--- Lancement du linter de typographie française (npm run lint:fr) ---');
  const files = getSourceFiles(srcDir);
  let allIssues = [];

  for (const f of files) {
    const content = fs.readFileSync(f, 'utf8');
    const fileIssues = lintContent(f, content);
    allIssues = allIssues.concat(fileIssues);
  }

  // Dédupliquer par (filePath, lineNum, char)
  const uniqueIssues = [];
  const seen = new Set();
  for (const iss of allIssues) {
    const key = `${iss.filePath}:${iss.lineNum}:${iss.char}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueIssues.push(iss);
    }
  }

  if (uniqueIssues.length === 0) {
    console.log(`✅ Zéro violation typographique détectée sur ${files.length} fichiers sources.`);
    return true;
  }

  console.error(`❌ ${uniqueIssues.length} violation(s) typographique(s) trouvée(s) :\n`);
  for (const iss of uniqueIssues) {
    const relPath = path.relative(rootDir, iss.filePath);
    console.error(`  ${relPath}:${iss.lineNum} [${iss.context}] ${iss.message}`);
    console.error(`    ↳ Ligne : "${iss.line}"\n`);
  }

  if (options.exitOnError) {
    process.exit(1);
  }
  return false;
}

if (process.argv[1] && process.argv[1].endsWith('lint_fr.mjs')) {
  runLintFr();
}
