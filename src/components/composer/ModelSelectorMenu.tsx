import React, { useState, useMemo, useRef, useEffect, KeyboardEvent } from 'react';
import { Check, Search, ArrowRight } from 'lucide-react';
import { FormattedModel } from '../../lib/models';
import { useModelSelection, useModelCatalog } from '../../hooks/models';
import { PendingAttachment } from './ClaudeComposer';

export interface ModelSelectorMenuProps {
  isOpen: boolean;
  onClose: () => void;
  activeModelId: string;
  onSelectModel: (modelId: string) => void;
  onOpenManageModels: () => void;
  attachments?: PendingAttachment[];
  composerMode?: 'chat' | 'code';
}

function getIncompatibilityReason(
  model: FormattedModel,
  attachments: PendingAttachment[] = [],
  composerMode: 'chat' | 'code' = 'chat'
): string | null {
  if (attachments.some(a => a.isImage) && !model.capabilities?.vision) {
    return 'Ne supporte pas les images';
  }
  if (composerMode === 'code' && !model.capabilities?.tools) {
    return 'Ne supporte pas les outils (mode Code)';
  }
  return null;
}

export function ModelSelectorMenu({
  isOpen,
  onClose,
  activeModelId,
  onSelectModel,
  onOpenManageModels,
  attachments = [],
  composerMode = 'chat'
}: ModelSelectorMenuProps) {
  const { recentModels, favoriteModels, groupedModels, setSelectedModel } = useModelSelection();
  const { allModels, searchModels } = useModelCatalog();

  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const menuContainerRef = useRef<HTMLDivElement>(null);

  // Focus automatique sur le champ de recherche à l'ouverture
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setHighlightedIndex(-1);
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Modèles filtrés par la recherche
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return null;
    return searchModels(searchQuery, 'available');
  }, [searchQuery, searchModels]);

  // Liste ordonnée à plat des modèles visibles pour la navigation au clavier
  const flatVisibleModels = useMemo(() => {
    if (searchResults) return searchResults;

    const list: FormattedModel[] = [];
    const seenIds = new Set<string>();

    // 1. Favoris
    for (const m of favoriteModels) {
      if (!seenIds.has(m.id)) {
        seenIds.add(m.id);
        list.push(m);
      }
    }

    // 2. Récents
    for (const m of recentModels) {
      if (!seenIds.has(m.id)) {
        seenIds.add(m.id);
        list.push(m);
      }
    }

    // 3. Fournisseurs
    for (const group of groupedModels) {
      for (const tier of group.tiers) {
        for (const m of tier.models) {
          if (!seenIds.has(m.id)) {
            seenIds.add(m.id);
            list.push(m);
          }
        }
      }
    }

    return list;
  }, [searchResults, favoriteModels, recentModels, groupedModels]);

  // Gestion de la navigation clavier
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }

    if (flatVisibleModels.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => {
        const next = prev + 1 >= flatVisibleModels.length ? 0 : prev + 1;
        return next;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => {
        const next = prev - 1 < 0 ? flatVisibleModels.length - 1 : prev - 1;
        return next;
      });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < flatVisibleModels.length) {
        const target = flatVisibleModels[highlightedIndex];
        const reason = getIncompatibilityReason(target, attachments, composerMode);
        if (!reason) {
          onSelectModel(target.id);
          setSelectedModel(target.id);
          onClose();
        }
      }
    }
  };

  if (!isOpen) return null;

  const totalCatalogCount = allModels.length > 0 ? allModels.length : flatVisibleModels.length;

  const renderModelItem = (model: FormattedModel, indexInFlat: number) => {
    const isSelected = model.id === activeModelId;
    const isHighlighted = highlightedIndex === indexInFlat;
    const reason = getIncompatibilityReason(model, attachments, composerMode);
    const isDisabled = Boolean(reason);

    const isFree = model.priceTier === 'free' || 
      (model.pricing?.inputPerMillion === 0 && model.pricing?.outputPerMillion === 0);

    return (
      <button
        key={model.id}
        type="button"
        disabled={isDisabled}
        aria-disabled={isDisabled}
        title={reason || model.name}
        onClick={() => {
          if (!isDisabled) {
            onSelectModel(model.id);
            setSelectedModel(model.id);
            onClose();
          }
        }}
        className={`w-full flex items-center justify-between px-2.5 py-1.5 text-[12px] rounded-[6px] transition-colors text-left ${
          isDisabled
            ? 'opacity-40 cursor-not-allowed bg-transparent'
            : isSelected
            ? 'bg-[var(--bg-active)] text-[var(--text-primary)] font-medium cursor-pointer'
            : isHighlighted
            ? 'bg-[var(--bg-surface-hover)] text-[var(--text-primary)] cursor-pointer'
            : 'text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)] cursor-pointer'
        }`}
      >
        <div className="flex flex-col min-w-0 pr-2">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[var(--text-primary)]">{model.name}</span>
            {/* Étiquettes de texte grises sobres (aucun prix dans cette liste) */}
            {isFree && (
              <span className="px-1 py-0.2 text-[9px] text-[var(--text-tertiary)] bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded">
                Gratuit
              </span>
            )}
            {model.capabilities?.vision && (
              <span className="px-1 py-0.2 text-[9px] text-[var(--text-tertiary)] bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded">
                Vision
              </span>
            )}
            {model.capabilities?.reasoning && (
              <span className="px-1 py-0.2 text-[9px] text-[var(--text-tertiary)] bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded">
                Raisonnement
              </span>
            )}
            {model.capabilities?.tools && (
              <span className="px-1 py-0.2 text-[9px] text-[var(--text-tertiary)] bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded">
                Outils
              </span>
            )}
          </div>
          {reason ? (
            <span className="text-[10px] text-[var(--text-secondary)] pt-0.5">{reason}</span>
          ) : model.note ? (
            <span className="text-[10px] text-[var(--text-tertiary)] pt-0.5">{model.note}</span>
          ) : null}
        </div>
        {isSelected && <Check className="w-3.5 h-3.5 text-[var(--text-primary)] shrink-0" />}
      </button>
    );
  };

  return (
    <div
      ref={menuContainerRef}
      onKeyDown={handleKeyDown}
      className="absolute bottom-[calc(100%+8px)] right-0 w-80 bg-[var(--bg-modal)] border border-[var(--border-modal)] rounded-[12px] py-1.5 z-50 flex flex-col max-h-[380px] select-none"
      role="menu"
      aria-label="Sélecteur de modèle"
    >
      {/* Zone défilante des modèles */}
      <div className="flex-1 overflow-y-auto px-1.5 py-1 space-y-2.5 focus:outline-none">
        {searchResults !== null ? (
          <div>
            <div className="text-[10px] font-medium text-[var(--text-tertiary)] px-2 py-0.5 uppercase tracking-wider">
              Résultats de recherche ({searchResults.length})
            </div>
            {searchResults.length === 0 ? (
              <div className="text-[12px] text-[var(--text-secondary)] px-2 py-2">
                Aucun modèle ne correspond à votre recherche.
              </div>
            ) : (
              <div className="space-y-0.5 mt-1">
                {searchResults.map((m, idx) => renderModelItem(m, idx))}
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Section 1 : Favoris */}
            {favoriteModels.length > 0 && (
              <div>
                <div className="text-[10px] font-medium text-[var(--text-tertiary)] px-2 py-0.5 uppercase tracking-wider">
                  Favoris
                </div>
                <div className="space-y-0.5 mt-0.5">
                  {favoriteModels.map(m => {
                    const idx = flatVisibleModels.findIndex(item => item.id === m.id);
                    return renderModelItem(m, idx);
                  })}
                </div>
              </div>
            )}

            {/* Section 2 : Récents (3 max) */}
            {recentModels.length > 0 && (
              <div>
                <div className="text-[10px] font-medium text-[var(--text-tertiary)] px-2 py-0.5 uppercase tracking-wider">
                  Récents
                </div>
                <div className="space-y-0.5 mt-0.5">
                  {recentModels.map(m => {
                    const idx = flatVisibleModels.findIndex(item => item.id === m.id);
                    return renderModelItem(m, idx);
                  })}
                </div>
              </div>
            )}

            {/* Section 3 : Par fournisseur prêt et groupes de curation */}
            {groupedModels.map(group => (
              <div key={group.providerId} className="space-y-1">
                <div className="text-[10px] font-semibold text-[var(--text-secondary)] px-2 py-0.5 uppercase tracking-wider">
                  {group.providerName}
                </div>
                {group.tiers.map(tier => (
                  <div key={tier.tierId} className="space-y-0.5">
                    {group.tiers.length > 1 && (
                      <div className="text-[10px] text-[var(--text-tertiary)] px-2.5 pt-1">
                        {tier.tierLabel}
                      </div>
                    )}
                    <div className="space-y-0.5">
                      {tier.models.map(m => {
                        const idx = flatVisibleModels.findIndex(item => item.id === m.id);
                        return renderModelItem(m, idx);
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ))}

            {flatVisibleModels.length === 0 && (
              <div className="text-[12px] text-[var(--text-secondary)] px-2 py-3 text-center">
                Aucun modèle disponible.
              </div>
            )}
          </>
        )}
      </div>

      {/* Pied de menu fixe : Champ de recherche & Lien Gérer les modèles */}
      <div className="pt-2 px-2 border-t border-[var(--border-subtle)] space-y-1.5 mt-1 bg-[var(--bg-modal)]">
        <div className="relative">
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={`Rechercher parmi ${totalCatalogCount} modèles...`}
            className="w-full bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded-[6px] pl-7 pr-2 py-1.5 text-[12px] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none"
          />
          <Search className="w-3.5 h-3.5 text-[var(--text-tertiary)] absolute left-2 top-1/2 -translate-y-1/2" />
        </div>

        <button
          type="button"
          onClick={() => {
            onClose();
            onOpenManageModels();
          }}
          className="w-full flex items-center justify-between px-2 py-1 text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] rounded-[6px] transition-colors cursor-pointer"
        >
          <span>Gérer les modèles</span>
          <ArrowRight className="w-3 h-3 text-[var(--text-tertiary)]" />
        </button>
      </div>
    </div>
  );
}
