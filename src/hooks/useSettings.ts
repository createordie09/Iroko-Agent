import { useState, useEffect, useCallback } from 'react';
import { tokenService } from '../services/security/TokenService';
import { notificationService } from '../services/notification/NotificationService';
import { VoiceSpeed } from '../services/speech/SpeechService';

export type ThemeMode = 'system' | 'light' | 'dark';
export type ConversationFont = 'serif' | 'sans';
export type AnimationsMode = 'system' | 'reduced';

export interface IrokoSettings {
  theme: ThemeMode;
  conversationFont: ConversationFont;
  animations: AnimationsMode;
  voiceLang: string;
  voiceURI: string;
  voiceSpeed: VoiceSpeed;
  notificationsEnabled: boolean;
}

const DEFAULT_SETTINGS: IrokoSettings = {
  theme: 'dark',
  conversationFont: 'sans',
  animations: 'system',
  voiceLang: 'Français',
  voiceURI: '',
  voiceSpeed: 'Normale',
  notificationsEnabled: false
};

const STORAGE_KEYS = {
  theme: 'iroko_theme',
  conversationFont: 'iroko_font',
  animations: 'iroko_animations',
  voiceLang: 'iroko_voice_lang',
  voiceURI: 'iroko_voice_uri',
  voiceSpeed: 'iroko_voice_speed',
  notificationsEnabled: 'iroko_notifications_enabled'
};

export function useSettings() {
  // 1. Initialisation synchrone depuis localStorage (anti-flash au rechargement)
  const [settings, setSettings] = useState<IrokoSettings>(() => {
    if (typeof window === 'undefined') return DEFAULT_SETTINGS;
    try {
      const theme = (localStorage.getItem(STORAGE_KEYS.theme) as ThemeMode) || DEFAULT_SETTINGS.theme;
      const storedFont = localStorage.getItem(STORAGE_KEYS.conversationFont);
      const conversationFont = (storedFont === 'serif' ? 'sans' : (storedFont as ConversationFont)) || DEFAULT_SETTINGS.conversationFont;
      const animations = (localStorage.getItem(STORAGE_KEYS.animations) as AnimationsMode) || DEFAULT_SETTINGS.animations;
      const voiceLang = localStorage.getItem(STORAGE_KEYS.voiceLang) || DEFAULT_SETTINGS.voiceLang;
      const voiceURI = localStorage.getItem(STORAGE_KEYS.voiceURI) || DEFAULT_SETTINGS.voiceURI;
      const voiceSpeed = (localStorage.getItem(STORAGE_KEYS.voiceSpeed) as VoiceSpeed) || DEFAULT_SETTINGS.voiceSpeed;
      const notificationsEnabled = localStorage.getItem(STORAGE_KEYS.notificationsEnabled) === 'true';

      return {
        theme,
        conversationFont,
        animations,
        voiceLang,
        voiceURI,
        voiceSpeed,
        notificationsEnabled
      };
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  const [isLoadingFromRuntime, setIsLoadingFromRuntime] = useState(true);

  // 2. Synchronisation avec la table SQLite 'settings' du runtime (source unique de vérité)
  useEffect(() => {
    let isMounted = true;

    tokenService.fetch('/api/settings')
      .then(res => {
        if (!res.ok) throw new Error('Erreur HTTP ' + res.status);
        return res.json();
      })
      .then(data => {
        if (!isMounted) return;
        if (data && data.settings) {
          const s = data.settings;
          if (s.conversationFont === 'serif') {
            tokenService.fetch('/api/settings/conversationFont', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ value: 'sans' })
            }).catch(() => {});
          }
          setSettings(prev => {
            const effectiveFont: ConversationFont = (s.conversationFont === 'serif' ? 'sans' : (s.conversationFont as ConversationFont)) || prev.conversationFont;
            const next: IrokoSettings = {
              theme: s.theme || prev.theme,
              conversationFont: effectiveFont,
              animations: s.animations || prev.animations,
              voiceLang: s.voiceLang || prev.voiceLang,
              voiceURI: s.voiceURI !== undefined ? s.voiceURI : prev.voiceURI,
              voiceSpeed: s.voiceSpeed || prev.voiceSpeed,
              notificationsEnabled: s.notificationsEnabled !== undefined ? (s.notificationsEnabled === true || s.notificationsEnabled === 'true') : prev.notificationsEnabled
            };

            // Mise à jour du cache anti-flash localStorage
            try {
              localStorage.setItem(STORAGE_KEYS.theme, next.theme);
              localStorage.setItem(STORAGE_KEYS.conversationFont, next.conversationFont);
              localStorage.setItem(STORAGE_KEYS.animations, next.animations);
              localStorage.setItem(STORAGE_KEYS.voiceLang, next.voiceLang);
              localStorage.setItem(STORAGE_KEYS.voiceURI, next.voiceURI);
              localStorage.setItem(STORAGE_KEYS.voiceSpeed, next.voiceSpeed);
              localStorage.setItem(STORAGE_KEYS.notificationsEnabled, String(next.notificationsEnabled));
            } catch {}

            return next;
          });
        }
        setIsLoadingFromRuntime(false);
      })
      .catch(() => {
        if (isMounted) setIsLoadingFromRuntime(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // 3. Mise à jour d'un réglage : écriture runtime + cache localStorage + état local
  const updateSetting = useCallback(<K extends keyof IrokoSettings>(key: K, value: IrokoSettings[K]) => {
    setSettings(prev => {
      const next = { ...prev, [key]: value };
      try {
        const storageKey = STORAGE_KEYS[key];
        if (storageKey) {
          localStorage.setItem(storageKey, typeof value === 'boolean' ? String(value) : (value as string));
        }
      } catch {}
      return next;
    });

    // Écriture asynchrone persistante dans SQLite
    tokenService.fetch(`/api/settings/${String(key)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value })
    }).catch(err => {
      console.warn(`[useSettings] Erreur écriture setting ${String(key)}:`, err);
    });
  }, []);

  // 4. Gestion des animations : application immédiate de la classe .reduce-motion sur <html>
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const applyMotion = () => {
      if (settings.animations === 'reduced') {
        document.documentElement.classList.add('reduce-motion');
      } else {
        // Mode 'system' : écoute prefers-reduced-motion du système d'exploitation
        const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
        if (mediaQuery.matches) {
          document.documentElement.classList.add('reduce-motion');
        } else {
          document.documentElement.classList.remove('reduce-motion');
        }
      }
    };

    applyMotion();

    if (settings.animations === 'system' && typeof window !== 'undefined') {
      const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      const listener = () => applyMotion();
      mediaQuery.addEventListener('change', listener);
      return () => mediaQuery.removeEventListener('change', listener);
    }
  }, [settings.animations]);

  // 4b. Gestion du thème (système / clair / sombre) : application sur <html>
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const applyTheme = () => {
      let activeTheme = settings.theme;
      if (activeTheme === 'system') {
        const prefersDark = typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
        activeTheme = prefersDark ? 'dark' : 'light';
      }

      if (activeTheme === 'light') {
        document.documentElement.classList.add('light');
        document.documentElement.classList.remove('dark');
        document.documentElement.setAttribute('data-theme', 'light');
      } else {
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('light');
        document.documentElement.setAttribute('data-theme', 'dark');
      }
    };

    applyTheme();

    if (settings.theme === 'system' && typeof window !== 'undefined') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const listener = () => applyTheme();
      mediaQuery.addEventListener('change', listener);
      return () => mediaQuery.removeEventListener('change', listener);
    }
  }, [settings.theme]);

  // 5. Bascule des notifications avec demande de permission native
  const toggleNotifications = useCallback(async () => {
    if (settings.notificationsEnabled) {
      updateSetting('notificationsEnabled', false);
      return false;
    }

    if (!notificationService.isSupported()) {
      return false;
    }

    const granted = await notificationService.requestPermission();
    if (granted) {
      updateSetting('notificationsEnabled', true);
      return true;
    } else {
      updateSetting('notificationsEnabled', false);
      return false;
    }
  }, [settings.notificationsEnabled, updateSetting]);

  return {
    settings,
    isLoadingFromRuntime,
    setTheme: (theme: ThemeMode) => updateSetting('theme', theme),
    setConversationFont: (font: ConversationFont) => updateSetting('conversationFont', font),
    setAnimations: (animations: AnimationsMode) => updateSetting('animations', animations),
    setVoiceLang: (lang: string) => updateSetting('voiceLang', lang),
    setVoiceURI: (uri: string) => updateSetting('voiceURI', uri),
    setVoiceSpeed: (speed: VoiceSpeed) => updateSetting('voiceSpeed', speed),
    toggleNotifications,
    updateSetting
  };
}
