import { app, BrowserWindow, dialog, ipcMain, screen, shell } from 'electron';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let runtimeDb: any = null;
let shutdownFn: ((exit: boolean) => Promise<void>) | null = null;
let isQuitting = false;

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

async function createWindow() {
  // 1. Démarrer le serveur local de manière synchrone et étanche
  await startLocalServer();

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

  // 6. Arrêt propre et complet (L8) à la fermeture de la fenêtre
  mainWindow.on('close', async (e) => {
    if (!isQuitting) {
      isQuitting = true;
      e.preventDefault();
      saveWindowBounds();

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

app.whenReady().then(createWindow);

app.on('window-all-closed', async () => {
  if (!isQuitting) {
    isQuitting = true;
    if (shutdownFn) {
      try {
        await shutdownFn(false);
      } catch {}
    }
    app.quit();
  }
});
