import { AIProvider, ModelRequest, StreamChunk, CredentialValidationResult, ProviderErrorClassification } from '../types';
import { ErrorClassifier } from '../errors/ErrorClassifier';

export class OpenRouterProvider implements AIProvider {
  public id = 'openrouter';
  public name = 'OpenRouter';
  private baseUrl = 'https://openrouter.ai/api/v1';
  private defaultModel = 'anthropic/claude-3.5-sonnet';

  public async listModels(): Promise<string[]> {
    return [
      'anthropic/claude-3.5-sonnet',
      'openai/gpt-4o',
      'google/gemini-2.0-flash-001',
      'deepseek/deepseek-chat',
      'qwen/qwen-2.5-coder-32b-instruct',
      'meta-llama/llama-3.3-70b-instruct'
    ];
  }

  public async *generateStream(request: ModelRequest, apiKey: string): AsyncIterable<StreamChunk> {
    const model = request.modelId || this.defaultModel;

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
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://iroko-agent.local',
        'X-Title': 'Iroko Code Agent'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Erreur OpenRouter (${response.status}): ${errText}`);
    }

    if (!response.body) {
      throw new Error('Pas de corps de réponse OpenRouter');
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
            // Ignorer fragments
          }
        }
      }
    }
  }

  public async validateCredential(apiKey: string): Promise<CredentialValidationResult> {
    const start = Date.now();
    try {
      // Endpoint officiel OpenRouter pour vérifier le statut de la clé
      const res = await fetch(`${this.baseUrl}/auth/key`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      });
      const latencyMs = Date.now() - start;

      if (!res.ok) {
        const text = await res.text();
        return { valid: false, latencyMs, error: `Erreur OpenRouter (${res.status}): ${text}` };
      }

      const data = await res.json();
      return {
        valid: true,
        latencyMs,
        modelsAvailable: await this.listModels()
      };
    } catch (err: any) {
      return { valid: false, error: err.message || String(err) };
    }
  }

  public classifyError(error: unknown): ProviderErrorClassification {
    return ErrorClassifier.classify(error);
  }
}
