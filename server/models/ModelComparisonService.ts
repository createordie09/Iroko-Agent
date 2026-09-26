/**
 * ModelComparisonService — Service de comparaison parallèle de deux modèles (Mission R4d)
 *
 * Exécute simultanément deux requêtes sur ModelGateway (M10.2), mesure les horodatages réels,
 * gère la persistance de l'état bicolonne et la sélection bidirectionnelle de la réponse conservée.
 */
import { modelGateway } from './ModelGateway';
import { runtimeDatabase } from '../storage/RuntimeDatabase';
import { formatModelLabel } from '../../src/lib/models';
import { ModelRequest } from './types';

export interface ComparisonModelResult {
  modelId: string;
  modelName: string;
  content: string;
  thinking?: string;
  startTime: number;
  endTime: number;
  status: 'streaming' | 'completed' | 'error';
  error?: string;
}

export interface ComparisonData {
  prompt: string;
  modelA: ComparisonModelResult;
  modelB: ComparisonModelResult;
  selectedModel: 'modelA' | 'modelB' | null;
  archivedModel: 'modelA' | 'modelB' | null;
}

export class ModelComparisonService {
  /**
   * Vérifie si la comparaison est possible (au moins deux modèles/fournisseurs prêts)
   */
  public isComparisonAvailable(): {
    available: boolean;
    reason?: string;
    readyProvidersCount: number;
    readyModelsCount: number;
  } {
    const providers = modelGateway.getAvailableProviders();
    const readyProviders = providers.filter(p => p.status === 'READY' && p.activeKeys > 0);
    const catalogModels = modelGateway.getSmartDefaultModel() ? 2 : 0; // estimation si catalogue actif

    if (readyProviders.length < 2) {
      return {
        available: false,
        reason: 'Nécessite au moins deux fournisseurs d\'IA configurés avec des clés valides.',
        readyProvidersCount: readyProviders.length,
        readyModelsCount: catalogModels
      };
    }

    return {
      available: true,
      readyProvidersCount: readyProviders.length,
      readyModelsCount: catalogModels
    };
  }

  /**
   * Exécute deux modèles en parallèle réel et enregistre les résultats
   */
  public async runComparison(
    prompt: string,
    modelAId: string,
    modelBId: string,
    options: {
      conversationId?: string;
      systemPrompt?: string;
      onChunk?: (column: 'modelA' | 'modelB', delta: string) => void;
    } = {}
  ): Promise<ComparisonData> {
    const modelAName = formatModelLabel(modelAId).name;
    const modelBName = formatModelLabel(modelBId).name;

    const makeRequest = (mId: string): ModelRequest => ({
      modelId: mId,
      messages: [
        ...(options.systemPrompt ? [{ role: 'system' as const, content: options.systemPrompt }] : []),
        { role: 'user' as const, content: prompt }
      ]
    });

    const runOne = async (
      col: 'modelA' | 'modelB',
      mId: string,
      mName: string
    ): Promise<ComparisonModelResult> => {
      const startTime = Date.now();
      let content = '';
      let thinking = '';

      try {
        const providerId = mId.includes('/') ? mId.split('/')[0] : undefined;
        const stream = modelGateway.generateStream(makeRequest(mId), providerId);

        for await (const chunk of stream) {
          if (chunk.type === 'text_delta') {
            content += chunk.text;
            if (options.onChunk) {
              options.onChunk(col, chunk.text);
            }
          } else if (chunk.type === 'thinking_delta') {
            thinking += chunk.text;
          }
        }

        const endTime = Date.now();
        return {
          modelId: mId,
          modelName: mName,
          content,
          thinking: thinking || undefined,
          startTime,
          endTime,
          status: 'completed'
        };
      } catch (err: any) {
        const endTime = Date.now();
        return {
          modelId: mId,
          modelName: mName,
          content,
          startTime,
          endTime,
          status: 'error',
          error: err?.message || 'Erreur lors de la génération'
        };
      }
    };

    // Exécution simultanée réelle (§ Mission R4d)
    const [resultA, resultB] = await Promise.all([
      runOne('modelA', modelAId, modelAName),
      runOne('modelB', modelBId, modelBName)
    ]);

    const comparisonData: ComparisonData = {
      prompt,
      modelA: resultA,
      modelB: resultB,
      selectedModel: null,
      archivedModel: null
    };

    return comparisonData;
  }

  /**
   * Sélectionne la réponse à conserver pour continuer la conversation.
   * L'autre réponse est archivée mais consultable sans être perdue.
   * Fonctionne dans les deux sens (réversible).
   */
  public selectResponse(
    messageId: string,
    choice: 'modelA' | 'modelB'
  ): { success: boolean; message?: any } {
    const existing = runtimeDatabase.getMessage(messageId);
    if (!existing) {
      return { success: false };
    }

    let meta: any = {};
    if (existing.metadata) {
      try {
        meta = typeof existing.metadata === 'string' ? JSON.parse(existing.metadata) : existing.metadata;
      } catch {}
    }

    if (!meta.comparison) {
      return { success: false };
    }

    const comparison: ComparisonData = meta.comparison;
    const selectedResult = choice === 'modelA' ? comparison.modelA : comparison.modelB;
    const archivedResult = choice === 'modelA' ? comparison.modelB : comparison.modelA;

    comparison.selectedModel = choice;
    comparison.archivedModel = choice === 'modelA' ? 'modelB' : 'modelA';

    meta.comparison = comparison;
    meta.model = selectedResult.modelId;

    // Le contenu actif du message devient celui de la réponse choisie
    runtimeDatabase.updateMessageContent(
      messageId,
      selectedResult.content,
      selectedResult.thinking ? [selectedResult.thinking] : undefined,
      meta
    );

    const updated = runtimeDatabase.getMessage(messageId);
    return { success: true, message: updated };
  }

  /**
   * Régénère uniquement une seule colonne spécifiée
   */
  public async regenerateColumn(
    messageId: string,
    column: 'modelA' | 'modelB',
    onChunk?: (delta: string) => void
  ): Promise<{ success: boolean; result?: ComparisonModelResult }> {
    const existing = runtimeDatabase.getMessage(messageId);
    if (!existing) return { success: false };

    let meta: any = {};
    if (existing.metadata) {
      try {
        meta = typeof existing.metadata === 'string' ? JSON.parse(existing.metadata) : existing.metadata;
      } catch {}
    }

    if (!meta.comparison) return { success: false };
    const comparison: ComparisonData = meta.comparison;
    const targetModel = column === 'modelA' ? comparison.modelA : comparison.modelB;

    const startTime = Date.now();
    let content = '';
    let thinking = '';

    try {
      const providerId = targetModel.modelId.includes('/') ? targetModel.modelId.split('/')[0] : undefined;
      const stream = modelGateway.generateStream({
        modelId: targetModel.modelId,
        messages: [{ role: 'user', content: comparison.prompt }]
      }, providerId);

      for await (const chunk of stream) {
        if (chunk.type === 'text_delta') {
          content += chunk.text;
          if (onChunk) onChunk(chunk.text);
        } else if (chunk.type === 'thinking_delta') {
          thinking += chunk.text;
        }
      }

      const endTime = Date.now();
      const newResult: ComparisonModelResult = {
        modelId: targetModel.modelId,
        modelName: targetModel.modelName,
        content,
        thinking: thinking || undefined,
        startTime,
        endTime,
        status: 'completed'
      };

      if (column === 'modelA') {
        comparison.modelA = newResult;
      } else {
        comparison.modelB = newResult;
      }

      // Si cette colonne était celle sélectionnée, mettre à jour aussi le contenu principal
      let mainContent = existing.content;
      if (comparison.selectedModel === column) {
        mainContent = content;
      }

      meta.comparison = comparison;
      runtimeDatabase.updateMessageContent(messageId, mainContent, undefined, meta);

      return { success: true, result: newResult };
    } catch (err: any) {
      return { success: false };
    }
  }
}

export const modelComparisonService = new ModelComparisonService();
