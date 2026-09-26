# Architecture de l'Interface Utilisateur Iroko (`docs/UI_ARCHITECTURE.md`)

Ce document constitue la référence unique et figée de l'architecture UI/UX d'Iroko. Il consigne la mise en page, les composants, les tokens, les états, la réactivité et les règles strictes d'intégrité visuelle.

---

## 1. Arbre de mise en page & Dimensions clés

L'application s'exécute en conteneur bord à bord occupant 100 % de l'écran (`100vw × 100dvh`). Aucun cadre flottant, aucun padding externe, aucune ombre de conteneur, aucun dégradé périphérique.

```
┌────────────────────────────────────────────────────────────────────────┐
│ ZyriconAppShell (100vw × 100dvh, flex row, bg: var(--bg-app))          │
├───────────────────┬────────────────────────────────────────────────────┤
│ ClaudeSidebar     │ ClaudeTopbar (h-12 / 48px, px-4, flex items-center)│
│ (largeur: ~222px) ├────────────────────────────────────────────────────┤
│                   │ Zone de contenu principale (flex-1, min-h-0)       │
│ • Header (48px)   │                                                    │
│ • Navigation      │  • Accueil (activeView == 'home') :                │
│   (Personnaliser) │    ClaudeHero (centré ~40% viewport, w-full)       │
│ • Scroll liste    │    - Titre "Iroko Agent" (serif ~44px)             │
│   (filtre Tout/   │    - Sous-titre ("Comment puis-je vous aider")     │
│   Chat/Code/      │    - ClaudeComposer (max-w-[576px])                │
│   Épinglées)      │                                                    │
│ • Footer (36px,   │  • Conversation (activeView == 'chat') :           │
│   Paramètres)     │    ClaudeChat (flex-1 flex col)                    │
│                   │    - Messages défilants (max-w-[720px])            │
│                   │    - Étapes d'outils & PermissionPrompt in-chat    │
│                   │    - ClaudeComposer (max-w-[720px], sticky bottom) │
│                   │      avec sélecteur unique [ Chat | Code ]         │
│                   │    - Panneau Inspecteur latéral droit (w-80 / 320px)│
│                   │      (Modifications + Git, Plan, Terminal, Tests)  │
└───────────────────┴────────────────────────────────────────────────────┘

Modale de paramètres : ClaudeSettingsModal (920px × 720px, max-h-[90vh], z-50)
Voile d'arrière-plan : noir 75% semi-opaque sans flou (bg-black/75)
Tiroir mobile (≤768px) : Drawer latéral animé (slide-in) avec overlay sombre
```

### Dimensions structurelles
- **Plein écran** : `100vw × 100dvh` strict.
- **Barre latérale (Sidebar)** : `w-[222px]`, repliable à `0px` (`-translate-x-full` sur mobile).
- **Barre supérieure (Topbar)** : `h-12` (48px), fixe, `border-b: none`, fond transparent.
- **Barre de saisie (Composer)** :
  - Mode Accueil : `max-w-[576px]`.
  - Mode Conversation : `max-w-[720px]`.
  - Puce de projet actif au-dessus de la saisie (icône Dossier, nom du projet / "Espace temporaire", indicateur "Lecture seule" le cas échéant, bouton de copie vers PC pour l'espace temporaire, bouton de fermeture ×).
  - Puces de pièces jointes au-dessus de la saisie (vignette carrée 32px / icône de type, nom de fichier, taille, état, bouton de suppression ×).
  - Puce "Image" retirable [X] au-dessus de la saisie (icône Image, libellé "Image", bouton de retrait × orientant le modèle vers la génération visuelle).
  - Puce "Vidéo" retirable [X] au-dessus de la saisie (icône Film, libellé "Vidéo", bouton de retrait × orientant le modèle vers la génération vidéo).
- **Panneau Inspecteur (Diff / Plan / Terminal / Tests / Aperçu / Artéfacts)** : `w-80` (320px), ancré à droite en conversation (onglets Terminal et Tests actifs en mode Code, onglet Aperçu pour les pièces jointes, onglet Artéfacts pour les documents autonomes générés).
- **Modale Paramètres** : `max-w-[920px] × 720px` (colonne gauche: ~185px, contenu: flex-1, sous-sections "Génération d'images" et "Génération de vidéos" dans Fournisseurs & Clés).

---

## 2. Carte des composants

| Composant | Fichier source | Rôle principal | Utilisé dans |
| :--- | :--- | :--- | :--- |
| **ZyriconAppShell** | `src/components/layout/ZyriconAppShell.tsx` | Conteneur racine bord-à-bord, gestion de la sidebar mobile et routage des vues | `src/App.tsx` |
| **ClaudeTopbar** | `src/components/layout/ClaudeTopbar.tsx` | En-tête minimaliste (déclencheur sidebar, titre de discussion, action paramètres) | `ZyriconAppShell.tsx` |
| **ClaudeSidebar** | `src/components/layout/ClaudeSidebar.tsx` | Navigation latérale (+ Nouveau, Personnaliser, Épinglés, Discussions avec filtre, champ de recherche FTS5 instantané, indicateur d'activité 8px des tâches en arrière-plan, Paramètres) | `ZyriconAppShell.tsx` |
| **ClaudeComposer** | `src/components/composer/ClaudeComposer.tsx` | Zone de saisie universelle (textarea auto-grow, menu +, sélecteur unique [Chat/Code], sélecteur de modèle, puces Image/Vidéo/Projet, jauge textuelle de contexte discret dès 60%) | `ClaudeHero.tsx`, `ClaudeChat.tsx` |
| **ClaudeHero** | `src/features/home/ClaudeHero.tsx` | Vue d'accueil épurée avec titre "Iroko Agent" en serif et sous-titre "Comment puis-je vous aider aujourd'hui ?" | `ZyriconAppShell.tsx` |
| **ClaudeChat** | `src/features/chat/ClaudeChat.tsx` | Vue conversationnelle unique (assemblage modulaire < 400 lignes : messages défilants, inspecteur latéral, suivi streaming, modales) | `ZyriconAppShell.tsx` |
| **ChatMessageItem** | `src/features/chat/ChatMessageItem.tsx` | Bulle de message unitaire (`<article>`, `<h3>` masqué, actions au survol/focus, puces de pièces jointes, artéfacts intégrés) | `ClaudeChat.tsx` |
| **FormattedMessage** | `src/features/chat/FormattedMessage.tsx` | Rendu Markdown mémoïsé de premier niveau (`MemoizedBlock`, `renderInline` sécurisé anti-XSS et anti-exfiltration) | `ChatMessageItem.tsx`, `ClaudeChat.tsx` |
| **ChatInspectorPanel** | `src/features/chat/ChatInspectorPanel.tsx` | Tiroir d'inspection latéral droit (6 onglets : modifications, plan, terminal, tests, aperçu, artéfacts) | `ClaudeChat.tsx` |
| **ActiveVideoJobCard** | `src/features/chat/ActiveVideoJobCard.tsx` | Carte de suivi in-chat des tâches vidéo en cours (durée, bouton d'arrêt sobre) | `ClaudeChat.tsx` |
| **LiveToolExecutions** | `src/features/chat/LiveToolExecutions.tsx` | Affichage sobre en direct des étapes d'outils en cours d'exécution | `ClaudeChat.tsx` |
| **DeleteMessageModal** | `src/features/chat/modals/DeleteMessageModal.tsx` | Boîte de dialogue accessible de confirmation de suppression de message | `ClaudeChat.tsx` |
| **EditMessageModal** | `src/features/chat/modals/EditMessageModal.tsx` | Boîte de dialogue accessible de modification et renvoi avec analyse d'impact | `ClaudeChat.tsx` |
| **ClaudeSettingsModal** | `src/features/settings/ClaudeSettingsModal.tsx` | Fenêtre modale des réglages découpée en 10 pages modulaires (`src/features/settings/pages/`) et 10 hooks spécialisés (`src/hooks/settings/`), toutes sous le plafond strict de 400 lignes. Section `StorageBreakdownSection` isolée pour l'audit et compactage VACUUM. | `ZyriconAppShell.tsx` |
| **TasksWorkspace** | `src/features/tasks/TasksWorkspace.tsx` | Suivi des tâches et de la feuille de route du projet | `ZyriconAppShell.tsx` |
| **DiffViewer** | `src/features/agent/DiffViewer.tsx` | Rendu visuel des diffs unifiés et fichiers modifiés | `ClaudeChat.tsx` |
| **PermissionPrompt** | `src/features/agent/PermissionPrompt.tsx` | Invite d'approbation d'outils et commandes sensibles in-chat | `ClaudeChat.tsx` |
| **CodeBlock** | `src/features/chat/CodeBlock.tsx` | Blocs de code CommonMark avec copie fiable sans saut visuel, retour à la ligne et coloration monochrome sobre | `ClaudeChat.tsx`, `ArtifactInspector.tsx` |
| **ArtifactCard** | `src/features/chat/ArtifactCard.tsx` | Carte sobre d'artéfact sous les bulles assistant : affichage image pleine largeur, lecteur vidéo natif `<video controls preload="metadata">` sans autoplay via ticket éphémère (5 min, non loggué), métadonnées, actions (ouvrir, télécharger, copier) | `ClaudeChat.tsx` |
| **ArtifactInspector** | `src/features/chat/ArtifactInspector.tsx` | Panneau inspecteur d'artéfacts (visualisation texte/code/markdown/csv/json, iframe sandboxée HTML sans réseau, image SVG isolée, images matricielles avec métadonnées, aperçus bureautiques docx/xlsx/pptx/pdf, historique de versions v1..vN, restauration, téléchargement unitaire et archive ZIP complète) | `ClaudeChat.tsx` |
| **MessageSources** | `src/features/chat/MessageSources.tsx` | Composant sobre (< 100 lignes) d'affichage des sources de recherche citées sous les réponses assistant et après les cartes d'artéfacts (titre tronqué, domaine sans www, liens `_blank` sécurisés `noopener noreferrer`, repli au-delà de 4 sources, cibles ≥ 24 px) | `ChatMessageItem.tsx` |
| **ModelSelectorMenu** | `src/components/composer/ModelSelectorMenu.tsx` | Menu déroulant accessible du sélecteur de modèles (sections Favoris, Récents limités à 3, Fournisseurs prêts et leurs tiers, tags sobres Gratuit/Vision/Raisonnement/Outils sans montant, champ de recherche en direct, lien vers Gérer les modèles, détection d'incompatibilité en temps réel, navigation clavier intégrale) | `ClaudeComposer.tsx` |
| **ManageModelsSection** | `src/features/settings/pages/ManageModelsSection.tsx` | Panneau modulaire de gestion du catalogue de modèles dans Paramètres › Fournisseurs & Clés (recherche instantanée, étoiles de favoris, icônes de masquage, affichage des prix exacts de l'API en texte gris) | `ProvidersPage.tsx` |
| **SearchProvidersSection** | `src/features/settings/pages/SearchProvidersSection.tsx` | Sous-section modulaire (< 250 lignes) de gestion des fournisseurs de recherche web (Brave, Tavily, URL personnalisée, Mock) dans Paramètres › Fournisseurs & Clés avec statut, clé masquée, test réel et ajout | `ProvidersPage.tsx` |
| **SkillsPage** | `src/features/settings/pages/SkillsPage.tsx` | Page modulaire des compétences (catalogue prompt vs instructions complètes §13, architecture Niveau 3, badges "Système" / "Importée", suppression masquée pour les compétences système non supprimables, carte sobre de confirmation de sécurité affichant les scripts, URLs et appels réseau avant activation) | `ClaudeSettingsModal.tsx` |
| **UndoDeletionBanner** | `src/components/common/UndoDeletionBanner.tsx` | Bandeau discret fixe centré en bas (`role="status"`, `aria-live="polite"`, `data-undo-banner="true"`) affichant l'avis de suppression différée ("X supprimé. Annuler.") pendant 5 secondes avec bouton de rétractation immédiat | `ZyriconAppShell.tsx` |


---

## 3. Tokens réels du projet

Définis dans [`src/index.css`](file:///c:/Users/DELL/Documents/Iroko-Agent/src/index.css) :

### Couleurs Sombre (:root) & Clair (html.light) — 100% WCAG AA Conforme
- `--bg-app` : Sombre `#151515` / Clair `#ffffff` (Fond principal de l'application).
- `--bg-sidebar` : Sombre `#181817` / Clair `#fbfbfa` (Fond de la barre latérale).
- `--bg-surface` : Sombre `#20201f` / Clair `#f4f4f2` (Fond du composer et des surfaces d'accueil).
- `--bg-surface-hover` : Sombre `#262625` / Clair `#eaeae7` (Surface au survol).
- `--bg-active` : Sombre `#2b2a29` / Clair `#e2e2df` (Élément de navigation sélectionné / actif).
- `--bg-modal` : Sombre `#1a1a19` / Clair `#ffffff` (Corps principal des modales).
- `--bg-modal-sidebar` : Sombre `#151515` / Clair `#f7f7f6` (Colonne latérale de navigation des modales).

### Bordures & Lignes de séparation
- `--border-subtle` : Sombre `#242423` / Clair `#e5e4df` (Lignes séparatrices subtiles).
- `--border-composer` : Sombre `#30302f` / Clair `#d8d6ce` (Contour de la boîte du composer).
- `--border-modal` : Sombre `#2d2d2b` / Clair `#d4d2cb` (Contour de la fenêtre de paramètres et cartes).
- `--border-separator` : Sombre `#232322` / Clair `#e5e4df` (Séparateurs internes de sections).
- `--border-focus` : Sombre `#ededeb` / Clair `#191918` (Indicateur universel de focus boutons/liens).
- `--border-focus-field` : Sombre `#767470` / Clair `#686765` (Bordure de focus des conteneurs de champs texte, ≥ 3,0:1 sur toutes surfaces).

### Typographie & Textes (Ratios de contraste vérifiés ≥ 4,5:1 texte normal, ≥ 3,0:1 titres)
- `--font-sans` : `"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`.
- `--font-serif` : `"Newsreader", "Source Serif 4", Georgia, serif`.
- `--text-primary` : Sombre `#ededeb` (15.58:1) / Clair `#191918` (17.42:1) (Texte principal).
- `--text-secondary` : Sombre `#bcbab5` (9.42:1 sur fond app, palier distinct du tertiaire) / Clair `#686765` (7.22:1) (Texte secondaire neutre).
- `--text-tertiary` : Sombre `#959390` (5.96:1 sur fond app, 4.68:1 sur actif, ≥ 4,5:1 partout) / Clair `#8c8a85` (Textes tertiaires et métadonnées discrètes).
- `--text-placeholder` : Sombre `#959390` / Clair `#8c8a85` (Placeholder composer et recherche, ≥ 4,5:1 sur toutes surfaces).
- `--text-title` : Sombre `#e5e4e2` (12.83:1) / Clair `#141413` (16.86:1) (Titres de sections et modales).

### Arrondis (Border Radius)
- `--radius-composer: 16px` : Contour du composer principal.
- `--radius-modal: 16px` : Fenêtre de paramètres et dialogues modaux.
- `--radius-button: 8px` : Boutons de navigation et boutons de la sidebar.
- `--radius-item: 8px` : Lignes de liste (projets, discussions).
- `--radius-pill: 9999px` : Contrôle segmenté [ Chat | Code ].

### Transitions & Animations
- `--transition-fast: 150ms cubic-bezier(0.16, 1, 0.3, 1)`.
- `--transition-sidebar: 200ms cubic-bezier(0.16, 1, 0.3, 1)`.

---

## 4. États standards des contrôles

- **État vide (Empty state)** :
  - Sidebar : section masquée (aucun libellé vide inutile pour éviter le bruit).
  - Conversation : texte centré sobre 13px gris (`var(--text-secondary)`) sans bouton ni illustration.
- **État désactivé (Disabled)** :
  - Classe Tailwind : `opacity-40 cursor-not-allowed pointer-events-none`.
  - Attribut HTML : `disabled` et `aria-disabled="true"`.
  - Aucun changement de position ni de dimensions.
- **État survol (Hover)** :
  - Boutons de navigation : `var(--bg-surface-hover)`, couleur de texte `var(--text-primary)`.
  - Icônes discrètes : transition de `var(--text-secondary)` vers `var(--text-primary)`.
- **État sélectionné / actif (Active)** :
  - Bouton ou ligne active : `var(--bg-active)`, texte `var(--text-primary)`.
- **État focus (Focus visible — Lot 1 / WCAG 2.2 AA)** :
  - Indicateur universel `:focus-visible` avec contour `2px solid var(--border-focus)` décalé de 2px (`outline-offset: 2px`).
  - Décalage négatif (`outline-offset: -2px`) dans la barre latérale pour empêcher tout rognage par les conteneurs à défilement (WCAG 2.4.11).
  - Exemption stricte d'anneau d'outline sur les champs de saisie (`input`, `textarea`, `select`) au profit de la mise en valeur du conteneur parent `[data-field-container]:focus-within` via `--border-focus-field` (≥ 3,0:1 sur toutes surfaces).
  - Prise en charge native du mode contraste élevé `@media (forced-colors: active)` via le mot-clé système `Highlight`.
- **Repères Sémantiques & Navigation Clavier (Lot 3 / WCAG 1.3.1, 2.4.1)** :
  - Lien d'évitement `#main-content` en haut de page (`sr-only focus:not-sr-only`), visible au premier Tab clavier.
  - Balise `<header>` pour la barre supérieure (`ClaudeTopbar`).
  - Balise `<nav aria-label="Navigation">` pour la liste des discussions et projets dans la barre latérale (`ClaudeSidebar`).
  - Balise `<main id="main-content" tabIndex={-1}>` pour l'espace central de conversation (`ZyriconAppShell`).
  - Messages de conversation balisés en `<article>` avec titre masqué `<h3 className="sr-only">` ("Vous avez dit :" / "Iroko a dit :").
- **Régions en Direct & Annonces d'États (Lot 3 / WCAG 4.1.3, Règle U6)** :
  - Région `role="status" aria-live="polite" aria-atomic="true"` dans `ZyriconAppShell` branchée sur `useLiveAnnouncements`.
  - Annonces limitées strictement aux 4 transitions de phase ("Réflexion en cours…", "Génération en cours…", "Réponse terminée.", "Génération arrêtée."), zéro annonce par token pour éviter la pollution vocale.
  - Région `role="alert" aria-live="assertive"` pour les erreurs critiques et les demandes d'autorisation.
- **Rôles, Noms et États Accessibles (Lot 3 / WCAG 4.1.2)** :
  - Contrôle segmenté Chat | Code : `role="group" aria-label="Mode"` avec `aria-pressed={composerMode === 'chat'|'code'}`.
  - Boutons d'action : `aria-label`, `aria-description` pour les états désactivés/incompatibles, `aria-expanded` pour les menus dépliables.
- **Cibles Interactives Minimales (Lot 3 / WCAG 2.5.8)** :
  - Classe utilitaire `.tap-target-24` avec pseudo-élément `::before` centré transparent étendant la zone de clic à 24×24 px (et 44×44 px sur `@media (pointer: coarse)`) sans altération de la grille ni de la mise en page visuelle.

---

## 5. Comportement réactif & Breakpoints

- **Desktop (≥768px)** : Sidebar visible à gauche (222px), repliable via le bouton dédié ou raccourci.
- **Mobile (<768px)** :
  - Sidebar repliée hors écran (`-translate-x-full`).
  - Déclenchement via le bouton hamburger / déclencheur dans la Topbar.
  - Voile de superposition sombre `bg-black/70` fermant le tiroir au tap.
  - Aucune barre de défilement horizontale (`overflow-x: hidden`).
  - Saisie adaptée aux écrans tactiles avec safe-area padding.

---

## 6. Interdits stricts d'intégrité

1. **Aucune ombre portée ni glow** : Pas de `box-shadow` artificielle, pas de lueur néon, pas de filtre lumineux.
2. **Aucun dégradé visible** : Pas de gradients colorés d'arrière-plan.
3. **Aucun flou (blur)** : Pas de `backdrop-blur` sur les modales ou la navigation. Fond solide ou semi-opaque pur.
4. **Aucune couleur d'accent vive** : Palette strictement restreinte au monochrome et gris chauds (#151515, #181817, #20201f, #2d2d2b, #878684, #ededeb).
5. **Aucun système de monétisation** : Pas de notion de plan, d'abonnement, de forfait "Free" / "Pro", de mise à niveau ni de facturation.
6. **Aucun profil ni compte utilisateur** : Pas de système d'authentification utilisateur, pas d'avatar factice, pas de nom factice.
7. **Nom "Claude" invisible** : Aucune mention visible de "Claude" dans l'UI (uniquement le nom technique modèle dans le sélecteur d'API).
8. **Aucune donnée fictive** : Zéro discussion ou projet codé en dur ; état neuf parfaitement vide.
9. **Langue française obligatoire** : Tous les libellés de l'interface doivent être en français.

---

## 7. Écarts connus (à traiter lors des phases ultérieures)
- Les composants obsolètes `UniversalComposer.tsx`, `ChatWorkspace.tsx` et `CodeWorkspace.tsx` ont été définitivement supprimés dans le cadre de la Mission M1 (Tout se fait dans le Chat).

---

## 8. Composants et interactions spécifiques (Mission M8.3)

Toutes les interfaces ci-dessous ont été conçues dans le respect absolu de l'esthétique figée monochrome, sans ombre, sans dégradé, sans flou, avec les tokens existants :

### 8.1 Indicateur d'activité des conversations en arrière-plan
- **Emplacement** : Dans chaque item de conversation de la `ClaudeSidebar`.
- **Visuel** : Puce statique monochrome 8px (`w-2 h-2 rounded-full bg-[var(--text-secondary)]`), sans animation clignotante, sans halo, sans couleur d'accent.
- **Comportement** : Affichée uniquement lorsque la conversation possède une session d'agent en cours d'exécution ou un job de génération vidéo actif. Accessible avec `aria-label="Tâche en arrière-plan en cours"`.

### 8.2 Barre d'actions accessible des messages (WCAG 2.1.1, 1.4.13 — Lot 2)
- **Emplacement** : Sous chaque bulle de message dans `ClaudeChat`, identifiée par `data-message-actions="true"`.
- **Règles d'affichage** :
  - Survol à la souris (`group-hover:opacity-100`).
  - Navigation clavier (`focus-within:opacity-100`) : la barre d'action devient instantanément visible dès qu'un bouton d'action reçoit le focus.
  - Terminaux tactiles sans survol (`[@media(hover:none)]:opacity-100`) : affichage permanent afin d'éviter le blocage tactile.
  - Intitulés accessibles explicites (`aria-label`) sur chaque bouton (Copier, Modifier et renvoyer, Régénérer, Supprimer).
- **Messages utilisateur** :
  - *Copier* : Copie le texte brut dans le presse-papier avec confirmation visuelle discrète.
  - *Modifier et renvoyer* : Ouvre une modale sobre (`--bg-modal`) permettant de modifier le message initial. Avertissement sobre indiquant le nombre de messages qui seront tronqués, avec alerte spécifique si des fichiers ont été modifiés en mode Code (`write_file`, `edit_file`).
  - *Supprimer* : Modale sobre de confirmation avec suppression en cascade des messages suivants, des pièces jointes physiques et des artéfacts associés sur disque.
- **Messages assistant** :
  - *Copier* : Copie du texte Markdown ou brut.
  - *Régénérer* : Tronque à partir de cette réponse et relance la génération à partir du prompt utilisateur précédent.
  - *Supprimer* : Suppression en cascade de la réponse et des tours dépendants.

### 8.3 Jauge de contexte et séparateur sobre de résumé
- **Jauge du Composer** :
  - Emplacement : Sous le champ de saisie du `ClaudeComposer`.
  - Condition : Affichée uniquement dès que l'utilisation de la fenêtre de contexte dépasse **60 %**.
  - Rendu : Ligne textuelle sobre 12px en `var(--text-secondary)` : `≈ X k / Y k tokens (Z %)`. Aucun donut, aucun widget multicolore.
- **Séparateur sobre de résumé** :
  - Emplacement : Dans le fil de conversation `ClaudeChat` (`div[data-context-summarized="true"]`).
  - Condition : Inséré lorsque la fenêtre de contexte atteint **80 %** et qu'un résumé de contexte a été opéré par l'agent.
  - Rendu : Ligne fine séparatrice `border-t border-[var(--border-subtle)]` avec texte centré `12px` sobre : "Contexte résumé".

### 8.4 Gestion de l'espace disque (Paramètres › Confidentialité)
- **Emplacement** : `ClaudeSettingsModal` › Onglet Confidentialité › Sous-section "Espace disque".
- **Composants** :
  - Tableau sobre présentant les volumes réels de 5 catégories : Pièces jointes, Artéfacts, Médias, Base de données SQLite, Espaces temporaires.
  - Bouton "Compacter la base" : Exécute un `VACUUM` défragmenté sans perte de données sur SQLite.
  - Bouton "Nettoyer" par catégorie : Modale sobre de confirmation précisant le volume récupérable avant purge physique sécurisée.

---

## 9. Primitive universelle de calques & Confinement de focus (Lot 2)

Conformément à WCAG 2.1.1, 2.1.2, 2.4.2, 2.4.3 et aux règles d'intégrité UX, la gestion des calques (modales, tiroirs, panneaux flottants) repose sur le hook universel [`useOverlayFocus`](file:///c:/Users/DELL/Documents/Iroko-Agent/src/hooks/useOverlayFocus.ts) sans aucune dépendance tierce (100% web natif) :

### 9.1 Mécanismes de la primitive `useOverlayFocus`
1. **Pile hiérarchique (`overlayStack`)** :
   - Chaque calque ouvert s'enregistre au sommet d'une pile globale.
   - L'appui sur la touche `Échap` (`Escape`) intercepte l'événement en phase de capture et ne ferme **que** le calque situé au sommet de la pile, évitant la fermeture intempestive en cascade.
2. **Inertie du reste de l'application (`inert`)** :
   - À l'ouverture, tous les frères de chaque élément ancêtre jusqu'au conteneur racine reçoivent l'attribut natif HTML `inert`.
   - Les éléments marqués `data-overlay-backdrop="true"` sont exemptés pour permettre le clic de fermeture sur le voile.
   - À la fermeture ou au démontage, tous les attributs `inert` sont nettoyés sans résidu.
3. **Piégeage et bouclage clavier (`Tab` et `Shift+Tab`)** :
   - Les tabulations sont confinées dans le conteneur du calque : `Tab` depuis le dernier élément actif renvoie le focus sur le premier élément ; `Shift+Tab` depuis le premier renvoie sur le dernier.
   - Zéro fuite vers la barre d'adresse du navigateur ou les éléments en arrière-plan (validé par `focusTrapped: true` sur 20 Tabulations consécutives).
4. **Mémorisation et restitution du focus** :
   - L'élément ayant déclenché l'ouverture (`document.activeElement` ou référence explicite `restoreFocusRef`) est mémorisé.
   - À la fermeture du calque, le focus lui est automatiquement et immédiatement restitué (avec repli sur le composer si le déclencheur a disparu).

### 9.2 Intégrations applicatives
- **`ClaudeSettingsModal`** :
  - Identifié par `role="dialog"`, `aria-modal="true"`, `aria-label="Paramètres"`, `data-modal="true"`.
  - Focus initial orienté vers le champ de recherche de navigation (`searchInputRef`).
  - Voile d'arrière-plan `data-overlay-backdrop="true"` avec fermeture au clic.
- **Tiroir mobile (`ZyriconAppShell`)** :
  - Sur écrans ≤ 768px (`isMobileSidebarOpen`), le tiroir devient une boîte de dialogue modale accessible (`role="dialog"`, `aria-modal="true"`, `aria-label="Menu de navigation"`).
  - L'arrière-plan de l'application est rendu inerte pendant toute la durée d'ouverture du tiroir.
- **Sidebar Desktop repliée (`ClaudeSidebar`)** :
  - Lorsque la barre latérale est repliée (`isSidebarCollapsed`), l'élément `<aside>` reçoit nativement `inert={isSidebarCollapsed ? true : undefined}`.
  - Aucun lien, bouton ou champ de recherche masqué n'est accessible au Tab lorsque la sidebar est fermée.
  - Si le focus se trouvait à l'intérieur de la sidebar au moment de la réduction, il est immédiatement transféré sur le bouton d'ouverture dans la Topbar.
- **Titre de document dynamique (`AppContext`)** :
  - Synchronisation réactive : `document.title = activeTopic ? `${activeTopic} — Iroko` : 'Iroko'`.
  - Permet aux lecteurs d'écran et aux onglets de navigateur d'identifier immédiatement le fil de discussion actif.


