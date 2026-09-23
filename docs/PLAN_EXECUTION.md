# Plan Global d'Exécution Révisé — Iroko Code Agent (`docs/PLAN_EXECUTION.md`)

Ce document constitue la référence contractuelle unique pour l'implémentation ordonnée des capacités de l'agent de code Iroko. Il structure les travaux en 15 lots séquentiels (**L1 à L15**), formalise les impératifs stricts de sécurité du runtime local, sanctuarise l'interface utilisateur figée et détaille avec exactitude l'état réel du code existant.

---

## 1. Principes Fondamentaux et Règles Intangibles

1. **Interface Figée (100vw × 100dvh)** : Aucun changement de mise en page, de tokens, d'espacements (grille de 8px) ni de composants existants. Tout nouvel état visuel doit être signalé "À VALIDER" dans le plan et composé exclusivement à partir des composants et tokens existants. N'écrire aucune couleur en dur : utiliser les tokens du design system.
2. **Interdits Stricts** : Zéro ombre, zéro glow, zéro dégradé, zéro flou, zéro couleur d'accent (palette monochrome neutre noir/blanc/gris uniquement), zéro monétisation/forfait, zéro profil/compte utilisateur, zéro nom "Claude" visible dans l'UI (les identifiants techniques comme CLAUDE.md peuvent exister, jamais comme nom de produit affiché), zéro texte anglais dans l'interface.
3. **Zéro Capacité Simulée (§3)** : Tout contrôle est soit réellement branché au moteur sous-jacent, soit en état "désactivé" du design system (`disabled`, `aria-disabled="true"` avec description de la raison accessible, `cursor-not-allowed`, **sans `pointer-events-none`** pour garantir la visibilité du curseur d'interdiction). Aucun faux résultat n'est affiché.
4. **Zéro Donnée Inventée** : Donnée réelle ou état vide sobre (une ligne de texte gris 13px, sans illustration). Les sections vides de la sidebar sont masquées.
5. **Contenu Non Fiable (§26)** : Les fichiers du projet, les sorties d'outils, les réponses de serveurs MCP et les pages web sont considérés comme du contenu non fiable. Ce contenu ne peut en aucun cas altérer les permissions, le prompt système ou les règles de sécurité.
6. **Isolation des Données du Runtime** : La configuration, les autorisations ("Toujours pour ce projet"), les journaux, les clés et les jetons résident exclusivement dans le répertoire de données du runtime (`~/.iroko/` ou `%APPDATA%/iroko/`), strictement hors du workspace projet. Aucun outil de l'agent ne peut les lire ni les modifier.
7. **Découplage Architectural (§2.2 et §35)** : La logique métier, la communication réseau et la gestion des processus résident dans des services (`src/services/`), des hooks modulaires (`src/hooks/`) et le backend (`server/`). Les composants de présentation React demeurent strictement passifs.
8. **Règle de Livraison des Réglages** : Chaque page de la modale de paramètres est finalisée et branchée lors du lot qui délivre la fonctionnalité technique correspondante. Tout contrôle non encore branché demeure désactivé.

---

## 2. Table de Correspondance Formelle avec le Cahier des Charges

| Lot | Intitulé synthétique | Sections du Cahier |
| :--- | :--- | :--- |
| **L1** | Runtime sûr + Persistance locale + Observabilité + Sidebar Discussions | **§21, §24, §26, §29, §36** |
| **L2** | Fournisseurs & Clés + Model Gateway + Sélecteur de modèle | **§10, §26** |
| **L3** | Chat réel (streaming, réflexion, arrêt, Markdown) + Page Réfléchir | **§22, §37** |
| **L4** | Préférences (police, animations, voix, notifications) | **hors cahier** |
| **L5** | Permissions + Page Iroko Code (portées & sécurité) | **§9, §26** |
| **L6** | Workspace Manager + Règles projet + Outils fichiers Windows/Unix + Diffs | **§7, §12, §19, §26, §31** |
| **L7** | Boucle agentique de base avec limites et définition du progrès | **§5, §37** |
| **L8** | Terminal, environnement assaini et processus multi-plateformes | **§8, §26** |
| **L9** | Git (statut, diff, commit, branche dans inspecteur) | **§17** |
| **L10** | Vérification automatisée (détection dynamique package manager, tsc, lint, test, build) | **§6.6, §6.7, §18** |
| **L11** | Boucle autonome évoluée & Plan dynamique auto-replanifiant | **§5.2, §20.1, §21, §22** |
| **L12** | Mémoire de projet vs Persistance de session (sans secrets) | **§20, §21** |
| **L13** | Capacités (dynamique Tool Registry) + Confidentialité & Caviardage | **§6, §26** |
| **L14** | MCP sécurisé (sanitization des outils, pas de chargement auto de projet) + Compétences + Connecteurs | **§13, §15, §19, §26** |
| **L15** | Capacités avancées (LSP, navigateur headless, sous-agents, plugins, thème clair) | **§11, §14, §16** |

---

## 3. Sécurité du Runtime Local (Transversale — Socle L1)

Le runtime local (daemon Node.js sur le port 3001) manipule des outils système sensibles (terminal, fichiers, git). Son exposition locale doit être totalement étanche :

1. **Liaison d'interface réseau stricte** :
   - Écoute exclusivement sur l'adresse de bouclage `127.0.0.1`, jamais sur `0.0.0.0` ni sur les interfaces réseau routables.
   - Suppression totale du CORS wildcard `*`.
2. **Protection contre le DNS Rebinding & Origines non autorisées** :
   - Validation systématique de l'en-tête `Host` sur chaque requête HTTP et lors du handshake WebSocket (uniquement `localhost:3001` ou `127.0.0.1:3001`).
   - Validation stricte de l'en-tête `Origin` via une liste blanche restreinte à l'origine du client local (`http://localhost:5173`, `http://127.0.0.1:5173`).
3. **Mécanisme Concret d'Amorçage du Jeton (Token Bootstrap)** :
   - Un navigateur ne pouvant pas lire directement un fichier local sur le disque en raison de la sandbox web, le daemon génère un jeton cryptographique éphémère (`crypto.randomBytes(32).toString('hex')`) à chaque démarrage.
   - **Canal d'amorçage** : Au lancement, un point de terminaison d'échange à usage unique `/api/auth/bootstrap` restreint à `127.0.0.1` est accessible uniquement pendant les 5 premières secondes suivant le démarrage du daemon (ou handshake avec ticket de session éphémère).
   - Le jeton transmis est conservé **exclusivement en mémoire vive** dans le service client `TokenService.ts`. Il n'est **jamais stocké dans `localStorage`**, évitant ainsi toute exfiltration par injection de script ou extension tierce.
   - Jeton exigé dans l'en-tête HTTP `Authorization: Bearer <token>` et en paramètre ticket du handshake WebSocket. Le jeton n'est jamais consigné dans les logs.
4. **Persistance Côté Runtime (Données Hors Workspace)** :
   - Toutes les données durables (sessions de chat, états des tâches, configurations, décisions d'autorisation, journaux d'exécution) sont écrites par le daemon dans le répertoire système dédié de l'application : `~/.iroko/` (macOS/Linux) ou `%APPDATA%/iroko/` (Windows).
   - Le `localStorage` du navigateur est relégué au rôle de simple cache de complaisance UI (ex. onglet actif, préférences cosmétiques immédiates).
5. **Intégrité des Requêtes Modifiant l'État** :
   - Format `application/json` obligatoire avec en-tête personnalisé anti-CSRF `X-Iroko-Request: 1`.
   - Plafond strict sur la taille maximale des payloads JSON (1 Mo par défaut, 10 Mo pour les diffs batch).
6. **Chiffrement au Repos des Secrets et Clés API** :
   - Chiffrement symétrique AES-256-GCM.
   - Vecteur d'initialisation (IV) aléatoire de 16 octets généré à **chaque opération de chiffrement** et stocké avec le tag d'authentification.
   - Clé maîtresse stockée hors du dépôt Git et hors du répertoire workspace (trousseau OS ou fichier trousseau dédié aux permissions restreintes `chmod 600` / ACLs Windows exclusives).
7. **Validation Automatisée par Tests** :
   - Tests unitaires automatisés validant qu'une requête émanant d'une origine non autorisée (`Origin: http://evil.com`) ou sans jeton valide est rejetée avec un code HTTP 403 Forbidden.

---

## 4. Spécification Détaillée des Lots L1 à L15 et État Réel du Code

### Lot L1 : Runtime Sûr, Persistance Locale, Observabilité & Sidebar Discussions
- **Sections Cahier** : §21, §24, §26, §29, §36.
- **Dépendances** : Aucune (Socle fondamental).
- **Contenu & Exigences Techniques** :
  - Durcissement sécuritaire de `server/index.ts` (écoute exclusive 127.0.0.1, token bootstrap en mémoire, Host/Origin guard, anti-DNS rebinding).
  - Amorçage sécurisé du jeton : endpoint à usage unique `/api/auth/bootstrap` pour initialisation de `TokenService` sans lecture de fichier direct par le navigateur.
  - Persistance des sessions, tâches et journaux côté runtime dans `%APPDATA%/iroko/` ou `~/.iroko/` (le localStorage ne sert plus que de cache).
  - Observabilité (§36) : Génération et propagation d'identifiants uniques de session (`sessionId`), de tâche (`taskId`) et d'appel d'outil (`toolCallId`) dès le premier événement.
  - Sidebar Discussions : Raccordement de la liste réelle des discussions dans `ClaudeSidebar.tsx`, masquage sobre si vide.
- **État Réel du Code** :
  - *Daemon port 3001* : **Fait (100%)**. Écoute exclusive 127.0.0.1, token bootstrap en mémoire (nosniff, sans CORS), ticket WS à usage unique 30s, Host/Origin guard (anti-DNS rebinding), en-tête `X-Iroko-Request: 1` et plafonds stricts de payload (413).
  - *Persistance* : **Fait (100%)**. SQLite natif (`node:sqlite` DatabaseSync) dans `%APPDATA%/iroko/iroko_runtime.db` (ou `~/.iroko/`) avec tables `conversations`, `messages`, `agent_tasks`, `agent_events`, `tool_calls`, `settings` et migrations versionnées ; endpoint de migration one-time du localStorage ; localStorage sert de pur cache d'affichage.
  - *Observabilité (§36)* : **Fait (100%)**. `sessionId`, `taskId`, `toolCallId` propagés dès le premier événement avec horodatage ISO UTC ; logger structuré avec caviardage systématique des secrets (tokens, tickets, clés API `sk-...`).
  - *Sidebar Discussions* : **Fait (100%)**. Raccordée au runtime SQLite sans décalage visuel, masquée sobrement si vide, synchronisée à chaud.
  - *Fichiers impactés* : `server/index.ts`, `server/storage/RuntimeDatabase.ts`, `server/utils/logger.ts`, `server/types/events.ts`, `src/services/security/TokenService.ts`, `src/lib/agent-client.ts`, `src/context/AppContext.tsx`, `tests/runtime_security_and_persistence.test.mjs`, `scripts/ui_check.mjs`.
- **Risque UI** : **Bas**. Zéro modification de composants, simple propagation des identifiants et des discussions réelles.
- **Critères d'acceptation (§34)** :
  1. Le daemon refuse toute connexion dépourvue de jeton ou avec une origine externe (test unitaire automatisé).
  2. Chaque événement émis par WebSocket inclut `sessionId`, `taskId` et horodatage UTC ISO.
  3. La création d'une nouvelle discussion incrémente l'historique de la sidebar sans trou ni décalage visuel.

---

### Lot L2 : Fournisseurs & Clés, Model Gateway & Sélecteur de Modèle
- **Sections Cahier** : §10, §26.
- **Dépendances** : L1.
- **Contenu & Exigences Techniques** :
  - Chiffrement renforcé AES-256-GCM avec IV unique aléatoire à chaque chiffrement et stockage sécurisé hors dépôt.
  - Pool de clés avec priorité, rotation automatique transparente sur erreur 429 et cooldown exponentiel.
  - Endpoints sécurisés `/api/providers` et `/api/credentials`.
  - Livrable réglages associé : Page **"Fournisseurs & Clés"** dans `ClaudeSettingsModal.tsx`.
  - Sélecteur de modèle discret dans le composer avec dénominations réelles.
- **État Réel du Code** :
  - *ModelGateway & KeyPool* : **Fait (100%)**. Multi-fournisseurs (Anthropic, Gemini, OpenAI, OpenRouter, LM Studio, Ollama, Mistral, Groq, DeepSeek, xAI, Together, Custom), rotation transparente sur erreur 429 avec cooldown exponentiel et jitter, désactivation immédiate sur 401/403, repli sur 5xx sans boucle infinie.
  - *Architecture Fournisseurs & Catalogue Curé (M10.2)* : **Fait (100%)**. Spécification `docs/MODELS_ARCHITECTURE.md`, 12 presets déclaratifs avec validation dédiée (`/auth/key` pour OpenRouter), normalisation, déduplication, tiers de prix dynamiques (`free`, `budget`, `standard`, `premium`), quotas de curation (max 2/éditeur/palier), cache SQLite v13 (`model_catalog`), endpoints `/api/providers`, `/api/models`, `/api/models/refresh`, `/api/models/preferences`, événements WS `providers_changed` et `catalog_updated`.
  - *Chiffrement* : **Fait (100%)**. AES-256-GCM avec IV aléatoire unique de 12 octets à chaque chiffrement, tag d'authentification 16 octets, clé maîtresse stockée hors dépôt et hors dossier de données (`%USERPROFILE%/.iroko_security/master.key`), migration automatique des anciennes clés sans fuite.
  - *UI Paramètres & Composer* : **Fait (100%)**. `ProvidersSettings.tsx` et `ClaudeSettingsModal.tsx` avec validation réelle `/api/credentials/test`, sélecteur dynamique sans marque via `formatModelLabel` (sans nom "Claude" visible), état désactivé sobre si aucun modèle configuré.
  - *Fichiers impactés* : `docs/MODELS_ARCHITECTURE.md`, `server/models/providers/presets/`, `server/models/catalog/`, `server/models/modelFormatter.ts`, `server/security/EncryptionService.ts`, `server/models/errors/ErrorClassifier.ts`, `server/models/keys/KeyPoolManager.ts`, `server/models/ModelGateway.ts`, `server/models/router/ModelRouter.ts`, `server/models/providers/`, `server/storage/RuntimeDatabase.ts`, `server/index.ts`, `src/lib/models.ts`, `src/components/composer/ClaudeComposer.tsx`, `src/features/settings/ClaudeSettingsModal.tsx`, `tests/model_gateway_and_encryption.test.mjs`, `tests/mission_m10_2.test.mjs`.
- **Risque UI** : **Bas**. Respect strict des styles de formulaires sobres et du masquage des clés `sk-...`.
- **Critères d'acceptation (§34)** :
  1. En cas d'erreur 429 sur un fournisseur, la rotation de clé intervient en moins d'une seconde de manière transparente pour l'utilisateur.
  2. Les clés saisies sont validées avant sauvegarde et jamais renvoyées en clair par l'API.
  3. Le catalogue normalisé et curé classe dynamiquement les modèles par palier tarifaire et empêche la submersion par versions mineures redondantes.


---

### Lot L3 : Chat Réel (Streaming, Bloc Réflexion, Niveau, Arrêt, Markdown) & Page Réfléchir
- **Sections Cahier** : §22, §37.
- **Dépendances** : L1, L2.
- **Contenu & Exigences Techniques** :
  - Streaming complet de texte et deltas de réflexion via WebSocket.
  - Bloc Réflexion déroulant dynamique conditionné au contenu réel (`thinkingLogs.length > 0`).
  - Bouton Arrêter déclenchant `cancelTask()` et `AbortController`.
  - Titre dynamique de conversation dans la topbar.
  - Rendu Markdown fluide avec actions discrètes au survol (Copier).
  - Livrable réglages associé : Page **"Réfléchir"** dans `ClaudeSettingsModal.tsx` branchée (budget de réflexion, paliers réels).
- **État Réel du Code** :
  - *Streaming & Rendu Markdown sécurisé* : **Fait (100%)**. Rendu Markdown sécurisé avec blocage d'exfiltration par images distantes, liens sûrs, et blocs de code.
  - *Bloc Réflexion & Paliers* : **Fait (100%)**. Paliers réels traduits en paramètres fournisseurs (`thinking: { budget_tokens }` pour Anthropic, `reasoning_effort` pour OpenAI, `thinkingConfig` pour Gemini), bloc réflexion conditionné aux données réelles (zéro log inventé).
  - *Arrêt réel (AbortController)* : **Fait (100%)**. Bouton Arrêter carré dans le Composer, propagation d'un `AbortSignal` jusqu'aux requêtes réseau des fournisseurs, transition vers `idle` et sauvegarde du texte partiel.
  - *Page Réfléchir* : **Fait (100%)**. Contrôles réels interactifs avec 4 paliers et synchronisation bidirectionnelle SQLite runtime (`/api/settings/thinking_level`).
  - *Fichiers impactés* : `server/models/types.ts`, `server/models/providers/`, `server/models/router/ModelRouter.ts`, `server/runtime/AgentLoop.ts`, `server/runtime/AgentRuntime.ts`, `server/index.ts`, `src/components/composer/ClaudeComposer.tsx`, `src/features/chat/ClaudeChat.tsx`, `src/features/settings/ClaudeSettingsModal.tsx`, `src/context/AppContext.tsx`, `src/lib/agent-client.ts`, `tests/chat_streaming_and_cancellation.test.mjs`.
- **Risque UI** : **Nul**. 0.00% de diff visuel sur les 5 états de référence (`npm run ui:check`).
- **Critères d'acceptation (§34)** :
  1. Le clic sur Arrêter stoppe instantanément la génération et bascule l'état en `idle` sans pénaliser les clés API.
  2. La copie d'un message alimente le presse-papier avec confirmation visuelle sans déplacement de composant.
  3. Le bloc réflexion n'apparaît que si du vrai contenu de raisonnement a été produit par le modèle.

---

### Lot L4 : Préférences (Police, Animations, Voix, Notifications)
- **Sections Cahier** : Hors cahier.
- **Dépendances** : L1.
- **Contenu & Exigences Techniques** :
  - Livrable réglages associé : Page **"Préférences"** dans `ClaudeSettingsModal.tsx`.
  - Bascule temps réel de la police de conversation (`serif` / `sans`).
  - Respect du mode d'animations système ou réduites (`prefers-reduced-motion` et classe `.reduce-motion`).
  - Raccordement réel des options de notifications (Web Notification API) lorsque l'agent termine une réponse en arrière-plan.
  - Raccordement de la synthèse vocale et de la dictée vocale via l'API Web Speech du navigateur, avec gestion accessible des indisponibilités et permissions.
- **État Réel du Code** :
  - *Police & Thème* : **Fait (100%)**. Source unique SQLite runtime (`/api/settings`) + cache anti-flash `localStorage`. Thème Sombre actif, Clair et Système désactivés accessibles avec raison jusqu'au Lot L15.
  - *Animations* : **Fait (100%)**. Synchronisé avec SQLite runtime, classe `.reduce-motion` sur `html` neutralisant les transitions.
  - *Voix* : **Fait (100%)**. `SpeechService` complet, détection de support, chargement asynchrone des voix (`speechSynthesis.getVoices()`), sélecteurs de langues/voix/vitesses, dictée vocale et lecture audio dans `ClaudeComposer`.
  - *Notifications* : **Fait (100%)**. `NotificationService` complet, demande de permission native, alerte émise uniquement si l'onglet n'a pas le focus (`document.hidden || !document.hasFocus()`).
  - *Fichiers impactés* : `src/hooks/useSettings.ts`, `src/services/speech/SpeechService.ts`, `src/services/notification/NotificationService.ts`, `src/features/settings/ClaudeSettingsModal.tsx`, `src/components/composer/ClaudeComposer.tsx`, `src/context/AppContext.tsx`, `src/features/chat/ClaudeChat.tsx`, `src/index.css`, `tests/preferences_voice_and_notifications.test.mjs`.
- **Risque UI** : **Nul**. 0.00% de diff visuel sur les 5 états de référence (`npm run ui:check`).
- **Critères d'acceptation (§34)** :
  1. Le changement de police bascule instantanément le texte des messages sans rechargement.
  2. Si l'utilisateur autorise les notifications, une alerte native sobre s'affiche en fin de tâche d'arrière-plan uniquement lorsque l'onglet n'a pas le focus.
  3. Dictée et synthèse vocale fonctionnelles ou sobrement désactivées selon les capacités du navigateur.

---

### Lot L5 : Permissions & Page Iroko Code (Portées & Sécurité)
- **Sections Cahier** : §9, §26.
- **Dépendances** : L1.
- **Contenu & Exigences Techniques** :
  - Moteur de permissions avec 4 portées formelles : **Une fois**, **Pour la session**, **Toujours pour ce projet**, **Refuser**.
  - **Stockage hors workspace** : Le magasin d'autorisations ("Toujours pour ce projet") est obligatoirement stocké dans le dossier de données du runtime (`~/.iroko/permissions/<project-hash>.json`), JAMAIS dans un fichier du projet hôte (afin d'empêcher formellement l'agent de s'auto-octroyer des privilèges en modifiant un fichier local).
  - **Classification du risque des commandes composées** : Toute commande combinant des opérateurs (`|`, `&&`, `;`, `||`, `>`, `>>`, substitutions `$()`, backticks) est automatiquement classée au niveau de risque le plus élevé de ses sous-commandes et ne peut pas être auto-validée sans confirmation explicite.
  - Journalisation persistante de toutes les décisions de sécurité.
  - Livrable réglages associé : Page **"Iroko Code"** dans `ClaudeSettingsModal.tsx` branchée.
  - Composant `PermissionPrompt.tsx` affiché sans modale intrusive.
- **État Réel du Code** :
  - *PermissionEngine & Store* : **Fait (100%)**. 4 portées formelles (`once`, `session`, `project`, `reject`), magasin hors workspace (`%APPDATA%/iroko/permissions/<hash>.json`), empreintes SHA-256 anti-rejeu, expiration 2 min avec refus par défaut, journal d'audit avec rotation automatique (5 Mo) et caviardage de secrets.
  - *Classification des commandes* : **Fait (100%)**. `CommandRiskClassifier.ts` avec découpe des commandes composées (`&&`, `||`, `;`, `|`), sous-shells `$()`, redirections, et détection exhaustive des commandes critiques Windows/POSIX.
  - *Protection runtime* : **Fait (100%)**. Sanctuarisation stricte du répertoire de données runtime (`isRuntimeDataPath`) dans tous les outils fichiers.
  - *UI Prompt & Page Iroko Code* : **Fait (100%)**. `PermissionPrompt.tsx` intégré sans modale intrusive avec 4 choix ; page "Iroko Code" dans `ClaudeSettingsModal.tsx` branchée sur `/api/permissions` avec mode par défaut, timeout terminal, liste des règles avec révocation et journal d'audit en lecture seule.
  - *Fichiers impactés* : `server/permissions/CommandRiskClassifier.ts`, `server/permissions/PermissionStore.ts`, `server/permissions/PermissionEngine.ts`, `server/tools/filesystem/*.ts`, `server/tools/terminal/execute_command.ts`, `server/index.ts`, `src/features/agent/PermissionPrompt.tsx`, `src/features/settings/ClaudeSettingsModal.tsx`, `tests/permissions_and_risk_classifier.test.mjs`.
- **Risque UI** : **Nul**. 0,00 % de diff visuel lors de `npm run ui:check`.
- **Critères d'acceptation (§34)** :
  1. Aucune commande destructive n'est exécutée sans consentement préalable.
  2. Le choix "Toujours pour ce projet" est persisté hors du workspace et ne peut être altéré par les outils de l'agent.
  3. Les commandes composées avec pipes ou points-virgules déclenchent systématiquement une demande de confirmation.

---

### Lot L6 : Workspace Manager, Règles Projet, Outils Fichiers Windows/Unix & Diffs
- **Sections Cahier** : §7, §12, §19, §26, §31.
- **Dépendances** : L1, L5.
- **Contenu & Exigences Techniques** :
  - `WorkspaceManager` avec analyse de l'arborescence, détection de `package.json` et injection des règles `AGENTS.md` / `IROKO.md` dans le prompt système.
  - Prompt système versionné dans le runtime, excluant toute comparaison verbeuse avec d'autres agents.
  - **Prise en charge complète des chemins Windows** :
    - Insensibilité à la casse des chemins sous Windows (comparaisons normalisées en minuscules).
    - Normalisation des séparateurs (`\` et `/`).
    - Prise en charge des lettres de lecteurs (`C:`, `D:`), des chemins absolus sans lecteur (`/foo`), des chemins UNC réseau (`\\server\share`) et des volumes Windows.
    - Canonicalisation stricte via `fs.realpathSync` pour prévenir tout contournement de confinement par jonctions NTFS, liens symboliques ou traversées de répertoire (`..`).
  - Outils fichiers : `read_file`, `write_file`, `edit_file`, `list_dir`, `search_text` confinés strictement au workspace. Exclusion des fichiers sensibles (`.env`, clés privées).
  - Refus immédiat des modifications ambiguës dans `edit_file` (si le bloc cible n'est pas strictement unique).
  - Visualisation des modifications réelles dans `DiffViewer.tsx` dans l'onglet **Modifications (N)** du panneau inspecteur.
- **État Réel du Code** :
  - *WorkspaceManager* : **Fait (100%)**. Découverte hiérarchique de `AGENTS.md` / `IROKO.md` (et `CLAUDE.md`), plafonnement à 32 Ko par fichier, injection isolée dans `<project_instructions>` délimité comme contenu non fiable (§26), prompt système versionné (`v1.0.0`) sans comparaison d'agents.
  - *Outils Fichiers & Confinement* : **Fait (100%)**. `server/security/PathSanitizer.ts` assurant le confinement strict Windows/Unix (insensible à la casse sous Windows, interdiction absolue des chemins UNC, périphériques Windows `\\?\`, flux alternatifs NTFS `ADS`, noms réservés DOS `CON/AUX/NUL...`, noms avec espace/point final, noms courts 8.3 `~1`, traversée `..`, et protection du dossier de données runtime). Écriture atomique via fichier temporaire et renommage. Protection des fichiers sensibles (`.env*`, clés privées, certificats) avec confirmation `HIGH`. Détection binaire (>30% non-imprimables ou `\0`) et plafond 2 Mo. Sauvegarde préalable automatique dans `%APPDATA%/iroko/backups/` avant toute modification par `edit_file`.
  - *DiffViewer* : **Fait (100%)**. Diffs affichés en monochrome strict (texte blanc/gris, barré/souligné, zéro accent vert/rouge).
  - *Fichiers impactés* : `server/security/PathSanitizer.ts`, `server/workspace/WorkspaceManager.ts`, `server/runtime/SystemPrompt.ts`, `server/runtime/AgentLoop.ts`, `server/tools/filesystem/*.ts`, `src/features/agent/DiffViewer.tsx`, `tests/workspace_and_path_confinement.test.mjs`.
- **Risque UI** : **Bas**. Le panneau inspecteur de 320px est replié par défaut et ne s'ouvre qu'au premier diff réel.
- **Critères d'acceptation (§34)** :
  1. Toute tentative d'écriture ou lecture hors du répertoire racine du projet (y compris via jonction NTFS ou casse différente) est bloquée avec erreur de sécurité.
  2. `edit_file` échoue proprement sans altérer le fichier si le motif de recherche est dupliqué ou introuvable.

---

### Lot L7 : Boucle Agentique de Base avec Limites d'Exécution & Définition du Progrès
- **Sections Cahier** : §5, §37.
- **Dépendances** : L1 à L6.
- **Contenu & Exigences Techniques** :
  - Orchestration de la boucle autonome (`AgentLoop`) associant modèle, outils et utilisateur.
  - **Définition du "progrès" (§37)** : Le progrès n'exige **PAS obligatoirement** de modification de fichier sur disque. Une tâche en lecture seule (audit, inspection de code, explication d'architecture, recherche) ne doit pas être interrompue tant qu'elle produit des appels d'outils exploratoires constructifs non redondants, fait progresser les étapes du plan ou formule des réflexions pertinentes.
  - **Gestion des délais et temps d'attente** : Le timeout global de tâche (5 minutes) et les timeouts d'inactivité **ne décomptent PAS le temps passé en attente d'une autorisation utilisateur** (pause de l'horloge durant l'affichage de l'invite de permission).
  - Garde-fous rigoureux :
    - Nombre maximal d'itérations borné (20 par défaut).
    - Timeout individuel par outil (30 secondes).
    - Détection de répétition (3 sorties textuelles identiques = interruption immédiate).
    - Détection d'outil échouant en boucle (3 échecs consécutifs d'un même outil = arrêt ou réorientation).
    - Annulation utilisateur réactive via `AbortController`.
- **État Réel du Code** :
  - *AgentLoop & Limites* : **Fait (100%)**. `server/runtime/AgentLoop.ts` intègre la déduction systématique du temps d'attente utilisateur (`PermissionEngine.getTotalWaitTimeMs()`) pour le timeout global de 5 minutes. Timeouts différenciés par outil (`ToolRegistry.ts` : 30s fichiers, 120s commandes par défaut). Définition du progrès (§37) sans obligation de modification de fichier (nouvelle information utile, état modifié, plan avancé), arrêt après 5 tours sans progrès. Détection d'outil qui échoue en boucle (3 échecs consécutifs identiques = arrêt avec explication). Résumé structuré du contexte remplaçant l'élagage brut (conserve system prompt, demande initiale, résumé d'état et 14 derniers messages). Propagation d'`AbortSignal` aux outils et aux sous-processus `ProcessManager`.
  - *Traces & Persistance* : **Fait (100%)**. Enregistrement synchrone de `tool_calls` et `agent_events` dans `RuntimeDatabase` avec `taskId`, `sessionId`, `callId`.
  - *UI Paramètres* : **Fait (100%)**. Réglage des délais de commandes (30s, 60s, 120s, 5 min) et d'outils fichiers (15s, 30s, 60s) dans la page "Iroko Code" de `ClaudeSettingsModal.tsx`.
  - *Fichiers impactés* : `server/runtime/AgentLoop.ts`, `server/runtime/AgentRuntime.ts`, `server/runtime/Planner.ts`, `server/tools/ToolRegistry.ts`, `server/tools/types.ts`, `server/tools/terminal/ProcessManager.ts`, `server/tools/terminal/execute_command.ts`, `server/permissions/PermissionEngine.ts`, `server/permissions/PermissionStore.ts`, `server/index.ts`, `src/features/settings/ClaudeSettingsModal.tsx`, `tests/agent_loop_limits_and_progress.test.mjs`.
- **Risque UI** : **Bas**. Aucun changement de géométrie ni de tokens dans la modale.
- **Critères d'acceptation (§34)** :
  1. Une tâche de diagnostic ou d'audit en lecture seule se poursuit normalement sans être interrompue par l'absence d'écriture de fichier.
  2. L'attente de l'approbation d'une permission par l'utilisateur ne consomme pas le budget de timeout de la tâche.
  3. Un outil bloqué est interrompu au bout de 30 secondes sans bloquer le runtime.

---

### Lot L8 : Terminal, Environnement Assaini et Processus Multi-Plateformes
- **Sections Cahier** : §8, §26.
- **Dépendances** : L1, L5, L7.
- **Contenu & Exigences Techniques** :
  - Exécution asynchrone de commandes terminal via `ProcessManager`.
  - **Environnement assaini pour les sous-processus** : Aucune clé d'API (`OPENAI_API_KEY`, etc.), aucun jeton de session ni secret d'authentification du runtime parent n'est transmis ou hérité dans les variables d'environnement (`process.env`) des commandes terminal. Filtrage strict par liste blanche de variables système minimales (`PATH`, `HOME`, `USER`, `LANG`, `SYSTEMROOT`, `TEMP`).
  - **Arrêt garanti de tout l'arbre de processus à la sortie du runtime** : Capture des signaux d'arrêt (`SIGINT`, `SIGTERM`, `beforeExit`) pour tuer récursivement l'arbre complet des processus enfants sous Windows (`taskkill /pid <PID> /T /F`) et Unix (`process.kill(-pid)` ou arborescence de processus).
  - Timeout configurable par commande.
    - Rendu console fluide dans `ClaudeChat.tsx` (panneau inspecteur), strictement monochrome (texte `#e0dfdc` sur fond `#151515`), sans clignotement ni effet glow.
- **État Réel du Code** :
  - *ProcessManager & Sécurité Terminal* : **Fait (100%)**. `server/tools/terminal/ProcessManager.ts` applique une liste blanche stricte de variables d'environnement (`getSanitizedEnv`) excluant formellement toute clé API, jeton ou variable `IROKO_*`. Destruction récursive complète de l'arbre de processus (`taskkill /pid <pid> /T /F` sous Windows, terminaison de groupe sous POSIX). Enregistrement et nettoyage automatique des processus à la sortie du runtime (`SIGINT`, `SIGTERM`, `exit`, `beforeExit`). Plafonnement de sortie à 500 Ko avec avertissement, nettoyage automatique des séquences ANSI et caviardage des secrets (`PermissionStore.redactSecrets`). Détection de conflits de port (`EADDRINUSE`). Outils complets d'arrière-plan (`execute_command`, `start_process`, `stop_process`, `get_process_output`, `list_processes`).
  - *UI Console* : **Fait (100%)**. Intégré dans l'onglet Terminal du panneau inspecteur de `ClaudeChat.tsx` avec tokens conformes monochrome neutre.
  - *Fichiers impactés* : `server/tools/terminal/ProcessManager.ts`, `server/tools/terminal/execute_command.ts`, `server/tools/terminal/start_process.ts`, `server/tools/terminal/stop_process.ts`, `server/tools/terminal/get_process_output.ts`, `server/tools/terminal/list_processes.ts`, `server/tools/ToolRegistry.ts`, `tests/process_manager_and_terminal.test.mjs`.
- **Risque UI** : **Nul**. 0.00% de diff visuel (`npm run ui:check`).
- **Critères d'acceptation (§34)** :
  1. Les variables d'environnement d'une commande exécutée ne contiennent aucune clé d'API ni jeton du runtime (vérifié par test automatisé).
  2. L'arrêt du runtime ou d'un processus parent élimine tous ses sous-processus sans laisser de ports orphelins occupés.

---

### Lot L9 : Git et Affichage de Branche
- **Sections Cahier** : §17.
- **Dépendances** : L1, L6.
- **Contenu & Exigences Techniques** :
  - Outils natifs Git : `git_status`, `git_diff`, `git_commit`, `git_branch`.
  - Convention d'affichage simplifiée : la branche courante s'affiche discrètement dans l'en-tête du panneau inspecteur (suppression de barres d'outils redondantes).
  - Interdiction stricte de commandes destructives non sollicitées (`git push --force`, `git reset --hard` sans permission).
  - Messages de commit suggérés au format Conventional Commits en français.
- **État Réel du Code** :
  - *Outils Git & Sécurité* : **Fait (100%)**. `server/tools/git/` opérationnel avec `runGit` basé sur `execFile`, tableau d'arguments, `GIT_TERMINAL_PROMPT=0` et environnement assaini. Suite complète disponible : `git_status`, `git_diff` (avec pathspecs après `--` et troncature à 500 Ko), `git_log`, `git_add`, `git_commit` (avec format Conventional Commits en français et capture d'état avant/après), `git_branch`, `git_create_branch`. Rejet strict des options dangereuses (`-c`, `--upload-pack`, `--exec`, arguments débutant par `-`). Approbation explicite obligatoire (`MEDIUM`) pour les commits, et classification `HIGH`/`CRITICAL` pour push, reset, clean dans `CommandRiskClassifier`.
  - *UI Branche* : **Fait (100%)**. Branche affichée discrètement dans l'en-tête du panneau inspecteur de `ClaudeChat.tsx` en police mono 11px gris neutre (`#878684`).
  - *Fichiers impactés* : `server/tools/git/git_utils.ts`, `server/tools/git/git_status.ts`, `server/tools/git/git_diff.ts`, `server/tools/git/git_log.ts`, `server/tools/git/git_add.ts`, `server/tools/git/git_commit.ts`, `server/tools/git/git_branch.ts`, `server/tools/git/git_create_branch.ts`, `server/tools/ToolRegistry.ts`, `src/features/chat/ClaudeChat.tsx`, `tests/git_tools_and_branch.test.mjs`.
- **Risque UI** : **Nul**. 0.00% de diff visuel (`npm run ui:check`).
- **Critères d'acceptation (§34)** :
  1. L'agent extrait l'état exact du dépôt Git avant et après chaque intervention.
  2. Aucun commit n'est créé sans approbation explicite de l'utilisateur.

---

### Lot L10 : Vérification Automatisée (Gestionnaire de paquets dynamique, tsc, lint, test, build)
- **Sections Cahier** : §6.6, §6.7, §18.
- **Dépendances** : L1, L5, L8.
- **Contenu & Exigences Techniques** :
  - **Détection dynamique du gestionnaire de paquets** : Inspection des fichiers de verrouillage à la racine (`package-lock.json` -> `npm`, `pnpm-lock.yaml` -> `pnpm`, `yarn.lock` -> `yarn`, `bun.lockb` -> `bun`). **Aucune commande codée en dur**.
  - Détection dynamique des scripts réels présents dans le `package.json` du projet.
  - Enchaînement séquentiel de validation en fin de tâche (§18) :
    1. Contrôle de typage statique (`tsc --noEmit` ou script de typage détecté).
    2. Contrôle de qualité de code (`eslint` ou script de lint détecté).
    3. Exécution des tests unitaires (`test` ou script détecté).
    4. Compilation de production (`build` ou script détecté).
  - Exécution soumise aux permissions. Remontée directe des erreurs de vérification à l'agent pour correction ciblée.
- **État Réel du Code** :
  - *VerificationEngine & Détection dynamique* : **Fait (100%)**. `server/workspace/WorkspaceManager.ts` détecte dynamiquement le gestionnaire via champ `packageManager` dans `package.json`, lockfiles (`npm`, `pnpm`, `yarn`, `bun`), et présence de `node_modules`. `server/verification/VerificationEngine.ts` intègre des adaptateurs modulaires (`PACKAGE_MANAGER_ADAPTERS`), applique l'ordre strict `typecheck -> lint -> test -> build`, bloque toute installation sauvage si `node_modules` manque (`missingDependencies: true`), extrait les erreurs `fichier:ligne:colonne` avec limitation à 10 erreurs et plafonnement à 50 Ko.
  - *Règle d'or (§18)* : **Fait (100%)**. `allPassed = true` uniquement si tous les contrôles requis ont réussi. Les contrôles non configurés sont explicitement consignés dans `skippedChecks` avec justification.
  - *Outil & Événements* : **Fait (100%)**. `server/tools/testing/verify_project.ts` et événements `verification_step` enrichis du statut `skipped`.
  - *Tests* : **Fait (100%)**. `tests/verification_engine.test.mjs` validant les 6 scénarios requis avec 100% de succès.
  - *Fichiers impactés* : `server/workspace/WorkspaceManager.ts`, `server/verification/VerificationEngine.ts`, `server/tools/testing/verify_project.ts`, `server/types/events.ts`, `tests/verification_engine.test.mjs`.
- **Risque UI** : **Nul**. Statuts présentés sous forme d'étapes textuelles neutres dans l'inspecteur existant (0,00% diff).
- **Critères d'acceptation (§34)** :
  1. Le runtime utilise dynamiquement le gestionnaire de paquets identifié par le lockfile ou le champ packageManager du projet hôte.
  2. Si une régression de type ou de test est introduite, l'agent reçoit l'erreur exacte (fichier:ligne:colonne) et aucun succès n'est annoncé.
  3. L'absence de dépendances déclenche un signalement sans installation implicite ni commande sauvage.

---

### Lot L11 : Boucle Autonome Évoluée & Gestionnaire de Plan Dynamique Auto-Replanifiant
- **Sections Cahier** : §5.2, §20.1, §21, §22.
- **Dépendances** : L1 à L10.
- **Contenu & Exigences Techniques** :
  - Planificateur dynamique (`Planner.ts`) capable de décomposer une consigne complexe en sous-tâches ordonnées.
  - Mise à jour en temps réel des statuts d'étapes (`pending`, `in_progress`, `completed`, `failed`).
  - **Capacité d'auto-replanification** : Si une étape de test ou de vérification échoue, insertion automatique d'une étape de diagnostic et de remédiation ciblée.
  - Affichage dans l'onglet **Plan (N)** du panneau inspecteur de droite (320px).
- **État Réel du Code** :
  - *Planner & Auto-replanification* : **Fait (100%)**. `server/runtime/Planner.ts` décompose dynamiquement les requêtes non triviales en étapes ordonnées, passe les statuts fidèlement (`pending`, `in_progress`, `completed`, `failed`), et déclenche l'auto-replanification en insérant diagnostic + correction en cas d'échec de vérification/test (plafonné à 3 tentatives avec explication claire de blocage persistant §37).
  - *Points de contrôle & Reprise (§20.1, §21)* : **Fait (100%)**. `RuntimeDatabase.ts` (table `task_checkpoints`) persiste les étapes terminées, le plan, les fichiers modifiés et les résultats. `AgentLoop.ts` permet la reprise au dernier point vérifié sans réexécuter les étapes terminées.
  - *Mode Plan (lecture seule)* : **Fait (100%)**. `ToolRegistry.ts` et `AgentLoop.ts` restreignent strictement l'exécution aux outils `SAFE` (`read_file`, `list_dir`, `search_text`, `git_status`, `git_diff`, `git_log`, `get_diagnostics`), et rejettent formellement les outils modificateurs.
  - *UI Plan* : **Fait (100%)**. Onglet fonctionnel dans `ClaudeChat.tsx` (panneau inspecteur), notifié par événements `plan` (0,00% de diff visuel).
  - *Tests* : **Fait (100%)**. `tests/planner_and_replan.test.mjs` validant les 5 scénarios requis.
  - *Fichiers impactés* : `server/runtime/Planner.ts`, `server/runtime/AgentLoop.ts`, `server/runtime/AgentRuntime.ts`, `server/storage/RuntimeDatabase.ts`, `server/tools/ToolRegistry.ts`, `server/tools/types.ts`, `server/types/events.ts`, `tests/planner_and_replan.test.mjs`.
- **Risque UI** : **Nul**. Interface existante conservée intacte (0,00% diff).
- **Critères d'acceptation (§34)** :
  1. Les étapes du plan reflètent fidèlement la progression réelle des outils de l'agent.
  2. En cas de régression détectée par la vérification, des étapes correctives (diagnostic puis correction) s'insèrent automatiquement dans le plan.
  3. Une tâche interrompue reprend au dernier point de contrôle vérifié sans refaire le travail déjà achevé.
  4. En mode Plan, aucune écriture ni commande modélisatrice n'est possible, seuls les outils d'inspection SAFE s'exécutent.

---

### Lot L12 : Mémoire de Projet vs Persistance de Session (Zéro Secret)
- **Sections Cahier** : §20, §21.
- **Dépendances** : L1, L11.
- **Contenu & Exigences Techniques** :
  - **Distinction formelle entre Mémoire de Projet (§20) et Persistance de Session (§21)** :
    - *Persistance de Session (§21)* : Stocke l'historique brut des messages et événements pour rechargement rapide d'une discussion.
    - *Mémoire de Projet (§20)* : Synthétise de manière durable les décisions d'architecture, règles apprises, patterns de code et préférences du projet à travers les sessions.
  - **Interdiction absolue de mémoriser des secrets** : Filtrage strict pour interdire la persistance de clés d'API, jetons, mots de passe ou certificats dans la mémoire de projet.
  - Livrable réglages associé : Page **"Mémoire"** dans `ClaudeSettingsModal.tsx` branchée (visualisation et réinitialisation de la mémoire projet).
- **État Réel du Code** :
  - *Backend Mémoire* : **Fait (100%)**. `ProjectMemory.ts` avec détection regex stricte des secrets (clés API, tokens, mots de passe, PEM), gestion des portées globale et projet (hash SHA-256 de workspace), injection dynamique plafonnée à 4000 car (~1000 tokens) dans le prompt système sous `<project_memory>`, et outil `remember_fact` (catégorie `memory`, permission `MEDIUM`).
  - *Stockage SQLite* : **Fait (100%)**. Migration version 3 (`project_memories`), purge exclusive de la mémoire sans jamais toucher aux tables `conversations`, `messages`, `provider_credentials` ou `settings`.
  - *UI Paramètres* : **Fait (100%)**. Vue interactive complète dans `ClaudeSettingsModal.tsx` avec interrupteur On/Off, filtres de portée (Tous, Projet actif, Global), formulaire d'ajout/modification avec alertes anti-secret, export JSON et suppression individuelle/totale sécurisée.
  - *Fichiers impactés* : `server/memory/ProjectMemory.ts`, `server/tools/memory/remember_fact.ts`, `server/tools/ToolRegistry.ts`, `server/tools/types.ts`, `server/storage/RuntimeDatabase.ts`, `server/runtime/SystemPrompt.ts`, `server/runtime/AgentLoop.ts`, `server/index.ts`, `src/features/settings/ClaudeSettingsModal.tsx`, `tests/project_memory.test.mjs`.
- **Risque UI** : **Nul**. 0,00% de diff visuel sur les 5 états de référence (`npm run ui:check`).
- **Critères d'acceptation (§34)** :
  1. La purge de la mémoire efface l'intégralité des données apprises du projet sans affecter les clés d'API ni les sessions.
  2. Aucun secret ni clé d'API ne figure dans le fichier de mémoire de projet sur le disque.

---

### Lot L13 : Capacités (Lecture Dynamique Tool Registry) + Confidentialité & Caviardage
- **Sections Cahier** : §6, §26.
- **Dépendances** : L1, L2, L5.
- **Contenu & Exigences Techniques** :
  - **Page Capacités dynamique** : La page "Capacités" dans `ClaudeSettingsModal.tsx` ne comporte aucun contenu codé en dur : elle lit et reflète dynamiquement les outils enregistrés dans le registre (`ToolRegistry.ts`).
  - **Confidentialité et caviardage** : Détection et caviardage automatique des informations sensibles (clés d'API, tokens, secrets) dans les flux de logs et les affichages UI avant transmission.
  - Télémétrie locale déconnectée : aucune donnée télémétrique ne quitte la machine.
  - Livrables réglages associés : Pages **"Capacités"** et **"Confidentialité"** dans `ClaudeSettingsModal.tsx` branchées.
- **État Réel du Code** :
  - *ToolRegistry & Capacités* : **Fait (100%)**. `server/tools/ToolRegistry.ts` est la source unique de vérité avec interrupteurs on/off persistés en SQLite (`disabled_tools`), endpoints `/api/tools` et `/api/tools/:name/toggle`, exclusion des outils désactivés des définitions de modèle et blocage à l'exécution. Compteurs dynamiques `Outils (n)` dans `ClaudeComposer.tsx`.
  - *Confidentialité & Caviardage* : **Fait (100%)**. `server/security/PrivacyFilter.ts` avec caviardage haute confiance avant envoi au modèle (PEM, `sk-...`, `AIza...`, `ghp_...`, `xox...`, `Bearer...`) et zéro faux positif sur le code légitime (UUID, Git/SHA-256 hashes, Base64). Caviardage étendu dans les logs et événements. Vrai dossier local (`~/.iroko` ou `%APPDATA%/iroko`), export complet JSON et 3 purges effectives et indépendantes (discussions, mémoire, clés).
  - *Télémétrie & Réseau* : **Fait (100%)**. Zéro télémétrie, liste exhaustive des flux sortants consignée dans `docs/NETWORK.md` et test anti-dérive réseau.
  - *UI Paramètres* : **Fait (100%)**. Pages "Capacités" et "Confidentialité" dans `ClaudeSettingsModal.tsx` entièrement branchées avec vraies données, interrupteurs réactifs, confirmations légères et tokens existants.
  - *Tests* : **Fait (100%)**. `tests/privacy_and_capabilities.test.mjs` validant les 17 scénarios avec 100% de succès.
  - *Fichiers impactés* : `server/tools/ToolRegistry.ts`, `server/security/PrivacyFilter.ts`, `server/storage/RuntimeDatabase.ts`, `server/models/keys/KeyPoolManager.ts`, `server/runtime/AgentLoop.ts`, `server/index.ts`, `docs/NETWORK.md`, `src/features/settings/ClaudeSettingsModal.tsx`, `src/components/composer/ClaudeComposer.tsx`, `tests/privacy_and_capabilities.test.mjs`.
- **Risque UI** : **Bas**. Raccordement des interrupteurs existants sans modifier la grille.
- **Critères d'acceptation (§34)** :
  1. La page Capacités reflète exactement la liste des outils déclarés dans le runtime.
  2. Une clé lue accidentellement dans un fichier de projet est automatiquement caviardée dans l'interface et les logs.

---

### Lot L14 : Model Context Protocol (MCP) Sécurisé, Compétences & Connecteurs
- **Sections Cahier** : §13, §15, §19, §26.
- **Dépendances** : L1, L3, L5.
- **Contenu & Exigences Techniques** :
  - Support complet des clients MCP via transport `stdio` et `SSE`.
  - **Sécurité MCP renforcée** :
    - Gestion des risques d'exécution de commandes arbitraires par des serveurs MCP tiers.
    - Traitement des descriptions d'outils MCP comme du **contenu non fiable (§26)** pour prévenir toute tentative d'injection indirecte de prompt.
    - **Interdiction formelle de chargement automatique** d'une configuration MCP au niveau projet (`.mcp.json`) sans confirmation et validation explicite de l'utilisateur.
  - Livrables réglages associés : Pages **"Compétences"**, **"Connecteurs"** et **"Plugins"** dans `ClaudeSettingsModal.tsx` (remplacement des cartes fictives par des listes réelles ou état vide sobre d'une ligne grise).
- **État Réel du Code** :
  - *McpClient & McpManager* : **Fait (100%)**. Multi-transports (stdio, Streamable HTTP, SSE), environnement assaini, arrêt d'arbre de processus, reconnexion avec backoff, isolation, persistance SQLite `mcp_servers`, interdiction de chargement auto de `.mcp.json`, contenu non fiable neutralisé (§26), permission MEDIUM par défaut.
  - *SkillManager* : **Fait (100%)**. Parsing SKILL.md (YAML/Markdown), CRUD compétences, persistance SQLite `skills`, catalogue prompt vs chargement à la demande sans exécution de scripts.
  - *UI Paramètres* : **Fait (100%)**. Pages "Compétences" et "Connecteurs" raccordées aux données réelles avec formulaires sobres et détection de `.mcp.json`.
  - *Fichiers impactés* : `server/tools/mcp/McpClient.ts`, `server/tools/mcp/McpManager.ts`, `server/skills/SkillManager.ts`, `server/storage/RuntimeDatabase.ts`, `server/runtime/SystemPrompt.ts`, `server/runtime/AgentLoop.ts`, `server/index.ts`, `src/features/settings/ClaudeSettingsModal.tsx`, `tests/mcp_and_skills.test.mjs`, `tests/fixtures/mock_mcp_server.mjs`.
- **Risque UI** : **Bas**. Respect strict de la grille sobre existante.
- **Critères d'acceptation (§34)** :
  1. Un fichier `.mcp.json` détecté dans un projet n'est jamais activé sans approbation explicite de l'utilisateur.
  2. Les descriptions d'outils MCP sont assainies et ne peuvent altérer le prompt système ou contourner les permissions.

---

### Lot L15 : Capacités Avancées (LSP, Navigateur Headless, Sous-Agents, Plugins, Thème Clair)
- **Sections Cahier** : §11, §14, §16.
- **Dépendances** : L1 à L14.
- **Contenu & Exigences Techniques** :
  - Intégration avancée de serveurs de langage LSP natifs pour navigation de symboles et références.
  - Pilotage de navigateur headless sécurisé (Playwright/Puppeteer) pour exploration de documentation locale ou prévisualisation web.
  - Orchestration de sous-agents spécialisés.
  - Finalisation et polissage du thème clair (conforme aux tokens sans ombres ni dégradés).
- **État Réel du Code** :
  - *LSP* : **Amorcé**. `server/tools/lsp/` créé.
  - *Navigateur & Sous-agents* : **Absent**.
  - *Thème Clair* : **Partiel**. Variables CSS présentes dans `src/index.css`.
  - *Fichiers impactés* : `server/tools/lsp/`, `server/browser/`, `src/index.css`, `src/features/settings/ClaudeSettingsModal.tsx`.
- **Risque UI** : **Bas**. Invoqué via les outils en arrière-plan.
- **Critères d'acceptation (§34)** :
  1. La bascule en thème clair préserve un contraste AA strict sans ombres ni bordures floues.
  2. L'inspection LSP résout les définitions de symboles en moins d'une seconde.

---

## 5. Synthèse des Écarts Constatés entre le Plan et le Code Existant

L'audit approfondi du code réalisé en L0 met en évidence les écarts suivants par rapport aux descriptions antérieures :

1. **Daemon local `server/index.ts`** : Écoute avec `cors()` ouvert (`*`), sans vérification des en-têtes `Host` et `Origin`, sans jeton d'authentification par requête HTTP ni contrôle de handshake WebSocket.
2. **Persistance** : Le client frontend s'appuie actuellement sur `localStorage` dans `AppContext.tsx`. Aucune persistance disque sécurisée dans le répertoire runtime (`~/.iroko/` ou `%APPDATA%/iroko/`) n'est active côté serveur.
3. **Moteur de permissions `PermissionEngine.ts`** : Ne gère que `once` et `session` en mémoire vive. La portée durable `always_for_project` est absente et doit obligatoirement être stockée hors du workspace. La classification des commandes composées (`|`, `&&`, `;`) n'est pas implémentée.
4. **Outils fichiers & Windows** : Les outils `read_file`, `write_file`, `edit_file` ne traitent pas encore l'insensibilité à la casse sous Windows, la résolution canonique `fs.realpathSync` des jonctions NTFS ni les chemins UNC.
5. **Vérification `VerificationEngine.ts`** : Utilise des commandes `npm` codées en dur au lieu d'inspecter les lockfiles (`pnpm`, `yarn`, `bun`) et les scripts réels du `package.json`.
6. **Sous-processus `ProcessManager.ts`** : Les commandes terminal héritent de tout `process.env` (y compris les clés d'API parentes), et la destruction récursive des arbres de processus sous Windows via `taskkill /T /F` n'est pas garantie.
7. **Modale des réglages `ClaudeSettingsModal.tsx`** :
   - Les cartes fictives d'exemples dans Compétences, Connecteurs et Plugins ont été supprimées et remplacées par des états vides sobres conformes.
   - Les interrupteurs et boutons non branchés (Capacités, Confidentialité, Mémoire, Réfléchir, Iroko Code, Voix, Notifications) ont été passés à l'état désactivé accessible (`disabled`, `aria-disabled="true"`, `cursor-not-allowed`, sans `pointer-events-none`).

---

## 6. Architecture Frontend : Découpage des Services et Hooks

Pour respecter rigoureusement la règle d'architecture (*"La logique va dans des services et des hooks, jamais dans les composants React"*), le code est organisé ainsi :

```
src/
├── services/                        # Logique pure et communication (aucun code React)
│   ├── agent/
│   │   └── AgentSocketService.ts    # Client WebSocket typé avec authentification par jeton
│   ├── models/
│   │   └── ProvidersApiService.ts   # Client REST pour /api/providers et /api/credentials
│   ├── storage/
│   │   └── SessionStorageService.ts # Persistance locale sécurisée des discussions et projets
│   └── security/
│       └── TokenService.ts          # Gestion du jeton éphémère de session en mémoire vive
├── hooks/                           # Logique réactive modulaire
│   ├── settings/                    # 10 hooks modulaires dédiés aux réglages (< 400 lignes)
│   ├── useChat.ts                   # Messages, flux de streaming, copies et envoi
│   ├── usePermissions.ts            # Gestion des demandes et mémorisation des portées
│   ├── useDiffs.ts                  # Fichiers modifiés et calcul des diffs inspecteur
│   ├── useTerminal.ts               # Exécution de commandes et flux de console
│   ├── useTools.ts                  # Découverte et bascule des outils actifs
│   ├── useSettings.ts               # Thème, polices et configurations
│   └── useNavigation.ts             # Sidebar, tiroir mobile et onglets
├── context/
│   └── AppContext.tsx               # Façade d'agrégation légère garantissant l'API useApp()
├── features/
│   └── settings/
│       ├── pages/                   # 10 pages modulaires des paramètres (< 400 lignes)
│       └── ClaudeSettingsModal.tsx  # Coquille de navigation et modale (149 lignes)
└── components/ & features/          # Composants de présentation 100% INCHANGÉS
```

---

## 7. Protocole de Fin de Tâche et Validation Continue

À l'issue de chaque lot ou sous-tâche, la validation suit obligatoirement cette séquence :

1. **`npm run lint:tokens`** : Vérification stricte de l'absence de tout code couleur en dur (0 violation).
2. **`npm test`** : Exécution des tests unitaires et de sécurité automatisés.
3. **`npm run ui:check`** : Contrôle automatisé Playwright de non-régression visuelle (0,00 % sur sombres) et ratios WCAG AA.
4. **`npm run lint` (`tsc --noEmit`)** : 0 erreur de typage TypeScript.
5. **`npm run build`** : Compilation de production réussie avec code de retour 0.
6. **Mise à jour documentaire** : Actualisation conjointe de `docs/FEATURES.md`, `docs/ROADMAP.md`, `docs/UI_ARCHITECTURE.md` et `docs/PLAN_EXECUTION.md`.

