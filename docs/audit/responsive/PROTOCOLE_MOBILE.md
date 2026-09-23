# Protocole de Test Manuel sur Téléphone Réel — Mission U3 (`docs/audit/responsive/PROTOCOLE_MOBILE.md`)

Ce protocole permet à l'évaluateur de tester l'application Iroko sur un smartphone réel (Android et iPhone) dans les conditions strictes de sécurité du runtime local (§26 : daemon strictement lié à `127.0.0.1`, sans ouverture sur le réseau local ou Wi-Fi public).

---

## 1. Pré-requis et Architecture de Sécurité Locale

Le daemon d'Iroko écoute exclusivement sur `127.0.0.1:3001` et rejette toute requête dont l'en-tête `Host` ou `Origin` ne correspond pas à l'adresse de bouclage locale.
Pour tester sur un smartphone sans compromettre cette étanchéité :
- **Sur Android** : on utilise la redirection de port inversée ADB (`adb reverse`), qui fait correspondre le port `3001` du téléphone directement au port `3001` du PC hôte via le câble USB. Le téléphone accède ainsi à `http://127.0.0.1:3001` comme s'il était la machine locale.
- **Sur iPhone** : on utilise un tunnel USB local sécurisé (via `iproxy` ou le partage de connexion USB filaire avec proxy de bouclage local) ou le simulateur iOS Xcode avec Web Inspector Safari.

---

## 2. Procédure de Connexion

### Option A : Téléphone Android (Recommandé avec ADB)

1. **Activer le débogage USB** sur le téléphone Android :
   - *Paramètres › À propos du téléphone* › Taper 7 fois sur *Numéro de build*.
   - *Paramètres › Système › Options pour les développeurs* › Activer *Débogage USB*.
2. **Brancher le câble USB** entre le téléphone et le PC hôte. Accepter l'invite d'autorisation sur l'écran du téléphone.
3. **Exécuter la redirection de port inversée** dans le terminal du PC hôte :
   ```bash
   adb reverse tcp:3001 tcp:3001
   ```
   *(Vérifier avec `adb reverse --list` que `tcp:3001 tcp:3001` est bien actif).*
4. **S'assurer que le serveur de production tourne** sur le PC hôte :
   ```bash
   npm start
   ```
5. **Ouvrir Chrome / Edge sur le téléphone Android** et naviguer vers :
   ```text
   http://127.0.0.1:3001
   ```
   *Note : Le jeton d'amorçage bootstrap et les requêtes WebSocket fonctionneront de manière transparente car le navigateur du smartphone interroge son propre `127.0.0.1`, routé via le port inversé vers le PC.*

---

### Option B : iPhone (iOS Safari)

1. Brancher l'iPhone en USB au Mac/PC.
2. Activer *Réglages › Safari › Avancé › Inspecteur Web*.
3. Si un tunnel ADB-like est disponible (ex. via `usbmuxd` / `iproxy 3001 3001`), ouvrir `http://127.0.0.1:3001` dans Safari.
4. Alternativement, utiliser le Simulateur iPhone de Xcode sur Mac ou une session Chrome Remote Debugging.

---

## 3. Grille des 10 Tâches d'Évaluation sur Mobile Réel

| N° | Scénario à tester | Gestes & Actions | Comportement Attendu | Critères d'Échec |
| :--- | :--- | :--- | :--- | :--- |
| **T1** | **Affichage initial & Tiroir** | 1. Charger la page d'accueil.<br>2. Tap sur l'icône de menu (hamburger en haut à gauche). | Le tiroir s'ouvre avec une animation fluide (slide-in depuis la gauche) et un voile sombre semi-transparent. | Débordement horizontal de la page ; icône trop petite difficile à toucher. |
| **T2** | **Fermeture du tiroir** | 1. Tap sur le voile sombre (overlay).<br>2. Réouverture puis balayage (swipe) ou bouton retour. | Le tiroir se referme instantanément et le focus revient sur le contenu principal. | Le tiroir reste bloqué ; clic traverse l'overlay et active un élément en dessous. |
| **T3** | **Saisie & Clavier Virtuel** | 1. Tap dans la zone de texte du Composer.<br>2. Observer l'apparition du clavier virtuel. | Le champ de saisie reste **entièrement visible au-dessus du clavier** sans être masqué. La hauteur s'adapte (`100dvh`). | Le clavier recouvre le champ de saisie ou le bouton d'envoi. |
| **T4** | **Zoom automatique iOS (Safari)** | 1. Tap dans le champ de saisie sur iPhone.<br>2. Observer si la page effectue un zoom avant indésirable. | **Aucun zoom intempestif** : la taille de police du champ est ≥ 16 px (sinon iOS force un zoom à 100%). | La page zoome brusquement et l'utilisateur doit dézoomer à deux doigts. |
| **T5** | **Envoi et Streaming** | 1. Saisir une question courte.<br>2. Tap sur la flèche d'envoi.<br>3. Observer la réponse en cours de génération. | Défilement fluide automatique au fil des phrases. Le bouton Envoyer devient un bouton Arrêter carré. | Saccades, texte qui saute brutalement, impossible d'interrompre la réponse. |
| **T6** | **Défilement tactile & Interruption** | 1. Pendant le streaming, glisser le doigt vers le haut pour relire le début.<br>2. Observer si le défilement force le retour en bas. | Le défilement automatique **s'interrompt immédiatement** dès que l'utilisateur remonte manuellement. | L'écran est ramené de force en bas à chaque mot reçu, empêchant la lecture. |
| **T7** | **Bouton « Revenir en bas »** | 1. Après être remonté dans la discussion, chercher l'indicateur de bas de page.<br>2. Tap sur le bouton de recentrage. | L'écran redescend immédiatement en bas de la discussion. | Pas de bouton visible ; l'utilisateur doit faire défiler manuellement de nombreux écrans. |
| **T8** | **Cibles tactiles & Menu « + »** | 1. Tap sur le bouton « + » du Composer.<br>2. Tap sur « Ajouter des fichiers » ou « Créer une image ». | Menu contextuel tactile confortable (hauteur d'élément ≥ 44 px). Aucune fausse pression sur un élément voisin. | Cible trop étroite (< 44 px), sélection accidentelle d'un mauvais choix. |
| **T9** | **Orientation Paysage (844×390)** | 1. Tourner le smartphone à l'horizontale.<br>2. Vérifier la visibilité de la topbar, des bulles et du composer. | L'interface reste fonctionnelle, le composer ne prend pas tout l'écran vertical et le texte s'adapte sans coupure. | Le composer occupe 80 % de la hauteur disponible ; la barre latérale écrase le contenu. |
| **T10** | **Encoche / Dynamic Island (Safe Areas)** | 1. Vérifier les marges hautes et basses sur écran à encoche (iPhone, Pixel). | Le contenu et les boutons d'en-tête ne sont pas dissimulés sous l'îlot dynamique ou la barre de gestes inférieure. | Icônes coupées par le coin arrondi de l'écran ou l'encoche de caméra. |

---

## 4. Fiche de Rapport d'Anomalie Mobile

Pour chaque constat relevé sur mobile physique :
1. **Modèle exact de smartphone** et version du système (ex. Samsung Galaxy S23 - Android 14 ; iPhone 14 Pro - iOS 17.4).
2. **Navigateur et version** (ex. Chrome Mobile v122, Safari iOS 17).
3. **Capture d'écran ou courte vidéo** illustrant le défaut de mise en page ou de saisie.
4. **Comportement reproductible** : description pas-à-pas des gestes effectués.
