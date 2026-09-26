import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  isDesktop: true,
  platform: process.platform,
  selectDirectory: (options?: { title?: string; defaultPath?: string }) =>
    ipcRenderer.invoke('select-directory', options),
  onTitleUpdate: (callback: (title: string) => void) => {
    ipcRenderer.on('title-updated', (_event, title) => callback(title));
  },
  getDesktopCapabilities: () => ipcRenderer.invoke('get-desktop-capabilities'),
  setAutoLaunch: (enabled: boolean) => ipcRenderer.invoke('set-auto-launch', enabled),
  setMinimizeToTray: (enabled: boolean) => ipcRenderer.invoke('set-minimize-to-tray', enabled)
});
