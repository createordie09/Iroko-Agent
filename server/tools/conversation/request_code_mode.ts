import { IrokoTool, ToolContext, ToolResult } from '../types.js';

export interface RequestCodeModeInput {
  reason: string;
}

/**
 * Outil propre au mode Chat : signale à l'utilisateur que la tâche demandée nécessite le mode Code
 * (modification de fichiers du projet, commandes, git, tests). L'interface affiche alors un bouton
 * « Passer en mode Code et continuer » qui bascule le mode et relance la tâche.
 */
export class RequestCodeModeTool implements IrokoTool<RequestCodeModeInput> {
  public name = 'request_code_mode';
  public description = 'Mode Chat uniquement : propose à l\'utilisateur de passer en mode Code lorsque sa demande exige de modifier des fichiers du projet, d\'exécuter des commandes, d\'utiliser git ou de lancer des tests. À utiliser à la place de lui demander d\'actionner lui-même le sélecteur. Après l\'appel, termine ta réponse par une courte phrase.';
  public category = 'conversation' as const;
  public permission = 'SAFE' as const;

  public parameters = {
    type: 'object',
    required: ['reason'],
    properties: {
      reason: {
        type: 'string',
        description: 'Raison courte (une phrase, en français) pour laquelle le mode Code est nécessaire, par exemple « créer le fichier dans le projet et lancer les tests ».'
      }
    }
  };

  public async execute(input: RequestCodeModeInput, context: ToolContext): Promise<ToolResult> {
    const reason = (input.reason || '').trim().slice(0, 300);
    if (!reason) {
      return { success: false, error: 'Le champ reason est requis.' };
    }

    context.emitEvent({ type: 'mode_switch_suggested', reason });

    return {
      success: true,
      data: 'La proposition de passage en mode Code est affichée à l\'utilisateur avec un bouton. Termine ta réponse par une courte phrase sans refaire la demande.'
    };
  }
}
