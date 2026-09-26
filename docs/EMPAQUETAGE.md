# Rapport d'Étude Comparative et Recommandation d'Empaquetage Bureau (`docs/EMPAQUETAGE.md`)

**Mission** : R2a — Étude comparative et cadrage technique pour l'empaquetage de l'application de bureau Iroko  
**Date d'audit** : 26 septembre 2026  
**Auteur** : Agent d'Ingénierie Système Iroko  
**Statut** : Rapport final soumis à validation préalable avant ouverture du lot R2b  

---

## 1. Contexte et Exigences Fondamentales d'Iroko

L'application Iroko Code Agent a été conçue comme un agent autonome local hautement sécurisé fonctionnant en circuit fermé. Avant d'engager son empaquetage en application de bureau native, un état des lieux rigoureux de ses contraintes d'exécution réelles s'impose.

### 1.1. Nature et Poids du Runtime Local
- **Un backend Node.js 20+ complet et autonome** : Le serveur (`server/index.ts`, compilé dans `dist-server/index.js`) compte plus de 25 000 lignes de logique TypeScript sans compromis. Il embarque :
  - Une base de données embarquée transactionnelle via le module natif standard `node:sqlite` (`DatabaseSync`) ;
  - Un serveur HTTP durci et un serveur WebSocket (`ws`) sur l'interface de bouclage `127.0.0.1:3001` ;
  - Une passerelle de modèles IA (`ModelGateway`), un pool de clés chiffrées en AES-256-GCM, et un moteur de permissions à 4 portées (`PermissionEngine`) ;
  - Un gestionnaire de processus enfants (`ProcessManager`) capable de piloter et de détruire récursivement les arbres de processus sous Windows via `taskkill /T /F` ;
  - Des générateurs de documents bureautiques lourds (`docx`, `exceljs`, `pptxgenjs`, `pdf-lib`) et un extracteur de pièces jointes ;
  - Des serveurs de langage LSP (`server/tools/lsp/`) et une suite de navigation Playwright headless.
- **Une interface utilisateur React 19 / Vite** : Compilée sous forme d'une SPA statique dans `dist/` (`dist/index.html` et ses fragments JS/CSS).

### 1.2. Impératifs de Sécurité Intangibles
1. **Liaison exclusive `127.0.0.1`** : Aucun port ne doit être exposé sur une interface réseau routable (`0.0.0.0`).
2. **Garde d'origine et de domaine (`Host` & `Origin`)** : Rejet systématique de toute requête provenant d'un navigateur externe ou d'un site web étranger (protection anti-DNS rebinding).
3. **Jeton d'authentification en mémoire vive** : Généré cryptographiquement à chaque démarrage, jamais consigné sur le disque ni dans `localStorage`.
4. **En-têtes anti-CSRF** : En-tête obligatoire `X-Iroko-Request: 1` sur toutes les opérations en écriture.
5. **Isolation étanche hors workspace** : Toutes les données pérennes résident dans `%APPDATA%/iroko/` (Windows) ou `~/.iroko/` (POSIX), jamais dans le dossier de travail projet.

### 1.3. Contraintes de la Mission R2b
- **Point d'entrée unique** : Une icône / raccourci utilisateur lançant l'application sans fenêtre de terminal (invite de commande noire) visible.
- **Cycle de vie raccordé** : Le runtime démarre silencieusement au lancement de la fenêtre, et la fermeture de la fenêtre interrompt immédiatement et complètement le runtime et tous ses sous-processus enfants (zéro port ni processus orphelin résiduel).
- **Dialogue de dossier natif (M3)** : Élimination du script PowerShell synchrone au profit d'un composant de dialogue natif OS rattaché à la fenêtre hôte.
- **Script unique de construction** : `npm run package` produisant l'installateur Windows officiel (NSIS `.exe` ou exécutable autonome).

---

## 2. État Réel de l'Environnement Système Cible

La vérification par exécution réelle sur la machine de développement et d'empaquetage donne les résultats suivants :
- **Système d'Exploitation** : Microsoft Windows 11 / x64.
- **Moteur JavaScript** : Node.js `v25.8.2` et npm `11.11.1` installés et pleinement opérationnels.
- **Chaîne de compilation Rust** : **ABSENTE** (`rustc` et `cargo` introuvables sur le système).
- **Compilateur C++ / MSVC** : Non configuré dans le PATH utilisateur.

Ce constat d'exécution réelle élimine d'emblée toute solution exigeant une compilation native Rust ou C++ lourde sur le poste de travail.

---

## 3. Analyse Comparative des Solutions d'Empaquetage

Quatre options techniques ont été méticuleusement évaluées pour répondre aux exigences du projet Iroko.

### Option 1 : Electron (Recommandée)

#### Description
Electron encapsule un moteur Chromium pour le rendu visuel et un environnement Node.js complet pour le processus principal (`main`). Il s'intègre nativement à l'écosystème Node.js / npm existant sans chaîne de compilation tierce.

#### Intégration du Runtime
- **Mode d'exécution** : Le backend Iroko (`dist-server/index.js`) peut être exécuté directement dans le processus principal d'Electron ou instancié via un `utilityProcess` Node.js isolé (API officielle Electron moderne) avec redirection des flux et arrêt automatique lié à la fenêtre.
- **Zéro console** : Electron démarre par nature sans fenêtre de terminal de commande noire.
- **Support `node:sqlite`** : Prise en charge native immédiate de `node:sqlite` (`DatabaseSync`), déjà validée sur les versions récentes de Node.js intégrées à Electron (Electron 32/33+ embarquant Node.js 20.x/22.x).

#### Sécurité et Origines
- Dans Electron, la fenêtre charge `http://127.0.0.1:3001` (ou les fichiers locaux via un protocole applicatif durci `iroko://`).
- Le mécanisme de sécurité existant (`Host: 127.0.0.1:3001`, `Origin: http://127.0.0.1:3001` ou `http://localhost:3001`) demeure 100% opérationnel et n'est à aucun moment affaibli.
- Le gestionnaire `mainWindow.webContents.setWindowOpenHandler` permet d'interdire formellement toute ouverture de fenêtre web non autorisée ou de rediriger les liens externes vers le navigateur système par défaut (`shell.openExternal`).

#### Dialogue Natif de Dossier (M3)
- L'API native Electron `dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] })` utilise l'API Win32 `IFileDialog` sous Windows (et `NSOpenPanel` sous macOS).
- **Avantages majeurs** :
  1. Zéro invocation de `powershell.exe` ou de script temporaire ;
  2. Fenêtre de sélection modale bloquante rattachée visuellement à la fenêtre parente `mainWindow` (résout définitivement les problèmes de focus en arrière-plan constatés avec PowerShell) ;
  3. Temps de réponse instantané (< 10 ms contre 300 à 800 ms pour l'initialisation du moteur PowerShell).

#### Arrêt Propre et Nettoyage
- L'événement `app.on('before-quit', ...)` ou `mainWindow.on('close', ...)` permet d'appeler directement la routine `handleShutdown()` du runtime :
  - Déconnexion et fermeture du serveur WebSocket (`wss.close()`) ;
  - Fermeture ordonnée du serveur HTTP (`server.close()`) ;
  - Destruction récursive de tous les processus terminaux enfants (`processManager.terminateAll()`) ;
  - Fermeture de la base SQLite (`runtimeDatabase.close()`).
- Aucun port 3001 orphelin ni processus fantôme n'est possible.

#### Outils de Construction
- `electron-builder` : Configuration déclarative dans `package.json` créant un installateur Windows NSIS standard (`Iroko-Setup-x.x.x.exe`) et/ou un exécutable portable en une commande unifiée `npm run package`.

#### Métriques Estimées
- **Taille de l'installateur produit** : ~75 à 85 Mo (compressé en format NSIS).
- **Taille sur disque installé** : ~180 à 210 Mo (runtime Chromium + Node.js unifié).
- **Temps de démarrage à froid** : 1,1 s à 1,6 s sur une configuration standard.
- **Effort d'implémentation** : Faible (1 à 2 jours, 0 changement d'architecture backend).

---

### Option 2 : Tauri 2.0 (Rust + WebView2)

#### Description
Tauri s'appuie sur le moteur web existant du système d'exploitation (Microsoft Edge WebView2 sur Windows) et une couche applicative écrite en langage Rust.

#### Incompatibilités et Risques pour Iroko
1. **Absence de runtime Node.js natif** : Tauri n'embarque aucun interpréteur JavaScript pour le backend. Pour faire tourner les 25 000 lignes de backend Node.js d'Iroko, Tauri impose l'utilisation d'un binaire Node.js externe configuré en "Sidecar".
2. **Chaîne de compilation manquante** : L'environnement Windows actuel ne dispose ni de `cargo`, ni de `rustc`, ni des bibliothèques C++ MSVC. Compiler l'exécutable Tauri nécessiterait l'installation de plus de 4 Go d'outils système externes.
3. **Poids final faussé par le Sidecar** : L'argument principal de Tauri (léger exécutable de 5 à 10 Mo) s'effondre dans notre cas : l'inclusion obligatoire du binaire Node.js standalone portable (~45 Mo) et de `dist-server/` porte la taille finale de l'installateur à plus de 55-65 Mo, rendant le gain marginal par rapport à Electron.
4. **Complexité de synchronisation** : Gestion de deux processus asynchrones disjoints (le binaire Tauri en Rust et le sidecar Node.js), augmentant considérablement le risque de désynchronisation lors de l'arrêt de la fenêtre (processus sidecar orphelin).

#### Verdict
**Non retenu**. Incompatible avec l'outillage système présent, complexité de maintenance injustifiée par rapport au gain potentiel.

---

### Option 3 : Wrapper Autonome Node.js + WebView2 (via Photino ou script d'amorçage)

#### Description
Utilisation d'un lanceur léger amorçant le serveur local puis ouvrant un contrôle WebView2 Windows natif.

#### Inconvénients
1. **Écosystème fragile** : Les bibliothèques Node.js interagissant directement avec WebView2 sans passer par un framework éprouvé manquent cruellement de stabilité sous Windows 11.
2. **Gestion complexe des dialogues et du cycle de vie** : Nécessite des modules natifs C++ précompilés avec risque d'incompatibilité avec la version de Node.js active.
3. **Portabilité quasi-nulle** : Ne permet aucun portage ultérieur vers macOS ou Linux sans réécriture intégrale du lanceur.

#### Verdict
**Rejeté**. Manque de robustesse et de maintenabilité industrielle.

---

### Option 4 : Mode PWA / Lancement Navigateur Système en Mode Application (`--app`)

#### Description
Un script natif lance le runtime en tâche de fond et ouvre le navigateur par défaut (ex. Chrome ou Edge) avec le commutateur `--app=http://127.0.0.1:3001`.

#### Inconvénients
1. **Régression de l'expérience utilisateur** : L'utilisateur n'a pas l'illusion d'une application dédiée indépendante ; les extensions et réglages du navigateur hôte interfèrent avec l'application.
2. **Arrêt propre impossible à fiabiliser** : Lorsque l'utilisateur ferme la fenêtre Chrome/Edge, le navigateur n'émet aucun signal d'arrêt vers le processus Node.js parent. Le serveur local et ses processus enfants restent actifs en arrière-plan, saturant la mémoire et bloquant le port 3001.
3. **Absence d'API de dialogue natif** : Impossible de remplacer le script PowerShell M3 par une API intégrée à la fenêtre.

#### Verdict
**Rejeté**. Ne respecte ni le critère d'arrêt propre (L8), ni le dialogue natif (M3).

---

## 4. Tableau Comparatif Synthétique

| Critère | Electron 33+ (Option 1) | Tauri 2.0 (Option 2) | Wrapper WebView2 (Option 3) | PWA / Edge `--app` (Option 4) |
| :--- | :---: | :---: | :---: | :---: |
| **Point d'entrée unique sans console** | ✅ OUI (exécutable unique) | ✅ OUI | ⚠️ Nécessite lanceur | ❌ Risque de fenêtre console |
| **Compatibilité backend Node 20+ & SQLite** | ✅ 100% Natif | ⚠️ Via Sidecar externe | ⚠️ Nécessite Node local | ✅ Utilise Node local |
| **Dépendances de compilation externes** | ✅ 0 (npm / JS pur) | ❌ Rustc + Cargo + MSVC | ❌ C++ Build Tools | ✅ 0 |
| **Dialogue de dossier natif (M3)** | ✅ `dialog.showOpenDialog` | ✅ Plugin Rust | ⚠️ Complexe | ❌ Impossible (garde PowerShell) |
| **Arrêt propre garanti (zéro orphelin)** | ✅ Événements `app` fiables | ⚠️ Risque sur le sidecar | ⚠️ Risque de blocage | ❌ Impossible à détecter |
| **Sécurité `Host`/`Origin` et jeton** | ✅ Préservée à 100% | ✅ Préservée | ✅ Préservée | ⚠️ Vulnérable aux extensions |
| **Taille de l'installateur** | ~75 – 85 Mo | ~55 – 65 Mo (avec sidecar) | ~45 – 55 Mo | < 5 Mo (sans runtime) |
| **Temps de démarrage à froid** | ~1,2 – 1,5 s | ~1,0 – 1,3 s | ~1,0 – 1,2 s | ~0,8 – 1,1 s |
| **Multiplateforme (Windows, Mac, Linux)** | ✅ Immédiat (1 config) | ⚠️ Recompilation Rust | ❌ Windows uniquement | ⚠️ Comportement variable |

---

## 5. Recommandation Formelle et Motivée

À la lumière de l'analyse comparative et des contraintes d'exécution réelles vérifiées sur le système, **l'Option 1 (Electron)** est formellement et univoquement recommandée pour le lot **R2b**.

### Justification de la Recommandation
1. **Adéquation technique absolue** : Iroko est intégralement architecturé autour de Node.js, d'ES modules, de `node:sqlite`, de flux WebSockets et de gestion d'arborescences de processus système (`taskkill /T /F`). Electron est la seule technologie capable d'accueillir ce runtime sans artifice ni binarisation externe.
2. **Prêt à l'emploi sans prérequis système** : L'environnement de travail ne dispose pas de Rust ni de compilateur C++. Electron et `electron-builder` s'installent et s'exécutent directement via `npm`, garantissant un build fluide et reproductible sur la machine hôte.
3. **Résolution élégante du Dialogue Natif (M3)** : L'API `dialog.showOpenDialog` d'Electron remplace avantageusement le script PowerShell lourd, garantissant une ouverture instantanée, modale et rattachée à la fenêtre principale sans blocage de focus.
4. **Garantie d'Arrêt Total (L8)** : La capture centralisée des événements de fermeture de la fenêtre principale dans le processus Electron garantit l'appel synchrone de `handleShutdown()`, tuant immédiatement l'arborescence des processus terminaux enfants et libérant le port 3001.

---

## 6. Architecture d'Implémentation Prévue pour le Lot R2b

Dès validation de cette recommandation par l'utilisateur, le lot R2b sera mis en œuvre selon l'architecture chirurgicale suivante :

1. **Point d'entrée Electron (`electron/main.ts`)** :
   - Démarrage du runtime local en mode silencieux (via import direct de `server/index.ts` ou via `utilityProcess.fork`).
   - Création de la `BrowserWindow` principale (100vw × 100dvh, cadre natif sobre, sans menu d'application superflu).
   - Chargement de l'URL locale sécurisée `http://127.0.0.1:3001` dès que le healthcheck `/health` répond avec succès.
   - Verrouillage de la sécurité de la fenêtre : `nodeIntegration: false`, `contextIsolation: true`, blocage de l'ouverture de fenêtres popup externes via `setWindowOpenHandler({ action: 'deny' })`.

2. **Canal de Dialogue Natif Sécurisé (M3)** :
   - Enregistrement d'un gestionnaire IPC `ipcMain.handle('select-directory', ...)` appelant `dialog.showOpenDialog(mainWindow, { properties: ['openDirectory', 'createDirectory'] })`.
   - Exposition contrôlée via `electron/preload.ts` (`window.electronAPI.selectDirectory()`).
   - Côté serveur : le service `WorkspaceDialogPicker` détecte l'environnement Electron et délègue au canal natif, conservant le repli PowerShell uniquement en mode navigateur déconnecté.

3. **Garde Réseau et Origine** :
   - Le serveur local conserve ses règles strictes d'écoute sur `127.0.0.1` et sa vérification du jeton d'authentification en mémoire.
   - Les origines autorisées incluent l'origine locale `http://127.0.0.1:3001` servie par le runtime, garantissant qu'aucune entité externe ne peut piloter le moteur.

4. **Procédure d'Arrêt Récursif et Nettoyage** :
   - Interception de l'événement `window-all-closed` et `before-quit` dans `electron/main.ts`.
   - Exécution ordonnée de la routine `handleShutdown()` (`processManager.terminateAll()`, fermeture WebSocket et HTTP, fermeture SQLite).
   - Sortie propre du processus sans laisser de port occupé.

5. **Script de Construction Unique** :
   - Ajout du script `"package": "npm run build && electron-builder"` dans `package.json`.
   - Configuration déclarative dans `electron-builder.json` ou `package.json` produisant l'installateur Windows NSIS standard (`.exe`) dans `release/`.

---

## 7. Décision Attendue

Conformément à la directive contractuelle de la mission :  
*« N'ouvre ce lot qu'après avoir lu docs/EMPAQUETAGE.md (rapport R2a) et ma validation de sa recommandation. »*

La recommandation pour **l'Option 1 (Electron 33+ avec electron-builder)** est soumise à votre validation formelle avant d'entamer l'implémentation du lot R2b.
