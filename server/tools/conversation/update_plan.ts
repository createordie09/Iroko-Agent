import { IrokoTool, ToolContext, ToolResult } from '../types.js';

export interface UpdatePlanInput {
  steps: Array<{ title: string; status: 'pending' | 'in_progress' | 'completed' }>;
}

const MAX_STEPS = 10;
const MAX_TITLE = 140;
const VALID_STATUS = new Set(['pending', 'in_progress', 'completed']);

/**
 * Plan de travail déclaré par le modèle : liste courte d'étapes réelles, remplacée à chaque appel.
 * L'interface l'affiche dans la réponse ; il n'existe aucun plan sans cet appel.
 */
export class UpdatePlanTool implements IrokoTool<UpdatePlanInput> {
  public name = 'update_plan';
  public description = 'Déclare ou met à jour le plan de travail affiché à l\'utilisateur. À utiliser seulement pour une tâche qui demande au moins trois actions distinctes : appelle-le au début avec la liste complète des étapes réelles (3 à 8, une courte phrase en français chacune), puis rappelle-le avec la liste complète à jour chaque fois qu\'une étape commence ou se termine. Une seule étape « in_progress » à la fois. N\'ajoute jamais une étape que tu ne comptes pas faire. N\'utilise pas cet outil pour une demande simple.';
  public category = 'conversation' as const;
  public permission = 'SAFE' as const;

  public parameters = {
    type: 'object',
    required: ['steps'],
    properties: {
      steps: {
        type: 'array',
        description: 'Liste complète et ordonnée des étapes du plan.',
        items: {
          type: 'object',
          required: ['title', 'status'],
          properties: {
            title: { type: 'string', description: 'Étape en une courte phrase, en français.' },
            status: { type: 'string', enum: ['pending', 'in_progress', 'completed'], description: 'État réel de l\'étape.' }
          }
        }
      }
    }
  };

  public async execute(input: UpdatePlanInput, context: ToolContext): Promise<ToolResult> {
    if (!Array.isArray(input?.steps) || input.steps.length === 0) {
      return { success: false, error: 'Le champ steps doit contenir au moins une étape.' };
    }
    if (input.steps.length > MAX_STEPS) {
      return { success: false, error: `Un plan comporte ${MAX_STEPS} étapes au plus : regroupe les étapes.` };
    }

    const cleaned: Array<{ title: string; status: 'pending' | 'in_progress' | 'completed' }> = [];
    for (const step of input.steps) {
      const title = typeof step?.title === 'string' ? step.title.trim().slice(0, MAX_TITLE) : '';
      if (!title || !VALID_STATUS.has(step?.status)) {
        return { success: false, error: 'Chaque étape exige un titre non vide et un statut parmi pending, in_progress, completed.' };
      }
      cleaned.push({ title, status: step.status });
    }

    if (!context.setPlan) {
      return { success: false, error: 'Le plan de travail est indisponible dans ce contexte.' };
    }
    context.setPlan(cleaned);

    return { success: true, data: 'Plan enregistré et affiché à l\'utilisateur. Poursuis la tâche.' };
  }
}
