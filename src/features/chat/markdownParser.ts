export interface ParsedCodeBlock {
  type: 'code';
  code: string;
  language?: string;
  title?: string;
  isClosed: boolean;
  rawLength?: number;
}

export interface ParsedTableBlock {
  type: 'table';
  headers: string[];
  rows: string[][];
  rawLines: string[];
  content: string;
  isClosed: boolean;
  rawLength?: number;
}

export interface ParsedTextBlock {
  type: 'text';
  content: string;
  isClosed: boolean;
  rawLength?: number;
}

export type ParsedBlock = ParsedCodeBlock | ParsedTableBlock | ParsedTextBlock;

/**
 * Analyse une chaîne d'information de bloc de code Markdown.
 */
export function parseCodeBlockInfo(infoString: string): { language?: string; title?: string } {
  const trimmed = infoString.trim();
  if (!trimmed) return {};

  let title: string | undefined;
  let language: string | undefined;

  const titleMatch = trimmed.match(/(?:title|filename)\s*=\s*["']([^"']+)["']/i);
  if (titleMatch) {
    title = titleMatch[1];
  }

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
 * Vérifie si un groupe de lignes forme un tableau Markdown valide.
 * Si le tableau est à la fin du document en cours de streaming sans ligne suivante,
 * il reste isClosed: false jusqu'à clôture par une ligne non-tableau ou fin de flux.
 */
function tryParseTableLines(
  lines: string[],
  startIndex: number,
  isEndOfDocument: boolean
): { tableBlock: ParsedTableBlock; consumedLineCount: number; rawLength: number } | null {
  if (startIndex + 1 >= lines.length) return null;

  const headerLine = lines[startIndex].trim();
  const delimLine = lines[startIndex + 1].trim();

  if (!headerLine.includes('|') || !delimLine.includes('|')) return null;

  const parseCells = (line: string) => {
    return line.split('|').map(c => c.trim()).filter((c, idx, arr) => {
      if ((idx === 0 || idx === arr.length - 1) && c === '') return false;
      return true;
    });
  };

  const delimCells = parseCells(delimLine);
  if (delimCells.length === 0) return null;

  const isDelimValid = delimCells.every(c => /^:?-{2,}:?$/.test(c));
  if (!isDelimValid) return null;

  const headerCells = parseCells(headerLine);
  if (headerCells.length !== delimCells.length) return null;

  const rows: string[][] = [];
  const rawLines: string[] = [lines[startIndex], lines[startIndex + 1]];
  let idx = startIndex + 2;

  while (idx < lines.length) {
    const currentLine = lines[idx];
    const trimmed = currentLine.trim();
    if (!trimmed || !trimmed.includes('|')) {
      break;
    }
    const cells = parseCells(trimmed);
    rows.push(cells);
    rawLines.push(currentLine);
    idx++;
  }

  const consumedLineCount = rawLines.length;
  const isLastInDocument = (startIndex + consumedLineCount) >= lines.length;
  const isFollowedByNonTable = idx < lines.length;
  const isClosed = isFollowedByNonTable || isEndOfDocument;
  const rawLength = rawLines.join('\n').length + (isLastInDocument ? 0 : 1);

  return {
    tableBlock: {
      type: 'table',
      headers: headerCells,
      rows,
      rawLines,
      content: rawLines.join('\n'),
      isClosed,
      rawLength
    },
    consumedLineCount,
    rawLength
  };
}

/**
 * Analyse une tranche de lignes de texte pour y isoler d'éventuels tableaux et textes.
 */
function parseTextAndTables(
  lines: string[],
  isEndOfDocument: boolean
): ParsedBlock[] {
  const blocks: ParsedBlock[] = [];
  let currentTextLines: string[] = [];

  let i = 0;
  while (i < lines.length) {
    const tableResult = tryParseTableLines(lines, i, isEndOfDocument);
    if (tableResult) {
      if (currentTextLines.length > 0) {
        const rawLength = currentTextLines.join('\n').length + 1;
        blocks.push({
          type: 'text',
          content: currentTextLines.join('\n'),
          isClosed: true,
          rawLength
        });
        currentTextLines = [];
      }
      blocks.push(tableResult.tableBlock);
      i += tableResult.consumedLineCount;
      continue;
    }

    currentTextLines.push(lines[i]);
    i++;
  }

  if (currentTextLines.length > 0) {
    const rawLength = currentTextLines.join('\n').length + (isEndOfDocument ? 0 : 1);
    blocks.push({
      type: 'text',
      content: currentTextLines.join('\n'),
      isClosed: isEndOfDocument,
      rawLength
    });
  }

  return blocks;
}

/**
 * Analyse complète d'une chaîne brute en blocs.
 */
function parseRawContent(text: string, isEndOfDocument: boolean): ParsedBlock[] {
  const blocks: ParsedBlock[] = [];
  const lines = text.split('\n');
  let currentTextLines: string[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const fenceMatch = line.match(/^(`{3,}|~{3,})(.*)$/);

    if (fenceMatch) {
      const fenceChars = fenceMatch[1];
      const fenceChar = fenceChars[0];
      const fenceLength = fenceChars.length;
      const infoString = fenceMatch[2] || '';

      const { language, title } = parseCodeBlockInfo(infoString);

      // Traiter le texte précédant le bloc de code
      if (currentTextLines.length > 0) {
        const textBlocks = parseTextAndTables(currentTextLines, false);
        blocks.push(...textBlocks);
        currentTextLines = [];
      }

      // Collecter les lignes du bloc de code
      const codeLines: string[] = [];
      const codeRawLines: string[] = [line];
      i++; // Sauter la ligne d'ouverture

      let closed = false;
      while (i < lines.length) {
        const currentLine = lines[i];
        const closeRegex = new RegExp(`^${fenceChar}{${fenceLength},}\\s*$`);
        if (closeRegex.test(currentLine)) {
          closed = true;
          codeRawLines.push(currentLine);
          i++; // Sauter la ligne de clôture
          break;
        }

        codeLines.push(currentLine);
        codeRawLines.push(currentLine);
        i++;
      }

      const isLastBlock = i >= lines.length && isEndOfDocument;
      const rawLength = codeRawLines.join('\n').length + (isLastBlock ? 0 : 1);

      blocks.push({
        type: 'code',
        code: codeLines.join('\n'),
        language,
        title,
        isClosed: closed,
        rawLength
      });
      continue;
    }

    currentTextLines.push(line);
    i++;
  }

  if (currentTextLines.length > 0) {
    const textBlocks = parseTextAndTables(currentTextLines, isEndOfDocument);
    blocks.push(...textBlocks);
  }

  return blocks;
}

/**
 * Cache de streaming pour mémorisation incrémentale des blocs clôturés.
 */
interface StreamCache {
  lastInput: string;
  finalizedBlocks: ParsedBlock[];
  finalizedConsumedLength: number;
}

let activeStreamCache: StreamCache = {
  lastInput: '',
  finalizedBlocks: [],
  finalizedConsumedLength: 0
};

export function resetMarkdownStreamCache() {
  activeStreamCache = {
    lastInput: '',
    finalizedBlocks: [],
    finalizedConsumedLength: 0
  };
}

/**
 * Découpe le Markdown en blocs de premier niveau.
 * Chaque bloc terminé est conservé dans le cache incrémental et n'est jamais recalculé ;
 * seul le dernier bloc, ouvert, se met à jour pendant la frappe des tokens.
 */
export function parseMarkdownBlocks(markdown: string): ParsedBlock[] {
  if (!markdown) return [];

  const { lastInput, finalizedBlocks, finalizedConsumedLength } = activeStreamCache;

  // Vérifier si le texte actuel commence bien par la portion finalisée du texte précédent
  const canUseCache =
    finalizedConsumedLength > 0 &&
    markdown.length >= finalizedConsumedLength &&
    markdown.slice(0, finalizedConsumedLength) === lastInput.slice(0, finalizedConsumedLength);

  let stableBlocks: ParsedBlock[] = [];
  let remainingText = markdown;

  if (canUseCache) {
    stableBlocks = [...finalizedBlocks];
    remainingText = markdown.slice(finalizedConsumedLength);
  }

  // Analyse du texte restant
  const tailBlocks = parseRawContent(remainingText, true);
  const allBlocks = [...stableBlocks, ...tailBlocks];

  // Mise à jour du cache pour le tour suivant :
  // Seuls les blocs consécutifs garantis clôturés (isClosed === true) avant le dernier bloc peuvent être figés
  if (allBlocks.length > 1) {
    const candidateBlocks: ParsedBlock[] = [];
    for (let i = 0; i < allBlocks.length - 1; i++) {
      if (!allBlocks[i].isClosed) {
        break; // Rien après un bloc non clôturé ne peut être figé
      }
      candidateBlocks.push(allBlocks[i]);
    }

    if (candidateBlocks.length > 0) {
      const consumed = candidateBlocks.reduce((acc, b) => acc + (b.rawLength || 0), 0);
      if (consumed > 0 && consumed <= markdown.length) {
        activeStreamCache = {
          lastInput: markdown,
          finalizedBlocks: candidateBlocks,
          finalizedConsumedLength: consumed
        };
        return allBlocks;
      }
    }
  }

  // Réinitialisation si aucun bloc figé
  activeStreamCache = {
    lastInput: markdown,
    finalizedBlocks: [],
    finalizedConsumedLength: 0
  };

  return allBlocks;
}
