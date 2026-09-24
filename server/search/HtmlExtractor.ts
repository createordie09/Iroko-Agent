/**
 * Extracteur HTML vers texte sobre et sécurisé pour web_fetch.
 * Réutilise les principes d'extraction textuelle des pièces jointes (M2).
 */
export class HtmlExtractor {
  /**
   * Nettoie et extrait le texte d'un document HTML.
   */
  public static extractText(html: string, maxCharacters: number = 20000): { text: string; truncated: boolean } {
    if (!html || typeof html !== 'string') {
      return { text: '', truncated: false };
    }

    // 1. Supprimer scripts, styles, noscript, svg, iframes
    let cleaned = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
      .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, ' ')
      .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, ' ')
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, ' ');

    // 2. Transformer les balises de bloc en sauts de ligne
    cleaned = cleaned
      .replace(/<\/(p|div|section|article|aside|header|footer|nav|blockquote|tr|table)>/gi, '\n\n')
      .replace(/<br\s*[\/]?>/gi, '\n')
      .replace(/<\/h[1-6]>/gi, '\n\n')
      .replace(/<li[^>]*>/gi, '• ')
      .replace(/<\/li>/gi, '\n');

    // 3. Supprimer toutes les autres balises HTML
    cleaned = cleaned.replace(/<[^>]+>/g, ' ');

    // 4. Décoder les entités HTML courantes
    cleaned = cleaned
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/&#(\d+);/g, (_, dec) => {
        try {
          return String.fromCharCode(parseInt(dec, 10));
        } catch {
          return '';
        }
      })
      .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
        try {
          return String.fromCharCode(parseInt(hex, 16));
        } catch {
          return '';
        }
      });

    // 5. Normaliser les espaces et sauts de ligne
    cleaned = cleaned
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s+\n/g, '\n\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    // 6. Troncature si dépassement du plafond
    let truncated = false;
    if (cleaned.length > maxCharacters) {
      cleaned = cleaned.slice(0, maxCharacters) + `\n\n[... Page web tronquée à ${maxCharacters.toLocaleString('fr-FR')} caractères.]`;
      truncated = true;
    }

    return { text: cleaned, truncated };
  }
}
