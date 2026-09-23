# Manuel d'Adaptation : Cahier des Charges vs Interface Figée (`docs/ADAPTATION.md`)

Ce document formalise les arbitrages d'intégration entre les spécifications techniques du moteur Iroko Code Agent (sections §5 à §23) et l'interface utilisateur validée et figée. Il garantit que le branchement des capacités réelles de l'agent ne dégrade jamais l'épure visuelle, les tokens, ni les règles d'intégrité de l'application.

---

## 1. Tableau de comparaison & Risques d'intégration (§5 à §23)

| Section du Cahier | Intitulé technique | Statut actuel dans le code | Composant UI concerné | Risque d'impact UI | Stratégie d'adaptation retenue |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **§5** | **Runtime d'exécution local** | Présent (`server/runtime/AgentRuntime.ts`, daemon Express/WS sur port 3001) | `ClaudeChat.tsx` | **Bas** | Communication exclusive via WebSocket (`IrokoAgentClient`). Aucune modification visuelle. |
| **§6** | **Protocole d'événements (WS / SSE)** | Présent (`server/types/events.ts`, JSON-RPC unifié) | `ClaudeChat.tsx`, `ClaudeTopbar.tsx` | **Bas** | Raccordement direct aux flux d'événements sans ajouter d'icônes ou de bannières d'état invasives. |
| **§7** | **Passerelle Modèles & Pool Multi-clés** | Présent (`server/models/ModelGateway.ts`, `KeyPool.ts`, rotation auto sur 429) | `ClaudeSettingsModal.tsx` (Fournisseurs), `ClaudeComposer.tsx` | **Bas** | Utilisation stricte des lignes de formulaires sobres existantes dans les Paramètres. Masquage `sk-...`. |
| **§8** | **Stratégie de routage & Fallbacks** | Partiel (`ModelRouter.ts` gère le fallback cross-provider, heuristique par tâche) | `ClaudeComposer.tsx` | **Bas** | Le sélecteur affiche le modèle effectif. L'adaptation dynamique du modèle s'opère en backend. |
| **§9** | **Gestionnaire de Workspace & Arborescence** | Présent (`server/workspace/WorkspaceManager.ts`, métadonnées git/packages) | `ClaudeSidebar.tsx`, `ClaudeChat.tsx` | **Moyen** | La liste de fichiers ne doit pas encombrer la sidebar. Affichage sobre réservé à l'espace `Code` et à l'inspecteur. |
| **§10** | **Outils Système de fichiers (read, edit...)** | Présent (`server/tools/filesystem/`: 5 outils réels avec validation de chemin) | `DiffViewer.tsx`, `ClaudeChat.tsx` | **Bas** | Les fichiers modifiés sont restitués sous forme de diffs unifiés dans le panneau latéral droit existant. |
| **§11** | **Outils Terminal & ProcessManager** | Présent (`server/tools/terminal/ProcessManager.ts`, exécution de commandes avec timeout) | `ClaudeChat.tsx` (Terminal inspecteur) | **Moyen** | Le rendu de console reste strictement monochrome sur fond plat `#151515`, sans effet néon ni glow. |
| **§12** | **Outils Git (status, diff, commit...)** | Présent (`server/tools/git/` : 7 outils natifs git) | `ClaudeChat.tsx` | **Bas** | Seule la branche active courante est affichée en texte 11px gris dans la barre d'outils du panneau inspecteur. |
| **§13** | **Outils LSP & Analyse statique** | Partiel (`server/tools/lsp/`, diagnostics, définitions, références) | Panneau Inspecteur | **Bas** | Diagnostics intégrés sous forme de texte neutre dans les étapes du plan ou le résumé de validation. |
| **§14** | **Outils de Test & Vérification automatique** | Présent (`server/verification/VerificationEngine.ts`, build et test après édition) | `ClaudeChat.tsx` (Onglet Tests) | **Bas** | Déclenchement sobre des routines de test avec restitution dans l'onglet inspecteur dédié. |
| **§15** | **Support Model Context Protocol (MCP)** | Présent (`server/tools/mcp/McpManager.ts`, registre déclaratif + clients multi-transports) | `ClaudeSettingsModal.tsx` (Connecteurs) | **Moyen** | Les serveurs MCP configurés sont listés dans la vue Paramètres sans changer les cartes existantes. |
| **§16** | **Moteur de Permissions & Sécurité** | Présent (`server/permissions/PermissionEngine.ts`, approbation interactive) | `PermissionPrompt.tsx`, `ClaudeChat.tsx` | **Moyen** | Le prompt d'approbation réutilise les bordures `#2d2d2b` et boutons ghost sans fenêtre modale bloquante. |
| **§17** | **Boucle autonome & Décomposition de plan** | Présent (`server/runtime/AgentLoop.ts`, `Planner.ts`, limite à 20 itérations) | `ClaudeChat.tsx` | **Bas** | Les étapes du plan s'affichent dans l'onglet "Plan (N)" de l'inspecteur latéral dès qu'il a du contenu. |
| **§18** | **Gestion de contexte & Budget tokens** | Présent (Guard 40 messages et timeout 5 min, élagage sliding window) | Invisible | **Bas** | Traitement 100% backend sans impact visuel. |
| **§19** | **Visualisation des Diffs unifiés** | Présent (`server/tools/filesystem/edit_file.ts`, `DiffViewer.tsx`) | `src/features/agent/DiffViewer.tsx` | **Bas** | Rendu unifié déjà intégré, sans couleurs criardes (vert et rouge très sombres et désaturés). |
| **§20** | **Gestion des interruptions (Abort)** | Présent (`AbortController` natif, commande `cancel_task` WebSocket) | Bouton "Arrêter" dans `ClaudeComposer.tsx` | **Bas** | Bascule immédiate de l'icône d'envoi en carré d'arrêt pendant la génération. |
| **§21** | **Persistance locale & Sessions** | Présent (SQLite local du runtime, `RuntimeDatabase.ts`, synchronisation transparente) | `ClaudeSidebar.tsx` | **Bas** | Les conversations sauvegardées peuplent la sidebar uniquement si elles existent, sinon masquage propre. |
| **§22** | **Observabilité & Métriques** | Présent (retour des tokens utilisés dans le stream, logs console structurés) | Note de bas de page | **Bas** | Affichage minimaliste du modèle actif en bas du composer, sans surcharge de compteurs. |
| **§23** | **Sécurité & Chiffrement au repos** | Présent (`server/security/EncryptionService.ts` AES-256-GCM) | `ClaudeSettingsModal.tsx` | **Bas** | Clés stockées de façon chiffrée sur le système de fichiers hôte, masquées à l'affichage. |

---

## 2. Résolution des conflits entre le Cahier des Charges et l'Interface Figée

### Conflit 1 : Demande d'un explorateur de fichiers complexe ou arborescence dédiée
- **Exigence cahier (§9 & §10)** : Accéder à l'ensemble de l'arborescence des fichiers du workspace.
- **Règle d'interface** : L'interface est figée. La barre latérale gauche (Sidebar) ne doit pas être transformée en arborescence IDE dense, ce qui briserait le calme et le minimalisme de l'accueil.
- **Arbitrage d'adaptation** : 
  - L'arborescence complète reste interrogée par l'agent via les outils `list_dir`, `read_file` et `search_text` en arrière-plan.
  - Côté interface, seuls les fichiers réellement modifiés par l'agent sont affichés dans l'onglet **Modifications (N)** du panneau inspecteur latéral droit (320px), qui s'affiche uniquement lorsqu'il y a du contenu.

### Conflit 2 : Télémétrie, compteurs de latence et badges colorés
- **Exigence cahier (§22)** : Afficher les métriques d'exécution, la latence de réponse, le nombre de tokens consommés.
- **Règle d'interface** : Règle 3 des interdits stricts (aucune couleur d'accent vive, aucun élément décoratif encombrant).
- **Arbitrage d'adaptation** :
  - Les métriques techniques détaillées sont enregistrées dans les logs structurés serveur.
  - L'interface n'affiche que la note sobre et standardisée en bas du composer : `[Nom du Modèle Réel]` en typographie 11px gris tertiaire (`#585755`), sans badge coloré.

### Conflit 3 : Contrôles inactifs ou non raccordables (Partage)
- **Exigence cahier (§3 & §4)** : Aucune capacité simulée. Un contrôle est soit réellement branché, soit désactivé (`disabled` + `aria-disabled`). Tout bouton sans fonctionnalité possible est retiré.
- **Règle d'interface** : Ne jamais utiliser `pointer-events-none` sur des contrôles désactivés (violation d'accessibilité).
- **Arbitrage d'adaptation** :
  - Le bouton "Partager" a été entièrement supprimé (aucun compte, aucun partage possible).
  - Les boutons Micro et Haut-parleur utilisent l'API Speech Web standard (si le navigateur ne la supporte pas, état `disabled` + `aria-disabled="true"` avec infobulle explicative).

### Conflit 4 : Intégration Terminal et Exécution de commandes interactives
- **Exigence cahier (§11)** : Exécuter des commandes système et afficher le flux de sortie.
- **Règle d'interface** : Pas d'ombres, pas de glow vert phosphorescent de terminal rétro.
- **Arbitrage d'adaptation (Mission M1)** :
  - Tout est unifié dans le chat `ClaudeChat.tsx` (suppression de l'ancien `CodeWorkspace.tsx`).
  - Le terminal d'inspection dans le panneau latéral droit utilise un fond plat uni `#151515`, une bordure de 1px `#242423` et du texte monochrome gris clair (`#c4c3be`). Aucun filtre CSS d'effet cathodique ni dégradé.
  - Les étapes d'outils et le dialogue d'autorisation `PermissionPrompt` s'affichent directement dans le flux conversationnel sans interruption modale bloquante.

### Conflit 5 : Données d'exemple et d'attente
- **Exigence cahier (§1)** : Ne jamais afficher un résultat qui n'a pas été réellement produit.
- **Règle d'interface** : État vide sobre en une seule ligne de texte gris 13px, sans illustration.
- **Arbitrage d'adaptation** :
  - Aucune discussion ou tâche fictive pré-remplie.
  - La sidebar masque ses sections de liste si aucun élément n'existe.
  - Le panneau inspecteur n'affiche d'onglets que s'ils contiennent de la vraie donnée (aucun onglet avec compteur `(0)`).
