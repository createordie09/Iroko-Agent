import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Project, Message, Persona, KnowledgeItem, CalendarItem, HistoryItem } from '../types';
import { supabase } from '../lib/supabase';
import { agentClient } from '../lib/agent-client';
import { AgentEvent, AgentStatus } from '../../server/types/events';

export type NavView = 'home' | 'chat' | 'workspace' | 'projects' | 'tasks' | 'settings' | 'activity';
export type WorkspaceTab = 'code' | 'files' | 'terminal' | 'git' | 'diffs';
export type AgentType = 'coder' | 'editorial' | 'planner' | 'reviewer';
export type ConversationFont = 'serif' | 'sans';
export type ThemeMode = 'system' | 'light' | 'dark';
export type AnimationsMode = 'system' | 'reduced';
export type ComposerMode = 'chat' | 'code';

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

  // Settings Modal & Preferences (Claude reference)
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
  composerMode: ComposerMode;
  setComposerMode: (m: ComposerMode) => void;

  // CURRENT CONTEXT (The OS Core)
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
  
  // Editorial / Tasks / Persona
  persona: Persona;
  setPersona: (p: Persona) => void;
  knowledgeBase: KnowledgeItem[];
  setKnowledgeBase: React.Dispatch<React.SetStateAction<KnowledgeItem[]>>;
  calendarItems: CalendarItem[];
  setCalendarItems: React.Dispatch<React.SetStateAction<CalendarItem[]>>;
  history: HistoryItem[];
  clearHistory: () => void;
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
  const [conversationFont, setConversationFont] = useState<ConversationFont>(() => {
    return (localStorage.getItem('iroko_font') as ConversationFont) || 'serif';
  });
  const [theme, setTheme] = useState<ThemeMode>(() => {
    return (localStorage.getItem('iroko_theme') as ThemeMode) || 'dark';
  });
  const [animations, setAnimations] = useState<AnimationsMode>('system');
  const [composerMode, setComposerMode] = useState<ComposerMode>('chat');

  useEffect(() => {
    localStorage.setItem('iroko_font', conversationFont);
  }, [conversationFont]);

  useEffect(() => {
    localStorage.setItem('iroko_theme', theme);
  }, [theme]);

  // Current Context (Core)
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeAgent, setActiveAgent] = useState<AgentType>('coder');
  const [activeModel, setActiveModel] = useState<string>('anthropic/claude-3.5-sonnet');
  const [activeProvider, setActiveProvider] = useState<string>('openrouter');

  // Projects
  const [projects, setProjects] = useState<Project[]>(() => {
    const saved = localStorage.getItem('iroko_projects');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return [
      { id: 'proj-iroko', name: 'Oria Projet', description: 'AI Native Coding Platform', created_at: new Date().toISOString() },
      { id: 'proj-ds2api', name: 'Configuration de DS2API po...', description: 'API configuration', created_at: new Date().toISOString() },
      { id: 'proj-relais', name: 'Relais App', description: 'Relais service', created_at: new Date().toISOString() }
    ];
  });

  // Active project calculation
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

  const resetChat = () => {
    setMessages([]);
    setChatStatus('idle');
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
      }
    });

    return () => {
      unsubConn();
      unsubEvents();
    };
  }, []);

  // Global Keyboard Shortcuts (⌘, or Escape)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        setIsSettingsOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Persona / Voice
  const [persona, setPersona] = useState<Persona>(() => {
    const saved = localStorage.getItem('iroko_persona');
    return saved ? JSON.parse(saved) : {
      secteur: 'Intelligence Artificielle & DevTools',
      style: 'Expert, direct, percutant et technique',
      motsAEviter: 'Révolutionnaire, game-changer, incroyable',
      exemplePost: 'Nous avons transformé notre agent autonome...'
    };
  });

  const [knowledgeBase, setKnowledgeBase] = useState<KnowledgeItem[]>([]);
  const [calendarItems, setCalendarItems] = useState<CalendarItem[]>([]);

  // History with sample Claude-style discussion threads
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    const saved = localStorage.getItem('iroko_history');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return [
      { id: 'h-1', topic: 'Refonte interface avec identité Claude', timestamp: Date.now() - 3600000, result: 'Interface épurée et moderne.' },
      { id: 'h-2', topic: 'Améliorer un prompt pour agent de code', timestamp: Date.now() - 7200000, result: 'Prompt de code optimisé.' },
      { id: 'h-3', topic: 'Partager des codes avec la communauté', timestamp: Date.now() - 14400000, result: 'Modèle de partage communautaire.' },
      { id: 'h-4', topic: 'Jugement et dignité dans les systèmes IA', timestamp: Date.now() - 28800000, result: 'Essai éthique.' },
      { id: 'h-5', topic: "Améliorer un prompt de design system", timestamp: Date.now() - 86400000, result: 'Spécifications de tokens.' },
      { id: 'h-6', topic: "La matrice de l'IA : une expérience fluide", timestamp: Date.now() - 172800000, result: 'Analyse comparative.' },
      { id: 'h-7', topic: 'Comparaison de modèles et latence', timestamp: Date.now() - 259200000, result: 'Benchmarks OpenRouter.' },
      { id: 'h-8', topic: 'Running a server locally with proxy', timestamp: Date.now() - 345600000, result: 'Setup local server.' },
      { id: 'h-9', topic: 'Informations sur une offre cloud', timestamp: Date.now() - 432000000, result: 'Tarification.' },
      { id: 'h-10', topic: 'Performance des modèles en production', timestamp: Date.now() - 518400000, result: 'Métriques clés.' }
    ];
  });

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
    try {
      await supabase.from('projects').insert(newP);
    } catch (e) {}
    setProjects(prev => [newP, ...prev]);
    setActiveProjectId(newP.id);
    return newP;
  };

  const deleteProject = async (id: string) => {
    try {
      await supabase.from('projects').delete().eq('id', id);
    } catch (e) {}
    setProjects(prev => prev.filter(p => p.id !== id));
    if (activeProjectId === id) {
      const remaining = projects.filter(p => p.id !== id);
      setActiveProjectId(remaining.length > 0 ? remaining[0].id : null);
    }
  };

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
        conversationFont,
        setConversationFont,
        theme,
        setTheme,
        animations,
        setAnimations,
        composerMode,
        setComposerMode,
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
        persona,
        setPersona,
        knowledgeBase,
        setKnowledgeBase,
        calendarItems,
        setCalendarItems,
        history,
        clearHistory
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
