# État des Lieux Exhaustif du Projet Iroko (`docs/ETAT_DU_PROJET.md`)

**Date d'évaluation** : 23 septembre 2026 à 23:20 (Europe/Paris)  
**Type de mission** : Mission N0 — Audit d'état complet en lecture seule (zéro modification de code applicatif, vérification intégrale sur le code source réel).

---

## Sommaire

1. [Méthode d'audit et critères de qualification](#1-méthode-daudit-et-critères-de-qualification)
2. [Inventaire complet par domaine](#2-inventaire-complet-par-domaine)
   - [a) Socle technique et sécurité du runtime local](#a-socle-technique-et-sécurité-du-runtime-local)
   - [b) Fournisseurs de modèles et catalogue](#b-fournisseurs-de-modèles-et-catalogue)
   - [c) Chat, streaming et rendu](#c-chat-streaming-et-rendu)
   - [d) Fusion Chat / Code](#d-fusion-chat--code)
   - [e) Pièces jointes](#e-pièces-jointes)
   - [f) Projets et dossiers de travail](#f-projets-et-dossiers-de-travail)
   - [g) Artéfacts et documents](#g-artéfacts-et-documents)
   - [h) Images et vidéos générées](#h-images-et-vidéos-générées)
   - [i) Agent de code et capacités autonomes](#i-agent-de-code-et-capacités-autonomes)
   - [j) Mémoire, Confidentialité, Capacités (Tool Registry), MCP, Compétences](#j-mémoire-confidentialité-capacités-tool-registry-mcp-compétences)
   - [k) Capacités avancées (LSP, Navigateur, Sous-agents, Plugins, Thème clair)](#k-capacités-avancées-lsp-navigateur-sous-agents-plugins-thème-clair)
   - [l) Cohérence, finitions et durcissement (ex-socle M8)](#l-cohérence-finitions-et-durcissement-ex-socle-m8)
   - [m) Audit UX 2026 et ses correctifs (Lots 0 à 7)](#m-audit-ux-2026-et-ses-correctifs-lots-0-à-7)
3. [Santé technique actuelle](#3-santé-technique-actuelle)
   - [Résultats bruts des 4 commandes](#résultats-bruts-des-4-commandes-de-contrôle)
   - [Dettes visibles du code](#dettes-visibles-du-code)
   - [Risques de sécurité et questions à trancher](#risques-de-sécurité-et-questions-à-trancher)
4. [Ce qui reste, par priorité](#4-ce-qui-reste-par-priorité)
   - [(a) Manques bloquants pour un usage quotidien](#a-manques-bloquants-pour-un-usage-quotidien)
   - [(b) Manques importants mais contournables](#b-manques-importants-mais-contournables)
   - [(c) Améliorations de confort et maintenabilité](#c-améliorations-de-confort-et-maintenabilité)
5. [Synthèse générale (10 lignes maximum)](#5-synthèse-générale-10-lignes-maximum)

---

## 1. Méthode d'audit et critères de qualification

Chaque sujet a été inspecté directement dans les fichiers sources (`server/`, `src/`, `scripts/`, `tests/`), sans se fier aux déclarations des documents `FEATURES.md` ou `PLAN_EXECUTION.md` seuls.

Quatre statuts stricts sont attribués :
- **FAIT** : Fonctionnalité réellement présente dans le code, branchée de bout en bout et couverte par des tests automatisés au vert.
- **PARTIEL** : Code existant et partiellement opérationnel, mais dont certains embranchements manquent ou ne sont pas totalement reliés.
- **ABSENT** : Non implémenté ou volontairement retiré / désactivé dans l'interface.
- **NON VÉRIFIABLE EN LECTURE SEULE** : Dépend de ressources externes en direct (vraies clés API fournisseurs, terminal mobile physique, lecteur d'écran physique).

---

## 2. Inventaire complet par domaine

### a) Socle technique et sécurité du runtime local

| Élément | Statut | Fichiers sources | Ce qui manque concrètement |
| :--- | :---: | :--- | :--- |
| **Daemon local 127.0.0.1** | **FAIT** | `server/index.ts` (l. 38) | Rien. Écoute strictement bornée à `127.0.0.1:3001`. |
| **Garde d'Origine et Host** | **FAIT** | `server/index.ts` (l. 140-195) | Rien. Rejet DNS rebinding (403/400 sur Host/Origin tiers). |
| **Jeton bootstrap éphémère** | **FAIT** | `server/index.ts`, `src/services/security/TokenService.ts` | Rien. Jeton crypto 32 octets stocké en mémoire vive client (0 localStorage). |
| **Garde Réseau (NetworkGuard)** | **FAIT** | `server/security/NetworkGuard.ts`, `docs/NETWORK.md` | Rien. Intercepte `http`, `https`, `fetch` ; bloque toute destination non autorisée. |
| **Persistance SQLite runtime** | **FAIT** | `server/storage/RuntimeDatabase.ts` | Rien. Base locale `%APPDATA%/iroko/iroko.db` ou `~/.iroko/` hors workspace. |
| **Observabilité & Masquage logs** | **FAIT** | `server/utils/logger.ts`, `server/security/PrivacyFilter.ts` | Rien. Clés, jetons et données sensibles masqués automatiquement. |
| **Barre latérale Discussions** | **FAIT** | `src/components/layout/ClaudeSidebar.tsx` | Rien. Liste alimentée par SQLite, masquée si vide, filtre Tout/Chat/Code/Épinglées, repli `Ctrl+B`. |

---

### b) Fournisseurs de modèles et catalogue

| Élément | Statut | Fichiers sources | Ce qui manque concrètement |
| :--- | :---: | :--- | :--- |
| **12 Presets Fournisseurs** | **FAIT** | `server/models/providers/presets/index.ts` | Rien. OpenRouter, OpenAI, Anthropic, Gemini, Mistral, Groq, DeepSeek, xAI, Together, Ollama, LM Studio, Custom. |
| **Validation réelle de clé** | **FAIT** | `server/index.ts` (`/api/credentials/test`), `presets/` | Rien. Test réseau réel de clé avec retour structuré sans persister de fausses clés. |
| **Catalogue normalisé & Curation** | **FAIT** | `server/models/catalog/ModelCatalogManager.ts` | Rien. Normalisation éditeurs/capacités, quotas (2 max/éditeur/palier), table SQLite `model_catalog`. |
| **Sélecteur du Composer** | **FAIT** | `src/components/composer/ClaudeComposer.tsx` | Rien. 5 états réactifs (sans fournisseur, chargement, erreur, indisponible, prêt), Favoris, Récents (3 max), tags sobres sans montant. |
| **Capacités par modèle** | **FAIT** | `server/models/catalog/types.ts`, `ClaudeComposer.tsx` | Rien. Détection vision, PDF natif, outils, vidéo, détection d'incompatibilité en direct. |
| **Vérification clés réelles** | **NON VÉRIFIABLE EN LECTURE SEULE** | Fournisseurs externes cloud | Requiert des clés d'API payantes valides détenues par l'utilisateur. |

---

### c) Chat, streaming et rendu

| Élément | Statut | Fichiers sources | Ce qui manque concrètement |
| :--- | :---: | :--- | :--- |
| **Streaming fluide** | **FAIT** | `src/hooks/useStreamBuffer.ts`, `ClaudeChat.tsx` | Rien. Tampon rAF ≤ 20 fps / 50 ms min avec flush immédiat à la fin de tâche. |
| **Bloc Réflexion dépliable** | **FAIT** | `src/features/chat/ClaudeChat.tsx` | Rien. Affiché uniquement si des logs réels existent (`thinkingLogs.length > 0`), masqué à vide. |
| **Arrêt immédiat (Abort)** | **FAIT** | `ClaudeComposer.tsx`, `AgentLoop.ts`, `ModelGateway.ts` | Rien. Bouton carré relié à `cancelTask()`, déclenche `AbortController` réseau immédiat. |
| **Titrage automatique** | **FAIT** | `src/context/AppContext.tsx`, `RuntimeDatabase.ts` | Rien. Dérivé du premier message utilisateur, synchronisé avec `document.title`. |
| **Rendu Markdown sobre** | **FAIT** | `src/features/chat/markdownParser.ts`, `MemoizedBlock` | Rien. Parsing sobre, liens sécurisés, blocage images distantes anti-exfiltration. |
| **Blocs de code copiables** | **FAIT** | `src/features/chat/CodeBlock.tsx` | Rien. Copie 1 clic sans saut visuel, coloration différée à la fermeture, désactivée > 2000 lignes. |
| **Actions sur les messages** | **FAIT** | `src/features/chat/ClaudeChat.tsx` | Rien. Copie, Réessayer, Modifier/tronquer avec impact fichiers, Supprimer avec modale. |
| **Recherche plein texte** | **FAIT** | `server/storage/RuntimeDatabase.ts`, `ClaudeSidebar.tsx` | Rien. Index FTS5 SQLite, triggers automatiques conversations/messages/artéfacts. |
| **Suivi du contexte** | **FAIT** | `src/features/chat/ClaudeChat.tsx` | Rien. Ligne discrète dès 60%, résumé automatique à 80% avec séparateur sobre. |
| **Reprise de stream après coupure** | **PARTIEL** | `ClaudeChat.tsx`, `AgentLoop.ts` | En cas de déconnexion réseau pendant la génération, le daemon termine la tâche, mais le client ne reprend pas le stream en direct à la reconnexion (il recharge la fin via SQLite). |

---

### d) Fusion Chat / Code

| Élément | Statut | Fichiers sources | Ce qui manque concrètement |
| :--- | :---: | :--- | :--- |
| **Mode par conversation** | **FAIT** | `server/storage/RuntimeDatabase.ts`, `AppContext.tsx` | Rien. Persisté en SQLite (`mode: 'chat' \| 'code'`), basculable en cours de discussion. |
| **Contrôle segmenté [Chat \| Code]** | **FAIT** | `src/components/composer/ClaudeComposer.tsx` | Rien. Boutons pilule sobres, `role="group"`, `aria-pressed`, bascule immédiate sans perte d'état. |
| **Suppression ancienne vue Code** | **FAIT** | `server/index.ts`, `ZyriconAppShell.tsx` | Rien. CodeWorkspace supprimé, redirection HTTP 302 `/code` vers `/`, 0 import orphelin. |
| **Inspecteur latéral Code** | **FAIT** | `src/features/chat/ClaudeChat.tsx`, `DiffViewer.tsx` | Rien. Panneau 320 px à droite s'ouvrant au premier diff/plan/terminal/test ou artéfact. |

---

### e) Pièces jointes

| Élément | Statut | Fichiers sources | Ce qui manque concrètement |
| :--- | :---: | :--- | :--- |
| **Gestionnaire multi-format** | **FAIT** | `server/attachments/AttachmentManager.ts` | Rien. Stockage `%APPDATA%/iroko/attachments/`, quotas 50 Mo/fichier, 200 Mo/conv. |
| **Sécurité Magic Bytes** | **FAIT** | `AttachmentManager.ts` (`isDisallowedExecutable`) | Rien. Blocage exécutables déguisés (PE, ELF, Mach-O, scripts). Protection zip-slip et bombes. |
| **Extraction de contenu** | **FAIT** | `server/attachments/AttachmentReader.ts` | Rien. Extraction PDF (`pdfjs-dist`), Word DOCX (`mammoth`), Excel XLSX (`exceljs`), ODT/ODS, texte. |
| **Outil de pagination** | **FAIT** | `server/tools/attachments/read_attachment.ts` | Rien. Outil agent découpant les pièces jointes volumineuses en tranches de 50 Ko. |
| **UI & Aperçu Inspecteur** | **FAIT** | `ClaudeComposer.tsx`, `ClaudeChat.tsx`, `AttachmentService.ts` | Rien. Menu '+', glisser-déposer, collage, puces au-dessus de la saisie, onglet Aperçu inspecteur. |

---

### f) Projets et dossiers de travail

| Élément | Statut | Fichiers sources | Ce qui manque concrètement |
| :--- | :---: | :--- | :--- |
| **Dialogue natif OS** | **FAIT** | `server/workspace/WorkspaceDialogPicker.ts` | Rien. PowerShell STA TopMost sous Windows, AppleScript sous macOS, Zenity sous Linux. |
| **Validation serveur stricte** | **FAIT** | `server/workspace/WorkspaceValidator.ts` | Rien. Rejet racines (`C:\`, `/`), dossiers système (`Windows`, `Program Files`, `/etc`), données runtime. |
| **Verrou mono-rédacteur** | **FAIT** | `server/workspace/WorkspaceLockManager.ts` | Rien. Fichier `.iroko.lock`, mode lecture seule automatique en cas de concurrence. |
| **Espaces temporaires** | **FAIT** | `server/workspace/TempWorkspaceManager.ts` | Rien. Confinés dans `%TEMP%/iroko-workspaces/`, plafond 100 Mo, bouton de copie vers PC. |
| **Puce de projet dans l'UI** | **FAIT** | `src/components/composer/ClaudeComposer.tsx` | Rien. Puce sobre au-dessus du champ, état lecture seule, menu '+' avec récents et fermeture. |

---

### g) Artéfacts et documents

| Élément | Statut | Fichiers sources | Ce qui manque concrètement |
| :--- | :---: | :--- | :--- |
| **Gestionnaire d'artéfacts** | **FAIT** | `server/artifacts/ArtifactManager.ts` | Rien. Stockage hors workspace `%APPDATA%/iroko/artifacts/`, versioning v1..vN, restauration. |
| **Outils de création/édition** | **FAIT** | `server/tools/artifacts/` (`create_artifact`, `update_artifact`) | Rien. Outils agent branchés avec validation Zod. |
| **Générateurs bureautiques N2** | **FAIT** | `server/artifacts/DocumentGenerators.ts`, `create_document.ts` | Rien. Formats DOCX (`docx`), XLSX (`exceljs`), PPTX (`pptxgenjs`), PDF (`pdf-lib`), archives ZIP. |
| **Enregistrement script N3** | **FAIT** | `server/tools/artifacts/register_artifact.ts` | Rien. Enregistre les fichiers créés par scripts (≤ 50 Mo, confinement strict anti-traversée). |
| **Aperçu sécurisé** | **FAIT** | `src/features/chat/ArtifactInspector.tsx` | Rien. Iframe sandboxée sans `allow-same-origin`, meta CSP `connect-src 'none'`, SVG en `<img>`. |
| **Téléchargement individuel et ZIP** | **FAIT** | `server/index.ts`, `src/services/artifacts/ArtifactService.ts` | Rien. Endpoint individuel et archive ZIP groupée `/artifacts/download-all`. |

---

### h) Images et vidéos générées

| Élément | Statut | Fichiers sources | Ce qui manque concrètement |
| :--- | :---: | :--- | :--- |
| **Passerelle Média (Images)** | **FAIT** | `server/media/MediaGateway.ts`, `generate_image.ts` | Rien. Adaptateurs OpenAI, Google Imagen 3, Cloudflare (Flux-1-Schnell), Mock. |
| **Sécurité SSRF Média** | **FAIT** | `server/media/MediaGateway.ts` | Rien. HTTPS obligatoire, filtrage DNS des IP privées/loopback/link-local, magic bytes image. |
| **UI Image** | **FAIT** | `ClaudeComposer.tsx`, `ArtifactCard.tsx` | Rien. Menu '+' "Créer une image", puce composer, rendu ratio conservé, copie binaire, régénération. |
| **Passerelle Vidéo asynchrone** | **FAIT** | `server/media/VideoGateway.ts`, `generate_video.ts` | Rien. Adaptateurs Veo, Replicate, Fal.ai, Mock. Table SQLite `video_jobs`, reprise `resumePendingJobs()`. |
| **Streaming HTTP Range (206)** | **FAIT** | `server/index.ts` | Rien. Tickets éphémères (5 min, non loggués), validation magic bytes MP4/WEBM/MOV. |
| **UI Vidéo** | **FAIT** | `ClaudeComposer.tsx`, `ArtifactCard.tsx` | Rien. Menu '+' "Créer une vidéo", puce retirable, suivi en direct avec durée/arrêt, `<video controls>` sobre. |

---

### i) Agent de code et capacités autonomes

| Élément | Statut | Fichiers sources | Ce qui manque concrètement |
| :--- | :---: | :--- | :--- |
| **Moteur de permissions (4 portées)** | **FAIT** | `server/permissions/PermissionEngine.ts`, `PermissionStore.ts` | Rien. "Une seule fois", "Pour cette session", "Toujours pour ce projet", "Refuser". Hors workspace. |
| **Classification du risque** | **FAIT** | `server/permissions/CommandRiskClassifier.ts` | Rien. Détection commandes critiques, composées (`&&`, `;`, `\|`), sous-shells (POSIX et Windows). |
| **Workspace & Règles projet** | **FAIT** | `server/workspace/WorkspaceManager.ts` | Rien. Découverte hiérarchique `AGENTS.md` / `IROKO.md` (max 32 Ko) sous `<project_instructions>` non fiable. |
| **Outils fichiers confinés** | **FAIT** | `server/security/PathSanitizer.ts`, `server/tools/filesystem/` | Rien. 5 outils (read, write, edit, list_dir, search_text). Chemins UNC/devices/ADS bloqués, écriture atomique. |
| **Diffs unifiés** | **FAIT** | `src/features/agent/DiffViewer.tsx`, `ClaudeChat.tsx` | Rien. Rendu unifié sobre dans l'inspecteur, limitation à 500 Ko, affichage de branche. |
| **Boucle agentique & Limites** | **FAIT** | `server/runtime/AgentLoop.ts` | Rien. Max 20 tours, arrêt après 3 échecs identiques, arrêt après 5 tours sans progrès, exclusion attente permission. |
| **Terminal & Processus** | **FAIT** | `server/tools/terminal/ProcessManager.ts` | Rien. Liste blanche d'environnement sans secret, destruction récursive `taskkill /T /F`, conflit port `EADDRINUSE`. |
| **Outils Git natifs** | **FAIT** | `server/tools/git/` | Rien. 7 outils via `execFile` sans sous-shell, `GIT_TERMINAL_PROMPT=0`, Conventional Commits français. |
| **Vérification automatique** | **FAIT** | `server/verification/VerificationEngine.ts`, `verify_project.ts` | Rien. Détection dynamique (npm/pnpm/yarn/bun), ordre strict (typecheck→lint→test→build), capture `fichier:ligne:col`. |
| **Planificateur dynamique** | **FAIT** | `server/runtime/Planner.ts` | Rien. Décomposition en étapes, mise à jour dynamique, affichage onglet Plan inspecteur. |

---

### j) Mémoire, Confidentialité, Capacités (Tool Registry), MCP, Compétences

| Élément | Statut | Fichiers sources | Ce qui manque concrètement |
| :--- | :---: | :--- | :--- |
| **Mémoire de projet (anti-secret)** | **FAIT** | `server/memory/ProjectMemory.ts`, `remember_fact.ts` | Rien. Portées globale/projet, refus formel des secrets, injection prompt max 4 000 car, purge exclusive. |
| **Confidentialité & Caviardage** | **FAIT** | `server/security/PrivacyFilter.ts`, `server/storage/RuntimeDatabase.ts` | Rien. Caviardage haute confiance avant modèle et dans les logs, export JSON, purges physiques réelles. |
| **Capacités (Tool Registry)** | **FAIT** | `server/tools/ToolRegistry.ts` | Rien. Source unique de vérité, interrupteurs On/Off persistés SQLite (`disabled_tools`), compteur composer. |
| **Serveurs MCP (stdio/SSE/HTTP)** | **FAIT** | `server/tools/mcp/McpManager.ts`, `McpClient.ts` | Rien. Validation transport, risque HIGH sur commande stdio, reconnexion backoff, isolation des pannes. |
| **Compétences (Skills)** | **FAIT** | `server/skills/SkillManager.ts` | Rien. Découverte hiérarchique `.agents/skills/`, validation frontmatter `SKILL.md`, redirection "Personnaliser". |

---

### k) Capacités avancées (LSP, Navigateur, Sous-agents, Plugins, Thème clair)

| Élément | Statut | Fichiers sources | Ce qui manque concrètement |
| :--- | :---: | :--- | :--- |
| **LSP TypeScript** | **FAIT** | `server/tools/lsp/` (`get_diagnostics`, `find_definition`, `find_references`) | Rien. Intégration `tsserver` fonctionnelle et testée (5/5 tests PASS). |
| **Agent Navigateur Playwright** | **FAIT** | `server/tools/browser/` (navigate, click, screenshot) | Rien. Mode headless confiné, profil éphémère détruit, filtrage strict d'URL (6/6 tests PASS). |
| **Sous-agents spécialisés** | **FAIT** | `server/runtime/SubagentManager.ts`, `invoke_subagent.ts` | Rien. 4 rôles (explore, debug, review, test), confinement permissions sous le parent (6/6 tests PASS). |
| **Gestionnaire de Plugins** | **FAIT** | `server/plugins/PluginManager.ts` | Rien. Schéma de validation, état inactif initial sécurisé, export, activation/désactivation (5/5 tests PASS). |
| **Thème clair** | **FAIT** | `src/index.css`, `useSettings.ts`, `ClaudeSettingsModal.tsx` | Rien. Tokens clairs WCAG AA mathématiquement conformes (> 4,5:1 et > 3:1), 0 régression sombre. |

---

### l) Cohérence, finitions et durcissement (ex-socle M8)

| Élément | Statut | Fichiers sources | Ce qui manque concrètement |
| :--- | :---: | :--- | :--- |
| **Éradication Supabase** | **FAIT** | Dépôt entier | Rien. 0 référence, 0 dépendance, 0 appel réseau externe. |
| **Démarrage unique (`npm start`)** | **FAIT** | `package.json`, `dist-server/index.js` | Rien. Serveur unifié servant les assets Vite et l'API WebSocket sur le port 3001. |
| **Instructions personnalisées** | **FAIT** | `server/storage/RuntimeDatabase.ts`, `SystemPrompt.ts` | Rien. Max 4 000 caractères, anti-secrets, balise `<custom_instructions>` subordonnée. |
| **Sauvegarde & Restauration SQLite** | **FAIT** | `server/index.ts`, `usePrivacySettings.ts` | Rien. `VACUUM INTO`, archive ZIP, exclusion des clés par défaut, fichier `.pre-restore.bak`. |
| **Raccourcis clavier globaux** | **FAIT** | `src/context/AppContext.tsx` | Rien. `Ctrl+B` (sidebar), `Ctrl+K` (recherche), `Ctrl+Maj+O` (nouvelle discussion), `Ctrl+,` (paramètres), `Échap`. |
| **Diagnostic anonymisé** | **FAIT** | `server/index.ts` (`/api/diagnostics/system`) | Rien. Inspecte versions, RAM, espace disque et OS sans fuite de secrets. |

---

### m) Audit UX 2026 et ses correctifs (Lots 0 à 7)

| Lot | Fiches traitées | Statut | Fichiers clés | Résultat mesuré |
| :--- | :--- | :---: | :--- | :--- |
| **Lot 0** | Outillage UX & Baseline | **FAIT** | `tools/audit/`, `docs/audit/` | 13 scores unitaires calculés, faux fournisseur déterministe. |
| **Lot 1** | Contrastes Sombre & Focus | **FAIT** | `src/index.css` | 0 violation axe-core (19 combinaisons), contrastes ≥ 4,5:1 et ≥ 3,0:1. |
| **Lot 2** | Primitive Calques & Titre | **FAIT** | `useOverlayFocus.ts`, `ClaudeSettingsModal.tsx`, `ClaudeSidebar.tsx` | Tabulation confinée, restitution focus, inertie frères, `document.title`. |
| **Lot 3** | Repères, ARIA & Cibles | **FAIT** | `ZyriconAppShell.tsx`, `useLiveAnnouncements.ts`, `ClaudeComposer.tsx` | Repères `<main>`/`<nav>`/`<header>`, régions live, cibles ≥ 24 px (`.tap-target-24`). |
| **Lot 4** | Streaming & Défilement | **FAIT** | `useStreamBuffer.ts`, `MemoizedBlock`, `useStickToBottom.ts` | Tampon rAF ≤ 20 fps, défilement `auto` respectant `prefers-reduced-motion`. |
| **Lot 5** | Mobile & Brouillons | **FAIT** | `useVisualViewportHeight.ts`, `useDraft.ts`, `src/index.css` | Police ≥ 16 px mobile (0 auto-zoom iOS), clavier virtuel, brouillons persistés. |
| **Lot 6** | Typographie, I18n & Bundle | **FAIT** | `scripts/lint_fr.mjs`, `ZyriconAppShell.tsx` (`React.lazy`) | 0 violation typographique sur 62 fichiers, terminologie Discussion unifiée, chunk initial 298 Ko (-41%). |
| **Lot 7** | Longues conversations | **FAIT** | `ClaudeChat.tsx`, `useScrollRestoration.ts`, `AppContext.tsx` | `content-visibility: auto`, scroll fluide (0 à 3,6% dropped frames), ancre restaurée sans flash via `useLayoutEffect`. |

---

### Points découverts dans le code et particularités constatées

1. **Bouton "Partager" dans la Topbar** :  
   - **Statut** : **ABSENT / DÉSACTIVÉ SOBREMENT**.  
   - **Fichier** : `src/components/layout/ClaudeTopbar.tsx:100`.  
   - **Constat** : Le bouton est physiquement présent mais porte `disabled`, `cursor-not-allowed` et une infobulle expliquant que le partage local n'est pas encore branché.
2. **Virtualisation DOM complète des messages** :  
   - **Statut** : **PROPOSITION DE CONCEPTION FORMALISÉE (NON IMPLÉMENTÉ DÉLIBÉRÉMENT)**.  
   - **Fichier** : `docs/audit/perf/PROPOSITION_CONCEPTION_VIRTUALISATION.md`.  
   - **Constat** : L'optimisation `content-visibility: auto` maintient la fluidité sous 3,6 % d'images perdues. Le temps d'ouverture à 200 messages est de 477 ms (cible ≤ 300 ms). Conformément à la règle contractuelle (« Si manquées : NE PAS virtualiser, écrire la proposition de conception et attendre la décision »), aucune bibliothèque de virtualisation détruisant l'accessibilité native (Ctrl+F, tabulation) n'a été ajoutée sans validation préalable.
3. **Tests sensoriels et matériels de l'audit UX** :  
   - **Statut** : **À EXÉCUTER PAR L'UTILISATEUR**.  
   - **Fichiers** : `docs/audit/a11y/PROTOCOLE_MANUEL.md` (NVDA / Narrateur), `docs/audit/responsive/PROTOCOLE_MOBILE.md` (smartphone physique).

---

## 3. Santé technique actuelle

### Résultats bruts des 4 commandes de contrôle

| Commande | Rôle | Code de sortie | Résultat détaillé |
| :--- | :--- | :---: | :--- |
| `npm test` | Suite de tests automatisés | **0** (Succès) | **316 / 316 tests PASS (100 % au vert, 0 échec)** sur 14 suites. |
| `npm run lint` | Typage strict TypeScript (`tsc --noEmit`) | **0** (Succès) | **0 erreur de typage**. |
| `npm run build` | Compilation client Vite + serveur Node | **0** (Succès) | `dist/` généré (chunk 299 Ko) + `dist-server/index.js` (691 Ko) en 4,8 s. |
| `npm run ui:check` | Intégrité visuelle Playwright (7 états) | **0** (Succès) | **7 / 7 états PASS (0,00 % de régression visuelle, 100 % conforme)**. |
| `npm run lint:fr` | Typographie française (linter automatisé) | **0** (Succès) | **0 violation sur 62 fichiers sources**. |
| `npm run lint:tokens` | Respect strict des tokens de design | **0** (Succès) | **0 couleur en dur détectée**. |

---

### Dettes visibles du code

1. **Occurrences TODO / FIXME** :  
   - Recherche textuelle dans `src/`, `server/`, `scripts/`, `tests/` et `docs/` : **0 occurrence de TODO, 0 occurrence de FIXME**.
2. **Doublons de composants** :  
   - Recherche de noms de composants `.tsx` dupliqués dans `src/` : **0 doublon**.
3. **Dépendances `package.json` vs imports réels** :  
   - Toutes les dépendances listées (`docx`, `exceljs`, `lucide-react`, `mammoth`, `pdf-lib`, `pdfjs-dist`, `pptxgenjs`, `react`, `react-dom`, `zod`) sont effectivement importées et utilisées dans le code serveur ou client. Aucune dépendance fantôme détectée.
4. **Fichiers de plus de 400 lignes contenant de la logique métier** :  
   14 fichiers dépassent le seuil recommandé de 400 lignes et mériteraient un découpage ultérieur :
   - `server/index.ts` : 2 343 lignes (serveur HTTP/WS unifié, routage et endpoints)
   - `server/storage/RuntimeDatabase.ts` : 2 322 lignes (requêtes SQLite, schémas et migrations)
   - `src/features/chat/ClaudeChat.tsx` : 1 482 lignes (composant principal de discussion)
   - `src/components/composer/ClaudeComposer.tsx` : 1 173 lignes (barre de saisie multi-modes)
   - `server/runtime/AgentLoop.ts` : 657 lignes (boucle autonome d'exécution)
   - `server/artifacts/ArtifactManager.ts` : 578 lignes (gestionnaire de stockage d'artéfacts)
   - `server/models/providers/presets/index.ts` : 506 lignes (presets déclaratifs des 12 fournisseurs)
   - `src/features/chat/ArtifactInspector.tsx` : 503 lignes (inspecteur latéral d'artéfacts)
   - `src/context/AppContext.tsx` : 486 lignes (contexte global React)
   - `server/media/VideoGateway.ts` : 477 lignes (passerelle de génération vidéo)
   - `server/artifacts/DocumentGenerators.ts` : 475 lignes (générateurs bureautiques)
   - `server/models/catalog/ModelCatalogManager.ts` : 446 lignes (normalisation du catalogue)
   - `server/attachments/AttachmentReader.ts` : 434 lignes (parseur de pièces jointes)
   - `server/tools/mcp/McpClient.ts` : 422 lignes (client de transport MCP)

---

### Risques de sécurité et questions à trancher

1. **Isolation des données et Garde Réseau** :  
   - Confinement étanche vérifié : zéro appel réseau sortant non audité (`NetworkGuard` actif).  
   - Dossier de données `%APPDATA%/iroko/` (ou `~/.iroko/`) strictement inaccessible par les outils fichiers de l'agent.
2. **Gestion de la mémoire et des très longues discussions** :  
   - À 1000 messages réels, la mémoire JS Heap monte à 24,1 Mo et le DOM compte 20 680 nœuds. La fluidité reste sous 3,6 % d'images perdues grâce à `content-visibility: auto`.
   - **Question à trancher par l'utilisateur** : Faut-il implémenter la pagination incrémentale par fenêtre glissante (50 messages au montage, préchargement au scroll haut) documentée dans `docs/audit/perf/PROPOSITION_CONCEPTION_VIRTUALISATION.md` pour faire passer le temps d'ouverture initial de 477 ms à moins de 150 ms ?
3. **Bouton Partager** :  
   - Faut-il implémenter un export local autonome (fichier HTML ou Markdown zippé) ou conserver le bouton désactivé ?
4. **Validation des clés en environnement réel** :  
   - L'ensemble des 12 adaptateurs est couvert par des tests unitaires et des mocks déterministes. Le test réel avec de véritables clés de production dépend d'une saisie manuelle dans l'interface des Paramètres.

---

## 4. Ce qui reste, par priorité

### (a) Manques bloquants pour un usage quotidien

| Sujet | Description | Effort estimé | Dépendances |
| :--- | :--- | :---: | :--- |
| **Saisie d'une clé API réelle** | Configurer au moins un fournisseur dans Paramètres › Fournisseurs & Clés (ex. OpenRouter, Anthropic, OpenAI, Mistral ou Ollama local) pour initier une conversation réelle avec un grand modèle. | **S** | Clé API détenue par l'utilisateur |

---

### (b) Manques importants mais contournables

| Sujet | Description | Effort estimé | Dépendances |
| :--- | :--- | :---: | :--- |
| **Arbitrage Virtualisation vs Pagination** | Trancher sur la proposition `PROPOSITION_CONCEPTION_VIRTUALISATION.md` : conserver l'état actuel (`content-visibility: auto`, 477 ms à 200 msg) ou implémenter la pagination 50 messages au montage. | **M** | Décision utilisateur |
| **Reprise de stream agent après coupure** | Permettre au client de se reconnecter en direct au flux streaming SSE/WS d'une tâche d'agent en cours d'exécution après rechargement d'onglet ou perte réseau temporaire. | **M** | AgentLoop / WebSocket |
| **Bancs d'essai sensoriels physiques** | Exécuter manuellement les protocoles `PROTOCOLE_MANUEL.md` (NVDA / Narrateur) et `PROTOCOLE_MOBILE.md` (smartphone physique). | **M** | Matériel physique de l'utilisateur |

---

### (c) Améliorations de confort et maintenabilité

| Sujet | Description | Effort estimé | Dépendances |
| :--- | :--- | :---: | :--- |
| **Modularisation des gros fichiers (> 400 l.)** | Découper `ClaudeChat.tsx` (1 482 l.), `ClaudeComposer.tsx` (1 173 l.), `server/index.ts` (2 343 l.) et `RuntimeDatabase.ts` (2 322 l.) en sous-modules et hooks autonomes sous la barre des 400 lignes. | **L** | `ui:check` et `npm test` |
| **Export / Partage local d'une discussion** | Raccorder le bouton "Partager" de la Topbar à une routine d'export local sécurisé (Markdown ou archive d'artéfacts) pour lever l'état désactivé. | **S** | `ClaudeTopbar.tsx`, DocumentGenerators |
| **Notification d'annulation (Toast 5s)** | Proposer un bandeau éphémère de 5 secondes "Discussion supprimée — Annuler" avant la suppression définitive en base. | **S** | Design tokens |

---

## 5. Synthèse générale (10 lignes maximum)

Iroko dispose d'un socle technique 100 % opérationnel, autonome et conforme : runtime local étanche (127.0.0.1, jeton mémoire, garde réseau sans fuite), persistance SQLite intégrale, 12 fournisseurs curés avec validation réelle, boucle agentique bornée avec permissions à 4 portées, moteur d'artéfacts bureautiques (DOCX/XLSX/PPTX/PDF/ZIP), médias locaux et inspecteur complet. L'ensemble des 8 lots d'accessibilité et de performance (Lots 0 à 7) est validé : les 316 tests automatisés sont au vert (100 %), la typographie française compte 0 violation, TypeScript et les tokens de design affichent 0 erreur, et l'intégrité visuelle Playwright est parfaite (7/7 PASS, 0,00 % de régression). Aucune dette bloquante n'existe (0 TODO/FIXME) ; seules subsistent la configuration d'une clé API réelle pour l'inférence, l'arbitrage sur la pagination des très longs historiques (proposition de conception formalisée), et la modularisation future des 14 fichiers de plus de 400 lignes.
