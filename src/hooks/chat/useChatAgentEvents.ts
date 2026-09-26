import React, { useState, useRef, useEffect } from 'react';
import { agentClient } from '../../lib/agent-client';
import { AgentEvent, PlanStep, PermissionRequest } from '../../../server/types/events';
import { notificationService } from '../../services/notification/NotificationService';
import { artifactService, ArtifactPublicInfo } from '../../services/artifacts/ArtifactService';
import { mediaService, VideoJobData } from '../../services/media/MediaService';
import { ChangedFileRecord } from '../../features/agent/DiffViewer';
import { tokenService } from '../../services/security/TokenService';
import { extractTurnArtifacts } from './artifactTurnExtractor';

export interface UseChatAgentEventsOptions {
  conversationId: string;
  notificationsEnabled: boolean;
  currentAssistantStream: string;
  appendStreamDelta: (delta: string) => void;
  flushStreamImmediately: () => string;
  resetStreamBuffer: () => void;
  setMessages: React.Dispatch<React.SetStateAction<any[]>>;
  setChatStatus: (status: any) => void;
  setInspectorOpen: (open: boolean) => void;
}

export function useChatAgentEvents({
  conversationId,
  notificationsEnabled,
  currentAssistantStream,
  appendStreamDelta,
  flushStreamImmediately,
  resetStreamBuffer,
  setMessages,
  setChatStatus,
  setInspectorOpen
}: UseChatAgentEventsOptions) {
  const [currentThinking, setCurrentThinking] = useState<string>('');
  const currentThinkingRef = useRef<string>('');
  const [thinkingLogs, setThinkingLogs] = useState<string[]>([]);
  const [isThinkingOpen, setIsThinkingOpen] = useState(false);
  const [planSteps, setPlanSteps] = useState<PlanStep[]>([]);
  const [changedFiles, setChangedFiles] = useState<ChangedFileRecord[]>([]);
  const [contextUsage, setContextUsage] = useState<{
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    contextWindow: number;
    isEstimate: boolean;
    ratio: number;
  } | null>(null);

  const [artifacts, setArtifacts] = useState<ArtifactPublicInfo[]>([]);
  const [activeVideoJobs, setActiveVideoJobs] = useState<VideoJobData[]>([]);
  const [, setTimeTicker] = useState(0);

  const [toolExecutions, setToolExecutions] = useState<Array<{
    callId: string;
    tool: string;
    input: any;
    result?: any;
    success?: boolean;
    error?: string;
    args?: any;
  }>>([]);
  const [pendingPermission, setPendingPermission] = useState<PermissionRequest | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [ariaLiveSentence, setAriaLiveSentence] = useState('');
  const announcedIndexRef = useRef(0);
  const toolExecutionsRef = useRef(toolExecutions);

  useEffect(() => {
    toolExecutionsRef.current = toolExecutions;
  }, [toolExecutions]);

  useEffect(() => {
    if (activeVideoJobs.length === 0) return;
    const interval = setInterval(() => {
      setTimeTicker(t => t + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [activeVideoJobs.length]);

  const loadArtifacts = async () => {
    try {
      const list = await artifactService.listArtifacts(conversationId);
      setArtifacts(list);
    } catch {
      // silencieux
    }
  };

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
    if (conversationId) {
      agentClient.subscribeConversation(conversationId);
      tokenService.fetch(`/api/conversations/${encodeURIComponent(conversationId)}/active-task`)
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data?.active) {
            setChatStatus('loading');
            if (data.streamedText) {
              resetStreamBuffer();
              appendStreamDelta(data.streamedText);
            }
            if (data.thinkingText) {
              currentThinkingRef.current = data.thinkingText;
              setCurrentThinking(data.thinkingText);
              setThinkingLogs([data.thinkingText]);
            }
            if (Array.isArray(data.toolExecutions)) {
              setToolExecutions(data.toolExecutions);
            }
            if (Array.isArray(data.planSteps)) {
              setPlanSteps(data.planSteps);
            }
          }
        })
        .catch(() => {});
    }
  }, [conversationId]);

  const handleCancelVideoJob = async (jobId: string) => {
    try {
      await mediaService.cancelVideoJob(jobId);
      setActiveVideoJobs(prev => prev.filter(j => j.id !== jobId));
    } catch {}
  };

  // Accessibilité live cadencée par phrase (Mission M8.2)
  useEffect(() => {
    if (!currentAssistantStream) {
      announcedIndexRef.current = 0;
      return;
    }
    const unannounced = currentAssistantStream.slice(announcedIndexRef.current);
    const match = unannounced.match(/^([\s\S]*?[.!?\n])(?:\s+|$)/);
    if (match) {
      const sentence = match[1].trim();
      if (sentence) {
        setAriaLiveSentence(sentence);
      }
      announcedIndexRef.current += match[0].length;
    }
  }, [currentAssistantStream]);

  const commitAssistantMessage = (content: string, turnThinking?: string, turnSources?: any[]) => {
    const turnArtifacts = extractTurnArtifacts(toolExecutionsRef.current);
    setMessages(prev => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: 'assistant',
        content,
        timestamp: Date.now(),
        thinking: turnThinking || undefined,
        metadata: {
          ...(turnArtifacts.length > 0 ? {
            artifacts: turnArtifacts.map(a => ({
              id: a.id,
              name: a.name,
              title: a.title,
              mimeType: a.mimeType,
              version: a.version || a.currentVersion || 1,
              size: a.size,
              metadata: a.metadata
            }))
          } : {}),
          ...(turnSources && turnSources.length > 0 ? { sources: turnSources } : {}),
          ...(turnThinking ? { thinking: turnThinking } : {})
        }
      }
    ]);
    const remaining = content.slice(announcedIndexRef.current).trim();
    if (remaining) {
      setAriaLiveSentence(remaining);
    }
    resetStreamBuffer();
    currentThinkingRef.current = '';
    setCurrentThinking('');
    setThinkingLogs([]);
  };

  useEffect(() => {
    const unsubEvents = agentClient.onEvent((event: AgentEvent) => {
      switch (event.type) {
        case 'thinking':
          currentThinkingRef.current += event.content;
          setCurrentThinking(currentThinkingRef.current);
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
        case 'task_resumed': {
          const payload = (event as any).payload;
          if (payload && (!payload.conversationId || payload.conversationId === conversationId)) {
            setChatStatus('loading');
            if (payload.content) {
              resetStreamBuffer();
              appendStreamDelta(payload.content);
            }
            if (payload.thinking) {
              currentThinkingRef.current = payload.thinking;
              setCurrentThinking(payload.thinking);
              setThinkingLogs([payload.thinking]);
            }
            if (Array.isArray(payload.toolExecutions)) {
              setToolExecutions(payload.toolExecutions);
            }
            if (Array.isArray(payload.planSteps)) {
              setPlanSteps(payload.planSteps);
            }
          }
          break;
        }
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
          currentThinkingRef.current = '';
          setCurrentThinking('');
          setThinkingLogs([]);
          setErrorMessage(event.message);
          setChatStatus('error');
          break;
        case 'status':
          if (event.status === 'idle') {
            const finalContent = flushStreamImmediately();
            if (finalContent) {
              commitAssistantMessage(finalContent, currentThinkingRef.current);
            }
            setChatStatus('idle');
          }
          break;
        case 'completed': {
          const finishedContent = flushStreamImmediately();
          const turnThinking = ((event as any).thinking !== undefined && (event as any).thinking) ? (event as any).thinking : currentThinkingRef.current;
          const turnSources = (event as any).sources;
          if (finishedContent) {
            commitAssistantMessage(finishedContent, turnThinking, turnSources);
          }
          setChatStatus('success');
          if (notificationsEnabled) {
            notificationService.notifyCompletion(event.summary || finishedContent || "Iroko a terminé sa réponse.");
          }
          break;
        }
      }
    });

    return () => unsubEvents();
  }, [notificationsEnabled, flushStreamImmediately, appendStreamDelta, resetStreamBuffer, conversationId]);

  return {
    currentThinking,
    thinkingLogs,
    setThinkingLogs,
    isThinkingOpen,
    setIsThinkingOpen,
    planSteps,
    contextUsage,
    toolExecutions,
    setToolExecutions,
    artifacts,
    loadArtifacts,
    activeVideoJobs,
    handleCancelVideoJob,
    pendingPermission,
    setPendingPermission,
    changedFiles,
    errorMessage,
    setErrorMessage,
    ariaLiveSentence
  };
}
