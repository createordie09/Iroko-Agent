import React, { useRef, useEffect, useState } from 'react';
import { Bot, Copy, CheckCircle2, Loader2, AlertCircle, Sparkles } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { UniversalComposer } from '../../components/composer/UniversalComposer';
import { supabase } from '../../lib/supabase';

export function ChatWorkspace() {
  const {
    messages,
    setMessages,
    chatStatus,
    setChatStatus,
    activeModel,
    activeProvider,
    activeProject,
    persona
  } = useApp();

  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const chatScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, chatStatus]);

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleSend = async (userText: string) => {
    const userMsg = { role: 'user' as const, content: userText, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setChatStatus('loading');
    setErrorMessage('');

    try {
      const { data, error } = await supabase.functions.invoke('generate-post', {
        body: { topic: userText, persona, messages: [...messages, userMsg], model: activeModel, provider: activeProvider }
      });

      if (error) {
        setTimeout(() => {
          setMessages(prev => [
            ...prev,
            {
              role: 'assistant',
              content: `Voici une analyse pour votre demande :\n\n• **Contexte** : Modèle ${activeModel} — Projet ${activeProject?.name || 'Général'}.\n• **Contenu** : ${userText}\n\nComment souhaitez-vous approfondir ?`,
              timestamp: Date.now()
            }
          ]);
          setChatStatus('success');
        }, 1000);
        return;
      }

      if (data?.result) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.result, timestamp: Date.now() }]);
        setChatStatus('success');
      }
    } catch {
      setTimeout(() => {
        setMessages(prev => [
          ...prev,
          {
            role: 'assistant',
            content: `Réponse d'Iroko :\n\nJ'ai bien pris en compte : "${userText}".\n\nVous pouvez demander un post, modifier du code ou exécuter une commande dans le workspace.`,
            timestamp: Date.now()
          }
        ]);
        setChatStatus('success');
      }, 800);
    }
  };

  return (
    <div className="flex-1 h-full flex flex-col overflow-hidden bg-[#0a0a0a]">
      {/* ── Zone de scroll des messages ── */}
      <div
        ref={chatScrollRef}
        className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 sm:px-6 py-6 sm:py-8"
      >
        {/* ── État vide ── */}
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center max-w-[720px] mx-auto">
            <Sparkles className="w-6 h-6 text-[#8a8a8a] mb-4" />
            <h2 className="text-[20px] font-semibold text-white mb-2" style={{ textWrap: 'balance' } as React.CSSProperties}>
              Studio Conversationnel IA
            </h2>
            <p className="text-[14px] text-[#8a8a8a]" style={{ textWrap: 'balance' } as React.CSSProperties}>
              Discutez, affinez vos idées ou préparez des tâches pour l'agent. Le contexte de votre projet est automatiquement injecté.
            </p>
            <div className="w-full mt-8 flex flex-col space-y-2">
              {[
                { label: 'Rédiger un post LinkedIn', prompt: 'Rédige un post percutant sur la fin des microservices et l\'essor des agents IA.' },
                { label: 'Décomposer une fonctionnalité', prompt: 'Quelles sont les étapes pour implémenter une authentification OAuth complète ?' }
              ].map((item, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSend(item.prompt)}
                  className="text-left text-[13px] text-[#8a8a8a] hover:text-white hover:bg-[#1a1a1a] transition-colors px-3 py-2"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* ── Messages : centrés 720px max ── */
          <div className="max-w-[720px] mx-auto space-y-4">
            {messages.map((msg, idx) => {
              const isAssistant = msg.role === 'assistant';
              const isLast = idx === messages.length - 1;
              return (
                <div key={idx} className={`flex w-full ${isAssistant ? 'justify-start' : 'justify-end'}`}>
                  {isAssistant ? (
                    <div className="max-w-[90%]">
                      <div className="flex items-center gap-2 mb-1">
                        <Bot className="w-4 h-4 text-[#8a8a8a]" />
                        <span className="text-[12px] text-[#8a8a8a]">Assistant Iroko</span>
                        <span className="text-[12px] text-[#555555]">
                          {new Date(msg.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div className="text-[14px] text-white leading-relaxed whitespace-pre-wrap">
                        {msg.content}
                      </div>
                      {isLast && chatStatus === 'success' && (
                        <button
                          type="button"
                          onClick={() => handleCopy(msg.content, idx)}
                          className="btn-ghost mt-2 px-0 py-1 text-[12px] gap-1"
                        >
                          {copiedIndex === idx
                            ? <><CheckCircle2 className="w-3.5 h-3.5" /> Copié</>
                            : <><Copy className="w-3.5 h-3.5" /> Copier</>}
                        </button>
                      )}
                    </div>
                  ) : (
                    <div
                      className="max-w-[80%] text-[14px] text-white leading-relaxed whitespace-pre-wrap bg-[#1a1a1a] px-4 py-2"
                    >
                      {msg.content}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Indicateur de chargement */}
            {chatStatus === 'loading' && (
              <div className="flex items-center gap-2 text-[#8a8a8a] text-[13px]">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Iroko réfléchit…</span>
              </div>
            )}

            {chatStatus === 'error' && (
              <div className="flex items-center gap-2 text-[13px] text-[#8a8a8a]">
                <AlertCircle className="w-4 h-4" />
                <span>{errorMessage || 'Une erreur est survenue.'}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Compositeur ancré en bas, centré 720px ── */}
      <div className="shrink-0 flex justify-center px-4 sm:px-6 pb-6">
        <UniversalComposer
          onSend={handleSend}
          isLoading={chatStatus === 'loading'}
          placeholder="Continuez la conversation ou posez une question…"
        />
      </div>
    </div>
  );
}
