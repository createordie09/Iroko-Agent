---
name: pptx
description: Guide de génération de présentations PowerPoint (.pptx) via la bibliothèque pptxgenjs pour create_document.
metadata:
  category: artifacts
  format: pptx
  library: pptxgenjs
---

# Compétence Système : Génération de Présentations PowerPoint (.pptx)

Cette compétence assiste l'agent lors de la génération de présentations PowerPoint (.pptx) autonomes via l'outil `create_document`.

## Bibliothèque Utilisée
Le générateur backend Iroko (`server/artifacts/DocumentGenerators.ts`) s'appuie exclusivement sur la bibliothèque npm **`pptxgenjs`** (v4.x).
Aucun code n'est exécuté par le modèle : vous produisez une spécification JSON transmise à `create_document`.

## Schéma JSON Requis (`spec`)
La spécification transmise au paramètre `spec` de `create_document` doit respecter strictement ce schéma :
```json
{
  "title": "Stratégie Produit 2026",
  "author": "Iroko Agent",
  "slides": [
    {
      "title": "Stratégie Produit 2026",
      "subtitle": "Feuille de route et objectifs du premier semestre"
    },
    {
      "title": "Priorités Opérationnelles",
      "bullets": [
        "Accélération des déploiements locaux sécurisés",
        "Amélioration des performances d'affichage et réactivité",
        "Extension de la compatibilité des modèles multi-fournisseurs"
      ],
      "textBlocks": [
        "Chaque axe fait l'objet d'un suivi hebdomadaire rigoureux."
      ]
    },
    {
      "title": "Indicateurs Clés",
      "table": {
        "headers": ["Objectif", "Cible", "Échéance"],
        "rows": [
          ["Temps de réponse", "< 1.2s", "T1 2026"],
          ["Taux de succès tests", "100%", "Continu"]
        ]
      }
    }
  ]
}
```

## Règles et Pièges Connus
1. **Diapositive de titre automatique** : La première diapositive est automatiquement mise en page comme diapositive de couverture si elle ne comporte ni `bullets` ni `table`.
2. **Hauteur finie de diapositive (16:9)** : L'espace vertical d'une diapositive est strictement limité (7,5 pouces de hauteur). Trop de texte entraîne un débordement hors de l'écran.
3. **Plafond par diapositive** : Limitez chaque diapositive à **4 à 6 puces** maximum, ou 1 tableau de **6 à 8 lignes** maximum. Répartissez sur plusieurs diapositives si le contenu est dense.
4. **Au moins une diapositive** : Le tableau `slides` doit contenir au minimum une diapositive valide.
5. **Thème visuel sobre** : Le générateur applique une palette sombre sobre et élégante (fond sombre, textes clairs et contrastés).
