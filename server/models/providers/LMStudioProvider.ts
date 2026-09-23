import { OpenAIProvider } from './OpenAIProvider';
import { CredentialValidationResult } from '../types';

export class LMStudioProvider extends OpenAIProvider {
  public override id = 'lmstudio';
  public override name = 'LM Studio (Local)';

  constructor(baseUrl = process.env.LMSTUDIO_BASE_URL || 'http://127.0.0.1:1234/v1') {
    super({ baseUrl, defaultModel: 'local-model' });
  }

  public override async listModels(): Promise<string[]> {
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: { 'Authorization': 'Bearer lm-studio' },
        signal: AbortSignal.timeout(2000)
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.data)) {
          return data.data.map((m: any) => m.id);
        }
      }
    } catch {}
    return ['local-model'];
  }

  public override async validateCredential(apiKey = 'lm-studio'): Promise<CredentialValidationResult> {
    const start = Date.now();
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: { 'Authorization': `Bearer ${apiKey || 'lm-studio'}` },
        signal: AbortSignal.timeout(3000)
      });
      const latencyMs = Date.now() - start;

      if (!res.ok) {
        return { valid: false, latencyMs, error: `Serveur LM Studio injoignable (${res.status})` };
      }

      const data = await res.json();
      const models = Array.isArray(data.data) ? data.data.map((m: any) => m.id) : ['local-model'];
      return { valid: true, latencyMs, modelsAvailable: models };
    } catch (err: any) {
      return { valid: false, error: 'LM Studio non détecté sur http://127.0.0.1:1234' };
    }
  }
}
