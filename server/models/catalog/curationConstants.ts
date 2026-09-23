export const CURATION_LIMITS = {
  MAX_FREE_MODELS: 5,
  MAX_BUDGET_MODELS: 4,
  MAX_STANDARD_MODELS: 4,
  MAX_PREMIUM_MODELS: 3,
  MAX_MODELS_PER_PUBLISHER_PER_TIER: 2,
  BACKGROUND_REFRESH_ACTIVE_HOURS: 6,
  BACKGROUND_REFRESH_PUBLIC_HOURS: 24
};

export const EXCLUDED_MODEL_KEYWORDS = [
  'embed',
  'embedding',
  'tts',
  'whisper',
  'dall-e',
  'moderation',
  'rerank',
  'edit',
  'transcription',
  'audio-preview',
  'realtime',
  'babbage',
  'davinci',
  'curie'
];

export function normalizePublisher(raw: string, providerId: string): string {
  const p = (raw || '').toLowerCase().trim();
  if (p.includes('anthropic')) return 'Anthropic';
  if (p.includes('openai')) return 'OpenAI';
  if (p.includes('google')) return 'Google';
  if (p.includes('meta') || p.includes('llama')) return 'Meta';
  if (p.includes('deepseek')) return 'DeepSeek';
  if (p.includes('mistral')) return 'Mistral';
  if (p.includes('qwen') || p.includes('alibaba')) return 'Alibaba';
  if (p.includes('x-ai') || p.includes('xai') || p.includes('grok')) return 'xAI';
  if (p.includes('microsoft')) return 'Microsoft';
  if (p.includes('cohere')) return 'Cohere';
  if (p.includes('amazon') || p.includes('nova')) return 'Amazon';

  // Fallback sur le nom du provider
  switch (providerId.toLowerCase()) {
    case 'anthropic': return 'Anthropic';
    case 'openai': return 'OpenAI';
    case 'gemini': return 'Google';
    case 'mistral': return 'Mistral';
    case 'deepseek': return 'DeepSeek';
    case 'xai': return 'xAI';
    case 'groq': return 'Groq';
    case 'ollama': return 'Local';
    case 'lmstudio': return 'Local';
    default: return raw ? (raw.charAt(0).toUpperCase() + raw.slice(1)) : 'Autre';
  }
}
