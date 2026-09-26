import { app, BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const serverPath = path.resolve(__dirname, '../dist-server/index.js');
  const mod = await import(pathToFileURL(serverPath).href);

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 320,
    minHeight: 480,
    backgroundColor: '#151515',
    title: 'Iroko',
    icon: path.resolve(__dirname, '../assets/icon.png'),
    show: false,
    webPreferences: {
      offscreen: true
    }
  });

  const port = process.env.PORT || '3001';
  // Attente active du serveur
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) break;
    } catch {}
    await new Promise(r => setTimeout(r, 100));
  }

  await win.loadURL(`http://127.0.0.1:${port}`);
  await new Promise(r => setTimeout(r, 1500));

  const image = await win.webContents.capturePage();
  const artifactPath = 'C:\\Users\\DELL\\.gemini\\antigravity\\brain\\d7d76e62-85aa-46ae-912e-623108e41281\\fenetre_application_iroko.png';
  fs.writeFileSync(artifactPath, image.toPNG());
  console.log(`Capture de la fenetre sauvegardee : ${artifactPath}`);

  if (mod.handleShutdown) {
    await mod.handleShutdown(false);
  }
  win.close();
  app.quit();
});
