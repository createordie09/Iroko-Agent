# Destinations Réseau Autorisées et Télémétrie (`docs/NETWORK.md`)

Ce document recense la liste **exhaustive et fermée** des destinations réseau sortantes possibles pour Iroko Code Agent (§26).
Conformément aux Règles Permanentes v2, **aucune télémétrie**, métrique d'utilisation ou donnée analytique n'est collectée ni transmise. Tout est strictement local sauf les requêtes explicitement initiées par l'utilisateur vers des modèles distants configurés.

---

## 1. Liste Exhaustive des Destinations Réseau Sortantes

| Catégorie | Hôte / Domaine / Protocole | Justification & Rôle |
| :--- | :--- | :--- |
| **Fournisseur Anthropic** | `api.anthropic.com` (HTTPS / 443) | Appels d'inférence vers les modèles Claude configurés avec une clé `sk-ant-...`. |
| **Fournisseur OpenAI** | `api.openai.com` (HTTPS / 443) | Appels d'inférence vers les modèles OpenAI configurés avec une clé `sk-...`. |
| **Fournisseur Google Gemini** | `generativelanguage.googleapis.com` (HTTPS / 443) | Appels d'inférence vers les modèles Gemini configurés avec une clé `AIza...`. |
| **Fournisseur OpenRouter** | `openrouter.ai` (HTTPS / 443) | Passerelle multi-fournisseurs configurée avec une clé `sk-or-...`. |
| **Fournisseurs Médias (Images & Vidéos)** | `api.cloudflare.com`, `api.replicate.com`, `queue.fal.run` (HTTPS / 443) | Appels de génération d'images et vidéos configurés explicitement avec une clé d'API par l'utilisateur. |
| **Fournisseurs Locaux** | `127.0.0.1`, `localhost` (HTTP / ports 11434, 1234, etc.) | Appels vers des serveurs d'inférence locaux auto-hébergés (Ollama, LM Studio). |
| **Fournisseur Personnalisé** | URL explicite saisie par l'utilisateur | Point de terminaison compatible OpenAI saisi manuellement dans les paramètres. |
| **Serveurs MCP (Model Context Protocol)** | `127.0.0.1`, `localhost` (stdio ou SSE local), ou URL configurée | Serveurs d'outils locaux ou distants explicitement configurés par l'utilisateur. |
| **Web Speech API (Navigateur)** | Services vocaux natifs du système hôte ou du navigateur | Reconnaissance vocale (dictée) et synthèse vocale gérées directement par le moteur du navigateur (ex. Google Speech Services, Apple Speech, Windows Speech). |

---

## 2. Garanties Fondamentales de Confidentialité

1. **Zéro Télémétrie** : Aucun ping, événement analytique, rapport de crash externe ou collecte de métriques n'est émis.
2. **Local par Défaut** : Les discussions, la mémoire de projet, les paramètres et les journaux restent confinés dans le dossier de données du runtime local (`~/.iroko` ou `%APPDATA%/iroko`).
3. **Chiffrement au Repos** : Les clés d'API sont chiffrées avec AES-256-GCM. La clé maîtresse est stockée sur la machine de l'utilisateur, hors du dépôt.
4. **Contrôle Réseau Automatisé** : Tout appel vers un domaine non répertorié dans ce document déclenche une violation de conformité lors des tests de régression (`tests/privacy_and_capabilities.test.mjs`).
