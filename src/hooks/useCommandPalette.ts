/**
 * useCommandPalette — Gestion des items de la palette de commandes universelle (Mission R4a)
 *
 * Items groupés par catégorie :
 * - Discussions : résultats FTS5 en temps réel
 * - Navigation : accueil, paramètres par page
 * - Mode : bascule Chat / Code, modèle de la discussion active
 * - Actions : nouvelle discussion, ouvrir dossier
 * - Aide : rappels des raccourcis clavier
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { tokenService } from '../services/security/TokenService';
import { agentClient } from '../lib/agent-client';

export type CommandItemKind =
  | 'conversation'
  | 'nav'
  | 'model'
  | 'action'
  | 'shortcut';

export interface CommandItem {
  id: string;
  kind: CommandItemKind;
  label: string;
  description?: string;
  group: string;
  /** Exécute la commande et renvoie true si la palette doit se fermer */
  execute: () => void;
}

interface FtsResult {
  conversationId: string;
  title: string;
  snippet?: string;
}

/** Raccourcis à afficher en section Aide — descriptif uniquement, pas fonctionnels */
const SHORTCUT_ITEMS: CommandItem[] = [
  { id: 'sc-b', kind: 'shortcut', label: 'Afficher / masquer la barre latérale', description: 'Ctrl+B', group: 'Raccourcis', execute: () => {} },
  { id: 'sc-k', kind: 'shortcut', label: 'Palette de commandes', description: 'Ctrl+K', group: 'Raccourcis', execute: () => {} },
  { id: 'sc-o', kind: 'shortcut', label: 'Nouvelle discussion', description: 'Ctrl+Maj+O', group: 'Raccourcis', execute: () => {} },
  { id: 'sc-comma', kind: 'shortcut', label: 'Ouvrir les paramètres', description: 'Ctrl+,', group: 'Raccourcis', execute: () => {} },
  { id: 'sc-enter', kind: 'shortcut', label: 'Envoyer le message', description: 'Entrée', group: 'Raccourcis', execute: () => {} },
  { id: 'sc-shift-enter', kind: 'shortcut', label: 'Saut de ligne', description: 'Maj+Entrée', group: 'Raccourcis', execute: () => {} },
];

/** Pages des paramètres accessibles directement */
const SETTINGS_PAGES = [
  { id: 'nav-pref', label: 'Paramètres › Préférences', tab: 'preferences' },
  { id: 'nav-prov', label: 'Paramètres › Fournisseurs et Clés', tab: 'providers' },
  { id: 'nav-priv', label: 'Paramètres › Confidentialité', tab: 'privacy' },
  { id: 'nav-cap', label: 'Paramètres › Capacités', tab: 'capabilities' },
  { id: 'nav-mem', label: 'Paramètres › Mémoire', tab: 'memory' },
  { id: 'nav-think', label: 'Paramètres › Réfléchir', tab: 'thinking' },
  { id: 'nav-code', label: 'Paramètres › Iroko Code', tab: 'code' },
  { id: 'nav-skills', label: 'Paramètres › Compétences', tab: 'skills' },
  { id: 'nav-conn', label: 'Paramètres › Connecteurs', tab: 'connectors' },
  { id: 'nav-plug', label: 'Paramètres › Plugins', tab: 'plugins' },
];

export function useCommandPalette(isOpen: boolean) {
  const {
    resetChat,
    setActiveView,
    setIsSettingsOpen,
    setActiveSettingsTab,
    composerMode,
    setComposerMode,
    activeModel,
    setActiveModel,
    activeWorkspace,
    history,
    loadConversation,
  } = useApp();

  const [query, setQuery] = useState('');
  const [ftsResults, setFtsResults] = useState<FtsResult[]>([]);
  const [isFtsLoading, setIsFtsLoading] = useState(false);

  /* Réinitialiser la query à chaque ouverture */
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setFtsResults([]);
    }
  }, [isOpen]);

  /* Recherche FTS5 avec debounce 150ms */
  useEffect(() => {
    if (!isOpen || !query.trim()) {
      setFtsResults([]);
      return;
    }
    setIsFtsLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await tokenService.fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
        if (res.ok) {
          const data = await res.json();
          setFtsResults(
            (data.results || []).slice(0, 6).map((r: any) => ({
              conversationId: r.conversationId,
              title: r.title || r.conversationId,
              snippet: r.snippet,
            }))
          );
        }
      } catch {
        setFtsResults([]);
      } finally {
        setIsFtsLoading(false);
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [query, isOpen]);

  /* Items statiques construits avec les callbacks du contexte */
  const staticItems = useMemo<CommandItem[]>(() => {
    const items: CommandItem[] = [];

    /* Navigation — Pages paramètres */
    for (const page of SETTINGS_PAGES) {
      items.push({
        id: page.id,
        kind: 'nav',
        label: page.label,
        group: 'Navigation',
        execute: () => {
          setActiveSettingsTab(page.tab);
          setIsSettingsOpen(true);
        },
      });
    }

    /* Actions */
    items.push({
      id: 'act-new',
      kind: 'action',
      label: 'Nouvelle discussion',
      description: 'Ctrl+Maj+O',
      group: 'Actions',
      execute: () => {
        resetChat();
        setActiveView('home');
      },
    });

    if (activeWorkspace) {
      items.push({
        id: 'act-folder',
        kind: 'action',
        label: `Dossier actif : ${activeWorkspace.name}`,
        description: activeWorkspace.path,
        group: 'Actions',
        execute: () => {
          /* Le dossier est déjà ouvert — navigation vers la vue chat */
          if (history.length > 0) setActiveView('chat');
        },
      });
    }

    /* Mode Chat / Code */
    const otherMode = composerMode === 'chat' ? 'code' : 'chat';
    const modeLabel = otherMode === 'chat' ? 'Basculer en mode Chat' : 'Basculer en mode Code';
    items.push({
      id: 'act-mode',
      kind: 'action',
      label: modeLabel,
      group: 'Actions',
      execute: () => setComposerMode(otherMode),
    });

    /* Modèle actif */
    if (activeModel) {
      items.push({
        id: 'act-model',
        kind: 'model',
        label: `Modèle actif : ${activeModel}`,
        description: 'Changer via Paramètres › Fournisseurs',
        group: 'Modèle',
        execute: () => {
          setActiveSettingsTab('providers');
          setIsSettingsOpen(true);
        },
      });
    }

    /* Raccourcis (rappel) */
    items.push(...SHORTCUT_ITEMS);

    return items;
  }, [
    composerMode, activeModel, activeWorkspace,
    resetChat, setActiveView, setIsSettingsOpen, setActiveSettingsTab,
    setComposerMode, history,
  ]);

  /* Items de discussions depuis FTS5 */
  const conversationItems = useMemo<CommandItem[]>(() => {
    if (!query.trim()) {
      return history.slice(0, 6).map(h => ({
        id: `conv-${h.id}`,
        kind: 'conversation' as CommandItemKind,
        label: h.topic || 'Discussion sans titre',
        group: 'Discussions récentes',
        execute: () => loadConversation(h.id),
      }));
    }
    return ftsResults.map(r => ({
      id: `conv-${r.conversationId}`,
      kind: 'conversation' as CommandItemKind,
      label: r.title,
      description: r.snippet,
      group: 'Discussions',
      execute: () => loadConversation(r.conversationId),
    }));
  }, [ftsResults, history, query, loadConversation]);

  /* Filtrage des items statiques selon la query */
  const filteredStaticItems = useMemo<CommandItem[]>(() => {
    if (!query.trim()) return staticItems.filter(it => it.kind !== 'shortcut');
    const q = query.toLowerCase();
    return staticItems.filter(it =>
      it.label.toLowerCase().includes(q) ||
      (it.description || '').toLowerCase().includes(q) ||
      it.group.toLowerCase().includes(q)
    );
  }, [staticItems, query]);

  /* Regroupement final */
  const groups = useMemo(() => {
    const allItems = [...conversationItems, ...filteredStaticItems];
    const map = new Map<string, CommandItem[]>();
    for (const item of allItems) {
      const g = map.get(item.group) ?? [];
      g.push(item);
      map.set(item.group, g);
    }
    return Array.from(map.entries()).map(([name, items]) => ({ name, items }));
  }, [conversationItems, filteredStaticItems]);

  /* Liste plate pour navigation flèches */
  const flatItems = useMemo(() => groups.flatMap(g => g.items), [groups]);

  return {
    query,
    setQuery,
    groups,
    flatItems,
    isFtsLoading,
  };
}
