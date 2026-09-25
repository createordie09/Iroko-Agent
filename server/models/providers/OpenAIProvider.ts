import { AIProvider, ModelRequest, StreamChunk, CredentialValidationResult, ProviderErrorClassification } from '../types';
import { ErrorClassifier } from '../errors/ErrorClassifier';
import { logger } from '../../utils/logger';

export class OpenAIProvider implements AIProvider {
  public id = 'openai';
  public name = 'OpenAI';
  protected baseUrl: string;

  constructor(options?: { baseUrl?: string; defaultModel?: string }) {
    this.baseUrl = options?.baseUrl || 'https://api.openai.com/v1';
  }

  public async listModels(): Promise<string[]> {
    return [
      'gpt-4.5-preview',
      'o3-mini',
      'o1',
      'gpt-4o',
      'gpt-4o-mini'
    ];
  }

  public async *generateStream(request: ModelRequest, apiKey: string): AsyncIterable<StreamChunk> {
    if (!request.modelId) {
      logger.error(`[${this.name}] modelId absent dans la requête ModelRequest. Aucun repli silencieux autorisé.`);
      throw new Error(`Identifiant de modèle obligatoire manquant pour le fournisseur ${this.name} (${this.id})`);
    }
    let model = request.modelId;
    if (model.startsWith(this.id + '/')) {
      model = model.slice(this.id.length + 1);
    }

    const payload: Record<string, any> = {
      model,
      stream: true,
      temperature: request.temperature ?? 0.2,
      max_tokens: request.maxTokens || 4096,
      messages: request.messages.map(m => {
        const item: Record<string, any> = {
          role: m.role,
          content: m.content
        };
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

    // Modèles de raisonnement (o1, o3, DeepSeek-R1)
    const isReasoningModel = model.startsWith('o1') || model.startsWith('o3') || model.includes('reasoner') || (model.includes('r1') && !model.includes('distill'));
    const supportsTools = !model.includes('reasoner') && !(model.includes('r1') && !model.includes('distill'));

    if (supportsTools && request.tools && request.tools.length > 0) {
      payload.tools = request.tools.map(t => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters
        }
      }));
    }

    if (isReasoningModel) {
      delete payload.temperature;
    }

    // Paliers de réflexion OpenAI (o1, o3-mini) (§22, §37)
    if (request.thinkingLevel && request.thinkingLevel !== 'disabled' && (model.startsWith('o1') || model.startsWith('o3'))) {
      payload.reasoning_effort = request.thinkingLevel;
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload),
      signal: request.abortSignal
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Erreur OpenAI (${response.status}): ${errText}`);
    }

    if (!response.body) {
      throw new Error('Pas de flux en réponse du provider OpenAI');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      if (request.abortSignal?.aborted) break;
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
            if (delta?.reasoning_content || delta?.reasoning) {
              yield { type: 'thinking_delta', text: delta.reasoning_content || delta.reasoning };
            }
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
            // Ignorer fragments SSE non JSON
          }
        }
      }
    }
  }

  public async validateCredential(apiKey: string): Promise<CredentialValidationResult> {
    const start = Date.now();
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      const latencyMs = Date.now() - start;

      if (!res.ok) {
        const text = await res.text();
        return { valid: false, latencyMs, error: `Erreur ${res.status}: ${text}` };
      }

      const data = await res.json();
      const models = Array.isArray(data.data) ? data.data.map((m: any) => m.id) : [];
      return { valid: true, latencyMs, modelsAvailable: models.slice(0, 10) };
    } catch (err: any) {
      return { valid: false, error: err.message || String(err) };
    }
  }

  public classifyError(error: unknown): ProviderErrorClassification {
    return ErrorClassifier.classify(error);
  }
}
