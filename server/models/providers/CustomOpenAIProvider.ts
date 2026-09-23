import { OpenAIProvider } from './OpenAIProvider';

export class CustomOpenAIProvider extends OpenAIProvider {
  public override id = 'custom';
  public override name = 'Compatible OpenAI (URL personnalisée)';

  constructor(baseUrl = process.env.CUSTOM_OPENAI_BASE_URL || 'http://127.0.0.1:8000/v1') {
    super({ baseUrl, defaultModel: 'custom-model' });
  }

  public setBaseUrl(url: string): void {
    this.baseUrl = url.replace(/\/+$/, '');
  }
}
