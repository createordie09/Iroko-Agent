---
name: xlsx
description: Guide de génération de feuilles de calcul Excel (.xlsx) via la bibliothèque exceljs pour create_document.
metadata:
  category: artifacts
  format: xlsx
  library: exceljs
---

# Compétence Système : Génération de Tableurs Excel (.xlsx)

Cette compétence assiste l'agent lors de la génération de classeurs Excel (.xlsx) autonomes via l'outil `create_document`.

## Bibliothèque Utilisée
Le générateur backend Iroko (`server/artifacts/DocumentGenerators.ts`) s'appuie exclusivement sur la bibliothèque npm **`exceljs`** (v4.x).
Aucun code n'est exécuté par le modèle : vous produisez une spécification JSON transmise à `create_document`.

## Schéma JSON Requis (`spec`)
La spécification transmise au paramètre `spec` de `create_document` doit respecter strictement ce schéma :
```json
{
  "title": "Classeur financier (optionnel)",
  "sheets": [
    {
      "name": "Ventes 2026",
      "headers": ["Référence", "Désignation", "Quantité", "Prix unitaire (€)", "Total (€)"],
      "rows": [
        ["REF-001", "Licence Standard", 5, 299.0, 1495.0],
        ["REF-002", "Support Annuel", 2, 450.0, 900.0]
      ]
    },
    {
      "name": "Synthèse",
      "headers": ["Indicateur", "Valeur"],
      "rows": [
        ["Chiffre d'affaires", 2395.0],
        ["Statut", "Validé"]
      ]
    }
  ]
}
```

## Règles et Pièges Connus
1. **Nom de feuille limité à 31 caractères** : Excel interdit formellement les noms d'onglets de plus de 31 caractères. Les noms plus longs provoquent une erreur ou sont tronqués.
2. **Caractères interdits dans les noms d'onglets** : Ne jamais utiliser `\`, `/`, `?`, `*`, `[`, `]`, ni `:` dans `name`.
3. **Noms de feuilles uniques** : Deux onglets d'un même classeur ne peuvent pas avoir le même nom.
4. **Au moins une feuille** : Le tableau `sheets` doit contenir au minimum une feuille avec un `name` non vide.
5. **Types de données dans les cellules** : Privilégiez les nombres (`number`) pour les montants et quantités afin de permettre les calculs dans Excel.
6. **Plafond de taille et performance** : Recommandé jusqu'à 5000 lignes par feuille en mode interactif pour préserver la mémoire et le temps de génération.
