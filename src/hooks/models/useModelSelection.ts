import { useSyncExternalStore, useCallback, useMemo } from 'react';
import { modelStore, ComposerModelStatus } from '../../services/models/ModelStore';
import { FormattedModel } from '../../lib/models';

export interface ModelTierGroup {
  tierId: string;
  tierLabel: string;
  models: FormattedModel[];
}

export interface ModelProviderGroup {
  providerId: string;
  providerName: string;
  tiers: ModelTierGroup[];
}

const TIER_LABELS: Record<string, string> = {
  free: 'Gratuits',
  budget: 'Économiques',
  standard: 'Standard',
  premium: 'Premium'
};

export function useModelSelection() {
  const state = useSyncExternalStore(
    (onStoreChange) => modelStore.subscribe(onStoreChange),
    () => modelStore.getState()
  );

  const setSelectedModel = useCallback((modelId: string) => {
    modelStore.setActiveModel(modelId, true);
  }, []);

  const selectedModel = useMemo(() => {
    return state.models.find(m => m.id === state.activeModelId) || null;
  }, [state.models, state.activeModelId]);

  const recentModels = useMemo(() => {
    return state.recentModelIds
      .map(id => state.models.find(m => m.id === id) || state.allModels.find(m => m.id === id))
      .filter((m): m is FormattedModel => Boolean(m));
  }, [state.recentModelIds, state.models, state.allModels]);

  const favoriteModels = useMemo(() => {
    return state.models.filter(m => m.isFavorite);
  }, [state.models]);

  const groupedModels = useMemo((): ModelProviderGroup[] => {
    const groupsMap = new Map<string, { providerName: string; tiersMap: Map<string, FormattedModel[]> }>();

    for (const model of state.models) {
      const pId = model.providerId || 'autre';
      const providerItem = state.providers.find(p => p.id === pId);
      const pName = providerItem?.name || (pId.charAt(0).toUpperCase() + pId.slice(1));

      if (!groupsMap.has(pId)) {
        groupsMap.set(pId, {
          providerName: pName,
          tiersMap: new Map<string, FormattedModel[]>()
        });
      }

      const pGroup = groupsMap.get(pId)!;
      const tier = model.priceTier || 'standard';

      if (!pGroup.tiersMap.has(tier)) {
        pGroup.tiersMap.set(tier, []);
      }
      pGroup.tiersMap.get(tier)!.push(model);
    }

    const tierOrder = ['free', 'budget', 'standard', 'premium'];
    const result: ModelProviderGroup[] = [];

    for (const [providerId, data] of groupsMap.entries()) {
      const tiers: ModelTierGroup[] = [];
      for (const tierKey of tierOrder) {
        const tierModels = data.tiersMap.get(tierKey);
        if (tierModels && tierModels.length > 0) {
          tiers.push({
            tierId: tierKey,
            tierLabel: TIER_LABELS[tierKey] || tierKey,
            models: tierModels
          });
        }
      }

      // Ajouter d'autres paliers personnalisés éventuels
      for (const [tKey, tModels] of data.tiersMap.entries()) {
        if (!tierOrder.includes(tKey) && tModels.length > 0) {
          tiers.push({
            tierId: tKey,
            tierLabel: tKey.charAt(0).toUpperCase() + tKey.slice(1),
            models: tModels
          });
        }
      }

      result.push({
        providerId,
        providerName: data.providerName,
        tiers
      });
    }

    return result;
  }, [state.models, state.providers]);

  const composerStatus = useMemo((): ComposerModelStatus => {
    return modelStore.getComposerStatus();
  }, [state.models, state.activeModelId, state.loadingModels, state.modelsError, state.providers, state.lastUpdated]);

  const isReady = composerStatus.type === 'ready';

  return {
    activeModel: state.activeModelId,
    selectedModel,
    setSelectedModel,
    recentModels,
    favoriteModels,
    groupedModels,
    composerStatus,
    isReady,
    refresh: () => modelStore.fetchModels()
  };
}
