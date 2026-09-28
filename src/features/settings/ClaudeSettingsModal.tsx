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

  interface NavItem {
    id: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    keywords: string[];
  }

  interface NavGroup {
    group: string;
    items: NavItem[];
  }

  const leftNavItems: NavGroup[] = [
    {
      group: 'Paramètres',
      items: [
        {
          id: 'preferences',
          label: 'Préférences',
          icon: SlidersHorizontal,
          keywords: ['thème', 'theme', 'sombre', 'dark', 'clair', 'light', 'police', 'font', 'serif', 'sans', 'animations', 'mouvement', 'voix', 'audio', 'vitesse', 'notifications', 'démarrage', 'startup', 'plateau', 'tray', 'raccourcis', 'clavier', 'apparence']
        },
        {
          id: 'providers',
          label: 'Fournisseurs & Clés',
          icon: KeyRound,
          keywords: ['clés', 'cle', 'api', 'fournisseurs', 'modèles', 'modele', 'catalogue', 'openai', 'anthropic', 'gemini', 'openrouter', 'mistral', 'groq', 'ollama', 'images', 'image', 'flux', 'vidéos', 'video', 'veo']
        },
        {
          id: 'privacy',
          label: 'Confidentialité',
          icon: ShieldCheck,
          keywords: ['confidentialité', 'caviardage', 'secrets', 'purge', 'effacer', 'suppression', 'sauvegarde', 'restauration', 'backup', 'base', 'sqlite', 'espace disque', 'stockage', 'diagnostic', 'anonymisé']
        },
        {
          id: 'capabilities',
          label: 'Capacités',
          icon: Cpu,
          keywords: ['capacités', 'outils', 'tools', 'tool registry', 'recherche web', 'web search', 'interrupteurs', 'activation']
        },
        {
          id: 'memory',
          label: 'Mémoire',
          icon: Brain,
          keywords: ['mémoire', 'faits', 'décisions', 'projet', 'contexte', 'remember', 'mémoriser', 'persistance']
        },
        {
          id: 'thinking',
          label: 'Réfléchir',
          icon: Sparkles,
          keywords: ['réfléchir', 'réflexion', 'thinking', 'sous-agents', 'subagents', 'routage', 'complexité', 'budget', 'profondeur']
        },
        {
          id: 'code',
          label: 'Iroko Code',
          icon: Terminal,
          keywords: ['code', 'iroko code', 'permissions', 'terminal', 'commandes', 'fichiers', 'délais', 'timeout', 'audit', 'sécurité', 'lecture seule']
        }
      ]
    },
    {
      group: 'Personnaliser',
      items: [
        {
          id: 'skills',
          label: 'Compétences',
          icon: FileText,
          keywords: ['compétences', 'skills', 'agentskills', 'docx', 'xlsx', 'pptx', 'pdf', 'import', 'export', 'zip', 'scripts']
        },
        {
          id: 'connectors',
          label: 'Connecteurs',
          icon: Share2,
          keywords: ['connecteurs', 'mcp', 'serveurs', 'stdio', 'sse', 'http', 'protocol', 'connexions']
        },
        {
          id: 'plugins',
          label: 'Plugins',
          icon: Boxes,
          keywords: ['plugins', 'paquets', 'extensions', 'modules', 'installation', 'export']
        }
      ]
    }
  ];

  // Normalisation insensible à la casse et aux accents
  const normalize = (text: string) => text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

  const queryNorm = normalize(searchQuery);

  const filteredNavGroups = leftNavItems.map(group => ({
    ...group,
    items: group.items.filter(item => {
      if (!queryNorm) return true;
      if (normalize(item.label).includes(queryNorm)) return true;
      if (normalize(group.group).includes(queryNorm)) return true;
      return item.keywords.some(kw => normalize(kw).includes(queryNorm));
    })
  })).filter(group => group.items.length > 0);

  const totalFilteredCount = filteredNavGroups.reduce((acc, g) => acc + g.items.length, 0);

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape' && searchQuery) {
      e.stopPropagation();
      setSearchQuery('');
    } else if (e.key === 'Enter' && totalFilteredCount > 0) {
      const firstItem = filteredNavGroups[0]?.items[0];
      if (firstItem) {
        setActiveSettingsTab(firstItem.id);
      }
    }
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    searchInputRef.current?.focus();
  };

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
              onKeyDown={handleSearchKeyDown}
              placeholder="Rechercher…"
              aria-label="Rechercher dans les réglages"
              className="w-full bg-[var(--bg-surface)] border border-[var(--border-modal)] rounded-[6px] pl-8 pr-7 py-1 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)] focus:outline-none focus:border-[var(--border-focus)]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                title="Effacer la recherche"
                aria-label="Effacer la recherche"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Annonce d'accessibilité vocale pour le nombre de résultats */}
          <div className="sr-only" aria-live="polite">
            {searchQuery.trim()
              ? totalFilteredCount === 0
                ? 'Aucun réglage trouvé'
                : totalFilteredCount === 1
                ? '1 réglage trouvé'
                : `${totalFilteredCount} réglages trouvés`
              : ''}
          </div>

          {/* Groupes de navigation ou état vide */}
          <div className="flex-1 overflow-y-auto claude-scrollbar space-y-4">
            {filteredNavGroups.length === 0 ? (
              <div className="py-6 px-2 text-center" role="status">
                <div className="text-[12px] text-[var(--text-secondary)]">Aucun résultat</div>
                <button
                  type="button"
                  onClick={handleClearSearch}
                  className="mt-2 text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline transition-colors cursor-pointer"
                >
                  Effacer la recherche
                </button>
              </div>
            ) : (
              filteredNavGroups.map(group => (
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
              ))
            )}
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
