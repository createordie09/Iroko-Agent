import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  isDesktop: true,
  selectDirectory: (options?: { title?: string; defaultPath?: string }) =>
    ipcRenderer.invoke('select-directory', options),
  onTitleUpdate: (callback: (title: string) => void) => {
    ipcRenderer.on('title-updated', (_event, title) => callback(title));
  }
});
