# Rapport d'Audit U2 — Performance Ressentie, Fluidité et Animations

**Environnement de mesure**
Serveur de production unifié sur `http://127.0.0.1:3001` (build `dist/` servi par `server/index.ts`).
Navigateur : Microsoft Edge v153.0.4234.48 — CPU : Intel Core i7-7600U @ 2,80 GHz (4 cœurs) — RAM : 15,86 Go — OS : Windows 10 x64.
Outillage : Playwright (headless Edge) + CDP Performance — 5 à 10 runs par mesure.

---

## 1. INP — Interactions (Section 1)

Mesures réalisées sur 10 runs par interaction, CPU 1x puis 4x (Playwright + CDP).
Seuil visé : ≤ 100 ms (menus/bascules), ≤ 200 ms (INP global).

### Tableau récapitulatif CPU 1x

| # | Interaction | p50 | p75 | Max | Statut |
|:--|:------------|----:|----:|----:|:-------|
| 1 | Menu « + » | 22 ms | 27 ms | 32 ms | ✅ OK |
| 2 | Sélecteur de modèle | 19 ms | 22 ms | 49 ms | ✅ OK |
| 3 | Bascule Chat / Code | 29 ms | 29 ms | 30 ms | ✅ OK |
| 4 | Sidebar toggle | 22 ms | 23 ms | 31 ms | ✅ OK |
| 5 | Navigation paramètres | 0 ms | 0 ms | 0 ms | ⚠️ NON MESURABLE |
| 6 | Changer de conversation | 8 ms | 13 ms | 19 ms | ✅ OK |
| 7 | Envoyer message | 26 ms | 31 ms | 33 ms | ✅ OK |
| 8 | Premier token reçu | 40 ms | 42 ms | 45 ms | ✅ OK |
| 9 | Arrêter la génération | 24 ms | 26 ms | 28 ms | ✅ OK |
| 10 | Déplier bloc Réflexion | 18 ms | 20 ms | 22 ms | ✅ OK |
| 11 | Aperçu artéfact | 48 ms | 52 ms | 55 ms | ✅ OK |
| 12 | Copier bloc de code | 14 ms | 15 ms | 18 ms | ✅ OK |

### Tableau récapitulatif CPU 4x (ralentissement simulé)

| Interaction | p50 | p75 | Statut |
|:------------|----:|----:|:-------|
| Premier token reçu | 112 ms | 117 ms | ⚠️ DÉPASSE seuil 100 ms |
| Aperçu artéfact | 154 ms | 166 ms | ⚠️ PROCHE seuil 200 ms |
| Arrêter la génération | 60 ms | 65 ms | ✅ OK |
| Bloc Réflexion | 54 ms | 60 ms | ✅ OK |

### Constats INP

**PERF-01 — OBSERVÉ — Navigation Paramètres non mesurable automatiquement**
Le sélecteur `[data-modal="true"] nav button` n'est pas présent dans le DOM en production (la modale n'est pas ouverte à la mesure). INP = 0 ms est un artefact de l'outillage. À mesurer manuellement avec Chrome DevTools > Performances > INP badge.
Sévérité : Faible (outillage).

**PERF-02 — MESURÉ — INP premier token dépasse 100 ms sous CPU 4x**
p50 = 112 ms / p75 = 117 ms avec CPU throttling 4x. Probablement lié au parsing Markdown synchrone à chaque token (voir PERF-07).
Sévérité : Modérée.

**PERF-03 — MESURÉ — Aperçu artéfact lent sous CPU 4x (p50 = 154 ms)**
Approche du seuil 200 ms. Lié à l'initialisation du sandbox iframe ou de la coloration syntaxique.
Sévérité : Modérée.

---

## 2. Streaming — Markdown et Scroll (Section 2)

Mesures réalisées avec un fournisseur SSE local simulé (20, 60, 120 tokens/s).
Constat architectural issu de la lecture du code source.

### Mesures headless

| Scénario | Durée obs. | Nœuds DOM init. | Tâches longues | Mutations aria-live | Heap |
|:---------|----------:|----------------:|---------------:|--------------------:|-----:|
| Lent (20 t/s) | 4 204 ms | 154 | 1 (92 ms) | 0 | 5,42 Mo |
| Moyen (60 t/s) | 4 178 ms | 123 | 0 | 0 | 5,13 Mo |
| Rapide (120 t/s) | 4 177 ms | 154 | 0 | 0 | 5,35 Mo |

Note : les mutations aria-live = 0 en headless sans flux SSE réel branché sont un artefact du fournisseur simulé local (DOM réel non modifié).

### Constats Streaming

**PERF-04 — OBSERVÉ — Reparse Markdown complet à chaque token**
Source : [`ClaudeChat.tsx:25`](../../src/features/chat/ClaudeChat.tsx#L25) — `FormattedMessage({ content })` appelle `parseMarkdownBlocks(content)` à chaque rendu, sans `useMemo`. [`markdownParser.ts:59`](../../src/features/chat/markdownParser.ts#L59) effectue un split par lignes et une détection de fences sur tout le contenu à chaque token.
Impact : recalcul O(n) croissant avec la longueur du message. Coût CPU estimé 1,09 ms/token à 20 t/s.
Sévérité : **Élevée** (régression progressive).

**PERF-05 — OBSERVÉ — Retokenisation de code à chaque rendu du CodeBlock**
Source : [`CodeBlock.tsx:54`](../../src/features/chat/CodeBlock.tsx#L54) — `renderMonochromeCode(code, language)` exécute des expressions régulières sur toutes les lignes du bloc sans `useMemo`. Le `useMemo` présent dans `CodeBlock` (L137) ne couvre que `displayLang`, pas le rendu tokenisé.
Impact : refactorisation regex O(n lignes) à chaque token reçu pendant le streaming.
Sévérité : **Élevée**.

**PERF-06 — OBSERVÉ — Scroll smooth en boucle pendant le streaming**
Source : [`ClaudeChat.tsx:340-347`](../../src/features/chat/ClaudeChat.tsx#L340) — un `useEffect([messages, currentAssistantStream, isAtBottom])` lit `.scrollHeight` et appelle `.scrollTo({ behavior: 'smooth' })` à chaque token. Cela déclenche un recalcul de layout (`scrollHeight`) et une animation de scroll simultanément à chaque mise à jour du flux.
Impact : reflow layout continu + animation competing → janks potentiels sur CPU lent.
Sévérité : **Élevée**.

---

## 3. Longues conversations (Section 3)

Conversations créées via API `/api/conversations` + injection de messages (token bootstrap). Mesures réalisées en headless Edge.

Note : en headless non authentifié (session navigateur vide), les messages ne sont pas rendus par la SPA (la route `/conversations/:id` requiert une session active). Les nœuds DOM mesurés (171) correspondent à la coquille de l'app sans messages. Les mesures de temps d'ouverture reflètent la navigation SPA, pas le rendu des messages. La virtualisation a été vérifiée par analyse du code source (`src/`).

### Mesures de temps d'ouverture (navigation SPA)

| Taille | Temps ouverture | Nœuds DOM | Heap JS |
|:-------|---------------:|----------:|--------:|
| 50 messages | 2 062 ms | 171 | 3,61 Mo |
| 200 messages | 2 081 ms | 171 | 3,72 Mo |
| 500 messages | 2 074 ms | 171 | 4,01 Mo |

### Constats Longues conversations

**PERF-07 — OBSERVÉ — Absence totale de virtualisation**
Aucune librairie de virtualisation dans `src/` (`react-virtual`, `react-window`, `@tanstack/virtual`). Recherche `content-visibility` : 0 occurrence sur les éléments de message. Toute la liste des messages est rendue en DOM complet à chaque chargement.
Impact : dégradation linéaire des performances de rendu et du défilement avec le nombre de messages. Sur machine lente, une conversation de 500 messages peut bloquer le thread principal plusieurs secondes.
Sévérité : **Élevée** (scalabilité).

**PERF-08 — OBSERVÉ — Pas de restauration de position de défilement**
Aucun localStorage ni sessionStorage ne persiste `scrollTop` par conversation. Au retour dans une conversation, le scroll revient en bas (comportement par défaut). L'utilisateur perd sa position en quittant et revenant dans une conversation longue.
Sévérité : Modérée (UX).

---

## 4. Chargement à froid (Section 4)

Mesures sur 5 runs, CPU 1x et 4x. Serveur local (`127.0.0.1:3001`).

### Web Vitals

| Métrique | CPU 1x p50 | CPU 1x p75 | CPU 4x p50 | CPU 4x p75 | Seuil « bon » |
|:---------|----------:|-----------:|----------:|-----------:|:-------------|
| LCP | 204 ms | 236 ms | 612 ms | 616 ms | ≤ 2 500 ms ✅ |
| FCP | 204 ms | 236 ms | 612 ms | 616 ms | ≤ 1 800 ms ✅ |
| CLS | 0,0035 | 0,0035 | 0,0035 | 0,0035 | ≤ 0,1 ✅ |
| TBT | 0 ms | 20 ms | 149 ms | 170 ms | ≤ 200 ms ✅ |
| TTFB | 3 ms | 4 ms | 5 ms | 6 ms | ≤ 800 ms ✅ |
| Nœuds DOM init. | 173 | 173 | 173 | 173 | — |

Tous les Web Vitals sont dans les seuils « bon » de Google CrUX, même sous CPU 4x.

### Analyse du bundle

| Asset | Taille brute | Type |
|:------|------------:|:-----|
| `index-BOiEiOug.js` | **474,6 Ko** | JS |
| `index-C6md8RAl.css` | 63,5 Ko | CSS |
| **Total** | **538,1 Ko** | — |

Aucune police woff/woff2 dans `dist/assets/` : les polices `Inter` et `Newsreader` sont chargées depuis le CDN système ou le cache navigateur (déclarations `@font-face` absentes du CSS compilé → polices de substitution système utilisées).

### Constats Chargement

**PERF-09 — MESURÉ — Bundle JS dépasse le budget de 250 Ko (×1,9)**
Le fichier `index-BOiEiOug.js` pèse **474,6 Ko** brut (≈ 123 Ko gzip estimé). Le budget fixé dans le référentiel U0 est de 250 Ko brut. Dépassement : +224,6 Ko (+90 %).
Causes probables : pas de code-splitting dynamique sur les fonctionnalités secondaires, inclusion de toutes les routes dans le bundle initial.
Sévérité : **Modérée** (TBT reste dans les seuils, mais ralentit les appareils mobiles bas de gamme).

**PERF-10 — OBSERVÉ — La modale Paramètres est chargée séparément (point positif)**
Le code de `ClaudeSettingsModal` n'est pas dans le bundle initial (`index-BOiEiOug.js`). Le lazy loading est en place pour cette modale.
Statut : ✅ Bonne pratique.

**PERF-11 — OBSERVÉ — Aucune police locale déclarée**
Zéro `@font-face` dans le CSS compilé. Les polices `Inter` et `Newsreader` définies dans `@theme { --font-sans, --font-serif }` de `src/index.css` ne sont jamais téléchargées (elles tombent sur les polices de substitution système). Pas de risque de FOIT/FOUT.
Statut : Neutre (pas de problème actif, mais les polices définies dans le design system ne sont pas réellement chargées).

**PERF-12 — MESURÉ — CLS stable à 0,0035 (excellent)**
Le léger décalage (0,0035) est dans les limites (seuil ≤ 0,1). Il correspond probablement à l'injection du thème CSS (classe `dark`/`light` sur `<html>`).
Statut : ✅ OK.

---

## 5. Animations — Inventaire complet (Section 5)

### Animations CSS dans `src/index.css`

| Élément | Propriété | Durée | Courbe | Déclencheur |
|:--------|:----------|------:|:-------|:------------|
| `*` (globale) | `transition-duration: 0.01ms !important` | 0,01 ms | — | `@media (prefers-reduced-motion: reduce)` |
| `html.reduce-motion *` | Toutes animations/transitions désactivées | 0,01 ms | — | Paramètre utilisateur |
| `.btn-ghost` | `background-color`, `color` | `150ms cubic-bezier(0.16, 1, 0.3, 1)` | Spring | Hover / focus |
| Scrollbar thumb | `background` | 150 ms `ease-out` | Ease-out | Hover container |

Tokens globaux : `--transition-fast: 150ms cubic-bezier(0.16, 1, 0.3, 1)` ; `--transition-sidebar: 200ms cubic-bezier(0.16, 1, 0.3, 1)`.

### Animations CSS (classes Tailwind `animate-in`) dans les composants

| Composant | Élément | Classes | Durée | Déclencheur | Propriété CSS |
|:----------|:--------|:--------|------:|:------------|:--------------|
| `ClaudeSettingsModal.tsx:75` | Overlay fond | `animate-in fade-in` | 150 ms | Ouverture modale | `opacity` |
| `ClaudeSettingsModal.tsx:83` | Conteneur modale | `animate-in zoom-in-95` | 150 ms | Ouverture modale | `transform scale` + `opacity` |
| `ClaudeChat.tsx:971` | Contenu bloc Réflexion | `animate-in fade-in` | 150 ms | Clic déplier | `opacity` |
| `ClaudeChat.tsx:1201` | Panneau artéfact latéral | `animate-in slide-in-from-right-10` | 200 ms | Ouverture artéfact | `transform translateX` |
| `ClaudeChat.tsx:1384` | Dialog confirmation | `animate-in fade-in zoom-in-95` | 150 ms | Affichage dialog | `opacity` + `scale` |
| `ClaudeChat.tsx:1416` | Dialog partage | `animate-in fade-in zoom-in-95` | 150 ms | Clic partage | `opacity` + `scale` |
| `ZyriconAppShell.tsx:49` | Overlay mobile (sidebar) | `animate-in fade-in` | 150 ms | Tap menu mobile | `opacity` |
| `ZyriconAppShell.tsx:56` | Sidebar mobile | `transition-all duration-200` | 200 ms | Toggle sidebar | `transform` / `width` |
| `ClaudeSidebar.tsx:105` | Sidebar desktop | `transition-all duration-200` | 200 ms | Collapse sidebar | `width` |
| `ClaudeComposer.tsx:558` | Composer container | `transition-all duration-150` | 150 ms | Focus / redimensionnement | toutes propriétés |

### Transitions `transition-colors` (hover état)

Présentes sur tous les boutons, liens de navigation, éléments de liste. Durée implicite : héritée de `--transition-fast` (150 ms). Propriété : `background-color`, `color`.

### Constats Animations

**PERF-13 — OBSERVÉ — Alternative `prefers-reduced-motion` correctement implémentée**
`src/index.css` L98-116 : `@media (prefers-reduced-motion: reduce)` + classe `html.reduce-motion` gérée par `useSettings.ts:141-162` (écoute MediaQuery + option utilisateur). Toutes les animations/transitions sont réduites à 0,01 ms.
Statut : ✅ Conforme.

**PERF-14 — OBSERVÉ — Aucune animation sur `height` ni `width` en valeur auto**
Les transitions sidebar utilisent `transition-all duration-200` sur `width`. En Tailwind, si la largeur passe de `w-0` à `w-64`, la transition est calculable sans reflow majeur. À vérifier manuellement : si `transition-all` inclut des propriétés qui déclenchent le layout (ex. `height: auto`), des reflows répétés pourraient survenir.
Sévérité : Faible (à surveiller).

**PERF-15 — OBSERVÉ — Scroll smooth généré par JavaScript (`behavior: 'smooth'`) pendant le streaming**
Voir PERF-06. Le scroll animé par JavaScript conflue avec le scroll smooth CSS (`scroll-behavior: auto !important` en mode reduced-motion, mais actif en mode normal). L'alternative `prefers-reduced-motion` désactive correctement le scroll-behavior CSS via `scroll-behavior: auto !important`, mais le scroll JS (`scrollTo({ behavior: 'smooth' })`) n'est pas conditionné à `prefers-reduced-motion`.
Sévérité : Modérée (accessibilité + performance).

---

## 6. Repos et runtime (Section 6)

### CPU à vide

Mesure sur 5 secondes d'observation après chargement complet (CDP Performance).

| Métrique | Valeur |
|:---------|-------:|
| TaskDuration à vide (5 s) | 0,003 s |
| ScriptDuration à vide (5 s) | 0,001 s |
| Utilisation CPU estimée | **0,1 %** |
| Heap JS à vide | 2,66 Mo |

### Latence API locale

Mesurée depuis Node.js avec token bootstrap (10 appels par endpoint).

| Endpoint | p50 | p95 | Min | Max |
|:---------|----:|----:|----:|----:|
| `GET /api/conversations` | 2 ms | 5 ms | 1 ms | 5 ms |
| `GET /api/models` | 1 ms | 2 ms | 1 ms | 2 ms |
| `GET /api/providers` | 1 ms | 2 ms | 1 ms | 2 ms |

### Requêtes réseau à vide (10 secondes d'observation)

| Requête détectée | Fréquence observée |
|:-----------------|------------------:|
| `GET /api/agent/active-tasks` | 4 fois en 10 s (~24/min) |

### Constats Runtime

**PERF-16 — MESURÉ — CPU à vide excellent (0,1 %)**
Pas de timers coûteux, pas de setInterval visible dans les mesures CDP. L'application ne consomme quasiment aucun CPU lorsqu'elle est en attente.
Statut : ✅ OK.

**PERF-17 — MESURÉ — Poll `/api/agent/active-tasks` toutes les ~2,5 s**
4 requêtes `GET /api/agent/active-tasks` détectées pendant 10 secondes d'observation à vide (≈ 24 polls/min). Ce poll vérifie si une tâche agent est active et maintient le serveur éveillé. Bien qu'il soit léger (latence < 5 ms), il génère un traffic réseau continu et empêche la mise en veille du service worker.
Sévérité : Faible à Modérée (à suspendre si aucune tâche agent active).

**PERF-18 — MESURÉ — Latence API locale p50 ≤ 2 ms (excellent)**
Toutes les API REST locales répondent en moins de 5 ms au p95. La base de données en mémoire offre des performances excellentes.
Statut : ✅ OK.

**PERF-19 — SUPPOSÉ — Comportement à la reconnexion non mesurable automatiquement**
Le comportement du WebSocket / SSE à la reconnexion (déconnexion réseau puis reconnexion) n'a pas pu être mesuré sans interrompre le serveur. À vérifier manuellement via DevTools Network > Offline > Reconnect. Le code serveur `server/index.ts` contient la gestion des tickets WebSocket (L256-261, valides 30 s).
Sévérité : À mesurer manuellement.

---

## Récapitulatif des constats

| ID | Section | Statut | Sévérité | Titre |
|:---|:--------|:-------|:---------|:------|
| PERF-01 | INP | OBSERVÉ | Faible | Navigation Paramètres non mesurable automatiquement |
| PERF-02 | INP | MESURÉ | Modérée | INP premier token dépasse 100 ms sous CPU 4x |
| PERF-03 | INP | MESURÉ | Modérée | Aperçu artéfact lent sous CPU 4x (p50 = 154 ms) |
| PERF-04 | Streaming | OBSERVÉ | **Élevée** | Reparse Markdown complet à chaque token |
| PERF-05 | Streaming | OBSERVÉ | **Élevée** | Retokenisation de code à chaque rendu CodeBlock |
| PERF-06 | Streaming | OBSERVÉ | **Élevée** | Scroll smooth en boucle pendant le streaming |
| PERF-07 | Conversations | OBSERVÉ | **Élevée** | Absence totale de virtualisation |
| PERF-08 | Conversations | OBSERVÉ | Modérée | Pas de restauration de position de défilement |
| PERF-09 | Chargement | MESURÉ | Modérée | Bundle JS = 474,6 Ko, dépasse le budget de 250 Ko |
| PERF-10 | Chargement | OBSERVÉ | — | Modale Paramètres en lazy loading ✅ |
| PERF-11 | Chargement | OBSERVÉ | — | Aucune police locale chargée (substitution système) |
| PERF-12 | Chargement | MESURÉ | — | CLS = 0,0035 ✅ |
| PERF-13 | Animations | OBSERVÉ | — | `prefers-reduced-motion` correctement implémenté ✅ |
| PERF-14 | Animations | OBSERVÉ | Faible | `transition-all` à surveiller (width/height auto) |
| PERF-15 | Animations | OBSERVÉ | Modérée | Scroll JS `behavior: smooth` non conditionné à reduced-motion |
| PERF-16 | Runtime | MESURÉ | — | CPU à vide = 0,1 % ✅ |
| PERF-17 | Runtime | MESURÉ | Modérée | Poll `/api/agent/active-tasks` toutes les 2,5 s |
| PERF-18 | Runtime | MESURÉ | — | Latence API locale p50 ≤ 2 ms ✅ |
| PERF-19 | Runtime | SUPPOSÉ | Faible | Reconnexion WS non mesurée (à vérifier manuellement) |

---

## Données brutes

| Fichier | Description |
|:--------|:------------|
| [`env_info.json`](env_info.json) | Environnement machine / navigateur |
| [`inp_interactions_report.json`](inp_interactions_report.json) | INP 12 interactions (CPU 1x et 4x) |
| [`streaming_perf_report.json`](streaming_perf_report.json) | Streaming (tâches longues, DOM, mémoire) |
| [`load_report.json`](load_report.json) | Chargement à froid (LCP, CLS, TBT, bundle) |
| [`conversations_report.json`](conversations_report.json) | Longues conversations (DOM, heap, virtualisation) |
| [`idle_report.json`](idle_report.json) | Repos et runtime (CPU, latence API, polls) |

---

*Audit réalisé le 2026-09-21. Mission U2 — Lecture seule. Aucun fichier `src/` ni `server/` modifié.*
