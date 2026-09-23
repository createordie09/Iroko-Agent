import { IrokoTool, ToolContext, ToolResult } from '../types.js';
import { projectMemoryManager, containsSecret } from '../../memory/ProjectMemory.js';

export interface RememberFactInput {
  fact: string;
  scope?: 'global' | 'project';
  category?: 'architecture' | 'decision' | 'rule' | 'preference' | 'pattern' | 'general';
}

export class RememberFactTool implements IrokoTool<RememberFactInput> {
  public name = 'remember_fact';
  public description = 'Enregistre un fait important, une décision d\'architecture, une préférence ou une règle dans la mémoire persistante (§20). Interdiction stricte d\'enregistrer des secrets ou clés d\'API.';
  public category = 'memory' as const;
  public permission = 'MEDIUM' as const;

  public parameters = {
    type: 'object',
    required: ['fact'],
    properties: {
      fact: {
        type: 'string',
        description: 'Le fait, la décision ou la règle à mémoriser. Ne doit jamais contenir de mot de passe ni de clé d\'API.'
      },
      scope: {
        type: 'string',
        enum: ['project', 'global'],
        description: 'Portée de la mémoire : "project" pour le projet actif uniquement, "global" pour toutes les sessions.'
      },
      category: {
        type: 'string',
        enum: ['architecture', 'decision', 'rule', 'preference', 'pattern', 'general'],
        description: 'Catégorie du fait mémorisé.'
      }
    }
  };

  public async execute(input: RememberFactInput, context: ToolContext): Promise<ToolResult> {
    if (!input.fact || !input.fact.trim()) {
      return { success: false, error: 'Le contenu du fait à mémoriser ne peut être vide.' };
    }

    // 1. Contrôle anti-secret strict (§20, §26)
    const secretCheck = containsSecret(input.fact);
    if (secretCheck.hasSecret) {
      return {
        success: false,
        error: secretCheck.reason || 'Refus formel de mémoriser des secrets ou informations confidentielles.'
      };
    }

    // 2. Demande de permission MEDIUM
    const approved = await context.permissionEngine.requestPermission(
      this.name,
      this.permission,
      `Mémoriser : [${input.scope || 'project'}][${input.category || 'general'}] ${input.fact}`
    );

    if (!approved) {
      return { success: false, error: 'Action refusée par l\'utilisateur ou le moteur de permissions.' };
    }

    try {
      const item = projectMemoryManager.remember({
        fact: input.fact,
        scope: input.scope || 'project',
        workspacePath: context.workspacePath,
        category: input.category || 'general'
      });

      return {
        success: true,
        data: {
          id: item.id,
          scope: item.scope,
          category: item.category,
          fact: item.fact,
          message: 'Fait enregistré avec succès dans la mémoire.'
        }
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Erreur lors de l\'enregistrement en mémoire.'
      };
    }
  }
}
