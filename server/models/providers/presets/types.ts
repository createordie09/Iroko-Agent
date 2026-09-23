import { ModelCapabilities } from '../../types';

export interface ProviderValidationConfig {
  endpoint: string;
  method?: 'GET' | 'POST';
  headers?: (apiKey: string) => Record<string, string>;
  buildUrl?: (baseUrl: string, apiKey: string) => string;
  body?: (apiKey: string) => any;
  parseResponse?: (data: any, res: Response) => {
    valid: boolean;
    modelsAvailable?: string[];
    error?: string;
  };
}

export interface CuratedModelSeed {
  id: string;
  name: string;
  publisher: string;
  contextWindow: number;
  maxOutputTokens?: number;
  priceTier: 'free' | 'budget' | 'standard' | 'premium';
  capabilities: ModelCapabilities;
  description?: string;
}

export interface ProviderPreset {
  id: string;
  name: string;
  description: string;
  baseUrl: string;
  isLocal: boolean;
  requiresKey: boolean;
  docsUrl: string;
  defaultModel?: string;
  validation: ProviderValidationConfig;
  modelsEndpoint?: string;
  curatedModels?: CuratedModelSeed[];
}
