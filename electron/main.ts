import { app, BrowserWindow, dialog, ipcMain, screen, shell, Tray, Menu } from 'electron';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let runtimeDb: any = null;
let shutdownFn: ((exit: boolean) => Promise<void>) | null = null;
let isQuitting = false;
let tray: Tray | null = null;
let closeToTray = false;

// Verrou d'instance unique
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

interface WindowBounds {
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
  x?: number;
  y?: number;
  isMaximized?: boolean;
}

function getValidatedBounds(saved: any): WindowBounds {
  const defaults: WindowBounds = { width: 1200, height: 800, minWidth: 320, minHeight: 480, isMaximized: false };
  if (!saved || typeof saved !== 'object') return defaults;
  let { width, height, x, y, isMaximized } = saved;
  if (typeof width !== 'number' || width < defaults.minWidth) width = defaults.width;
  if (typeof height !== 'number' || height < defaults.minHeight) height = defaults.height;

  let hasValidPosition = false;
  if (typeof x === 'number' && typeof y === 'number') {
    const displays = screen.getAllDisplays();
    hasValidPosition = displays.some((display) => {
      const { x: dx, y: dy, width: dw, height: dh } = display.bounds;
      return x >= dx - 20 && x < dx + dw && y >= dy - 20 && y < dy + dh;
    });
  }

  return {
    width,
    height,
    minWidth: defaults.minWidth,
    minHeight: defaults.minHeight,
    ...(hasValidPosition ? { x, y } : {}),
    isMaximized: Boolean(isMaximized)
  };
}

async function waitForHealth(url: string, maxWaitMs = 5000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

async function startLocalServer() {
  const serverPath = path.resolve(__dirname, '../dist-server/index.js');
  const serverUrl = pathToFileURL(serverPath).href;
  const mod = await import(serverUrl);
  runtimeDb = mod.runtimeDatabase;
  shutdownFn = mod.handleShutdown;
}

function saveWindowBounds() {
  if (!mainWindow || mainWindow.isDestroyed() || !runtimeDb) return;
  try {
    const isMaximized = mainWindow.isMaximized();
    const normalBounds = mainWindow.getNormalBounds();
    runtimeDb.setSetting('window_bounds', {
      x: normalBounds.x,
      y: normalBounds.y,
      width: normalBounds.width,
      height: normalBounds.height,
      isMaximized
    });
  } catch (err) {
    console.warn('Avertissement lors de la sauvegarde des dimensions de la fenêtre:', err);
  }
}

function canSupportTray(): boolean {
  if (process.platform === 'win32' || process.platform === 'darwin') return true;
  if (process.platform === 'linux') {
    return Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
  }
  return false;
}

function ensureTray() {
  if (tray || !canSupportTray()) return;
  try {
    const iconPath = path.resolve(__dirname, '../assets/icons/icon-16x16.png');
    tray = new Tray(iconPath);
    tray.setToolTip('Iroko');
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Ouvrir Iroko',
        click: () => {
          if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
          }
        }
      },
      { type: 'separator' },
      {
        label: 'Quitter',
        click: async () => {
          isQuitting = true;
          destroyTray();
          if (shutdownFn) {
            try {
              await shutdownFn(false);
            } catch {}
          }
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.destroy();
          }
          app.quit();
        }
      }
    ]);
    tray.setContextMenu(contextMenu);
    tray.on('click', () => {
      if (mainWindow) {
        if (mainWindow.isVisible()) {
          mainWindow.focus();
        } else {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    });
    tray.on('double-click', () => {
      if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
      }
    });
  } catch (err) {
    console.warn('Zone de notification non supportée sur cet environnement:', err);
    tray = null;
  }
}

function destroyTray() {
  if (tray) {
    try {
      tray.destroy();
    } catch {}
    tray = null;
  }
}

function setAutoLaunch(enabled: boolean): boolean {
  try {
    app.setLoginItemSettings({
      openAtLogin: enabled
    });
    return true;
  } catch (err) {
    console.warn('Erreur lors de la configuration du démarrage système:', err);
    return false;
  }
}

function getAutoLaunch(): boolean {
  try {
    const settings = app.getLoginItemSettings();
    return Boolean(settings?.openAtLogin);
  } catch {
    return false;
  }
}

async function createWindow() {
  // 1. Démarrer le serveur local de manière synchrone et étanche
  await startLocalServer();

  // 1.5. Lire les préférences système (démarrage auto et réduction tray)
  try {
    if (runtimeDb) {
      const savedAutoLaunch = runtimeDb.getSetting('launch_on_startup');
      if (typeof savedAutoLaunch === 'boolean') {
        setAutoLaunch(savedAutoLaunch);
      }
      const savedMinimizeToTray = runtimeDb.getSetting('minimize_to_tray');
      if (typeof savedMinimizeToTray === 'boolean') {
        closeToTray = savedMinimizeToTray;
        if (closeToTray) {
          ensureTray();
        }
      }
    }
  } catch (err) {
    console.warn('Avertissement lors de la lecture des préférences système:', err);
  }

  // 2. Récupérer les dimensions mémorisées dans les réglages du runtime SQLite
  let savedRaw: any;
  try {
    if (runtimeDb) {
      savedRaw = runtimeDb.getSetting('window_bounds');
    }
  } catch {}

  let savedBounds: any = null;
  if (savedRaw) {
    try {
      savedBounds = typeof savedRaw === 'string' ? JSON.parse(savedRaw) : savedRaw;
    } catch {}
  }

  const bounds = getValidatedBounds(savedBounds);
  const iconPath = path.resolve(__dirname, '../assets/icon.png');

  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    minWidth: bounds.minWidth,
    minHeight: bounds.minHeight,
    x: bounds.x,
    y: bounds.y,
    backgroundColor: '#151515',
    autoHideMenuBar: true,
    title: 'Iroko',
    icon: iconPath,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.resolve(__dirname, 'preload.cjs'),
      sandbox: true
    }
  });

  if (bounds.isMaximized) {
    mainWindow.maximize();
  }

  // 3. Synchronisation automatique du titre avec document.title
  mainWindow.on('page-title-updated', (event, title) => {
    if (!title || !title.trim()) {
      event.preventDefault();
      mainWindow?.setTitle('Iroko');
    }
  });

  // 4. Mémorisation réactive de la taille et position (débouncée)
  let saveTimer: NodeJS.Timeout | null = null;
  const debouncedSave = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(saveWindowBounds, 300);
  };

  mainWindow.on('resize', debouncedSave);
  mainWindow.on('move', debouncedSave);

  // 5. Confinement de navigation et ouverture externe sécurisée
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // 6. Arrêt propre et complet (L8) OU Réduction dans la zone de notification (R2e)
  mainWindow.on('close', async (e) => {
    if (closeToTray && !isQuitting) {
      e.preventDefault();
      saveWindowBounds();
      mainWindow?.hide();
      return;
    }

    if (!isQuitting) {
      isQuitting = true;
      e.preventDefault();
      saveWindowBounds();
      destroyTray();

      if (shutdownFn) {
        try {
          await shutdownFn(false);
        } catch (err) {
          console.error('Erreur lors de l\'arrêt ordonné du runtime:', err);
        }
      }

      mainWindow?.destroy();
      app.quit();
    }
  });

  // 7. Attente active du serveur et affichage sans terminal
  const port = process.env.PORT || '3001';
  const ready = await waitForHealth(`http://127.0.0.1:${port}/health`);
  if (!ready) {
    console.error('Le serveur local Iroko n\'a pas répondu au healthcheck dans les délais.');
  }

  await mainWindow.loadURL(`http://127.0.0.1:${port}`);
  mainWindow.show();
}

// Gestionnaire IPC pour le sélecteur de dossier natif (M3)
ipcMain.handle('select-directory', async (_event, options) => {
  if (!mainWindow || mainWindow.isDestroyed()) return { cancelled: true };
  const res = await dialog.showOpenDialog(mainWindow, {
    title: options?.title || 'Sélectionner un dossier de travail pour Iroko',
    defaultPath: options?.defaultPath,
    properties: ['openDirectory', 'createDirectory']
  });

  if (res.canceled || !res.filePaths || res.filePaths.length === 0) {
    return { cancelled: true };
  }
  return { cancelled: false, path: res.filePaths[0] };
});

// Gestionnaires IPC pour les préférences bureau (Mission R2e)
ipcMain.handle('get-desktop-capabilities', () => {
  const canTray = canSupportTray();
  let currentAutoLaunch = false;
  try {
    currentAutoLaunch = getAutoLaunch();
  } catch {}

  return {
    isDesktop: true,
    platform: process.platform,
    canAutoLaunch: true,
    canTray,
    autoLaunch: currentAutoLaunch,
    closeToTray
  };
});

ipcMain.handle('set-auto-launch', (_event, enabled: boolean) => {
  const success = setAutoLaunch(Boolean(enabled));
  const effective = getAutoLaunch();
  if (runtimeDb) {
    try {
      runtimeDb.setSetting('launch_on_startup', effective);
    } catch {}
  }
  return { success, enabled: effective };
});

ipcMain.handle('set-minimize-to-tray', (_event, enabled: boolean) => {
  closeToTray = Boolean(enabled);
  if (closeToTray) {
    ensureTray();
  } else {
    destroyTray();
  }
  if (runtimeDb) {
    try {
      runtimeDb.setSetting('minimize_to_tray', closeToTray);
    } catch {}
  }
  return { success: true, enabled: closeToTray };
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.whenReady().then(createWindow);

app.on('window-all-closed', async () => {
  if (!isQuitting) {
    isQuitting = true;
    destroyTray();
    if (shutdownFn) {
      try {
        await shutdownFn(false);
      } catch {}
    }
    app.quit();
  }
});
