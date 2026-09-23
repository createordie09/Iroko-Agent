// server/subagents/types.ts
// Cahier §11 : Spécification des sous-agents spécialisés (explore, debug, review, test)

import { PermissionLevel } from '../types/events';

export type SubagentType = 'explore' | 'debug' | 'review' | 'test';

export type ModelProfile = 'fast' | 'powerful' | 'local';

export interface SubagentRequest {
  type: SubagentType;
  task: string;
  context?: Record<string, any>;
  modelProfile?: ModelProfile;
  maxTurns?: number;
  timeoutMs?: number;
}

export interface SubagentResult<T = any> {
  subagentType: SubagentType;
  status: 'completed' | 'failed';
  summary: string;
  findings: string[];
  data?: T;
  suggestedActions?: string[];
  modelUsed: string;
  providerUsed: string;
  durationMs: number;
  error?: string;
}

export interface SubagentDefinition {
  type: SubagentType;
  description: string;
  defaultProfile: ModelProfile;
  maxAllowedPermission: PermissionLevel;
  allowedTools: string[];
  systemInstructions: string;
}

export const SUBAGENT_DEFINITIONS: Record<SubagentType, SubagentDefinition> = {
  explore: {
    type: 'explore',
    description: 'Exploration de la structure du code, recherche de fichiers et de symboles sans modification.',
    defaultProfile: 'fast',
    maxAllowedPermission: 'SAFE',
    allowedTools: [
      'list_dir',
      'read_file',
      'search_text',
      'get_diagnostics',
      'find_definition',
      'find_references'
    ],
    systemInstructions: [
      'Tu es un sous-agent d\'exploration interne et invisible.',
      'Ton rôle est d\'explorer le workspace, localiser les fichiers pertinents et identifier l\'architecture.',
      'Tu es strictement en lecture seule. Tu ne modifies aucun fichier et n\'exécutes aucune commande destructive.',
      'Fournis un résumé concis, une liste de découvertes (findings) précises et des suggestions claires pour l\'agent parent.'
    ].join(' ')
  },
  debug: {
    type: 'debug',
    description: 'Analyse d\'erreurs, de traces d\'exécution et de diagnostics LSP pour identifier la cause racine.',
    defaultProfile: 'powerful',
    maxAllowedPermission: 'SAFE',
    allowedTools: [
      'read_file',
      'search_text',
      'get_diagnostics',
      'find_definition',
      'find_references',
      'git_diff',
      'git_status',
      'git_log'
    ],
    systemInstructions: [
      'Tu es un sous-agent de débogage interne et invisible.',
      'Ton rôle est d\'analyser les erreurs de compilation, les échecs de tests et les régressions pour identifier la cause racine.',
      'Tu es en lecture seule. Tu inspectes le code, les types et les diffs récents.',
      'Fournis un résumé de l\'origine du bogue, les lignes exactes incriminées et les correctifs recommandés.'
    ].join(' ')
  },
  review: {
    type: 'review',
    description: 'Revue de code, vérification de conformité, sécurité et détection de régressions.',
    defaultProfile: 'powerful',
    maxAllowedPermission: 'SAFE',
    allowedTools: [
      'read_file',
      'search_text',
      'git_diff',
      'git_status',
      'git_log'
    ],
    systemInstructions: [
      'Tu es un sous-agent de revue de code interne et invisible.',
      'Ton rôle est de vérifier la qualité, le respect des consignes architecturales et la sécurité des modifications.',
      'Vérifie qu\'aucun secret n\'est exposé, que les règles de style et de typage sont respectées et qu\'il n\'y a aucune régression.',
      'Fournis une synthèse structurée des points forts et des anomalies détectées.'
    ].join(' ')
  },
  test: {
    type: 'test',
    description: 'Exécution ciblée de tests et vérification de la non-régression du projet.',
    defaultProfile: 'fast',
    maxAllowedPermission: 'MEDIUM',
    allowedTools: [
      'verify_project',
      'execute_command',
      'read_file',
      'get_process_output',
      'list_processes'
    ],
    systemInstructions: [
      'Tu es un sous-agent de test interne et invisible.',
      'Ton rôle est de lancer les tests du projet, d\'analyser les résultats et d\'isoler les cas d\'échec.',
      'Tu ne modifies pas le code source. Tu vérifies la conformité et rapportes les résultats à l\'agent parent.'
    ].join(' ')
  }
};
