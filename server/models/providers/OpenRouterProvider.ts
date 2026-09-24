import { AIProvider, ModelRequest, StreamChunk, CredentialValidationResult, ProviderErrorClassification } from '../types';
import { ErrorClassifier } from '../errors/ErrorClassifier';

export class OpenRouterProvider implements AIProvider {
  public id = 'openrouter';
  public name = 'OpenRouter';
  private baseUrl = 'https://openrouter.ai/api/v1';
  private defaultModel = 'anthropic/claude-3.5-sonnet';

  public async listModels(): Promise<string[]> {
    return [
      'anthropic/claude-3.7-sonnet',
      'anthropic/claude-3.5-sonnet',
      'openai/gpt-4.5-preview',
      'openai/o3-mini',
      'google/gemini-2.5-pro',
      'deepseek/deepseek-r1',
      'deepseek/deepseek-chat'
    ];
  }

  public async *generateStream(request: ModelRequest, apiKey: string): AsyncIterable<StreamChunk> {
    let model = request.modelId || this.defaultModel;
    if (model.startsWith('openrouter/')) {
      model = model.slice('openrouter/'.length);
    }

    // Normalisation des slugs vers les identifiants officiels OpenRouter
    const OPENROUTER_SLUG_MAP: Record<string, string> = {
      'deepseek/deepseek-reasoner': 'deepseek/deepseek-r1',
      'deepseek-reasoner': 'deepseek/deepseek-r1',
      'deepseek/deepseek-chat': 'deepseek/deepseek-chat',
      'deepseek-chat': 'deepseek/deepseek-chat',
      'anthropic/claude-3-7-sonnet-latest': 'anthropic/claude-3.7-sonnet',
      'claude-3-7-sonnet-latest': 'anthropic/claude-3.7-sonnet',
      'anthropic/claude-3-5-sonnet-latest': 'anthropic/claude-3.5-sonnet',
      'claude-3-5-sonnet-latest': 'anthropic/claude-3.5-sonnet',
      'anthropic/claude-3-5-haiku-latest': 'anthropic/claude-3.5-haiku',
      'claude-3-5-haiku-latest': 'anthropic/claude-3.5-haiku',
      'openai/gpt-4.5-preview': 'openai/gpt-4.5-preview',
      'gpt-4.5-preview': 'openai/gpt-4.5-preview',
      'openai/o3-mini': 'openai/o3-mini',
      'o3-mini': 'openai/o3-mini',
      'openai/o1': 'openai/o1',
      'o1': 'openai/o1',
      'openai/gpt-4o': 'openai/gpt-4o',
      'gpt-4o': 'openai/gpt-4o',
      'openai/gpt-4o-mini': 'openai/gpt-4o-mini',
      'gpt-4o-mini': 'openai/gpt-4o-mini',
      'gemini/gemini-2.5-flash': 'google/gemini-2.5-flash',
      'gemini-2.5-flash': 'google/gemini-2.5-flash',
      'gemini/gemini-2.5-pro': 'google/gemini-2.5-pro',
      'gemini-2.5-pro': 'google/gemini-2.5-pro',
      'groq/llama-3.3-70b-versatile': 'meta-llama/llama-3.3-70b-instruct',
      'llama-3.3-70b-versatile': 'meta-llama/llama-3.3-70b-instruct',
      'llama-3.3-70b': 'meta-llama/llama-3.3-70b-instruct'
    };

    if (OPENROUTER_SLUG_MAP[model]) {
      model = OPENROUTER_SLUG_MAP[model];
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

    // Exclusion des paramètres interdits sur les modèles de raisonnement
    const isReasoner = model.includes('r1') || model.includes('reasoner') || model.includes('o1') || model.includes('o3');
    if (isReasoner) {
      delete payload.temperature;
    }
    if (model.includes('r1') || model.includes('reasoner')) {
      delete payload.tools;
    }

    if (request.thinkingLevel && request.thinkingLevel !== 'disabled') {
      payload.reasoning = { effort: request.thinkingLevel };
    }

    let response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://iroko-agent.local',
        'X-Title': 'Iroko Code Agent'
      },
      body: JSON.stringify(payload),
      signal: request.abortSignal
    });

    if (!response.ok && response.status === 404 && model === 'anthropic/claude-3.7-sonnet') {
      // Re-tentative automatique vers anthropic/claude-3.5-sonnet si l'endpoint 3.7 n'est pas disponible (404)
      payload.model = 'anthropic/claude-3.5-sonnet';
      response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://iroko-agent.local',
          'X-Title': 'Iroko Code Agent'
        },
        body: JSON.stringify(payload),
        signal: request.abortSignal
      });
    }

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
            if (delta?.reasoning || delta?.reasoning_content) {
              yield { type: 'thinking_delta', text: delta.reasoning || delta.reasoning_content };
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
