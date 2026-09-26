/// <reference types="vite/client" />

interface ElectronAPI {
  isDesktop?: boolean;
  platform?: string;
  selectDirectory?: (options?: { title?: string; defaultPath?: string }) => Promise<{ cancelled: boolean; path?: string }>;
  onTitleUpdate?: (callback: (title: string) => void) => void;
  getDesktopCapabilities?: () => Promise<{
    isDesktop: boolean;
    platform: string;
    canAutoLaunch: boolean;
    canTray: boolean;
    autoLaunch: boolean;
    closeToTray: boolean;
  }>;
  setAutoLaunch?: (enabled: boolean) => Promise<{ success: boolean; enabled: boolean }>;
  setMinimizeToTray?: (enabled: boolean) => Promise<{ success: boolean; enabled: boolean }>;
}

interface Window {
  electronAPI?: ElectronAPI;
}
