# Iroko Code Agent

[![CI](https://github.com/createordie09/Iroko-Agent/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/createordie09/Iroko-Agent/actions/workflows/ci.yml)

Agent de développement logiciel autonome et sécurisé, fonctionnant intégralement en local avec une interface utilisateur minimaliste et figée.

---

## 1. Principes Fondamentaux

- **100 % Local & Zéro Télémétrie** : Aucune métrique d'utilisation, aucun traceur analytique, aucune base de données cloud externe. Les données, l'historique et les clés d'API restent strictement confinés sur la machine hôte (`%APPDATA%/iroko/` sous Windows, `~/.iroko/` sous Linux/macOS).
- **Garde Réseau Strict (§26)** : Seuls les appels explicitement requis vers les fournisseurs d'inférence configurés par l'utilisateur (Anthropic, OpenAI, Gemini, OpenRouter, Ollama, LM Studio) et les serveurs MCP déclarés sont autorisés. Tout autre trafic sortant est bloqué au niveau du runtime.
- **Sécurité du Runtime** :
  - Écoute exclusivement sur l'adresse de bouclage locale `127.0.0.1`.
  - Amorçage par jeton cryptographique éphémère conservé en mémoire vive (jamais écrit sur disque ni dans `localStorage`).
  - Protection stricte anti-DNS Rebinding (validation de l'en-tête `Host`).
  - Protection contre les attaques SSRF avec résolution DNS préalable et rejet des IP privées/locales.
  - Confinement absolu des chemins de fichiers avec blocage des traversées et des répertoires système.
- **Interface Figée** : Respect absolu du design system monochrome neutre (noir / blanc / gris), sans ombres, sans glow, sans dégradés, sans animations superflues.

---

## 2. Prérequis

- **Node.js** version 22 ou supérieure (module standard `node:sqlite`).
- **npm** version 9 ou supérieure.

---

## 3. Installation et Démarrage

```bash
# Installation des dépendances
npm install

# Lancement du serveur d'interface Vite (port 5173)
npm run dev

# Lancement du runtime agent sécurisé en arrière-plan (port 3001)
npm run agent
```

L'application est accessible dans votre navigateur à l'adresse : **http://127.0.0.1:5173**

---

## 4. Scripts et Commandes de Vérification

Toutes les modifications doivent respecter le protocole de conformité :

| Commande | Rôle |
| :--- | :--- |
| `npm test` | Exécute l'ensemble des suites de tests automatisés. Déclenche automatiquement `pretest` (`npm run build`) pour générer `dist/` et `dist-server/`. |
| `node --test ...` | Exécution directe de tests ciblés. **Note** : nécessite l'exécution préalable de `npm run build` pour les tests dépendant des artefacts compilés (`network_guard`, `mission_m8_2`, `mission_lot6`). |
| `npm run ui:check` | Lance le contrôle de non-régression visuelle Playwright (0,00 % de divergence exigé). |
| `npm run lint` | Vérifie le typage strict TypeScript (`tsc --noEmit`). |
| `npm run build` | Compile l'application pour la production (`dist/` client et `dist-server/` serveur). |

---

## 5. Avant de lancer les tests

Sur une **machine neuve** (clone frais du dépôt), une seule commande installe toutes les préconditions :

```bash
npm run setup:test
```

Cette commande exécute dans l'ordre :
1. `npm ci` — installe les dépendances Node.js depuis `package-lock.json` (reproductible).
2. `npx playwright install --with-deps chromium` — installe le navigateur Chromium et ses dépendances système, requis par `npm run ui:check` et les tests d'intégration Playwright.

Ensuite, lancer la suite complète :

```bash
npm test
```

> **Note :** `npm test` déclenche automatiquement `npm run build` (via le script `pretest`) avant d'exécuter les suites. Il n'est pas nécessaire de compiler manuellement au préalable.

**Récapitulatif pour CI / machine neuve :**

```bash
# 1. Cloner le dépôt
git clone https://github.com/createordie09/Iroko-Agent.git
cd Iroko-Agent

# 2. Installer les dépendances et les navigateurs
npm run setup:test

# 3. Lancer les tests (build automatique inclus)
npm test
```

---

## 6. Documentation de Référence

- `docs/FEATURES.md` : Registre exhaustif des fonctionnalités réelles et de leur statut.
- `docs/ROADMAP.md` : Feuille de route d'implémentation des lots et missions.
- `docs/UI_ARCHITECTURE.md` : Spécifications figées de l'interface et de la carte des composants.
- `docs/NETWORK.md` : Liste fermée et contractuelle des destinations réseau autorisées.
- `docs/ADAPTATION.md` : Directives d'adaptation entre le cahier des charges et l'interface utilisateur.

