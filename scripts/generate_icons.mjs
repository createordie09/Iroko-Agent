import { app, BrowserWindow, nativeImage } from 'electron';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SIZES = [16, 24, 32, 48, 64, 128, 256, 512];
const ROOT_DIR = path.resolve(__dirname, '..');
const ASSETS_DIR = path.join(ROOT_DIR, 'assets');
const ICONS_DIR = path.join(ASSETS_DIR, 'icons');
const SVG_PATH = path.join(ASSETS_DIR, 'icon.svg');

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  if (!fs.existsSync(ICONS_DIR)) {
    fs.mkdirSync(ICONS_DIR, { recursive: true });
  }

  const svgContent = fs.readFileSync(SVG_PATH, 'utf8');

  const win = new BrowserWindow({
    width: 512,
    height: 512,
    show: false,
    frame: false,
    transparent: true,
    webPreferences: {
      offscreen: true
    }
  });

  const html = `<!DOCTYPE html>
<html>
<head>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 512px; height: 512px; overflow: hidden; background: transparent; }
    svg { width: 512px; height: 512px; display: block; }
  </style>
</head>
<body>
  ${svgContent}
</body>
</html>`;

  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

  // Wait a tick for rendering
  await new Promise(r => setTimeout(r, 200));

  const image = await win.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 });
  const rawPng = image.toPNG();

  // Write 512x512 main icon
  const rootIconPath = path.join(ASSETS_DIR, 'icon.png');
  fs.writeFileSync(rootIconPath, rawPng);
  console.log(`Ecrit : ${rootIconPath} (512x512)`);

  const baseNative = nativeImage.createFromBuffer(rawPng);

  for (const size of SIZES) {
    const resized = baseNative.resize({ width: size, height: size, quality: 'best' });
    const outPath = path.join(ICONS_DIR, `icon-${size}x${size}.png`);
    fs.writeFileSync(outPath, resized.toPNG());
    console.log(`Genere : ${outPath} (${size}x${size})`);
  }

  console.log('Toutes les icones PNG ont ete generees avec succes.');
  win.close();
  app.quit();
});
