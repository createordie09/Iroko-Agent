import { ModelProvider, ModelRequest, StreamChunk } from '../types';

export class GeminiAdapter implements ModelProvider {
  public id = 'gemini';
  public name = 'Google Gemini';
  private apiKey: string;
  private defaultModel = 'gemini-2.0-flash';

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.GEMINI_API_KEY || '';
  }

  public isAvailable(): boolean {
    return Boolean(this.apiKey);
  }

  public async listModels(): Promise<string[]> {
    return [
      'gemini-2.0-flash',
      'gemini-2.0-pro-exp-02-05',
      'gemini-1.5-pro',
      'gemini-1.5-flash'
    ];
  }

  public async *generateStream(request: ModelRequest): AsyncIterable<StreamChunk> {
    const model = request.modelId || this.defaultModel;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${this.apiKey}`;

    const systemMessage = request.messages.find(m => m.role === 'system');
    const contents = request.messages
      .filter(m => m.role !== 'system')
      .map(m => {
        const role = m.role === 'assistant' ? 'model' : 'user';
        return {
          role,
          parts: [{ text: m.content }]
        };
      });

    const payload: Record<string, any> = {
      contents,
      generationConfig: {
        temperature: request.temperature ?? 0.2,
        maxOutputTokens: request.maxTokens || 4096
      }
    };

    if (systemMessage) {
      payload.systemInstruction = {
        parts: [{ text: systemMessage.content }]
      };
    }

    if (request.tools && request.tools.length > 0) {
      payload.tools = [{
        functionDeclarations: request.tools.map(t => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters
        }))
      }];
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Erreur Gemini (${response.status}): ${errText}`);
    }

    if (!response.body) {
      throw new Error('Pas de corps de réponse Gemini');
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
        if (!trimmed || !trimmed.startsWith('data: ')) continue;

        try {
          const data = JSON.parse(trimmed.slice(6));
          const candidate = data.candidates?.[0];
          const parts = candidate?.content?.parts;

          if (Array.isArray(parts)) {
            for (const part of parts) {
              if (part.text) {
                yield { type: 'text_delta', text: part.text };
              }
              if (part.functionCall) {
                yield {
                  type: 'tool_call_delta',
                  id: part.functionCall.name,
                  name: part.functionCall.name,
                  argumentsDelta: JSON.stringify(part.functionCall.args || {})
                };
              }
            }
          }

          if (data.usageMetadata) {
            yield {
              type: 'usage',
              inputTokens: data.usageMetadata.promptTokenCount || 0,
              outputTokens: data.usageMetadata.candidatesTokenCount || 0
            };
          }
        } catch {
          // Ignorer fragments
        }
      }
    }
  }
}
