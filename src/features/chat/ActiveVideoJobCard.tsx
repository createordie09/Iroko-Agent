import React from 'react';
import { Film } from 'lucide-react';
import { VideoJobData } from '../../services/media/MediaService';

export interface ActiveVideoJobCardProps {
  key?: any;
  job: VideoJobData;
  onCancel: (jobId: string) => void;
}

export function ActiveVideoJobCard({ job, onCancel }: ActiveVideoJobCardProps) {
  const elapsedSec = Math.max(0, Math.floor((Date.now() - job.createdAt) / 1000));
  const mins = Math.floor(elapsedSec / 60);
  const secs = elapsedSec % 60;
  const elapsedStr = `${mins}:${secs.toString().padStart(2, '0')} écoulées`;

  return (
    <div
      className="my-3 p-3.5 bg-[var(--bg-modal)] border border-[var(--border-modal)] rounded-[8px] flex items-center justify-between gap-3 select-none"
    >
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <div className="w-8 h-8 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex items-center justify-center shrink-0">
          <Film className="w-4 h-4 text-[var(--text-secondary)] animate-pulse" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium text-[var(--text-primary)] truncate">
            Vidéo en cours de génération
          </div>
          <div className="text-[11px] text-[var(--text-secondary)] flex items-center gap-2 mt-0.5">
            <span className="truncate max-w-[200px] text-[var(--text-muted)]">{job.prompt}</span>
            <span>·</span>
            <span className="font-mono">{elapsedStr}</span>
            {typeof job.progress === 'number' && job.progress > 0 && (
              <>
                <span>·</span>
                <span className="font-mono">{job.progress}%</span>
              </>
            )}
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={() => onCancel(job.id)}
        className="px-2.5 py-1 text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] rounded-[6px] transition-colors shrink-0"
      >
        Arrêter
      </button>
    </div>
  );
}
