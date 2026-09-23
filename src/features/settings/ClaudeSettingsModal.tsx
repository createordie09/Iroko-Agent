import React, { useState, useRef } from 'react';
import { 
  X, Search, SlidersHorizontal, ShieldCheck, 
  Cpu, Brain, Sparkles, Terminal, FileText, Share2, Boxes, 
  KeyRound
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useOverlayFocus } from '../../hooks/useOverlayFocus';
import { PreferencesPage } from './pages/PreferencesPage';
import { ProvidersPage } from './pages/ProvidersPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { CapabilitiesPage } from './pages/CapabilitiesPage';
import { MemoryPage } from './pages/MemoryPage';
import { ThinkingPage } from './pages/ThinkingPage';
import { CodePage } from './pages/CodePage';
import { SkillsPage } from './pages/SkillsPage';
import { ConnectorsPage } from './pages/ConnectorsPage';
import { PluginsPage } from './pages/PluginsPage';

export function ClaudeSettingsModal() {
  const {
    isSettingsOpen,
    setIsSettingsOpen,
    activeSettingsTab,
    setActiveSettingsTab
  } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const modalContainerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Primitive universelle de calque : mémorisation focus, inert sur l'application, Échap hiérarchisé et restitution
  useOverlayFocus({
    isOpen: isSettingsOpen,
    onClose: () => setIsSettingsOpen(false),
    containerRef: modalContainerRef,
    initialFocusRef: searchInputRef
  });

  if (!isSettingsOpen) return null;

  const leftNavItems = [
    {
      group: 'Paramètres',
      items: [
        { id: 'preferences', label: 'Préférences', icon: SlidersHorizontal },
        { id: 'providers', label: 'Fournisseurs & Clés', icon: KeyRound },
        { id: 'privacy', label: 'Confidentialité', icon: ShieldCheck },
        { id: 'capabilities', label: 'Capacités', icon: Cpu },
        { id: 'memory', label: 'Mémoire', icon: Brain },
        { id: 'thinking', label: 'Réfléchir', icon: Sparkles },
        { id: 'code', label: 'Iroko Code', icon: Terminal }
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

  const filteredNavGroups = leftNavItems.map(group => ({
    ...group,
    items: group.items.filter(item => 
      !searchQuery.trim() || item.label.toLowerCase().includes(searchQuery.toLowerCase().trim())
    )
  })).filter(group => group.items.length > 0);

  return (
    /* Fond derrière la modale : voile noir semi-opaque SANS flou */
    <div
      data-overlay-backdrop="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) setIsSettingsOpen(false);
      }}
    >
      {/* ── Fenêtre modale : ~920×720px ── */}
      <div
        ref={modalContainerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Paramètres"
        tabIndex={-1}
        data-modal="true"
        className="w-full max-w-[920px] h-[720px] max-h-[90vh] bg-[var(--bg-modal)] border border-[var(--border-modal)] rounded-[var(--radius-modal)] flex overflow-hidden relative select-none animate-in zoom-in-95 duration-150 outline-none"
      >
        {/* ── Bouton Fermer × en haut à droite ── */}
        <button
          type="button"
          onClick={() => setIsSettingsOpen(false)}
          className="absolute top-4 right-4 p-1.5 rounded-[6px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-subtle)] transition-colors z-20 cursor-pointer"
          title="Fermer (Échap)"
          aria-label="Fermer la fenêtre des paramètres"
        >
          <X className="w-4 h-4" />
        </button>

        {/* ── Colonne gauche (~172px - 190px) ── */}
        <div
          data-modal-sidebar="true"
          className="w-[185px] sm:w-[195px] h-full flex flex-col border-r border-[var(--border-subtle)] bg-[var(--bg-modal-sidebar)] p-3 shrink-0"
        >
          {/* Champ de recherche */}
          <div className="relative mb-3">
            <Search className="w-3.5 h-3.5 text-[var(--text-secondary)] absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Rechercher"
              className="w-full bg-[var(--bg-surface)] border border-[var(--border-modal)] rounded-[6px] pl-8 pr-2 py-1 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)] focus:outline-none focus:border-[var(--border-focus)]"
            />
          </div>

          {/* Groupes de navigation */}
          <div className="flex-1 overflow-y-auto claude-scrollbar space-y-4">
            {filteredNavGroups.map(group => (
              <div key={group.group} className="space-y-0.5">
                <div className="text-[11px] text-[var(--text-secondary)] px-2 py-1 font-normal">
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
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-[6px] text-[13px] text-left transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-[var(--bg-active)] text-[var(--text-primary)] font-medium'
                          : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)]'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 text-[var(--text-secondary)] shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* ── Colonne droite : Contenu du panneau ── */}
        <div className="flex-1 h-full overflow-y-auto claude-scrollbar p-6 sm:p-8 bg-[var(--bg-modal)]">
          {activeSettingsTab === 'preferences' && <PreferencesPage />}
          {activeSettingsTab === 'providers' && <ProvidersPage />}
          {activeSettingsTab === 'privacy' && <PrivacyPage />}
          {activeSettingsTab === 'capabilities' && <CapabilitiesPage />}
          {activeSettingsTab === 'memory' && <MemoryPage />}
          {activeSettingsTab === 'thinking' && <ThinkingPage />}
          {activeSettingsTab === 'code' && <CodePage />}
          {activeSettingsTab === 'skills' && <SkillsPage />}
          {activeSettingsTab === 'connectors' && <ConnectorsPage />}
          {activeSettingsTab === 'plugins' && <PluginsPage />}
        </div>
      </div>
    </div>
  );
}
