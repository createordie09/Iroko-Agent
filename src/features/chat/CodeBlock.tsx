import React, { useState, useRef, useMemo } from 'react';
import { Copy, Check, WrapText } from 'lucide-react';

export interface CodeBlockProps {
  key?: React.Key;
  code: string;
  language?: string;
  title?: string;
  isOpen?: boolean;
}

// Mots-clés courants pour la coloration monochrome sobre
const COMMON_KEYWORDS = new Set([
  'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'do',
  'switch', 'case', 'break', 'continue', 'default', 'class', 'extends', 'new', 'this',
  'super', 'import', 'export', 'from', 'as', 'try', 'catch', 'finally', 'throw',
  'async', 'await', 'yield', 'typeof', 'instanceof', 'void', 'delete', 'in', 'of',
  'type', 'interface', 'namespace', 'module', 'enum', 'declare', 'abstract', 'implements',
  'public', 'private', 'protected', 'readonly', 'static', 'override',
  'def', 'elif', 'pass', 'lambda', 'with', 'is', 'not', 'and', 'or', 'None', 'True', 'False',
  'select', 'where', 'insert', 'update', 'into', 'values', 'order', 'by', 'group',
  'fn', 'mut', 'impl', 'trait', 'struct', 'pub', 'crate', 'self', 'match',
  'package', 'func', 'go', 'chan', 'defer'
]);

function copyToClipboard(text: string): Promise<boolean> {
  if (navigator?.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).then(() => true).catch(() => fallbackCopy(text));
  }
  return Promise.resolve(fallbackCopy(text));
}

function fallbackCopy(text: string): boolean {
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.top = '-9999px';
    textArea.style.left = '-9999px';
    textArea.setAttribute('readonly', '');
    document.body.appendChild(textArea);
    textArea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return successful;
  } catch {
    return false;
  }
}

/**
 * Tokenizer monochrome sobre pour le code.
 * Désactivé au-delà de 2000 lignes pour garantir des performances optimales.
 */
function renderMonochromeCode(code: string, language?: string): React.ReactNode {
  const lineCount = (code.match(/\n/g) || []).length + 1;
  if (lineCount > 2000) {
    return code;
  }

  // Expression régulière pour identifier commentaires, chaînes et mots
  // //... ou /*...*/ ou #... ou "..." ou '...' ou `...` ou mots
  const tokenRegex = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|#[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|[a-zA-Z_$][a-zA-Z0-9_$]*|[0-9]+(?:\.[0-9]+)?|[^\s\w])/g;

  const lines = code.split('\n');
  return lines.map((line, lineIdx) => {
    let lastIndex = 0;
    const elements: React.ReactNode[] = [];
    let match: RegExpExecArray | null;

    tokenRegex.lastIndex = 0;
    while ((match = tokenRegex.exec(line)) !== null) {
      const matchIndex = match.index;
      if (matchIndex > lastIndex) {
        elements.push(line.slice(lastIndex, matchIndex));
      }

      const token = match[0];
      const key = `${lineIdx}-${matchIndex}`;

      if (token.startsWith('//') || token.startsWith('/*') || token.startsWith('#')) {
        // Commentaire : gris discret italique
        elements.push(
          <span key={key} className="text-[var(--text-tertiary)] italic">
            {token}
          </span>
        );
      } else if (
        (token.startsWith('"') && token.endsWith('"')) ||
        (token.startsWith("'") && token.endsWith("'")) ||
        (token.startsWith('`') && token.endsWith('`'))
      ) {
        // Chaîne de caractères : gris clair légèrement adouci
        elements.push(
          <span key={key} className="text-[var(--text-muted)]">
            {token}
          </span>
        );
      } else if (COMMON_KEYWORDS.has(token)) {
        // Mot-clé : blanc principal semi-gras
        elements.push(
          <span key={key} className="text-[var(--text-primary)] font-semibold">
            {token}
          </span>
        );
      } else if (/^[0-9]/.test(token)) {
        // Nombre : gris neutre
        elements.push(
          <span key={key} className="text-[var(--text-muted)]">
            {token}
          </span>
        );
      } else {
        elements.push(token);
      }

      lastIndex = tokenRegex.lastIndex;
    }

    if (lastIndex < line.length) {
      elements.push(line.slice(lastIndex));
    }

    return (
      <React.Fragment key={lineIdx}>
        {elements}
        {lineIdx < lines.length - 1 ? '\n' : ''}
      </React.Fragment>
    );
  });
}

function CodeBlockComponent({ code, language, title, isOpen = false }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const [isWrapped, setIsWrapped] = useState(false);
  const copyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const displayLang = useMemo(() => {
    if (language && language !== 'text' && language !== 'plaintext') {
      return language.toLowerCase();
    }
    return '';
  }, [language]);

  // Coloration monochrome exécutée une seule fois à la fermeture (règles UX U7 et Lot 4)
  // Pas de coloration pendant que le bloc est ouvert (texte monochrome brut)
  const renderedCode = useMemo(() => {
    if (isOpen) {
      return code;
    }
    return renderMonochromeCode(code, displayLang);
  }, [code, displayLang, isOpen]);

  const handleCopy = async () => {
    const success = await copyToClipboard(code);
    if (success) {
      setCopied(true);
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => {
        setCopied(false);
      }, 1500);
    }
  };

  return (
    <div className="my-3 rounded-[8px] bg-[var(--bg-sidebar)] border border-[var(--border-subtle)] overflow-hidden text-left">
      {/* En-tête du bloc : Langage / Titre à gauche, Actions à droite */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--bg-modal)] border-b border-[var(--border-subtle)] text-[12px] select-none">
        <div className="flex items-center gap-2 min-w-0 pr-2">
          {title ? (
            <div className="flex items-center gap-1.5 truncate">
              <span className="font-medium text-[var(--text-primary)] truncate" title={title}>
                {title}
              </span>
              {displayLang && displayLang !== title.toLowerCase() && (
                <span className="text-[11px] text-[var(--text-secondary)] shrink-0 font-mono">
                  ({displayLang})
                </span>
              )}
            </div>
          ) : (
            <span className="text-[var(--text-secondary)] font-mono text-[11px] uppercase tracking-wider">
              {displayLang || 'texte'}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* Bascule du retour à la ligne */}
          <button
            type="button"
            onClick={() => setIsWrapped(!isWrapped)}
            className={`p-1 rounded transition-colors ${
              isWrapped
                ? 'bg-[var(--bg-active)] text-[var(--text-primary)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'
            }`}
            title={isWrapped ? 'Désactiver le retour à la ligne' : 'Activer le retour à la ligne'}
            aria-label={isWrapped ? 'Désactiver le retour à la ligne' : 'Activer le retour à la ligne'}
          >
            <WrapText className="w-3.5 h-3.5" />
          </button>

          {/* Bouton ghost Copier / Copié (largeur fixe pour 0 décalage de mise en page) */}
          <button
            type="button"
            onClick={handleCopy}
            className={`inline-flex items-center justify-center gap-1.5 px-2 py-0.5 rounded text-[12px] font-sans transition-colors w-[68px] ${
              copied
                ? 'text-[var(--text-primary)] bg-[var(--bg-surface-hover)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'
            }`}
            title="Copier le contenu brut"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-[var(--text-primary)]" />
                <span className="text-[var(--text-primary)]">Copié</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copier</span>
              </>
            )}
            <span className="sr-only" aria-live="polite">
              {copied ? 'Code copié dans le presse-papier' : ''}
            </span>
          </button>
        </div>
      </div>

      {/* Zone de code défilante horizontalement */}
      <div className="overflow-x-auto max-w-full">
        <pre
          className={`p-3 font-mono text-[13px] leading-relaxed text-[var(--text-primary)] select-text m-0 ${
            isWrapped ? 'whitespace-pre-wrap break-words' : 'whitespace-pre'
          }`}
        >
          <code>{renderedCode}</code>
        </pre>
      </div>
    </div>
  );
}

export const CodeBlock = React.memo(CodeBlockComponent);

