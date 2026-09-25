# Politique de Sécurité et Analyse des Dépendances — Iroko Agent (`docs/SECURITY.md`)

Ce document consigne la politique de sécurité des dépendances d'Iroko Agent, l'état d'audit des paquets de production (`npm audit --omit=dev`), ainsi que l'analyse des risques et les mesures de contournement applicatives.

---

## 1. Principes Fondamentaux de Sécurité des Dépendances

1. **Circuit Fermé & Confinement Local** : Le runtime Iroko s'exécute exclusivement en local (`127.0.0.1`), sans aucune transmission de données ni télémétrie vers des serveurs tiers.
2. **Neutralisation à la Source** : Les entrées utilisateur et les fichiers non fiables sont validés et assainis en amont par des validateurs stricts (`PathSanitizer`, magic bytes, quotas de taille, timeouts).
3. **Zéro Rupture Injustifiée** : Les montées de version majeures cassantes (`--force`) pouvant introduire des régressions fonctionnelles (par exemple l'incompatibilité ESM de `uuid@11` avec `exceljs`) sont rejetées au profit de mitigations applicatives prouvées.

---

## 2. Rapport d'Audit de Production (`npm audit --omit=dev`)

Suite à l'application de `npm audit fix --omit=dev`, 6 vulnérabilités compatibles ont été corrigées automatiquement. Les vulnérabilités résiduelles sont toutes des dépendances indirectes (transitives) sans risque d'exploitation dans le contexte d'Iroko :

| Dépendance | Dépendance parente | Sévérité | Type de vulnérabilité | Risque dans Iroko | Mesure de contournement & Justification |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **uuid** (<11.1.1) | `exceljs` | Modérée | Manque de vérification de bornes sur buffer (`GHSA-w5hq-g745-h8pq`) | **Nul** | `exceljs` est utilisé exclusivement pour la génération de classeurs Excel (`create_document`). Aucun buffer utilisateur brut n'est passé à `uuid`. Le forçage vers `uuid@11` casse le chargement CommonJS (`require`) d'`exceljs`. |
| **tar** (node-tar) | `@mapbox/node-pre-gyp` | Critique | Traversée de chemin / Symlink poisoning (`GHSA-34x7-hfp2-rc4v`) | **Nul** | `node-tar` est un reliquat d'installation native non invoqué à l'exécution. L'extraction des archives dans Iroko utilise `unzipper` et `jszip` avec une validation stricte anti Zip-Slip (`tests/mission_m2.test.mjs` test 3). |
| **image-size** | `pptxgenjs` | Élevée | Boucle infinie / DoS sur parseurs JXL, HEIF, ICNS | **Nul** | `pptxgenjs` est utilisé pour produire des diapositives PowerPoint standard, sans jamais soumettre d'images de formats rares ou non fiables au parseur. |
| **pdfjs-dist** (<=4.1.392) | Dépendance directe | Élevée | Exécution arbitraire de JavaScript dans un visualiseur PDF | **Nul** | `pdfjs-dist` est utilisé côté serveur uniquement pour extraire le texte brut des pièces jointes (`AttachmentReader.ts`). Le moteur s'exécute hors navigateur, sans DOM et avec l'évaluation JavaScript des PDF strictement désactivée. |

---

## 3. Mesures de Défense en Profondeur

1. **Validation Magic Bytes** : Les pièces jointes subissent une vérification de signature binaire réelle avant tout traitement (`magic_bytes.ts`), interdisant le téléversement d'exécutables déguisés en documents ou images.
2. **Confinement des Chemins** : `PathSanitizer` neutralise toute tentative de traversée de répertoire (`..`, liens symboliques, chemins UNC, flux ADS Windows).
3. **Garde Réseau (`NetworkGuard`)** : Interception de tous les appels `globalThis.fetch` avec liste blanche stricte (`docs/NETWORK.md`), empêchant toute exfiltration même en cas de tentative par une dépendance compromise.
