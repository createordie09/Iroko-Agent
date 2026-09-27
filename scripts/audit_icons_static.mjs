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

const iconDetailsBySize = {};

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  const relFile = path.relative(process.cwd(), file);

  const lucideMatch = content.match(/import\s*\{([^}]+)\}\s*from\s*['"]lucide-react['"]/);
  if (!lucideMatch) continue;
  const lucideIcons = new Set();
  lucideMatch[1].split(',').forEach(i => {
    const name = i.trim().split(/\s+as\s+/)[0].trim();
    if (name) lucideIcons.add(name);
  });

  for (const icon of lucideIcons) {
    const iconRegex = new RegExp(`<${icon}\\b([^>]*?)(?:\\/>|>)`, 'g');
    let m;
    while ((m = iconRegex.exec(content)) !== null) {
      const attrs = m[1];
      const lineNum = content.slice(0, m.index).split('\n').length;
      
      let sizeLabel = 'unknown';
      const sizeAttr = attrs.match(/size=\{?(\d+)\}?/);
      const whMatch = attrs.match(/\b(w-[^\s"'}]+)\s+(h-[^\s"'}]+)\b/) || attrs.match(/\b(h-[^\s"'}]+)\s+(w-[^\s"'}]+)\b/);
      
      if (sizeAttr) {
        sizeLabel = `${sizeAttr[1]}px`;
      } else if (whMatch) {
        sizeLabel = `${whMatch[1]} ${whMatch[2]}`;
      } else {
        sizeLabel = 'NO_SIZE_OR_CLASS (default 24)';
      }

      if (!iconDetailsBySize[sizeLabel]) {
        iconDetailsBySize[sizeLabel] = [];
      }
      iconDetailsBySize[sizeLabel].push({
        file: relFile,
        line: lineNum,
        icon,
        attrs: attrs.replace(/\s+/g, ' ').trim()
      });
    }
  }
}

for (const [size, items] of Object.entries(iconDetailsBySize)) {
  console.log(`\n=== SIZE: ${size} (${items.length} occurrences) ===`);
  items.slice(0, 10).forEach(i => console.log(`  [${i.file}:${i.line}] <${i.icon} ${i.attrs.slice(0, 70)} />`));
  if (items.length > 10) console.log(`  ... and ${items.length - 10} more`);
}
