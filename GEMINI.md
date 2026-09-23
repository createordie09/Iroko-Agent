# Consignes Permanentes des Agents Iroko
1. Lire obligatoirement docs/UI_ARCHITECTURE.md et docs/FEATURES.md avant tout code.
2. L'interface est figée : réutiliser les composants et tokens existants sans modifier le design.
3. Interdits stricts : ombres, glow, dégradés, flou, couleurs d'accent, paiement, profil/compte, nom "Claude" visible, données inventées, anglais.
4. Aucune donnée fictive : afficher de la vraie donnée ou un état vide sobre (sections sidebar masquées si vides).
5. Une seule fonctionnalité par tâche avec annonce d'un plan de 5 lignes max avant de coder.
6. En fin de tâche : exécuter `npm run ui:check`, build, types et lint avec 0 erreur.
7. Mettre à jour docs/FEATURES.md (et docs/UI_ARCHITECTURE.md si ajout) à chaque changement de statut.
