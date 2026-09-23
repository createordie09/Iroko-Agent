# Proposition de Conception : Virtualisation des Longues Discussions (Lot 7 — Fiche 20)

> [!NOTE]
> Ce document est rédigé conformément à la règle stricte du Lot 7 :  
> *« Cibles : ouverture ≤ 300 ms à 200 messages (×1), défilement ≤ 5 % d'images perdues. Si manquées : NE PAS virtualiser, écrire la proposition de conception et attendre la décision. »*

---

## 1. Synthèse des Mesures Observées

Banc de mesure exécuté sur le build de production avec injection réelle de 200 et 1000 messages SQLite :

| Scénario | Nœuds DOM | Mémoire Heap | Images perdues (Défilement) | CLS | Temps d'ouverture | Cible ouverture (≤ 300 ms) | Cible fluidité (≤ 5 %) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **200 msg — CPU ×1** | 4 281 | 8,29 Mo | **0,9 %** | 0,0035 | **477 ms** | ❌ (écart 177 ms) | ✅ Atteinte |
| **200 msg — CPU ×4** | 4 281 | 8,37 Mo | **0,0 %** | 0,0035 | **666 ms** | — | ✅ Atteinte |
| **1000 msg — CPU ×1** | 20 681 | 18,13 Mo | **3,6 %** | 0,0035 | **599 ms** | — | ✅ Atteinte |
| **1000 msg — CPU ×4** | 20 680 | 24,11 Mo | **0,0 %** | 0,0035 | **2 030 ms** | — | ✅ Atteinte |

### Enseignements majeurs :
1. **Fluidité du défilement exemplaire** : Grâce à `content-visibility: auto; contain-intrinsic-size: auto 120px`, le GPU et le moteur de rendu diffèrent la mise en page des nœuds hors viewport. Les images perdues restent sous 4 % même à 1000 messages (20 681 nœuds DOM).
2. **Stabilité visuelle (CLS)** : Le score CLS reste inférieur à `0,004`, bien en-dessous du seuil d'excellence Web Vitals (`0,1`).
3. **Temps d'ouverture** : L'ouverture à 200 messages sous CPU ×1 est mesurée à **477 ms** (cible ≤ 300 ms). L'écart de 177 ms provient du coût de montage React des 200 éléments `<article>` et de la désérialisation JSON locale.

---

## 2. Proposition de Conception Technique pour Virtualisation

Si la décision est prise d'adopter une virtualisation complète pour franchir le seuil des 300 ms à l'ouverture, voici l'architecture recommandée :

### A. Principe du Fenêtrage Adaptatif
- **Fenêtre active** : Rendre dans le DOM uniquement les messages visibles dans le viewport plus une marge tampon (*overscan*) de 3 à 5 messages au-dessus et en-dessous.
- **Taille variable des bulles** : Mesure dynamique de hauteur via `ResizeObserver` avec mise en cache par `message.id`.
- **Ancre de défilement** : Conservation de la position de défilement relative lors du chargement de blocs supplémentaires vers le haut.

### B. Sauvegarde de l'Accessibilité et Recherche Native (WCAG 2.2 AA)
La virtualisation classique détruit l'accessibilité native en retirant les éléments du DOM :
1. **Recherche native (Ctrl+F)** : La virtualisation désactive la recherche native du navigateur sur les messages non rendus. Pour y remédier :
   - Soit conserver un index textuel dans le DOM avec `aria-hidden="true"` ou rendu invisible non layouté (`display: none` ou `content-visibility: hidden`).
   - Soit basculer vers la commande interne de recherche globale (Ctrl+K FTS5) déjà branchée sur SQLite.
2. **Navigation au clavier et Lecteurs d'écran** : Les lecteurs d'écran (NVDA, Narrateur) doivent pouvoir annoncer le nombre total de messages via un repère sémantique `aria-rowcount` ou une liste ordonnée `role="feed"`.

### C. Alternatives sans Virtualisation Lourde
Avant d'introduire une bibliothèque tierce de virtualisation :
1. **Pagination incrémentale par fenêtre glissante** : Ne charger au montage que les 50 derniers messages de la discussion (`LIMIT 50 ORDER BY created_at DESC`), puis précharger les 50 précédents lors du défilement vers le haut via `IntersectionObserver` sur une sentinelle discrète.
2. **Gains attendus** : Temps d'ouverture immédiat < 120 ms (50 messages seulement au montage), 0 complexité de calcul de hauteurs virtuelles, et maintien de l'architecture existante.

---

## 3. Statut Actuel

Conformément à la consigne du Lot 7 :
- **Virtualisation NON implémentée**.
- **Cette proposition de conception est soumise à la décision de l'utilisateur**.
