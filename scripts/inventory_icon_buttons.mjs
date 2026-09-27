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
const iconButtons = [];

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  const relFile = path.relative(process.cwd(), file);

  // Match all <button ...>...</button>
  const btnRegex = /<button\b([^>]*)>([\s\S]*?)<\/button>/g;
  let match;
  while ((match = btnRegex.exec(content)) !== null) {
    const attrs = match[1];
    const body = match[2];
    const line = content.slice(0, match.index).split('\n').length;

    // Check if body has icon/svg
    const hasSvgOrIcon = /<[A-Z][a-zA-Z0-9]*\b[^>]*\/>/.test(body) || /<svg\b/i.test(body);
    if (!hasSvgOrIcon) continue;

    // Check visible text
    let textOnly = body
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
      .replace(/<span\b[^>]*\bclass(?:Name)?=["'][^"']*sr-only[^"']*["'][^>]*>[\s\S]*?<\/span>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\{[^}]+\}/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Check if there are text expressions like {p.name}, {tab.label}, etc.
    const rawNoTags = body
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
      .replace(/<[^>]+>/g, ' ');
    const hasTextVar = /\{[a-zA-Z0-9_.?'" :+-]+\}/.test(rawNoTags) && 
      !/\{copied\s*\?/.test(rawNoTags) && 
      !/\{is[A-Za-z]+\s*\?/.test(rawNoTags) &&
      !/\{[a-zA-Z0-9_]+\s*\?\s*<[A-Z]/.test(rawNoTags);

    // Is it truly icon-only?
    // Let's identify the icon name and size
    const iconMatch = body.match(/<([A-Z][a-zA-Z0-9]*)\b([^>]*?)(?:\/>|>)/);
    const iconName = iconMatch ? iconMatch[1] : 'svg';
    const iconAttrs = iconMatch ? iconMatch[2] : '';
    const iconSizeMatch = iconAttrs.match(/\b(w-[^\s"'}]+)\s+(h-[^\s"'}]+)\b/) || iconAttrs.match(/\b(h-[^\s"'}]+)\s+(w-[^\s"'}]+)\b/);
    const iconSize = iconSizeMatch ? `${iconSizeMatch[1]} ${iconSizeMatch[2]}` : (iconAttrs.match(/size=\{?(\d+)\}?/) ? `${iconAttrs.match(/size=\{?(\d+)\}?/)[1]}px` : 'unknown');

    // Extract aria-label and title
    const ariaMatch = attrs.match(/aria-label=(?:\{([^}]+)\}|"([^"]*)"|'([^']*)')/);
    const ariaLabel = ariaMatch ? (ariaMatch[2] || ariaMatch[3] || ariaMatch[1]) : null;

    const titleMatch = attrs.match(/\btitle=(?:\{([^}]+)\}|"([^"]*)"|'([^']*)')/);
    const title = titleMatch ? (titleMatch[2] || titleMatch[3] || titleMatch[1]) : null;

    // Check if this button has visible text or not
    const isIconOnly = textOnly.length === 0 && !body.includes('<span>') && !body.includes('<div>');

    if (isIconOnly) {
      iconButtons.push({
        file: relFile,
        line,
        iconName,
        iconSize,
        ariaLabel,
        title,
        hasAriaLabel: Boolean(ariaLabel),
        hasTitle: Boolean(title),
        status: (ariaLabel && title) ? 'CONFORME' : 'NON_CONFORME',
        attrs: attrs.replace(/\s+/g, ' ').trim()
      });
    }
  }
}

console.log(`\n=== INVENTAIRE DES BOUTONS ICÔNE-SEULE (${iconButtons.length}) ===\n`);

const nonConformes = iconButtons.filter(b => b.status === 'NON_CONFORME');
const conformes = iconButtons.filter(b => b.status === 'CONFORME');

console.log(`Conformes (aria-label ET title présents) : ${conformes.length}`);
console.log(`Non conformes (manque aria-label OU title) : ${nonConformes.length}\n`);

nonConformes.forEach(b => {
  console.log(`[${b.file}:${b.line}] <${b.iconName} ${b.iconSize}>`);
  console.log(`   aria-label: ${b.ariaLabel || '❌ MANQUANT'}`);
  console.log(`   title:      ${b.title || '❌ MANQUANT'}`);
  console.log(`   Attrs:      ${b.attrs.slice(0, 100)}\n`);
});
