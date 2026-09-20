import { ModelProvider, ModelRequest, StreamChunk } from '../types';

export interface OpenAIAdapterConfig {
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
  providerId?: string;
  providerName?: string;
}

export class OpenAIAdapter implements ModelProvider {
  public id: string;
  public name: string;
  private apiKey: string;
  private baseUrl: string;
  private defaultModel: string;

  constructor(config: OpenAIAdapterConfig = {}) {
    this.id = config.providerId || 'openai';
    this.name = config.providerName || 'OpenAI Compatible';
    this.apiKey = config.apiKey || process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY || '';
    this.baseUrl = config.baseUrl || process.env.OPENAI_BASE_URL || (process.env.OPENROUTER_API_KEY ? 'https://openrouter.ai/api/v1' : 'https://api.openai.com/v1');
    this.defaultModel = config.defaultModel || (process.env.OPENROUTER_API_KEY ? 'anthropic/claude-3.5-sonnet' : 'gpt-4o');
  }

  public isAvailable(): boolean {
    // Si c'est un endpoint local (Ollama/LM Studio), pas besoin de clé
    if (this.baseUrl.includes('localhost') || this.baseUrl.includes('127.0.0.1')) {
      return true;
    }
    return Boolean(this.apiKey);
  }

  public async listModels(): Promise<string[]> {
    if (!this.isAvailable()) return [];
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: this.getHeaders()
      });
      if (!res.ok) return [this.defaultModel];
      const data = await res.json() as any;
      if (Array.isArray(data.data)) {
        return data.data.map((m: any) => m.id);
      }
      return [this.defaultModel];
    } catch {
      return [this.defaultModel];
    }
  }

  public async *generateStream(request: ModelRequest): AsyncIterable<StreamChunk> {
    const model = request.modelId || this.defaultModel;

    const payload: Record<string, any> = {
      model,
      stream: true,
      temperature: request.temperature ?? 0.2,
      messages: request.messages.map(m => {
        const item: any = { role: m.role, content: m.content };
        if (m.name) item.name = m.name;
        if (m.toolCallId) item.tool_call_id = m.toolCallId;
        if (m.toolCalls) {
          item.tool_calls = m.toolCalls.map(tc => ({
            id: tc.id,
            type: 'function',
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.arguments)
            }
          }));
        }
        return item;
      })
    };

    if (request.tools && request.tools.length > 0) {
      payload.tools = request.tools.map(t => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters
        }
      }));
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Erreur ModelGateway (${this.name} ${response.status}): ${errText}`);
    }

    if (!response.body) {
      throw new Error(`Pas de flux en réponse du provider ${this.name}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue;
        if (trimmed === 'data: [DONE]') return;

        if (trimmed.startsWith('data: ')) {
          try {
            const data = JSON.parse(trimmed.slice(6));
            const choice = data.choices?.[0];
            if (!choice) continue;

            const delta = choice.delta;
            if (delta?.content) {
              yield { type: 'text_delta', text: delta.content };
            }

            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                yield {
                  type: 'tool_call_delta',
                  id: tc.id || '',
                  name: tc.function?.name,
                  argumentsDelta: tc.function?.arguments || ''
                };
              }
            }

            if (data.usage) {
              yield {
                type: 'usage',
                inputTokens: data.usage.prompt_tokens || 0,
                outputTokens: data.usage.completion_tokens || 0
              };
            }
          } catch {
            // Ignorer les fragments SSE non JSON
          }
        }
      }
    }
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    return headers;
  }
}
