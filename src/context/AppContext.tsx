import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Project, Message, HistoryItem } from '../types';
import { agentClient } from '../lib/agent-client';
import { AgentEvent, AgentStatus } from '../../server/types/events';
import { tokenService } from '../services/security/TokenService';

import { useSettings } from '../hooks/useSettings';
import { VoiceSpeed } from '../services/speech/SpeechService';

export type NavView = 'home' | 'chat' | 'projects' | 'settings' | 'activity';
export type WorkspaceTab = 'code' | 'files' | 'terminal' | 'git' | 'diffs';
export type AgentType = 'coder' | 'editorial' | 'planner' | 'reviewer';
export type ConversationFont = 'serif' | 'sans';
export type ThemeMode = 'system' | 'light' | 'dark';
export type AnimationsMode = 'system' | 'reduced';
export type ComposerMode = 'chat' | 'code';

export interface ActiveWorkspaceInfo {
  path: string;
  name: string;
  isTemp?: boolean;
  isReadOnly?: boolean;
  warning?: string;
}

export interface AppContextType {
  // Navigation & Shell
  activeView: NavView;
  setActiveView: (view: NavView) => void;
  workspaceTab: WorkspaceTab;
  setWorkspaceTab: (tab: WorkspaceTab) => void;
  isSidebarCollapsed: boolean;
  setIsSidebarCollapsed: (v: boolean | ((prev: boolean) => boolean)) => void;
  isMobileSidebarOpen: boolean;
  setIsMobileSidebarOpen: (v: boolean) => void;
  isCommandPaletteOpen: boolean;
  setIsCommandPaletteOpen: (v: boolean) => void;

  // Settings Modal & Preferences
  isSettingsOpen: boolean;
  setIsSettingsOpen: (v: boolean) => void;
  activeSettingsTab: string;
  setActiveSettingsTab: (t: string) => void;
  conversationFont: ConversationFont;
  setConversationFont: (f: ConversationFont) => void;
  theme: ThemeMode;
  setTheme: (t: ThemeMode) => void;
  animations: AnimationsMode;
  setAnimations: (a: AnimationsMode) => void;
  voiceLang: string;
  setVoiceLang: (l: string) => void;
  voiceURI: string;
  setVoiceURI: (u: string) => void;
  voiceSpeed: VoiceSpeed;
  setVoiceSpeed: (s: VoiceSpeed) => void;
  notificationsEnabled: boolean;
  toggleNotifications: () => Promise<boolean>;
  composerMode: ComposerMode;
  setComposerMode: (m: ComposerMode) => void;
  activeWorkspace: ActiveWorkspaceInfo | null;
  setActiveWorkspace: (ws: ActiveWorkspaceInfo | null) => void;

  // CURRENT CONTEXT
  activeProjectId: string | null;
  setActiveProjectId: (id: string | null) => void;
  activeProject: Project | null;
  activeAgent: AgentType;
  setActiveAgent: (agent: AgentType) => void;
  activeModel: string;
  setActiveModel: (model: string) => void;
  activeProvider: string;
  setActiveProvider: (provider: string) => void;

  // Data & Collections
  projects: Project[];
  createProject: (name: string, description?: string) => Promise<Project>;
  deleteProject: (id: string) => Promise<void>;

  // Chat & Messaging
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  chatStatus: 'idle' | 'loading' | 'success' | 'error';
  setChatStatus: (s: 'idle' | 'loading' | 'success' | 'error') => void;
  resetChat: () => void;

  // Agent Runtime Stream
  runtimeConnected: boolean;
  runtimeStatus: AgentStatus;
  runtimeMessage: string;

  history: HistoryItem[];
  setHistory: React.Dispatch<React.SetStateAction<HistoryItem[]>>;
  clearHistory: () => void;

  // Rafraîchissement des modèles disponibles (M10.0)
  modelsRefreshKey: number;
  refreshModels: () => void;

  // Chargement d'une discussion persistée
  loadConversation: (id: string) => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  // View states
  const [activeView, setActiveView] = useState<NavView>('home');
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>('code');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  // Settings Modal & Preferences
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeSettingsTab, setActiveSettingsTab] = useState('preferences');
  const [composerMode, setComposerModeState] = useState<ComposerMode>('chat');

  const setComposerMode = (m: ComposerMode) => {
    setComposerModeState(m);
    if (history.length > 0 && history[0]?.id) {
      const activeId = history[0].id;
      setHistory(prev => prev.map(h => h.id === activeId ? { ...h, mode: m } : h));
      tokenService.fetch(`/api/conversations/${activeId}/mode`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: m })
      }).catch(() => {});
    }
  };

  const {
    settings,
    setTheme,
    setConversationFont,
    setAnimations,
    setVoiceLang,
    setVoiceURI,
    setVoiceSpeed,
    toggleNotifications
  } = useSettings();

  // Current Context
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeAgent, setActiveAgent] = useState<AgentType>('coder');
  const [activeModel, setActiveModel] = useState<string>('anthropic/claude-3.5-sonnet');
  const [activeProvider, setActiveProvider] = useState<string>('openrouter');

  // Clé de rafraîchissement des modèles (M10.0) — incrémentée pour forcer un re-fetch du Composer
  const [modelsRefreshKey, setModelsRefreshKey] = useState(0);
  const refreshModels = () => setModelsRefreshKey(prev => prev + 1);

  // Projects
  const [projects, setProjects] = useState<Project[]>(() => {
    try {
      const saved = localStorage.getItem('iroko_projects');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const cleaned = parsed.filter(
            (p: any) =>
              p &&
              p.name !== 'Iroko Workspace' &&
              !p.name?.includes('NBDV') &&
              p.id !== 'proj-iroko' &&
              p.id !== 'proj-ds2api' &&
              p.id !== 'proj-relais'
          );
          localStorage.setItem('iroko_projects', JSON.stringify(cleaned));
          return cleaned;
        }
      }
    } catch (e) {}
    return [];
  });

  const activeProject = projects.find(p => p.id === activeProjectId) || projects[0] || null;

  useEffect(() => {
    if (!activeProjectId && projects.length > 0) {
      setActiveProjectId(projects[0].id);
    }
    localStorage.setItem('iroko_projects', JSON.stringify(projects));
  }, [projects, activeProjectId]);

  // Chat messages
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatStatus, setChatStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [activeWorkspace, setActiveWorkspace] = useState<ActiveWorkspaceInfo | null>(null);

  const resetChat = () => {
    setMessages([]);
    setChatStatus('idle');
    setComposerModeState('chat');
    setActiveWorkspace(null);
    setActiveView('home');
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/conversations/')) {
      window.history.pushState(null, '', '/');
    }
  };

  const loadConversation = async (id: string) => {
    try {
      await tokenService.bootstrap();
      const res = await tokenService.fetch(`/api/conversations/${encodeURIComponent(id)}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.messages)) {
          const mapped: Message[] = data.messages.map((m: any) => {
            let parsedThinking: string | undefined = undefined;
            if (m.thinking_logs) {
              try {
                const logs = typeof m.thinking_logs === 'string' ? JSON.parse(m.thinking_logs) : m.thinking_logs;
                if (Array.isArray(logs) && logs.length > 0) {
                  parsedThinking = logs.join('');
                } else if (typeof logs === 'string') {
                  parsedThinking = logs;
                }
              } catch {}
            }
            const metadata = typeof m.metadata === 'string' ? JSON.parse(m.metadata) : m.metadata;
            const thinking = parsedThinking || metadata?.thinking;
            return {
              id: m.id,
              role: m.role,
              content: m.content,
              timestamp: m.created_at ? new Date(m.created_at).getTime() : Date.now(),
              thinking,
              metadata
            };
          });
          setMessages(mapped);
        }
        if (data.conversation) {
          const convItem: HistoryItem = {
            id: data.conversation.id,
            topic: data.conversation.title,
            result: '',
            timestamp: new Date(data.conversation.updated_at).getTime(),
            mode: data.conversation.mode || 'chat',
            workspace_id: data.conversation.workspace_id || null
          };
          setHistory(prev => [convItem, ...prev.filter(h => h.id !== convItem.id)]);
          if (data.conversation.mode) {
            setComposerModeState(data.conversation.mode);
          }
        }
        setActiveView('chat');
        if (typeof window !== 'undefined' && window.location.pathname !== `/conversations/${id}`) {
          window.history.pushState(null, '', `/conversations/${id}`);
        }
      }
    } catch {}
  };

  // Agent Runtime live state
  const [runtimeConnected, setRuntimeConnected] = useState(false);
  const [runtimeStatus, setRuntimeStatus] = useState<AgentStatus>('idle');
  const [runtimeMessage, setRuntimeMessage] = useState<string>('Prêt');

  useEffect(() => {
    agentClient.connect();
    const unsubConn = agentClient.onConnectionChange((connected) => {
      setRuntimeConnected(connected);
    });
    const unsubEvents = agentClient.onEvent((event: AgentEvent) => {
      if (event.type === 'status') {
        setRuntimeStatus(event.status);
        if (event.message) setRuntimeMessage(event.message);
      } else if (event.type === ('conversations_cleared' as any)) {
        setHistory([]);
        localStorage.removeItem('iroko_history');
        resetChat();
      } else if (event.type === 'completed') {
        tokenService.fetch('/api/conversations')
          .then(res => res.json())
          .then(data => {
            if (Array.isArray(data.conversations)) {
              const runtimeItems: HistoryItem[] = data.conversations.map((c: any) => ({
                id: c.id,
                topic: c.title,
                time: 'Récemment',
                timestamp: new Date(c.updated_at).getTime(),
                mode: c.mode || 'chat',
                workspace_id: c.workspace_id || null
              }));
              setHistory(runtimeItems);
              localStorage.setItem('iroko_history', JSON.stringify(runtimeItems));
            }
          })
          .catch(() => {});
      }
    });

    return () => {
      unsubConn();
      unsubEvents();
    };
  }, []);

  // Global Keyboard Shortcuts (§ Mission M8.2)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 1. Ctrl+B / Cmd+B : Afficher / masquer la barre latérale
      if ((e.metaKey || e.ctrlKey) && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        setIsSidebarCollapsed(prev => !prev);
        return;
      }

      // 2. Ctrl+Maj+O / Cmd+Maj+O : Nouvelle discussion (pas Ctrl+N réservé au navigateur)
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'o' || e.key === 'O')) {
        e.preventDefault();
        resetChat();
        setActiveView('home');
        return;
      }

      // 3. Ctrl+K / Cmd+K : Palette de commandes universelle (Mission R4a)
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setIsCommandPaletteOpen(prev => !prev);
        return;
      }

      // 4. Ctrl+, / Cmd+, : Ouvrir / fermer les paramètres
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        setIsSettingsOpen(prev => !prev);
        return;
      }

      // 5. Échap : Hiérarchie stricte
      // Si une modale est ouverte, la fermer.
      // N'arrête la tâche que si aucun calque n'est ouvert et qu'une tâche tourne.
      if (e.key === 'Escape') {
        if (isSettingsOpen) {
          e.preventDefault();
          setIsSettingsOpen(false);
          return;
        }
        if (runtimeStatus === 'running') {
          e.preventDefault();
          agentClient.cancelTask();
          return;
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSettingsOpen, runtimeStatus]);

  // History — alimenté par le runtime SQLite (§21, §29)
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    try {
      const saved = localStorage.getItem('iroko_history');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.filter((h: any) => h && !h.id?.startsWith('h-') && !h.id?.startsWith('test-') && !h.topic?.includes('Test'));
        }
      }
    } catch (e) {}
    return [];
  });

  // Synchronisation avec le runtime SQLite local
  useEffect(() => {
    let isMounted = true;

    const syncWithRuntime = async () => {
      try {
        await tokenService.bootstrap();

        // Si l'URL pointe directement vers une discussion, charger ses messages
        const urlMatch = typeof window !== 'undefined' ? window.location.pathname.match(/^\/conversations\/([^/?#]+)/) : null;
        if (urlMatch && urlMatch[1]) {
          await loadConversation(urlMatch[1]);
        }

        const res = await tokenService.fetch('/api/conversations');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.conversations) && data.conversations.length > 0) {
            const runtimeItems: HistoryItem[] = data.conversations.map((c: any) => ({
              id: c.id,
              topic: c.title,
              time: 'Récemment',
              timestamp: new Date(c.updated_at).getTime(),
              mode: c.mode || 'chat',
              workspace_id: c.workspace_id || null
            }));
            if (isMounted) {
              setHistory(runtimeItems);
              localStorage.setItem('iroko_history', JSON.stringify(runtimeItems));
            }
            return;
          }
        }

        // Migration unique depuis localStorage si runtime vide
        const migrationDone = localStorage.getItem('iroko_migration_done');
        const saved = localStorage.getItem('iroko_history');
        if (!migrationDone && saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const validConversations = parsed.filter((h: any) => h && !h.id?.startsWith('h-') && !h.id?.startsWith('test-') && !h.topic?.includes('Test'));
            if (validConversations.length > 0) {
              const migRes = await tokenService.fetch('/api/migration/from-localstorage', {
                method: 'POST',
                body: JSON.stringify({ conversations: validConversations })
              });
              if (migRes.ok) {
                localStorage.setItem('iroko_migration_done', 'true');
                const refreshed = await tokenService.fetch('/api/conversations');
                if (refreshed.ok) {
                  const refData = await refreshed.json();
                  const items: HistoryItem[] = refData.conversations.map((c: any) => ({
                    id: c.id,
                    topic: c.title,
                    time: 'Récemment',
                    timestamp: new Date(c.updated_at).getTime(),
                    mode: c.mode || 'chat',
                    workspace_id: c.workspace_id || null
                  }));
                  if (isMounted) {
                    setHistory(items);
                    localStorage.setItem('iroko_history', JSON.stringify(items));
                  }
                }
              }
            } else {
              localStorage.removeItem('iroko_history');
              localStorage.setItem('iroko_migration_done', 'true');
            }
          }
        }
      } catch (e) {
        // En cas d'indisponibilité du runtime, conservation du cache localStorage
      }
    };

    syncWithRuntime();
    return () => { isMounted = false; };
  }, []);

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem('iroko_history');
  };

  const createProject = async (name: string, description?: string): Promise<Project> => {
    const newP: Project = {
      id: `proj-${Date.now()}`,
      name,
      description: description || 'Projet de travail Iroko',
      created_at: new Date().toISOString()
    };
    setProjects(prev => [newP, ...prev]);
    setActiveProjectId(newP.id);
    return newP;
  };

  const deleteProject = async (id: string) => {
    setProjects(prev => prev.filter(p => p.id !== id));
    if (activeProjectId === id) {
      const remaining = projects.filter(p => p.id !== id);
      setActiveProjectId(remaining.length > 0 ? remaining[0].id : null);
    }
  };

  // Synchronisation dynamique du titre de page (WCAG 2.4.2 — Lot 2)
  useEffect(() => {
    if (activeView === 'chat' && history.length > 0 && history[0]?.topic?.trim()) {
      document.title = `${history[0].topic.trim()} — Iroko`;
    } else {
      document.title = 'Iroko';
    }
  }, [activeView, history]);

  return (
    <AppContext.Provider
      value={{
        activeView,
        setActiveView,
        workspaceTab,
        setWorkspaceTab,
        isSidebarCollapsed,
        setIsSidebarCollapsed,
        isMobileSidebarOpen,
        setIsMobileSidebarOpen,
        isCommandPaletteOpen,
        setIsCommandPaletteOpen,
        isSettingsOpen,
        setIsSettingsOpen,
        activeSettingsTab,
        setActiveSettingsTab,
        conversationFont: settings.conversationFont,
        setConversationFont,
        theme: settings.theme,
        setTheme,
        animations: settings.animations,
        setAnimations,
        voiceLang: settings.voiceLang,
        setVoiceLang,
        voiceURI: settings.voiceURI,
        setVoiceURI,
        voiceSpeed: settings.voiceSpeed,
        setVoiceSpeed,
        notificationsEnabled: settings.notificationsEnabled,
        toggleNotifications,
        composerMode,
        setComposerMode,
        activeWorkspace,
        setActiveWorkspace,
        activeProjectId,
        setActiveProjectId,
        activeProject,
        activeAgent,
        setActiveAgent,
        activeModel,
        setActiveModel,
        activeProvider,
        setActiveProvider,
        projects,
        createProject,
        deleteProject,
        messages,
        setMessages,
        chatStatus,
        setChatStatus,
        resetChat,
        runtimeConnected,
        runtimeStatus,
        runtimeMessage,
        history,
        setHistory,
        clearHistory,
        modelsRefreshKey,
        refreshModels,
        loadConversation
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp doit être utilisé au sein de AppProvider');
  }
  return context;
}
