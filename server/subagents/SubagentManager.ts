// server/subagents/SubagentManager.ts
// Cahier §11 : Orchestration des sous-agents internes, routage de modèles et confinement des permissions

import { ToolContext } from '../tools/types';
import { toolRegistry } from '../tools/ToolRegistry';
import { modelRouter } from '../models/router/ModelRouter';
import { keyPoolManager } from '../models/keys/KeyPoolManager';
import { ModelRequest } from '../models/types';
import {
  SubagentType,
  ModelProfile,
  SubagentRequest,
  SubagentResult,
  SUBAGENT_DEFINITIONS
} from './types';

export class SubagentManager {
  /**
   * Sélectionne le modèle et le fournisseur optimaux selon le profil demandé (§11).
   * Gère les 3 profils : 'fast' (rapide), 'powerful' (puissant), 'local' (local).
   */
  public selectModelForProfile(profile: ModelProfile): { providerId: string; model: string } {
    const configuredProviders = keyPoolManager.getConfiguredProviderIds();

    if (profile === 'local') {
      if (configuredProviders.includes('ollama')) {
        return { providerId: 'ollama', model: 'llama3:latest' };
      }
      if (configuredProviders.includes('lmstudio')) {
        return { providerId: 'lmstudio', model: 'local-model' };
      }
      if (configuredProviders.includes('custom')) {
        return { providerId: 'custom', model: 'custom-local' };
      }
      // Repli si aucun provider local n'est configuré
      return { providerId: 'mock', model: 'mock-local-fallback' };
    }

    if (profile === 'fast') {
      if (configuredProviders.includes('gemini')) {
        return { providerId: 'gemini', model: 'gemini-2.5-flash' };
      }
      if (configuredProviders.includes('openai')) {
        return { providerId: 'openai', model: 'gpt-4o-mini' };
      }
      if (configuredProviders.includes('anthropic')) {
        return { providerId: 'anthropic', model: 'claude-3-5-haiku-20241022' };
      }
      if (configuredProviders.includes('openrouter')) {
        return { providerId: 'openrouter', model: 'google/gemini-2.5-flash' };
      }
      // Si un provider local est disponible
      if (configuredProviders.includes('ollama')) {
        return { providerId: 'ollama', model: 'llama3:latest' };
      }
      return { providerId: 'mock', model: 'mock-fast' };
    }

    // Profil 'powerful' par défaut
    if (configuredProviders.includes('anthropic')) {
      return { providerId: 'anthropic', model: 'claude-3-7-sonnet-20250219' };
    }
    if (configuredProviders.includes('openai')) {
      return { providerId: 'openai', model: 'gpt-4o' };
    }
    if (configuredProviders.includes('gemini')) {
      return { providerId: 'gemini', model: 'gemini-2.5-pro' };
    }
    if (configuredProviders.includes('openrouter')) {
      return { providerId: 'openrouter', model: 'anthropic/claude-3.7-sonnet' };
    }
    return { providerId: 'mock', model: 'mock-powerful' };
  }

  /**
   * Confinement des permissions : crée un contexte restreint pour le sous-agent.
   * "Un sous-agent ne peut jamais dépasser les permissions de son parent." (§11)
   */
  private createSubagentContext(subagentType: SubagentType, parentContext: ToolContext): ToolContext {
    const def = SUBAGENT_DEFINITIONS[subagentType];

    // Créer un proxy pour le permissionEngine qui applique le plafond de sécurité
    const restrictedPermissionEngine = new Proxy(parentContext.permissionEngine, {
      get: (target, prop, receiver) => {
        if (prop === 'requestPermission') {
          return async (tool: string, level: any, description: string, details?: any) => {
            // Vérifier si l'outil est autorisé pour ce rôle
            if (!def.allowedTools.includes(tool)) {
              console.warn(`[Subagent:${subagentType}] Outil "${tool}" interdit pour le rôle.`);
              return false;
            }

            // Vérifier si le niveau dépasse le plafond du sous-agent
            if (def.maxAllowedPermission === 'SAFE' && level !== 'SAFE') {
              console.warn(`[Subagent:${subagentType}] Niveau "${level}" dépasse le plafond SAFE du sous-agent.`);
              return false;
            }

            // Déléguer au moteur parent pour le respect des règles globales
            return await (target as any).requestPermission(tool, level, description, details);
          };
        }
        return Reflect.get(target, prop, receiver);
      }
    });

    return {
      ...parentContext,
      permissionEngine: restrictedPermissionEngine as any,
      // Événements invisibles : ne pas polluer le chat principal de l'utilisateur
      emitEvent: (event) => {
        parentContext.emitEvent({
          ...event,
          // Marqueur interne pour filtrage d'affichage
          ...(typeof event === 'object' ? { internal: true, subagent: subagentType } : {})
        } as any);
      }
    };
  }

  /**
   * Exécute un sous-agent de manière autonome et retourne un résultat structuré au parent.
   */
  public async executeSubagent(request: SubagentRequest, parentContext: ToolContext): Promise<SubagentResult> {
    const startTime = Date.now();
    const def = SUBAGENT_DEFINITIONS[request.type];
    if (!def) {
      return {
        subagentType: request.type,
        status: 'failed',
        summary: `Type de sous-agent inconnu : "${request.type}"`,
        findings: [],
        modelUsed: 'unknown',
        providerUsed: 'unknown',
        durationMs: 0,
        error: `Sous-agent "${request.type}" non reconnu.`
      };
    }

    const subContext = this.createSubagentContext(request.type, parentContext);
    const profile = request.modelProfile || def.defaultProfile;
    const { providerId, model } = this.selectModelForProfile(profile);

    try {
      // 1. Rassembler le contexte initial selon le type de sous-agent
      let contextSummary = '';
      if (request.context) {
        contextSummary = `Contexte fourni :\n${JSON.stringify(request.context, null, 2)}\n\n`;
      }

      // 2. Construire le prompt système spécialisé
      const systemPrompt = [
        def.systemInstructions,
        '',
        `Outils autorisés : ${def.allowedTools.join(', ')}`,
        'Format de réponse attendu (JSON strict) :',
        '{',
        '  "summary": "Résumé concis de la mission et des conclusions",',
        '  "findings": ["Point marquant 1", "Point marquant 2"],',
        '  "suggestedActions": ["Action recommandée 1", "Action recommandée 2"]',
        '}'
      ].join('\n');

      const modelReq: ModelRequest = {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `${contextSummary}Tâche assignée : ${request.task}` }
        ],
        modelId: model,
        temperature: 0.2,
        maxTokens: 2000,
        abortSignal: parentContext.abortSignal
      };

      // 3. Appel du modèle via le routeur avec repli automatique
      let fullResponseText = '';
      for await (const chunk of modelRouter.generateStream(modelReq, providerId)) {
        if (chunk.type === 'text_delta' && chunk.text) {
          fullResponseText += chunk.text;
        }
      }

      // 4. Parser le résultat structuré
      const parsed = this.parseStructuredOutput(fullResponseText, request.type);
      const durationMs = Date.now() - startTime;

      return {
        subagentType: request.type,
        status: 'completed',
        summary: parsed.summary,
        findings: parsed.findings,
        suggestedActions: parsed.suggestedActions,
        data: parsed.data,
        modelUsed: model,
        providerUsed: providerId,
        durationMs
      };
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      return {
        subagentType: request.type,
        status: 'failed',
        summary: `Échec du sous-agent ${request.type} : ${err.message || String(err)}`,
        findings: [],
        modelUsed: model,
        providerUsed: providerId,
        durationMs,
        error: err.message || String(err)
      };
    }
  }

  /**
   * Extrait le JSON structuré de la réponse du modèle ou construit une structure sobre à partir du texte.
   */
  private parseStructuredOutput(text: string, type: SubagentType): {
    summary: string;
    findings: string[];
    suggestedActions: string[];
    data?: any;
  } {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const obj = JSON.parse(jsonMatch[0]);
        return {
          summary: obj.summary || `Mission de sous-agent ${type} terminée.`,
          findings: Array.isArray(obj.findings) ? obj.findings : [],
          suggestedActions: Array.isArray(obj.suggestedActions) ? obj.suggestedActions : [],
          data: obj.data
        };
      } catch {}
    }

    // Repli : découpage textuel par lignes
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const findings = lines.filter(l => l.startsWith('-') || l.startsWith('*')).map(l => l.replace(/^[-*]\s*/, ''));

    return {
      summary: lines[0] || `Analyse du sous-agent ${type} complétée.`,
      findings: findings.length > 0 ? findings : [text.slice(0, 300)],
      suggestedActions: []
    };
  }
}

export const subagentManager = new SubagentManager();
