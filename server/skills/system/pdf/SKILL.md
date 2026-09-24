---
name: pdf
description: Guide de génération de documents PDF (.pdf) vectoriels via la bibliothèque pdf-lib pour create_document.
metadata:
  category: artifacts
  format: pdf
  library: pdf-lib
---

# Compétence Système : Génération de Documents PDF (.pdf)

Cette compétence assiste l'agent lors de la génération de documents PDF (.pdf) autonomes via l'outil `create_document`.

## Bibliothèque Utilisée
Le générateur backend Iroko (`server/artifacts/DocumentGenerators.ts`) s'appuie exclusivement sur la bibliothèque npm **`pdf-lib`** (v1.x).
Aucun code n'est exécuté par le modèle : vous produisez une spécification JSON transmise à `create_document`.

## Schéma JSON Requis (`spec`)
La spécification transmise au paramètre `spec` de `create_document` doit respecter strictement ce schéma :
```json
{
  "title": "Rapport d'Audit Technique",
  "author": "Iroko Agent",
  "pages": [
    {
      "title": "1. Synthèse Exécutive",
      "paragraphs": [
        "Le présent rapport consigne les conclusions de l'audit technique réalisé sur l'environnement de production.",
        "Tous les indicateurs de sécurité et de conformité sont au vert."
      ],
      "bulletPoints": [
        "Confinement strict des chemins d'accès au workspace",
        "Chiffrement AES-256-GCM des clés d'API au repos",
        "Circuit fermé 100% local sans fuite de télémétrie"
      ]
    },
    {
      "title": "2. Recommandations",
      "paragraphs": [
        "Poursuivre la veille sur les composants tiers et exécuter les suites de tests avant chaque version."
      ]
    }
  ]
}
```

## Règles et Pièges Connus
1. **Gestion manuelle des pages** : Chaque élément du tableau `pages` représente exactement une page A4 physique distincte. Le générateur ne crée pas de saut de page automatique à l'intérieur d'une page.
2. **Capacité par page A4** : Une page A4 peut accueillir environ 3 à 5 paragraphes moyens ou 8 à 10 puces. Découpez votre contenu en plusieurs objets dans `pages` pour éviter le débordement en bas de page.
3. **Police standard Helvetica** : La génération utilise les polices standard PDF Helvetica et Helvetica-Bold (encodage standard WinAnsi / Latin-1). N'utilisez pas d'émojis ou de caractères Unicode rares qui provoqueraient une erreur lors de l'encodage de chaîne.
4. **Au moins une page** : Le tableau `pages` doit contenir au minimum une page (`min(1)`).
5. **Numérotation automatique** : Le générateur ajoute automatiquement un pied de page discret avec la numérotation "Page X / Y".
