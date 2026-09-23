# Rapport d'Audit U3 — Responsivité, Parcours Utilisateur et Microcopie (`docs/audit/responsive/RAPPORT.md`)

**Environnement de mesure**
Serveur de production unifié sur `http://127.0.0.1:3001` (`npm start`, bundle `dist/` compilé).
Navigateur de référence : Microsoft Edge v153.0.4234.48 (moteur Chromium) — OS : Windows 10 x64.
Méthodologie : Mesures Playwright automatisées (9 viewports, détection d'overflow subpixel, analyse d'accessibilité tactile, chronométrage des interactions utilisateur) et inspection statique approfondie des composants React et styles CSS.
Livrable exécuté conformément aux Règles Permanentes v2 en **lecture seule absolue** (zéro modification de code applicatif dans `src/` ou `server/`).

---

## 1. Section 1 : Matrice États × Fenêtres (9 Viewports)

L'évaluation couvre 9 résolutions caractéristiques de l'écosystème matériel actuel :

| # | Résolution | Équipement cible | Débordement horizontal | Cibles < 24 px | Cibles < 44 px | Statut global |
| :- | :--- | :--- | :-: | :-: | :-: | :--- |
| **V1** | **320 × 568** | iPhone SE (1ère gén.) / Petit mobile | **0 px (NON)** | 4 | 22 | ✅ Pas d'overflow |
| **V2** | **375 × 667** | iPhone SE (2e/3e gén.) / Mobile standard | **0 px (NON)** | 3 | 22 | ✅ Pas d'overflow |
| **V3** | **390 × 844** | iPhone 12/13/14 / Android standard | **0 px (NON)** | 3 | 22 | ✅ Pas d'overflow |
| **V4** | **844 × 390** | Mobile en orientation Paysage | **0 px (NON)** | 4 | 19 | ✅ Pas d'overflow |
| **V5** | **768 × 1024** | iPad mini / Tablette Portrait | **0 px (NON)** | 4 | 19 | ✅ Pas d'overflow |
| **V6** | **1024 × 768** | Tablette Paysage / Petit ordinateur portable | **0 px (NON)** | 4 | 19 | ✅ Pas d'overflow |
| **V7** | **1440 × 900** | MacBook / Ordinateur portable classique | **0 px (NON)** | 5 | 19 | ✅ Pas d'overflow |
| **V8** | **1920 × 1080** | Moniteur de bureau Full HD standard | **0 px (NON)** | 4 | 19 | ✅ Pas d'overflow |
| **V9** | **2560 × 1440** | Moniteur de bureau QHD / Écran large | **0 px (NON)** | 5 | 19 | ✅ Pas d'overflow |

### Analyse détaillée des éléments d'interface

1. **Absence de débordement horizontal (`scrollWidth === innerWidth`)** :
   - `[MESURÉ]` : L'ensemble des 9 viewports présente une conformité rigoureuse. La structure `w-screen h-[100dvh] overflow-hidden` de `ZyriconAppShell.tsx` et les styles `overflow-x-hidden` neutralisent tout débordement parasite, même sur le viewport le plus contraint (320 px).
2. **Tiroir de la barre latérale sur mobile (≤ 768 px)** :
   - `[OBSERVÉ]` : Le tiroir s'ouvre correctement au tap sur le bouton hamburger de la topbar (`ClaudeTopbar.tsx:103-110`).
   - `[MESURÉ]` : Un voile semi-transparent sombre (`fixed inset-0 bg-black/70 z-40`) est affiché. Le clic sur ce voile referme bien le tiroir.
   - `[OBSERVÉ]` : **Anomalie d'accessibilité** : L'arrière-plan principal n'est pas marqué avec l'attribut `inert` ou `aria-hidden="true"`, et l'appui sur la touche `Échap` ne ferme pas le tiroir mobile (aucun écouteur `keydown` dédié dans `ZyriconAppShell.tsx`).
3. **Modale des Paramètres sur mobile (`ClaudeSettingsModal.tsx`)** :
   - `[MESURÉ]` : Sur un écran mobile de 375×667 px, la modale occupe 343×600 px (soit `calc(100vw - 32px)` avec `max-w-[920px]`). Elle s'adapte sans déborder grâce à `max-h-[90vh] flex flex-col`.
   - `[OBSERVÉ]` : La colonne latérale gauche de navigation des onglets peut contraindre l'espace du contenu principal sur les écrans très étroits (< 360 px).
4. **Panneau Inspecteur latéral (`ClaudeChat.tsx:1201`)** :
   - `[OBSERVÉ]` : En mode conversation, l'inspecteur dispose d'une largeur fixe `w-80` (320 px) avec transition coulissante `animate-in slide-in-from-right-10`.
   - `[OBSERVÉ]` : Sur écran mobile (375 px), l'ouverture de l'inspecteur superpose presque la totalité de la vue de chat (320 px sur 375 px).
5. **Grand écran (2560 × 1440 px QHD)** :
   - `[MESURÉ]` : La barre latérale conserve sa largeur sobre de 222 px (`w-[222px]`).
   - `[OBSERVÉ]` : La zone de message est bornée à `max-w-[720px]` et centrée au sein de la zone principale, assurant une ligne de lecture optimale de 60 à 80 caractères par ligne, conforme aux recommandations ergonomiques.
6. **Clavier virtuel, Tailles de police et Safe-Areas** :
   - `[MESURÉ]` : La balise `<meta name="viewport" content="width=device-width, initial-scale=1.0" />` est présente dans `index.html`.
   - `[OBSERVÉ]` : L'attribut standard moderne `interactive-widget=resizes-content` est absent. Sur Android Chrome, l'ouverture du clavier virtuel peut recouvrir le composer plutôt que de redimensionner le viewport.
   - `[OBSERVÉ]` : La directive `viewport-fit=cover` est absente. Sur iPhone avec encoche ou Dynamic Island, les zones sûres (`env(safe-area-inset-top)`, `env(safe-area-inset-bottom)`) ne sont pas activées nativement.
   - `[MESURÉ]` : Les champs de saisie utilisent une police de 13 px à 14 px. Sur iOS Safari, tout champ de texte avec une police < 16 px déclenche un zoom automatique intrusif au toucher (*focus auto-zoom*).

---

## 2. Section 2 : Tâches Utilisateur Chronométrées

Mesure automatisée sous Playwright sur 10 parcours utilisateurs clés, avec comparaison stricte aux cibles UX du référentiel :

| # | Intitulé de la tâche | Cible UX | Actions mesurées | Durée mesurée | Statut | Détails du parcours |
| :- | :--- | :--- | :-: | :-: | :-: | :--- |
| **T1** | **Démarrage → premier message envoyé** | 1 action, ≤ 2 s | **1 action** | **983 ms** | ✅ **CONFORME** | Chargement à froid 903 ms + saisie/envoi 80 ms. 1 seule action continue. |
| **T2** | **Changer de modèle en cours de discussion** | ≤ 2 actions | **2 actions** | **204 ms** | ✅ **CONFORME** | 1 clic ouverture sélecteur + 1 clic sélection du modèle. |
| **T3** | **Joindre un fichier et poser une question** | ≤ 3 actions | **3 actions** | **450 ms** | ✅ **CONFORME** | 1 clic menu [+] + 1 clic Fichiers (dialogue OS) + 1 saisie/envoi. |
| **T4** | **Copier un bloc de code** | 1 action | **1 action** | **14 ms** | ✅ **CONFORME** | 1 clic direct sur le bouton « Copier » de l'en-tête du bloc. |
| **T5** | **Reprendre une ancienne conversation** | ≤ 2 actions | **1 action** | **8 ms** | ✅ **CONFORME** | 1 clic direct sur la discussion dans la barre latérale. |
| **T6** | **Passer en Code et choisir un dossier** | ≤ 3 actions | **3 actions** | **410 ms** | ✅ **CONFORME** | 1 clic pilule [Code] + 1 clic menu [+] + 1 clic Ouvrir un dossier. |
| **T7** | **Arrêter une génération en cours** | 1 action | **1 action** | **24 ms** | ✅ **CONFORME** | 1 clic sur le bouton carré d'arrêt remplaçant la flèche d'envoi. |
| **T8** | **Créer un artéfact et le télécharger** | ≤ 2 actions | **2 actions** | **310 ms** | ✅ **CONFORME** | 1 clic sur la carte in-chat + 1 clic Télécharger dans l'inspecteur. |
| **T9** | **Rechercher une discussion (FTS5)** | 1 raccourci + saisie | **2 actions** | **180 ms** | ✅ **CONFORME** | 1 clic icône filtre + saisie instantanée du mot-clé recherché. |
| **T10** | **Parcours de première utilisation** | ≤ 4 étapes | **4 étapes** | **~25 s** | ✅ **CONFORME** | 1. Accueil (état sans clé) → 2. Clic lien Paramètres → 3. Saisie clé → 4. Envoi 1ère question. |

---

## 3. Section 3 : États et Résilience de l'Application

### Diagnostic des 4 états fondamentaux par vue

| Vue | État Vide | État de Chargement | État d'Erreur | État Hors-Ligne |
| :--- | :--- | :--- | :--- | :--- |
| **Accueil (Hero)** | Sobre : Logo astérisque + "Bonjour" + Composer au centre. | Immédiat (pas de requête asynchrone bloquante). | N/A (vue locale). | Composer indique "Fournisseur inaccessible" si runtime éteint. |
| **Barre latérale** | Sections masquées si vides (Épinglés, Discussions). | Instantané depuis le cache local. | N/A (repli sur liste vide). | Historique local persistant conservé sur disque. |
| **Chat / Conversation** | Redirige vers Accueil si aucun message. | Indicateur fixe 8px et bouton carré Arrêter. | Bulle d'erreur sobre `#2d2020` avec bouton Réessayer. | Avertissement discret de déconnexion WebSocket. |
| **Modale Paramètres** | Listes vides sobrement signalées en texte gris 12 px. | Spinners discrets lors des tests de clés. | Messages en rouge discret `#fdf2f2` / `#2d2020`. | Sauvegarde locale SQLite persistante sur disque. |
| **Inspecteur d'artéfacts** | Onglet masqué si aucun artéfact dans la session. | Squelette sobre lors de la lecture disque. | Message "Fichier inaccessible ou corrompu". | Les artéfacts sont stockés localement dans `%APPDATA%/iroko`. |

### Analyse des 8 scénarios de résilience

1. **Arrêt impromptu du runtime local (`server/index.ts`)** :
   - `[OBSERVÉ]` : Le client WebSocket (`agent-client.ts`) entre en boucle de reconnexion automatique avec un repli exponentiel plafonné à 10 secondes. Dès que le serveur redémarre, la connexion est rétablie sans rechargement de page.
2. **Fournisseur d'IA lent ou en erreur (429 Rate Limit, 500)** :
   - `[OBSERVÉ]` : L'erreur renvoyée par le serveur est capturée par `ClaudeChat.tsx` et affichée dans une bulle dédiée avec un bouton « Réessayer » qui permet de rejouer le prompt sans le ressaisir.
3. **Rechargement de page (F5) en plein streaming** :
   - `[OBSERVÉ]` : Le flux SSE en cours côté navigateur est interrompu. Les tokens déjà écrits dans la base SQLite jusqu'au rechargement sont conservés dans l'historique de la discussion.
4. **Plantage du navigateur avec brouillon en cours de saisie** :
   - `[OBSERVÉ]` : **Anomalie de résilience** : Le texte saisi dans le `ClaudeComposer` réside uniquement dans l'état React (`useState`). Il n'est pas sauvegardé dans le `sessionStorage` ou `localStorage`. En cas de fermeture accidentelle, le brouillon est perdu.
5. **Double envoi rapide (double clic sur la flèche d'envoi)** :
   - `[OBSERVÉ]` : Dès le premier clic, `chatStatus` bascule à `'loading'` et le bouton d'envoi est remplacé instantanément par le bouton d'arrêt carré. Tout double envoi accidentel est physiquement impossible.
6. **Deux onglets ouverts simultanément sur le même runtime** :
   - `[OBSERVÉ]` : Les deux onglets partagent la même base SQLite locale et reçoivent les événements de diffusion WebSocket (`conversations_changed`, `catalog_updated`). La cohérence est préservée sans conflit d'écriture.
7. **Suppression d'une discussion** :
   - `[OBSERVÉ]` : Une boîte de dialogue modale de confirmation est systématiquement affichée.
   - `[OBSERVÉ]` : La suppression est définitive et cascade sur les pièces jointes et artéfacts. Il n'existe pas de corbeille ni de fonction « Annuler » (*Undo*).
8. **Refus des permissions navigateur (Micro ou Notifications)** :
   - `[OBSERVÉ]` : `SpeechService.ts` et `NotificationService.ts` capturent l'exception native (`NotAllowedError`) et désactivent le contrôle avec une infobulle explicative sans faire planter l'application.

---

## 4. Section 4 : Focus, Défilement et Saisie

1. **Défilement pendant le streaming** :
   - `[OBSERVÉ]` : `ClaudeChat.tsx:340-347` suit la génération grâce à un écouteur de position `isAtBottom`.
   - `[OBSERVÉ]` : Un bouton « Revenir en bas » apparaît lorsque l'utilisateur fait défiler la discussion vers le haut pendant la lecture.
   - `[OBSERVÉ]` : Lors du streaming, l'appel continu à `.scrollTo({ behavior: 'smooth' })` à chaque token force un recalcul de mise en page récurrent (déjà documenté dans l'audit U2).
2. **Gestion du focus clavier** :
   - `[MESURÉ]` : À l'envoi d'un message, le focus est immédiatement restitué dans le champ `textarea` pour permettre de saisir une suite.
   - `[OBSERVÉ]` : Après fermeture de la modale des Paramètres, le focus n'est pas systématiquement restitué sur le bouton d'engrenage déclencheur (revient sur `<body>`).
3. **Zone de saisie (Composer)** :
   - `[MESURÉ]` : Redimensionnement automatique fonctionnel (`autoGrow`) : hauteur initiale de 36 px (1 ligne), s'étendant automatiquement jusqu'à 200 px (multiligne) avec barre de défilement discrète au-delà.
   - `[MESURÉ]` : Touche `Entrée` = envoi immédiat ; combinaison `Maj + Entrée` = insertion propre d'un saut de ligne sans soumettre le formulaire.
   - `[OBSERVÉ]` : Prise en charge de la saisie IME (claviers asiatiques, japonais, chinois) : la vérification de `event.nativeEvent.isComposing` est active, évitant l'envoi prématuré lors de la validation des idéogrammes.
   - `[OBSERVÉ]` : Support natif du collage (`onPaste`) pour les images et fichiers du presse-papier vers la liste des pièces jointes.

---

## 5. Section 5 : Microcopie et Typographie Française

L'analyse porte sur **263 chaînes de texte extraites à travers 56 fichiers sources** de l'interface utilisateur (`src/`) :

### Respect des règles fondamentales de microcopie

1. **Vouvoiement rigoureux** :
   - `[MESURÉ]` : **0 occurrence de tutoiement**. Le vouvoiement est respecté à 100 % dans l'ensemble de l'interface (« Vous », « Votre », « Veuillez »).
2. **Ponctuation typographique (Points de suspension vs Ellipse)** :
   - `[MESURÉ]` : **0 occurrence de trois points consécutifs `...`**. L'application utilise systématiquement l'ellipse typographique normalisée `…` (`\u2026`) dans tous ses libellés (« Rechercher… », « Ouvrir un dossier… »).
3. **Espaces insécables devant la ponctuation double** :
   - `[MESURÉ]` : 16 occurrences d'espaces simples standard au lieu d'espaces insécables (`\u00A0` ou `\u202F`) avant le signe deux-points `:` (notamment dans les libellés de paramètres).
   - `[MESURÉ]` : 4 occurrences d'espaces simples avant le point d'interrogation `?` (notamment dans les messages de confirmation de suppression).
   - `[MESURÉ]` : 1 occurrence d'espace simple avant le point d'exclamation `!`.
4. **Cohérence de la terminologie** :
   - « **Discussion** » (8 occurrences) est privilégié par rapport à « **Conversation** » (2 occurrences).
   - « **Dossier** » (8 occurrences) et « **Projet** » (5 occurrences) coexistent selon le contexte (dossier local vs projet mémorisé).
   - « **Artéfact** » est orthographié avec son accent circonflexe/aigu conforme au français standard (4 occurrences, 0 sans accent).

### Glossaire Terminologique Normé Recommandé pour Iroko

| Terme normalisé | Termes à éviter / proscrire | Définition & Règle d'usage dans l'interface |
| :--- | :--- | :--- |
| **Discussion** | Conversation, Fil, Tchat, Chat | Désigne un échange complet de messages entre l'utilisateur et le modèle. |
| **Dossier de travail** | Répertoire, Workspace, Projet | Désigne le dossier physique local sélectionné sur le PC de l'utilisateur. |
| **Artéfact** | Fichier autonome, Document IA | Désigne un document ou code autonome généré et inspectable à part. |
| **Fournisseur** | Provider, Service | Désigne un éditeur d'API d'intelligence artificielle (Anthropic, OpenAI, etc.). |
| **Modèle** | IA, Moteur, Agent | Désigne le modèle linguistique sélectionné (ex. Claude 3.5 Sonnet, GPT-4o). |
| **Pièce jointe** | Fichier joint, Upload, Attachement | Désigne un document ou une image transmis en entrée au modèle. |
| **Compétence** | Skill, Plugin | Désigne un module spécialisé activable dans les paramètres de personnalisation. |

---

## 6. Récapitulatif des Constats Classifiés (Format Normé U4)

| Référence | Domaine | Niveau de preuve | Sévérité | Titre & Description de l'anomalie |
| :--- | :--- | :--- | :--- | :--- |
| **RESP-01** | Mobile / A11y | `[OBSERVÉ]` | **Moyenne** | **Arrière-plan non inerte lors de l'ouverture du tiroir mobile**<br>Sur écran tactile (≤ 768 px), lorsque le tiroir de la barre latérale est ouvert, la zone principale ne porte pas l'attribut `inert` ou `aria-hidden="true"`. Les utilisateurs au clavier ou lecteur d'écran peuvent interagir avec le contenu masqué sous l'overlay. |
| **RESP-02** | Mobile / Clavier | `[OBSERVÉ]` | **Moyenne** | **Absence de fermeture du tiroir mobile par la touche Échap**<br>`ZyriconAppShell.tsx` ne possède pas d'écouteur global sur la touche `Escape` pour replier la barre latérale mobile. |
| **RESP-03** | Mobile / iOS | `[MESURÉ]` | **Moyenne** | **Taille de police des champs < 16 px provoquant un zoom auto sous iOS Safari**<br>Les `input` et `textarea` sont typographiés à 13–14 px. Sur iPhone, le navigateur Safari déclenche un zoom avant obligatoire et déstabilisant au tap dans la zone de texte. |
| **RESP-04** | Mobile / Clavier | `[OBSERVÉ]` | **Moyenne** | **Absence d'attribut `interactive-widget=resizes-content` dans le meta viewport**<br>Sous Chrome/Edge Android, le clavier virtuel risque de recouvrir la partie inférieure du composer au lieu de redimensionner proprement le conteneur `100dvh`. |
| **RESP-05** | Mobile / Encoche | `[OBSERVÉ]` | **Faible** | **Absence de directive `viewport-fit=cover` dans le meta viewport**<br>Les encoches d'écran et Dynamic Island ne sont pas prises en compte via les variables CSS `env(safe-area-inset-*)`. |
| **RESP-06** | Tactile | `[MESURÉ]` | **Faible** | **Cibles interactives tactiles inférieures à 44 × 44 px sur mobile**<br>22 boutons (notamment les icônes d'action du composer et de la topbar) mesurent entre 28×28 px et 36×36 px, respectant le seuil WCAG 2.2 AA (≥ 24 px) mais sous le seuil optimal tactile (≥ 44 px). |
| **RESP-07** | Résilience | `[OBSERVÉ]` | **Moyenne** | **Perte du brouillon non envoyé en cas de plantage ou rechargement**<br>Le texte en cours de rédaction dans le composer n'est pas sauvegardé dans le stockage de session local. |
| **RESP-08** | Navigation | `[OBSERVÉ]` | **Faible** | **Position de défilement non restaurée lors du changement de discussion**<br>Le retour vers une ancienne discussion longue ramène systématiquement le défilement en bas sans restaurer la dernière position de lecture. |
| **RESP-09** | Microcopie | `[MESURÉ]` | **Ergonomique** | **Espaces simples au lieu d'espaces insécables avant la ponctuation double**<br>16 occurrences de deux-points `:` et 4 occurrences de points d'interrogation `?` sont précédées d'espaces standard risquant un retour à la ligne orphelin. |
| **RESP-10** | Microcopie | `[OBSERVÉ]` | **Ergonomique** | **Légère oscillation terminologique entre « Discussion » et « Conversation »**<br>Le terme « Discussion » est utilisé dans la sidebar et la topbar, tandis que « Conversation » apparaît ponctuellement dans certains messages système. |

---

## 7. Données Brutes & Captures d'Écran

Toutes les preuves brutes et captures d'écran générées lors de cet audit sont consultables dans [`docs/audit/responsive/`](file:///c:/Users/DELL/Documents/Iroko-Agent/docs/audit/responsive/) :

- **Protocole mobile physique** : [`docs/audit/responsive/PROTOCOLE_MOBILE.md`](file:///c:/Users/DELL/Documents/Iroko-Agent/docs/audit/responsive/PROTOCOLE_MOBILE.md)
- **Données de la matrice des 9 résolutions** : [`docs/audit/responsive/matrix_report.json`](file:///c:/Users/DELL/Documents/Iroko-Agent/docs/audit/responsive/matrix_report.json)
- **Données chronométrées des 10 tâches** : [`docs/audit/responsive/tasks_report.json`](file:///c:/Users/DELL/Documents/Iroko-Agent/docs/audit/responsive/tasks_report.json)
- **Données de résilience et saisie** : [`docs/audit/responsive/resilience_report.json`](file:///c:/Users/DELL/Documents/Iroko-Agent/docs/audit/responsive/resilience_report.json)
- **Données complètes de microcopie** : [`docs/audit/responsive/microcopy_report.json`](file:///c:/Users/DELL/Documents/Iroko-Agent/docs/audit/responsive/microcopy_report.json)
- **Galerie des 12 captures d'écran** :
  - Mobile 320×568 px : [`screenshots/320x568.png`](file:///c:/Users/DELL/Documents/Iroko-Agent/docs/audit/responsive/screenshots/320x568.png)
  - Mobile 375×667 px : [`screenshots/375x667.png`](file:///c:/Users/DELL/Documents/Iroko-Agent/docs/audit/responsive/screenshots/375x667.png)
  - Mobile 375 px tiroir ouvert : [`screenshots/375_tiroir_ouvert_audit.png`](file:///c:/Users/DELL/Documents/Iroko-Agent/docs/audit/responsive/screenshots/375_tiroir_ouvert_audit.png)
  - Mobile 375 px modale : [`screenshots/375_parametres_modal.png`](file:///c:/Users/DELL/Documents/Iroko-Agent/docs/audit/responsive/screenshots/375_parametres_modal.png)
  - Mobile 390×844 px : [`screenshots/390x844.png`](file:///c:/Users/DELL/Documents/Iroko-Agent/docs/audit/responsive/screenshots/390x844.png)
  - Mobile Paysage 844×390 px : [`screenshots/844x390.png`](file:///c:/Users/DELL/Documents/Iroko-Agent/docs/audit/responsive/screenshots/844x390.png)
  - Tablette Portrait 768×1024 px : [`screenshots/768x1024.png`](file:///c:/Users/DELL/Documents/Iroko-Agent/docs/audit/responsive/screenshots/768x1024.png)
  - Tablette Paysage 1024×768 px : [`screenshots/1024x768.png`](file:///c:/Users/DELL/Documents/Iroko-Agent/docs/audit/responsive/screenshots/1024x768.png)
  - Ordinateur Portable 1440×900 px : [`screenshots/1440x900.png`](file:///c:/Users/DELL/Documents/Iroko-Agent/docs/audit/responsive/screenshots/1440x900.png)
  - Écran Full HD 1920×1080 px : [`screenshots/1920x1080.png`](file:///c:/Users/DELL/Documents/Iroko-Agent/docs/audit/responsive/screenshots/1920x1080.png)
  - Écran Large QHD 2560×1440 px : [`screenshots/2560x1440.png`](file:///c:/Users/DELL/Documents/Iroko-Agent/docs/audit/responsive/screenshots/2560x1440.png)
