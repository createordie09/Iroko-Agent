export interface ModelMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  toolCallId?: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: Record<string, any>;
  }>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>; // JSON Schema
}

export interface ModelRequest {
  modelId?: string;
  messages: ModelMessage[];
  tools?: ToolDefinition[];
  temperature?: number;
  maxTokens?: number;
}

export type StreamChunk =
  | { type: 'text_delta'; text: string }
  | { type: 'thinking_delta'; text: string }
  | { type: 'tool_call_delta'; id: string; name?: string; argumentsDelta?: string }
  | { type: 'usage'; inputTokens: number; outputTokens: number };

// Ancien contrat ModelProvider conservé pour rétro-compatibilité
export interface ModelProvider {
  id: string;
  name: string;
  isAvailable(): boolean;
  listModels(): Promise<string[]>;
  generateStream(request: ModelRequest): AsyncIterable<StreamChunk>;
}

// -------------------------------------------------------------
// NOUVEAUX CONTRATS MULTI-PROVIDER & SMART KEY MANAGER
// -------------------------------------------------------------

export type CredentialStatus = 
  | 'ACTIVE' 
  | 'COOLDOWN' 
  | 'RATE_LIMITED' 
  | 'QUOTA_EXHAUSTED' 
  | 'INVALID' 
  | 'DISABLED' 
  | 'ERROR';

export interface ProviderCredential {
  id: string;
  providerId: string;
  label: string;
  maskedKey: string;
  encryptedSecret: string;
  iv: string;
  authTag: string;
  status: CredentialStatus;
  enabled: boolean;
  priority: number;
  createdAt: number;
  updatedAt: number;
  lastUsedAt?: number;
  lastSuccessAt?: number;
  lastFailureAt?: number;
  cooldownUntil?: number;
  failureCount: number;
  successCount: number;
  totalRequests: number;
  activeRequests: number;
  healthScore: number;
  lastErrorCode?: string;
  lastErrorMessage?: string;
}

export interface CredentialValidationResult {
  valid: boolean;
  latencyMs?: number;
  modelsAvailable?: string[];
  error?: string;
}

export type ErrorCategory =
  | 'AUTH_ERROR'
  | 'PERMISSION_ERROR'
  | 'RATE_LIMIT'
  | 'QUOTA_EXHAUSTED'
  | 'TEMPORARY_PROVIDER_ERROR'
  | 'NETWORK_ERROR'
  | 'INVALID_REQUEST'
  | 'MODEL_UNAVAILABLE'
  | 'CONTEXT_LIMIT'
  | 'UNKNOWN';

export interface ProviderErrorClassification {
  category: ErrorCategory;
  isRetryable: boolean;
  shouldCooldown: boolean;
  cooldownSeconds?: number;
  shouldDisableKey: boolean;
  shouldFallbackProvider: boolean;
  message: string;
  statusCode?: number;
}

export interface AIProvider {
  id: string;
  name: string;
  listModels(): Promise<string[]>;
  generateStream(request: ModelRequest, apiKey: string): AsyncIterable<StreamChunk>;
  validateCredential(apiKey: string): Promise<CredentialValidationResult>;
  classifyError(error: unknown): ProviderErrorClassification;
}

export type KeySelectionStrategy = 
  | 'SMART' 
  | 'PRIORITY' 
  | 'ROUND_ROBIN' 
  | 'LEAST_RECENTLY_USED' 
  | 'HEALTHIEST';

export interface FallbackPolicy {
  enabled: boolean;
  providers: string[];
  maxAttemptsPerProvider: number;
  allowModelSubstitution: boolean;
  allowCrossProviderFallback: boolean;
}
