import { OpenAIProvider } from './OpenAIProvider';
import { CredentialValidationResult } from '../types';

export class OllamaProvider extends OpenAIProvider {
  public override id = 'ollama';
  public override name = 'Ollama (Local)';
  private hostUrl: string;

  constructor(hostUrl = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434') {
    const cleanHost = hostUrl.replace(/\/v1\/?$/, '');
    super({ baseUrl: `${cleanHost}/v1`, defaultModel: 'llama3.2' });
    this.hostUrl = cleanHost;
  }

  public override async listModels(): Promise<string[]> {
    try {
      const res = await fetch(`${this.hostUrl}/api/tags`, {
        signal: AbortSignal.timeout(2000)
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.models)) {
          return data.models.map((m: any) => m.name || m.model);
        }
      }
    } catch {}
    return ['llama3.2', 'qwen2.5-coder', 'mistral'];
  }

  public override async validateCredential(apiKey = 'ollama'): Promise<CredentialValidationResult> {
    const start = Date.now();
    try {
      const res = await fetch(`${this.hostUrl}/api/tags`, {
        signal: AbortSignal.timeout(3000)
      });
      const latencyMs = Date.now() - start;

      if (!res.ok) {
        return { valid: false, latencyMs, error: `Serveur Ollama injoignable (${res.status})` };
      }

      const data = await res.json();
      const models = Array.isArray(data.models) ? data.models.map((m: any) => m.name) : [];
      return { valid: true, latencyMs, modelsAvailable: models };
    } catch (err: any) {
      return { valid: false, error: 'Serveur Ollama non détecté sur http://127.0.0.1:11434' };
    }
  }
}
