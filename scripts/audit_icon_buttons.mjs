import fs from 'fs';
import path from 'path';

function walk(dir) {
  let files = [];
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) files = files.concat(walk(full));
    else if (/\.(tsx|ts)$/.test(f)) files.push(full);
  }
  return files;
}

const files = walk('src');

const allButtons = [];

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  const relFile = path.relative(process.cwd(), file);

  // Match all <button ...>...</button>
  // Handing nested tags properly by matching opening tag then content up to </button>
  const buttonRegex = /<button\b([^>]*)>([\s\S]*?)<\/button>/g;
  let match;
  while ((match = buttonRegex.exec(content)) !== null) {
    const rawAttrs = match[1];
    const body = match[2];

    // Extract aria-label
    let ariaLabel = null;
    const ariaMatch = rawAttrs.match(/aria-label=(?:\{([^}]+)\}|"([^"]*)"|'([^']*)')/);
    if (ariaMatch) {
      ariaLabel = ariaMatch[2] || ariaMatch[3] || ariaMatch[1];
    }

    // Extract title
    let title = null;
    const titleMatch = rawAttrs.match(/\btitle=(?:\{([^}]+)\}|"([^"]*)"|'([^']*)')/);
    if (titleMatch) {
      title = titleMatch[2] || titleMatch[3] || titleMatch[1];
    }

    // Determine visible text vs icons
    // Remove comments
    let stripped = body.replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
    // Remove sr-only elements
    stripped = stripped.replace(/<span\b[^>]*\bclass(?:Name)?=["'][^"']*sr-only[^"']*["'][^>]*>[\s\S]*?<\/span>/gi, '');
    // Check if contains svg or Lucide component
    const hasIcon = /<[A-Z][a-zA-Z0-9]*\b[^>]*\/>/.test(stripped) || /<svg\b/i.test(stripped) || /<[A-Z][a-zA-Z0-9]*\b[^>]*>[\s\S]*?<\/[A-Z][a-zA-Z0-9]*>/.test(stripped);

    // Remove all JSX tags
    const withoutTags = stripped.replace(/<[^>]+>/g, ' ');
    // Remove curly expressions that are conditional rendering or empty
    // But keep literal strings inside curly like {' '} or {'\u00A0'} or variable text
    const textTokens = [];
    const cleanText = withoutTags
      .replace(/\{[^}]+\}/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Check if there are text expressions in JSX like {label} or {p.name}
    const hasJsxTextExpr = /\{([a-zA-Z0-9_?.()]+(?:title|name|label|text|desc|count|status)[a-zA-Z0-9_?.()]*)\}/i.test(withoutTags)
      || /\{copied\s*\?\s*['"][^'"]+['"]\s*:\s*['"][^'"]+['"]\}/.test(withoutTags);

    const isIconOnly = hasIcon && cleanText.length === 0 && !hasJsxTextExpr;

    allButtons.push({
      file: relFile,
      line: content.slice(0, match.index).split('\n').length,
      rawAttrs: rawAttrs.replace(/\s+/g, ' ').trim(),
      ariaLabel,
      title,
      isIconOnly,
      hasIcon,
      cleanText: cleanText.slice(0, 30),
      bodySummary: stripped.replace(/\s+/g, ' ').slice(0, 80)
    });
  }
}

console.log(`Audited ${allButtons.length} total <button> tags across ${files.length} files.`);
const iconOnly = allButtons.filter(b => b.isIconOnly);
console.log(`Identified ${iconOnly.length} icon-only buttons.`);

console.log('\n--- Checking accessible name (aria-label) and tooltip (title) ---');
const missingAria = iconOnly.filter(b => !b.ariaLabel);
const missingTitle = iconOnly.filter(b => !b.title);
const missingBoth = iconOnly.filter(b => !b.ariaLabel && !b.title);
const missingEither = iconOnly.filter(b => !b.ariaLabel || !b.title);

console.log(`Missing aria-label: ${missingAria.length}`);
console.log(`Missing title (tooltip): ${missingTitle.length}`);
console.log(`Missing both: ${missingBoth.length}`);
console.log(`Missing either aria-label or title: ${missingEither.length}\n`);

for (const b of missingEither) {
  console.log(`[${b.file}:${b.line}]`);
  console.log(`  aria-label: ${b.ariaLabel || '❌ MANQUANT'}`);
  console.log(`  title:      ${b.title || '❌ MANQUANT'}`);
  console.log(`  Body:       ${b.bodySummary}`);
  console.log(`  Attrs:      ${b.rawAttrs.slice(0, 100)}\n`);
}
