import path from 'path';
import fs from 'fs';
import { AgentEvent } from '../types/events';
import { ModelMessage } from '../models/types';
import { modelGateway } from '../models/ModelGateway';
import { toolRegistry } from '../tools/ToolRegistry';
import { ToolContext } from '../tools/types';
import { Planner } from './Planner';

import { workspaceManager, WorkspaceMetadata } from '../workspace/WorkspaceManager';
import { verificationEngine } from '../verification/VerificationEngine';

export interface AgentLoopOptions {
  maxIterations?: number;
  preferredProviderId?: string;
  abortSignal?: AbortSignal;
}

export class AgentLoop {
  private maxIterations = 20;

  private buildSystemPrompt(meta: WorkspaceMetadata): string {
    const formattedInfo = workspaceManager.formatForPrompt(meta);

    return `Tu es IROKO CODE AGENT, un agent d'ingénierie logicielle autonome opérant dans un vrai projet.

--- INFORMATIONS DU WORKSPACE ---
${formattedInfo}

DIRECTIVES FONDAMENTALES :
1. Le workspace est la source de vérité. Ne présume jamais de l'état du code sans l'avoir inspecté avec read_file, search_text ou git_status.
2. Tu as accès à des outils réels (filesystem, terminal, search, git). N'émule jamais un outil par une réponse textuelle.
3. Ne prétends JAMAIS avoir exécuté une action sans l'avoir réellement exécutée par un outil.
4. Pour modifier du code, utilise TOUJOURS edit_file avec un ciblage chirurgical exact. Ne réécris pas tout un fichier s'il suffit d'en changer quelques lignes.
5. Après toute modification, vérifie systématiquement le projet avec execute_command ("npm run lint" ou les tests appropriés).
6. Utilise les outils Git (git_status, git_diff, git_log) pour inspecter l'historique et préparer des modifications propres.
7. Si une commande ou un test échoue, analyse l'erreur réelle, formule une hypothèse et applique le correctif minimal avant de revalider.`;
  }

  public async run(
    userPrompt: string,
    context: ToolContext,
    planner: Planner,
    options: AgentLoopOptions = {}
  ): Promise<{ success: boolean; summary: string; filesChanged: string[] }> {
    const maxTours = options.maxIterations || this.maxIterations;
    const MAX_EXECUTION_MS = 5 * 60 * 1000; // 5 minutes max
    const MAX_MESSAGES = 40; // élagage contexte au-delà de 40 messages
    const REPETITION_THRESHOLD = 3; // 3 textes identiques → arrêt
    const startTime = Date.now();
    const recentTexts: string[] = [];
    const filesChanged: Set<string> = new Set();

    // 1. Analyse automatique du workspace
    context.emitEvent({
      type: 'status',
      status: 'thinking',
      message: 'Analyse du workspace en cours...'
    });
    const workspaceMeta = await workspaceManager.analyze(context.workspacePath);

    // Écouter les événements de fichiers modifiés
    const originalEmit = context.emitEvent;
    context.emitEvent = (event: AgentEvent) => {
      if (event.type === 'file_changed') {
        filesChanged.add(event.path);
      }
      originalEmit(event);
    };

    const systemMsg: ModelMessage = { role: 'system', content: this.buildSystemPrompt(workspaceMeta) };
    const messages: ModelMessage[] = [
      systemMsg,
      { role: 'user', content: userPrompt }
    ];

    let iteration = 0;
    let finalAssistantText = '';

    context.emitEvent({
      type: 'status',
      status: 'thinking',
      message: 'Initialisation de la tâche...'
    });

    while (iteration < maxTours) {
      if (options.abortSignal?.aborted) {
        context.emitEvent({ type: 'status', status: 'idle', message: 'Tâche annulée.' });
        return { success: false, summary: 'Tâche annulée par l\'utilisateur.', filesChanged: Array.from(filesChanged) };
      }

      // Guard 1 : Timeout global de durée maximale
      if (Date.now() - startTime > MAX_EXECUTION_MS) {
        console.warn(`[AgentLoop] Timeout global atteint (${MAX_EXECUTION_MS / 1000}s). Arrêt de la boucle.`);
        context.emitEvent({ type: 'error', message: 'Temps d\'exécution maximal atteint (5 min). Tâche interrompue.', fatal: false });
        break;
      }

      // Guard 2 : Élagage du contexte — on conserve le system prompt + les 30 derniers messages
      if (messages.length > MAX_MESSAGES) {
        const systemMessages = messages.filter(m => m.role === 'system');
        const nonSystemMessages = messages.filter(m => m.role !== 'system');
        const pruned = nonSystemMessages.slice(-(MAX_MESSAGES - systemMessages.length));
        messages.length = 0;
        messages.push(...systemMessages, ...pruned);
        console.log(`[AgentLoop] Contexte élagué à ${messages.length} messages.`);
      }

      iteration++;
      console.log(`[AgentLoop][Session: ${context.sessionId}] Tour de boucle ${iteration}/${maxTours}`);

      const tools = toolRegistry.getDefinitionsForModel();
      let iterationText = '';
      const pendingToolCalls: Array<{ id: string; name: string; argumentsJson: string }> = [];
      let currentToolCall: { id: string; name: string; argumentsJson: string } | null = null;

      try {
        for await (const chunk of modelGateway.generateStream(
          {
            messages,
            tools,
            temperature: 0.1
          },
          options.preferredProviderId
        )) {
          if (options.abortSignal?.aborted) break;

          if (chunk.type === 'thinking_delta') {
            context.emitEvent({ type: 'thinking', content: chunk.text });
          } else if (chunk.type === 'text_delta') {
            iterationText += chunk.text;
            context.emitEvent({
              type: 'message',
              role: 'assistant',
              content: chunk.text,
              partial: true
            });
          } else if (chunk.type === 'tool_call_delta') {
            if (chunk.name) {
              if (currentToolCall) {
                pendingToolCalls.push(currentToolCall);
              }
              currentToolCall = {
                id: chunk.id || `call_${Date.now()}`,
                name: chunk.name,
                argumentsJson: chunk.argumentsDelta || ''
              };
            } else if (currentToolCall && chunk.argumentsDelta) {
              currentToolCall.argumentsJson += chunk.argumentsDelta;
            }
          }
        }

        if (currentToolCall) {
          pendingToolCalls.push(currentToolCall);
        }

        if (iterationText) {
          finalAssistantText = iterationText;

          // Guard 3 : Détection de répétition de texte (prévention du bug "shame shame..." ou boucles de texte)
          const trimmed = iterationText.trim();
          if (trimmed.length > 0) {
            recentTexts.push(trimmed);
            if (recentTexts.length > 5) recentTexts.shift();
            const repetitions = recentTexts.filter(t => t === trimmed).length;
            if (repetitions >= REPETITION_THRESHOLD) {
              console.warn(`[AgentLoop] Détection de répétition de texte (${repetitions}x). Arrêt d'urgence de sécurité.`);
              context.emitEvent({
                type: 'error',
                message: 'Boucle de répétition textuelle détectée. Arrêt automatique de sécurité.',
                fatal: false
              });
              break;
            }
          }
        }

        // Si aucun outil n'a été appelé, l'agent a terminé sa réflexion
        if (pendingToolCalls.length === 0) {
          console.log(`[AgentLoop] Aucun outil demandé. Conclusion de la tâche.`);
          break;
        }

        // Enregistrer la réponse de l'assistant avec les toolCalls
        const toolCallsForMessage = pendingToolCalls.map(tc => {
          let parsedArgs = {};
          try {
            parsedArgs = JSON.parse(tc.argumentsJson || '{}');
          } catch {
            parsedArgs = { raw: tc.argumentsJson };
          }
          return {
            id: tc.id,
            name: tc.name,
            arguments: parsedArgs
          };
        });

        messages.push({
          role: 'assistant',
          content: iterationText,
          toolCalls: toolCallsForMessage
        });

        // Exécuter chaque outil séquentiellement
        for (const tc of toolCallsForMessage) {
          if (options.abortSignal?.aborted) break;

          context.emitEvent({
            type: 'status',
            status: 'executing_tool',
            message: `Exécution de l'outil "${tc.name}"...`
          });

          const result = await toolRegistry.executeTool(tc.name, tc.arguments, context, tc.id);

          // Injecter le résultat de l'outil comme observation dans l'historique de conversation
          messages.push({
            role: 'tool',
            toolCallId: tc.id,
            name: tc.name,
            content: result.success 
              ? JSON.stringify(result.data ?? 'Succès') 
              : `ERREUR: ${result.error || 'Échec de l\'outil'}`
          });
        }

        context.emitEvent({
          type: 'status',
          status: 'thinking',
          message: 'Analyse des résultats...'
        });

      } catch (err: any) {
        console.error(`[AgentLoop] Erreur critique à l'itération ${iteration} :`, err);
        context.emitEvent({
          type: 'error',
          message: err.message || 'Erreur inattendue dans la boucle agentique',
          fatal: false
        });
        break;
      }
    }

    const changedArray = Array.from(filesChanged);
    let verificationNote = '';

    // Si des fichiers ont été modifiés, exécuter la vérification automatisée de fin de tâche
    if (changedArray.length > 0 && !options.abortSignal?.aborted) {
      context.emitEvent({
        type: 'status',
        status: 'verifying',
        message: 'Vérification automatisée du projet en cours...'
      });

      try {
        const vResult = await verificationEngine.runVerification(context.workspacePath, context.emitEvent);
        verificationNote = vResult.allPassed
          ? `\n\n✅ ${vResult.summary}`
          : `\n\n⚠️ ${vResult.summary}`;
      } catch (vErr: any) {
        console.warn('[AgentLoop] Erreur lors de la vérification automatique :', vErr);
      }
    }

    const finalSummary = (finalAssistantText || 'Tâche terminée.') + verificationNote;

    context.emitEvent({
      type: 'completed',
      summary: finalSummary,
      filesChanged: changedArray
    });

    context.emitEvent({
      type: 'status',
      status: 'completed',
      message: 'Tâche achevée avec succès.'
    });

    return {
      success: true,
      summary: finalSummary,
      filesChanged: changedArray
    };
  }
}
