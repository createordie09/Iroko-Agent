export interface FormattedModel {
  id: string;
  name: string;
  note: string;
  providerId: string;
  publisher?: string;
  contextWindow?: number;
  maxOutputTokens?: number;
  capabilities?: any;
  pricing?: any;
  priceTier?: string;
  isCurated?: boolean;
  isFavorite?: boolean;
  isHidden?: boolean;
}

/**
 * Nettoie et formate les libellés de modèles pour éliminer les mentions de marque visibles
 * (notamment le nom "Claude" interdit par les Règles Permanentes v2) tout en préservant
 * les identifiants techniques intacts.
 */
export function formatModelLabel(modelId: string, providerName?: string): FormattedModel {
  const parts = modelId.split('/');
  const rawModel = parts.length > 1 ? parts[parts.length - 1] : parts[0];
  const providerId = parts.length > 1 ? parts[0] : (providerName || 'modèle').toLowerCase();

  let name = rawModel;
  let note = providerName || providerId;

  // Normalisation des libellés connus
  if (rawModel.includes('claude-3-5-sonnet') || rawModel.includes('claude-3.5-sonnet')) {
    name = 'Sonnet 3.5';
    note = 'Anthropic';
  } else if (rawModel.includes('claude-3-5-haiku') || rawModel.includes('claude-3.5-haiku')) {
    name = 'Haiku 3.5';
    note = 'Anthropic';
  } else if (rawModel.includes('claude-3-opus')) {
    name = 'Opus 3';
    note = 'Anthropic';
  } else if (rawModel === 'gpt-4o') {
    name = 'GPT-4o';
    note = 'OpenAI';
  } else if (rawModel === 'gpt-4o-mini') {
    name = 'GPT-4o mini';
    note = 'OpenAI';
  } else if (rawModel.includes('gemini-2.0-flash')) {
    name = 'Gemini 2.0 Flash';
    note = 'Google';
  } else if (rawModel.includes('gemini-1.5-pro')) {
    name = 'Gemini 1.5 Pro';
    note = 'Google';
  } else if (rawModel === 'auto') {
    name = 'Rotation automatique';
    note = 'OpenRouter';
  } else {
    // Nettoyage générique : suppression des mentions "claude" dans l'affichage visible
    name = rawModel
      .replace(/\bclaude-?/gi, '')
      .replace(/-latest$/i, '')
      .replace(/-/g, ' ')
      .trim();
    if (!name) name = rawModel;
    // Capitaliser
    name = name.charAt(0).toUpperCase() + name.slice(1);
  }

  return {
    id: modelId,
    name,
    note,
    providerId
  };
}
