/**
 * Filet de sécurité du mode Chat : certains modèles annoncent qu'il faut passer en mode Code
 * sans appeler l'outil request_code_mode. Ce détecteur repère ce cas pour que l'interface affiche
 * quand même le bouton « Passer en mode Code et continuer ».
 */
const CODE_MODE_NEED_PATTERNS: RegExp[] = [
  /\b(?:passer|passe|basculer|bascule|activer|active|activez|basculez|passez)\s+(?:en|au|vers(?:\s+le)?|le)\s+mode\s+code\b/i,
  /\bmode\s+code\s+(?:est\s+)?(?:nécessaire|requis|obligatoire|indispensable)\b/i,
  /\b(?:dois|doit|faut|nécessite|nécessitent|besoin)\b[^.\n]{0,80}\bmode\s+code\b/i
];

export function impliesCodeModeNeed(text: string | undefined | null): boolean {
  if (!text) return false;
  return CODE_MODE_NEED_PATTERNS.some(pattern => pattern.test(text));
}
