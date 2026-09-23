# Protocole d'Évaluation Manuelle au Lecteur d'Écran et Contraste Élevé (`docs/audit/a11y/PROTOCOLE_MANUEL.md`)

Ce protocole détaille 12 tâches opérationnelles standardisées à exécuter sous Windows avec le lecteur d'écran **NVDA** (NonVisual Desktop Access), complétées par un banc d'essai sous le **Narrateur de Windows** et le mode **Contraste Élevé**.

Pour chaque tâche, ce document précise l'action à réaliser, les touches de raccourci, le comportement attendu et ce que le lecteur d'écran doit idéalement vocaliser. Les constats observés lors de ces tests manuels permettront de valider ou de qualifier les constats annotés `[SUPPOSÉ]` dans le rapport d'audit.

---

## Configuration Préalable

- **Navigateur** : Google Chrome, Microsoft Edge ou Chromium (mode fenêtré standard 100% zoom).
- **Lecteur principal** : NVDA 2024+ (mode parole activé, débit normal).
- **Lecteur secondaire** : Narrateur de Windows (`Win + Ctrl + Entrée`).
- **URL de test** : `http://127.0.0.1:5173`.
- **Règle d'or** : Ne pas utiliser la souris pendant toute la durée des tests. Utiliser uniquement le clavier et le retour sonore/braille.

---

## Les 12 Tâches d'Évaluation sous NVDA

### Tâche 1 : Démarrage et Arrivée sur la Page d'Accueil
- **Action** : Lancer le navigateur et charger la page d'accueil d'Iroko (`http://127.0.0.1:5173`).
- **Raccourcis** : `F5` pour recharger. `NVDA + T` pour lire le titre de la fenêtre. `NVDA + Espace` pour basculer entre mode navigation et mode formulaire.
- **Comportement attendu** :
  - Le titre du document doit annoncer `"Iroko"` ou `"Iroko — Nouvelle discussion"`.
  - La langue du document doit être reconnue comme française (`fr`).
  - Le focus initial doit se positionner naturellement sur le champ de saisie du Composer ou permettre d'y accéder en une seule tabulation.
- **Annonce attendue par NVDA** :
  > *"Iroko — Nouvelle discussion, document. Posez une question ou donnez une consigne... champ d'édition multiligne."*

---

### Tâche 2 : Navigation par Tabulation vers le Composer
- **Action** : Depuis le haut de la page, parcourir les éléments au moyen de la touche `Tab`.
- **Raccourcis** : `Tab` (avancer), `Maj + Tab` (reculer).
- **Comportement attendu** :
  - Ordre de tabulation logique : Bouton réduction barre latérale → Bouton nouveau chat → Filtres → Bouton paramètres → Zone de message.
  - Aucun piège de focus.
  - L'indicateur visuel de focus doit être net et contrasté (contour 2px).
- **Annonce attendue par NVDA** :
  > *"Réduire la barre latérale, bouton."*  
  > *"Nouvelle discussion, bouton."*  
  > *"Posez une question ou donnez une consigne..., champ d'édition multiligne."*

---

### Tâche 3 : Saisie d'un Message dans le Composer
- **Action** : Écrire un message simple, insérer un saut de ligne, puis vérifier la relecture.
- **Raccourcis** : Taper du texte. `Maj + Entrée` pour insérer un saut de ligne. Flèches directionnelles pour relire.
- **Comportement attendu** :
  - La saisie de `Maj + Entrée` ne doit pas envoyer le message mais créer une nouvelle ligne.
  - La zone de texte s'agrandit sans saut visuel ni décalage sonore.
  - Les touches fléchées permettent de naviguer caractère par caractère et mot par mot.
- **Annonce attendue par NVDA** :
  > Chaque caractère ou mot est répété selon les réglages de NVDA. À l'appui sur Maj+Entrée : *"Nouvelle ligne"*.

---

### Tâche 4 : Envoi du Message et Activation du Mode Streaming
- **Action** : Envoyer le message en appuyant sur `Entrée`.
- **Raccourcis** : `Entrée`.
- **Comportement attendu** :
  - Le message utilisateur s'insère dans la discussion.
  - Le focus ne doit pas être perdu sur le `body` : il doit rester dans le Composer ou être placé sur le statut.
  - Une région accessible annonce le démarrage de la génération.
- **Annonce attendue par NVDA** :
  > *"Génération en cours..."* ou *"L'assistant répond..."* (annonce sobre sans interruption brutale).

---

### Tâche 5 : Écoute de la Réponse en Streaming
- **Action** : Laisser le modèle répondre sans toucher au clavier pendant l'émission des tokens.
- **Raccourcis** : Aucun (écoute passive).
- **Comportement attendu** :
  - **INTERDICTION FORMELLE** de vocaliser chaque mot ou token individuel au fur et à mesure de l'arrivée réseau (bégaiement inintelligible).
  - La réponse se vocalise par phrase complète ou uniquement à la fin du flux.
  - Lorsque la réponse est complète, une annonce de fin sobre est émise.
- **Annonce attendue par NVDA** :
  > Aucun son parasite pendant le streaming token par token. À la fin : *"Réponse terminée. [Texte de la réponse]"* ou annonce discrète.

---

### Tâche 6 : Arrêt Volontaire de la Génération (Bouton Arrêter)
- **Action** : Pendant que la réponse défile, interrompre la génération avec le bouton d'arrêt.
- **Raccourcis** : `Maj + Tab` vers le bouton Arrêter ou touche `Échap`.
- **Comportement attendu** :
  - Le bouton d'envoi devenu bouton d'arrêt est nommé explicitement *"Arrêter la réponse"* (et non pas *"Carré"* ou sans label).
  - L'appui sur le bouton stoppe immédiatement le flux.
  - Le bouton redevient le bouton *"Envoyer"*.
- **Annonce attendue par NVDA** :
  > *"Arrêter la réponse, bouton. Espace. Génération interrompue."*

---

### Tâche 7 : Changement de Modèle via le Sélecteur
- **Action** : Naviguer jusqu'au sélecteur de modèle à côté du composer et changer de modèle.
- **Raccourcis** : `Tab` jusqu'au bouton de modèle. `Entrée` ou `Espace` pour ouvrir. `Flèche Bas` / `Flèche Haut` pour naviguer dans la liste. `Entrée` pour sélectionner. `Échap` pour fermer sans changer.
- **Comportement attendu** :
  - Le bouton annonce son état déplié/replié (`aria-expanded="true|false"`).
  - Le menu annonce les catégories (Favoris, Récents, Fournisseurs) et le nom du modèle sans mention de prix ou logos invisibles.
  - À la fermeture par `Échap`, le focus revient exactement sur le bouton du sélecteur.
- **Annonce attendue par NVDA** :
  > *"Sélectionner un modèle, bouton déroulant, replié."* (Ouverture) : *"Menu, liste de 12 éléments. Modèle d'audit local, élément de menu 1 sur 12..."*

---

### Tâche 8 : Menu "+" et Ajout de Document ou Projet
- **Action** : Ouvrir le menu "+", explorer les options ("Ajouter des fichiers...", "Ouvrir un dossier...").
- **Raccourcis** : `Tab` jusqu'au bouton "+". `Entrée` pour ouvrir. `Flèches Haut/Bas`.
- **Comportement attendu** :
  - Le menu popover est identifié comme un menu accessible.
  - Chaque option annonce son libellé complet et sa fonction.
  - La fermeture par `Échap` referme le sous-menu et restitue le focus sur le bouton "+".
- **Annonce attendue par NVDA** :
  > *"Ajouter du contenu, bouton, replié."* (Ouverture) : *"Menu. Ajouter des fichiers..., élément 1 sur 3. Ouvrir un dossier..., élément 2 sur 3."*

---

### Tâche 9 : Contrôle Segmenté [ Chat | Code ]
- **Action** : Basculer entre le mode Chat et le mode Code dans le Composer.
- **Raccourcis** : `Tab` vers le contrôle. `Flèches Gauche/Droite` ou `Espace`.
- **Comportement attendu** :
  - Le contrôle doit annoncer quel mode est actuellement actif via `aria-pressed="true"` ou `aria-selected="true"`.
  - La bascule en mode Code modifie l'état annoncé sans recharger la page ni perdre le texte du composer.
- **Annonce attendue par NVDA** :
  > *"Mode Chat, bouton à bascule, enfoncé."*  
  > *"Mode Code, bouton à bascule, non enfoncé."* (Clic) : *"Mode Code, enfoncé."*

---

### Tâche 10 : Modale des Paramètres et Navigation Complète
- **Action** : Ouvrir les paramètres avec le raccourci global `Ctrl+,`, parcourir les onglets à gauche, explorer une option, puis refermer avec `Échap`.
- **Raccourcis** : `Ctrl + ,` (ouvrir). `Tab` et `Flèches Haut/Bas` pour parcourir les onglets. `Échap` pour fermer.
- **Comportement attendu** :
  - La modale annonce son rôle de dialogue accessible (`role="dialog"`, `aria-modal="true"`).
  - Le focus est immédiatement confiné dans la modale : la tabulation ne s'échappe jamais sur les boutons d'arrière-plan de l'application.
  - À l'appui sur `Échap`, la modale se referme immédiatement et le focus est fidèlement restitué sur le contrôle d'où l'appel a été émis.
- **Annonce attendue par NVDA** :
  > *"Paramètres, dialogue. Onglet Préférences, sélectionné, 1 sur 10."* (Après Échap) : *"Paramètres fermé. Focus sur : Paramètres, bouton."*

---

### Tâche 11 : Bloc de Code et Bouton "Copier"
- **Action** : Atteindre un bloc de code généré par l'assistant et activer le bouton de copie.
- **Raccourcis** : `Tab` jusqu'au bloc ou raccourci de navigation bloc/bouton NVDA (`B`). `Entrée` ou `Espace` sur le bouton "Copier".
- **Comportement attendu** :
  - Le bloc de code annonce son langage de programmation.
  - Le bouton de copie est accessible au clavier sans exiger le survol de la souris.
  - Après activation, une notification de statut vocale annonce *"Code copié dans le presse-papier"*.
- **Annonce attendue par NVDA** :
  > *"Copier le code, bouton. Espace. Code copié dans le presse-papier."*

---

### Tâche 12 : Inspecteur Latéral d'Artéfacts
- **Action** : Ouvrir l'inspecteur latéral, naviguer entre les onglets (Aperçu, Artéfacts, Diff).
- **Raccourcis** : `Tab` jusqu'au déclencheur de l'inspecteur. `Flèches Droite/Gauche` sur la liste des onglets.
- **Comportement attendu** :
  - L'inspecteur est balisé comme repère complémentaire (`role="region"` ou `aside` avec label explicite).
  - Les onglets respectent le motif ARIA Tabs (`role="tablist"`, `role="tab"`, `role="tabpanel"`).
- **Annonce attendue par NVDA** :
  > *"Inspecteur, région. Onglets, liste. Onglet Artéfacts, sélectionné, 1 sur 2."*

---

## Protocole Complémentaire : Narrateur de Windows & Contraste Élevé

### Test A : Narrateur de Windows (`Win + Ctrl + Entrée`)
1. Démarrer le Narrateur avec `Win + Ctrl + Entrée`.
2. Parcourir la page d'accueil avec `Verr.Maj + Flèche Droite`.
3. Vérifier :
   - Les repères de page sont-ils annoncés ?
   - Les dialogues modaux annoncent-ils bien leur titre à l'ouverture ?
   - Les boutons d'icônes seuls disposent-ils tous d'un nom accessible compréhensible ?
4. Quitter le Narrateur avec `Win + Ctrl + Entrée`.

### Test B : Mode Contraste Élevé de Windows (`Alt Gauche + Maj Gauche + Impr. Écran`)
1. Activer le mode Contraste Élevé sous Windows via `Alt Gauche + Maj Gauche + Impr. Écran` (ou dans Paramètres Windows › Accessibilité › Thèmes de contraste › Désert / Crépuscule).
2. Vérifier visuellement sur l'écran d'accueil, dans le chat et dans la modale des paramètres :
   - Toutes les bordures des cartes, du composer et des champs restent-elles nettement visibles ?
   - Les icônes SVG sont-elles visibles en couleur système (`currentColor`) ou ont-elles disparu sur fond noir ?
   - Le texte sélectionné et l'indicateur de focus clavier restent-ils parfaitement contrastés ?
3. Désactiver le mode Contraste Élevé via le même raccourci.

---

## Grille de Restitution des Résultats Manuels

| N° Tâche | Fonction testée | Statut NVDA (OK / Partiel / Échec) | Remarques et annonces exactes entendues |
| :--- | :--- | :--- | :--- |
| **1** | Démarrage & Titre | | |
| **2** | Tabulation vers Composer | | |
| **3** | Saisie & Maj+Entrée | | |
| **4** | Envoi & Annonce statut | | |
| **5** | Streaming (pas de rafale) | | |
| **6** | Bouton Arrêter accessible | | |
| **7** | Sélecteur de modèle | | |
| **8** | Menu "+" et fichiers | | |
| **9** | Contrôle [Chat \| Code] | | |
| **10** | Modale Paramètres & Échap | | |
| **11** | Bloc de code & Copier | | |
| **12** | Inspecteur & Onglets | | |
| **A** | Narrateur Windows | | |
| **B** | Contraste Élevé Windows | | |
