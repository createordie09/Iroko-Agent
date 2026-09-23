import React, { useRef, useEffect, useState, useMemo } from 'react';
import { 
  ChevronRight, ChevronDown, Copy, Check, RotateCcw, 
  Share, X, Terminal, GitBranch, Play, CheckCircle2, Layers, FileCode, Paperclip, Download, Film,
  Trash2, Edit2
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { ClaudeComposer } from '../../components/composer/ClaudeComposer';
import { agentClient } from '../../lib/agent-client';
import { AgentEvent, PlanStep, PermissionRequest } from '../../../server/types/events';
import { formatModelLabel } from '../../lib/models';
import { DiffViewer, ChangedFileRecord } from '../agent/DiffViewer';
import { PermissionPrompt } from '../agent/PermissionPrompt';
import { notificationService } from '../../services/notification/NotificationService';
import { tokenService } from '../../services/security/TokenService';
import { attachmentService, AttachmentPreviewResult, AttachmentPublicInfo } from '../../services/attachments/AttachmentService';
import { artifactService, ArtifactPublicInfo } from '../../services/artifacts/ArtifactService';
import { mediaService, VideoJobData } from '../../services/media/MediaService';
import { CodeBlock } from './CodeBlock';
import { parseMarkdownBlocks } from './markdownParser';
import { ArtifactCard } from './ArtifactCard';
import { ArtifactInspector } from './ArtifactInspector';
import { useStreamBuffer } from '../../hooks/useStreamBuffer';

function FormattedMessage({ content }: { content: string }) {
  const blocks = parseMarkdownBlocks(content);

  return (
    <div className="space-y-2">
      {blocks.map((block, bIdx) => {
        if (block.type === 'code') {
          return (
            <CodeBlock
              key={bIdx}
              code={block.code}
              language={block.language}
              title={block.title}
            />
          );
        }

        const lines = block.content.split('\n');
        return lines.map((line, i) => {
          if (line.startsWith('### ')) {
            return (
              <h4 key={`${bIdx}-${i}`} className="text-[16px] font-semibold text-[var(--text-primary)] pt-3 pb-1">
                {line.replace('### ', '')}
              </h4>
            );
          }
          if (line.startsWith('• ') || line.startsWith('- ')) {
            const text = line.replace(/^[•\-]\s*/, '');
            return (
              <div key={`${bIdx}-${i}`} className="flex items-start gap-2 pl-1">
                <span className="text-[var(--text-secondary)] select-none shrink-0 mt-1">•</span>
                <span className="flex-1">{renderInline(text)}</span>
              </div>
            );
          }
          if (!line.trim()) {
            return <div key={`${bIdx}-${i}`} className="h-1" />;
          }
          return <p key={`${bIdx}-${i}`} className="leading-[1.65]">{renderInline(line)}</p>;
        });
      })}
    </div>
  );
}

function renderInline(text: string): React.ReactNode {
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

export function ClaudeChat() {
  const {
    messages,
    setMessages,
    chatStatus,
    setChatStatus,
    conversationFont,
    activeModel,
    history,
    notificationsEnabled,
    composerMode
  } = useApp();

  const [thinkingLogs, setThinkingLogs] = useState<string[]>([]);
  const [isThinkingOpen, setIsThinkingOpen] = useState(false);
  const {
    streamContent: currentAssistantStream,
    appendDelta: appendStreamDelta,
    flushImmediately: flushStreamImmediately,
    reset: resetStreamBuffer
  } = useStreamBuffer();
  const [ariaLiveSentence, setAriaLiveSentence] = useState('');
  const announcedIndexRef = useRef(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  // Suivi de l'utilisation du contexte (Mission M8.3, Pilier P7) [À VALIDER]
  const [contextUsage, setContextUsage] = useState<{
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    contextWindow: number;
    isEstimate: boolean;
    ratio: number;
  } | null>(null);

  // Actions sur les messages (Mission M8.3, Pilier P4) [À VALIDER]
  const [deleteConfirmMessage, setDeleteConfirmMessage] = useState<{ message: any; index: number } | null>(null);
  const [isDeletingMessage, setIsDeletingMessage] = useState(false);
  const [editModalData, setEditModalData] = useState<{
    message: any;
    index: number;
    content: string;
    impact?: { subsequentCount: number; filesWereModified: boolean; modifiedFiles: string[] };
  } | null>(null);
  const [isCheckingImpact, setIsCheckingImpact] = useState(false);

  // Agent Steps & Diffs (Inspector Panel)
  const [planSteps, setPlanSteps] = useState<PlanStep[]>([]);
  const [changedFiles, setChangedFiles] = useState<ChangedFileRecord[]>([]);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<'diff' | 'plan' | 'terminal' | 'tests' | 'preview' | 'artifacts'>(
    composerMode === 'code' ? 'diff' : 'artifacts'
  );
  const [selectedAttachmentId, setSelectedAttachmentId] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<AttachmentPreviewResult | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [attachmentsMap, setAttachmentsMap] = useState<Record<string, AttachmentPublicInfo>>({});

  // Artéfacts texte (Mission M4)
  const [artifacts, setArtifacts] = useState<ArtifactPublicInfo[]>([]);
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);

  // Tool executions & permissions in chat
  const [toolExecutions, setToolExecutions] = useState<Array<{
    callId: string;
    tool: string;
    input: any;
    result?: any;
    success?: boolean;
    error?: string;
  }>>([]);
  const [pendingPermission, setPendingPermission] = useState<PermissionRequest | null>(null);
  const [workspaceMeta, setWorkspaceMeta] = useState<any>(null);

  // Onglets disponibles selon le mode et le contenu réel (Mission M8.1)
  const availableTabs = useMemo(() => {
    const tabs: Array<{ id: 'diff' | 'plan' | 'terminal' | 'tests' | 'preview' | 'artifacts'; label: string }> = [];

    if (selectedAttachmentId || previewData) {
      tabs.push({ id: 'preview', label: 'Aperçu' });
    }

    if (composerMode === 'code') {
      if (changedFiles.length > 0) {
        tabs.push({ id: 'diff', label: `Modifications (${changedFiles.length})` });
      }
      if (planSteps.length > 0) {
        tabs.push({ id: 'plan', label: `Plan (${planSteps.length})` });
      }
      if (artifacts.length > 0) {
        tabs.push({ id: 'artifacts', label: `Artéfacts (${artifacts.length})` });
      }
      if (toolExecutions.some(te => te.tool === 'execute_command')) {
        tabs.push({ id: 'terminal', label: 'Terminal' });
      }
      if (toolExecutions.some(te => te.tool === 'verify_project' || te.input?.command?.includes('test'))) {
        tabs.push({ id: 'tests', label: 'Tests' });
      }
      if (tabs.length === 0) {
        tabs.push({ id: 'artifacts', label: 'Artéfacts' });
      }
    } else {
      // Mode Chat : Artéfacts (et Aperçu si présent) seulement, aucun compteur (0)
      tabs.push({
        id: 'artifacts',
        label: artifacts.length > 0 ? `Artéfacts (${artifacts.length})` : 'Artéfacts'
      });
    }

    return tabs;
  }, [composerMode, selectedAttachmentId, previewData, changedFiles.length, planSteps.length, artifacts.length, toolExecutions]);

  useEffect(() => {
    if (availableTabs.length > 0 && !availableTabs.some(t => t.id === inspectorTab)) {
      setInspectorTab(availableTabs[0].id);
    }
  }, [availableTabs, inspectorTab]);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const conversationId = history[0]?.id || 'default_conversation';

  const loadArtifacts = async () => {
    try {
      const list = await artifactService.listArtifacts(conversationId);
      setArtifacts(list);
    } catch {
      // silencieux
    }
  };

  // Suivi des jobs vidéo en arrière-plan (Mission M7) [À VALIDER]
  const [activeVideoJobs, setActiveVideoJobs] = useState<VideoJobData[]>([]);
  const [, setTimeTicker] = useState(0);

  useEffect(() => {
    if (activeVideoJobs.length === 0) return;
    const interval = setInterval(() => {
      setTimeTicker(t => t + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [activeVideoJobs.length]);

  const loadVideoJobs = async () => {
    try {
      const jobs = await mediaService.getVideoJobs(conversationId);
      const pending = jobs.filter(j => j.status === 'queued' || j.status === 'processing');
      setActiveVideoJobs(pending);
    } catch {}
  };

  useEffect(() => {
    loadArtifacts();
    loadVideoJobs();
  }, [conversationId]);

  const handleCancelVideoJob = async (jobId: string) => {
    try {
      await mediaService.cancelVideoJob(jobId);
      setActiveVideoJobs(prev => prev.filter(j => j.id !== jobId));
    } catch {}
  };

  const toolExecutionsRef = useRef(toolExecutions);
  useEffect(() => {
    toolExecutionsRef.current = toolExecutions;
  }, [toolExecutions]);

  // Fetch workspace metadata (git branch, etc.)
  useEffect(() => {
    tokenService.fetch('/workspace')
      .then(res => res.json())
      .then(data => setWorkspaceMeta(data))
      .catch(() => {});
  }, []);

  // Auto-scroll when streaming
  useEffect(() => {
    if (isAtBottom && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [messages, currentAssistantStream, isAtBottom]);

  // Accessibilité live cadencée par phrase (Mission M8.2)
  useEffect(() => {
    if (!currentAssistantStream) {
      announcedIndexRef.current = 0;
      return;
    }
    const unannounced = currentAssistantStream.slice(announcedIndexRef.current);
    // Détecte une phrase terminée par un point, point d'exclamation, point d'interrogation ou saut de ligne
    const match = unannounced.match(/^([\s\S]*?[.!?\n])(?:\s+|$)/);
    if (match) {
      const sentence = match[1].trim();
      if (sentence) {
        setAriaLiveSentence(sentence);
      }
      announcedIndexRef.current += match[0].length;
    }
  }, [currentAssistantStream]);

  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight < 40;
    setIsAtBottom(atBottom);
  };

  const scrollToBottom = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
      setIsAtBottom(true);
    }
  };

  useEffect(() => {
    const unsubEvents = agentClient.onEvent((event: AgentEvent) => {
      switch (event.type) {
        case 'thinking':
          setThinkingLogs(prev => [...prev, event.content]);
          break;
        case 'plan':
          setPlanSteps(event.steps);
          break;
        case 'context_usage':
          if (event.usage) {
            setContextUsage(event.usage);
          }
          break;
        case 'context_summarized':
          setMessages(prev => [
            ...prev,
            { id: crypto.randomUUID(), role: 'system', content: 'Contexte résumé', timestamp: Date.now() }
          ]);
          if (event.usage) {
            setContextUsage(event.usage);
          }
          break;
        case 'message':
          if (event.role === 'assistant') {
            appendStreamDelta(event.content);
          }
          break;
        case 'tool_call_start':
          setToolExecutions(prev => [...prev, { callId: event.callId, tool: event.tool, input: event.input }]);
          break;
        case 'tool_call_result':
          setToolExecutions(prev =>
            prev.map(te => te.callId === event.callId ? { ...te, result: event.result, success: event.success } : te)
          );
          break;
        case 'artifact_created':
        case 'artifact_updated':
          setArtifacts(prev => {
            const existingIdx = prev.findIndex(a => a.id === event.artifact.id);
            if (existingIdx >= 0) {
              const copy = [...prev];
              copy[existingIdx] = {
                ...copy[existingIdx],
                name: event.artifact.name,
                title: event.artifact.title || copy[existingIdx].title,
                mimeType: event.artifact.mimeType,
                currentVersion: event.artifact.version,
                size: event.artifact.size,
                updatedAt: new Date().toISOString()
              };
              return copy;
            }
            const newArt: ArtifactPublicInfo = {
              id: event.artifact.id,
              name: event.artifact.name,
              title: event.artifact.title || event.artifact.name,
              mimeType: event.artifact.mimeType,
              currentVersion: event.artifact.version,
              size: event.artifact.size,
              conversationId: conversationId || '',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              versions: [
                {
                  id: 'ver_' + event.artifact.version,
                  artifactId: event.artifact.id,
                  version: event.artifact.version,
                  size: event.artifact.size,
                  filePath: '',
                  createdAt: new Date().toISOString()
                }
              ]
            };
            return [newArt, ...prev];
          });
          break;
        case 'video_job_updated': {
          const job = event.job as VideoJobData;
          if (!job) break;
          if (job.status === 'queued' || job.status === 'processing') {
            setActiveVideoJobs(prev => {
              const existingIdx = prev.findIndex(j => j.id === job.id);
              if (existingIdx >= 0) {
                const copy = [...prev];
                copy[existingIdx] = job;
                return copy;
              }
              return [...prev, job];
            });
          } else {
            setActiveVideoJobs(prev => prev.filter(j => j.id !== job.id));
            if (job.status === 'completed') {
              loadArtifacts();
              if (notificationsEnabled) {
                notificationService.notify('Génération de vidéo terminée', {
                  body: job.prompt
                });
              }
            }
          }
          break;
        }
        case 'permission_required':
          setPendingPermission(event.request);
          break;
        case 'file_changed':
          setChangedFiles(prev => {
            const filtered = prev.filter(f => f.path !== event.path);
            const updated = [...filtered, { path: event.path, diff: event.diff, action: event.action }];
            if (updated.length === 1) setInspectorOpen(true);
            return updated;
          });
          break;
        case 'error':
          setErrorMessage(event.message);
          setChatStatus('error');
          break;
        case 'status':
          if (event.status === 'idle') {
            const finalContent = flushStreamImmediately();
            if (finalContent) {
              const turnArtifacts: any[] = [];
              for (const te of toolExecutionsRef.current) {
                if (!te.success) continue;
                if ((te.tool === 'create_artifact' || te.tool === 'update_artifact') && te.result?.id) {
                  turnArtifacts.push(te.result);
                } else if (te.tool === 'generate_image') {
                  const d = te.result?.data || te.result;
                  if (d?.artifactId || d?.id) {
                    turnArtifacts.push({
                      id: d.artifactId || d.id,
                      name: d.filename || d.name,
                      title: d.title || d.filename,
                      mimeType: d.mimeType || 'image/png',
                      currentVersion: 1,
                      size: d.size || 0,
                      metadata: {
                        prompt: d.prompt || te.input?.prompt,
                        model: d.model,
                        seed: d.seed,
                        aspectRatio: d.aspectRatio,
                        revisedPrompt: d.revisedPrompt,
                        isGeneratedImage: true
                      }
                    });
                  }
                } else if ((te.tool === 'create_document' || te.tool === 'register_artifact')) {
                  const d = te.result?.data || te.result;
                  if (d?.artifactId || d?.id) {
                    turnArtifacts.push({
                      id: d.artifactId || d.id,
                      name: d.filename || d.name,
                      title: d.title || d.filename,
                      mimeType: d.mimeType || 'application/octet-stream',
                      currentVersion: 1,
                      size: d.size || 0
                    });
                  }
                } else if (te.tool === 'generate_video') {
                  const d = te.result?.data || te.result;
                  if (d?.artifactId || d?.id) {
                    turnArtifacts.push({
                      id: d.artifactId || d.id,
                      name: d.filename || d.name || 'video.mp4',
                      title: d.title || d.filename || 'Vidéo générée',
                      mimeType: d.mimeType || 'video/mp4',
                      currentVersion: 1,
                      size: d.size || 0,
                      metadata: {
                        prompt: d.prompt || te.input?.prompt,
                        model: d.model,
                        aspectRatio: d.aspectRatio,
                        isGeneratedVideo: true
                      }
                    });
                  }
                }
              }

              setMessages(prev => [
                ...prev,
                { 
                  id: crypto.randomUUID(),
                  role: 'assistant', 
                  content: finalContent, 
                  timestamp: Date.now(),
                  metadata: turnArtifacts.length > 0 ? {
                    artifacts: turnArtifacts.map(a => ({
                      id: a.id,
                      name: a.name,
                      title: a.title,
                      mimeType: a.mimeType,
                      version: a.version || a.currentVersion || 1,
                      size: a.size,
                      metadata: a.metadata
                    }))
                  } : undefined
                }
              ]);
              const remaining = finalContent.slice(announcedIndexRef.current).trim();
              if (remaining) {
                setAriaLiveSentence(remaining);
              }
              resetStreamBuffer();
            }
            setChatStatus('idle');
          }
          break;
        case 'completed':
          const finishedContent = flushStreamImmediately();
          const turnArtifacts: any[] = [];
          for (const te of toolExecutionsRef.current) {
            if (!te.success) continue;
            if ((te.tool === 'create_artifact' || te.tool === 'update_artifact') && te.result?.id) {
              turnArtifacts.push(te.result);
            } else if (te.tool === 'generate_image') {
              const d = te.result?.data || te.result;
              if (d?.artifactId || d?.id) {
                turnArtifacts.push({
                  id: d.artifactId || d.id,
                  name: d.filename || d.name,
                  title: d.title || d.filename,
                  mimeType: d.mimeType || 'image/png',
                  currentVersion: 1,
                  size: d.size || 0,
                  metadata: {
                    prompt: d.prompt || te.input?.prompt,
                    model: d.model,
                    seed: d.seed,
                    aspectRatio: d.aspectRatio,
                    revisedPrompt: d.revisedPrompt,
                    isGeneratedImage: true
                  }
                });
              }
            } else if ((te.tool === 'create_document' || te.tool === 'register_artifact')) {
              const d = te.result?.data || te.result;
              if (d?.artifactId || d?.id) {
                turnArtifacts.push({
                  id: d.artifactId || d.id,
                  name: d.filename || d.name,
                  title: d.title || d.filename,
                  mimeType: d.mimeType || 'application/octet-stream',
                  currentVersion: 1,
                  size: d.size || 0
                });
              }
            }
          }

          if (finishedContent) {
            setMessages(prev => [
              ...prev,
              { 
                id: crypto.randomUUID(),
                role: 'assistant', 
                content: finishedContent, 
                timestamp: Date.now(),
                metadata: turnArtifacts.length > 0 ? {
                  artifacts: turnArtifacts.map(a => ({
                    id: a.id,
                    name: a.name,
                    title: a.title,
                    mimeType: a.mimeType,
                    version: a.version || a.currentVersion || 1,
                    size: a.size,
                    metadata: a.metadata
                  }))
                } : undefined
              }
            ]);
            const remaining = finishedContent.slice(announcedIndexRef.current).trim();
            if (remaining) {
              setAriaLiveSentence(remaining);
            }
            resetStreamBuffer();
          }
          setChatStatus('success');
          if (notificationsEnabled) {
            notificationService.notifyCompletion(event.summary || finishedContent || "Iroko a terminé sa réponse.");
          }
          break;
      }
    });

    return () => unsubEvents();
  }, [notificationsEnabled, flushStreamImmediately, appendStreamDelta, resetStreamBuffer]);

  const handlePermissionResponse = (approved: boolean, scope: 'once' | 'session' | 'project' | 'reject') => {
    if (pendingPermission) {
      agentClient.respondPermission(pendingPermission.id, approved, scope);
      setPendingPermission(null);
    }
  };

  useEffect(() => {
    if (!selectedAttachmentId) {
      setPreviewData(null);
      return;
    }
    let isMounted = true;
    setIsPreviewLoading(true);
    attachmentService.getAttachmentPreview(selectedAttachmentId)
      .then(res => {
        if (isMounted) {
          setPreviewData(res);
          setIsPreviewLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setIsPreviewLoading(false);
        }
      });
    return () => { isMounted = false; };
  }, [selectedAttachmentId]);

  const handleSendMessage = (
    text: string, 
    options?: { mode?: 'chat' | 'code'; tools?: string[]; attachmentIds?: string[] }
  ) => {
    const userMsg = { 
      id: crypto.randomUUID(),
      role: 'user' as const, 
      content: text, 
      timestamp: Date.now(),
      metadata: options?.attachmentIds && options.attachmentIds.length > 0 ? { attachmentIds: options.attachmentIds } : undefined
    };
    setMessages(prev => [...prev, userMsg]);
    setChatStatus('loading');
    setThinkingLogs([]); // Zéro log inventé : alimenté uniquement par les flux réels du provider
    setToolExecutions([]);
    resetStreamBuffer();
    setErrorMessage(null);
    const activeConvId = history[0]?.id;

    if (options?.attachmentIds) {
      for (const id of options.attachmentIds) {
        attachmentService.getAttachment(id).then(att => {
          setAttachmentsMap(prev => ({ ...prev, [id]: att }));
        }).catch(() => {});
      }
    }

    agentClient.sendPrompt(text, {
      conversationId: activeConvId,
      modelId: activeModel,
      mode: options?.mode || composerMode,
      attachmentIds: options?.attachmentIds
    });
  };

  const handleRetry = () => {
    const lastUser = [...messages].reverse().find(m => m.role === 'user');
    if (lastUser) {
      handleSendMessage(lastUser.content);
    }
  };

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleDeleteMessage = async (msg: any, index: number) => {
    setIsDeletingMessage(true);
    try {
      if (msg.id) {
        await tokenService.fetch(`/api/messages/${encodeURIComponent(msg.id)}`, {
          method: 'DELETE'
        });
      }
      setMessages(prev => prev.filter((_, i) => i !== index));
      setDeleteConfirmMessage(null);
      loadArtifacts();
    } catch {
      // silencieux
    } finally {
      setIsDeletingMessage(false);
    }
  };

  const handleStartEdit = async (msg: any, index: number) => {
    setIsCheckingImpact(true);
    let impact = undefined;
    try {
      if (msg.id && conversationId) {
        const res = await tokenService.fetch(`/api/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(msg.id)}/impact`);
        if (res.ok) {
          impact = await res.json();
        }
      }
    } catch {} finally {
      setIsCheckingImpact(false);
    }

    setEditModalData({
      message: msg,
      index,
      content: msg.content,
      impact: impact || {
        subsequentCount: Math.max(0, messages.length - index - 1),
        filesWereModified: false,
        modifiedFiles: []
      }
    });
  };

  const handleConfirmEdit = async () => {
    if (!editModalData) return;
    const { message, index, content } = editModalData;
    const newText = content.trim();
    if (!newText) return;

    try {
      if (message.id && conversationId) {
        await tokenService.fetch(`/api/conversations/${encodeURIComponent(conversationId)}/truncate-from/${encodeURIComponent(message.id)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ includeTarget: true })
        });
      }
      // Troncature locale
      setMessages(prev => prev.slice(0, index));
      setEditModalData(null);
      // Renvoyer le message modifié
      handleSendMessage(newText);
    } catch (err) {
      console.error('Erreur lors de la modification/troncature :', err);
    }
  };

  const handleRegenerateFrom = async (assistantIndex: number) => {
    // Retrouver le dernier message utilisateur avant cette réponse
    const priorUser = [...messages.slice(0, assistantIndex)].reverse().find(m => m.role === 'user');
    if (!priorUser) return;

    const assistantMsg = messages[assistantIndex];
    try {
      if (assistantMsg?.id && conversationId) {
        await tokenService.fetch(`/api/conversations/${encodeURIComponent(conversationId)}/truncate-from/${encodeURIComponent(assistantMsg.id)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ includeTarget: true })
        });
      }
      // Troncature locale à partir de la réponse assistant
      setMessages(prev => prev.slice(0, assistantIndex));
      // Réémission de la requête utilisateur
      handleSendMessage(priorUser.content);
    } catch (err) {
      console.error('Erreur lors de la régénération :', err);
    }
  };

  // Vraies discussions uniquement : aucun message fictif inventé
  const activeMessages = messages;

  return (
    <div className="flex-1 h-full w-full flex overflow-hidden relative bg-[var(--bg-app)]">
      {/* Région live pour lecteurs d'écran cadencée par phrase (§ M8.2) */}
      <div aria-live="polite" aria-atomic="false" className="sr-only">
        {ariaLiveSentence}
      </div>
      
      {/* ── Zone principale de conversation ── */}
      <div className="flex-1 h-full flex flex-col min-w-0 overflow-hidden relative">
        
        {/* Messages défilants */}
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 min-h-0 overflow-y-auto claude-scrollbar px-4 sm:px-6 py-4"
        >
          <div className="max-w-[720px] mx-auto space-y-6 pb-28 pt-2">
            {activeMessages.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-[13px] text-[var(--text-secondary)]">
                Aucun message dans cette discussion.
              </div>
            ) : (
              activeMessages.map((msg, idx) => {
                if (msg.role === 'system') {
                  return (
                    <div key={msg.id || idx} className="flex items-center justify-center my-4 select-none" data-context-summarized="true">
                      <div className="h-[1px] bg-[var(--border-modal)] flex-1 max-w-[120px]" />
                      <span className="px-3 text-[12px] text-[var(--text-secondary)] font-sans">
                        {msg.content || 'Contexte résumé'}
                      </span>
                      <div className="h-[1px] bg-[var(--border-modal)] flex-1 max-w-[120px]" />
                    </div>
                  );
                }

                const isUser = msg.role === 'user';
                const headingId = `msg-heading-${msg.id || idx}`;
                return (
                  <article key={msg.id || idx} aria-labelledby={headingId} className="w-full">
                    <h3 id={headingId} className="sr-only">
                      {isUser ? 'Vous avez dit :' : 'Iroko a dit :'}
                    </h3>
                    {isUser ? (
                      /* Message utilisateur : bloc gris discret arrondi à droite (Capture 4) */
                      <div className="flex flex-col items-end mb-6 space-y-1.5 group">
                        <div
                          data-user-bubble="true"
                          className="max-w-[85%] bg-[var(--bg-user-bubble)] text-[var(--text-primary)] text-[14px] leading-[1.55] px-4 py-3"
                          style={{
                            backgroundColor: 'var(--border-subtle)',
                            borderRadius: '14px'
                          }}
                        >
                          {msg.content}
                        </div>

                        {/* Actions au survol sous le message utilisateur (Copier, Modifier, Supprimer) [À VALIDER] */}
                        <div data-message-actions="true" className="flex items-center gap-1.5 pt-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity select-none">
                          <button
                            type="button"
                            onClick={() => handleCopy(msg.content, idx)}
                            className="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] transition-colors cursor-pointer"
                            title="Copier"
                            aria-label="Copier le message"
                          >
                            {copiedIndex === idx ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleStartEdit(msg, idx)}
                            disabled={chatStatus === 'loading' || isCheckingImpact}
                            className="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Modifier et renvoyer"
                            aria-label="Modifier et renvoyer le message"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmMessage({ message: msg, index: idx })}
                            disabled={chatStatus === 'loading'}
                            className="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Supprimer"
                            aria-label="Supprimer le message"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Pièces jointes rattachées au message utilisateur (§ Mission M2) */}
                        {msg.attachments && msg.attachments.length > 0 && (
                          <div className="flex flex-wrap justify-end gap-1.5 max-w-[85%]">
                            {msg.attachments.map(attId => (
                              <button
                                key={attId}
                                type="button"
                                onClick={() => {
                                  setSelectedAttachmentId(attId);
                                  setInspectorTab('preview');
                                  setInspectorOpen(true);
                                }}
                                className="flex items-center gap-1.5 px-2.5 py-1 bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-composer)] rounded-[6px] text-[12px] text-[var(--text-primary)] transition-colors cursor-pointer"
                                title="Cliquer pour afficher l'aperçu dans l'inspecteur"
                              >
                                <Paperclip className="w-3 h-3 text-[var(--text-secondary)]" />
                                <span className="truncate max-w-[140px]">
                                  {attachmentsMap[attId]?.name || 'Pièce jointe'}
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      /* Réponse de l'assistant : texte directement sur le fond (Capture 4) */
                      <div className="space-y-3 group">
                        
                        {/* ── Bloc de réflexion dépliable (uniquement si des logs réels existent) ── */}
                        {thinkingLogs.length > 0 && (
                          <div className="mb-3">
                            <button
                              type="button"
                              onClick={() => setIsThinkingOpen(!isThinkingOpen)}
                              className="flex items-center gap-1.5 text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors select-none"
                            >
                              <span>Réflexion ({thinkingLogs.length})</span>
                              {isThinkingOpen ? (
                                <ChevronDown className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                              ) : (
                                <ChevronRight className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                              )}
                            </button>

                            {isThinkingOpen && (
                              <div
                                className="mt-2 pl-3 border-l border-[var(--border-modal)] text-[13px] text-[var(--text-secondary)] leading-relaxed font-sans space-y-1 animate-in fade-in duration-150"
                              >
                                {thinkingLogs.map((log, lIdx) => (
                                  <p key={lIdx}>{log}</p>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Texte principal de la réponse (Police serif ou sans selon réglage) */}
                        <div
                          className={`text-[15px] sm:text-[15.5px] text-[var(--text-primary)] leading-[1.65] ${
                            conversationFont === 'serif' ? 'font-serif' : 'font-sans'
                          }`}
                          style={{
                            fontFamily: conversationFont === 'serif' ? 'var(--font-serif)' : 'var(--font-sans)',
                            letterSpacing: '-0.005em'
                          }}
                        >
                          <FormattedMessage content={msg.content} />
                        </div>

                        {/* Artéfacts générés dans cette réponse */}
                        {msg.metadata?.artifacts && msg.metadata.artifacts.length > 0 && (
                          <div className="flex flex-col gap-2 pt-2">
                            {msg.metadata.artifacts.map(art => (
                              <ArtifactCard
                                key={art.id}
                                artifact={art}
                                onOpen={(artId) => {
                                  setSelectedArtifactId(artId);
                                  setInspectorTab('artifacts');
                                  setInspectorOpen(true);
                                }}
                                onRegenerate={(prompt) => {
                                  handleSendMessage(`Régénère l'image suivante : ${prompt}`);
                                }}
                                onReuseAsAttachment={async (artifact) => {
                                  try {
                                    const res = await tokenService.fetch(`/api/artifacts/${encodeURIComponent(artifact.id)}/download`);
                                    if (!res.ok) return;
                                    const blob = await res.blob();
                                    const file = new File([blob], artifact.name, { type: artifact.mimeType || blob.type || 'image/png' });
                                    window.dispatchEvent(new CustomEvent('iroko:add-attachment', { detail: { file } }));
                                  } catch (err) {
                                    console.error('Failed to reuse artifact as attachment', err);
                                  }
                                }}
                              />
                            ))}
                          </div>
                        )}

                        {/* Actions au survol sous la réponse (Copier, Régénérer, Supprimer) [À VALIDER] */}
                        <div data-message-actions="true" className="flex items-center gap-1.5 pt-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity select-none">
                          <button
                            type="button"
                            onClick={() => handleCopy(msg.content, idx)}
                            className="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] transition-colors cursor-pointer"
                            title="Copier"
                            aria-label="Copier la réponse"
                          >
                            {copiedIndex === idx ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRegenerateFrom(idx)}
                            disabled={chatStatus === 'loading'}
                            className="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Régénérer la réponse"
                            aria-label="Régénérer la réponse"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmMessage({ message: msg, index: idx })}
                            disabled={chatStatus === 'loading'}
                            className="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Supprimer ce message"
                            aria-label="Supprimer la réponse"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                      </div>
                    )}
                  </article>
                );
              })
            )}

            {/* ── Étapes d'outils en direct dans le fil de discussion ── */}
            {toolExecutions.length > 0 && (
              <div className="space-y-1.5 border-l border-[var(--border-modal)] pl-3 py-1 my-2">
                {toolExecutions.map(te => (
                  <div key={te.callId} className="flex items-center gap-2 text-[12px] text-[var(--text-secondary)]">
                    <Terminal className="w-3 h-3 shrink-0" />
                    <span className="font-mono text-[var(--text-primary)]">{te.tool}</span>
                    {te.input?.path && <span className="font-mono text-[var(--text-secondary)] truncate max-w-xs">{te.input.path}</span>}
                    {te.input?.command && <span className="font-mono text-[var(--text-secondary)] truncate max-w-xs">{te.input.command}</span>}
                    <span className="text-[11px]">
                      {te.success === true ? '✓' : te.success === false ? '✗' : '…'}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* ── Cartes de vidéos en cours de génération (Mission M7) [À VALIDER] ── */}
            {activeVideoJobs.map(job => {
              const elapsedSec = Math.max(0, Math.floor((Date.now() - job.createdAt) / 1000));
              const mins = Math.floor(elapsedSec / 60);
              const secs = elapsedSec % 60;
              const elapsedStr = `${mins}:${secs.toString().padStart(2, '0')} écoulées`;

              return (
                <div
                  key={job.id}
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
                    onClick={() => handleCancelVideoJob(job.id)}
                    className="px-2.5 py-1 text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] rounded-[6px] transition-colors shrink-0"
                  >
                    Arrêter
                  </button>
                </div>
              );
            })}

            {/* ── Dialogue d'autorisation d'outil in-chat ── */}
            {pendingPermission && (
              <div className="w-full my-3">
                <PermissionPrompt
                  request={pendingPermission}
                  onRespond={handlePermissionResponse}
                />
              </div>
            )}

            {/* Réponse en streaming en direct */}
            {chatStatus === 'loading' && (
              <article aria-labelledby="assistant-stream-heading" className="space-y-2">
                <h3 id="assistant-stream-heading" className="sr-only">Iroko a dit :</h3>
                <div className="flex items-center gap-2 text-[13px] text-[var(--text-secondary)] animate-pulse">
                  <span>Réflexion en cours…</span>
                </div>
                {currentAssistantStream && (
                  <div
                    className={`text-[15px] sm:text-[15.5px] text-[var(--text-primary)] leading-[1.65] ${
                      conversationFont === 'serif' ? 'font-serif' : 'font-sans'
                    }`}
                  >
                    <FormattedMessage content={currentAssistantStream} />
                  </div>
                )}
              </article>
            )}

            {/* État d'erreur avec action Réessayer (§22) */}
            {chatStatus === 'error' && (
              <div className="p-3 rounded-[8px] bg-[var(--bg-surface)] border border-[var(--border-modal)] text-[13px] text-[var(--text-secondary)] flex items-center justify-between">
                <span>{errorMessage || 'Une erreur est survenue lors de la communication avec le modèle.'}</span>
                <button
                  type="button"
                  onClick={handleRetry}
                  className="px-2.5 py-1 rounded bg-[var(--bg-active)] text-[var(--text-primary)] hover:opacity-90 text-[12px] transition-colors"
                >
                  Réessayer
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Flèche de défilement vers le bas si l'utilisateur est remonté ── */}
        {!isAtBottom && (
          <button
            type="button"
            onClick={scrollToBottom}
            className="absolute bottom-28 left-1/2 -translate-x-1/2 w-7 h-7 rounded-full bg-[var(--bg-user-bubble)] border border-[var(--border-composer)] text-[var(--text-primary)] flex items-center justify-center shadow-lg hover:bg-[var(--bg-active)] transition-all z-30"
            title="Défiler vers le bas"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
        )}

        {/* ── Composer collé en bas avec safe-area et note de bas de page (Capture 4) ── */}
        <div className="w-full shrink-0 flex flex-col items-center px-4 pb-4 pt-1 bg-gradient-to-t from-[var(--bg-app)] via-[var(--bg-app)] to-transparent z-20">
          <ClaudeComposer
            onSend={handleSendMessage}
            onStop={() => agentClient.cancelTask()}
            isLoading={chatStatus === 'loading'}
            isConversation={true}
            conversationId={history[0]?.id}
            contextUsage={contextUsage}
          />

          {/* Note de bas de page avec modèle réel dénué de nom Claude visible (§3, Lot L2/L3) */}
          <div className="w-full max-w-[720px] flex items-center justify-between text-[11px] text-[var(--text-tertiary)] pt-2 px-1 select-none">
            <span>Iroko est une IA et peut commettre des erreurs. Veuillez vérifier les réponses.</span>
            <span>{formatModelLabel(activeModel).name}</span>
          </div>
        </div>

      </div>

      {/* ── Panneau Inspecteur (Modifications / Plan / Terminal / Tests) à droite ── */}
      {inspectorOpen && (
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
                  title={`Branche Git : ${workspaceMeta.git.branch}`}
                >
                  <GitBranch className="w-3 h-3 shrink-0" />
                  <span className="truncate">{workspaceMeta.git.branch}</span>
                </span>
              )}
              <button
                type="button"
                onClick={() => setInspectorOpen(false)}
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
                        <div>Taille : {(previewData.attachment.size / 1024).toFixed(1)} Ko</div>
                        <div>Type : {previewData.attachment.mimeType}</div>
                        {previewData.attachment.sha256 && (
                          <div className="truncate" title={previewData.attachment.sha256}>
                            SHA-256 : {previewData.attachment.sha256.slice(0, 16)}…
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
                onSelectArtifact={setSelectedArtifactId}
                onArtifactUpdated={loadArtifacts}
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
                    onClick={() => handleSendMessage('Lance la vérification du projet')}
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
      )}

      {/* ── Modale sobre de confirmation de suppression (Mission M8.3, Pilier P3) [À VALIDER] ── */}
      {deleteConfirmMessage && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--bg-modal)] border border-[var(--border-modal)] rounded-[10px] max-w-md w-full p-4 space-y-3 animate-in fade-in zoom-in-95 duration-150">
            <div className="text-[14px] font-semibold text-[var(--text-primary)]">
              Supprimer le message
            </div>
            <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">
              Voulez-vous vraiment supprimer ce message de la discussion ? Cette action est irréversible dans la base locale.
            </p>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setDeleteConfirmMessage(null)}
                disabled={isDeletingMessage}
                className="px-3 py-1.5 rounded-[6px] text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => handleDeleteMessage(deleteConfirmMessage.message, deleteConfirmMessage.index)}
                disabled={isDeletingMessage}
                className="px-3 py-1.5 rounded-[6px] text-[12px] bg-[var(--bg-active)] text-[var(--text-primary)] hover:opacity-90 border border-[var(--border-composer)] transition-colors cursor-pointer"
              >
                {isDeletingMessage ? 'Suppression…' : 'Supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modale sobre de confirmation Modifier et renvoyer (Mission M8.3, Pilier P4) [À VALIDER] ── */}
      {editModalData && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--bg-modal)] border border-[var(--border-modal)] rounded-[10px] max-w-lg w-full p-4 space-y-3 animate-in fade-in zoom-in-95 duration-150">
            <div className="text-[14px] font-semibold text-[var(--text-primary)]">
              Modifier et renvoyer le message
            </div>
            
            {editModalData.impact && editModalData.impact.subsequentCount > 0 && (
              <div className="p-2.5 rounded-[6px] bg-[var(--bg-user-bubble)] border border-[var(--border-modal)] text-[12px] text-[var(--text-secondary)] space-y-1">
                <div>
                  Modifier ce message supprimera les <span className="text-[var(--text-primary)] font-medium">{editModalData.impact.subsequentCount}</span> message(s) suivant(s) de cette discussion.
                </div>
                {editModalData.impact.filesWereModified && (
                  <div className="text-[var(--text-muted)] pt-1">
                    ⚠️ Attention : <span className="font-medium text-[var(--text-primary)]">{editModalData.impact.modifiedFiles.length} fichier(s)</span> ont été modifiés par l'agent depuis ce message en mode Code ({editModalData.impact.modifiedFiles.slice(0, 3).join(', ')}{editModalData.impact.modifiedFiles.length > 3 ? '…' : ''}). Ces modifications déjà écrites sur le disque ne seront pas automatiquement annulées.
                  </div>
                )}
              </div>
            )}

            <div>
              <textarea
                value={editModalData.content}
                onChange={e => setEditModalData({ ...editModalData, content: e.target.value })}
                rows={4}
                className="w-full bg-[var(--bg-app)] border border-[var(--border-modal)] rounded-[6px] p-2.5 text-[13px] text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-focus)] resize-none"
                placeholder="Modifiez votre message…"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setEditModalData(null)}
                className="px-3 py-1.5 rounded-[6px] text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleConfirmEdit}
                disabled={!editModalData.content.trim()}
                className="px-3 py-1.5 rounded-[6px] text-[12px] bg-[var(--text-primary)] text-[var(--bg-app)] hover:bg-white font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                Confirmer et renvoyer
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
