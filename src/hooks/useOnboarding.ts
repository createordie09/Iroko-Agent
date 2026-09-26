import { useState, useEffect, useCallback } from 'react';
import { tokenService } from '../services/security/TokenService';

const ONBOARDING_STORAGE_KEY = 'iroko_onboarding_completed';

export function useOnboarding(hasConversations: boolean, hasConfiguredProviders: boolean) {
  const [completed, setCompleted] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem(ONBOARDING_STORAGE_KEY) === 'true';
  });

  const [loading, setLoading] = useState(true);

  // Synchronisation avec les réglages persistants SQLite du runtime
  useEffect(() => {
    let cancelled = false;
    const fetchSetting = async () => {
      try {
        const res = await tokenService.fetch('/api/settings');
        if (res.ok) {
          const data = await res.json();
          const val = data?.settings?.onboarding_completed ?? data?.onboarding_completed;
          if (!cancelled && typeof val === 'boolean') {
            setCompleted(val);
            localStorage.setItem(ONBOARDING_STORAGE_KEY, String(val));
          }
        }
      } catch {} finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchSetting();
    return () => { cancelled = true; };
  }, []);

  const markCompleted = useCallback(async () => {
    setCompleted(true);
    try {
      localStorage.setItem(ONBOARDING_STORAGE_KEY, 'true');
      await tokenService.fetch('/api/settings/onboarding_completed', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: true })
      });
    } catch {}
  }, []);

  const resetOnboarding = useCallback(async () => {
    setCompleted(false);
    try {
      localStorage.setItem(ONBOARDING_STORAGE_KEY, 'false');
      await tokenService.fetch('/api/settings/onboarding_completed', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: false })
      });
    } catch {}
  }, []);

  // Détection : affiché uniquement au premier lancement si aucune conversation et aucun fournisseur configuré
  const shouldShowOnboarding = !loading && !completed && !hasConversations && !hasConfiguredProviders;

  return {
    shouldShowOnboarding,
    completeOnboarding: markCompleted,
    skipOnboarding: markCompleted,
    resetOnboarding
  };
}
