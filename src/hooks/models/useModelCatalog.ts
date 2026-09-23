import { useSyncExternalStore, useCallback } from 'react';
import { modelStore } from '../../services/models/ModelStore';
import { FormattedModel } from '../../lib/models';

export function useModelCatalog() {
  const state = useSyncExternalStore(
    (onStoreChange) => modelStore.subscribe(onStoreChange),
    () => modelStore.getState()
  );

  const refreshCatalog = useCallback((providerId?: string) => {
    return modelStore.refreshCatalog(providerId);
  }, []);

  const toggleFavorite = useCallback((modelId: string) => {
    return modelStore.toggleFavorite(modelId);
  }, []);

  const toggleHide = useCallback((modelId: string) => {
    return modelStore.toggleHide(modelId);
  }, []);

  const searchModels = useCallback((query: string, source: 'available' | 'all' = 'available'): FormattedModel[] => {
    const list = source === 'all' ? state.allModels : state.models;
    if (!query || !query.trim()) return list;
    const q = query.toLowerCase().trim();
    return list.filter(m => 
      m.name.toLowerCase().includes(q) ||
      m.id.toLowerCase().includes(q) ||
      (m.publisher && m.publisher.toLowerCase().includes(q)) ||
      (m.note && m.note.toLowerCase().includes(q))
    );
  }, [state.models, state.allModels]);

  return {
    models: state.models,
    allModels: state.allModels,
    loading: state.loadingModels,
    error: state.modelsError,
    refreshCatalog,
    toggleFavorite,
    toggleHide,
    searchModels
  };
}
