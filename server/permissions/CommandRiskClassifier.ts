import { PermissionLevel } from '../types/events';

export interface CommandRiskAnalysis {
  overallRisk: PermissionLevel;
  segments: {
    command: string;
    risk: PermissionLevel;
    reason?: string;
  }[];
  isCompound: boolean;
  hasSubshell: boolean;
  hasRedirection: boolean;
}

const RISK_HIERARCHY: Record<PermissionLevel, number> = {
  SAFE: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4
};

export class CommandRiskClassifier {
  /**
   * Analyse complète d'une commande (simple ou composée) multi-plateforme.
   */
  public static analyze(rawCommand: string): CommandRiskAnalysis {
    const trimmed = rawCommand.trim();
    if (!trimmed) {
      return {
        overallRisk: 'SAFE',
        segments: [{ command: '', risk: 'SAFE' }],
        isCompound: false,
        hasSubshell: false,
        hasRedirection: false
      };
    }

    // Détection de sous-shells : $(...) ou `...`
    const subshellRegex = /\$\(([^)]+)\)|`([^`]+)`/g;
    const subshellMatches: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = subshellRegex.exec(trimmed)) !== null) {
      const extracted = match[1] || match[2];
      if (extracted) {
        subshellMatches.push(extracted.trim());
      }
    }
    const hasSubshell = subshellMatches.length > 0;

    // Détection de redirections : > ou >>
    const hasRedirection = /(?:^|[^<])>>?/.test(trimmed);

    // Découpage des commandes composées par opérateurs : &&, ||, ;, |
    const segments = this.splitCompoundCommand(trimmed);
    const isCompound = segments.length > 1 || hasSubshell;

    const analyzedSegments: CommandRiskAnalysis['segments'] = [];
    let maxLevel: PermissionLevel = 'SAFE';

    // Détection de patterns critiques globaux (ex: download & pipe to shell)
    if (/(?:curl|wget|invoke-webrequest|iwr)\s+.*\|\s*(?:iex|powershell|cmd|sh|bash)\b/i.test(trimmed)) {
      maxLevel = 'CRITICAL';
      analyzedSegments.push({
        command: trimmed,
        risk: 'CRITICAL',
        reason: 'Téléchargement et exécution directe dans un shell'
      });
    }

    // Analyser chaque segment
    for (const seg of segments) {
      const segRisk = this.assessSingleSegment(seg);
      analyzedSegments.push({
        command: seg,
        risk: segRisk.risk,
        reason: segRisk.reason
      });
      if (RISK_HIERARCHY[segRisk.risk] > RISK_HIERARCHY[maxLevel]) {
        maxLevel = segRisk.risk;
      }
    }

    // Analyser les commandes extraites des sous-shells
    for (const sub of subshellMatches) {
      const subAnalysis = this.analyze(sub);
      analyzedSegments.push({
        command: `subshell: ${sub}`,
        risk: subAnalysis.overallRisk,
        reason: 'Commande imbriquée dans un sous-shell'
      });
      if (RISK_HIERARCHY[subAnalysis.overallRisk] > RISK_HIERARCHY[maxLevel]) {
        maxLevel = subAnalysis.overallRisk;
      }
    }

    // Une redirection d'écriture (> ou >>) élève au minimum à MEDIUM si elle était SAFE/LOW
    if (hasRedirection && RISK_HIERARCHY[maxLevel] < RISK_HIERARCHY['MEDIUM']) {
      maxLevel = 'MEDIUM';
    }

    return {
      overallRisk: maxLevel,
      segments: analyzedSegments,
      isCompound,
      hasSubshell,
      hasRedirection
    };
  }

  /**
   * Découpe une commande composée en sous-segments en respectant les chaînes entre guillemets.
   */
  public static splitCompoundCommand(command: string): string[] {
    const segments: string[] = [];
    let current = '';
    let inSingleQuote = false;
    let inDoubleQuote = false;
    let escaped = false;

    for (let i = 0; i < command.length; i++) {
      const char = command[i];

      if (escaped) {
        current += char;
        escaped = false;
        continue;
      }

      if (char === '\\' && !inSingleQuote) {
        escaped = true;
        current += char;
        continue;
      }

      if (char === "'" && !inDoubleQuote) {
        inSingleQuote = !inSingleQuote;
        current += char;
        continue;
      }

      if (char === '"' && !inSingleQuote) {
        inDoubleQuote = !inDoubleQuote;
        current += char;
        continue;
      }

      if (!inSingleQuote && !inDoubleQuote) {
        // Détecter && ou ||
        if (
          (char === '&' && command[i + 1] === '&') ||
          (char === '|' && command[i + 1] === '|')
        ) {
          if (current.trim()) segments.push(current.trim());
          current = '';
          i++; // Sauter le deuxième caractère de l'opérateur
          continue;
        }

        // Détecter ; ou | (pipe simple)
        if (char === ';' || char === '|') {
          if (current.trim()) segments.push(current.trim());
          current = '';
          continue;
        }
      }

      current += char;
    }

    if (current.trim()) {
      segments.push(current.trim());
    }

    return segments.length > 0 ? segments : [command.trim()];
  }

  /**
   * Évalue le niveau de risque d'un segment individuel de commande.
   */
  private static assessSingleSegment(segment: string): { risk: PermissionLevel; reason?: string } {
    const cmd = segment.trim();
    const lower = cmd.toLowerCase();

    // 1. DÉTECTION CRITIQUE (Destruction massive, formatage, opérations système/Git destructives)
    // Windows / PowerShell destructif
    if (
      /\brmdir\s+.*\/s\b/i.test(cmd) ||
      /\brd\s+.*\/s\b/i.test(cmd) ||
      /\bdel\s+.*\/s\b/i.test(cmd) ||
      /\berase\s+.*\/s\b/i.test(cmd) ||
      /\b(?:remove-item|ri|rmdir|rm)\s+.*-recurse\b/i.test(cmd) ||
      /\bformat\s+[a-z]:/i.test(cmd) ||
      /\breg\s+(?:delete|add)\b/i.test(cmd) ||
      /\b(?:iex|invoke-expression)\b/i.test(cmd) ||
      /\bpowershell\s+.*-(?:enc|encodedcommand|e\s+)/i.test(cmd) ||
      /(?:curl|wget|invoke-webrequest|iwr)\s+.*\|\s*(?:iex|powershell|cmd|sh|bash)/i.test(cmd)
    ) {
      return { risk: 'CRITICAL', reason: 'Commande destructrice ou exécution dynamique Windows / PowerShell' };
    }

    // POSIX destructif
    if (
      /\brm\s+.*-[a-z]*r[a-z]*f?\b/i.test(cmd) ||
      /\brm\s+.*-[a-z]*f[a-z]*r\b/i.test(cmd) ||
      /\bmkfs\b/i.test(cmd) ||
      /\bdd\s+if=/i.test(cmd) ||
      /\b(?:shutdown|reboot|init\s+0|init\s+6)\b/i.test(cmd) ||
      /\bchmod\s+.*-[a-z]*R\s+777\b/i.test(cmd) ||
      /drop\s+database\b/i.test(cmd)
    ) {
      return { risk: 'CRITICAL', reason: 'Commande destructrice système POSIX' };
    }

    // Git destructif
    if (
      /\bgit\s+reset\s+--hard\b/i.test(cmd) ||
      /\bgit\s+clean\s+.*-[a-z]*f[a-z]*\b/i.test(cmd) ||
      /\bgit\s+push\s+.*--(?:force|mirror)\b/i.test(cmd) ||
      /\bgit\s+push\s+.*-[a-z]*f[a-z]*\b/i.test(cmd) ||
      /\bgit\s+branch\s+.*-[dD]\b/i.test(cmd)
    ) {
      return { risk: 'CRITICAL', reason: 'Opération Git destructrice irréversible' };
    }

    // 2. DÉTECTION HIGH (Opérations impactantes externes, publication, désinstallation, arrêts forcés)
    if (
      /\bgit\s+push\b/i.test(cmd) ||
      /\bnpm\s+publish\b/i.test(cmd) ||
      /\b(?:npm|pnpm|yarn|pip|bun)\s+(?:un|uninstall|remove)\b/i.test(cmd) ||
      /\btaskkill\s+.*\/f\b/i.test(cmd) ||
      /\bkill\s+-9\b/i.test(cmd) ||
      /\bkillall\b/i.test(cmd)
    ) {
      return { risk: 'HIGH', reason: 'Opération externe ou modification lourde d\'environnement' };
    }

    // 3. DÉTECTION SAFE (Strictement lecture seule et inspection)
    // Ne doit comporter aucun pipe d'écriture ni redirection
    if (
      /^(?:git\s+(?:status|diff|log|branch(?!\s+-[dD])|show|tag|remote -v))\b/i.test(cmd) ||
      /^(?:node|npm|pnpm|yarn|bun|git|tsc|python|python3|pip|cargo|rustc|go|docker)\s+--(?:version|help)\b/i.test(cmd) ||
      /^(?:node|npm|pnpm|yarn|bun|git|python|python3)\s+-v\b/i.test(cmd) ||
      /^(?:dir|ls|pwd|whoami|date|time|echo|cat|type|head|tail|grep|findstr)(?:\s+[^<>|;&]+)?$/i.test(cmd)
    ) {
      return { risk: 'SAFE', reason: 'Commande d\'inspection en lecture seule' };
    }

    // 4. DÉTECTION LOW (Commandes de compilation, test ou diagnostic sans altération durable risquée)
    if (
      /^(?:npm\s+test|pnpm\s+test|yarn\s+test|bun\s+test|npm\s+run\s+(?:test|check|lint|typecheck|build))\b/i.test(cmd) ||
      /^(?:tsc\s+--noEmit|eslint|prettier\s+--check)\b/i.test(cmd)
    ) {
      return { risk: 'LOW', reason: 'Vérification, test ou typage sans risque destructif' };
    }

    // 5. NIVEAU PAR DÉFAUT : MEDIUM pour toute commande de modification ou commande inconnue (§9)
    return { risk: 'MEDIUM', reason: 'Commande modificatrice ou non répertoriée (demande requise)' };
  }

  /**
   * Normalise une commande pour la mémorisation "Toujours pour ce projet".
   * Ex: "npm test -- --watch=false" -> "npm test"
   */
  public static normalizeCommandPattern(command: string): string {
    const trimmed = command.trim();
    // Extraire les deux premiers mots pour les commandes composées comme "git status" ou "npm test"
    const parts = trimmed.split(/\s+/);
    if (parts.length <= 2) {
      return trimmed;
    }
    if (['git', 'npm', 'pnpm', 'yarn', 'bun', 'cargo', 'docker'].includes(parts[0].toLowerCase())) {
      return `${parts[0]} ${parts[1]}`;
    }
    return parts[0];
  }
}
