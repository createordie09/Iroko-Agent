import { ModelProvider, ModelRequest, StreamChunk } from '../types';

export class MockAdapter implements ModelProvider {
  public id = 'mock';
  public name = 'Iroko Mock Engine (Offline)';

  public isAvailable(): boolean {
    return true;
  }

  public async listModels(): Promise<string[]> {
    return ['mock-agent-fast', 'mock-agent-reasoning'];
  }

  public async *generateStream(request: ModelRequest): AsyncIterable<StreamChunk> {
    const lastUserMessage = [...request.messages].reverse().find(m => m.role === 'user')?.content || '';

    // Émettre du thinking
    yield { type: 'thinking_delta', text: 'Analyse du contexte du projet et des fichiers environnants...\n' };
    await new Promise(r => setTimeout(r, 80));

    // Si des outils sont demandés et que le prompt contient des mots clés
    if (request.tools && request.tools.length > 0 && lastUserMessage.toLowerCase().includes('list')) {
      yield {
        type: 'tool_call_delta',
        id: 'call_mock_1',
        name: 'list_dir',
        argumentsDelta: '{"path": "."}'
      };
      return;
    }

    // Réponse texte simulée avec délai réaliste
    const responseText = `[Mode Test Hors-Ligne] J'ai bien analysé votre demande : "${lastUserMessage}". Le runtime Iroko Code Agent est opérationnel et prêt à exécuter des outils.`;
    const words = responseText.split(' ');

    for (const word of words) {
      yield { type: 'text_delta', text: word + ' ' };
      await new Promise(r => setTimeout(r, 20));
    }

    yield {
      type: 'usage',
      inputTokens: 150,
      outputTokens: words.length * 2
    };
  }
}
