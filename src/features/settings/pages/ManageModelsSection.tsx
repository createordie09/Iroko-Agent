import React, { useState, useMemo } from 'react';
import { ArrowLeft, Search, Star, Eye, EyeOff } from 'lucide-react';
import { useModelCatalog } from '../../../hooks/models';
import { FormattedModel } from '../../../lib/models';

export interface ManageModelsSectionProps {
  onBack: () => void;
}

function formatPricing(pricing?: FormattedModel['pricing'], priceTier?: string): string {
  if (priceTier === 'free') {
    return 'Gratuit';
  }
  if (pricing && typeof pricing.inputPerMillion === 'number' && typeof pricing.outputPerMillion === 'number') {
    if (pricing.inputPerMillion === 0 && pricing.outputPerMillion === 0) {
      return 'Gratuit';
    }
    return `$${pricing.inputPerMillion.toFixed(2)} / 1M entrée · $${pricing.outputPerMillion.toFixed(2)} / 1M sortie`;
  }
  return 'Tarification standard';
}

export function ManageModelsSection({ onBack }: ManageModelsSectionProps) {
  const { allModels, toggleFavorite, toggleHide, searchModels, refreshCatalog, loading } = useModelCatalog();
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const displayedModels = useMemo(() => {
    return searchModels(searchQuery, 'all');
  }, [searchQuery, searchModels]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshCatalog();
    setIsRefreshing(false);
  };

  return (
    <div className="space-y-4">
      {/* En-tête avec bouton retour */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="btn-ghost text-[12px] gap-1.5 cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Retour aux fournisseurs</span>
        </button>

        <button
          type="button"
          onClick={handleRefresh}
          disabled={loading || isRefreshing}
          className="btn-ghost text-[12px] cursor-pointer"
        >
          {loading || isRefreshing ? 'Actualisation…' : 'Actualiser le catalogue'}
        </button>
      </div>

      <div>
        <h4 className="text-[13px] font-semibold text-[var(--text-primary)]">
          Catalogue de modèles ({allModels.length} modèles)
        </h4>
        <p className="text-[12px] text-[var(--text-secondary)]">
          Gérez vos favoris et masquez les modèles superflus du sélecteur rapide. Les tarifs exacts fournis par les API sont consultables ci-dessous.
        </p>
      </div>

      {/* Barre de recherche */}
      <div className="relative">
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Rechercher par nom, éditeur ou fournisseur..."
          className="w-full bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded-[6px] pl-8 pr-3 py-1.5 text-[12px] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none"
        />
        <Search className="w-3.5 h-3.5 text-[var(--text-tertiary)] absolute left-2.5 top-1/2 -translate-y-1/2" />
      </div>

      {/* Liste des modèles */}
      <div className="space-y-1.5 max-h-[440px] overflow-y-auto pr-1">
        {displayedModels.map(model => {
          const pricingText = formatPricing(model.pricing, model.priceTier);

          return (
            <div
              key={model.id}
              className={`p-2.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[8px] flex items-center justify-between transition-colors ${
                model.isHidden ? 'opacity-50' : ''
              }`}
            >
              <div className="min-w-0 pr-3 space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium text-[var(--text-primary)] truncate">
                    {model.name}
                  </span>
                  {model.publisher && (
                    <span className="text-[11px] text-[var(--text-secondary)]">
                      · {model.publisher}
                    </span>
                  )}
                  <span className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider">
                    ({model.providerId})
                  </span>
                </div>

                {/* Tarifs exacts fournis par l'API en texte gris (à cet endroit seulement) */}
                <div className="text-[11px] text-[var(--text-tertiary)] font-mono">
                  {pricingText}
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {/* Bouton Favori */}
                <button
                  type="button"
                  onClick={() => toggleFavorite(model.id)}
                  className={`p-1.5 rounded-[4px] hover:bg-[var(--bg-active)] transition-colors cursor-pointer ${
                    model.isFavorite ? 'text-[var(--text-primary)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
                  }`}
                  title={model.isFavorite ? 'Retirer des favoris' : 'Marquer comme favori'}
                >
                  <Star className={`w-3.5 h-3.5 ${model.isFavorite ? 'fill-current' : ''}`} />
                </button>

                {/* Bouton Masquer / Afficher */}
                <button
                  type="button"
                  onClick={() => toggleHide(model.id)}
                  className={`p-1.5 rounded-[4px] hover:bg-[var(--bg-active)] transition-colors cursor-pointer ${
                    model.isHidden ? 'text-[var(--text-tertiary)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                  title={model.isHidden ? 'Afficher dans le sélecteur' : 'Masquer du sélecteur'}
                >
                  {model.isHidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          );
        })}

        {displayedModels.length === 0 && (
          <div className="text-[12px] text-[var(--text-secondary)] py-6 text-center">
            Aucun modèle ne correspond à votre recherche.
          </div>
        )}
      </div>
    </div>
  );
}
