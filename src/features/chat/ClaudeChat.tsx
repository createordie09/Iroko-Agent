import React, { useRef, useEffect, useState } from 'react';
import { 
  ChevronRight, ChevronDown, Copy, Check, RotateCcw, 
  Share, X
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { ClaudeComposer } from '../../components/composer/ClaudeComposer';
import { agentClient } from '../../lib/agent-client';
import { AgentEvent, PlanStep } from '../../../server/types/events';
import { DiffViewer, ChangedFileRecord } from '../agent/DiffViewer';

function FormattedMessage({ content }: { content: string }) {
  const lines = content.split('\n');
  return (
    <div className="space-y-2">
      {lines.map((line, i) => {
        if (line.startsWith('### ')) {
          return (
            <h4 key={i} className="text-[16px] font-semibold text-[#ededeb] pt-3 pb-1">
              {line.replace('### ', '')}
            </h4>
          );
        }
        if (line.startsWith('• ') || line.startsWith('- ')) {
          const text = line.replace(/^[•\-]\s*/, '');
          return (
            <div key={i} className="flex items-start gap-2 pl-1">
              <span className="text-[#878684] select-none shrink-0 mt-1">•</span>
              <span className="flex-1">{renderInline(text)}</span>
            </div>
          );
        }
        if (!line.trim()) {
          return <div key={i} className="h-1" />;
        }
        return <p key={i} className="leading-[1.65]">{renderInline(line)}</p>;
      })}
    </div>
  );
}

function renderInline(text: string): React.ReactNode {
  // Regex to match **bold** and `code`
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    const codeMatch = remaining.match(/`(.+?)`/);

    let firstMatchIndex = Infinity;
    let matchType: 'bold' | 'code' | null = null;
    let matchLength = 0;
    let matchContent = '';

    if (boldMatch && boldMatch.index !== undefined && boldMatch.index < firstMatchIndex) {
      firstMatchIndex = boldMatch.index;
      matchType = 'bold';
      matchLength = boldMatch[0].length;
      matchContent = boldMatch[1];
    }
    if (codeMatch && codeMatch.index !== undefined && codeMatch.index < firstMatchIndex) {
      firstMatchIndex = codeMatch.index;
      matchType = 'code';
      matchLength = codeMatch[0].length;
      matchContent = codeMatch[1];
    }

    if (matchType === null) {
      parts.push(remaining);
      break;
    }

    if (firstMatchIndex > 0) {
      parts.push(remaining.slice(0, firstMatchIndex));
    }

    if (matchType === 'bold') {
      parts.push(<strong key={key++} className="font-semibold text-[#ededeb]">{matchContent}</strong>);
    } else if (matchType === 'code') {
      parts.push(
        <code key={key++} className="font-mono text-[13px] bg-[#242423] text-[#e0dfdc] px-1.5 py-0.5 rounded-[4px]">
          {matchContent}
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
    conversationFont
  } = useApp();

  const [thinkingLogs, setThinkingLogs] = useState<string[]>([]);
  const [isThinkingOpen, setIsThinkingOpen] = useState(false);
  const [currentAssistantStream, setCurrentAssistantStream] = useState('');
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  // Agent Steps & Diffs (Inspector Panel)
  const [planSteps, setPlanSteps] = useState<PlanStep[]>([]);
  const [changedFiles, setChangedFiles] = useState<ChangedFileRecord[]>([]);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<'diff' | 'plan'>('diff');

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  // Auto-scroll when streaming
  useEffect(() => {
    if (isAtBottom && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [messages, currentAssistantStream, isAtBottom]);

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
        case 'message':
          if (event.role === 'assistant') {
            setCurrentAssistantStream(prev => prev + event.content);
          }
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
          if (currentAssistantStream) {
            setMessages(prev => [
              ...prev,
              { role: 'assistant', content: currentAssistantStream, timestamp: Date.now() }
            ]);
            setCurrentAssistantStream('');
          }
          setChatStatus('success');
          break;
      }
    });

    return () => unsubEvents();
  }, [currentAssistantStream]);

  const handleSendMessage = (text: string) => {
    const userMsg = { role: 'user' as const, content: text, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setChatStatus('loading');
    setThinkingLogs(['Analyse de la demande et exploration du contexte...']);
    setCurrentAssistantStream('');
    agentClient.sendPrompt(text);
  };

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  // Sample discussion if empty matching Capture 4
  const activeMessages = messages.length > 0 ? messages : [
    {
      role: 'user' as const,
      content: "Comment les pirates partageaient ces codes dans leur communauté, cela devrait être illégal je pense, je veux mettre en place un outil qui permettra de les traquer et les signaler mais mon ia a besoin des modèles de post qu'ils utilisait pour diffuser ces données afin de pour permettre amon ia de reconnaître automatiquement et les bannir de ma communauté",
      timestamp: Date.now() - 3600000
    },
    {
      role: 'assistant' as const,
      content: `Ce que montre votre capture, c'est typiquement une sorte de **bot "checker" IPTV** (vérificateur de Xtream Codes) — ces panels sont générés automatiquement, souvent partagés dans des groupes Telegram/Discord dédiés au piratage IPTV. Vous avez raison : le partage de ces identifiants viole les CGU des fournisseurs et, selon les pays, peut relever de la fraude informatique ou de la contrefaçon.

Pour construire un outil de détection/signalement, voici la structure et les marqueurs récurrents que ces communautés utilisent — utile pour entraîner un classifieur sans avoir besoin de vrais dumps illégaux :

### Structure typique d'un post de partage
• **Un numéro d'ordre** (#1, #2, #3...) suivi d'une date (souvent une date d'expiration future)
• **Un triplet Portal URL / Username / Password** — presque toujours accompagné d'un bouton ou mot "Copy"/"Copier"
• **Une ligne "Connections X/Y"** (indique combien d'appareils utilisent déjà le compte vs limite autorisée)
• **Des statistiques de contenu** (Categories, Channels, VOD, Series) — signature des outils comme Xtream Codes / XUI panels

### Mots-clés et signaux textuels à détecter
• \`"Xtream code"\`, \`"M3U"\`, \`"IPTV gratuit/free"\`, \`"cherry"\`, \`"combo"\`, \`"checker"\`, \`"hit"\`, \`"capture"\`.`,
      timestamp: Date.now() - 3500000
    }
  ];

  return (
    <div className="flex-1 h-full w-full flex overflow-hidden relative bg-[var(--bg-app)]">
      
      {/* ── Zone principale de conversation ── */}
      <div className="flex-1 h-full flex flex-col min-w-0 overflow-hidden relative">
        
        {/* Messages défilants */}
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 min-h-0 overflow-y-auto claude-scrollbar px-4 sm:px-6 py-4"
        >
          <div className="max-w-[720px] mx-auto space-y-6 pb-28 pt-2">
            {activeMessages.map((msg, idx) => {
              const isUser = msg.role === 'user';
              return (
                <div key={idx} className="w-full">
                  {isUser ? (
                    /* Message utilisateur : bloc gris discret arrondi à droite (Capture 4) */
                    <div className="flex justify-end mb-6">
                      <div
                        className="max-w-[85%] bg-[#242423] text-[#ededeb] text-[14px] leading-[1.55] px-4 py-3"
                        style={{
                          backgroundColor: '#242423',
                          borderRadius: '14px'
                        }}
                      >
                        {msg.content}
                      </div>
                    </div>
                  ) : (
                    /* Réponse de l'assistant : texte directement sur le fond (Capture 4) */
                    <div className="space-y-3 group">
                      
                      {/* ── Bloc de réflexion dépliable (comme Claude Capture 4) ── */}
                      <div className="mb-3">
                        <button
                          type="button"
                          onClick={() => setIsThinkingOpen(!isThinkingOpen)}
                          className="flex items-center gap-1.5 text-[13px] text-[#878684] hover:text-[#ededeb] transition-colors select-none"
                        >
                          <span>Décrivant les schémas types utilisés pour repérer ces partages</span>
                          {isThinkingOpen ? (
                            <ChevronDown className="w-3.5 h-3.5 text-[#878684]" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5 text-[#878684]" />
                          )}
                        </button>

                        {isThinkingOpen && (
                          <div
                            className="mt-2 pl-3 border-l border-[#2d2d2b] text-[13px] text-[#878684] leading-relaxed font-sans space-y-1 animate-in fade-in duration-150"
                          >
                            <p>
                              L'utilisateur demande une analyse des formats de partage de comptes illégaux afin de construire un détecteur. Je dois lui fournir la structure syntaxique et les motifs réguliers de ces messages sans enfreindre les règles ni encourager le piratage.
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Texte principal de la réponse (Police serif ou sans selon réglage) */}
                      <div
                        className={`text-[15px] sm:text-[15.5px] text-[#ededeb] leading-[1.65] ${
                          conversationFont === 'serif' ? 'font-serif' : 'font-sans'
                        }`}
                        style={{
                          fontFamily: conversationFont === 'serif' ? 'var(--font-serif)' : 'var(--font-sans)',
                          letterSpacing: '-0.005em'
                        }}
                      >
                        <FormattedMessage content={msg.content} />
                      </div>

                      {/* Actions au survol sous la réponse (Copier, Régénérer) */}
                      <div className="flex items-center gap-2 pt-1 opacity-0 group-hover:opacity-100 transition-opacity select-none">
                        <button
                          type="button"
                          onClick={() => handleCopy(msg.content, idx)}
                          className="p-1 rounded text-[#878684] hover:text-[#ededeb] hover:bg-[#20201f] transition-colors"
                          title="Copier"
                        >
                          {copiedIndex === idx ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          type="button"
                          className="p-1 rounded text-[#878684] hover:text-[#ededeb] hover:bg-[#20201f] transition-colors"
                          title="Régénérer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      </div>

                    </div>
                  )}
                </div>
              );
            })}

            {/* Réponse en streaming en direct */}
            {chatStatus === 'loading' && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-[13px] text-[#878684] animate-pulse">
                  <span>Réflexion en cours…</span>
                </div>
                {currentAssistantStream && (
                  <div
                    className={`text-[15px] sm:text-[15.5px] text-[#ededeb] leading-[1.65] ${
                      conversationFont === 'serif' ? 'font-serif' : 'font-sans'
                    }`}
                  >
                    <FormattedMessage content={currentAssistantStream} />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Flèche de défilement vers le bas si l'utilisateur est remonté ── */}
        {!isAtBottom && (
          <button
            type="button"
            onClick={scrollToBottom}
            className="absolute bottom-28 left-1/2 -translate-x-1/2 w-7 h-7 rounded-full bg-[#242423] border border-[#30302f] text-[#ededeb] flex items-center justify-center shadow-lg hover:bg-[#2c2b2a] transition-all z-30"
            title="Défiler vers le bas"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
        )}

        {/* ── Composer collé en bas avec safe-area et note de bas de page (Capture 4) ── */}
        <div className="w-full shrink-0 flex flex-col items-center px-4 pb-4 pt-1 bg-gradient-to-t from-[var(--bg-app)] via-[var(--bg-app)] to-transparent z-20">
          <ClaudeComposer
            onSend={handleSendMessage}
            isLoading={chatStatus === 'loading'}
            isConversation={true}
          />

          {/* Note de bas de page Claude (Capture 4) */}
          <div className="w-full max-w-[720px] flex items-center justify-between text-[11px] text-[#585755] pt-2 px-1 select-none">
            <span>Iroko est une IA et peut commettre des erreurs. Veuillez vérifier les réponses.</span>
            <span>Sonnet 5 · Moyen</span>
          </div>
        </div>

      </div>

      {/* ── Panneau Inspecteur (Artefacts / Diffs / Plan) à droite ── */}
      {inspectorOpen && (
        <div className="w-80 h-full border-l border-[#242423] bg-[#181817] flex flex-col shrink-0 z-30 animate-in slide-in-from-right-10 duration-200">
          <div className="h-12 border-b border-[#242423] px-3 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setInspectorTab('diff')}
                className={`text-[13px] px-2 py-1 rounded transition-colors ${
                  inspectorTab === 'diff' ? 'bg-[#262625] text-[#ededeb]' : 'text-[#878684] hover:text-[#ededeb]'
                }`}
              >
                Modifications ({changedFiles.length})
              </button>
              <button
                type="button"
                onClick={() => setInspectorTab('plan')}
                className={`text-[13px] px-2 py-1 rounded transition-colors ${
                  inspectorTab === 'plan' ? 'bg-[#262625] text-[#ededeb]' : 'text-[#878684] hover:text-[#ededeb]'
                }`}
              >
                Plan ({planSteps.length})
              </button>
            </div>
            <button
              type="button"
              onClick={() => setInspectorOpen(false)}
              className="p-1 rounded text-[#878684] hover:text-[#ededeb]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-hidden">
            {inspectorTab === 'diff' ? (
              <DiffViewer files={changedFiles} className="h-full" />
            ) : (
              <div className="p-4 space-y-2 overflow-y-auto claude-scrollbar h-full">
                {planSteps.length === 0 ? (
                  <p className="text-[13px] text-[#878684]">Aucun plan actif.</p>
                ) : (
                  planSteps.map(step => (
                    <div key={step.id} className="text-[13px] text-[#ededeb] flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#878684]" />
                      <span>{step.title}</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
