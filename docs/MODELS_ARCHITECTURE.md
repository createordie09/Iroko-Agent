# Architecture Fournisseurs & Catalogue de Modèles (`docs/MODELS_ARCHITECTURE.md`)

Ce document constitue la spécification technique et architecturale de référence pour le système multi-fournisseurs et le catalogue normalisé de modèles d'Iroko Code Agent, conformément aux exigences des sections **§10** et **§26** du cahier des charges et aux **Règles Permanentes v2**.

---

## 1. Objectifs & Principes Fondamentaux

1. **Multi-fournisseurs unifié** : Supporter les 12 fournisseurs majeurs du marché (locaux et cloud) au travers d'une couche d'abstraction déclarative et extensible.
2. **Normalisation universelle** : Homogénéiser les formats hétérogènes de modèles dans une structure unique (`ModelInfo`) enrichie de métadonnées fonctionnelles (fenêtre de contexte, capacités multimodales, tarifs réels).
3. **Curation sobre en liste courte** : Offrir par défaut une sélection resserrée, qualitative et diversifiée (max 2 modèles par éditeur par palier), calculée dynamiquement selon des percentiles de prix réels, sans surcharger l'utilisateur avec des centaines de variantes obsolètes.
4. **Disponibilité hors-ligne & Cache SQLite** : Persister le catalogue complet dans la base SQLite locale du runtime (`%APPDATA%/iroko/iroko_runtime.db` ou `~/.iroko/iroko_runtime.db`), permettant l'affichage immédiat sans latence réseau et un rafraîchissement transparent en tâche de fond.
5. **Validation authentifiée rigoureuse** : Toute clé d'API fait l'objet d'un test réel auprès du point d'accès d'authentification dédié du fournisseur avant son activation effective.
6. **Sélection intelligente sans hardcoding** : La sélection du modèle par défaut s'effectue dynamiquement sur la base des métadonnées réelles (modèle favori, support des outils et du raisonnement, capacité de contexte), avec mémorisation par fil de conversation.
7. **Respect strict des Règles Permanentes v2** :
   - Zéro couleur en dur, zéro élément visuel superflu.
   - Zéro nom "Claude" visible dans l'interface utilisateur : les dénominations affichées sont nettoyées via `formatModelLabel` (ex. "Sonnet 3.5" édité par "Anthropic"), tandis que les identifiants techniques sous-jacents demeurent intacts (ex. `anthropic/claude-3-5-sonnet-20241022`).
   - Zéro donnée inventée : seules les données réelles issues des fournisseurs ou un état vide sobre sont manipulés.

---

## 2. Presets des 12 Fournisseurs (`server/models/providers/presets/`)

Chaque fournisseur est modélisé de façon déclarative via une configuration de preset typée (`ProviderPreset`), précisant ses points de terminaison, ses en-têtes d'authentification, sa documentation d'obtention de clés et son adaptateur sous-jacent.

### Tableau Comparatif des 12 Presets

| # | Identifiant (`id`) | Nom affiché (`name`) | Base URL par défaut | Endpoint de validation de clé | Type d'adaptateur | Documentation officielle de clé |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | `openrouter` | OpenRouter | `https://openrouter.ai/api/v1` | `GET /auth/key` *(Auth obligatoire)* | `OpenAICompatible` | `https://openrouter.ai/keys` |
| **2** | `openai` | OpenAI | `https://api.openai.com/v1` | `GET /models` | `OpenAI` | `https://platform.openai.com/api-keys` |
| **3** | `anthropic` | Anthropic | `https://api.anthropic.com/v1` | `GET /models` | `Anthropic` | `https://console.anthropic.com/settings/keys` |
| **4** | `gemini` | Google Gemini | `https://generativelanguage.googleapis.com/v1beta` | `GET /models?key={key}` | `Gemini` | `https://aistudio.google.com/app/apikey` |
| **5** | `mistral` | Mistral AI | `https://api.mistral.ai/v1` | `GET /models` | `OpenAICompatible` | `https://console.mistral.ai/api-keys` |
| **6** | `groq` | Groq | `https://api.groq.com/openai/v1` | `GET /models` | `OpenAICompatible` | `https://console.groq.com/keys` |
| **7** | `deepseek` | DeepSeek | `https://api.deepseek.com` | `GET /models` | `OpenAICompatible` | `https://platform.deepseek.com/api_keys` |
| **8** | `xai` | xAI (Grok) | `https://api.x.ai/v1` | `GET /models` | `OpenAICompatible` | `https://console.x.ai/` |
| **9** | `together` | Together AI | `https://api.together.xyz/v1` | `GET /models` | `OpenAICompatible` | `https://api.together.ai/settings/api-keys` |
| **10** | `ollama` | Ollama (Local) | `http://localhost:11434` | `GET /api/tags` *(Sans auth)* | `Ollama` | `https://ollama.com/` |
| **11** | `lmstudio` | LM Studio (Local) | `http://localhost:1234/v1` | `GET /models` *(Sans auth)* | `OpenAICompatible` | `https://lmstudio.ai/` |
| **12** | `custom` | Personnalisé | Configurable | `GET /models` | `OpenAICompatible` | Manuel / Serveur local |

### Spécificité Critique : Validation OpenRouter

Contrairement à la majorité des services OpenAI-compatibles, le point de terminaison `GET https://openrouter.ai/api/v1/models` d'OpenRouter est **public** et renvoie un code HTTP 200 même si la clé fournie est inexistante ou révoquée.
Par conséquent, la validation authentifiée d'OpenRouter doit obligatoirement interroger le point de terminaison d'authentification dédié :
- **Requête** : `GET https://openrouter.ai/api/v1/auth/key`
- **En-tête** : `Authorization: Bearer <clé>`
- **Réponse valide (200)** : Contient les métadonnées de la clé (`label`, `usage`, `limit`, `is_free_tier`).
- **Réponse invalide (401)** : Clé rejetée avec diagnostic explicite.

---

## 3. Cycle de Vie et Statuts des Fournisseurs

Chaque fournisseur dispose d'un statut opérationnel calculé en direct d'après l'état de ses clés dans le trousseau chiffré AES-256-GCM :

```
┌─────────────────┐
│ NOT_CONFIGURED  │ (Aucune clé enregistrée ni URL configurée)
└────────┬────────┘
         │ Clé ajoutée par l'utilisateur
         ▼
┌─────────────────┐
│   CONFIGURED    │ (Clé présente mais non encore testée)
└────────┬────────┘
         │ Lancement de la validation HTTP
         ▼
┌─────────────────┐
│   VALIDATING    │ (Appel réseau en cours vers le point de test)
└────────┬────────┘
         ├──────────────────────────────┐
         │ Succès (200 OK)              │ Échec (401, 403, réseau)
         ▼                              ▼
┌─────────────────┐            ┌─────────────────┐
│      READY      │            │      ERROR      │
└────────┬────────┘            └─────────────────┘
         │
         │ Réception d'une erreur 429 lors d'un appel
         ▼
┌─────────────────┐
│  RATE_LIMITED   │ (Cooldown temporaire avec jitter avant retour en READY)
└─────────────────┘
```

- **`NOT_CONFIGURED`** : Aucune information de connexion.
- **`CONFIGURED`** : Clé enregistrée dans le trousseau local chiffré.
- **`VALIDATING`** : Validation de connectivité et d'authentification en cours.
- **`READY`** : Au moins une clé active validée avec succès ; modèles disponibles pour le chat et l'agent.
- **`RATE_LIMITED`** : Clé temporairement mise en quarantaine suite à un dépassement de quota (cooldown exponentiel).
- **`ERROR`** : Erreur bloquante (clé invalide, accès interdit, hôte inaccessible).

---

## 4. Schéma Normalisé de Données (`ModelInfo`)

L'interface normalisée `ModelInfo` décrit tout modèle de langage disponible pour le runtime :

```typescript
export type ModelPriceTier = 'free' | 'budget' | 'standard' | 'premium';

export interface ModelPricing {
  promptCostPerToken?: number;     // Ex: 0.000003 ($/token)
  completionCostPerToken?: number; // Ex: 0.000015 ($/token)
  inputPerMillion?: number;        // Ex: 3.00 ($/M tokens)
  outputPerMillion?: number;       // Ex: 15.00 ($/M tokens)
}

export interface ModelInfo {
  id: string;                     // Identifiant global canonique (ex: "openrouter/anthropic/claude-3.5-sonnet")
  providerId: string;             // Id du fournisseur ("anthropic", "openrouter", "openai"...)
  rawId: string;                  // Id natif chez le fournisseur (ex: "claude-3-5-sonnet-20241022")
  name: string;                   // Nom d'affichage normalisé conforme aux règles (sans "Claude")
  description?: string;           // Description sobre du modèle
  publisher: string;              // Éditeur ("Anthropic", "OpenAI", "Google", "Meta", "Mistral"...)
  contextWindow: number;          // Taille maximale du contexte en tokens (ex: 200000)
  maxOutputTokens?: number;       // Plafond de tokens de sortie (ex: 8192)
  capabilities: {
    vision: boolean;              // Support de l'analyse d'images
    nativePdf: boolean;           // Analyse native de documents PDF
    audio: boolean;               // Support audio
    video: boolean;               // Support vidéo
    tools: boolean;               // Support du Function Calling / Outils agentiques
    reasoning: boolean;           // Support du mode raisonnement / thinking
  };
  pricing?: ModelPricing;         // Tarification réelle communiquée par le fournisseur
  priceTier: ModelPriceTier;      // Palier calculé dynamiquement
  isCurated: boolean;             // Inclus dans la liste courte par défaut
  isFavorite: boolean;            // Marqué comme favori par l'utilisateur
  isHidden: boolean;              // Masqué par l'utilisateur
  lastSeenAt: number;             // Timestamp du dernier recensement
}
```

### Détection des Capacités (`getModelCapabilities`)
Les capacités sont déduites dynamiquement des identifiants et métadonnées réelles :
- **Vision** : modèles contenant `-vl`, `vision`, `4o`, `gemini`, `pixtral`, `sonnet`, `opus`, `haiku`.
- **Outils (`tools`)** : modèles généralistes avec support de function calling vérifié (exclus : modèles de base purs text-completion).
- **Raisonnement (`reasoning`)** : modèles `o1`, `o3`, `o4`, `r1`, `reasoning`, ou avec budget de thinking paramétrable (Gemini 2.0, Claude 3.7).

---

## 5. Persistance SQLite : Table `model_catalog`

La table `model_catalog` est créée via la migration SQLite de version **13** dans `RuntimeDatabase.ts`.

### Schéma DDL

```sql
CREATE TABLE IF NOT EXISTS model_catalog (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  raw_id TEXT NOT NULL,
  name TEXT NOT NULL,
  publisher TEXT NOT NULL,
  description TEXT,
  context_window INTEGER NOT NULL DEFAULT 4096,
  max_output_tokens INTEGER,
  capabilities_json TEXT NOT NULL,
  pricing_json TEXT,
  price_tier TEXT NOT NULL DEFAULT 'standard',
  is_curated INTEGER NOT NULL DEFAULT 0,
  is_favorite INTEGER NOT NULL DEFAULT 0,
  is_hidden INTEGER NOT NULL DEFAULT 0,
  last_refreshed_at TEXT NOT NULL,
  raw_metadata_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_model_catalog_provider ON model_catalog(provider_id);
CREATE INDEX IF NOT EXISTS idx_model_catalog_curated ON model_catalog(is_curated);
CREATE INDEX IF NOT EXISTS idx_model_catalog_tier ON model_catalog(price_tier);
CREATE INDEX IF NOT EXISTS idx_model_catalog_favorite ON model_catalog(is_favorite);
```

### Politiques de Rafraîchissement du Cache

1. **Au démarrage du runtime** : Le catalogue est servi instantanément depuis SQLite sans attente réseau.
2. **Rafraîchissement automatique en arrière-plan** :
   - Fournisseurs avec clés configurées : toutes les **6 heures**.
   - Fournisseurs publics / OpenRouter : toutes les **24 heures**.
3. **Rafraîchissement immédiat** :
   - Déclenché lors de l'ajout ou du test réussi d'une clé d'API.
   - Déclenché sur appel explicite du point `POST /api/models/refresh`.

---

## 6. Algorithme de Curation en Liste Courte

Pour éviter la saturation de l'interface par des milliers de modèles non adaptés (embeddings, text-to-speech, versions obsolètes), le gestionnaire `ModelCatalogManager` applique un pipeline de filtrage et de curation déterministe.

### Constantes de Curation Centralisées (`curationConstants.ts`)

```typescript
export const CURATION_LIMITS = {
  MAX_FREE_MODELS: 5,
  MAX_BUDGET_MODELS: 4,
  MAX_STANDARD_MODELS: 4,
  MAX_PREMIUM_MODELS: 3,
  MAX_MODELS_PER_PUBLISHER_PER_TIER: 2,
  BACKGROUND_REFRESH_ACTIVE_HOURS: 6,
  BACKGROUND_REFRESH_PUBLIC_HOURS: 24
};
```

### Étapes du Pipeline de Curation

1. **Filtrage des fonctionnalités non conversationnelles** :
   - Exclusion stricte des modèles contenant : `embed`, `tts`, `whisper`, `dall-e`, `moderation`, `rerank`, `edit`, `transcription`.
2. **Déduplication des versions** :
   - Lorsqu'un modèle existe sous plusieurs déclinaisons d'horodatage (ex: `claude-3-5-sonnet-20240620` vs `claude-3-5-sonnet-20241022`), seule la révision canonique la plus récente est retenue.
3. **Classification Dynamique des Tiers de Prix** :
   - `free` : Tarif d'entrée strictement nul (`inputPerMillion === 0 && outputPerMillion === 0`) ou modèles locaux (`ollama`, `lmstudio`).
   - Pour les modèles payants (notamment OpenRouter qui expose les prix réels) :
     * Calcul de la distribution médiane et des quartiles sur le coût combiné (`inputPerMillion + 2 * outputPerMillion`).
     * `budget` : Quartile inférieur (modèles légers et économiques).
     * `standard` : Quartiles intermédiaires (modèles de production équilibrés).
     * `premium` : Quartile supérieur (modèles frontière et à fort raisonnement).
4. **Application des Quotas de Curation** :
   - Remplissage de chaque palier dans la limite des quotas `CURATION_LIMITS`.
   - Garantie de diversité : **maximum 2 modèles par éditeur** au sein d'un même palier.

---

## 7. Spécification des Points de Terminaison API & Événements

### Points d'Accès REST (`server/index.ts`)

#### `GET /api/providers`
Renvoie la liste des 12 fournisseurs avec leurs métadonnées, état de configuration, et liens documentaires.
```json
{
  "providers": [
    {
      "id": "openrouter",
      "name": "OpenRouter",
      "status": "READY",
      "keyCount": 1,
      "activeKeys": 1,
      "modelsCount": 42,
      "docsUrl": "https://openrouter.ai/keys",
      "isLocal": false
    },
    ...
  ],
  "defaultProvider": { "id": "openrouter", "name": "OpenRouter" }
}
```

#### `GET /api/models`
Paramètres acceptés :
- `provider` (optionnel) : Filtrer sur un fournisseur spécifique.
- `view` (optionnel) : `short` (sélection curée, défaut) ou `all` (catalogue exhaustif).
- `q` (optionnel) : Recherche textuelle sur le nom, l'identifiant ou l'éditeur.

```json
{
  "models": [
    {
      "id": "openrouter/anthropic/claude-3.5-sonnet",
      "providerId": "openrouter",
      "name": "Sonnet 3.5",
      "publisher": "Anthropic",
      "priceTier": "standard",
      "contextWindow": 200000,
      "isCurated": true,
      "isFavorite": false,
      "capabilities": { "vision": true, "tools": true, "reasoning": true }
    }
  ],
  "total": 1,
  "view": "short"
}
```

#### `POST /api/models/refresh`
Déclenche une actualisation forcée du catalogue.
- Corps (optionnel) : `{ "providerId": "openrouter" }`
- Réponse : `{ "success": true, "refreshedCount": 120, "timestamp": "..." }`

#### `PUT /api/models/preferences`
Mise à jour des préférences utilisateur pour un modèle donné.
- Corps : `{ "modelId": "...", "isFavorite": true, "isHidden": false }`
- Réponse : `{ "success": true, "modelId": "...", "preferences": { ... } }`

### Événements WebSocket

- **`providers_changed`** : Émis immédiatement lors de l'ajout, la modification, la suppression ou le changement d'état d'une clé de fournisseur.
- **`catalog_updated`** : Émis à la fin de chaque synchronisation du catalogue de modèles avec le nombre de modèles actualisés.

---

## 8. Sélection Intelligente par Défaut

La sélection du modèle actif est ordonnée par des règles basées exclusivement sur les métadonnées réelles, **sans aucun identifiant hardcodé dans le code source** :

1. **Modèle de la conversation** : Si la conversation en cours a déjà un modèle associé mémorisé en base (`conversations.metadata.selected_model_id`), celui-ci est prioritaire tant que son fournisseur est opérationnel.
2. **Favori utilisateur disponible** : Si l'utilisateur a marqué un modèle en favori (`is_favorite = 1`) et que son fournisseur est au statut `READY`, il est sélectionné en premier.
3. **Modèle de pointe équilibré** :
   - Appartenance à la sélection curée (`is_curated = 1`).
   - Support des outils agentiques (`tools = true`).
   - Support du raisonnement (`reasoning = true`).
   - Contexte étendu (`contextWindow >= 128000`).
   - Palier `standard` ou `budget`.
4. **Premier modèle fonctionnel** : Tout modèle de chat valide du premier fournisseur connecté.
5. **Repli hors-ligne (Mock)** : Si aucun fournisseur n'a de clé configurée, le moteur hors-ligne local prend le relais sobrement.

---

## 9. Matrice de Traitement des Erreurs Réelles

Le classifieur d'erreurs `ErrorClassifier.ts` normalise les retours HTTP et réseau :

| Code HTTP / Erreur | Catégorie Normalisée | Action Immédiate sur la Clé | Repli (Fallback) |
| :--- | :--- | :--- | :--- |
| **401 Unauthorized** | `AUTH_ERROR` | Clé marquée `INVALID`, exclue du pool | Essai de la clé suivante du même fournisseur |
| **403 Forbidden** | `PERMISSION_ERROR` / `QUOTA_EXHAUSTED` | Clé désactivée ou marquée épuisée | Essai de la clé suivante |
| **429 Too Many Requests** | `RATE_LIMIT` | Clé placée en `COOLDOWN` (30s à 5 min exponentiel) | Rotation immédiate vers une clé saine |
| **500, 502, 503, 504** | `TEMPORARY_PROVIDER_ERROR` | Incrément échec, temporisation brève | Repli cross-provider selon `fallbackPolicy` |
| **Timeout / ECONNREFUSED** | `NETWORK_ERROR` | Quarantaine temporaire si répété | Alerte réseau sobre, reconnexion |

---

## 10. Stratégie de Test et Mocks Déterministes

La suite de tests `tests/mission_m10_2.test.mjs` garantit la fiabilité du dispositif sans aucune dépendance externe :
1. **Serveur HTTP de Mock Local Déterministe** :
   - Écoute sur port éphémère local.
   - Simulation des endpoints d'authentification (`/auth/key` pour OpenRouter avec cas valide vs invalide).
   - Simulation des listes de modèles pour chaque fournisseur.
2. **Couverture des scénarios clés** :
   - Échec de validation OpenRouter avec mauvaise clé alors que `/models` renvoie 200.
   - Calcul mathématique déterministe des percentiles de prix pour la classification en tiers.
   - Respect strict des plafonds de curation (max 2 modèles par éditeur par palier).
   - Persistance et relecture dans la table SQLite `model_catalog`.
   - Émission des événements WebSocket `providers_changed` et `catalog_updated`.
   - Reconstitution de la liste depuis le cache SQLite en mode hors-ligne sans connexion réseau.
