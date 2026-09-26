import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

test('MISSION R2c — 1. Identité de l\'application dans package.json', () => {
  const pkgPath = path.join(ROOT_DIR, 'package.json');
  assert.ok(fs.existsSync(pkgPath), 'package.json doit exister');

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  assert.equal(pkg.name, 'iroko-agent', 'Le nom du package doit être iroko-agent');
  assert.equal(pkg.version, '0.1.0', 'La version doit démarrer à 0.1.0');
  assert.ok(pkg.description && pkg.description.includes('Iroko'), 'La description doit mentionner Iroko');
  assert.ok(pkg.author, 'Le champ author doit être renseigné');
  assert.equal(pkg.license, 'UNLICENSED', 'La licence doit être UNLICENSED pour usage interne');
  assert.equal(pkg.main, 'dist-electron/main.js', 'Le point d\'entrée principal doit pointer vers dist-electron/main.js');
});

test('MISSION R2c — 2. Icône de l\'application monochrome et déclinaisons PNG', () => {
  const svgPath = path.join(ROOT_DIR, 'assets', 'icon.svg');
  assert.ok(fs.existsSync(svgPath), 'assets/icon.svg doit exister');

  const svgContent = fs.readFileSync(svgPath, 'utf8');
  assert.ok(svgContent.includes('<svg'), 'L\'icône doit être un fichier SVG valide');
  // Vérification de la stricte neutralité noir/blanc/gris (0 couleur d\'accent)
  assert.ok(!/#(?!151515|2d2d2b|ededeb|000000|ffffff)[0-9a-fA-F]{6}/.test(svgContent), 'L\'icône ne doit contenir aucune couleur d\'accent');

  // Vérification de l'icône racine 512x512
  const rootPngPath = path.join(ROOT_DIR, 'assets', 'icon.png');
  assert.ok(fs.existsSync(rootPngPath), 'assets/icon.png doit exister');
  const rootStat = fs.statSync(rootPngPath);
  assert.ok(rootStat.size > 1000, 'L\'icône PNG 512x512 doit être non vide');

  // Vérification de l'ensemble des déclinaisons OS
  const requiredSizes = [16, 24, 32, 48, 64, 128, 256, 512];
  for (const size of requiredSizes) {
    const pngPath = path.join(ROOT_DIR, 'assets', 'icons', `icon-${size}x${size}.png`);
    assert.ok(fs.existsSync(pngPath), `assets/icons/icon-${size}x${size}.png (${size}x${size}) doit exister`);
    assert.ok(fs.statSync(pngPath).size > 100, `L'icône ${size}x${size} doit avoir une taille valide`);
  }
});

test('MISSION R2c — 3. Persistance de la taille/position dans SQLite et seuil minimal', async () => {
  const { runtimeDatabase } = await import('../server/storage/RuntimeDatabase.ts');

  // Enregistrement d'un état de fenêtre simulé dans les réglages du runtime SQLite
  const testBounds = {
    x: 150,
    y: 120,
    width: 1280,
    height: 800,
    isMaximized: false
  };

  runtimeDatabase.setSetting('window_bounds', testBounds);

  // Relecture depuis les réglages SQLite
  const saved = runtimeDatabase.getSetting('window_bounds');
  assert.ok(saved, 'Les réglages de la fenêtre doivent être persistés dans SQLite');

  const parsed = typeof saved === 'string' ? JSON.parse(saved) : saved;
  assert.equal(parsed.width, 1280);
  assert.equal(parsed.height, 800);
  assert.equal(parsed.x, 150);
  assert.equal(parsed.y, 120);
  assert.equal(parsed.isMaximized, false);

  // Vérification que le code de main.ts applique le seuil minimal de 320 px
  const mainSource = fs.readFileSync(path.join(ROOT_DIR, 'electron', 'main.ts'), 'utf8');
  assert.ok(mainSource.includes('minWidth: 320') || mainSource.includes('minWidth: defaults.minWidth'), 'minWidth de 320 px doit être imposé');
  assert.ok(mainSource.includes('window_bounds'), 'main.ts doit interagir avec la clé window_bounds');
});

test('MISSION R2c — 4. Titre de fenêtre cohérent avec le titre de page', () => {
  const mainSource = fs.readFileSync(path.join(ROOT_DIR, 'electron', 'main.ts'), 'utf8');
  assert.ok(mainSource.includes('page-title-updated'), 'main.ts doit synchroniser le titre lors de page-title-updated');
  assert.ok(mainSource.includes('title: \'Iroko\''), 'Le titre par défaut de l\'application doit être Iroko');

  const indexHtml = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');
  assert.ok(indexHtml.includes('<title>Iroko</title>'), 'index.html doit avoir Iroko comme titre de base');
});

test('MISSION R2c — 5. Fichiers de build Electron et scripts npm opérationnels', () => {
  const distElectronMain = path.join(ROOT_DIR, 'dist-electron', 'main.js');
  const distElectronPreload = path.join(ROOT_DIR, 'dist-electron', 'preload.cjs');
  assert.ok(fs.existsSync(distElectronMain), 'dist-electron/main.js doit être compilé');
  assert.ok(fs.existsSync(distElectronPreload), 'dist-electron/preload.cjs doit être compilé');

  const builderConfigPath = path.join(ROOT_DIR, 'electron-builder.json');
  assert.ok(fs.existsSync(builderConfigPath), 'electron-builder.json doit exister');
  const builderConfig = JSON.parse(fs.readFileSync(builderConfigPath, 'utf8'));
  assert.equal(builderConfig.productName, 'Iroko', 'Le nom du produit builder doit être Iroko');
  assert.equal(builderConfig.appId, 'ai.iroko.agent', 'L\'appId doit être ai.iroko.agent');
});
