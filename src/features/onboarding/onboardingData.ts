export interface ProviderOption {
  id: string;
  name: string;
  description: string;
  docsUrl: string;
  requiresKey: boolean;
  placeholder: string;
}

export const PROVIDER_OPTIONS: ProviderOption[] = [
  {
    id: 'openrouter',
    name: 'OpenRouter',
    description: 'Accès universel à tous les modèles (Anthropic, OpenAI, Meta, Mistral…) avec une seule clé.',
    docsUrl: 'https://openrouter.ai/keys',
    requiresKey: true,
    placeholder: 'sk-or-v1-…'
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Accès direct aux modèles Claude 3.5 Sonnet et Haiku via la console officielle.',
    docsUrl: 'https://console.anthropic.com/settings/keys',
    requiresKey: true,
    placeholder: 'sk-ant-api03-…'
  },
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'Accès direct aux modèles GPT-4o, GPT-4o-mini et modèles de raisonnement.',
    docsUrl: 'https://platform.openai.com/api-keys',
    requiresKey: true,
    placeholder: 'sk-proj-…'
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    description: 'Modèles multimodaux rapides Gemini 2.5 Flash et Gemini Pro via Google AI Studio (clé gratuite disponible).',
    docsUrl: 'https://aistudio.google.com/app/apikey',
    requiresKey: true,
    placeholder: 'AIzaSy…'
  },
  {
    id: 'mistral',
    name: 'Mistral AI',
    description: 'Modèles européens de pointe Mistral Large et Codestral.',
    docsUrl: 'https://console.mistral.ai/api-keys',
    requiresKey: true,
    placeholder: '…'
  },
  {
    id: 'groq',
    name: 'Groq',
    description: 'Inférence ultra-rapide sur puces LPU pour modèles ouverts (Llama 3, Mixtral, clé gratuite disponible).',
    docsUrl: 'https://console.groq.com/keys',
    requiresKey: true,
    placeholder: 'gsk_…'
  },
  {
    id: 'ollama',
    name: 'Ollama (Local)',
    description: 'Exécution 100\u00A0% locale et autonome sur votre machine sans aucune clé distante.',
    docsUrl: 'https://ollama.com',
    requiresKey: false,
    placeholder: 'http://127.0.0.1:11434'
  }
];
