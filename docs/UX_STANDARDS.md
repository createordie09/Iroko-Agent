# Référentiel Normatif UX 2026 (`docs/UX_STANDARDS.md`)

Ce document constitue la norme d'évaluation UX et d'accessibilité d'Iroko pour le cycle 2026. Tout composant, écran, dialogue ou comportement interactif doit satisfaire ces critères sans dérogation.

---

## 1. Standard de référence : WCAG 2.2 Niveau AA

L'application Iroko applique l'intégralité des critères de succès WCAG 2.2 AA, spécifiquement adaptés aux interfaces d'agents autonomes, au chat en direct et à l'exécution d'outils locaux :

- **Perceptible** :
  - Contraste suffisant des textes et composants graphiques (critères 1.4.3 et 1.4.11).
  - Alternatives textuelles pour chaque icône signifiante (critère 1.1.1).
  - Adaptabilité du contenu sans perte d'information ni de fonctionnalité (critère 1.3.1).
- **Utilisable** :
  - Navigation intégrale au clavier sans piège à focus (critères 2.1.1 et 2.1.2).
  - Indicateur de focus visible et contrasté sur tout élément interactif (critère 2.4.7).
  - Cibles tactiles d'au moins 44×44px sur les interfaces mobiles et tactiles (critère 2.5.8 / 2.5.5).
  - Prise en charge des entrées simultanées et alternatives (critère 2.5.7).
- **Compréhensible** :
  - Langue déclarée (`fr`), textes prévisibles, labels explicites (critères 3.1.1, 3.2.1, 3.2.2).
  - Identification et suggestion d'erreurs claires et localisées (critères 3.3.1, 3.3.3).
  - Prévention des actions destructives avec confirmation explicite (critère 3.3.4).
- **Robuste** :
  - Balisage sémantique valide, rôles ARIA exacts sans redondance conflictuelle (critère 4.1.2).
  - Régions en direct (`aria-live`) cadencées et prioritaires selon le type d'événement (critère 4.1.3).

---

## 2. Budgets de Performance (Local & Runtime)

Évalués en environnement local (sur `127.0.0.1`) avec bridage CPU/réseau représentatif :

| Métrique | Seuil Budget | Cible Optimale | Méthode de mesure |
| :--- | :--- | :--- | :--- |
| **LCP** (*Largest Contentful Paint*) | ≤ 1.2 s | ≤ 800 ms | PerformanceObserver / Playwright CDP |
| **INP** (*Interaction to Next Paint*) | ≤ 50 ms | ≤ 16 ms (1 frame) | Mesure de latence sur saisie et clics |
| **CLS** (*Cumulative Layout Shift*) | = 0.000 | 0.000 | Aucun décalage visuel pendant le streaming |
| **Taille Bundle JS Initial** | ≤ 250 Ko | ≤ 180 Ko | Minifié brut (hors modules différés) |
| **Consommation Mémoire Client** | ≤ 150 Mo | ≤ 80 Mo | Heap size Playwright après 1000 messages |

---

## 3. Accessibilité Visuelle & Contrastes

- **Textes normaux** (< 18pt / 24px) : ratio de contraste ≥ **4.5:1** mesuré par rapport au fond immédiat.
- **Grands textes** (≥ 18pt / 24px ou ≥ 14pt / 18.5px gras) : ratio de contraste ≥ **3.0:1**.
- **Composants d'interface & bordures actives** : ratio de contraste ≥ **3.0:1**.
- **Indicateur de focus (`:focus-visible`)** :
  - Contour continu de 2px avec décalage (*offset*) de 2px.
  - Couleur du token `--border-active` ou équivalent contrasté.
  - Jamais masqué (`outline: none` interdit sauf si remplacé par un indicateur conforme).
- **Couleurs d'accent & décorations** :
  - Conformité stricte aux Règles Permanentes : palette monochrome / neutre (noir, blanc, gris).
  - Zéro ombre portée, zéro lueur (*glow*), zéro dégradé, zéro flou artistique.

---

## 4. Navigation au Clavier & Gestion du Focus

- **Tabulation logique** :
  - Ordre de focus descendant naturel suivant le flux visuel (DOM).
  - `tabindex="-1"` réservé aux éléments recevant le focus programmatiquement.
  - Pas de valeurs `tabindex` positives (> 0).
- **Raccourcis clavier Iroko** :
  - `Ctrl+B` (ou `Cmd+B`) : Bascule réduction/expansion de la barre latérale.
  - `Ctrl+K` : Palette de commandes universelle (recherche discussions, actions, navigation, modèle).
  - `Ctrl+,` : Ouverture de la modale des paramètres.
  - `Échap` : Fermeture hiérarchique (menu contextuel → modale → tiroir mobile) avec restauration immédiate du focus sur l'élément déclencheur.
  - `Entrée` : Envoi du message dans le composer.
  - `Maj+Entrée` : Saut de ligne dans le composer.
- **Pièges à focus** : strictement proscrits en dehors des modales actives où le focus doit être confiné (*focus trap* accessible).

---

## 5. Assistance d'Écran & Streaming Accessible

- **Boutons d'icônes** :
  - Tout bouton sans texte visible doit posséder un attribut `aria-label` ou `aria-labelledby` explicite en français.
- **Attributs d'état ARIA** :
  - Menus déroulants : `aria-haspopup="true"` et `aria-expanded="true|false"`.
  - Onglets et sélecteurs : `role="tab"`, `aria-selected="true|false"`, `role="tabpanel"`.
  - Contrôles désactivés : `disabled` et `aria-disabled="true"` avec infobulle ou texte accessible expliquant la raison.
- **Streaming accessible & Régions en direct (`aria-live`)** :
  - **Interdiction formelle** de déclencher une annonce `aria-live` par token reçu (saturation vocale destructrice).
  - Les réponses en streaming s'annoncent soit par phrase terminée (ponctuation finale `. ! ?`), soit via une notification sobre d'achèvement de réponse.
  - Alertes urgentes (erreurs, permissions d'outils) : `aria-live="assertive"`.
  - Notifications informatives et étapes d'outils : `aria-live="polite"`.

---

## 6. Mouvement & Préférences Utilisateur

- Prise en compte immédiate de `prefers-reduced-motion: reduce`.
- Lorsque les animations réduites sont activées :
  - Durée des transitions fixée à 0ms ou ≤ 50ms.
  - Suppression de tout déplacement de translation sur les volets et tiroirs.
  - Maintien uniquement des micro-transitions d'opacité si fonctionnelles (≤ 100ms).
- En mode standard :
  - Durée maximale de toute transition UI : ≤ 150ms.
  - Aucune animation continue en boucle (aucun spinner clignotant persistant).

---

## 7. Chat, Rendu & Résilience au Volume

- **Autoscroll intelligent** :
  - Le défilement automatique vers le bas s'active uniquement si l'utilisateur est déjà au bas de la conversation.
  - Si l'utilisateur fait défiler vers le haut pour relire un message antérieur, le défilement automatique se désengage immédiatement sans à-coup.
- **Résilience volumétrique** :
  - La vue conversationnelle doit maintenir une fluidité d'interaction constante (60 fps) jusqu'à 1000 messages.
  - Pas de fuite mémoire lors du recyclage des composants.
- **Stabilité de mise en page (CLS = 0)** :
  - Les conteneurs d'artéfacts et de blocs de code prévoient leur espace ou s'insèrent sans repousser brusquement le texte en cours de lecture.
  - Rendu des images avec ratio préservé sans saut de trame (*reflow*).

---

## 8. Adaptabilité Mobile & Responsive

- **Écran minimal critique** : 320×568 px (iPhone SE première génération).
- **Plage de résolutions supportée** : de 320px à 2560px de large.
- **Zéro défilement horizontal parasite** sur la fenêtre globale (`overflow-x: hidden` sur les conteneurs parents, seuls les blocs de code et tableaux larges défilent localement).
- **Cibles tactiles** : sur écran ≤ 768px, chaque bouton ou zone cliquable offre une surface d'interaction effective d'au moins 44×44px.
- **Mode paysage mobile** : conservation de l'accès à la saisie et aux contrôles sans écrasement vertical par le clavier virtuel.

---

## 9. Typographie & Règles de Français

- **Ponctuation soignée** :
  - Espace insécable obligatoire avant les signes doubles (`:`, `;`, `!`, `?`, `»`, `%`).
  - Espace insécable après les guillemets ouvrants (`«`).
- **Accents sur les majuscules** :
  - Respect strict des accents sur les capitales (`À`, `É`, `È`, `Ê`, `Î`, `Ô`, etc.).
- **Lexique et ton** :
  - Langue d'interface 100% en français (zéro terme anglais visible non technique).
  - Vocabulaire neutre, sobre, précis et professionnel.
  - Aucune abréviation obscure.

---

## 10. Matrice de Couverture des Audits Automatisés

### Matrice d'États (Chacun évalué en Thème Sombre et Thème Clair)
1. `home_pristine` : Accueil vierge (premier lancement, aucun historique).
2. `home_with_history` : Accueil avec liste de discussions antérieures.
3. `composer_empty` : Composer vierge prêt à la saisie.
4. `composer_multiline` : Composer avec texte long multiligne auto-aggrandi.
5. `composer_with_project` : Composer avec puce de dossier de travail actif.
6. `composer_with_attachments` : Composer avec puces de pièces jointes.
7. `composer_streaming` : Composer en cours de génération (bouton carré Arrêter actif).
8. `chat_short` : Conversation courte (1 à 5 messages texte).
9. `chat_long` : Conversation volumineuse (100 à 1000 messages avec code et tableaux).
10. `chat_tool_running` : Conversation avec exécution d'outil en direct.
11. `chat_permission_prompt` : Conversation avec demande interactive d'approbation d'outil.
12. `chat_artifact_inspector` : Conversation avec volet inspecteur d'artéfact ouvert à droite.
13. `settings_modal_all_tabs` : Modale des paramètres ouverte sur chacun des onglets.
14. `runtime_offline` : État hors ligne du runtime local avec tentative de reconnexion.
15. `model_error_retry` : État d'erreur du modèle avec bouton de réessai sobre.

### Matrice de Résolutions (Viewports)
1. `320x568` : Mobile ultra-compact (iPhone SE 1re gen).
2. `375x667` : Mobile compact standard.
3. `390x844` : Mobile moderne standard.
4. `844x390` : Mobile paysage.
5. `768x1024` : Tablette portrait.
6. `1024x768` : Tablette paysage / Petit écran d'ordinateur portable.
7. `1440x900` : Ordinateur portable standard.
8. `1920x1080` : Écran d'ordinateur de bureau Full HD.
9. `2560x1440` : Écran d'ordinateur de bureau QHD.

---

## 11. Glossaire Normé de Microcopie

Afin de garantir la cohérence textuelle et le professionnalisme de l'interface Iroko, les termes suivants font l'objet d'une normalisation stricte :

| Terme Normé | Définition & Règle d'Usage | Termes Proscrits dans l'UI |
| :--- | :--- | :--- |
| **Discussion** | Désigne un fil d'échange interactif avec l'agent. Utilisé pour tous les libellés visibles (titres, boutons, menus, historique). *Remarque : `conversationId` ou `/api/conversations` restent réservés aux identifiants techniques et routes internes.* | *Conversation*, *Chat*, *Thread* |
| **Dossier** | Répertoire local du système de fichiers ouvert ou lié par l'utilisateur comme espace de travail actif (*workspace*). Exemples : « Choisir un dossier », « Ouvrir le dossier ». | *Folder*, *Workspace* (dans les libellés visibles) |
| **Projet** | Contexte de travail structuré regroupant des instructions spécifiques, des documents de référence ou des compétences dédiées. | *Workspace*, *Task* |
| **Artéfact** | Document structuré, code, diagramme ou livrable pérenne produit par l'agent et inspectable dans le volet latéral dédié. Orthographe avec accent aigu obligatoire. | *Artefact* (sans accent), *Artifact* |

