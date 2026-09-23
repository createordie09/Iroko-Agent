import { ProviderPreset } from './types';

export * from './types';

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'openrouter',
    name: 'OpenRouter',
    description: 'Agrégateur multi-modèles avec tarification unifiée et accès universel.',
    baseUrl: 'https://openrouter.ai/api/v1',
    isLocal: false,
    requiresKey: true,
    docsUrl: 'https://openrouter.ai/keys',
    defaultModel: 'anthropic/claude-3.5-sonnet',
    modelsEndpoint: '/models',
    validation: {
      endpoint: '/auth/key',
      method: 'GET',
      headers: (key: string) => ({
        'Authorization': `Bearer ${key}`,
        'HTTP-Referer': 'https://iroko-agent.local',
        'X-Title': 'Iroko Code Agent'
      }),
      parseResponse: (data: any, res: Response) => {
        if (!res.ok) {
          return { valid: false, error: data?.error?.message || `Erreur OpenRouter (${res.status})` };
        }
        return { valid: true };
      }
    },
    curatedModels: [
      {
        id: 'openrouter/anthropic/claude-3.5-sonnet',
        name: 'Sonnet 3.5',
        publisher: 'Anthropic',
        contextWindow: 200000,
        maxOutputTokens: 8192,
        priceTier: 'standard',
        capabilities: { vision: true, nativePdf: true, audio: false, video: false, tools: true, reasoning: true },
        description: 'Modèle de référence pour le raisonnement et le code.'
      },
      {
        id: 'openrouter/openai/gpt-4o',
        name: 'GPT-4o',
        publisher: 'OpenAI',
        contextWindow: 128000,
        maxOutputTokens: 4096,
        priceTier: 'standard',
        capabilities: { vision: true, nativePdf: false, audio: false, video: false, tools: true, reasoning: true },
        description: 'Modèle multimodal équilibré et rapide.'
      },
      {
        id: 'openrouter/google/gemini-2.0-flash-001',
        name: 'Gemini 2.0 Flash',
        publisher: 'Google',
        contextWindow: 1000000,
        maxOutputTokens: 8192,
        priceTier: 'budget',
        capabilities: { vision: true, nativePdf: true, audio: true, video: true, tools: true, reasoning: true },
        description: 'Grande fenêtre de contexte et rapidité.'
      },
      {
        id: 'openrouter/deepseek/deepseek-chat',
        name: 'DeepSeek-V3',
        publisher: 'DeepSeek',
        contextWindow: 64000,
        maxOutputTokens: 4096,
        priceTier: 'budget',
        capabilities: { vision: false, nativePdf: false, audio: false, video: false, tools: true, reasoning: false },
        description: 'Excellente efficacité générale et coût minime.'
      }
    ]
  },
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'Modèles GPT-4o, GPT-4o mini, o1 et o3-mini.',
    baseUrl: 'https://api.openai.com/v1',
    isLocal: false,
    requiresKey: true,
    docsUrl: 'https://platform.openai.com/api-keys',
    defaultModel: 'gpt-4o',
    modelsEndpoint: '/models',
    validation: {
      endpoint: '/models',
      method: 'GET',
      headers: (key: string) => ({ 'Authorization': `Bearer ${key}` }),
      parseResponse: (data: any, res: Response) => {
        if (!res.ok) {
          return { valid: false, error: data?.error?.message || `Erreur OpenAI (${res.status})` };
        }
        const models = Array.isArray(data?.data) ? data.data.map((m: any) => m.id) : [];
        return { valid: true, modelsAvailable: models.slice(0, 10) };
      }
    },
    curatedModels: [
      {
        id: 'openai/gpt-4o',
        name: 'GPT-4o',
        publisher: 'OpenAI',
        contextWindow: 128000,
        maxOutputTokens: 4096,
        priceTier: 'standard',
        capabilities: { vision: true, nativePdf: false, audio: false, video: false, tools: true, reasoning: true }
      },
      {
        id: 'openai/gpt-4o-mini',
        name: 'GPT-4o mini',
        publisher: 'OpenAI',
        contextWindow: 128000,
        maxOutputTokens: 4096,
        priceTier: 'budget',
        capabilities: { vision: true, nativePdf: false, audio: false, video: false, tools: true, reasoning: true }
      },
      {
        id: 'openai/o3-mini',
        name: 'o3-mini',
        publisher: 'OpenAI',
        contextWindow: 200000,
        maxOutputTokens: 65536,
        priceTier: 'budget',
        capabilities: { vision: false, nativePdf: false, audio: false, video: false, tools: true, reasoning: true }
      }
    ]
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Modèles Sonnet 3.5, Haiku 3.5 et Opus 3.',
    baseUrl: 'https://api.anthropic.com/v1',
    isLocal: false,
    requiresKey: true,
    docsUrl: 'https://console.anthropic.com/settings/keys',
    defaultModel: 'claude-3-5-sonnet-20241022',
    modelsEndpoint: '/models',
    validation: {
      endpoint: '/models',
      method: 'GET',
      headers: (key: string) => ({
        'x-api-key': key,
        'anthropic-version': '2023-06-01'
      }),
      parseResponse: (data: any, res: Response) => {
        if (!res.ok) {
          return { valid: false, error: data?.error?.message || `Erreur Anthropic (${res.status})` };
        }
        const models = Array.isArray(data?.data) ? data.data.map((m: any) => m.id) : [];
        return { valid: true, modelsAvailable: models.slice(0, 10) };
      }
    },
    curatedModels: [
      {
        id: 'anthropic/claude-3-5-sonnet-20241022',
        name: 'Sonnet 3.5',
        publisher: 'Anthropic',
        contextWindow: 200000,
        maxOutputTokens: 8192,
        priceTier: 'standard',
        capabilities: { vision: true, nativePdf: true, audio: false, video: false, tools: true, reasoning: true }
      },
      {
        id: 'anthropic/claude-3-5-haiku-20241022',
        name: 'Haiku 3.5',
        publisher: 'Anthropic',
        contextWindow: 200000,
        maxOutputTokens: 8192,
        priceTier: 'budget',
        capabilities: { vision: true, nativePdf: false, audio: false, video: false, tools: true, reasoning: false }
      }
    ]
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    description: 'Modèles Gemini 2.0 Flash, Gemini 1.5 Pro et Flash.',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    isLocal: false,
    requiresKey: true,
    docsUrl: 'https://aistudio.google.com/app/apikey',
    defaultModel: 'gemini-2.0-flash',
    modelsEndpoint: '/models',
    validation: {
      endpoint: '/models',
      method: 'GET',
      buildUrl: (base: string, key: string) => `${base}/models?key=${encodeURIComponent(key)}`,
      parseResponse: (data: any, res: Response) => {
        if (!res.ok) {
          return { valid: false, error: data?.error?.message || `Erreur Gemini (${res.status})` };
        }
        const models = Array.isArray(data?.models) ? data.models.map((m: any) => m.name.replace('models/', '')) : [];
        return { valid: true, modelsAvailable: models.slice(0, 10) };
      }
    },
    curatedModels: [
      {
        id: 'gemini/gemini-2.0-flash',
        name: 'Gemini 2.0 Flash',
        publisher: 'Google',
        contextWindow: 1000000,
        maxOutputTokens: 8192,
        priceTier: 'budget',
        capabilities: { vision: true, nativePdf: true, audio: true, video: true, tools: true, reasoning: true }
      },
      {
        id: 'gemini/gemini-1.5-pro',
        name: 'Gemini 1.5 Pro',
        publisher: 'Google',
        contextWindow: 2000000,
        maxOutputTokens: 8192,
        priceTier: 'standard',
        capabilities: { vision: true, nativePdf: true, audio: true, video: true, tools: true, reasoning: true }
      }
    ]
  },
  {
    id: 'mistral',
    name: 'Mistral AI',
    description: 'Modèles européens haute performance Mistral Large, Pixtral et Codestral.',
    baseUrl: 'https://api.mistral.ai/v1',
    isLocal: false,
    requiresKey: true,
    docsUrl: 'https://console.mistral.ai/api-keys',
    defaultModel: 'mistral-large-latest',
    modelsEndpoint: '/models',
    validation: {
      endpoint: '/models',
      method: 'GET',
      headers: (key: string) => ({ 'Authorization': `Bearer ${key}` }),
      parseResponse: (data: any, res: Response) => {
        if (!res.ok) {
          return { valid: false, error: data?.error?.message || `Erreur Mistral (${res.status})` };
        }
        const models = Array.isArray(data?.data) ? data.data.map((m: any) => m.id) : [];
        return { valid: true, modelsAvailable: models.slice(0, 10) };
      }
    },
    curatedModels: [
      {
        id: 'mistral/mistral-large-latest',
        name: 'Mistral Large',
        publisher: 'Mistral',
        contextWindow: 128000,
        maxOutputTokens: 4096,
        priceTier: 'standard',
        capabilities: { vision: false, nativePdf: false, audio: false, video: false, tools: true, reasoning: false }
      },
      {
        id: 'mistral/codestral-latest',
        name: 'Codestral',
        publisher: 'Mistral',
        contextWindow: 32000,
        maxOutputTokens: 4096,
        priceTier: 'budget',
        capabilities: { vision: false, nativePdf: false, audio: false, video: false, tools: true, reasoning: false }
      }
    ]
  },
  {
    id: 'groq',
    name: 'Groq',
    description: 'Inférence ultra-rapide sur architecture LPU (Llama 3.3, Mixtral, Qwen).',
    baseUrl: 'https://api.groq.com/openai/v1',
    isLocal: false,
    requiresKey: true,
    docsUrl: 'https://console.groq.com/keys',
    defaultModel: 'llama-3.3-70b-versatile',
    modelsEndpoint: '/models',
    validation: {
      endpoint: '/models',
      method: 'GET',
      headers: (key: string) => ({ 'Authorization': `Bearer ${key}` }),
      parseResponse: (data: any, res: Response) => {
        if (!res.ok) {
          return { valid: false, error: data?.error?.message || `Erreur Groq (${res.status})` };
        }
        const models = Array.isArray(data?.data) ? data.data.map((m: any) => m.id) : [];
        return { valid: true, modelsAvailable: models.slice(0, 10) };
      }
    },
    curatedModels: [
      {
        id: 'groq/llama-3.3-70b-versatile',
        name: 'Llama 3.3 70B (Groq)',
        publisher: 'Meta',
        contextWindow: 128000,
        maxOutputTokens: 8192,
        priceTier: 'budget',
        capabilities: { vision: false, nativePdf: false, audio: false, video: false, tools: true, reasoning: false }
      }
    ]
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    description: 'Modèles DeepSeek-V3 et DeepSeek-R1 (raisonnement avancé).',
    baseUrl: 'https://api.deepseek.com',
    isLocal: false,
    requiresKey: true,
    docsUrl: 'https://platform.deepseek.com/api_keys',
    defaultModel: 'deepseek-chat',
    modelsEndpoint: '/models',
    validation: {
      endpoint: '/models',
      method: 'GET',
      headers: (key: string) => ({ 'Authorization': `Bearer ${key}` }),
      parseResponse: (data: any, res: Response) => {
        if (!res.ok) {
          return { valid: false, error: data?.error?.message || `Erreur DeepSeek (${res.status})` };
        }
        const models = Array.isArray(data?.data) ? data.data.map((m: any) => m.id) : [];
        return { valid: true, modelsAvailable: models.slice(0, 10) };
      }
    },
    curatedModels: [
      {
        id: 'deepseek/deepseek-chat',
        name: 'DeepSeek-V3',
        publisher: 'DeepSeek',
        contextWindow: 64000,
        maxOutputTokens: 4096,
        priceTier: 'budget',
        capabilities: { vision: false, nativePdf: false, audio: false, video: false, tools: true, reasoning: false }
      },
      {
        id: 'deepseek/deepseek-reasoner',
        name: 'DeepSeek-R1',
        publisher: 'DeepSeek',
        contextWindow: 64000,
        maxOutputTokens: 8192,
        priceTier: 'budget',
        capabilities: { vision: false, nativePdf: false, audio: false, video: false, tools: true, reasoning: true }
      }
    ]
  },
  {
    id: 'xai',
    name: 'xAI (Grok)',
    description: 'Modèles Grok 2 et Grok Vision développés par xAI.',
    baseUrl: 'https://api.x.ai/v1',
    isLocal: false,
    requiresKey: true,
    docsUrl: 'https://console.x.ai/',
    defaultModel: 'grok-2-latest',
    modelsEndpoint: '/models',
    validation: {
      endpoint: '/models',
      method: 'GET',
      headers: (key: string) => ({ 'Authorization': `Bearer ${key}` }),
      parseResponse: (data: any, res: Response) => {
        if (!res.ok) {
          return { valid: false, error: data?.error?.message || `Erreur xAI (${res.status})` };
        }
        const models = Array.isArray(data?.data) ? data.data.map((m: any) => m.id) : [];
        return { valid: true, modelsAvailable: models.slice(0, 10) };
      }
    },
    curatedModels: [
      {
        id: 'xai/grok-2-latest',
        name: 'Grok 2',
        publisher: 'xAI',
        contextWindow: 128000,
        maxOutputTokens: 4096,
        priceTier: 'standard',
        capabilities: { vision: true, nativePdf: false, audio: false, video: false, tools: true, reasoning: false }
      }
    ]
  },
  {
    id: 'together',
    name: 'Together AI',
    description: 'Plateforme open-source cloud hébergeant Llama, Qwen, DeepSeek et Mistral.',
    baseUrl: 'https://api.together.xyz/v1',
    isLocal: false,
    requiresKey: true,
    docsUrl: 'https://api.together.ai/settings/api-keys',
    defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    modelsEndpoint: '/models',
    validation: {
      endpoint: '/models',
      method: 'GET',
      headers: (key: string) => ({ 'Authorization': `Bearer ${key}` }),
      parseResponse: (data: any, res: Response) => {
        if (!res.ok) {
          return { valid: false, error: data?.error?.message || `Erreur Together (${res.status})` };
        }
        const models = Array.isArray(data?.data) ? data.data.map((m: any) => m.id) : [];
        return { valid: true, modelsAvailable: models.slice(0, 10) };
      }
    },
    curatedModels: [
      {
        id: 'together/meta-llama/Llama-3.3-70B-Instruct-Turbo',
        name: 'Llama 3.3 70B Turbo',
        publisher: 'Meta',
        contextWindow: 128000,
        maxOutputTokens: 4096,
        priceTier: 'budget',
        capabilities: { vision: false, nativePdf: false, audio: false, video: false, tools: true, reasoning: false }
      }
    ]
  },
  {
    id: 'ollama',
    name: 'Ollama (Local)',
    description: 'Moteur d\'exécution de modèles ouverts en local sans cloud.',
    baseUrl: 'http://localhost:11434',
    isLocal: true,
    requiresKey: false,
    docsUrl: 'https://ollama.com/',
    defaultModel: 'llama3.2',
    modelsEndpoint: '/api/tags',
    validation: {
      endpoint: '/api/tags',
      method: 'GET',
      parseResponse: (data: any, res: Response) => {
        if (!res.ok) {
          return { valid: false, error: `Serveur Ollama injoignable (${res.status})` };
        }
        const models = Array.isArray(data?.models) ? data.models.map((m: any) => m.name || m.model) : [];
        return { valid: true, modelsAvailable: models };
      }
    },
    curatedModels: [
      {
        id: 'ollama/llama3.2',
        name: 'Llama 3.2 (Local)',
        publisher: 'Meta',
        contextWindow: 128000,
        maxOutputTokens: 4096,
        priceTier: 'free',
        capabilities: { vision: false, nativePdf: false, audio: false, video: false, tools: true, reasoning: false }
      },
      {
        id: 'ollama/qwen2.5-coder',
        name: 'Qwen 2.5 Coder (Local)',
        publisher: 'Alibaba',
        contextWindow: 32000,
        maxOutputTokens: 4096,
        priceTier: 'free',
        capabilities: { vision: false, nativePdf: false, audio: false, video: false, tools: true, reasoning: false }
      }
    ]
  },
  {
    id: 'lmstudio',
    name: 'LM Studio (Local)',
    description: 'Serveur local d\'inférence avec interface graphique et API OpenAI.',
    baseUrl: 'http://localhost:1234/v1',
    isLocal: true,
    requiresKey: false,
    docsUrl: 'https://lmstudio.ai/',
    defaultModel: 'local-model',
    modelsEndpoint: '/models',
    validation: {
      endpoint: '/models',
      method: 'GET',
      headers: () => ({ 'Authorization': 'Bearer lm-studio' }),
      parseResponse: (data: any, res: Response) => {
        if (!res.ok) {
          return { valid: false, error: `Serveur LM Studio injoignable (${res.status})` };
        }
        const models = Array.isArray(data?.data) ? data.data.map((m: any) => m.id) : ['local-model'];
        return { valid: true, modelsAvailable: models };
      }
    },
    curatedModels: [
      {
        id: 'lmstudio/local-model',
        name: 'Modèle actif LM Studio',
        publisher: 'Local',
        contextWindow: 32000,
        maxOutputTokens: 4096,
        priceTier: 'free',
        capabilities: { vision: false, nativePdf: false, audio: false, video: false, tools: true, reasoning: false }
      }
    ]
  },
  {
    id: 'custom',
    name: 'Personnalisé (Compatible OpenAI)',
    description: 'Point d\'accès personnalisé compatible avec le protocole OpenAI (vLLM, LocalAI, passerelle entreprise).',
    baseUrl: 'http://localhost:8000/v1',
    isLocal: false,
    requiresKey: true,
    docsUrl: 'https://platform.openai.com/docs/api-reference',
    defaultModel: 'custom-model',
    modelsEndpoint: '/models',
    validation: {
      endpoint: '/models',
      method: 'GET',
      headers: (key: string) => ({ 'Authorization': `Bearer ${key || 'custom-key'}` }),
      parseResponse: (data: any, res: Response) => {
        if (!res.ok) {
          return { valid: false, error: `Point de terminaison personnalisé injoignable (${res.status})` };
        }
        const models = Array.isArray(data?.data) ? data.data.map((m: any) => m.id) : ['custom-model'];
        return { valid: true, modelsAvailable: models };
      }
    }
  }
];

export function getProviderPreset(id: string): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find(p => p.id.toLowerCase() === id.toLowerCase());
}

export function getAllProviderPresets(): ProviderPreset[] {
  return [...PROVIDER_PRESETS];
}
