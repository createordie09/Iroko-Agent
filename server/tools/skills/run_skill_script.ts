// server/tools/skills/run_skill_script.ts
// Cahier §13, §15, Mission N1 : Outil d'exécution sécurisée de scripts de compétences Niveau 3

import path from 'path';
import fs from 'fs';
import { IrokoTool, ToolContext, ToolResult } from '../types';
import { processManager } from '../terminal/ProcessManager';
import { skillManager } from '../../skills/SkillManager';

export interface RunSkillScriptInput {
  competenceId: string;
  script: string;
  arguments?: string | string[];
  timeoutMs?: number;
}

export interface RunSkillScriptOutput {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
  timedOut: boolean;
}

export class RunSkillScriptTool implements IrokoTool<RunSkillScriptInput, RunSkillScriptOutput> {
  public name = 'run_skill_script';
  public description = 'Exécute un script de compétence (Niveau 3) dans un environnement sécurisé et assaini.';
  public category = 'skills' as const;
  public permission = 'HIGH' as const;

  public parameters = {
    type: 'object',
    required: ['competenceId', 'script'],
    properties: {
      competenceId: {
        type: 'string',
        description: 'Nom ou identifiant de la compétence contenant le script.'
      },
      script: {
        type: 'string',
        description: 'Nom relatif du script à exécuter situé dans le dossier scripts/ de la compétence.'
      },
      arguments: {
        type: ['string', 'array'],
        description: 'Arguments optionnels à passer au script (chaîne ou tableau de chaînes).'
      },
      timeoutMs: {
        type: 'number',
        description: 'Délai d\'expiration maximal en millisecondes (par défaut 30000ms).'
      }
    }
  };

  public async execute(input: RunSkillScriptInput, context: ToolContext): Promise<ToolResult<RunSkillScriptOutput>> {
    // 1. Vérification de l'existence et du statut de la compétence
    const skill = skillManager.getSkill(input.competenceId);
    if (!skill) {
      return {
        success: false,
        error: `Compétence introuvable\u00A0: "${input.competenceId}".`
      };
    }

    if (!skill.enabled) {
      return {
        success: false,
        error: `La compétence "${skill.name}" est actuellement désactivée. Activez-la dans les Paramètres pour exécuter ses scripts.`
      };
    }

    // 2. Confinement strict du chemin du script dans dirPath/scripts/
    if (!input.script || typeof input.script !== 'string' || input.script.includes('..') || path.isAbsolute(input.script)) {
      return {
        success: false,
        error: 'Nom de script invalide ou tentative de traversée de chemin non autorisée.'
      };
    }

    const scriptsDir = path.resolve(skill.dirPath, 'scripts');
    const scriptPath = path.resolve(scriptsDir, input.script);

    if (!scriptPath.startsWith(scriptsDir + path.sep) && scriptPath !== scriptsDir) {
      return {
        success: false,
        error: 'Accès refusé\u00A0: le script doit être situé dans le répertoire scripts/ de la compétence.'
      };
    }

    if (!fs.existsSync(scriptPath)) {
      return {
        success: false,
        error: `Script introuvable\u00A0: "${input.script}" dans la compétence "${skill.name}".`
      };
    }

    // 3. Demande de permission interactive : obligatoire pour compétences tierces, exemptée pour compétences système
    if (!skill.isSystem) {
      const approved = await context.permissionEngine.requestPermission(
        this.name,
        'HIGH',
        `Exécution du script de compétence "${input.script}" (compétence\u00A0: ${skill.name})`,
        {
          competenceId: input.competenceId,
          script: input.script,
          arguments: input.arguments,
          isSystem: false
        },
        (req) => context.emitEvent({ type: 'permission_required', request: req })
      );

      if (!approved) {
        return {
          success: false,
          error: `Action non autorisée\u00A0: l'exécution du script "${input.script}" de la compétence "${skill.name}" a été refusée par l'utilisateur.`
        };
      }
    }

    // 4. Détermination de la commande d'exécution selon l'extension
    const ext = path.extname(scriptPath).toLowerCase();
    const formattedArgs = Array.isArray(input.arguments)
      ? input.arguments.map(a => `"${String(a).replace(/"/g, '\\"')}"`).join(' ')
      : (typeof input.arguments === 'string' ? input.arguments : '');

    let command: string;
    if (ext === '.py') {
      command = `python "${scriptPath}" ${formattedArgs}`.trim();
    } else if (ext === '.sh') {
      command = `bash "${scriptPath}" ${formattedArgs}`.trim();
    } else if (ext === '.js') {
      command = `node "${scriptPath}" ${formattedArgs}`.trim();
    } else if (ext === '.ts') {
      command = `node --import tsx "${scriptPath}" ${formattedArgs}`.trim();
    } else if (ext === '.ps1') {
      command = `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}" ${formattedArgs}`.trim();
    } else {
      command = `"${scriptPath}" ${formattedArgs}`.trim();
    }

    try {
      // 5. Exécution via ProcessManager (environnement assaini, isolation, destruction récursive)
      const execution = await processManager.executeCommand(
        command,
        context.workspacePath,
        input.timeoutMs || 30000,
        undefined,
        context.abortSignal
      );

      // 6. RÈGLE CRITIQUE : Seuls stdout et stderr entrent dans le contexte du modèle, JAMAIS le code source
      return {
        success: execution.exitCode === 0,
        data: {
          stdout: execution.stdout,
          stderr: execution.stderr,
          exitCode: execution.exitCode,
          durationMs: execution.durationMs,
          timedOut: execution.timedOut
        },
        ...(execution.exitCode !== 0 ? {
          error: `Le script a échoué avec le code de sortie ${execution.exitCode}${execution.stderr ? `: ${execution.stderr.trim()}` : ''}`
        } : {})
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Erreur lors de l\'exécution du script de compétence.'
      };
    }
  }
}
