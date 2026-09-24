import React from 'react';
import { 
  X, Terminal, GitBranch, Play, Download
} from 'lucide-react';
import { DiffViewer, ChangedFileRecord } from '../agent/DiffViewer';
import { ArtifactInspector } from './ArtifactInspector';
import { ArtifactPublicInfo } from '../../services/artifacts/ArtifactService';
import { AttachmentPreviewResult } from '../../services/attachments/AttachmentService';
import { PlanStep } from '../../../server/types/events';

export type InspectorTabType = 'diff' | 'plan' | 'terminal' | 'tests' | 'preview' | 'artifacts';

export interface ChatInspectorPanelProps {
  isOpen: boolean;
  onClose: () => void;
  inspectorTab: InspectorTabType;
  setInspectorTab: (tab: InspectorTabType) => void;
  availableTabs: Array<{ id: InspectorTabType; label: string }>;
  workspaceMeta: any;
  previewData: AttachmentPreviewResult | null;
  isPreviewLoading: boolean;
  artifacts: ArtifactPublicInfo[];
  selectedArtifactId: string | null;
  onSelectArtifact: (id: string | null) => void;
  onArtifactUpdated: () => void;
  changedFiles: ChangedFileRecord[];
  planSteps: PlanStep[];
  toolExecutions: Array<{
    callId: string;
    tool: string;
    input: any;
    result?: any;
    success?: boolean;
    args?: any;
  }>;
  onRunTests: () => void;
}

export function ChatInspectorPanel({
  isOpen,
  onClose,
  inspectorTab,
  setInspectorTab,
  availableTabs,
  workspaceMeta,
  previewData,
  isPreviewLoading,
  artifacts,
  selectedArtifactId,
  onSelectArtifact,
  onArtifactUpdated,
  changedFiles,
  planSteps,
  toolExecutions,
  onRunTests
}: ChatInspectorPanelProps) {
  if (!isOpen) return null;

  return (
    <div className="w-80 h-full border-l border-[var(--border-subtle)] bg-[var(--bg-sidebar)] flex flex-col shrink-0 z-30 animate-in slide-in-from-right-10 duration-200">
      <div className="h-12 border-b border-[var(--border-subtle)] px-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide py-1">
          {availableTabs.map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setInspectorTab(tab.id)}
              className={`text-[12px] px-2 py-1 rounded transition-colors whitespace-nowrap ${
                inspectorTab === tab.id ? 'bg-[var(--bg-surface-hover)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 shrink-0 pl-1">
          {workspaceMeta?.git?.branch && (
            <span
              className="text-[11px] font-mono text-[var(--text-secondary)] px-1.5 py-0.5 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex items-center gap-1 max-w-[90px] truncate"
              title={`Branche Git\u00A0: ${workspaceMeta.git.branch}`}
            >
              <GitBranch className="w-3 h-3 shrink-0" />
              <span className="truncate">{workspaceMeta.git.branch}</span>
            </span>
          )}
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            title="Fermer l'inspecteur"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {inspectorTab === 'preview' ? (
          <div className="p-3 space-y-3 overflow-y-auto claude-scrollbar h-full text-[13px]">
            {isPreviewLoading ? (
              <div className="text-[13px] text-[var(--text-secondary)] p-4 text-center">Chargement de l'aperçu...</div>
            ) : !previewData ? (
              <div className="text-[13px] text-[var(--text-secondary)] p-4 text-center">Sélectionnez une pièce jointe pour afficher son aperçu.</div>
            ) : (
              <div className="space-y-3">
                <div className="p-3 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded-[8px] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-[var(--text-primary)] truncate max-w-[180px]" title={previewData.attachment.name}>
                      {previewData.attachment.name}
                    </span>
                    <a
                      href={`/api/attachments/${encodeURIComponent(previewData.attachment.id)}?download=1`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] transition-colors flex items-center gap-1 text-[11px]"
                      title="Télécharger le fichier brut"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Télécharger</span>
                    </a>
                  </div>
                  <div className="text-[11px] text-[var(--text-secondary)] space-y-0.5 font-mono">
                    <div>Taille{'\u00A0'}: {(previewData.attachment.size / 1024).toFixed(1)} Ko</div>
                    <div>Type{'\u00A0'}: {previewData.attachment.mimeType}</div>
                    {previewData.attachment.sha256 && (
                      <div className="truncate" title={previewData.attachment.sha256}>
                        SHA-256{'\u00A0'}: {previewData.attachment.sha256.slice(0, 16)}…
                      </div>
                    )}
                  </div>
                </div>

                {previewData.preview.error ? (
                  <div className="p-3 bg-[var(--bg-error-subtle)] border border-[var(--border-error-subtle)] rounded-[8px] text-[var(--text-primary)] text-[12px]">
                    {previewData.preview.error}
                  </div>
                ) : previewData.preview.type === 'image' ? (
                  <div className="border border-[var(--border-subtle)] rounded-[8px] overflow-hidden bg-[var(--bg-app)] p-2 flex items-center justify-center">
                    <img
                      src={`/api/attachments/${encodeURIComponent(previewData.attachment.id)}?raw=1`}
                      alt={previewData.attachment.name}
                      className="max-w-full max-h-96 object-contain rounded"
                    />
                  </div>
                ) : (
                  <div className="bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded-[8px] p-3 overflow-x-auto">
                    <pre className="font-mono text-[12px] text-[var(--text-muted)] whitespace-pre-wrap leading-relaxed select-text">
                      {previewData.preview.content || 'Aucun contenu textuel extractible.'}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : inspectorTab === 'artifacts' ? (
          <ArtifactInspector
            artifacts={artifacts}
            selectedArtifactId={selectedArtifactId}
            onSelectArtifact={onSelectArtifact}
            onArtifactUpdated={onArtifactUpdated}
          />
        ) : inspectorTab === 'diff' ? (
          <DiffViewer files={changedFiles} className="h-full" />
        ) : inspectorTab === 'plan' ? (
          <div className="p-4 space-y-2 overflow-y-auto claude-scrollbar h-full">
            {planSteps.length === 0 ? (
              <p className="text-[13px] text-[var(--text-secondary)]">Aucun plan actif.</p>
            ) : (
              planSteps.map(step => (
                <div key={step.id} className="text-[13px] text-[var(--text-primary)] flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-secondary)]" />
                  <span>{step.title}</span>
                </div>
              ))
            )}
          </div>
        ) : inspectorTab === 'terminal' ? (
          <div className="p-3 space-y-3 overflow-y-auto claude-scrollbar h-full font-mono text-[12px]">
            {toolExecutions.filter(te => te.tool === 'execute_command').length === 0 ? (
              <p className="text-[13px] text-[var(--text-secondary)] font-sans">Aucune commande exécutée pour le moment.</p>
            ) : (
              toolExecutions
                .filter(te => te.tool === 'execute_command')
                .map(te => (
                  <div key={te.callId} className="bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded p-2 space-y-1">
                    <div className="flex items-center justify-between text-[var(--text-secondary)]">
                      <div className="flex items-center gap-1.5 text-[var(--text-primary)] min-w-0">
                        <Terminal className="w-3.5 h-3.5 text-[var(--text-secondary)] shrink-0" />
                        <span className="truncate">{te.args?.command || te.tool}</span>
                      </div>
                      <span>{te.success ? '✓' : '✗'}</span>
                    </div>
                    {te.result && (
                      <pre className="text-[11px] text-[var(--text-muted)] overflow-x-auto whitespace-pre-wrap max-h-40 bg-[var(--bg-app)] p-1.5 rounded">
                        {te.result}
                      </pre>
                    )}
                  </div>
                ))
            )}
          </div>
        ) : inspectorTab === 'tests' ? (
          <div className="p-3 space-y-3 overflow-y-auto claude-scrollbar h-full font-sans">
            <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
              <span className="text-[13px] text-[var(--text-primary)] font-medium">Vérification & Tests</span>
              <button
                type="button"
                onClick={onRunTests}
                className="px-2.5 py-1 bg-[var(--bg-user-bubble)] text-[var(--text-primary)] hover:bg-[var(--bg-active)] text-[12px] rounded flex items-center gap-1.5 transition-colors"
              >
                <Play className="w-3 h-3" />
                <span>Lancer tests</span>
              </button>
            </div>
            {toolExecutions.filter(te => te.tool === 'verify_project').length === 0 ? (
              <p className="text-[13px] text-[var(--text-secondary)]">Aucun test exécuté pour le moment.</p>
            ) : (
              toolExecutions
                .filter(te => te.tool === 'verify_project')
                .map(te => (
                  <div key={te.callId} className="bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded p-2 space-y-1 text-[12px]">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[var(--text-primary)]">{te.tool}</span>
                      <span className="text-[var(--text-secondary)]">{te.success ? '✓ Succès' : '✗ Échec'}</span>
                    </div>
                    {te.result && (
                      <pre className="font-mono text-[11px] text-[var(--text-muted)] overflow-x-auto whitespace-pre-wrap max-h-40 bg-[var(--bg-app)] p-1.5 rounded">
                        {te.result}
                      </pre>
                    )}
                  </div>
                ))
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
