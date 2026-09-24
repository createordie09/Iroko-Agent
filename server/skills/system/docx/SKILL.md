---
name: docx
description: Guide de génération de documents Word (.docx) via la bibliothèque docx pour create_document.
metadata:
  category: artifacts
  format: docx
  library: docx
---

# Compétence Système : Génération de Documents Word (.docx)

Cette compétence assiste l'agent lors de la génération de documents bureautiques Word (.docx) autonomes via l'outil `create_document`.

## Bibliothèque Utilisée
Le générateur backend Iroko (`server/artifacts/DocumentGenerators.ts`) s'appuie exclusivement sur la bibliothèque npm **`docx`** (v9.x).
Aucun code n'est exécuté par le modèle : vous produisez une spécification JSON transmise à `create_document`.

## Schéma JSON Requis (`spec`)
La spécification transmise au paramètre `spec` de `create_document` doit respecter strictement ce schéma :
```json
{
  "title": "Titre principal du document (obligatoire)",
  "description": "Sous-titre ou description contextuelle (optionnel)",
  "sections": [
    {
      "heading": "Titre de section (Heading 1/2)",
      "paragraphs": [
        "Premier paragraphe de texte brut...",
        "Deuxième paragraphe..."
      ],
      "bulletPoints": [
        "Premier point de liste",
        "Deuxième point de liste"
      ],
      "table": {
        "headers": ["Colonne A", "Colonne B", "Colonne C"],
        "rows": [
          ["Valeur A1", "Valeur B1", 120],
          ["Valeur A2", "Valeur B2", 240]
        ]
      }
    }
  ]
}
```

## Règles et Pièges Connus
1. **Titre obligatoire** : Le champ `title` à la racine est obligatoire et ne doit pas être une chaîne vide (validation Zod `min(1)`).
2. **Au moins une section** : Le tableau `sections` doit contenir au minimum un élément valide.
3. **Tableaux cohérents** : Si un tableau est spécifié, chaque ligne (`row`) doit avoir un nombre d'éléments cohérent avec la liste `headers`. Les valeurs acceptées dans les cellules sont des chaînes, nombres, booléens ou null.
4. **Pas de HTML ni Markdown brut dans les chaînes** : Les paragraphes sont injectés directement comme texte OpenXML. Ne mettez pas de balises HTML (`<b>`, `<p>`) ni de syntaxe markdown non interprétée.
5. **Plafond de taille** : La taille maximale d'un artéfact généré est plafonnée à 50 Mo par le runtime. Privilégiez des documents synthétiques et structurés.
