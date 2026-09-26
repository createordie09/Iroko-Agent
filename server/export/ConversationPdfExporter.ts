// server/export/ConversationPdfExporter.ts
// Cahier §11, §26, Missions M5, N2, R4g : Export PDF structuré et lisible d'une conversation via pdf-lib

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export interface ExportMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ConversationPdfExportOptions {
  title: string;
  messages: ExportMessage[];
  date?: string;
}

export class ConversationPdfExporter {
  // Limites strictes pour éviter plantage mémoire ou pages illisibles
  public static readonly MAX_MESSAGES = 100;
  public static readonly MAX_TOTAL_CHARS = 150_000;

  /**
   * Nettoie le texte pour l'encodage WinAnsi (Latin-1) supporté par les polices standard PDF
   */
  public static sanitizeText(text: string): string {
    if (!text) return '';
    return text
      .replace(/[\u{1F300}-\u{1F9FF}]/gu, '') // Emojis
      .replace(/[\u{2600}-\u{26FF}]/gu, '')   // Symboles divers
      .replace(/[\u{2700}-\u{27BF}]/gu, '')   // Dingbats
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split('')
      .map(char => {
        const code = char.charCodeAt(0);
        if (code >= 32 && code <= 126) return char;
        if (code >= 160 && code <= 255) return char;
        if (['\n', '\t'].includes(char)) return char;
        if (char === '’' || char === '‘') return "'";
        if (char === '“' || char === '”') return '"';
        if (char === '…') return '...';
        if (char === '—') return ' -- ';
        if (char === '–') return '-';
        if (char === '•') return '* ';
        if (char === '«') return '<<';
        if (char === '»') return '>>';
        if (code > 255) return ' ';
        return char;
      })
      .join('');
  }

  /**
   * Remplace les références d'images et d'artéfacts par des mentions textuelles claires
   */
  public static formatContentReferences(rawContent: string): string {
    return rawContent
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt, url) => {
        const name = alt || url.split('/').pop() || 'image';
        return `\n[Image : ${name}]\n`;
      })
      .replace(/<artifact_card[^>]*name="([^"]+)"[^>]*>/gi, (_match, name) => {
        return `\n[Artéfact : ${name}]\n`;
      })
      .replace(/\[Pièce jointe\s*:\s*([^\]]+)\]/gi, (_match, name) => {
        return `\n[Pièce jointe : ${name}]\n`;
      });
  }

  /**
   * Génère le document PDF pour la conversation spécifiée
   */
  public static async generate(options: ConversationPdfExportOptions): Promise<Buffer> {
    const { title, messages, date } = options;

    if (!messages || messages.length === 0) {
      throw new Error("Impossible d'exporter une discussion vide en PDF.");
    }

    // Vérification des limites de longueur (§ Point 3 Mission R4g)
    if (messages.length > this.MAX_MESSAGES) {
      throw new Error(
        `La discussion est trop volumineuse pour un export PDF (${messages.length} messages). La limite maximale est de ${this.MAX_MESSAGES} messages. Veuillez utiliser l'export Markdown ou JSON pour archiver cette discussion sans limite.`
      );
    }

    const totalChars = messages.reduce((acc, m) => acc + (m.content ? m.content.length : 0), 0);
    if (totalChars > this.MAX_TOTAL_CHARS) {
      throw new Error(
        `Le contenu de la discussion est trop volumineux pour un export PDF (${totalChars.toLocaleString('fr-FR')} caractères). La limite maximale est de ${this.MAX_TOTAL_CHARS.toLocaleString('fr-FR')} caractères. Veuillez utiliser l'export Markdown ou JSON.`
      );
    }

    const pdfDoc = await PDFDocument.create();
    pdfDoc.setTitle(this.sanitizeText(title || 'Discussion Iroko'));
    pdfDoc.setAuthor('Iroko Code Agent');
    pdfDoc.setCreator('Iroko Code Agent (Mission R4g)');

    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontMono = await pdfDoc.embedFont(StandardFonts.Courier);

    const PAGE_WIDTH = 595.28;
    const PAGE_HEIGHT = 841.89;
    const MARGIN_LEFT = 50;
    const PRINTABLE_WIDTH = PAGE_WIDTH - 100; // 495.28 pt
    const BOTTOM_LIMIT = 55;

    let currentPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    let currentY = PAGE_HEIGHT - 50;

    const checkPageBreak = (neededHeight: number) => {
      if (currentY - neededHeight < BOTTOM_LIMIT) {
        currentPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        currentY = PAGE_HEIGHT - 50;
      }
    };

    // ── En-tête sur la première page ──
    const displayTitle = this.sanitizeText(title || 'Discussion');
    currentPage.drawText(displayTitle, {
      x: MARGIN_LEFT,
      y: currentY,
      size: 16,
      font: fontBold,
      color: rgb(0.1, 0.1, 0.1)
    });
    currentY -= 20;

    const exportDateStr = date || new Date().toLocaleDateString('fr-FR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    const metaLine = `Exporté le ${exportDateStr} -- Iroko Code Agent`;
    currentPage.drawText(this.sanitizeText(metaLine), {
      x: MARGIN_LEFT,
      y: currentY,
      size: 9.5,
      font: fontRegular,
      color: rgb(0.45, 0.45, 0.45)
    });
    currentY -= 15;

    // Ligne de séparation sous le titre
    currentPage.drawLine({
      start: { x: MARGIN_LEFT, y: currentY },
      end: { x: MARGIN_LEFT + PRINTABLE_WIDTH, y: currentY },
      thickness: 0.75,
      color: rgb(0.85, 0.85, 0.85)
    });
    currentY -= 25;

    // ── Rendu des messages ──
    for (let msgIdx = 0; msgIdx < messages.length; msgIdx++) {
      const msg = messages[msgIdx];
      const isUser = msg.role === 'user';
      const roleLabel = isUser ? 'UTILISATEUR' : 'ASSISTANT';

      checkPageBreak(50);

      // Titre de rôle sobre
      currentPage.drawText(roleLabel, {
        x: MARGIN_LEFT,
        y: currentY,
        size: 9,
        font: fontBold,
        color: isUser ? rgb(0.35, 0.35, 0.35) : rgb(0.15, 0.15, 0.15)
      });
      currentY -= 16;

      // Traitement du contenu du message
      const sanitized = this.sanitizeText(this.formatContentReferences(msg.content || ''));
      const parts = sanitized.split(/(```[\s\S]*?```)/g);

      for (const part of parts) {
        if (!part) continue;

        if (part.startsWith('```') && part.endsWith('```')) {
          // ── Bloc de code ──
          const codeLines = part.slice(3, -3).replace(/^[a-zA-Z0-9_-]+\n/, '').split('\n');
          const lineHeight = 13;
          const padding = 6;

          for (const line of codeLines) {
            checkPageBreak(lineHeight + 4);

            // Fond légèrement distinct
            currentPage.drawRectangle({
              x: MARGIN_LEFT,
              y: currentY - 3,
              width: PRINTABLE_WIDTH,
              height: lineHeight + 2,
              color: rgb(0.95, 0.95, 0.95)
            });

            // Découpage de ligne de code si trop longue
            let displayCodeLine = line;
            if (fontMono.widthOfTextAtSize(displayCodeLine, 8.5) > PRINTABLE_WIDTH - 2 * padding) {
              while (displayCodeLine.length > 0 && fontMono.widthOfTextAtSize(displayCodeLine + '...', 8.5) > PRINTABLE_WIDTH - 2 * padding) {
                displayCodeLine = displayCodeLine.slice(0, -1);
              }
              displayCodeLine += '...';
            }

            currentPage.drawText(displayCodeLine, {
              x: MARGIN_LEFT + padding,
              y: currentY,
              size: 8.5,
              font: fontMono,
              color: rgb(0.15, 0.15, 0.15)
            });
            currentY -= lineHeight;
          }
          currentY -= 6;
        } else {
          // ── Texte normal (paragraphes) ──
          const paragraphs = part.split('\n');
          for (const rawPara of paragraphs) {
            const para = rawPara.trim();
            if (!para) {
              currentY -= 6;
              continue;
            }

            const words = para.split(' ');
            let currentLine = '';

            for (const w of words) {
              const testLine = currentLine + (currentLine ? ' ' : '') + w;
              const textWidth = fontRegular.widthOfTextAtSize(testLine, 10);

              if (textWidth > PRINTABLE_WIDTH && currentLine) {
                checkPageBreak(15);
                currentPage.drawText(currentLine, {
                  x: MARGIN_LEFT,
                  y: currentY,
                  size: 10,
                  font: fontRegular,
                  color: rgb(0.2, 0.2, 0.2)
                });
                currentY -= 14;
                currentLine = w;
              } else {
                currentLine = testLine;
              }
            }

            if (currentLine) {
              checkPageBreak(15);
              currentPage.drawText(currentLine, {
                x: MARGIN_LEFT,
                y: currentY,
                size: 10,
                font: fontRegular,
                color: rgb(0.2, 0.2, 0.2)
              });
              currentY -= 14;
            }
          }
        }
      }

      currentY -= 12;

      // Séparateur entre échanges si ce n'est pas le dernier
      if (msgIdx < messages.length - 1) {
        checkPageBreak(15);
        currentPage.drawLine({
          start: { x: MARGIN_LEFT, y: currentY },
          end: { x: MARGIN_LEFT + PRINTABLE_WIDTH, y: currentY },
          thickness: 0.5,
          color: rgb(0.9, 0.9, 0.9)
        });
        currentY -= 16;
      }
    }

    // ── Pagination propre sur toutes les pages ──
    const totalPages = pdfDoc.getPageCount();
    for (let i = 0; i < totalPages; i++) {
      const p = pdfDoc.getPage(i);
      const pageStr = `Page ${i + 1} / ${totalPages}`;
      const textW = fontRegular.widthOfTextAtSize(pageStr, 8.5);

      p.drawText(pageStr, {
        x: PAGE_WIDTH - MARGIN_LEFT - textW,
        y: 25,
        size: 8.5,
        font: fontRegular,
        color: rgb(0.5, 0.5, 0.5)
      });
    }

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  }
}
