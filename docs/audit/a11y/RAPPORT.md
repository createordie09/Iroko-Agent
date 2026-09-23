# Rapport d'Audit d'Accessibilité Numérique — Mission U1 (`docs/audit/a11y/RAPPORT.md`)

**Date d'évaluation** : 21 septembre 2026  
**Référentiel appliqué** : WCAG 2.2 Niveau AA + Pratiques Spécifiques des Interfaces Conversationnelles & Agents Autonomes  
**Méthodologie & Niveaux de Preuve** :
- `[MESURÉ]` : Donnée quantifiée par outillage automatisé (`@axe-core/playwright`, calculs mathématiques de contrastes, coordonnées/pixels de boîtes englobantes, chronométrage).
- `[OBSERVÉ]` : Constat factuel issu de l'inspection de l'arbre d'accessibilité DOM, de scripts de navigation clavier ou de traces réseau/DOM.
- `[SUPPOSÉ]` : Comportement ou impact présumé à qualifier formellement par le banc d'essai humain au lecteur d'écran (voir [`docs/audit/a11y/PROTOCOLE_MANUEL.md`](./PROTOCOLE_MANUEL.md)).

---

## 1. Synthèse Exécutive & Métriques Globales

L'audit d'accessibilité approfondi de l'application Iroko révèle une structure générale sobre, solide et épurée (0 défilement horizontal de 320px à 2560px, respect strict du mode Contraste Élevé `forced-colors: active` avec 100% d'icônes en `currentColor`, absence de rafale vocale par token en streaming). Cependant, plusieurs écarts majeurs aux critères WCAG 2.2 AA ont été mesurés et observés, principalement concentrés sur :
1. Les contrastes de texte tertiaire et de bordures actives en thème sombre (`contrast ratio < 3.0:1` / `< 4.5:1`).
2. L'absence de repères sémantiques HTML5 fondamentaux (`<main>` et `<nav>` absents).
3. L'absence de confinement (*focus trap*) et de restitution de focus sur la modale des Paramètres.
4. L'absence de région en direct `aria-live` pour annoncer le statut global de réponse ("Génération en cours", "Réponse terminée").
5. Des commandes contextuelles (actions sur les messages et menu de discussion) dépendantes du survol souris (*hover-only*).

### Tableau Récapitulatif des Métriques de l'Audit

| Domaine évalué | Échantillon testé | Conformes | Avec constats | Taux de conformité brut |
| :--- | :--- | :--- | :--- | :--- |
| **axe-core multi-états & thèmes** | 30 combinaisons (15 états × 2 thèmes) | 13 | 17 | 43.3 % |
| **Couples de contrastes tokens** | 22 couples (11 sombre + 11 clair) | 12 | 10 | 54.5 % |
| **Cibles interactives (WCAG 2.5.8 ≥24px)** | 28 contrôles inspectés à 375 & 1440px | 26 | 2 | 92.8 % |
| **Cibles tactiles recommandées (≥44px)** | 18 contrôles sur mobile ≤768px | 8 | 10 | 44.4 % |
| **Repères sémantiques (Landmarks)** | 4 repères attendus (header, nav, main, aside) | 2 | 2 | 50.0 % |
| **Navigation clavier sans souris** | 6 parcours complets | 3 | 3 | 50.0 % |
| **Résilience au Zoom (200% et 400%)** | 2 paliers de grossissement | 2 | 0 | 100.0 % |

---

## 2. Analyse Automatisée

### 2.1 Matrice des Contrastes des Tokens de Design (`src/index.css`)

Les ratios de contraste ont été calculés selon la formule normalisée WCAG 2.2 relative à la luminance perçue :

#### A. Thème Sombre (:root)
- `[MESURÉ]` **Texte principal sur Fond App** (`#ededeb` sur `#151515`) : **15.58:1** (Seuil ≥ 4.5:1) — **CONFORME**.
- `[MESURÉ]` **Texte secondaire sur Fond App** (`#878684` sur `#151515`) : **5.02:1** (Seuil ≥ 4.5:1) — **CONFORME**.
- `[MESURÉ]` **Texte tertiaire / aide 12px sur Fond App** (`#585755` sur `#151515`) : **2.53:1** (Seuil ≥ 4.5:1) — **ÉCHEC CRITIQUE** (Écart de 1.97 point).
- `[MESURÉ]` **Placeholder composer sur Fond Surface** (`#585755` sur `#20201f`) : **2.26:1** (Seuil ≥ 4.5:1) — **ÉCHEC CRITIQUE** (Écart de 2.24 points).
- `[MESURÉ]` **Texte secondaire sur Fond Sidebar** (`#878684` sur `#181817`) : **4.89:1** (Seuil ≥ 4.5:1) — **CONFORME**.
- `[MESURÉ]` **Texte tertiaire sur Fond Sidebar** (`#585755` sur `#181817`) : **2.46:1** (Seuil ≥ 4.5:1) — **ÉCHEC CRITIQUE** (Écart de 2.04 points).
- `[MESURÉ]` **Bordure active de focus sur Fond App** (`#4a4947` sur `#151515`) : **2.03:1** (Seuil ≥ 3.0:1) — **ÉCHEC CRITIQUE** (Indicateur de focus non conforme WCAG 1.4.11).
- `[MESURÉ]` **Bordure active de focus sur Fond Surface** (`#4a4947` sur `#20201f`) : **1.81:1** (Seuil ≥ 3.0:1) — **ÉCHEC CRITIQUE** (Indicateur de focus non conforme WCAG 1.4.11).
- `[MESURÉ]` **Bordure subtile séparateur sur Fond App** (`#252524` sur `#151515`) : **1.21:1** (Seuil ≥ 3.0:1 si signifiant) — **NON CONFORME SI SIGNIFIANT**.

#### B. Thème Clair (html.light)
- `[MESURÉ]` **Texte principal sur Fond App** (`#1a1a19` sur `#ffffff`) : **17.42:1** (Seuil ≥ 4.5:1) — **CONFORME**.
- `[MESURÉ]` **Texte secondaire sur Fond App** (`#585755` sur `#ffffff`) : **7.22:1** (Seuil ≥ 4.5:1) — **CONFORME**.
- `[MESURÉ]` **Texte tertiaire sur Fond App** (`#878684` sur `#ffffff`) : **3.64:1** (Seuil ≥ 4.5:1 pour texte normal, ≥ 3.0:1 pour grand texte) — **ÉCHEC SUR TEXTE NORMAL 12-13PX**.
- `[MESURÉ]` **Placeholder composer sur Fond Surface** (`#878684` sur `#f4f4f2`) : **3.30:1** (Seuil ≥ 4.5:1) — **ÉCHEC**.
- `[MESURÉ]` **Bordure active de focus sur Fond App** (`#1a1a19` sur `#ffffff`) : **17.42:1** (Seuil ≥ 3.0:1) — **CONFORME**.
- `[MESURÉ]` **Bordure active de focus sur Fond Surface** (`#1a1a19` sur `#f4f4f2`) : **15.82:1** (Seuil ≥ 3.0:1) — **CONFORME**.

### 2.2 Tailles des Cibles Interactives (WCAG 2.5.8 & Tactile)

- `[MESURÉ]` **Bouton de suppression de puce (Croix ×)** : **16×16 px** — **ÉCHEC CRITIQUE WCAG 2.5.8** (Seuil absolu requis : ≥ 24×24 px).
- `[MESURÉ]` **Point indicateur de tâche d'arrière-plan** : **8×8 px** — Exempté si purement visuel, mais cliquable dans certains contextes.
- `[MESURÉ]` **Boutons d'action Topbar (Sidebar toggle, Paramètres)** : **32×32 px** — Conformes au seuil minimum WCAG 2.2 AA (≥ 24px), mais en deçà de la recommandation tactile 44×44 px sur smartphone.
- `[MESURÉ]` **Bouton "+" d'ajout et sélecteur Chat|Code** : **32×32 px / 34px de hauteur** — Conformes ≥ 24px, avertissement tactile < 44px.
- `[MESURÉ]` **Bouton d'envoi / arrêt** : **32×32 px** — Conforme ≥ 24px, avertissement tactile < 44px.
- `[MESURÉ]` **Boutons d'onglets de la modale Paramètres** : **hauteur 32px** — Conformes ≥ 24px, avertissement tactile < 44px.

---

## 3. Navigation au Clavier Seul & Gestion du Focus

### 3.1 Ordre de Tabulation et Focus Visible
- `[MESURÉ]` **Accès au Composer depuis l'accueil** : 8 tabulations sont nécessaires pour atteindre le champ `textarea` en l'absence de lien d'évitement (*skip link*).
- `[OBSERVÉ]` **Indicateur de focus sur le champ de saisie** : `document.activeElement.style.outlineStyle === 'none'`. Le contour direct est neutralisé, le focus s'appuyant uniquement sur une variation de couleur de bordure du conteneur parent qui n'atteint pas 3.0:1 de contraste en thème sombre.
- `[OBSERVÉ]` **Ordre de tabulation dans la barre latérale** : Le parcours suit fidèlement le flux logique descendant (Bouton Nouveau → Filtres → Discussions → Paramètres).

### 3.2 Pièges à Focus & Restitution du Focus (Critères 2.1.2 & 2.4.3)
- `[MESURÉ]` **Modale des Paramètres (`ClaudeSettingsModal.tsx`)** :
  - **Absence de confinement de focus (*focus trap*)** : La tabulation depuis le dernier élément interactif de la modale sort de la fenêtre et atteint les éléments d'arrière-plan masqués par le voile semi-opaque.
  - **Perte de focus à la fermeture** : Lors de la fermeture par la touche `Échap`, le focus n'est pas retourné sur le bouton "Paramètres" déclencheur ; le focus actif revient sur l'élément `<body>` racine (`focusRestoredAfterModal: false`).
- `[OBSERVÉ]` **Sélecteur de modèle (`ModelSelectorMenu.tsx`)** :
  - Lors de l'ouverture, les flèches directionnelles permettent la navigation.
  - À la fermeture par `Échap`, le focus n'est pas systématiquement repositionné sur le bouton du sélecteur.

### 3.3 Fonctionnalités Accessibles Exclusivement au Survol Souris (Hover-Only)
- `[OBSERVÉ]` **Actions de messages dans la discussion (`ClaudeChat.tsx`)** :
  - Les boutons Copier, Régénérer, Modifier et Supprimer sont masqués par défaut via les classes Tailwind `opacity-0 group-hover:opacity-100`.
  - **Conséquence** : Un utilisateur naviguant exclusivement au clavier ne voit pas les boutons apparaître lors de la prise de focus, sauf si `:focus-within` est expressément stylé avec opacité 100%. Sur écran tactile mobile, ces actions requièrent un appui fortuit pour simuler un survol.
- `[OBSERVÉ]` **Menu contextuel "…" des discussions dans la barre latérale** :
  - Le déclencheur du menu d'options de discussion est soumis à un comportement de survol similaire.

---

## 4. Sémantique HTML & Balisage ARIA

### 4.1 Attributs de Document & Titres (Critères 3.1.1 & 2.4.2)
- `[MESURÉ]` **Attribut de langue** : `<html lang="fr">` est présent et conforme.
- `[OBSERVÉ]` **Titre de la fenêtre (`document.title`)** : Reste figé sur `"Iroko"`. Il ne reflète pas le sujet de la discussion active (ex. *"Discussion : Recherche FTS5 — Iroko"*), privant l'utilisateur de lecteur d'écran du contexte de navigation lors du basculement d'onglet ou de fenêtre.

### 4.2 Repères Sémantiques HTML5 (Landmarks — Critère 1.3.1)
- `[OBSERVÉ]` **Absence de balise `<main>`** : La zone de travail principale (accueil ou chat) est contenue dans une simple balise générique `<div>`, empêchant les utilisateurs de lecteur d'écran de sauter directement au contenu principal via la touche `D` (NVDA) ou `M` (JAWS).
- `[OBSERVÉ]` **Absence de balise `<nav>`** : La barre latérale utilise `<aside>`, mais aucune balise `<nav>` n'est déclarée pour structurer la navigation de l'application.
- `[OBSERVÉ]` **Barre supérieure (`ClaudeTopbar.tsx`)** : Implémentée dans une balise `<div>` plutôt qu'un repère sémantique `<header>`.

### 4.3 Rôles et Noms Accessibles des Contrôles Composites
- `[OBSERVÉ]` **Contrôle segmenté [ Chat | Code ] (`ClaudeComposer.tsx`)** :
  - Composé de deux balises `<button>` indépendantes sans attribut `role="radio"`, `role="tab"` ni `aria-pressed="true|false"`.
  - **Conséquence** : Le lecteur d'écran vocalise *"Chat, bouton"* et *"Code, bouton"*, sans indiquer quel mode est actuellement activé.
- `[OBSERVÉ]` **Bouton d'arrêt pendant la génération** :
  - Le bouton d'envoi permute bien vers une icône carrée d'arrêt (`lucide-square`).
  - Il expose `title="Arrêter la réponse"`, mais son attribut `aria-label` est absent (`null`). Certains lecteurs d'écran en mode navigation virtuelle ignorent l'attribut `title` sur les boutons sans texte.
- `[OBSERVÉ]` **Boutons désactivés sans modèle configuré** :
  - Lorsque aucun modèle n'est disponible, le bouton d'envoi est `disabled`. L'explication textuelle est affichée sous le composer, mais sans lien explicite `aria-describedby` entre le bouton et le texte explicatif.

---

## 5. Streaming & Annonces en Direct (Live Regions)

### 5.1 Comportement des Régions `aria-live` pendant le Flux
- `[MESURÉ]` **Corps de réponse assistant** : `responseBodyIsLiveRegion === false`. Le conteneur du message en cours de frappe n'est pas marqué comme une région live. Ceci est conforme à la règle U6 (prévention formelle de la saturation vocale par token).
- `[MESURÉ]` **Mutations live mesurées** : **0 mutation** sur région live pendant un flux de 5000 tokens.
- `[OBSERVÉ]` **Absence de région de statut dédiée** :
  - Aucune balise munie de `role="status"` ou `aria-live="polite"` n'annonce les événements clés du cycle de vie :
    1. Le démarrage de la génération (*"Génération en cours"*).
    2. L'achèvement complet de la génération (*"Réponse terminée"*).
    3. Les phases de réflexion interne de l'agent.
    4. Les étapes d'exécution d'outils locaux.
  - **Conséquence** : L'utilisateur aveugle appuyant sur Entrée ne reçoit aucun retour auditif confirmant que l'agent a commencé à travailler, ni lorsqu'il a fini d'écrire.
- `[MESURÉ]` **Conservation du focus après envoi** : Le focus est retiré du textarea pendant la phase de génération, puis n'est pas réassigné de façon garantie à la fin de la réponse.

---

## 6. Vision & Préférences Utilisateur

### 6.1 Zoom et Reflow (Critères WCAG 1.4.4 & 1.4.10)
- `[MESURÉ]` **Zoom 200%** : Défilement horizontal global = **NON (Conforme)**. La mise en page s'adapte sans rupture.
- `[MESURÉ]` **Zoom 400% (Reflow 320px équivalent)** : Défilement horizontal global = **NON (Conforme)**. Le tiroir mobile et la disposition colonnaire absorbent le grossissement sans perte de contenu.

### 6.2 Espacement du Texte (Critère WCAG 1.4.12 Text Spacing)
- `[MESURÉ]` **Injection des styles stricts 1.4.12** (`line-height: 1.5`, `letter-spacing: 0.12em`, `word-spacing: 0.16em`, marges de paragraphes 2em) :
  - 17 composants textuels inspectés.
  - **0 troncature critique** observée sur les messages et formulaires principaux.

### 6.3 Émulation Contraste Élevé & Mouvement Réduit
- `[MESURÉ]` **`forced-colors: active` (Mode Contraste Élevé Windows)** :
  - 12 icônes SVG inspectées : 100% utilisent `currentColor` ou `stroke="currentColor"`.
  - **0 icône invisible** : toutes s'adaptent automatiquement à la couleur système `HighlightText` ou `ButtonText`.
  - axe-core relève **0 violation** en mode `forced-colors: active`.
- `[MESURÉ]` **`prefers-reduced-motion: reduce`** :
  - La classe `.reduce-motion` neutralise les durées de transition à 0s ou ≤ 50ms sur les conteneurs animés, conformément aux spécifications de `docs/UX_STANDARDS.md`.

---

## 7. Inventaire Structuré des Constats d'Anomalies (Pour Remédiation U2+)

Chaque constat est classifié selon son impact ergonomique et son critère WCAG de référence :

### Bloquants / Sévérité Haute
1. `[MESURÉ]` **[A11Y-01] Contrastes insuffisants des textes tertiaires et placeholders en thème sombre**
   - *Réf. WCAG* : 1.4.3 Contraste (minimum).
   - *Preuve* : Ratios mesurés de 2.26:1 à 2.53:1 (seuil requis ≥ 4.5:1).
   - *Impact* : Illisibilité pour les utilisateurs malvoyants en environnement sombre.
2. `[MESURÉ]` **[A11Y-02] Indicateur de focus clavier non contrasté en thème sombre**
   - *Réf. WCAG* : 1.4.11 Contraste du contenu non textuel.
   - *Preuve* : Ratios mesurés de 1.81:1 et 2.03:1 (seuil requis ≥ 3.0:1) sur `--border-active`.
   - *Impact* : Perte visuelle du point d'insertion au clavier.
3. `[MESURÉ]` **[A11Y-03] Absence de confinement (*focus trap*) dans la modale Paramètres**
   - *Réf. WCAG* : 2.1.2 Pas de piège au clavier & 2.4.3 Parcours du focus.
   - *Preuve* : La tabulation traverse la modale et active les boutons d'arrière-plan.
   - *Impact* : Désorientation majeure et actions accidentelles hors modale.
4. `[MESURÉ]` **[A11Y-04] Absence de restitution du focus à la fermeture de la modale**
   - *Réf. WCAG* : 2.4.3 Ordre du focus.
   - *Preuve* : Après appui sur Échap, le focus revient sur `<body>` au lieu du bouton déclencheur.
   - *Impact* : Rupture de flux forçant l'utilisateur à re-parcourir toute la page.
5. `[OBSERVÉ]` **[A11Y-05] Absence de région `aria-live` de statut de streaming**
   - *Réf. WCAG* : 4.1.3 Messages d'état.
   - *Preuve* : `liveRegionsFound.length === 0`.
   - *Impact* : Aucun retour audio sur le début ou la fin de génération d'une réponse.

### Sévérité Moyenne
6. `[OBSERVÉ]` **[A11Y-06] Absence de repères sémantiques `<main>`, `<nav>` et `<header>`**
   - *Réf. WCAG* : 1.3.1 Information et relations.
   - *Preuve* : `landmarks: { nav: 0, main: 0, header: 0, aside: 1 }`.
   - *Impact* : Impossibilité de sauter directement aux zones fonctionnelles au lecteur d'écran.
7. `[OBSERVÉ]` **[A11Y-07] Actions sur les messages et menu de discussion masqués au clavier (Hover-only)**
   - *Réf. WCAG* : 2.1.1 Clavier.
   - *Preuve* : Stylage `opacity-0 group-hover:opacity-100` sans `:focus-within`.
   - *Impact* : Boutons invisibles lors de la navigation au clavier seul.
8. `[OBSERVÉ]` **[A11Y-08] Absence d'état ARIA sur le contrôle [ Chat | Code ]**
   - *Réf. WCAG* : 4.1.2 Nom, rôle et valeur.
   - *Preuve* : Boutons sans `role="tab"` ni `aria-pressed="true|false"`.
   - *Impact* : Le lecteur d'écran n'indique pas quel mode est actif.
9. `[MESURÉ]` **[A11Y-09] Cibles interactives < 24px (Croix de fermeture des puces)**
   - *Réf. WCAG* : 2.5.8 Taille de la cible (minimum).
   - *Preuve* : Dimensions mesurées à 16×16 px.
   - *Impact* : Difficulté motrice pour fermer les puces de projet ou de pièce jointe.

### Sévérité Basse / Recommandations Ergonomiques
10. `[OBSERVÉ]` **[A11Y-10] Titre de document non contextuel (`document.title`)**
    - *Réf. WCAG* : 2.4.2 Titre de page.
    - *Preuve* : Titre statique `"Iroko"` quelle que soit la discussion ouverte.
    - *Impact* : Identification lente dans les onglets du navigateur.
11. `[MESURÉ]` **[A11Y-11] Cibles tactiles < 44px sur mobile**
    - *Réf. WCAG* : 2.5.5 Taille de la cible (avancée).
    - *Preuve* : Boutons Topbar et Composer mesurés à 32×32 px sur écran ≤ 768px.
    - *Impact* : Moindre confort d'usage sur écran tactile smartphone.
12. `[OBSERVÉ]` **[A11Y-12] Bouton "Arrêter" s'appuyant uniquement sur l'attribut `title`**
    - *Réf. WCAG* : 1.1.1 Contenu non textuel & 4.1.2 Nom accessible.
    - *Preuve* : `ariaLabel: null`, `title: "Arrêter la réponse"`.
    - *Impact* : Risque de non-vocalisation sur certains synthétiseurs vocaux anciens.

---

## 8. Résultats Bruts & Fichiers Associés

Les données brutes d'investigation sont consultables dans les fichiers suivants :
- [`docs/audit/a11y/auto_results.json`](file:///c:/Users/DELL/Documents/Iroko-Agent/docs/audit/a11y/auto_results.json) : Matrice de contrastes complète et synthèse axe-core multi-viewports.
- [`docs/audit/a11y/keyboard_results.json`](file:///c:/Users/DELL/Documents/Iroko-Agent/docs/audit/a11y/keyboard_results.json) : Mesures de tabulation, pièges et restitution de focus.
- [`docs/audit/a11y/semantic_results.json`](file:///c:/Users/DELL/Documents/Iroko-Agent/docs/audit/a11y/semantic_results.json) : Inventaire des repères, titres et noms accessibles.
- [`docs/audit/a11y/streaming_results.json`](file:///c:/Users/DELL/Documents/Iroko-Agent/docs/audit/a11y/streaming_results.json) : Mesures des mutations aria-live et statut du bouton d'arrêt.
- [`docs/audit/a11y/vision_results.json`](file:///c:/Users/DELL/Documents/Iroko-Agent/docs/audit/a11y/vision_results.json) : Mesures zoom 200%/400%, espacement 1.4.12 et forced-colors.
- [`docs/audit/a11y/accessibility_tree_snapshot.json`](file:///c:/Users/DELL/Documents/Iroko-Agent/docs/audit/a11y/accessibility_tree_snapshot.json) : Arbre d'accessibilité CDP extrait en direct.
- [`docs/audit/a11y/PROTOCOLE_MANUEL.md`](file:///c:/Users/DELL/Documents/Iroko-Agent/docs/audit/a11y/PROTOCOLE_MANUEL.md) : Protocole de test manuel 12 tâches pour NVDA et le Narrateur Windows.
