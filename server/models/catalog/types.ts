import { ModelCapabilities } from '../types';

export type ModelPriceTier = 'free' | 'budget' | 'standard' | 'premium';

export interface ModelPricing {
  promptCostPerToken?: number;
  completionCostPerToken?: number;
  inputPerMillion?: number;
  outputPerMillion?: number;
}

export interface ModelInfo {
  id: string;
  providerId: string;
  rawId: string;
  name: string;
  publisher: string;
  description?: string;
  contextWindow: number;
  maxOutputTokens?: number;
  capabilities: ModelCapabilities;
  pricing?: ModelPricing;
  priceTier: ModelPriceTier;
  isCurated: boolean;
  isFavorite: boolean;
  isHidden: boolean;
  lastSeenAt: number;
}
