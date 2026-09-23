// server/plugins/types.ts
// Cahier §11, §13, §15 : Spécification des paquets de plugins (compétences, connecteurs, règles)

import { McpServerConfig } from '../tools/mcp/McpClient';

export interface PluginSkill {
  name: string;
  description: string;
  instructions: string;
}

export interface PluginMetadata {
  id: string;
  name: string;
  version: string;
  description: string;
  author?: string;
  homepage?: string;
}

export interface IrokoPluginPackage {
  schemaVersion: '1.0';
  metadata: PluginMetadata;
  skills?: PluginSkill[];
  connectors?: McpServerConfig[];
  rules?: string[];
  requiredPermissions?: string[];
}

export interface PluginValidationIssue {
  severity: 'error' | 'warning';
  field: string;
  message: string;
}

export interface PluginValidationReport {
  valid: boolean;
  canActivate: boolean;
  issues: PluginValidationIssue[];
  securitySummary: {
    hasMcpServers: boolean;
    hasSkills: boolean;
    hasRules: boolean;
    mcpRiskLevel: 'SAFE' | 'MEDIUM' | 'HIGH';
  };
}

export interface InstalledPlugin {
  id: string;
  name: string;
  version: string;
  description: string;
  author?: string;
  enabled: boolean;
  validated: boolean;
  installedAt: number;
  packageData: IrokoPluginPackage;
}
