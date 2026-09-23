import React, { useState } from 'react';
import { FileCode } from 'lucide-react';

export interface ChangedFileRecord {
  path: string;
  diff?: string;
  action: 'create' | 'modify' | 'delete';
}

export interface DiffViewerProps {
  files: ChangedFileRecord[];
  className?: string;
}

export function DiffViewer({ files, className = '' }: DiffViewerProps) {
  const [selectedPath, setSelectedPath] = useState<string>(files[0]?.path || '');
  const activeFile = files.find(f => f.path === selectedPath) || files[0];

  /* ── État vide : une seule ligne de texte gris, sans conteneur ── */
  if (files.length === 0) {
    return (
      <div className={`h-full flex items-center justify-center ${className}`}>
        <p className="text-[13px] text-[var(--text-secondary)]">Aucune modification pour le moment.</p>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Onglets de fichiers : défilement horizontal */}
      <div className="flex items-center gap-0.5 border-b border-[var(--border-subtle)] overflow-x-auto scrollbar-hide shrink-0" style={{ minHeight: 36 }}>
        {files.map(file => (
          <button
            key={file.path}
            type="button"
            onClick={() => setSelectedPath(file.path)}
            className={`flex items-center gap-1.5 px-3 h-9 text-[12px] font-mono whitespace-nowrap border-b-2 transition-colors ${
              activeFile?.path === file.path
                ? 'border-[var(--text-primary)] text-[var(--text-primary)]'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <span
              className="inline-block w-1.5 h-1.5"
              style={{
                background:
                  file.action === 'create' ? 'var(--text-primary)' :
                  file.action === 'delete' ? 'var(--text-tertiary)' : 'var(--text-secondary)'
              }}
            />
            <span className="truncate max-w-[140px]">{file.path}</span>
          </button>
        ))}
      </div>

      {/* Contenu du diff */}
      <div className="flex-1 overflow-auto custom-scrollbar font-mono text-[12px] bg-[var(--bg-app)] text-[var(--text-secondary)] p-3">
        {activeFile ? (
          <div>
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-[var(--border-subtle)]">
              <span className="text-[var(--text-primary)]">{activeFile.path}</span>
              <span className="text-[12px] text-[var(--text-tertiary)] uppercase">{activeFile.action}</span>
            </div>
            {activeFile.diff ? (
              <div className="space-y-0">
                {activeFile.diff.split('\n').map((line, idx) => {
                  const isAdd = line.startsWith('+');
                  const isDel = line.startsWith('-');
                  const isHeader = line.startsWith('@@') || line.startsWith('---') || line.startsWith('+++');
                  return (
                    <div
                      key={idx}
                      className={`px-1 leading-5 ${
                        isAdd ? 'text-[var(--text-primary)]' :
                        isDel ? 'text-[var(--text-tertiary)] line-through' :
                        isHeader ? 'text-[var(--text-tertiary)] font-bold' :
                        'text-[var(--text-secondary)]'
                      }`}
                    >
                      {line}
                    </div>
                  );
                })}
              </div>
            ) : (
              <span className="text-[var(--text-tertiary)]">Fichier modifié directement.</span>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
