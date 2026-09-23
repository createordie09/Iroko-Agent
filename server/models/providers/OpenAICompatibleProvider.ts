import { OpenAIProvider } from './OpenAIProvider';
import { ProviderPreset } from './presets/types';
import { CredentialValidationResult } from '../types';

export class OpenAICompatibleProvider extends OpenAIProvider {
  public readonly preset: ProviderPreset;

  constructor(preset: ProviderPreset, customBaseUrl?: string) {
    super({
      baseUrl: customBaseUrl || preset.baseUrl,
      defaultModel: preset.defaultModel || 'default-model'
    });
    this.preset = preset;
    this.id = preset.id;
    this.name = preset.name;
  }

  public setBaseUrl(url: string): void {
    this.baseUrl = url.replace(/\/+$/, '');
  }

  public override async validateCredential(apiKey: string): Promise<CredentialValidationResult> {
    const start = Date.now();
    try {
      const v = this.preset.validation;
      let url = `${this.baseUrl}${v.endpoint}`;
      if (v.buildUrl) {
        url = v.buildUrl(this.baseUrl, apiKey);
      }

      const headers: Record<string, string> = v.headers ? v.headers(apiKey) : {
        'Authorization': `Bearer ${apiKey}`
      };

      const res = await fetch(url, {
        method: v.method || 'GET',
        headers,
        signal: AbortSignal.timeout(10000)
      });
      const latencyMs = Date.now() - start;

      let data: any = null;
      try {
        data = await res.json();
      } catch {
        try {
          const text = await res.text();
          data = { error: { message: text } };
        } catch {
          data = {};
        }
      }

      if (v.parseResponse) {
        const parsed = v.parseResponse(data, res);
        return {
          valid: parsed.valid,
          latencyMs,
          modelsAvailable: parsed.modelsAvailable,
          error: parsed.error
        };
      }

      if (!res.ok) {
        return {
          valid: false,
          latencyMs,
          error: data?.error?.message || `Erreur ${this.name} (${res.status})`
        };
      }

      const models = Array.isArray(data?.data) ? data.data.map((m: any) => m.id) : [];
      return { valid: true, latencyMs, modelsAvailable: models.slice(0, 10) };
    } catch (err: any) {
      return { valid: false, error: err.message || String(err) };
    }
  }

  public override async listModels(): Promise<string[]> {
    if (this.preset.curatedModels && this.preset.curatedModels.length > 0) {
      try {
        const modelsUrl = `${this.baseUrl}${this.preset.modelsEndpoint || '/models'}`;
        const res = await fetch(modelsUrl, {
          headers: this.preset.requiresKey ? { 'Authorization': 'Bearer test' } : {},
          signal: AbortSignal.timeout(2000)
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data?.data)) {
            return data.data.map((m: any) => m.id);
          }
        }
      } catch {}
      return this.preset.curatedModels.map(m => m.id.replace(`${this.id}/`, ''));
    }
    return super.listModels();
  }
}
