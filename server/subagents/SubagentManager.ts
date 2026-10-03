// server/subagents/SubagentManager.ts
// Cahier §11 : Orchestration des sous-agents, routage de modèles et confinement des permissions

import { ToolContext, ToolResult } from '../tools/types';
import { toolRegistry } from '../tools/ToolRegistry';
import { modelRouter } from '../models/router/ModelRouter';
import { keyPoolManager } from '../models/keys/KeyPoolManager';
import { ModelRequest } from '../models/types';
import { runtimeDatabase } from '../storage/RuntimeDatabase';
import {
  SubagentType,
  ModelProfile,
  TaskComplexity,
  SubagentRequest,
  SubagentResult,
  SUBAGENT_DEFINITIONS
} from './types';

export class SubagentManager {
  /** Estime la complexité heuristique d'une tâche de sous-agent (§11). */
  public estimateComplexity(
    task: string,
    context?: Record<string, any>,
    type?: SubagentType
  ): TaskComplexity {
    const lower = (task || '').toLowerCase();
    const complexWords = [
      'approfondi', 'architecture', 'refactor', 'fuite', 'memory leak',
      'performance', 'sécurité', 'vulnérabilité', 'conflit', 'régression',
      'complexe', 'audit', 'deep', 'cryptique', 'root cause', 'cause racine'
    ];
    const simpleWords = [
      'lister', 'trouver', 'localiser', 'chercher', 'vérifier si',
      'lire', 'afficher', 'simple', 'count', 'combien', 'existe', 'chemin'
    ];

    const hasComplex = complexWords.some(w => lower.includes(w));
    const hasSimple = simpleWords.some(w => lower.includes(w));

    if (hasComplex && !hasSimple) return 'complex';
    if (hasSimple && !hasComplex) return 'simple';

    if (lower.length > 180 || (context && Object.keys(context).length > 3)) return 'complex';
    return (type === 'debug' || type === 'review') ? 'complex' : 'simple';
  }

  /** Vérifie si le routage automatique est activé dans la configuration (§11). */
  public isAutoRoutingEnabled(): boolean {
    const s = runtimeDatabase.getSetting('subagent_auto_routing');
    return s === null || s === undefined ? true : Boolean(s === true || s === 'true' || s === 1 || s === '1');
  }

  /** Sélectionne le modèle et le fournisseur optimaux selon le profil demandé (§11). */
  public selectModelForProfile(profile: ModelProfile): { providerId: string; model: string } {
    const p = keyPoolManager.getConfiguredProviderIds();
    if (profile === 'local') {
      if (p.includes('ollama')) return { providerId: 'ollama', model: 'llama3:latest' };
      if (p.includes('lmstudio')) return { providerId: 'lmstudio', model: 'local-model' };
      if (p.includes('custom')) return { providerId: 'custom', model: 'custom-local' };
      return { providerId: 'mock', model: 'mock-local-fallback' };
    }
    if (profile === 'fast') {
      if (p.includes('gemini')) return { providerId: 'gemini', model: 'gemini-2.5-flash' };
      if (p.includes('openai')) return { providerId: 'openai', model: 'gpt-4o-mini' };
      if (p.includes('anthropic')) return { providerId: 'anthropic', model: 'claude-3-5-haiku-20241022' };
      if (p.includes('openrouter')) return { providerId: 'openrouter', model: 'google/gemini-2.5-flash' };
      if (p.includes('ollama')) return { providerId: 'ollama', model: 'llama3:latest' };
      return { providerId: 'mock', model: 'mock-fast' };
    }
    if (p.includes('anthropic')) return { providerId: 'anthropic', model: 'claude-3-7-sonnet-20250219' };
    if (p.includes('openai')) return { providerId: 'openai', model: 'gpt-4o' };
    if (p.includes('gemini')) return { providerId: 'gemini', model: 'gemini-2.5-pro' };
    if (p.includes('openrouter')) return { providerId: 'openrouter', model: 'anthropic/claude-sonnet-4.5' };
    return { providerId: 'mock', model: 'mock-powerful' };
  }

  private inferProviderFromModelId(modelId: string): string {
    const m = (modelId || '').toLowerCase();
    if (m.includes('claude')) return 'anthropic';
    if (m.includes('gpt') || m.includes('o1') || m.includes('o3') || m.includes('o4')) return 'openai';
    if (m.includes('gemini')) return 'gemini';
    if (m.includes('mistral')) return 'mistral';
    if (m.includes('llama')) return 'ollama';
    return 'mock';
  }

  /** Résout le modèle à employer selon la complexité et les réglages utilisateur. */
  public resolveModelForRequest(
    request: SubagentRequest,
    parentContext: ToolContext
  ): { providerId: string; model: string; complexity: TaskComplexity; routingMode: 'auto' | 'manual' } {
    const complexity = this.estimateComplexity(request.task, request.context, request.type);
    const autoRouting = this.isAutoRoutingEnabled();

    if (!autoRouting) {
      if (parentContext.currentModelId) {
        const manualModel = parentContext.currentModelId;
        const manualProvider = parentContext.currentProviderId || this.inferProviderFromModelId(manualModel);
        console.log(`[Subagent:${request.type}] Routage auto désactivé -> modèle parent "${manualModel}" (${manualProvider})`);
        return { providerId: manualProvider, model: manualModel, complexity, routingMode: 'manual' };
      }
      const def = SUBAGENT_DEFINITIONS[request.type];
      const fallback = this.selectModelForProfile(request.modelProfile || def?.defaultProfile || 'fast');
      return { ...fallback, complexity, routingMode: 'manual' };
    }

    if (request.modelProfile) {
      const choice = this.selectModelForProfile(request.modelProfile);
      return { ...choice, complexity, routingMode: 'auto' };
    }

    const targetProfile: ModelProfile = complexity === 'simple' ? 'fast' : 'powerful';
    const choice = this.selectModelForProfile(targetProfile);
    console.log(`[Subagent:${request.type}] Routage auto (${complexity}) -> profil "${targetProfile}" : modèle "${choice.model}" (${choice.providerId})`);
    return { ...choice, complexity, routingMode: 'auto' };
  }

  /** Confinement strict des permissions : un sous-agent ne dépasse jamais son parent (§11). */
  public createSubagentContext(subagentType: SubagentType, parentContext: ToolContext): ToolContext {
    const def = SUBAGENT_DEFINITIONS[subagentType];

    const restrictedPermissionEngine = new Proxy(parentContext.permissionEngine, {
      get: (target, prop, receiver) => {
        if (prop === 'requestPermission') {
          return async (tool: string, level: any, description: string, details?: any) => {
            if (parentContext.isReadOnly && level !== 'SAFE') {
              console.warn(`[Subagent:${subagentType}] Rejeté : parent en lecture seule.`);
              return false;
            }
            if (!def || !def.allowedTools.includes(tool)) {
              console.warn(`[Subagent:${subagentType}] Outil "${tool}" interdit pour le rôle.`);
              return false;
            }
            if (def.maxAllowedPermission === 'SAFE' && level !== 'SAFE') {
              console.warn(`[Subagent:${subagentType}] Niveau "${level}" dépasse le plafond SAFE.`);
              return false;
            }
            return await (target as any).requestPermission(tool, level, description, details);
          };
        }
        return Reflect.get(target, prop, receiver);
      }
    });

    return {
      ...parentContext,
      permissionEngine: restrictedPermissionEngine as any,
      emitEvent: (event) => {
        parentContext.emitEvent({
          ...event,
          ...(typeof event === 'object' ? { internal: true, subagent: subagentType } : {})
        } as any);
      }
    };
  }

  /** Exécute un outil de manière confinée au nom du sous-agent en respectant les permissions. */
  public async executeSubagentTool(
    toolName: string,
    args: any,
    subContext: ToolContext,
    subagentType: SubagentType
  ): Promise<ToolResult> {
    const tool = toolRegistry.getTool(toolName);
    if (!tool) return { success: false, error: `Outil "${toolName}" inexistant dans le registre.` };

    const allowed = await subContext.permissionEngine.requestPermission(
      toolName,
      tool.permission,
      `Exécution de l'outil ${toolName} par le sous-agent ${subagentType}`
    );

    if (!allowed) {
      return { success: false, error: `Action "${toolName}" interdite pour le sous-agent ${subagentType} ou refusée par le parent.` };
    }
    return await toolRegistry.executeTool(toolName, args, subContext);
  }

  /** Exécute un sous-agent de manière autonome et retourne un résultat structuré au parent. */
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

    this.createSubagentContext(request.type, parentContext);
    const { providerId, model, complexity, routingMode } = this.resolveModelForRequest(request, parentContext);

    try {
      let contextSummary = '';
      if (request.context) {
        contextSummary = `Contexte fourni :\n${JSON.stringify(request.context, null, 2)}\n\n`;
      }

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

      let fullResponseText = '';
      for await (const chunk of modelRouter.generateStream(modelReq, providerId)) {
        if (chunk.type === 'text_delta' && chunk.text) {
          fullResponseText += chunk.text;
        }
      }

      const parsed = this.parseStructuredOutput(fullResponseText, request.type);
      return {
        subagentType: request.type,
        status: 'completed',
        summary: parsed.summary,
        findings: parsed.findings,
        suggestedActions: parsed.suggestedActions,
        data: parsed.data,
        modelUsed: model,
        providerUsed: providerId,
        durationMs: Date.now() - startTime,
        complexityEstimated: complexity,
        routingMode
      };
    } catch (err: any) {
      return {
        subagentType: request.type,
        status: 'failed',
        summary: `Échec du sous-agent ${request.type} : ${err.message || String(err)}`,
        findings: [],
        modelUsed: model,
        providerUsed: providerId,
        durationMs: Date.now() - startTime,
        complexityEstimated: complexity,
        routingMode,
        error: err.message || String(err)
      };
    }
  }

  /** Extrait le JSON structuré de la réponse du modèle ou replie sur un découpage textuel. */
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
