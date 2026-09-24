import crypto from 'crypto';
import { IrokoTool, ToolContext, ToolResult } from './types';
import { ToolDefinition } from '../models/types';
import { ListDirTool } from './filesystem/list_dir';
import { ReadFileTool } from './filesystem/read_file';
import { SearchTextTool } from './filesystem/search_text';
import { EditFileTool } from './filesystem/edit_file';
import { WriteFileTool } from './filesystem/write_file';
import { ExecuteCommandTool } from './terminal/execute_command';
import { StartProcessTool } from './terminal/start_process';
import { StopProcessTool } from './terminal/stop_process';
import { GetProcessOutputTool } from './terminal/get_process_output';
import { ListProcessesTool } from './terminal/list_processes';
import { GitStatusTool } from './git/git_status';
import { GitDiffTool } from './git/git_diff';
import { GitLogTool } from './git/git_log';
import { GitAddTool } from './git/git_add';
import { GitCommitTool } from './git/git_commit';
import { GitBranchTool } from './git/git_branch';
import { GitCreateBranchTool } from './git/git_create_branch';
import { VerifyProjectTool } from './testing/verify_project';
import { GetDiagnosticsTool } from './lsp/get_diagnostics';
import { FindDefinitionTool } from './lsp/find_definition';
import { FindReferencesTool } from './lsp/find_references';
import { RememberFactTool } from './memory/remember_fact';
import { BrowserNavigateTool } from './browser/browser_navigate';
import { BrowserScreenshotTool } from './browser/browser_screenshot';
import { BrowserClickTool } from './browser/browser_click';
import { BrowserFillTool } from './browser/browser_fill';
import { BrowserCloseTool } from './browser/browser_close';
import { InvokeSubagentTool } from './subagents/invoke_subagent';
import { ReadAttachmentTool } from './attachments/read_attachment';
import { CreateArtifactTool } from './artifacts/create_artifact';
import { UpdateArtifactTool } from './artifacts/update_artifact';
import { CreateDocumentTool } from './artifacts/create_document';
import { RegisterArtifactTool } from './artifacts/register_artifact';
import { GenerateImageTool } from './media/generate_image';
import { GenerateVideoTool } from './media/generate_video';
import { RunSkillScriptTool } from './skills/run_skill_script';
import { mediaGateway } from '../media/MediaGateway';
import { videoGateway } from '../media/VideoGateway';
import { PermissionStore } from '../permissions/PermissionStore';
import { runtimeDatabase } from '../storage/RuntimeDatabase';

export interface ToolStatusInfo {
  name: string;
  description: string;
  category: string;
  permission: string;
  enabled: boolean;
  available: boolean;
  reasonDisabled?: string;
}

export class ToolRegistry {
  private tools: Map<string, IrokoTool> = new Map();
  private disabledTools: Set<string> = new Set();

  constructor() {
    // Outils Filesystem
    this.register(new ListDirTool());
    this.register(new ReadFileTool());
    this.register(new SearchTextTool());
    this.register(new EditFileTool());
    this.register(new WriteFileTool());

    // Outils Terminal & Process
    this.register(new ExecuteCommandTool());
    this.register(new StartProcessTool());
    this.register(new StopProcessTool());
    this.register(new GetProcessOutputTool());
    this.register(new ListProcessesTool());

    // Outils Git
    this.register(new GitStatusTool());
    this.register(new GitDiffTool());
    this.register(new GitLogTool());
    this.register(new GitAddTool());
    this.register(new GitCommitTool());
    this.register(new GitBranchTool());
    this.register(new GitCreateBranchTool());

    // Outils Testing & Verification
    this.register(new VerifyProjectTool());

    // Outils LSP & Intelligence de code
    this.register(new GetDiagnosticsTool());
    this.register(new FindDefinitionTool());
    this.register(new FindReferencesTool());

    // Outils Mémoire (§20)
    this.register(new RememberFactTool());

    // Outils Navigateur (§16)
    this.register(new BrowserNavigateTool());
    this.register(new BrowserScreenshotTool());
    this.register(new BrowserClickTool());
    this.register(new BrowserFillTool());
    this.register(new BrowserCloseTool());

    // Outils Sous-Agents (§11)
    this.register(new InvokeSubagentTool());

    // Outils Pièces Jointes (§26)
    this.register(new ReadAttachmentTool());

    // Outils Artéfacts (Missions M4 & M5)
    this.register(new CreateArtifactTool());
    this.register(new UpdateArtifactTool());
    this.register(new CreateDocumentTool());
    this.register(new RegisterArtifactTool());

    // Outils Médias & Images/Vidéos (Missions M6 & M7)
    this.register(new GenerateImageTool());
    this.register(new GenerateVideoTool());

    // Outils Compétences Niveau 3 (Mission N1)
    this.register(new RunSkillScriptTool());

    // Charger l'état d'activation persisté
    this.loadDisabledTools();
  }

  private loadDisabledTools(): void {
    try {
      const saved = runtimeDatabase.getSetting('disabled_tools');
      if (Array.isArray(saved)) {
        this.disabledTools = new Set(saved);
      }
    } catch {}
  }

  public isToolEnabled(name: string): boolean {
    return !this.disabledTools.has(name);
  }

  public setToolEnabled(name: string, enabled: boolean): void {
    if (enabled) {
      this.disabledTools.delete(name);
    } else {
      this.disabledTools.add(name);
    }
    try {
      runtimeDatabase.setSetting('disabled_tools', Array.from(this.disabledTools));
    } catch {}
  }

  public isToolAvailable(name: string): { available: boolean; reasonDisabled?: string } {
    const tool = this.getTool(name);
    if (!tool) {
      return { available: false, reasonDisabled: 'Outil non enregistré.' };
    }

    // Outil de génération d'image : requiert un fournisseur configuré (Cahier §10, §26)
    if (name === 'generate_image') {
      if (!mediaGateway.hasConfiguredProvider()) {
        return {
          available: false,
          reasonDisabled: 'Aucun fournisseur d\'images configuré dans Paramètres › Fournisseurs & Clés.'
        };
      }
      return { available: true };
    }

    // Outil de génération de vidéo : requiert un fournisseur configuré (Cahier §10, §26)
    if (name === 'generate_video') {
      if (!videoGateway.hasConfiguredProvider()) {
        return {
          available: false,
          reasonDisabled: 'Aucun fournisseur de vidéos configuré dans Paramètres › Fournisseurs & Clés.'
        };
      }
      return { available: true };
    }

    // Outil LSP dépendant d'un serveur ou d'une configuration
    if (name === 'get_diagnostics') {
      // Vérifier si le gestionnaire LSP est configuré
      return { available: true };
    }

    return { available: true };
  }

  public getToolStatus(name: string): ToolStatusInfo | null {
    const tool = this.getTool(name);
    if (!tool) return null;
    const avail = this.isToolAvailable(name);
    return {
      name: tool.name,
      description: tool.description,
      category: tool.category,
      permission: tool.permission,
      enabled: this.isToolEnabled(name),
      available: avail.available,
      reasonDisabled: avail.reasonDisabled
    };
  }

  public getAllToolsStatus(): ToolStatusInfo[] {
    return this.getAllTools().map(tool => {
      const avail = this.isToolAvailable(tool.name);
      return {
        name: tool.name,
        description: tool.description,
        category: tool.category,
        permission: tool.permission,
        enabled: this.isToolEnabled(tool.name),
        available: avail.available,
        reasonDisabled: avail.reasonDisabled
      };
    });
  }

  public getEnabledToolsCount(): number {
    return this.getAllTools().filter(
      tool => this.isToolEnabled(tool.name) && this.isToolAvailable(tool.name).available
    ).length;
  }

  public register(tool: IrokoTool): void {
    this.tools.set(tool.name, tool);
  }

  public getTool(name: string): IrokoTool | undefined {
    return this.tools.get(name);
  }

  public getAllTools(): IrokoTool[] {
    return Array.from(this.tools.values());
  }

  public getDefinitionsForModel(mode?: 'execute' | 'plan', conversationMode: 'chat' | 'code' = 'code'): ToolDefinition[] {
    let tools = (mode === 'plan'
      ? this.getAllTools().filter(t => t.permission === 'SAFE')
      : this.getAllTools()
    ).filter(t => this.isToolEnabled(t.name) && this.isToolAvailable(t.name).available);

    if (conversationMode === 'chat') {
      const codeTools = new Set([
        'list_dir', 'read_file', 'search_text', 'edit_file', 'write_file',
        'execute_command', 'start_process', 'stop_process', 'get_process_output', 'list_processes',
        'git_status', 'git_diff', 'git_log', 'git_add', 'git_commit', 'git_branch', 'git_create_branch',
        'verify_project', 'get_diagnostics', 'find_definition', 'find_references', 'invoke_subagent',
        'run_skill_script'
      ]);
      tools = tools.filter(t => !codeTools.has(t.name));
    }

    return tools.map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters
    }));
  }

  public async executeTool(
    name: string,
    input: unknown,
    context: ToolContext,
    callId?: string
  ): Promise<ToolResult> {
    const id = callId || crypto.randomUUID();
    const tool = this.getTool(name);

    if (context.conversationMode === 'chat') {
      const codeTools = new Set([
        'list_dir', 'read_file', 'search_text', 'edit_file', 'write_file',
        'execute_command', 'start_process', 'stop_process', 'get_process_output', 'list_processes',
        'git_status', 'git_diff', 'git_log', 'git_add', 'git_commit', 'git_branch', 'git_create_branch',
        'verify_project', 'get_diagnostics', 'find_definition', 'find_references', 'invoke_subagent',
        'run_skill_script'
      ]);
      if (codeTools.has(name)) {
        return {
          success: false,
          error: `L'outil "${name}" est désactivé : Mode Chat actif. Basculez en mode Code dans la conversation pour exécuter des actions sur les fichiers ou le système.`
        };
      }
    }

    if (context.isReadOnly) {
      const modifyingTools = new Set([
        'write_file', 'edit_file', 'git_add', 'git_commit', 'git_create_branch'
      ]);
      if (modifyingTools.has(name)) {
        return {
          success: false,
          error: `Action refusée : ce dossier est actuellement ouvert en lecture seule car une autre conversation détient le verrou d'écriture.`
        };
      }
    }

    context.emitEvent({
      type: 'tool_call_start',
      callId: id,
      tool: name,
      input
    });

    if (!tool) {
      const result: ToolResult = {
        success: false,
        error: `Outil inconnu dans le ToolRegistry : "${name}"`
      };
      context.emitEvent({
        type: 'tool_call_result',
        callId: id,
        tool: name,
        success: false,
        result: null,
        error: result.error
      });
      return result;
    }

    // Vérification de l'état d'activation (§6, Mission L13)
    if (!this.isToolEnabled(name)) {
      const result: ToolResult = {
        success: false,
        error: `L'outil "${name}" est désactivé dans la configuration des capacités.`
      };
      context.emitEvent({
        type: 'tool_call_result',
        callId: id,
        tool: name,
        success: false,
        result: null,
        error: result.error
      });
      return result;
    }

    const avail = this.isToolAvailable(name);
    if (!avail.available) {
      const result: ToolResult = {
        success: false,
        error: `L'outil "${name}" est indisponible : ${avail.reasonDisabled || 'Service non configuré.'}`
      };
      context.emitEvent({
        type: 'tool_call_result',
        callId: id,
        tool: name,
        success: false,
        result: null,
        error: result.error
      });
      return result;
    }

    // Restriction stricte en Mode Plan (lecture seule) : seuls les outils SAFE sont autorisés
    if (context.executionMode === 'plan' && tool.permission !== 'SAFE') {
      const result: ToolResult = {
        success: false,
        error: `Mode Plan actif (lecture seule) : l'outil "${name}" modificateur ou non sécurisé est désactivé. Seule l'inspection (outils SAFE) est autorisée.`
      };
      context.emitEvent({
        type: 'tool_call_result',
        callId: id,
        tool: name,
        success: false,
        result: null,
        error: result.error
      });
      return result;
    }

    if (context.abortSignal?.aborted) {
      const result: ToolResult = {
        success: false,
        error: 'Opération interrompue par l\'utilisateur.'
      };
      context.emitEvent({
        type: 'tool_call_result',
        callId: id,
        tool: name,
        success: false,
        result: null,
        error: result.error
      });
      return result;
    }

    // Calcul du délai d'attente différencié par catégorie d'outils
    let timeoutMs = tool.timeoutMs;
    if (!timeoutMs) {
      try {
        const settings = PermissionStore.getInstance().getSettings();
        if (['terminal', 'testing'].includes(tool.category)) {
          timeoutMs = settings.terminalTimeout;
        } else {
          timeoutMs = settings.fileTimeout;
        }
      } catch {
        timeoutMs = ['terminal', 'testing'].includes(tool.category) ? 120000 : 30000;
      }
    }

    let timer: NodeJS.Timeout | null = null;
    const timeoutPromise = new Promise<ToolResult>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`Délai d'exécution dépassé pour l'outil "${name}" (${timeoutMs ? timeoutMs / 1000 : 30}s).`));
      }, timeoutMs);
    });

    try {
      console.log(`[ToolRegistry] Exécution de "${name}" (timeout: ${timeoutMs / 1000}s)...`);
      const result = await Promise.race([
        tool.execute(input, context),
        timeoutPromise
      ]);

      context.emitEvent({
        type: 'tool_call_result',
        callId: id,
        tool: name,
        success: result.success,
        result: result.data,
        error: result.error
      });

      return result;
    } catch (err: any) {
      console.error(`[ToolRegistry] Erreur lors de l'exécution de "${name}" :`, err);
      const result: ToolResult = {
        success: false,
        error: err.message || `Erreur non gérée lors de l'exécution de ${name}`
      };
      context.emitEvent({
        type: 'tool_call_result',
        callId: id,
        tool: name,
        success: false,
        result: null,
        error: result.error
      });
      return result;
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }
}

export const toolRegistry = new ToolRegistry();
