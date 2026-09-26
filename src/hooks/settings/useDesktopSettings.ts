import { useState, useEffect, useCallback } from 'react';
import { tokenService } from '../../services/security/TokenService';

export interface DesktopCapabilities {
  isDesktop: boolean;
  platform: string;
  canAutoLaunch: boolean;
  canTray: boolean;
  autoLaunch: boolean;
  closeToTray: boolean;
}

export function useDesktopSettings() {
  const [isDesktop, setIsDesktop] = useState<boolean>(() => {
    return typeof window !== 'undefined' && Boolean(window.electronAPI?.isDesktop);
  });
  const [platform, setPlatform] = useState<string>('');
  const [canAutoLaunch, setCanAutoLaunch] = useState<boolean>(false);
  const [canTray, setCanTray] = useState<boolean>(false);
  const [autoLaunch, setAutoLaunchState] = useState<boolean>(false);
  const [closeToTray, setCloseToTrayState] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  // Synchronisation initiale au montage
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        // 1. Récupération des réglages persistants SQLite
        let dbAutoLaunch = false;
        let dbCloseToTray = false;
        try {
          const res = await tokenService.fetch('/api/settings');
          if (res.ok) {
            const data = await res.json();
            const s = data?.settings || data || {};
            dbAutoLaunch = Boolean(s.launch_on_startup);
            dbCloseToTray = Boolean(s.minimize_to_tray);
          }
        } catch {}

        // 2. Interrogation des capacités natives du framework d'empaquetage
        if (typeof window !== 'undefined' && window.electronAPI?.getDesktopCapabilities) {
          const caps = await window.electronAPI.getDesktopCapabilities();
          if (!cancelled) {
            setIsDesktop(true);
            setPlatform(caps.platform || '');
            setCanAutoLaunch(Boolean(caps.canAutoLaunch));
            setCanTray(Boolean(caps.canTray));
            setAutoLaunchState(Boolean(caps.autoLaunch));
            setCloseToTrayState(Boolean(caps.closeToTray));
          }
        } else {
          // Mode Web ou navigateur externe
          if (!cancelled) {
            setIsDesktop(false);
            setCanAutoLaunch(false);
            setCanTray(false);
            setAutoLaunchState(dbAutoLaunch);
            setCloseToTrayState(dbCloseToTray);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    init();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleAutoLaunch = useCallback(async () => {
    if (!canAutoLaunch && isDesktop) return;
    const target = !autoLaunch;

    // Mise à jour optimiste
    setAutoLaunchState(target);

    // 1. Appel natif Electron si disponible
    if (typeof window !== 'undefined' && window.electronAPI?.setAutoLaunch) {
      try {
        const res = await window.electronAPI.setAutoLaunch(target);
        setAutoLaunchState(Boolean(res.enabled));
      } catch {
        setAutoLaunchState(!target);
        return;
      }
    }

    // 2. Persistance dans SQLite
    try {
      await tokenService.fetch('/api/settings/launch_on_startup', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: target })
      });
    } catch {}
  }, [autoLaunch, canAutoLaunch, isDesktop]);

  const toggleCloseToTray = useCallback(async () => {
    if (!canTray && isDesktop) return;
    const target = !closeToTray;

    // Mise à jour optimiste
    setCloseToTrayState(target);

    // 1. Appel natif Electron si disponible
    if (typeof window !== 'undefined' && window.electronAPI?.setMinimizeToTray) {
      try {
        const res = await window.electronAPI.setMinimizeToTray(target);
        setCloseToTrayState(Boolean(res.enabled));
      } catch {
        setCloseToTrayState(!target);
        return;
      }
    }

    // 2. Persistance dans SQLite
    try {
      await tokenService.fetch('/api/settings/minimize_to_tray', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: target })
      });
    } catch {}
  }, [closeToTray, canTray, isDesktop]);

  return {
    isDesktop,
    platform,
    canAutoLaunch,
    canTray,
    autoLaunch,
    closeToTray,
    loading,
    toggleAutoLaunch,
    toggleCloseToTray
  };
}
