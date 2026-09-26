import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Plus, ArrowUp, Mic, Volume2, ChevronDown, Check, Wrench, Sparkles, Paperclip, Terminal, Square, X, FileText, Folder, Download, Image as ImageIcon, Film, Columns
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { tokenService } from '../../services/security/TokenService';
import { FormattedModel, getModelCapabilities, formatModelLabel } from '../../lib/models';
import { speechService } from '../../services/speech/SpeechService';
import { attachmentService } from '../../services/attachments/AttachmentService';
import { workspaceService, RecentWorkspace } from '../../services/workspace/WorkspaceService';
import { mediaService } from '../../services/media/MediaService';
import { useModelSelection } from '../../hooks/models';
import { ModelSelectorMenu } from './ModelSelectorMenu';
import { useDraft } from '../../hooks/useDraft';
import { ComparisonBar } from './ComparisonBar';

export interface ClaudeComposerProps {
  onSend: (text: string, options?: { mode?: 'chat' | 'code'; tools?: string[]; attachmentIds?: string[]; comparisonModelBId?: string }) => void;
  onStop?: () => void;
  isLoading?: boolean;
  placeholder?: string;
  isConversation?: boolean;
  className?: string;
  conversationId?: string;
  contextUsage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    contextWindow: number;
    isEstimate: boolean;
    ratio: number;
  } | null;
}

export interface PendingAttachment {
  tempId: string;
  id?: string;
  file: File;
  name: string;
  size: number;
  status: 'uploading' | 'ready' | 'error';
  progress?: number;
  error?: string;
  previewUrl?: string;
  isImage: boolean;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export interface ToolCategoryInfo {
  id: string;
  name: string;
  modes: ('chat' | 'code')[];
  total: number;
  enabled: number;
  isFullyEnabled: boolean;
}

export function ClaudeComposer({
  onSend,
  onStop,
  isLoading = false,
  placeholder,
  isConversation = false,
  className = '',
  conversationId,
  contextUsage
}: ClaudeComposerProps) {
  const { 
    activeModel, 
    setActiveModel, 
    composerMode, 
    setComposerMode, 
    setActiveView,
    messages,
    voiceLang,
    voiceURI,
    voiceSpeed,
    activeWorkspace,
    setActiveWorkspace,
    runtimeStatus,
    runtimeConnected,
    setIsSettingsOpen,
    setActiveSettingsTab,
    modelsRefreshKey
  } = useApp();

  const capabilities = useMemo(() => getModelCapabilities(activeModel), [activeModel]);

  const [input, setInput] = useState('');
  const { clearDraft } = useDraft(conversationId, input, setInput);
  const [isToolsOpen, setIsToolsOpen] = useState(false);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [toolCategories, setToolCategories] = useState<ToolCategoryInfo[]>([]);
  const [enabledToolsCount, setEnabledToolsCount] = useState<number>(0);
  const [recentWorkspaces, setRecentWorkspaces] = useState<RecentWorkspace[]>([]);
  const [isRecentOpen, setIsRecentOpen] = useState(false);
  const [isManualPathOpen, setIsManualPathOpen] = useState(false);
  const [manualPathInput, setManualPathInput] = useState('');
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [isImageConfigured, setIsImageConfigured] = useState(false);
  const [hasImageChip, setHasImageChip] = useState(false);
  const [isVideoConfigured, setIsVideoConfigured] = useState(false);
  const [hasVideoChip, setHasVideoChip] = useState(false);
  const [isComparisonMode, setIsComparisonMode] = useState(false);
  const [comparisonModelBId, setComparisonModelBId] = useState<string>('');
  const [isComparisonAvailable, setIsComparisonAvailable] = useState(false);
  const [comparisonDisabledReason, setComparisonDisabledReason] = useState<string>(
    'Nécessite au moins deux fournisseurs d\'IA configurés avec des clés valides.'
  );

  const { groupedModels } = useModelSelection();

  const availableModelsForB = useMemo(() => {
    const list = (groupedModels || []).flatMap(g => g.tiers.flatMap(t => t.models));
    return list.filter(m => m.id !== activeModel);
  }, [groupedModels, activeModel]);

  useEffect(() => {
    if (availableModelsForB.length > 0 && (!comparisonModelBId || comparisonModelBId === activeModel)) {
      setComparisonModelBId(availableModelsForB[0].id);
    }
  }, [availableModelsForB, activeModel, comparisonModelBId]);

  const activeModelFormatted = useMemo(() => formatModelLabel(activeModel), [activeModel]);

  useEffect(() => {
    tokenService.fetch('/api/models/comparison-status')
      .then(res => res.json())
      .then(data => {
        setIsComparisonAvailable(Boolean(data?.available));
        if (data?.reason) {
          setComparisonDisabledReason(data.reason);
        }
      })
      .catch(() => {
        setIsComparisonAvailable(false);
      });
  }, [modelsRefreshKey]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const toolsMenuRef = useRef<HTMLDivElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);

  // Auto-resize textarea up to 200px
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const newH = Math.min(Math.max(textareaRef.current.scrollHeight, 24), 200);
      textareaRef.current.style.height = `${newH}px`;
    }
  }, [input]);

  // Click outside listener for dropdowns
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (toolsMenuRef.current && !toolsMenuRef.current.contains(e.target as Node)) {
        setIsToolsOpen(false);
      }
      if (modelMenuRef.current && !modelMenuRef.current.contains(e.target as Node)) {
        setIsModelDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const {
    activeModel: selectionActiveModel,
    selectedModel,
    setSelectedModel,
    composerStatus,
    isReady,
    refresh: refreshSelection
  } = useModelSelection();

  // Synchronisation avec AppContext
  useEffect(() => {
    if (selectionActiveModel && selectionActiveModel !== activeModel) {
      setActiveModel(selectionActiveModel);
    }
  }, [selectionActiveModel, activeModel, setActiveModel]);

  useEffect(() => {
    refreshSelection();
  }, [modelsRefreshKey, refreshSelection]);

  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isRecognitionSupported, setIsRecognitionSupported] = useState(false);
  const [isSynthesisSupported, setIsSynthesisSupported] = useState(false);

  useEffect(() => {
    setIsRecognitionSupported(speechService.isRecognitionSupported());
    setIsSynthesisSupported(speechService.isSynthesisSupported());
    mediaService.getSettings().then(s => {
      setIsImageConfigured(Boolean(s?.isConfigured));
    }).catch(() => setIsImageConfigured(false));
    mediaService.getVideoSettings().then(s => {
      setIsVideoConfigured(Boolean(s?.isConfigured));
    }).catch(() => setIsVideoConfigured(false));
  }, []);

  useEffect(() => {
    if (isToolsOpen) {
      mediaService.getSettings().then(s => {
        setIsImageConfigured(Boolean(s?.isConfigured));
      }).catch(() => setIsImageConfigured(false));
      mediaService.getVideoSettings().then(s => {
        setIsVideoConfigured(Boolean(s?.isConfigured));
      }).catch(() => setIsVideoConfigured(false));
    }
  }, [isToolsOpen]);

  const handleToggleDictation = () => {
    if (!isRecognitionSupported) return;
    if (isListening) {
      speechService.stopDictation();
      setIsListening(false);
    } else {
      const initialText = input;
      const started = speechService.startDictation(
        (interim) => {
          setInput(initialText ? `${initialText} ${interim}` : interim);
        },
        (final) => {
          setInput(initialText ? `${initialText} ${final}` : final);
        },
        (err) => {
          console.warn('[ClaudeComposer Dictation]', err);
          setIsListening(false);
        },
        () => {
          setIsListening(false);
        },
        voiceLang === 'English' ? 'en-US' : 'fr-FR'
      );
      if (started) {
        setIsListening(true);
      }
    }
  };

  const handleToggleSpeak = () => {
    if (!isSynthesisSupported) return;
    if (isSpeaking) {
      speechService.stopSpeaking();
      setIsSpeaking(false);
    } else {
      const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
      if (!lastAssistant || !lastAssistant.content) return;
      setIsSpeaking(true);
      speechService.speak(lastAssistant.content, {
        lang: voiceLang === 'English' ? 'en-US' : 'fr-FR',
        voiceURI,
        speed: voiceSpeed,
        onEnd: () => setIsSpeaking(false),
        onError: () => setIsSpeaking(false)
      });
    }
  };

  const fetchCategories = async () => {
    try {
      const res = await tokenService.fetch('/api/tools/categories');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.categories)) {
          setToolCategories(data.categories);
        }
      }
      const toolsRes = await tokenService.fetch('/api/tools');
      if (toolsRes.ok) {
        const tData = await toolsRes.json();
        if (typeof tData.enabledCount === 'number') {
          setEnabledToolsCount(tData.enabledCount);
        }
      }
    } catch {}
  };

  useEffect(() => {
    fetchCategories();
  }, [composerMode]);

  useEffect(() => {
    if (isToolsOpen) {
      fetchCategories();
    }
  }, [isToolsOpen]);

  const handleToggleCategory = async (catId: string, currentlyFullyEnabled: boolean) => {
    try {
      await tokenService.fetch(`/api/tools/category/${encodeURIComponent(catId)}/toggle`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !currentlyFullyEnabled })
      });
      await fetchCategories();
    } catch {}
  };

  const hasModels = isReady;
  const currentModelMeta = selectedModel;

  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList | File[]) => {
    setAttachmentError(null);
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    if (attachments.length + fileArray.length > 10) {
      setAttachmentError('Limite dépassée\u00A0: 10 fichiers maximum par message.');
      return;
    }

    const convId = conversationId || 'current';

    for (const file of fileArray) {
      if (file.size > 50 * 1024 * 1024) {
        setAttachmentError(`Le fichier "${file.name}" dépasse la limite de 50 Mo.`);
        continue;
      }

      const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const isImage = file.type.startsWith('image/');
      const previewUrl = isImage ? URL.createObjectURL(file) : undefined;

      const newPending: PendingAttachment = {
        tempId,
        file,
        name: file.name,
        size: file.size,
        status: 'uploading',
        progress: 0,
        previewUrl,
        isImage
      };

      setAttachments(prev => [...prev, newPending]);

      attachmentService.uploadAttachment(convId, file, (progress) => {
        setAttachments(prev => prev.map(a => a.tempId === tempId ? { ...a, progress } : a));
      })
        .then((uploaded) => {
          setAttachments(prev => prev.map(a => a.tempId === tempId ? { ...a, status: 'ready', id: uploaded.id } : a));
        })
        .catch((err) => {
          setAttachments(prev => prev.map(a => a.tempId === tempId ? { ...a, status: 'error', error: err.message } : a));
          setAttachmentError(err.message || 'Erreur de téléversement');
        });
    }
  };

  const removeAttachment = (tempId: string) => {
    const att = attachments.find(a => a.tempId === tempId);
    if (att && att.previewUrl) {
      URL.revokeObjectURL(att.previewUrl);
    }
    if (att && att.id) {
      attachmentService.deleteAttachment(att.id).catch(() => {});
    }
    setAttachments(prev => prev.filter(a => a.tempId !== tempId));
  };

  useEffect(() => {
    const handleAddAttachmentEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ file: File }>;
      if (customEvent.detail?.file) {
        handleFiles([customEvent.detail.file]);
      }
    };
    window.addEventListener('iroko:add-attachment', handleAddAttachmentEvent);
    return () => window.removeEventListener('iroko:add-attachment', handleAddAttachmentEvent);
  }, [attachments, conversationId]);

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      handleFiles(files);
    }
  };

  useEffect(() => {
    if (isToolsOpen && composerMode === 'code') {
      workspaceService.getRecentWorkspaces().then(setRecentWorkspaces).catch(() => {});
    }
  }, [isToolsOpen, composerMode]);

  const handlePickFolder = async () => {
    if (isLoading || runtimeStatus === 'running') {
      setWorkspaceError("Une tâche est en cours d'exécution. Veuillez arrêter la tâche avant de changer de dossier.");
      return;
    }
    setWorkspaceError(null);
    try {
      const res = await workspaceService.pickFolder();
      if (res.cancelled) return;
      if (res.error) {
        setWorkspaceError(res.error);
        return;
      }
      if (res.path) {
        const openRes = await workspaceService.openWorkspace(conversationId || 'default', res.path);
        if (openRes.success) {
          setActiveWorkspace({
            path: openRes.path,
            name: openRes.name,
            warning: openRes.warning,
            isReadOnly: openRes.lock.isReadOnly
          });
          setIsToolsOpen(false);
        } else if (openRes.error) {
          setWorkspaceError(openRes.error);
        }
      }
    } catch (err: any) {
      setWorkspaceError(err.message || 'Erreur lors de la sélection du dossier.');
    }
  };

  const handleSelectRecent = async (recPath: string) => {
    if (isLoading || runtimeStatus === 'running') {
      setWorkspaceError("Une tâche est en cours d'exécution. Veuillez arrêter la tâche avant de changer de dossier.");
      return;
    }
    setWorkspaceError(null);
    try {
      const openRes = await workspaceService.openWorkspace(conversationId || 'default', recPath);
      if (openRes.success) {
        setActiveWorkspace({
          path: openRes.path,
          name: openRes.name,
          warning: openRes.warning,
          isReadOnly: openRes.lock.isReadOnly
        });
        setIsToolsOpen(false);
        setIsRecentOpen(false);
      } else if (openRes.error) {
        setWorkspaceError(openRes.error);
      }
    } catch (err: any) {
      setWorkspaceError(err.message || 'Erreur lors de l\'ouverture du dossier.');
    }
  };

  const handleManualPathSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualPathInput.trim()) return;
    if (isLoading || runtimeStatus === 'running') {
      setWorkspaceError("Une tâche est en cours d'exécution. Veuillez arrêter la tâche avant de changer de dossier.");
      return;
    }
    setWorkspaceError(null);
    try {
      const val = await workspaceService.validatePath(manualPathInput.trim());
      if (!val.valid) {
        setWorkspaceError(val.error || 'Dossier invalide.');
        return;
      }
      const openRes = await workspaceService.openWorkspace(conversationId || 'default', val.canonicalPath);
      if (openRes.success) {
        setActiveWorkspace({
          path: openRes.path,
          name: openRes.name,
          warning: openRes.warning,
          isReadOnly: openRes.lock.isReadOnly
        });
        setManualPathInput('');
        setIsManualPathOpen(false);
        setIsToolsOpen(false);
      } else if (openRes.error) {
        setWorkspaceError(openRes.error);
      }
    } catch (err: any) {
      setWorkspaceError(err.message || 'Erreur lors de la validation du chemin.');
    }
  };

  const handleCloseWorkspace = async () => {
    try {
      await workspaceService.closeWorkspace(conversationId || 'default');
      setActiveWorkspace(null);
      setIsToolsOpen(false);
    } catch (err: any) {
      setWorkspaceError(err.message || 'Erreur lors de la fermeture du dossier.');
    }
  };

  const handleCopyTempTo = async () => {
    setWorkspaceError(null);
    try {
      const pickRes = await workspaceService.pickFolder();
      if (pickRes.cancelled || !pickRes.path) return;
      const copyRes = await workspaceService.copyTempTo(conversationId || 'default', pickRes.path);
      if (copyRes.success) {
        const openRes = await workspaceService.openWorkspace(conversationId || 'default', pickRes.path);
        if (openRes.success) {
          setActiveWorkspace({
            path: openRes.path,
            name: openRes.name,
            warning: openRes.warning,
            isReadOnly: openRes.lock.isReadOnly
          });
        }
      } else if (copyRes.error) {
        setWorkspaceError(copyRes.error);
      }
    } catch (err: any) {
      setWorkspaceError(err.message || 'Erreur lors de la copie du dossier temporaire.');
    }
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const hasText = Boolean(input.trim());
    const hasAttachments = attachments.length > 0;
    const allReady = attachments.every(a => a.status === 'ready');
    if ((!hasText && !hasAttachments && !hasImageChip && !hasVideoChip) || isLoading || !hasModels || !allReady) return;
    let text = input.trim();
    if (hasImageChip) {
      text = `[Demande de création d'image\u00A0: utilisez l'outil generate_image pour produire l'image demandée]\n${text}`;
      setHasImageChip(false);
    }
    if (hasVideoChip) {
      text = `[Demande de création de vidéo\u00A0: utilisez l'outil generate_video pour produire la vidéo demandée]\n${text}`;
      setHasVideoChip(false);
    }
    const readyAttachmentIds = attachments.filter(a => a.id).map(a => a.id!);
    clearDraft();
    setInput('');
    setAttachments([]);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    const compBId = isComparisonMode ? comparisonModelBId : undefined;
    if (isComparisonMode) {
      setIsComparisonMode(false);
    }
    onSend(text, { mode: composerMode, attachmentIds: readyAttachmentIds, comparisonModelBId: compBId });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Escape') {
      if (isToolsOpen || isModelDropdownOpen || isRecentOpen || isManualPathOpen) {
        e.preventDefault();
        e.stopPropagation();
        setIsToolsOpen(false);
        setIsModelDropdownOpen(false);
        setIsRecentOpen(false);
        setIsManualPathOpen(false);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Référence typographique normée (§ Lot 6) : "Comment puis-je vous aider aujourd'hui\u00A0?"
  const defaultPlaceholder = "Écrivez un message...";

  const maxWidth = isConversation ? 720 : 576;

  return (
    <div
      data-composer="true"
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setIsDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          handleFiles(e.dataTransfer.files);
        }
      }}
      data-field-container="true"
      className={`w-full relative transition-all duration-150 ${className}`}
      style={{
        maxWidth,
        backgroundColor: 'var(--bg-surface)',
        borderRadius: 'var(--radius-composer)',
        border: isDragging ? '1px solid var(--border-focus)' : '1px solid var(--border-composer)',
        padding: '12px 14px 10px 14px',
        boxShadow: 'none'
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            handleFiles(e.target.files);
          }
          e.target.value = '';
        }}
      />

      {/* ── Message d'erreur pièces jointes / dossier ── */}
      {(attachmentError || workspaceError) && (
        <div className="text-[12px] text-[var(--text-primary)] bg-[var(--bg-error-subtle)] border border-[var(--border-error-subtle)] rounded-[6px] px-2.5 py-1 mb-2 flex items-center justify-between">
          <span>{attachmentError || workspaceError}</span>
          <button type="button" onClick={() => { setAttachmentError(null); setWorkspaceError(null); }} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* ── Avertissement dossier personnel ── */}
      {activeWorkspace?.warning && (
        <div className="text-[12px] text-[var(--text-primary)] bg-[var(--bg-warning-subtle)] border border-[var(--border-warning-subtle)] rounded-[6px] px-2.5 py-1 mb-2">
          <span>{activeWorkspace.warning}</span>
        </div>
      )}

      {/* ── Notification de lecture seule (verrou concurrent) ── */}
      {activeWorkspace?.isReadOnly && (
        <div className="text-[12px] text-[var(--text-primary)] bg-[var(--bg-surface-hover)] border border-[var(--border-composer)] rounded-[6px] px-2.5 py-1 mb-2">
          <span>Ce dossier est ouvert en lecture seule car une autre discussion détient le verrou d'écriture.</span>
        </div>
      )}

      {/* ── Puce du projet actif, Pièces jointes, Puce Image & Puce Vidéo (M2, M3, M6 & M7) [À VALIDER] ── */}
      {(activeWorkspace || attachments.length > 0 || hasImageChip || hasVideoChip) && (
        <div className="flex flex-wrap gap-2 pb-2 mb-2 border-b border-[var(--border-modal)]">
          {/* Puce Image (Mission M6) [À VALIDER] */}
          {hasImageChip && (
            <div className="flex items-center gap-2 p-1.5 bg-[var(--bg-surface-hover)] border border-[var(--border-composer)] rounded-[8px] max-w-[240px]">
              <div className="w-8 h-8 rounded bg-[var(--bg-modal)] border border-[var(--border-composer)] flex items-center justify-center shrink-0">
                <ImageIcon className="w-4 h-4 text-[var(--text-primary)]" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[12px] font-medium text-[var(--text-primary)] truncate">Créer une image</div>
                <div className="text-[11px] text-[var(--text-secondary)] truncate">Orientation generate_image</div>
              </div>
              <button
                type="button"
                onClick={() => setHasImageChip(false)}
                className="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-composer)] transition-colors tap-target-24"
                title="Retirer la puce image"
                aria-label="Retirer la puce image"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Puce Vidéo (Mission M7) [À VALIDER] */}
          {hasVideoChip && (
            <div className="flex items-center gap-2 p-1.5 bg-[var(--bg-surface-hover)] border border-[var(--border-composer)] rounded-[8px] max-w-[240px]">
              <div className="w-8 h-8 rounded bg-[var(--bg-modal)] border border-[var(--border-composer)] flex items-center justify-center shrink-0">
                <Film className="w-4 h-4 text-[var(--text-primary)]" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[12px] font-medium text-[var(--text-primary)] truncate">Créer une vidéo</div>
                <div className="text-[11px] text-[var(--text-secondary)] truncate">Orientation generate_video</div>
              </div>
              <button
                type="button"
                onClick={() => setHasVideoChip(false)}
                className="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-composer)] transition-colors tap-target-24"
                title="Retirer la puce vidéo"
                aria-label="Retirer la puce vidéo"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Puce Projet */}
          {activeWorkspace && (
            <div
              className="flex items-center gap-2 p-1.5 bg-[var(--bg-surface-hover)] border border-[var(--border-composer)] rounded-[8px] max-w-[280px]"
            >
              <div className="w-8 h-8 rounded bg-[var(--bg-modal)] border border-[var(--border-composer)] flex items-center justify-center shrink-0">
                <Folder className="w-4 h-4 text-[var(--text-secondary)]" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[12px] font-medium text-[var(--text-primary)] truncate" title={activeWorkspace.path}>
                  {activeWorkspace.name}
                </div>
                <div className="text-[11px] text-[var(--text-secondary)] truncate">
                  {activeWorkspace.isTemp
                    ? 'Espace temporaire'
                    : (activeWorkspace.isReadOnly ? 'Lecture seule' : 'Projet actif')}
                </div>
              </div>
              {activeWorkspace.isTemp && (
                <button
                  type="button"
                  onClick={handleCopyTempTo}
                  className="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-composer)] transition-colors tap-target-24"
                  title="Copier vers un dossier du PC"
                  aria-label="Copier vers un dossier du PC"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={handleCloseWorkspace}
                className="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-composer)] transition-colors tap-target-24"
                title="Fermer le projet"
                aria-label="Fermer le projet"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Pièces jointes M2 */}
          {attachments.map(att => (
            <div
              key={att.tempId}
              className="flex items-center gap-2 p-1.5 bg-[var(--bg-surface-hover)] border border-[var(--border-composer)] rounded-[8px] max-w-[220px]"
            >
              {att.isImage && att.previewUrl ? (
                <img
                  src={att.previewUrl}
                  alt={att.name}
                  className="w-8 h-8 rounded object-cover shrink-0"
                />
              ) : (
                <div className="w-8 h-8 rounded bg-[var(--bg-modal)] border border-[var(--border-composer)] flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4 text-[var(--text-secondary)]" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="text-[12px] font-medium text-[var(--text-primary)] truncate" title={att.name}>
                  {att.name}
                </div>
                <div className="text-[11px] text-[var(--text-secondary)]">
                  {formatFileSize(att.size)} • {att.status === 'uploading' ? `${att.progress || 0}%` : att.status === 'error' ? 'Erreur' : 'Prêt'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => removeAttachment(att.tempId)}
                className="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-composer)] transition-colors tap-target-24"
                title="Supprimer la pièce jointe"
                aria-label={`Supprimer la pièce jointe ${att.name}`}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Ligne Runtime Hors Ligne (§ Mission M8.2) ── */}
      {!runtimeConnected && (
        <div className="pb-2 text-[12px] text-[var(--text-secondary)] flex items-center gap-2 select-none border-b border-[var(--border-subtle)] mb-2">
          <span>Runtime hors ligne — tentative de reconnexion...</span>
        </div>
      )}

      {/* ── Bandeau de Comparaison de deux modèles (Mission R4d) [À VALIDER] ── */}
      {isComparisonMode && (
        <ComparisonBar
          modelAName={activeModelFormatted.name}
          modelBId={comparisonModelBId}
          availableModels={availableModelsForB}
          onSelectModelB={(id) => setComparisonModelBId(id)}
          onClose={() => setIsComparisonMode(false)}
        />
      )}

      {/* ── Ligne 1 : Zone de saisie ── */}
      <textarea
        ref={textareaRef}
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        placeholder={!runtimeConnected ? "En attente de connexion au runtime local..." : (placeholder || defaultPlaceholder)}
        aria-label="Message"
        disabled={!runtimeConnected}
        aria-disabled={!runtimeConnected}
        rows={1}
        className={`w-full bg-transparent resize-none outline-none text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)] text-[var(--font-size-composer,14px)] leading-[1.5] claude-scrollbar composer-textarea ${!runtimeConnected ? 'opacity-50 cursor-not-allowed' : ''}`}
        style={{
          minHeight: 24,
          maxHeight: 200,
          border: 'none',
          padding: 0
        }}
      />

      {/* ── Ligne 2 : Barre d'outils alignée avec le texte ── */}
      <div className="flex items-center justify-between pt-2.5 mt-1 select-none">
        
        {/* Gauche : Bouton '+' et contrôle segmenté [ Chat | Code ] */}
        <div className="flex items-center gap-2">
          {/* Menu '+' */}
          <div className="relative" ref={toolsMenuRef}>
            <button
              type="button"
              onClick={() => setIsToolsOpen(!isToolsOpen)}
              aria-label="Options d'ajout et gestion des outils"
              aria-expanded={isToolsOpen}
              className="w-6 h-6 rounded-full flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-active)] transition-colors tap-target-24"
              title={`Ajouter du contenu ou activer des outils (${enabledToolsCount})`}
            >
              <Plus className="w-4 h-4" />
            </button>

            {isToolsOpen && (
              <div
                className="absolute bottom-[calc(100%+8px)] left-0 w-64 bg-[var(--bg-modal)] border border-[var(--border-modal)] rounded-[10px] py-1 z-50"
              >
                <div className="text-[11px] text-[var(--text-secondary)] px-3 py-1 font-medium">Contenu</div>
                
                {/* Ajouter des fichiers */}
                <button
                  type="button"
                  onClick={() => {
                    fileInputRef.current?.click();
                    setIsToolsOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-[13px] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors text-left"
                >
                  <Paperclip className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                  <span>Ajouter des fichiers</span>
                </button>

                {/* Créer une image (Mission M6) [À VALIDER] */}
                {isImageConfigured ? (
                  <button
                    type="button"
                    onClick={() => {
                      setHasImageChip(true);
                      setIsToolsOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-[13px] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors text-left"
                  >
                    <ImageIcon className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                    <span>Créer une image</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={true}
                    aria-disabled={true}
                    title="Configurez un fournisseur d'images dans Paramètres › Fournisseurs & Clés"
                    className="w-full flex items-center justify-between px-3 py-1.5 text-[13px] text-[var(--text-tertiary)] opacity-40 cursor-not-allowed text-left"
                  >
                    <div className="flex items-center gap-2">
                      <ImageIcon className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />
                      <span>Créer une image</span>
                    </div>
                    <span className="text-[11px] text-[var(--text-tertiary)]">À configurer</span>
                  </button>
                )}

                {/* Créer une vidéo (Mission M7) [À VALIDER] */}
                {isVideoConfigured ? (
                  <button
                    type="button"
                    onClick={() => {
                      setHasVideoChip(true);
                      setIsToolsOpen(false);
                      if (textareaRef.current) textareaRef.current.focus();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-[13px] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors text-left"
                  >
                    <Film className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                    <span>Créer une vidéo</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={true}
                    aria-disabled={true}
                    title="Configurez un fournisseur de vidéos dans Paramètres › Fournisseurs & Clés"
                    className="w-full flex items-center justify-between px-3 py-1.5 text-[13px] text-[var(--text-tertiary)] opacity-40 cursor-not-allowed text-left"
                  >
                    <div className="flex items-center gap-2">
                      <Film className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />
                      <span>Créer une vidéo</span>
                    </div>
                    <span className="text-[11px] text-[var(--text-tertiary)]">À configurer</span>
                  </button>
                )}

                {/* Comparer deux modèles (Mission R4d) [À VALIDER] */}
                {isComparisonAvailable ? (
                  <button
                    type="button"
                    onClick={() => {
                      setIsComparisonMode(true);
                      setIsToolsOpen(false);
                      if (textareaRef.current) textareaRef.current.focus();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-[13px] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors text-left"
                  >
                    <Columns className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                    <span>Comparer deux modèles</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={true}
                    aria-disabled={true}
                    title={comparisonDisabledReason}
                    className="w-full flex items-center justify-between px-3 py-1.5 text-[13px] text-[var(--text-tertiary)] opacity-40 cursor-not-allowed text-left"
                  >
                    <div className="flex items-center gap-2">
                      <Columns className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />
                      <span>Comparer deux modèles</span>
                    </div>
                    <span className="text-[11px] text-[var(--text-tertiary)]">À configurer</span>
                  </button>
                )}

                {/* Ouvrir un dossier… (Mode Code uniquement) [À VALIDER] */}
                {composerMode === 'code' ? (
                  <div>
                    <button
                      type="button"
                      onClick={handlePickFolder}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-[13px] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors text-left"
                    >
                      <Folder className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                      <span>Ouvrir un dossier…</span>
                    </button>

                    {/* Sous-menu Récents */}
                    {recentWorkspaces.length > 0 && (
                      <div className="px-3 py-1">
                        <button
                          type="button"
                          onClick={() => setIsRecentOpen(!isRecentOpen)}
                          className="w-full flex items-center justify-between text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] py-0.5"
                        >
                          <span>Récents ({recentWorkspaces.length})</span>
                          <ChevronDown className={`w-3 h-3 transition-transform ${isRecentOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {isRecentOpen && (
                          <div className="space-y-0.5 pt-1 pl-2 border-l border-[var(--border-modal)] my-1">
                            {recentWorkspaces.map(rw => (
                              <button
                                key={rw.path}
                                type="button"
                                onClick={() => handleSelectRecent(rw.path)}
                                className="w-full flex items-center gap-1.5 py-1 text-[12px] text-[var(--text-muted)] hover:text-[var(--text-primary)] truncate text-left"
                                title={rw.path}
                              >
                                <Folder className="w-3 h-3 text-[var(--text-secondary)] shrink-0" />
                                <span className="truncate">{rw.name}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Saisir un chemin… */}
                    <div className="px-3 py-1">
                      <button
                        type="button"
                        onClick={() => setIsManualPathOpen(!isManualPathOpen)}
                        className="text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] py-0.5 block text-left"
                      >
                        Saisir un chemin…
                      </button>
                      {isManualPathOpen && (
                        <form onSubmit={handleManualPathSubmit} className="pt-1">
                          <input
                            type="text"
                            value={manualPathInput}
                            onChange={e => setManualPathInput(e.target.value)}
                            placeholder="Chemin du dossier..."
                            className="w-full bg-[var(--bg-app)] border border-[var(--border-composer)] rounded px-2 py-1 text-[12px] text-[var(--text-primary)] outline-none"
                            autoFocus
                          />
                        </form>
                      )}
                    </div>

                    {/* Fermer le projet */}
                    {activeWorkspace && (
                      <button
                        type="button"
                        onClick={handleCloseWorkspace}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors text-left"
                      >
                        <X className="w-3 h-3 text-[var(--text-secondary)]" />
                        <span>Fermer le projet</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={true}
                    aria-disabled={true}
                    title="Passez en mode Code"
                    className="w-full flex items-center justify-between px-3 py-1.5 text-[13px] text-[var(--text-tertiary)] opacity-40 cursor-not-allowed text-left"
                  >
                    <div className="flex items-center gap-2">
                      <Folder className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />
                      <span>Ouvrir un dossier…</span>
                    </div>
                    <span className="text-[11px] text-[var(--text-tertiary)]">Passez en mode Code</span>
                  </button>
                )}

                <div className="border-t border-[var(--border-modal)] my-1" />
                <div className="text-[11px] text-[var(--text-secondary)] px-3 py-1 font-medium">
                  Outils ({toolCategories.filter(cat => cat.modes.includes(composerMode) && cat.enabled > 0).length})
                </div>
                {toolCategories
                  .filter(cat => cat.modes.includes(composerMode))
                  .map(cat => (
                    <div
                      key={cat.id}
                      className="w-full flex items-center justify-between px-3 py-1.5 text-[13px] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
                        <span className="truncate">{cat.name}</span>
                        <span className="text-[11px] text-[var(--text-secondary)] font-mono shrink-0">
                          {cat.enabled}/{cat.total}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleToggleCategory(cat.id, cat.isFullyEnabled)}
                        className={`w-7 h-4 rounded-full relative transition-colors shrink-0 ${
                          cat.enabled > 0 ? 'bg-[var(--text-primary)]' : 'bg-[var(--bg-active)]'
                        }`}
                        aria-label={`Activer ou désactiver la catégorie ${cat.name}`}
                      >
                        <span
                          className={`w-3 h-3 rounded-full absolute top-0.5 transition-all ${
                            cat.enabled > 0 ? 'right-0.5 bg-[var(--bg-app)]' : 'left-0.5 bg-[var(--text-secondary)]'
                          }`}
                        />
                      </button>
                    </div>
                  ))}

                <div className="border-t border-[var(--border-modal)] my-1" />
                <button
                  type="button"
                  onClick={() => {
                    setIsToolsOpen(false);
                    setActiveSettingsTab('capabilities');
                    setIsSettingsOpen(true);
                  }}
                  className="w-full flex items-center justify-between px-3 py-1.5 text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors text-left"
                >
                  <span>Gérer dans Capacités</span>
                  <span className="text-[11px] text-[var(--text-tertiary)]">→</span>
                </button>
              </div>
            )}
          </div>

          {/* Contrôle segmenté : [ Chat | Code ] (Captures 1 et 3) */}
          <div role="group" aria-label="Mode" className="flex items-center bg-[var(--bg-segment)] p-0.5 rounded-[var(--radius-pill)] border border-[var(--border-subtle)]">
            <button
              type="button"
              onClick={() => setComposerMode('chat')}
              aria-pressed={composerMode === 'chat'}
              className={`px-2.5 py-0.5 text-[12px] font-medium rounded-[var(--radius-pill)] transition-all tap-target-24 ${
                composerMode === 'chat'
                  ? 'bg-[var(--bg-active)] text-[var(--text-primary)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              Chat
            </button>
            <button
              type="button"
              onClick={() => setComposerMode('code')}
              aria-pressed={composerMode === 'code'}
              className={`px-2.5 py-0.5 text-[12px] font-medium rounded-[var(--radius-pill)] transition-all tap-target-24 ${
                composerMode === 'code'
                  ? 'bg-[var(--bg-active)] text-[var(--text-primary)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              Code
            </button>
          </div>
        </div>

        {/* Droite : Sélecteur de modèle + Micro / Dictée OU Bouton d'envoi */}
        <div className="flex items-center gap-2">
          
          {/* Sélecteur de modèle discret */}
          <div className="relative" ref={modelMenuRef}>
            <button
              type="button"
              onClick={() => {
                if (isReady) setIsModelDropdownOpen(!isModelDropdownOpen);
              }}
              disabled={!isReady}
              aria-disabled={!isReady}
              className={`flex items-center gap-1 text-[13px] transition-colors tap-target-24 ${
                isReady
                  ? 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer'
                  : 'text-[var(--text-tertiary)] cursor-not-allowed opacity-60'
              }`}
              title={
                !isReady
                  ? "Aucun modèle disponible — configurez une clé d'API dans les Paramètres"
                  : "Sélectionner un modèle"
              }
            >
              <span>{selectedModel ? selectedModel.name : 'Sélectionner un modèle'}</span>
              <ChevronDown className="w-3.5 h-3.5 opacity-60" />
            </button>

            <ModelSelectorMenu
              isOpen={isModelDropdownOpen && isReady}
              onClose={() => setIsModelDropdownOpen(false)}
              activeModelId={selectedModel?.id || activeModel}
              onSelectModel={(id) => {
                setActiveModel(id);
                setSelectedModel(id);
              }}
              onOpenManageModels={() => {
                setIsSettingsOpen(true);
                setActiveSettingsTab('providers');
              }}
              attachments={attachments}
              composerMode={composerMode}
            />
          </div>

          {/* Icônes Voix / Micro OU Bouton d'envoi OU Bouton d'arrêt si flux en cours */}
          {isLoading ? (
            <button
              type="button"
              onClick={() => {
                window.dispatchEvent(new CustomEvent('iroko:task-cancelled'));
                onStop?.();
              }}
              aria-label="Arrêter la génération"
              className="w-7 h-7 rounded-full flex items-center justify-center transition-all shrink-0 bg-[var(--text-primary)] text-[var(--bg-app)] hover:opacity-90 cursor-pointer tap-target-24"
              title="Arrêter la réponse"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
            </button>
          ) : (input.trim() || attachments.length > 0) ? (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!runtimeConnected || !isReady || attachments.some(a => a.status === 'uploading')}
              aria-disabled={!runtimeConnected || !isReady || attachments.some(a => a.status === 'uploading')}
              aria-label="Envoyer le message"
              aria-description={
                !runtimeConnected
                  ? "Runtime hors ligne — reconnexion continue..."
                  : !isReady
                  ? "Fournisseur non prêt. Consultez les indications sous le champ."
                  : attachments.some(a => a.status === 'uploading')
                  ? "Téléversement en cours..."
                  : undefined
              }
              className={`w-7 h-7 rounded-full flex items-center justify-center transition-all shrink-0 tap-target-24 ${
                runtimeConnected && isReady && !attachments.some(a => a.status === 'uploading')
                  ? 'bg-[var(--text-primary)] text-[var(--bg-app)] hover:opacity-90 cursor-pointer'
                  : 'bg-[var(--bg-active)] text-[var(--text-secondary)] opacity-40 cursor-not-allowed'
              }`}
              title={
                !runtimeConnected
                  ? "Runtime hors ligne — reconnexion continue..."
                  : !isReady
                  ? "Fournisseur non prêt. Consultez les indications sous le champ."
                  : attachments.some(a => a.status === 'uploading')
                  ? "Téléversement en cours..."
                  : "Envoyer (Entrée)"
              }
            >
              <ArrowUp className="w-4 h-4 stroke-[2.5]" />
            </button>
          ) : (
            <div className="flex items-center gap-1 text-[var(--text-secondary)]">
              <button
                type="button"
                onClick={handleToggleDictation}
                disabled={!isRecognitionSupported}
                aria-disabled={!isRecognitionSupported}
                aria-label={isListening ? "Arrêter la saisie vocale" : "Saisie vocale"}
                aria-description={!isRecognitionSupported ? "Saisie vocale non prise en charge par ce navigateur" : undefined}
                className={`p-1 rounded transition-colors tap-target-24 ${
                  !isRecognitionSupported
                    ? 'opacity-40 cursor-not-allowed'
                    : isListening
                    ? 'bg-[var(--bg-active)] text-[var(--text-primary)] cursor-pointer'
                    : 'opacity-40 hover:opacity-100 hover:text-[var(--text-primary)] hover:bg-[var(--bg-active)] cursor-pointer'
                }`}
                title={
                  !isRecognitionSupported
                    ? "Saisie vocale non prise en charge par ce navigateur"
                    : isListening
                    ? "Arrêter la saisie vocale"
                    : "Saisie vocale (Micro)"
                }
              >
                <Mic className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleToggleSpeak}
                disabled={!isSynthesisSupported}
                aria-disabled={!isSynthesisSupported}
                aria-label={isSpeaking ? "Arrêter la lecture" : "Lecture de la dernière réponse"}
                aria-description={!isSynthesisSupported ? "Synthèse vocale non prise en charge par ce navigateur" : undefined}
                className={`p-1 rounded transition-colors tap-target-24 ${
                  !isSynthesisSupported
                    ? 'opacity-40 cursor-not-allowed'
                    : isSpeaking
                    ? 'bg-[var(--bg-active)] text-[var(--text-primary)] cursor-pointer'
                    : 'opacity-40 hover:opacity-100 hover:text-[var(--text-primary)] hover:bg-[var(--bg-active)] cursor-pointer'
                }`}
                title={
                  !isSynthesisSupported
                    ? "Synthèse vocale non prise en charge par ce navigateur"
                    : isSpeaking
                    ? "Arrêter la lecture"
                    : "Lecture de la dernière réponse"
                }
              >
                <Volume2 className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

      </div>

      {/* État 1 : Chargement du catalogue en cours */}
      {composerStatus.type === 'loading' && (
        <div className="text-[11px] text-[var(--text-tertiary)] pt-2 border-t border-[var(--border-subtle)] mt-2 select-none" role="status" aria-live="polite">
          Chargement…
        </div>
      )}

      {/* État 2 : Erreur réseau lors du chargement */}
      {composerStatus.type === 'error' && (
        <div className="text-[11px] text-[var(--text-secondary)] pt-2 border-t border-[var(--border-subtle)] mt-2 select-none flex items-center justify-between" role="alert">
          <span>Impossible de charger le catalogue : {composerStatus.message}</span>
          <button
            type="button"
            onClick={composerStatus.onRetry}
            className="underline hover:text-[var(--text-primary)] transition-colors cursor-pointer ml-2"
          >
            Réessayer
          </button>
        </div>
      )}

      {/* État 3 : Aucun fournisseur configuré */}
      {composerStatus.type === 'no_provider' && (
        <div className="text-[11px] text-[var(--text-secondary)] pt-2 border-t border-[var(--border-subtle)] mt-2 select-none" role="status">
          Ajoutez une clé API dans{' '}
          <button
            type="button"
            className="underline hover:text-[var(--text-primary)] transition-colors cursor-pointer"
            onClick={() => { setIsSettingsOpen(true); setActiveSettingsTab('providers'); }}
          >
            Paramètres
          </button>
          {' '}› Fournisseurs & Clés
        </div>
      )}

      {/* État 4 : Modèle indisponible avec proposition */}
      {composerStatus.type === 'unavailable' && (
        <div className="text-[11px] text-[var(--text-secondary)] pt-2 border-t border-[var(--border-subtle)] mt-2 select-none flex items-center justify-between" role="alert">
          <span>Le modèle sélectionné n'est plus disponible. Proposition : {composerStatus.proposedModel.name}</span>
          <button
            type="button"
            onClick={() => {
              composerStatus.onAcceptProposal();
              setActiveModel(composerStatus.proposedModel.id);
            }}
            className="underline hover:text-[var(--text-primary)] transition-colors cursor-pointer ml-2"
          >
            Utiliser ce modèle
          </button>
        </div>
      )}

      {/* État 4 : hasModels = true → rien à afficher */}

      {/* Ligne de contexte utilisé (Mission M8.3 P7) [À VALIDER] */}
      {contextUsage && contextUsage.ratio >= 0.60 && (
        <div className="text-[12px] text-[var(--text-secondary)] pt-2 px-1 select-none flex items-center justify-between border-t border-[var(--border-subtle)] mt-2">
          <span>
            Contexte : {contextUsage.isEstimate ? '≈ ' : ''}{Math.round(contextUsage.ratio * 100)} %
          </span>
          <span className="text-[11px] text-[var(--text-tertiary)]">
            {contextUsage.totalTokens.toLocaleString()} / {contextUsage.contextWindow.toLocaleString()} tokens
          </span>
        </div>
      )}
    </div>
  );
}
