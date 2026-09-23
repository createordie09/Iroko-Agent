// server/tools/subagents/invoke_subagent.ts
// Cahier §11 : Outil d'invocation de sous-agents internes et invisibles

import { IrokoTool, ToolContext, ToolResult } from '../types';
import { subagentManager } from '../../subagents/SubagentManager';
import { SubagentType, ModelProfile, SubagentResult } from '../../subagents/types';

export interface InvokeSubagentInput {
  type: SubagentType;
  task: string;
  context?: Record<string, any>;
  modelProfile?: ModelProfile;
}

export class InvokeSubagentTool implements IrokoTool<InvokeSubagentInput, SubagentResult> {
  public readonly name = 'invoke_subagent';
  public readonly description = 'Invoque un sous-agent spécialisé (explore, debug, review, test) interne et invisible pour accomplir une sous-tâche et retourner un résultat structuré au parent sans polluer la conversation principale.';
  public readonly category = 'subagent';
  public readonly permission = 'SAFE' as const;

  public readonly parameters = {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['explore', 'debug', 'review', 'test'],
        description: 'Type de sous-agent spécialisé : "explore" (lecture code/structure), "debug" (analyse bugs/LSP), "review" (qualité/sécurité), "test" (vérification/tests)'
      },
      task: {
        type: 'string',
        description: 'Description claire et détaillée de la mission assignée au sous-agent'
      },
      context: {
        type: 'object',
        description: 'Contexte additionnel pertinent (fichiers cibles, messages d\'erreur, diffs, etc.)'
      },
      modelProfile: {
        type: 'string',
        enum: ['fast', 'powerful', 'local'],
        description: 'Profil de modèle à utiliser : "fast" (rapide), "powerful" (puissant), "local" (local/hors-ligne)'
      }
    },
    required: ['type', 'task'],
    additionalProperties: false
  };

  public async execute(input: InvokeSubagentInput, context: ToolContext): Promise<ToolResult<SubagentResult>> {
    try {
      if (!input.type || !input.task) {
        return {
          success: false,
          error: 'Les paramètres "type" et "task" sont obligatoires.'
        };
      }

      const validTypes: SubagentType[] = ['explore', 'debug', 'review', 'test'];
      if (!validTypes.includes(input.type)) {
        return {
          success: false,
          error: `Type de sous-agent invalide : "${input.type}". Types autorisés : ${validTypes.join(', ')}`
        };
      }

      const result = await subagentManager.executeSubagent(
        {
          type: input.type,
          task: input.task,
          context: input.context,
          modelProfile: input.modelProfile
        },
        context
      );

      return {
        success: result.status === 'completed',
        data: result,
        error: result.error
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Erreur lors de l'exécution du sous-agent : ${err.message || String(err)}`
      };
    }
  }
}
