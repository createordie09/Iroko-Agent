import React, { useState, useEffect, useRef } from 'react';
import {
  Terminal, Play, Square, CheckCircle2,
  ChevronDown, ChevronRight,
  Layers, FileCode, GitBranch, FolderGit2, PanelRight, X
} from 'lucide-react';
import { agentClient } from '../../lib/agent-client';
import { AgentEvent, AgentStatus, PermissionRequest, PlanStep } from '../../../server/types/events';
import { PermissionPrompt } from '../agent/PermissionPrompt';
import { DiffViewer, ChangedFileRecord } from '../agent/DiffViewer';
import { UniversalComposer } from '../../components/composer/UniversalComposer';
import { useApp } from '../../context/AppContext';

export function CodeWorkspace() {
  const { activeProject } = useApp();

  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState<AgentStatus>('idle');
  const [statusMessage, setStatusMessage] = useState<string>('Prêt');
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [currentAssistantResponse, setCurrentAssistantResponse] = useState('');
  const [thinkingLogs, setThinkingLogs] = useState<string[]>([]);
  const [isThinkingOpen, setIsThinkingOpen] = useState(true);
  const [planSteps, setPlanSteps] = useState<PlanStep[]>([]);
  const [toolExecutions, setToolExecutions] = useState<Array<{
    callId: string; tool: string; input: any; result?: any; success?: boolean;
  }>>([]);
  const [changedFiles, setChangedFiles] = useState<ChangedFileRecord[]>([]);
  const [pendingPermission, setPendingPermission] = useState<PermissionRequest | null>(null);

  /* ── Panneau inspecteur : replié par défaut, s'ouvre au premier diff ── */
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [activeInspectorTab, setActiveInspectorTab] = useState<'diff' | 'plan'>('diff');
  const [workspaceMeta, setWorkspaceMeta] = useState<any>(null);

  const timelineScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('http://localhost:3001/workspace')
      .then(res => res.json())
      .then(data => setWorkspaceMeta(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    agentClient.connect();

    const unsubConnection = agentClient.onConnectionChange(setConnected);

    const unsubEvents = agentClient.onEvent((event: AgentEvent) => {
      switch (event.type) {
        case 'status':
          setStatus(event.status);
          if (event.message) setStatusMessage(event.message);
          break;
        case 'thinking':
          setThinkingLogs(prev => [...prev, event.content]);
          break;
        case 'plan':
          setPlanSteps(event.steps);
          break;
        case 'message':
          if (event.role === 'assistant') {
            setCurrentAssistantResponse(prev => prev + event.content);
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
        case 'completed':
          if (currentAssistantResponse) {
            setMessages(prev => [...prev, { role: 'assistant', content: currentAssistantResponse }]);
            setCurrentAssistantResponse('');
          }
          break;
        case 'error':
          setStatusMessage(event.message);
          break;
      }
    });

    return () => { unsubConnection(); unsubEvents(); };
  }, [currentAssistantResponse]);

  useEffect(() => {
    if (timelineScrollRef.current) {
      timelineScrollRef.current.scrollTo({ top: timelineScrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, currentAssistantResponse, thinkingLogs, toolExecutions]);

  const handleSendPrompt = (promptText: string) => {
    setMessages(prev => [...prev, { role: 'user', content: promptText }]);
    setThinkingLogs([]);
    setCurrentAssistantResponse('');
    setToolExecutions([]);
    agentClient.sendPrompt(promptText);
  };

  const handlePermissionResponse = (approved: boolean, scope: 'once' | 'session' | 'workspace') => {
    if (pendingPermission) {
      agentClient.respondPermission(pendingPermission.id, approved, scope);
      setPendingPermission(null);
    }
  };

  const hasActivity = messages.length > 0 || currentAssistantResponse || thinkingLogs.length > 0 || toolExecutions.length > 0;

  return (
    <div className="flex-1 h-full flex flex-col min-h-0 bg-[#0a0a0a] overflow-hidden">

      {/* ── Barre de statut (unique, plate, 40px) ── */}
      <div
        className="flex items-center justify-between px-4 border-b border-[#1f1f1f] bg-[#0a0a0a] shrink-0"
        style={{ height: 40 }}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-[13px] text-white">
            <FolderGit2 className="w-4 h-4 text-[#8a8a8a]" />
            <span>{activeProject?.name || 'Espace Iroko'}</span>
          </div>
          {workspaceMeta?.git?.branch && (
            <div className="flex items-center gap-1 text-[12px] text-[#8a8a8a] font-mono">
              <GitBranch className="w-3.5 h-3.5" />
              <span>{workspaceMeta.git.branch}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {status !== 'idle' ? (
            <button
              type="button"
              onClick={() => agentClient.cancelTask()}
              className="btn-ghost text-[13px] gap-1"
            >
              <Square className="w-3.5 h-3.5" />
              Arrêter
            </button>
          ) : (
            <>
              <button type="button" onClick={() => handleSendPrompt('npm test')} className="btn-ghost text-[13px] gap-1">
                <Play className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Tester</span>
              </button>
              <button type="button" onClick={() => handleSendPrompt('npm run build')} className="btn-ghost text-[13px] gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Compiler</span>
              </button>
            </>
          )}

          {/* Statut de connexion : point carré + texte, sans cadre */}
          <div className="flex items-center gap-1.5 text-[12px] text-[#8a8a8a]">
            <span
              className="inline-block w-1.5 h-1.5"
              style={{ background: connected ? '#ffffff' : '#555555' }}
            />
            <span>{statusMessage}</span>
          </div>

          {/* Bouton toggle inspecteur */}
          <button
            type="button"
            onClick={() => setInspectorOpen(v => !v)}
            className="btn-ghost px-1 py-1"
            title={inspectorOpen ? 'Fermer le panneau' : 'Ouvrir les modifications'}
          >
            <PanelRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Corps principal : timeline + inspecteur ── */}
      <div className="flex-1 min-h-0 flex overflow-hidden relative">

        {/* ── Timeline ── */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-[#0a0a0a]">

          <div
            ref={timelineScrollRef}
            className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 sm:px-6 py-6 sm:py-8"
          >
            {/* ── État vide ── */}
            {!hasActivity && (
              <div className="h-full flex flex-col items-center justify-center text-center max-w-[720px] mx-auto">
                <Terminal className="w-6 h-6 text-[#8a8a8a] mb-4" />
                <h3 className="text-[20px] font-semibold text-white mb-2" style={{ textWrap: 'balance' } as React.CSSProperties}>
                  Agent de Code Iroko Prêt
                </h3>
                <p className="text-[14px] text-[#8a8a8a]" style={{ textWrap: 'balance' } as React.CSSProperties}>
                  Donnez une consigne technique. Iroko inspectera le projet, exécutera des outils et appliquera les modifications avec votre approbation.
                </p>
                <div className="w-full mt-8 flex flex-col space-y-2">
                  {[
                    'Inspecte le workspace et résume les modules',
                    'Vérifie la syntaxe TypeScript et corrige les erreurs',
                    'Lance les tests unitaires et analyse les échecs'
                  ].map((example, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleSendPrompt(example)}
                      className="text-left text-[13px] text-[#8a8a8a] hover:text-white hover:bg-[#1a1a1a] transition-colors px-3 py-2"
                    >
                      {example}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Messages */}
            <div className="max-w-[720px] mx-auto space-y-4">
              {messages.map((m, idx) => (
                <div key={idx} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] text-[14px] leading-relaxed whitespace-pre-wrap ${
                      m.role === 'user'
                        ? 'bg-[#1a1a1a] text-white px-4 py-2'
                        : 'text-white'
                    }`}
                  >
                    {m.content}
                  </div>
                </div>
              ))}

              {/* Logs de réflexion */}
              {thinkingLogs.length > 0 && (
                <div className="border-l-2 border-[#1f1f1f] pl-3">
                  <button
                    type="button"
                    onClick={() => setIsThinkingOpen(!isThinkingOpen)}
                    className="flex items-center gap-2 text-[12px] text-[#8a8a8a] hover:text-white transition-colors mb-1"
                  >
                    {isThinkingOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    <span>Réflexion de l'agent ({thinkingLogs.length})</span>
                    {status === 'thinking' && (
                      <span className="inline-block w-1.5 h-1.5 bg-white animate-pulse" />
                    )}
                  </button>
                  {isThinkingOpen && (
                    <div className="font-mono text-[12px] text-[#8a8a8a] space-y-0.5 max-h-48 overflow-y-auto custom-scrollbar">
                      {thinkingLogs.map((log, i) => (
                        <div key={i} className="whitespace-pre-wrap leading-relaxed">{log}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Exécutions d'outils */}
              {toolExecutions.map(te => (
                <div key={te.callId} className="text-[12px] text-[#8a8a8a] border-l-2 border-[#1f1f1f] pl-3">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-3.5 h-3.5" />
                    <span className="font-mono font-semibold text-white">{te.tool}</span>
                    <span className={`text-[12px] ${
                      te.success === true ? 'text-white' : te.success === false ? 'text-[#8a8a8a]' : 'animate-pulse text-[#8a8a8a]'
                    }`}>
                      {te.success === true ? '✓ Succès' : te.success === false ? '✗ Échec' : '…'}
                    </span>
                  </div>
                  {te.input && (
                    <div className="font-mono text-[12px] text-[#555555] mt-0.5 truncate">
                      {JSON.stringify(te.input)}
                    </div>
                  )}
                </div>
              ))}

              {/* Réponse en streaming de l'assistant */}
              {currentAssistantResponse && (
                <div className="text-[14px] text-white leading-relaxed whitespace-pre-wrap">
                  {currentAssistantResponse}
                </div>
              )}
            </div>
          </div>

          {/* Dialogue d'autorisation */}
          {pendingPermission && (
            <div className="shrink-0 border-t border-[#1f1f1f] bg-[#0a0a0a] px-4 py-3">
              <PermissionPrompt
                request={pendingPermission}
                onRespond={(approved, scope) => handlePermissionResponse(approved, scope)}
              />
            </div>
          )}

          {/* Compositeur : centré, 720px max */}
          <div className="shrink-0 flex justify-center px-4 sm:px-6 pb-6">
            <UniversalComposer
              onSend={handleSendPrompt}
              isLoading={status !== 'idle'}
              placeholder="Donnez une consigne à l'agent de code…"
            />
          </div>
        </div>

        {/* ── Panneau inspecteur : responsive (tiroir sur mobile, fixe 320px sur desktop) ── */}
        {inspectorOpen && (
          <div
            className="flex flex-col border-l border-[#1f1f1f] bg-[#0a0a0a] shrink-0 fixed inset-y-0 right-0 z-40 w-full sm:w-80 md:static md:w-80"
          >
            {/* Onglets */}
            <div className="flex items-center justify-between border-b border-[#1f1f1f] shrink-0 px-2" style={{ height: 40 }}>
              <div className="flex items-center h-full">
                <button
                  type="button"
                  onClick={() => setActiveInspectorTab('diff')}
                  className={`flex items-center gap-1.5 px-3 h-full text-[13px] border-b-2 transition-colors ${
                    activeInspectorTab === 'diff'
                      ? 'border-white text-white'
                      : 'border-transparent text-[#8a8a8a] hover:text-white'
                  }`}
                >
                  <FileCode className="w-4 h-4" />
                  Modifications ({changedFiles.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveInspectorTab('plan')}
                  className={`flex items-center gap-1.5 px-3 h-full text-[13px] border-b-2 transition-colors ${
                    activeInspectorTab === 'plan'
                      ? 'border-white text-white'
                      : 'border-transparent text-[#8a8a8a] hover:text-white'
                  }`}
                >
                  <Layers className="w-4 h-4" />
                  Plan ({planSteps.length})
                </button>
              </div>
              <button
                type="button"
                onClick={() => setInspectorOpen(false)}
                className="btn-ghost p-1"
                title="Fermer le panneau"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Contenu du panneau */}
            <div className="flex-1 min-h-0 overflow-hidden">
              {activeInspectorTab === 'diff' ? (
                <DiffViewer files={changedFiles} className="h-full" />
              ) : (
                <div className="h-full overflow-y-auto custom-scrollbar p-4">
                  {planSteps.length === 0 ? (
                    <p className="text-[13px] text-[#8a8a8a]">Aucun plan en cours.</p>
                  ) : (
                    <div className="space-y-2">
                      {planSteps.map(step => (
                        <div key={step.id} className="text-[13px]">
                          <div className="flex items-center gap-2">
                            <span
                              className="inline-block w-1.5 h-1.5"
                              style={{
                                background:
                                  step.status === 'completed'
                                    ? '#ffffff'
                                    : step.status === 'in_progress'
                                    ? '#8a8a8a'
                                    : '#333333'
                              }}
                            />
                            <span className={step.status === 'completed' ? 'text-[#8a8a8a]' : 'text-white'}>
                              {step.title}
                            </span>
                          </div>
                          {step.description && (
                            <p className="text-[12px] text-[#555555] mt-0.5 pl-3.5">{step.description}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
