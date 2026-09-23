export interface FormattedModel {
  id: string;
  name: string;
  note: string;
  providerId: string;
  publisher?: string;
  contextWindow?: number;
  maxOutputTokens?: number;
  capabilities?: ModelCapabilities;
  pricing?: {
    promptCostPerToken?: number;
    completionCostPerToken?: number;
    inputPerMillion?: number;
    outputPerMillion?: number;
  };
  priceTier?: 'free' | 'budget' | 'standard' | 'premium';
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
  const rawModel = parts.length > 1 ? parts[1] : parts[0];
  const providerId = parts.length > 1 ? parts[0] : (providerName || 'modèle').toLowerCase();

  let name = rawModel;
  let note = providerName || providerId;

  // Normalisation des libellés sans marque visible
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
    name = rawModel
      .replace(/\bclaude-?/gi, '')
      .replace(/-latest$/i, '')
      .replace(/-/g, ' ')
      .trim();
    if (!name) name = rawModel;
    name = name.charAt(0).toUpperCase() + name.slice(1);
  }

  return {
    id: modelId,
    name,
    note,
    providerId
  };
}

export interface ModelCapabilities {
  vision: boolean;
  nativePdf: boolean;
  audio: boolean;
  video: boolean;
  tools: boolean;
  reasoning: boolean;
  imageGeneration: boolean;
  videoGeneration: boolean;
}

export function getModelCapabilities(modelId: string): ModelCapabilities {
  const m = (modelId || '').toLowerCase();

  // Modèles spécialisés génération d'images
  if (m.includes('dall-e') || m.includes('imagen') || m.includes('flux') || m.includes('midjourney') || m.includes('stable-diffusion')) {
    return {
      vision: false,
      nativePdf: false,
      audio: false,
      video: false,
      tools: false,
      reasoning: false,
      imageGeneration: true,
      videoGeneration: false
    };
  }

  // Modèles spécialisés génération de vidéos
  if (m.includes('veo') || m.includes('sora') || m.includes('runway') || m.includes('kling') || m.includes('cogvideo') || m.includes('luma')) {
    return {
      vision: false,
      nativePdf: false,
      audio: false,
      video: false,
      tools: false,
      reasoning: false,
      imageGeneration: false,
      videoGeneration: true
    };
  }

  // Anthropic
  if (m.includes('claude-3') || m.includes('sonnet') || m.includes('haiku') || m.includes('opus')) {
    return {
      vision: true,
      nativePdf: true,
      audio: false,
      video: false,
      tools: true,
      reasoning: true,
      imageGeneration: false,
      videoGeneration: false
    };
  }

  // Google Gemini
  if (m.includes('gemini')) {
    return {
      vision: true,
      nativePdf: true,
      audio: true,
      video: true,
      tools: true,
      reasoning: true,
      imageGeneration: false,
      videoGeneration: false
    };
  }

  // OpenAI
  if (m.includes('gpt-4o') || m.includes('o1') || m.includes('o3') || m.includes('o4')) {
    return {
      vision: true,
      nativePdf: false,
      audio: m.includes('audio'),
      video: false,
      tools: true,
      reasoning: true,
      imageGeneration: false,
      videoGeneration: false
    };
  }

  // Modèles avec vision explicite
  if (m.includes('vision') || m.includes('-vl') || m.includes('llava') || m.includes('pixtral')) {
    return {
      vision: true,
      nativePdf: false,
      audio: false,
      video: false,
      tools: true,
      reasoning: false,
      imageGeneration: false,
      videoGeneration: false
    };
  }

  // Modèles texte par défaut
  return {
    vision: false,
    nativePdf: false,
    audio: false,
    video: false,
    tools: true,
    reasoning: m.includes('r1') || m.includes('reason'),
    imageGeneration: false,
    videoGeneration: false
  };
}
