import { useSyncExternalStore, useCallback } from 'react';
import { modelStore, ProviderItem } from '../../services/models/ModelStore';

export function useProviders() {
  const state = useSyncExternalStore(
    (onStoreChange) => modelStore.subscribe(onStoreChange),
    () => modelStore.getState()
  );

  const refreshProviders = useCallback(() => {
    return modelStore.fetchProviders();
  }, []);

  return {
    providers: state.providers,
    loading: state.loadingProviders,
    error: state.providersError,
    refreshProviders
  };
}

export type { ProviderItem };
