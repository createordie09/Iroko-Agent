import { AIProvider, ModelRequest, StreamChunk, CredentialValidationResult, ProviderErrorClassification } from '../types';
import { ErrorClassifier } from '../errors/ErrorClassifier';

export class AnthropicProvider implements AIProvider {
  public id = 'anthropic';
  public name = 'Anthropic Claude';
  private defaultModel = 'claude-3-5-sonnet-latest';

  public async listModels(): Promise<string[]> {
    return [
      'claude-3-5-sonnet-latest',
      'claude-3-5-haiku-latest',
      'claude-3-opus-latest'
    ];
  }

  public async *generateStream(request: ModelRequest, apiKey: string): AsyncIterable<StreamChunk> {
    const model = request.modelId || this.defaultModel;

    const systemMessage = request.messages.find(m => m.role === 'system');
    const conversationMessages = request.messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'tool' ? 'user' : m.role,
        content: m.content
      }));

    const payload: Record<string, any> = {
      model,
      max_tokens: request.maxTokens || 4096,
      stream: true,
      messages: conversationMessages
    };

    if (systemMessage) {
      payload.system = systemMessage.content;
    }

    if (request.tools && request.tools.length > 0) {
      payload.tools = request.tools.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters
      }));
    }

    // Paliers de réflexion (§22, §37)
    let thinkingBudget = request.thinkingBudget;
    if (!thinkingBudget && request.thinkingLevel && request.thinkingLevel !== 'disabled') {
      if (request.thinkingLevel === 'low') thinkingBudget = 1024;
      else if (request.thinkingLevel === 'medium') thinkingBudget = 4096;
      else if (request.thinkingLevel === 'high') thinkingBudget = 16384;
    }

    if (thinkingBudget && thinkingBudget > 0) {
      payload.thinking = {
        type: 'enabled',
        budget_tokens: thinkingBudget
      };
      if (payload.max_tokens <= thinkingBudget) {
        payload.max_tokens = thinkingBudget + 4096;
      }
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(payload),
      signal: request.abortSignal
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Erreur Anthropic (${response.status}): ${errText}`);
    }

    if (!response.body) {
      throw new Error('Pas de corps de réponse Anthropic');
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
        if (!trimmed || !trimmed.startsWith('data: ')) continue;

        try {
          const data = JSON.parse(trimmed.slice(6));
          if (data.type === 'content_block_start') {
            if (data.content_block?.type === 'tool_use') {
              yield {
                type: 'tool_call_delta',
                id: data.content_block.id || `call_${Date.now()}`,
                name: data.content_block.name,
                argumentsDelta: ''
              };
            }
          } else if (data.type === 'content_block_delta') {
            if (data.delta?.type === 'text_delta') {
              yield { type: 'text_delta', text: data.delta.text };
            } else if (data.delta?.type === 'thinking_delta') {
              yield { type: 'thinking_delta', text: data.delta.thinking };
            } else if (data.delta?.type === 'input_json_delta') {
              yield {
                type: 'tool_call_delta',
                id: '',
                argumentsDelta: data.delta.partial_json
              };
            }
          } else if (data.type === 'message_delta' && data.usage) {
            yield {
              type: 'usage',
              inputTokens: 0,
              outputTokens: data.usage.output_tokens || 0
            };
          }
        } catch {
          // Ignorer fragments
        }
      }
    }
  }

  public async validateCredential(apiKey: string): Promise<CredentialValidationResult> {
    const start = Date.now();
    try {
      // Test léger : message de 1 token
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-5-haiku-latest',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'hi' }]
        })
      });
      const latencyMs = Date.now() - start;

      if (!res.ok) {
        const text = await res.text();
        return { valid: false, latencyMs, error: `Erreur ${res.status}: ${text}` };
      }

      return { valid: true, latencyMs, modelsAvailable: await this.listModels() };
    } catch (err: any) {
      return { valid: false, error: err.message || String(err) };
    }
  }

  public classifyError(error: unknown): ProviderErrorClassification {
    return ErrorClassifier.classify(error);
  }
}
