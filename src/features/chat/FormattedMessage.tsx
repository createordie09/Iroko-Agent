import React, { useMemo } from 'react';
import { CodeBlock } from './CodeBlock';
import { parseMarkdownBlocks, ParsedBlock } from './markdownParser';

export function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    const imgMatch = remaining.match(/!\[(.*?)\]\((.*?)\)/);
    const linkMatch = remaining.match(/(?<!!)\[(.*?)\]\((.*?)\)/);
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    const codeMatch = remaining.match(/`(.+?)`/);

    let firstMatchIndex = Infinity;
    let matchType: 'img' | 'link' | 'bold' | 'code' | null = null;
    let matchLength = 0;
    let m1 = '';
    let m2 = '';

    if (imgMatch && imgMatch.index !== undefined && imgMatch.index < firstMatchIndex) {
      firstMatchIndex = imgMatch.index;
      matchType = 'img';
      matchLength = imgMatch[0].length;
      m1 = imgMatch[1];
      m2 = imgMatch[2];
    }
    if (linkMatch && linkMatch.index !== undefined && linkMatch.index < firstMatchIndex) {
      firstMatchIndex = linkMatch.index;
      matchType = 'link';
      matchLength = linkMatch[0].length;
      m1 = linkMatch[1];
      m2 = linkMatch[2];
    }
    if (boldMatch && boldMatch.index !== undefined && boldMatch.index < firstMatchIndex) {
      firstMatchIndex = boldMatch.index;
      matchType = 'bold';
      matchLength = boldMatch[0].length;
      m1 = boldMatch[1];
    }
    if (codeMatch && codeMatch.index !== undefined && codeMatch.index < firstMatchIndex) {
      firstMatchIndex = codeMatch.index;
      matchType = 'code';
      matchLength = codeMatch[0].length;
      m1 = codeMatch[1];
    }

    if (matchType === null) {
      parts.push(remaining);
      break;
    }

    if (firstMatchIndex > 0) {
      parts.push(remaining.slice(0, firstMatchIndex));
    }

    if (matchType === 'img') {
      // Sécurité : Blocage des images distantes pour prévenir l'exfiltration via prompt injection (§22)
      parts.push(
        <span
          key={key++}
          className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] bg-[var(--bg-user-bubble)] text-[var(--text-secondary)] border border-[var(--border-modal)]"
          title="Image distante bloquée par mesure de sécurité (anti-exfiltration)"
        >
          [Image externe bloquée]
        </span>
      );
    } else if (matchType === 'link') {
      const isDangerous = /^(javascript|data|vbscript):/i.test(m2.trim());
      if (isDangerous) {
        parts.push(<span key={key++} className="text-[var(--text-secondary)]">{m1}</span>);
      } else {
        parts.push(
          <a
            key={key++}
            href={m2}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 text-[var(--text-primary)] hover:text-white transition-colors"
          >
            {m1}
          </a>
        );
      }
    } else if (matchType === 'bold') {
      parts.push(<strong key={key++} className="font-semibold text-[var(--text-primary)]">{m1}</strong>);
    } else if (matchType === 'code') {
      parts.push(
        <code key={key++} className="font-mono text-[13px] bg-[var(--bg-user-bubble)] text-[var(--text-primary)] px-1.5 py-0.5 rounded-[4px]">
          {m1}
        </code>
      );
    }

    remaining = remaining.slice(firstMatchIndex + matchLength);
  }

  return parts;
}

interface MemoizedBlockProps {
  block: ParsedBlock;
  index: number;
  isOpen: boolean;
}

export const MemoizedBlock = React.memo(function MemoizedBlock({ block, index, isOpen }: MemoizedBlockProps) {
  if (block.type === 'code') {
    return (
      <CodeBlock
        code={block.code}
        language={block.language}
        title={block.title}
        isOpen={isOpen}
      />
    );
  }

  if (block.type === 'table') {
    if (isOpen || !block.isClosed) {
      // Une construction non fermée s'affiche en texte brut, sans erreur (règles UX U7 et Lot 4)
      return (
        <div className="space-y-1">
          {block.rawLines.map((line, lIdx) => (
            <p key={lIdx} className="leading-[1.5] font-mono text-[13px]">{renderInline(line)}</p>
          ))}
        </div>
      );
    }

    return (
      <div className="overflow-x-auto my-2 border border-[var(--border-subtle)] rounded-[var(--radius-button)]">
        <table className="w-full text-left text-[13px] border-collapse">
          <thead className="bg-[var(--bg-surface)] border-b border-[var(--border-subtle)] text-[var(--text-secondary)] font-medium">
            <tr>
              {block.headers.map((h, i) => (
                <th key={i} className="py-2 px-3">{renderInline(h.trim())}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {block.rows.map((row, rIdx) => (
              <tr key={rIdx} className="hover:bg-[var(--bg-surface-hover)]">
                {row.map((cell, cIdx) => (
                  <td key={cIdx} className="py-2 px-3 text-[var(--text-primary)]">{renderInline(cell.trim())}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const lines = block.content.split('\n');
  return (
    <>
      {lines.map((line, i) => {
        if (line.startsWith('### ')) {
          return (
            <h4 key={`${index}-${i}`} className="text-[16px] font-semibold text-[var(--text-primary)] pt-3 pb-1">
              {line.replace('### ', '')}
            </h4>
          );
        }
        if (line.startsWith('• ') || line.startsWith('- ')) {
          const text = line.replace(/^[•\-]\s*/, '');
          return (
            <div key={`${index}-${i}`} className="flex items-start gap-2 pl-1 my-0.5 leading-[1.5]">
              <span className="text-[var(--text-secondary)] select-none shrink-0 mt-1">•</span>
              <span className="flex-1">{renderInline(text)}</span>
            </div>
          );
        }
        if (!line.trim()) {
          return <div key={`${index}-${i}`} className="h-1" />;
        }
        return <p key={`${index}-${i}`} className="leading-[1.5]">{renderInline(line)}</p>;
      })}
    </>
  );
}, (prevProps, nextProps) => {
  // Règle d'or : chaque bloc terminé n'est jamais recalculé ; seul le dernier bloc, ouvert, se met à jour
  if (!prevProps.isOpen && !nextProps.isOpen) {
    if (prevProps.block === nextProps.block) return true;
    if (prevProps.block.type === nextProps.block.type) {
      if (prevProps.block.type === 'code' && nextProps.block.type === 'code') {
        return prevProps.block.code === nextProps.block.code &&
               prevProps.block.language === nextProps.block.language &&
               prevProps.block.title === nextProps.block.title &&
               prevProps.block.isClosed === nextProps.block.isClosed;
      }
      if (prevProps.block.type === 'table' && nextProps.block.type === 'table') {
        return prevProps.block.content === nextProps.block.content &&
               prevProps.block.isClosed === nextProps.block.isClosed;
      }
      if (prevProps.block.type === 'text' && nextProps.block.type === 'text') {
        return prevProps.block.content === nextProps.block.content &&
               prevProps.block.isClosed === nextProps.block.isClosed;
      }
    }
  }
  return false;
});

export interface FormattedMessageProps {
  content: string;
  isStreaming?: boolean;
}

export const FormattedMessage = React.memo(function FormattedMessage({
  content,
  isStreaming = false
}: FormattedMessageProps) {
  const blocks = useMemo(() => parseMarkdownBlocks(content), [content]);

  return (
    <div className="space-y-2">
      {blocks.map((block, bIdx) => {
        const isLast = bIdx === blocks.length - 1;
        const isBlockOpen = isLast && isStreaming && !block.isClosed;
        const contentKey = block.type === 'code' ? block.code : block.content;
        const key = `${bIdx}-${contentKey}`;

        return (
          <MemoizedBlock
            key={key}
            block={block}
            index={bIdx}
            isOpen={isBlockOpen}
          />
        );
      })}
    </div>
  );
});
