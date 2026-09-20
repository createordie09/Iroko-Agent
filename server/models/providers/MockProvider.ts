import { AIProvider, ModelRequest, StreamChunk, CredentialValidationResult, ProviderErrorClassification } from '../types';
import { ErrorClassifier } from '../errors/ErrorClassifier';

export class MockProvider implements AIProvider {
  public id = 'mock';
  public name = 'Iroko Mock Engine (Offline)';

  public async listModels(): Promise<string[]> {
    return ['mock-agent-fast', 'mock-agent-reasoning'];
  }

  public async *generateStream(request: ModelRequest, _apiKey: string): AsyncIterable<StreamChunk> {
    const lastUserMessage = [...request.messages].reverse().find(m => m.role === 'user')?.content || '';

    yield { type: 'thinking_delta', text: 'Analyse du contexte du projet (Moteur Hors-Ligne)...\n' };
    await new Promise(r => setTimeout(r, 60));

    if (request.tools && request.tools.length > 0 && lastUserMessage.toLowerCase().includes('list')) {
      yield {
        type: 'tool_call_delta',
        id: 'call_mock_1',
        name: 'list_dir',
        argumentsDelta: '{"path": "."}'
      };
      return;
    }

    const responseText = `[Mode Test Hors-Ligne] Demande analysée : "${lastUserMessage}". Le runtime Iroko Code Agent est opérationnel avec rotation multi-clés.`;
    const words = responseText.split(' ');

    for (const word of words) {
      yield { type: 'text_delta', text: word + ' ' };
      await new Promise(r => setTimeout(r, 15));
    }

    yield {
      type: 'usage',
      inputTokens: 100,
      outputTokens: words.length * 2
    };
  }

  public async validateCredential(_apiKey: string): Promise<CredentialValidationResult> {
    return {
      valid: true,
      latencyMs: 10,
      modelsAvailable: await this.listModels()
    };
  }

  public classifyError(error: unknown): ProviderErrorClassification {
    return ErrorClassifier.classify(error);
  }
}
