import React, { useState, useEffect } from 'react';
import { 
  X, Search, SlidersHorizontal, User, ShieldCheck, CreditCard, 
  Cpu, Brain, Sparkles, Terminal, FileText, Share2, Boxes, 
  KeyRound, Monitor, Sun, Moon, ChevronDown, Check, RefreshCw, Trash2, Plus, Eye, EyeOff
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { ProviderCredential } from '../../../server/models/types';

export function ClaudeSettingsModal() {
  const {
    isSettingsOpen,
    setIsSettingsOpen,
    activeSettingsTab,
    setActiveSettingsTab,
    conversationFont,
    setConversationFont,
    theme,
    setTheme,
    animations,
    setAnimations
  } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [notificationToggle, setNotificationToggle] = useState(false);
  const [selectedVoiceSpeed, setSelectedVoiceSpeed] = useState('Normale');
  const [selectedVoiceLang, setSelectedVoiceLang] = useState('Français');

  // Iroko Providers & Keys data
  const [providers, setProviders] = useState<any[]>([]);
  const [credentials, setCredentials] = useState<ProviderCredential[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState('openrouter');
  const [loadingKeys, setLoadingKeys] = useState(false);
  const [newKeyLabel, setNewKeyLabel] = useState('');
  const [newKeyRaw, setNewKeyRaw] = useState('');
  const [showAddKeyForm, setShowAddKeyForm] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  const API_BASE = (import.meta as any).env?.VITE_AGENT_HTTP_URL || 'http://localhost:3001';

  const fetchKeys = async () => {
    setLoadingKeys(true);
    try {
      const [provRes, credRes] = await Promise.all([
        fetch(`${API_BASE}/api/providers`).then(r => r.json()),
        fetch(`${API_BASE}/api/credentials`).then(r => r.json())
      ]);
      if (provRes.providers) setProviders(provRes.providers.filter((p: any) => p.id !== 'mock'));
      if (credRes.credentials) setCredentials(credRes.credentials);
    } catch {}
    setLoadingKeys(false);
  };

  useEffect(() => {
    if (isSettingsOpen) fetchKeys();
  }, [isSettingsOpen]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsSettingsOpen(false);
    };
    if (isSettingsOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSettingsOpen]);

  if (!isSettingsOpen) return null;

  const leftNavItems = [
    {
      group: 'Paramètres',
      items: [
        { id: 'preferences', label: 'Préférences', icon: SlidersHorizontal },
        { id: 'providers', label: 'Fournisseurs & Clés', icon: KeyRound },
        { id: 'account', label: 'Compte', icon: User },
        { id: 'privacy', label: 'Confidentialité', icon: ShieldCheck },
        { id: 'billing', label: 'Facturation', icon: CreditCard },
        { id: 'capabilities', label: 'Capacités', icon: Cpu },
        { id: 'memory', label: 'Mémoire', icon: Brain },
        { id: 'thinking', label: 'Réfléchir', icon: Sparkles },
        { id: 'code', label: 'Claude Code', icon: Terminal }
      ]
    },
    {
      group: 'Personnaliser',
      items: [
        { id: 'skills', label: 'Compétences', icon: FileText },
        { id: 'connectors', label: 'Connecteurs', icon: Share2 },
        { id: 'plugins', label: 'Plugins', icon: Boxes }
      ]
    }
  ];

  return (
    /* Fond derrière la modale : voile noir semi-opaque SANS flou (Capture 2 & Règle 5) */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) setIsSettingsOpen(false);
      }}
    >
      {/* ── Fenêtre modale : ~920×720px, rayon --radius-modal (Capture 2) ── */}
      <div
        className="w-full max-w-[920px] h-[720px] max-h-[90vh] bg-[#1a1a19] border border-[#2d2d2b] rounded-[var(--radius-modal)] flex overflow-hidden shadow-2xl relative select-none animate-in zoom-in-95 duration-150"
        style={{
          backgroundColor: '#1a1a19',
          borderColor: '#2d2d2b'
        }}
      >
        {/* ── Bouton Fermer × en haut à droite ── */}
        <button
          type="button"
          onClick={() => setIsSettingsOpen(false)}
          className="absolute top-4 right-4 p-1.5 rounded-[6px] text-[#878684] hover:text-[#ededeb] hover:bg-[#242423] transition-colors z-20"
          title="Fermer (Échap)"
        >
          <X className="w-4 h-4" />
        </button>

        {/* ── Colonne gauche (~172px - 190px) ── */}
        <div
          className="w-[185px] sm:w-[195px] h-full flex flex-col border-r border-[#242423] bg-[#151515] p-3 shrink-0"
        >
          {/* Champ de recherche */}
          <div className="relative mb-3">
            <Search className="w-3.5 h-3.5 text-[#878684] absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Rechercher"
              className="w-full bg-[#20201f] border border-[#2d2d2b] rounded-[6px] pl-8 pr-2 py-1 text-[13px] text-[#ededeb] placeholder:text-[#6a6967] focus:outline-none focus:border-[#444]"
            />
          </div>

          {/* Groupes de navigation */}
          <div className="flex-1 overflow-y-auto claude-scrollbar space-y-4">
            {leftNavItems.map(group => (
              <div key={group.group} className="space-y-0.5">
                <div className="text-[11px] text-[#878684] px-2 py-1 font-normal">
                  {group.group}
                </div>
                {group.items.map(item => {
                  const Icon = item.icon;
                  const isSelected = activeSettingsTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setActiveSettingsTab(item.id)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-[6px] text-[13px] text-left transition-colors ${
                        isSelected
                          ? 'bg-[#2b2a29] text-[#ededeb] font-medium'
                          : 'text-[#c4c3be] hover:text-[#ededeb] hover:bg-[#20201f]'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 text-[#878684] shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* ── Colonne droite : Contenu du panneau ── */}
        <div className="flex-1 h-full overflow-y-auto claude-scrollbar p-6 sm:p-8 bg-[#1a1a19]">
          
          {activeSettingsTab === 'preferences' && (
            <div className="space-y-6 max-w-xl">
              
              {/* ── Section Apparence (Capture 2) ── */}
              <div>
                <h3 className="text-[14px] font-semibold text-[#ededeb] mb-4">
                  Apparence
                </h3>

                {/* Thème */}
                <div className="flex items-center justify-between py-3 border-b border-[#242423]">
                  <span className="text-[13px] text-[#ededeb]">Thème</span>
                  <div className="flex items-center bg-[#151515] p-0.5 rounded-[var(--radius-button)] border border-[#2b2a29]">
                    <button
                      type="button"
                      onClick={() => setTheme('system')}
                      className={`p-1.5 rounded-[6px] text-xs transition-colors ${
                        theme === 'system' ? 'bg-[#2b2a29] text-white' : 'text-[#878684] hover:text-white'
                      }`}
                      title="Système"
                    >
                      <Monitor className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setTheme('light')}
                      className={`p-1.5 rounded-[6px] text-xs transition-colors ${
                        theme === 'light' ? 'bg-[#2b2a29] text-white' : 'text-[#878684] hover:text-white'
                      }`}
                      title="Clair"
                    >
                      <Sun className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setTheme('dark')}
                      className={`p-1.5 rounded-[6px] text-xs transition-colors ${
                        theme === 'dark' ? 'bg-[#2b2a29] text-white' : 'text-[#878684] hover:text-white'
                      }`}
                      title="Sombre"
                    >
                      <Moon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Police de la conversation (Anthropic Serif v / Sans-serif) */}
                <div className="flex items-center justify-between py-3 border-b border-[#242423]">
                  <span className="text-[13px] text-[#ededeb]">Police de la conversation</span>
                  <button
                    type="button"
                    onClick={() => setConversationFont(conversationFont === 'serif' ? 'sans' : 'serif')}
                    className="flex items-center gap-1.5 text-[13px] text-[#ededeb] hover:text-white transition-colors"
                  >
                    <span>{conversationFont === 'serif' ? 'Anthropic Serif' : 'Sans-serif'}</span>
                    <ChevronDown className="w-3.5 h-3.5 text-[#878684]" />
                  </button>
                </div>

                {/* Animations (Système / Réduites) */}
                <div className="flex items-center justify-between py-3">
                  <div className="max-w-xs">
                    <div className="text-[13px] text-[#ededeb]">Animations</div>
                    <p className="text-[12px] text-[#878684] mt-0.5 leading-normal">
                      Réduisez les animations lors de l'affichage progressif des réponses et dans les autres éléments de l'interface.
                    </p>
                  </div>
                  <div className="flex items-center bg-[#151515] p-0.5 rounded-[var(--radius-button)] border border-[#2b2a29] shrink-0">
                    <button
                      type="button"
                      onClick={() => setAnimations('system')}
                      className={`px-3 py-1 text-[12px] rounded-[6px] transition-colors ${
                        animations === 'system' ? 'bg-[#2b2a29] text-white' : 'text-[#878684] hover:text-white'
                      }`}
                    >
                      Système
                    </button>
                    <button
                      type="button"
                      onClick={() => setAnimations('reduced')}
                      className={`px-3 py-1 text-[12px] rounded-[6px] transition-colors ${
                        animations === 'reduced' ? 'bg-[#2b2a29] text-white' : 'text-[#878684] hover:text-white'
                      }`}
                    >
                      Réduites
                    </button>
                  </div>
                </div>
              </div>

              {/* ── Section Voix (Capture 2) ── */}
              <div className="pt-2 border-t border-[#242423]">
                <h3 className="text-[14px] font-semibold text-[#ededeb] mb-4">
                  Voix
                </h3>

                <div className="flex items-center justify-between py-3 border-b border-[#242423]">
                  <span className="text-[13px] text-[#ededeb]">Langue</span>
                  <div className="flex items-center gap-1.5 text-[13px] text-[#ededeb]">
                    <span>{selectedVoiceLang}</span>
                    <ChevronDown className="w-3.5 h-3.5 text-[#878684]" />
                  </div>
                </div>

                <div className="flex items-center justify-between py-3 border-b border-[#242423]">
                  <span className="text-[13px] text-[#ededeb]">Style</span>
                  <ChevronDown className="w-3.5 h-3.5 text-[#878684]" />
                </div>

                <div className="flex items-center justify-between py-3">
                  <span className="text-[13px] text-[#ededeb]">Vitesse</span>
                  <div className="flex items-center gap-1.5 text-[13px] text-[#ededeb]">
                    <span>{selectedVoiceSpeed}</span>
                    <ChevronDown className="w-3.5 h-3.5 text-[#878684]" />
                  </div>
                </div>
              </div>

              {/* ── Section Notifications (Capture 2) ── */}
              <div className="pt-2 border-t border-[#242423]">
                <h3 className="text-[14px] font-semibold text-[#ededeb] mb-4">
                  Notifications
                </h3>

                <div className="flex items-center justify-between py-2">
                  <div className="max-w-xs">
                    <div className="text-[13px] text-[#ededeb]">Fin de réponse</div>
                    <p className="text-[12px] text-[#878684] mt-0.5 leading-normal">
                      Recevez une notification lorsque Claude a terminé une réponse. Utile pour les tâches de longue durée.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setNotificationToggle(!notificationToggle)}
                    className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${
                      notificationToggle ? 'bg-[#ededeb]' : 'bg-[#2b2a29]'
                    }`}
                  >
                    <span
                      className={`w-4 h-4 rounded-full bg-black absolute top-0.5 transition-transform ${
                        notificationToggle ? 'left-4.5 bg-black' : 'left-0.5 bg-[#878684]'
                      }`}
                    />
                  </button>
                </div>
              </div>

            </div>
          )}

          {/* ── Section Fournisseurs IA & Clés (Intégration Iroko propre) ── */}
          {activeSettingsTab === 'providers' && (
            <div className="space-y-6 max-w-xl">
              <div>
                <h3 className="text-[14px] font-semibold text-[#ededeb] mb-1">
                  Fournisseurs IA & Clés API
                </h3>
                <p className="text-[12px] text-[#878684] mb-4">
                  Enregistrez plusieurs clés par fournisseur. La bascule automatique s'active en cas de quota épuisé (429).
                </p>

                <div className="space-y-2">
                  {providers.map(p => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between py-2.5 border-b border-[#242423]"
                    >
                      <div>
                        <div className="text-[13px] font-medium text-[#ededeb]">{p.name}</div>
                        <div className="text-[12px] text-[#878684]">
                          {p.keyCount} clé{p.keyCount > 1 ? 's' : ''} configurée{p.keyCount > 1 ? 's' : ''}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedProviderId(p.id);
                          setShowAddKeyForm(true);
                        }}
                        className="btn-ghost text-[12px] gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Ajouter</span>
                      </button>
                    </div>
                  ))}
                </div>

                {showAddKeyForm && (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (!newKeyRaw.trim()) return;
                      await fetch(`${API_BASE}/api/credentials`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          providerId: selectedProviderId,
                          label: newKeyLabel.trim() || `Clé ${newKeyRaw.slice(-4)}`,
                          key: newKeyRaw.trim(),
                          priority: 1
                        })
                      });
                      setNewKeyRaw('');
                      setNewKeyLabel('');
                      setShowAddKeyForm(false);
                      fetchKeys();
                    }}
                    className="p-3 bg-[#20201f] border border-[#2d2d2b] rounded-[var(--radius-item)] space-y-3 mt-4"
                  >
                    <div className="text-[12px] text-[#ededeb] font-medium">Nouvelle clé pour {selectedProviderId}</div>
                    <input
                      type="text"
                      value={newKeyLabel}
                      onChange={e => setNewKeyLabel(e.target.value)}
                      placeholder="Nom de la clé (ex: Production)"
                      className="w-full bg-[#151515] border border-[#2b2a29] rounded-[6px] px-3 py-1.5 text-[13px] text-[#ededeb]"
                    />
                    <input
                      type={showSecret ? 'text' : 'password'}
                      value={newKeyRaw}
                      onChange={e => setNewKeyRaw(e.target.value)}
                      placeholder="sk-..."
                      className="w-full bg-[#151515] border border-[#2b2a29] rounded-[6px] px-3 py-1.5 text-[13px] text-[#ededeb] font-mono"
                    />
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => setShowAddKeyForm(false)} className="btn-ghost text-[12px]">Annuler</button>
                      <button type="submit" className="px-3 py-1 bg-[#ededeb] text-black text-[12px] rounded-[6px] font-medium">Enregistrer</button>
                    </div>
                  </form>
                )}

                <div className="mt-4 space-y-1.5">
                  {credentials.map(c => (
                    <div key={c.id} className="flex items-center justify-between text-[12px] py-1.5 px-2 bg-[#20201f] rounded-[6px]">
                      <span className="font-mono text-[#ededeb]">{c.label} ({c.maskedKey})</span>
                      <button
                        type="button"
                        onClick={async () => {
                          await fetch(`${API_BASE}/api/credentials?id=${c.id}`, { method: 'DELETE' });
                          fetchKeys();
                        }}
                        className="text-[#878684] hover:text-[#ededeb]"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Section Autres (Compte, etc.) ── */}
          {activeSettingsTab !== 'preferences' && activeSettingsTab !== 'providers' && (
            <div className="space-y-4 max-w-xl">
              <h3 className="text-[14px] font-semibold text-[#ededeb]">
                {leftNavItems.flatMap(g => g.items).find(i => i.id === activeSettingsTab)?.label}
              </h3>
              <p className="text-[13px] text-[#878684]">
                Les paramètres de cette section sont configurés et synchronisés avec votre session Iroko.
              </p>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
