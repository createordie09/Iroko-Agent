export interface ParsedCodeBlock {
  type: 'code';
  code: string;
  language?: string;
  title?: string;
}

export interface ParsedTextBlock {
  type: 'text';
  content: string;
}

export type ParsedBlock = ParsedCodeBlock | ParsedTextBlock;

/**
 * Analyse une chaîne d'information de bloc de code Markdown.
 * Exemples supportés :
 * - "js" -> language: "js"
 * - "typescript title=\"app.ts\"" -> language: "typescript", title: "app.ts"
 * - "python:script.py" -> language: "python", title: "script.py"
 * - "text filename='notes.txt'" -> language: "text", title: "notes.txt"
 */
export function parseCodeBlockInfo(infoString: string): { language?: string; title?: string } {
  const trimmed = infoString.trim();
  if (!trimmed) return {};

  let title: string | undefined;
  let language: string | undefined;

  // Recherche de title="..." ou title='...' ou filename="..."
  const titleMatch = trimmed.match(/(?:title|filename)\s*=\s*["']([^"']+)["']/i);
  if (titleMatch) {
    title = titleMatch[1];
  }

  // Suppression de la partie title=... pour extraire le langage
  const withoutTitle = trimmed.replace(/(?:title|filename)\s*=\s*["']([^"']+)["']/i, '').trim();

  if (withoutTitle.includes(':')) {
    const parts = withoutTitle.split(':');
    language = parts[0].trim();
    if (!title && parts[1]?.trim()) {
      title = parts[1].trim();
    }
  } else {
    const firstWord = withoutTitle.split(/\s+/)[0];
    if (firstWord) {
      language = firstWord;
    }
  }

  return { language, title };
}

/**
 * Découpe un document Markdown en blocs de code clôturés (3 backticks/tildes ou plus)
 * et en blocs de texte ordinaire, en respectant rigoureusement la spécification CommonMark.
 */
export function parseMarkdownBlocks(markdown: string): ParsedBlock[] {
  const blocks: ParsedBlock[] = [];
  const lines = markdown.split('\n');
  let currentTextLines: string[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Détection d'ouverture de bloc de code : au moins 3 backticks ou 3 tildes
    const fenceMatch = line.match(/^(`{3,}|~{3,})(.*)$/);

    if (fenceMatch) {
      const fenceChars = fenceMatch[1];
      const fenceChar = fenceChars[0]; // '`' ou '~'
      const fenceLength = fenceChars.length;
      const infoString = fenceMatch[2] || '';

      const { language, title } = parseCodeBlockInfo(infoString);

      // Si nous avions accumulé du texte avant ce bloc de code, l'ajouter
      if (currentTextLines.length > 0) {
        blocks.push({
          type: 'text',
          content: currentTextLines.join('\n')
        });
        currentTextLines = [];
      }

      // Collecter les lignes du bloc de code jusqu'à la clôture correspondante
      const codeLines: string[] = [];
      i++; // Passer la ligne d'ouverture

      let closed = false;
      while (i < lines.length) {
        const currentLine = lines[i];
        // Une clôture valide doit utiliser le MÊME caractère et avoir au moins la même longueur
        const closeRegex = new RegExp(`^${fenceChar}{${fenceLength},}\\s*$`);
        if (closeRegex.test(currentLine)) {
          closed = true;
          i++; // Passer la ligne de clôture
          break;
        }

        codeLines.push(currentLine);
        i++;
      }

      blocks.push({
        type: 'code',
        code: codeLines.join('\n'),
        language,
        title
      });

      continue;
    }

    currentTextLines.push(line);
    i++;
  }

  if (currentTextLines.length > 0) {
    blocks.push({
      type: 'text',
      content: currentTextLines.join('\n')
    });
  }

  return blocks;
}
