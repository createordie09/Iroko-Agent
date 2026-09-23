import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Download, Copy, Check, RotateCcw, FileText, FileCode, FileSpreadsheet, Box, Archive
} from 'lucide-react';
import { ArtifactPublicInfo, artifactService } from '../../services/artifacts/ArtifactService';
import { CodeBlock } from './CodeBlock';
import { parseMarkdownBlocks } from './markdownParser';

export interface ArtifactInspectorProps {
  artifacts: ArtifactPublicInfo[];
  selectedArtifactId?: string | null;
  onSelectArtifact: (id: string) => void;
  onArtifactRestored?: () => void;
  onArtifactUpdated?: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export function ArtifactInspector({
  artifacts,
  selectedArtifactId,
  onSelectArtifact,
  onArtifactRestored,
  onArtifactUpdated
}: ArtifactInspectorProps) {
  const activeArtifact = useMemo(() => {
    if (selectedArtifactId) {
      return artifacts.find(a => a.id === selectedArtifactId) || artifacts[0] || null;
    }
    return artifacts[0] || null;
  }, [artifacts, selectedArtifactId]);

  const [selectedVersion, setSelectedVersion] = useState<number>(1);
  const [content, setContent] = useState<string>('');
  const [previewData, setPreviewData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const copyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Synchroniser la version sélectionnée avec l'artéfact actif
  useEffect(() => {
    if (activeArtifact) {
      setSelectedVersion(activeArtifact.currentVersion);
    }
  }, [activeArtifact?.id, activeArtifact?.currentVersion]);

  // Charger le contenu brut ou la preview de la version sélectionnée
  useEffect(() => {
    if (!activeArtifact) {
      setContent('');
      setPreviewData(null);
      return;
    }

    let isMounted = true;
    setIsLoading(true);

    // 1. Récupération de l'aperçu structuré serveur
    artifactService.getArtifactPreview(activeArtifact.id, selectedVersion)
      .then(p => {
        if (isMounted) setPreviewData(p);
      })
      .catch(() => {
        if (isMounted) setPreviewData(null);
      });

    // 2. Récupération du contenu textuel direct si disponible
    if (selectedVersion === activeArtifact.currentVersion && activeArtifact.content !== undefined) {
      setContent(activeArtifact.content);
      setIsLoading(false);
    } else {
      artifactService.getArtifactVersion(activeArtifact.id, selectedVersion)
        .then(res => {
          if (isMounted) {
            setContent(res?.content || '');
            setIsLoading(false);
          }
        })
        .catch(() => {
          if (isMounted) {
            setContent('');
            setIsLoading(false);
          }
        });
    }

    return () => {
      isMounted = false;
    };
  }, [activeArtifact?.id, selectedVersion]);

  const handleCopy = async () => {
    const textToCopy = content || previewData?.text || '';
    if (!textToCopy) return;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const handleDownload = () => {
    if (!activeArtifact) return;
    artifactService.downloadArtifact(activeArtifact.id, activeArtifact.name, selectedVersion);
  };

  const handleDownloadAll = async () => {
    if (!activeArtifact || isDownloadingAll) return;
    setIsDownloadingAll(true);
    await artifactService.downloadAllArtifacts(activeArtifact.conversationId);
    setIsDownloadingAll(false);
  };

  const handleRestore = async () => {
    if (!activeArtifact || selectedVersion === activeArtifact.currentVersion) return;
    setIsRestoring(true);
    const restored = await artifactService.restoreVersion(activeArtifact.id, selectedVersion);
    setIsRestoring(false);
    if (restored) {
      onArtifactRestored?.();
      onArtifactUpdated?.();
    }
  };

  if (!artifacts || artifacts.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-4 text-center">
        <p className="text-[13px] text-[var(--text-secondary)]">Aucun artéfact généré dans cette discussion.</p>
      </div>
    );
  }

  if (!activeArtifact) {
    return (
      <div className="h-full flex items-center justify-center p-4 text-center">
        <p className="text-[13px] text-[var(--text-secondary)]">Sélectionnez un artéfact pour afficher son contenu.</p>
      </div>
    );
  }

  const mime = activeArtifact.mimeType.toLowerCase();
  const name = activeArtifact.name.toLowerCase();

  const isHtml = mime === 'text/html' || name.endsWith('.html') || name.endsWith('.htm');
  const isSvg = mime === 'image/svg+xml' || name.endsWith('.svg');
  const isImage = mime.startsWith('image/') && !isSvg;
  const isDocx = mime.includes('word') || name.endsWith('.docx');
  const isXlsx = mime.includes('spreadsheet') || name.endsWith('.xlsx');
  const isPptx = mime.includes('presentation') || name.endsWith('.pptx');
  const isPdf = mime === 'application/pdf' || name.endsWith('.pdf');
  const isZip = mime.includes('zip') || name.endsWith('.zip');
  const isMarkdown = mime.includes('markdown') || name.endsWith('.md');
  const isJson = mime.includes('json') || name.endsWith('.json');
  const isCsv = mime.includes('csv') || name.endsWith('.csv');

  // Rendu CSV sous forme de tableau
  const csvTable = useMemo(() => {
    if (!isCsv || !content) return null;
    const lines = content.trim().split('\n');
    if (lines.length === 0) return null;
    const rows = lines.map(line => line.split(',').map(cell => cell.trim().replace(/^["']|["']$/g, '')));
    const headers = rows[0];
    const dataRows = rows.slice(1);
    return { headers, dataRows };
  }, [isCsv, content]);

  // Rendu JSON formaté
  const formattedJson = useMemo(() => {
    if (!isJson || !content) return null;
    try {
      return JSON.stringify(JSON.parse(content), null, 2);
    } catch {
      return content;
    }
  }, [isJson, content]);

  return (
    <div className="h-full flex flex-col min-h-0 text-[13px] text-[var(--text-primary)]">
      {/* ── Barre d'actions globale (Tout télécharger) ── */}
      <div className="px-3 py-1.5 border-b border-[var(--border-subtle)] flex items-center justify-between bg-[var(--bg-app)] text-[11px]">
        <span className="text-[var(--text-secondary)] font-medium">
          {artifacts.length} artéfact{artifacts.length > 1 ? 's' : ''}
        </span>
        <button
          type="button"
          onClick={handleDownloadAll}
          disabled={isDownloadingAll}
          className="px-2 py-0.5 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] transition-colors flex items-center gap-1.5"
          title="Télécharger tous les artéfacts sous forme d'archive ZIP"
        >
          <Archive className="w-3.5 h-3.5" />
          <span>Tout télécharger (zip)</span>
        </button>
      </div>

      {/* ── Sélecteur d'artéfacts si plusieurs existent ── */}
      {artifacts.length > 1 && (
        <div className="px-3 py-2 border-b border-[var(--border-subtle)] flex items-center gap-1.5 overflow-x-auto scrollbar-hide shrink-0 bg-[var(--bg-app)]">
          {artifacts.map(art => (
            <button
              key={art.id}
              type="button"
              onClick={() => onSelectArtifact(art.id)}
              className={`px-2.5 py-1 rounded text-[12px] truncate max-w-[140px] transition-colors ${
                art.id === activeArtifact.id
                  ? 'bg-[var(--bg-surface-hover)] text-[var(--text-primary)] font-medium'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)]'
              }`}
              title={art.title || art.name}
            >
              {art.title || art.name}
            </button>
          ))}
        </div>
      )}

      {/* ── En-tête de l'artéfact actif ── */}
      <div className="p-3 border-b border-[var(--border-subtle)] space-y-2 shrink-0 bg-[var(--bg-sidebar)]">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-[13.5px] text-[var(--text-primary)] truncate" title={activeArtifact.title || activeArtifact.name}>
              {activeArtifact.title || activeArtifact.name}
            </h3>
            <div className="text-[11px] text-[var(--text-secondary)] font-mono mt-0.5 truncate">
              <span>{activeArtifact.name}</span>
              <span className="mx-1">·</span>
              <span>{formatBytes(activeArtifact.size)}</span>
              <span className="mx-1">·</span>
              <span>{activeArtifact.mimeType}</span>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {/* Bouton Copier (uniquement si contenu textuel disponible) */}
            {(content || previewData?.text) && (
              <button
                type="button"
                onClick={handleCopy}
                className="w-[62px] py-1 rounded text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] transition-colors flex items-center justify-center gap-1"
                title="Copier le contenu"
              >
                {copied ? (
                  <>
                    <Check className="w-3 h-3 text-[var(--text-primary)]" />
                    <span className="text-[var(--text-primary)]">Copié</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span>Copier</span>
                  </>
                )}
              </button>
            )}

            {/* Bouton Télécharger */}
            <button
              type="button"
              onClick={handleDownload}
              className="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] transition-colors flex items-center gap-1 text-[11px]"
              title="Télécharger le fichier"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Barre de version & Restauration */}
        <div className="flex items-center justify-between gap-2 pt-1 border-t border-[var(--border-subtle)] text-[11px]">
          <div className="flex items-center gap-1.5">
            <span className="text-[var(--text-secondary)]">Version :</span>
            <select
              value={selectedVersion}
              onChange={e => setSelectedVersion(Number(e.target.value))}
              className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded px-2 py-0.5 text-[var(--text-primary)] font-mono text-[11px] cursor-pointer focus:outline-none"
            >
              {(activeArtifact.versions || []).map(v => (
                <option key={v.version} value={v.version}>
                  v{v.version} {v.version === activeArtifact.currentVersion ? '(actuelle)' : ''} — {formatBytes(v.size)}
                </option>
              ))}
            </select>
          </div>

          {selectedVersion !== activeArtifact.currentVersion && (
            <button
              type="button"
              onClick={handleRestore}
              disabled={isRestoring}
              className="px-2 py-0.5 rounded bg-[var(--bg-active)] text-[var(--text-primary)] hover:opacity-90 transition-colors flex items-center gap-1"
              title="Restaurer cette version en tant que nouvelle version actuelle"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Restaurer</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Contenu & Aperçu Sécurisé de l'artéfact ── */}
      <div className="flex-1 min-h-0 overflow-y-auto claude-scrollbar p-3">
        {isLoading ? (
          <div className="p-4 text-center text-[var(--text-secondary)] text-[13px]">Chargement du contenu...</div>
        ) : isHtml ? (
          /* APERÇU HTML SÉCURISÉ : Iframe sandboxée SANS allow-same-origin, avec CSP sans réseau */
          <div className="space-y-2">
            <div className="text-[11px] text-[var(--text-secondary)] flex items-center justify-between">
              <span>Aperçu HTML isolé (sans accès réseau ni jeton)</span>
              <button type="button" onClick={handleDownload} className="text-[var(--text-primary)] hover:underline flex items-center gap-1">
                <Download className="w-3 h-3" /> Télécharger
              </button>
            </div>
            <iframe
              sandbox="allow-scripts"
              srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none';"><style>body{margin:12px;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;color:black;background:white;line-height:1.5;}</style></head><body>${content || previewData?.text || ''}</body></html>`}
              className="w-full h-[460px] border border-[var(--border-subtle)] rounded-[8px] bg-white text-black select-text"
              title={activeArtifact.name}
            />
          </div>
        ) : isSvg ? (
          /* APERÇU SVG SÉCURISÉ : Balise <img> obligatoire, JAMAIS inline */
          <div className="space-y-2">
            <div className="text-[11px] text-[var(--text-secondary)] flex items-center justify-between">
              <span>Aperçu vectoriel SVG (rendu en image inerte)</span>
              <button type="button" onClick={handleDownload} className="text-[var(--text-primary)] hover:underline flex items-center gap-1">
                <Download className="w-3 h-3" /> Télécharger
              </button>
            </div>
            <div className="p-4 bg-[var(--bg-sidebar)] border border-[var(--border-subtle)] rounded-[8px] flex items-center justify-center min-h-[260px]">
              <img
                src={`data:image/svg+xml;utf8,${encodeURIComponent(content || previewData?.text || '')}`}
                alt={activeArtifact.name}
                className="max-w-full max-h-[460px] object-contain select-none"
              />
            </div>
          </div>
        ) : isImage ? (
          /* APERÇU IMAGE : Balise <img> */
          <div className="space-y-2">
            <div className="text-[11px] text-[var(--text-secondary)] flex items-center justify-between">
              <span>Image {activeArtifact.name.split('.').pop()?.toUpperCase()}</span>
              <button type="button" onClick={handleDownload} className="text-[var(--text-primary)] hover:underline flex items-center gap-1">
                <Download className="w-3 h-3" /> Télécharger
              </button>
            </div>
            <div className="p-4 bg-[var(--bg-sidebar)] border border-[var(--border-subtle)] rounded-[8px] flex items-center justify-center min-h-[260px]">
              <img
                src={`/api/artifacts/${activeArtifact.id}/download?version=${selectedVersion}`}
                alt={activeArtifact.name}
                className="max-w-full max-h-[460px] object-contain rounded"
              />
            </div>
            {activeArtifact.metadata && (
              <div className="p-3 bg-[var(--bg-sidebar)] border border-[var(--border-subtle)] rounded-[8px] space-y-1.5 text-[12px]">
                {activeArtifact.metadata.prompt && (
                  <div>
                    <span className="text-[var(--text-secondary)] block text-[11px]">Prompt :</span>
                    <span className="text-[var(--text-primary)] leading-normal">{activeArtifact.metadata.prompt}</span>
                  </div>
                )}
                <div className="flex flex-wrap gap-3 pt-1 text-[11px] font-mono text-[var(--text-secondary)] border-t border-[var(--border-separator)]">
                  {activeArtifact.metadata.model && <span>Modèle: {activeArtifact.metadata.model}</span>}
                  {activeArtifact.metadata.aspectRatio && <span>Ratio: {activeArtifact.metadata.aspectRatio}</span>}
                  {activeArtifact.metadata.seed !== undefined && <span>Seed: {activeArtifact.metadata.seed}</span>}
                </div>
              </div>
            )}
          </div>
        ) : isDocx ? (
          /* APERÇU DOCX : Texte extrait via Mammoth */
          <div className="space-y-3">
            <div className="p-2.5 bg-[var(--bg-sidebar)] border border-[var(--border-subtle)] rounded-[8px] text-[11px] text-[var(--text-secondary)] flex items-center justify-between">
              <span>Document Word (.docx)</span>
              <button type="button" onClick={handleDownload} className="text-[var(--text-primary)] hover:underline flex items-center gap-1">
                <Download className="w-3 h-3" /> Télécharger (.docx)
              </button>
            </div>
            <div className="p-3.5 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded-[8px] text-[13px] leading-relaxed whitespace-pre-wrap select-text text-[var(--text-muted)]">
              {previewData?.text || 'Document Word vide ou en cours de chargement...'}
            </div>
          </div>
        ) : isXlsx ? (
          /* APERÇU XLSX : Feuilles et données via ExcelJS */
          <div className="space-y-3">
            <div className="p-2.5 bg-[var(--bg-sidebar)] border border-[var(--border-subtle)] rounded-[8px] text-[11px] text-[var(--text-secondary)] flex items-center justify-between">
              <span>Classeur Excel (.xlsx) — {previewData?.sheets?.length || 1} feuille(s)</span>
              <button type="button" onClick={handleDownload} className="text-[var(--text-primary)] hover:underline flex items-center gap-1">
                <Download className="w-3 h-3" /> Télécharger (.xlsx)
              </button>
            </div>
            {previewData?.sheets && previewData.sheets.length > 0 ? (
              <div className="space-y-3">
                {previewData.sheets.map((sheet: any, sIdx: number) => (
                  <div key={sIdx} className="space-y-1.5">
                    <div className="text-[11px] font-mono text-[var(--text-secondary)]">{sheet.name}</div>
                    <div className="overflow-x-auto border border-[var(--border-subtle)] rounded-[8px] bg-[var(--bg-app)]">
                      <table className="w-full text-left text-[12px] font-mono border-collapse">
                        <tbody>
                          {sheet.rows.map((row: any[], rIdx: number) => (
                            <tr key={rIdx} className={`border-b border-[var(--border-subtle)] last:border-b-0 ${rIdx === 0 ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] font-medium' : 'hover:bg-[var(--bg-surface-hover)] text-[var(--text-muted)]'}`}>
                              {row.map((cell: any, cIdx: number) => (
                                <td key={cIdx} className="p-2 border-r border-[var(--border-subtle)] last:border-r-0 whitespace-nowrap">
                                  {cell === null || cell === undefined ? '' : String(cell)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded-[8px] text-[var(--text-secondary)] text-center">
                Classeur Excel vide ou sans données tabulaires.
              </div>
            )}
          </div>
        ) : isPptx ? (
          /* APERÇU PPTX : Diapositives */
          <div className="space-y-3">
            <div className="p-2.5 bg-[var(--bg-sidebar)] border border-[var(--border-subtle)] rounded-[8px] text-[11px] text-[var(--text-secondary)] flex items-center justify-between">
              <span>Présentation PowerPoint (.pptx) — {previewData?.slides?.length || 0} diapositive(s)</span>
              <button type="button" onClick={handleDownload} className="text-[var(--text-primary)] hover:underline flex items-center gap-1">
                <Download className="w-3 h-3" /> Télécharger (.pptx)
              </button>
            </div>
            <div className="space-y-2">
              {(previewData?.slides || []).map((slide: any, sIdx: number) => (
                <div key={sIdx} className="p-3 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded-[8px] space-y-1">
                  <div className="text-[12px] font-medium text-[var(--text-primary)]">{slide.title || `Diapositive ${sIdx + 1}`}</div>
                  <div className="text-[12px] text-[var(--text-muted)] leading-relaxed whitespace-pre-wrap">{slide.text}</div>
                </div>
              ))}
            </div>
          </div>
        ) : isPdf ? (
          /* APERÇU PDF : Métadonnées et téléchargement */
          <div className="space-y-3">
            <div className="p-2.5 bg-[var(--bg-sidebar)] border border-[var(--border-subtle)] rounded-[8px] text-[11px] text-[var(--text-secondary)] flex items-center justify-between">
              <span>Document PDF ({previewData?.pageCount || 1} page{previewData?.pageCount > 1 ? 's' : ''})</span>
              <button type="button" onClick={handleDownload} className="text-[var(--text-primary)] hover:underline flex items-center gap-1">
                <Download className="w-3 h-3" /> Télécharger (.pdf)
              </button>
            </div>
            <div className="p-6 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded-[8px] text-center space-y-3">
              <FileText className="w-8 h-8 text-[var(--text-secondary)] mx-auto" />
              <div className="text-[13px] text-[var(--text-primary)] font-medium">{activeArtifact.title || activeArtifact.name}</div>
              <p className="text-[12px] text-[var(--text-secondary)] max-w-sm mx-auto">
                Ce document PDF est prêt. Téléchargez-le pour le consulter dans votre visionneuse préférée.
              </p>
              <button
                type="button"
                onClick={handleDownload}
                className="px-3 py-1.5 rounded bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] text-[var(--text-primary)] text-[12px] font-medium inline-flex items-center gap-1.5 transition-colors border border-[var(--border-subtle)]"
              >
                <Download className="w-3.5 h-3.5" /> Télécharger le PDF
              </button>
            </div>
          </div>
        ) : isZip ? (
          /* APERÇU ZIP : Carte d'archive */
          <div className="p-6 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded-[8px] text-center space-y-3">
            <Archive className="w-8 h-8 text-[var(--text-secondary)] mx-auto" />
            <div className="text-[13px] text-[var(--text-primary)] font-medium">{activeArtifact.title || activeArtifact.name}</div>
            <p className="text-[12px] text-[var(--text-secondary)] max-w-sm mx-auto">
              Archive ZIP compressée ({formatBytes(activeArtifact.size)}).
            </p>
            <button
              type="button"
              onClick={handleDownload}
              className="px-3 py-1.5 rounded bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] text-[var(--text-primary)] text-[12px] font-medium inline-flex items-center gap-1.5 transition-colors border border-[var(--border-subtle)]"
            >
              <Download className="w-3.5 h-3.5" /> Télécharger l'archive ZIP
            </button>
          </div>
        ) : isCsv && csvTable ? (
          <div className="overflow-x-auto border border-[var(--border-subtle)] rounded-[8px] bg-[var(--bg-app)]">
            <table className="w-full text-left text-[12px] font-mono border-collapse">
              <thead>
                <tr className="bg-[var(--bg-surface)] border-b border-[var(--border-subtle)] text-[var(--text-primary)]">
                  {csvTable.headers.map((h, i) => (
                    <th key={i} className="p-2 font-medium border-r border-[var(--border-subtle)] last:border-r-0">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {csvTable.dataRows.map((row, rIdx) => (
                  <tr key={rIdx} className="border-b border-[var(--border-subtle)] last:border-b-0 hover:bg-[var(--bg-surface-hover)] text-[var(--text-muted)]">
                    {row.map((cell, cIdx) => (
                      <td key={cIdx} className="p-2 border-r border-[var(--border-subtle)] last:border-r-0 whitespace-nowrap">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : isJson ? (
          <CodeBlock code={formattedJson || content} language="json" />
        ) : isMarkdown ? (
          <div className="space-y-2 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded-[8px] p-3 text-[13px] leading-relaxed">
            {parseMarkdownBlocks(content).map((b, idx) => {
              if (b.type === 'code') {
                return <CodeBlock key={idx} code={b.code} language={b.language} title={b.title} />;
              }
              return (
                <div key={idx} className="space-y-1.5 whitespace-pre-wrap">
                  {b.content}
                </div>
              );
            })}
          </div>
        ) : (
          <CodeBlock code={content} language={activeArtifact.name.split('.').pop()} />
        )}
      </div>
    </div>
  );
}
