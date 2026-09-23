import React, { useState, useRef, useEffect } from 'react';
import { 
  FileCode, FileText, FileSpreadsheet, Download, Copy, Check, ExternalLink, Box, Archive, Image as ImageIcon, RotateCw, Paperclip, Film
} from 'lucide-react';
import { ArtifactPublicInfo, artifactService } from '../../services/artifacts/ArtifactService';
import { mediaService } from '../../services/media/MediaService';

export interface ArtifactCardProps {
  key?: React.Key;
  artifact: ArtifactPublicInfo;
  onOpen?: (artifactId: string) => void;
  onRegenerate?: (prompt: string) => void;
  onReuseAsAttachment?: (artifact: ArtifactPublicInfo) => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function getArtifactIcon(mimeType: string, filename: string) {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (mimeType.startsWith('video/') || ['mp4', 'webm', 'mov'].includes(ext || '')) {
    return <Film className="w-4 h-4 text-[var(--text-secondary)]" />;
  }
  if (mimeType.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext || '')) {
    return <ImageIcon className="w-4 h-4 text-[var(--text-secondary)]" />;
  }
  if (mimeType.includes('zip') || ext === 'zip') {
    return <Archive className="w-4 h-4 text-[var(--text-secondary)]" />;
  }
  if (mimeType.includes('csv') || mimeType.includes('spreadsheet') || ext === 'csv' || ext === 'xlsx') {
    return <FileSpreadsheet className="w-4 h-4 text-[var(--text-secondary)]" />;
  }
  if (
    mimeType.includes('word') ||
    mimeType.includes('presentation') ||
    mimeType.includes('pdf') ||
    ext === 'docx' ||
    ext === 'pptx' ||
    ext === 'pdf'
  ) {
    return <FileText className="w-4 h-4 text-[var(--text-secondary)]" />;
  }
  if (
    mimeType.includes('javascript') ||
    mimeType.includes('typescript') ||
    mimeType.includes('python') ||
    mimeType.includes('json') ||
    mimeType.includes('html') ||
    ['js', 'ts', 'py', 'json', 'html', 'css', 'sh'].includes(ext || '')
  ) {
    return <FileCode className="w-4 h-4 text-[var(--text-secondary)]" />;
  }
  if (mimeType.includes('markdown') || ext === 'md' || ext === 'txt') {
    return <FileText className="w-4 h-4 text-[var(--text-secondary)]" />;
  }
  return <Box className="w-4 h-4 text-[var(--text-secondary)]" />;
}

export function ArtifactCard({ artifact, onOpen, onRegenerate, onReuseAsAttachment }: ArtifactCardProps) {
  const [copied, setCopied] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const copyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const ext = artifact.name.split('.').pop()?.toLowerCase() || '';
  const isRasterImage = artifact.mimeType.startsWith('image/') && artifact.mimeType !== 'image/svg+xml';
  const isVideo = artifact.mimeType.startsWith('video/') || ['mp4', 'webm', 'mov'].includes(ext);
  const [streamTicket, setStreamTicket] = useState<string | null>(null);

  useEffect(() => {
    if (isVideo) {
      mediaService.getVideoStreamTicket(artifact.id).then(t => {
        if (t) setStreamTicket(t);
      }).catch(() => {});
    }
  }, [isVideo, artifact.id]);

  const downloadUrl = `/api/artifacts/${artifact.id}/download`;

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (isRasterImage) {
        // Tentative de copie binaire de l'image
        try {
          const res = await fetch(downloadUrl);
          const blob = await res.blob();
          // navigator.clipboard.write attend un PNG dans la plupart des navigateurs
          if (blob.type === 'image/png') {
            await navigator.clipboard.write([
              new ClipboardItem({ 'image/png': blob })
            ]);
            setCopied(true);
            if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
            copyTimeoutRef.current = setTimeout(() => setCopied(false), 1500);
            return;
          }
        } catch {}
      }

      // Repli texte
      let content = artifact.content;
      if (!content && !isRasterImage) {
        const full = await artifactService.getArtifact(artifact.id);
        content = full?.content || '';
      }
      const textToCopy = content || artifact.metadata?.prompt || artifact.title || artifact.name;
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDownloading(true);
    await artifactService.downloadArtifact(artifact.id, artifact.name, artifact.currentVersion);
    setIsDownloading(false);
  };

  const handleRegenerate = (e: React.MouseEvent) => {
    e.stopPropagation();
    const prompt = artifact.metadata?.prompt || artifact.title || artifact.name;
    if (onRegenerate && prompt) {
      onRegenerate(prompt);
    }
  };

  const handleReuseAttachment = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onReuseAsAttachment) {
      onReuseAsAttachment(artifact);
    }
  };

  return (
    <div
      onClick={() => onOpen?.(artifact.id)}
      className="my-2.5 p-3 rounded-[8px] bg-[var(--bg-sidebar)] border border-[var(--border-subtle)] hover:border-[var(--border-composer)] transition-colors cursor-pointer group select-none text-left"
    >
      {/* Rendu de l'image à la largeur de la colonne avec ratio préservé sans animation (Mission M6) */}
      {isRasterImage && (
        <div className="mb-2.5 w-full bg-[var(--bg-app)] rounded-[6px] border border-[var(--border-subtle)] overflow-hidden flex items-center justify-center">
          <img
            src={downloadUrl}
            alt={artifact.title || artifact.name}
            className="w-full h-auto max-h-[440px] object-contain block"
            loading="lazy"
          />
        </div>
      )}

      {/* Rendu vidéo natif sans autoplay (Mission M7) [À VALIDER] */}
      {isVideo && (
        <div className="mb-2.5 w-full bg-[var(--bg-app)] rounded-[6px] border border-[var(--border-subtle)] overflow-hidden flex items-center justify-center">
          {streamTicket ? (
            <video
              src={`/api/media/video/stream/${artifact.id}?ticket=${streamTicket}`}
              controls
              preload="metadata"
              className="w-full h-auto max-h-[440px] block"
            />
          ) : (
            <div className="py-8 text-[12px] text-[var(--text-secondary)]">Chargement du flux vidéo sécurisé...</div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        {/* En-tête gauche : Icône, Titre, Métadonnées */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="p-2 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)] shrink-0">
            {getArtifactIcon(artifact.mimeType, artifact.name)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-medium text-[13px] text-[var(--text-primary)] truncate group-hover:opacity-90 transition-opacity" title={artifact.title || artifact.name}>
              {artifact.title || artifact.name}
            </div>
            <div className="text-[11px] text-[var(--text-secondary)] truncate font-mono mt-0.5 flex items-center gap-1.5">
              <span>{artifact.name}</span>
              <span>·</span>
              <span>{formatBytes(artifact.size)}</span>
              {artifact.metadata?.model && (
                <>
                  <span>·</span>
                  <span className="text-[var(--text-secondary)]">{artifact.metadata.model}</span>
                </>
              )}
              {artifact.metadata?.seed !== undefined && (
                <>
                  <span>·</span>
                  <span>seed:{artifact.metadata.seed}</span>
                </>
              )}
              <span>·</span>
              <span className="px-1 py-0.2 rounded bg-[var(--bg-user-bubble)] text-[var(--text-muted)]">v{artifact.currentVersion}</span>
            </div>
          </div>
        </div>

        {/* Actions à droite : Ouvrir, Copier l'image, Télécharger, Régénérer, Pièce jointe */}
        <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
          {/* Action Régénérer pour les images */}
          {isRasterImage && onRegenerate && (
            <button
              type="button"
              onClick={handleRegenerate}
              className="p-1.5 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors"
              title="Régénérer cette image"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Réutiliser comme pièce jointe */}
          {isRasterImage && onReuseAsAttachment && (
            <button
              type="button"
              onClick={handleReuseAttachment}
              className="p-1.5 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors"
              title="Réutiliser comme pièce jointe"
            >
              <Paperclip className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            type="button"
            onClick={() => onOpen?.(artifact.id)}
            className="px-2 py-1 rounded text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors flex items-center gap-1"
            title="Ouvrir dans l'inspecteur"
          >
            <ExternalLink className="w-3 h-3" />
            <span>Ouvrir</span>
          </button>

          <button
            type="button"
            onClick={handleCopy}
            className="w-[62px] py-1 rounded text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors flex items-center justify-center gap-1"
            title={isRasterImage ? "Copier l'image" : "Copier le contenu"}
          >
            {copied ? (
              <>
                <Check className="w-3 h-3 text-[var(--text-primary)]" />
                <span className="text-[var(--text-primary)]">Copié</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copier</span>
              </>
            )}
            <span className="sr-only" aria-live="polite">
              {copied ? 'Artéfact copié dans le presse-papier' : ''}
            </span>
          </button>

          <button
            type="button"
            onClick={handleDownload}
            disabled={isDownloading}
            className="p-1.5 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors"
            title="Télécharger l'artéfact"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
