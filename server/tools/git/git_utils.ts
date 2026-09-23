import { execFile } from 'child_process';
import { ProcessManager } from '../terminal/ProcessManager';

export interface GitExecResult {
  stdout: string;
  stderr: string;
}

/**
 * Options et patterns Git interdits pour prévenir l'injection de commandes
 * et l'exécution de code arbitraire via Git.
 */
const DANGEROUS_GIT_OPTIONS = [
  '-c',
  '--upload-pack',
  '--exec',
  '--output',
  '--paginate',
  '--no-pager',
  '--git-dir',
  '--work-tree'
];

/**
 * Valide un nom de branche Git selon les règles strictes de git-check-ref-format.
 */
export function validateBranchName(branchName: string): { valid: boolean; error?: string } {
  if (!branchName || typeof branchName !== 'string') {
    return { valid: false, error: 'Le nom de branche ne peut pas être vide.' };
  }

  const trimmed = branchName.trim();
  if (!trimmed) {
    return { valid: false, error: 'Le nom de branche ne peut pas être vide.' };
  }

  // Interdiction des tirets initiaux (pour éviter l'injection d'options Git)
  if (trimmed.startsWith('-')) {
    return { valid: false, error: 'Le nom de branche ne peut pas commencer par un tiret (-).' };
  }

  // Interdiction des slashs initiaux ou finaux
  if (trimmed.startsWith('/') || trimmed.endsWith('/')) {
    return { valid: false, error: 'Le nom de branche ne peut pas commencer ni se terminer par un slash (/).' };
  }

  // Interdiction de .lock à la fin
  if (trimmed.endsWith('.lock')) {
    return { valid: false, error: 'Le nom de branche ne peut pas se terminer par ".lock".' };
  }

  // Interdiction de .. ou // ou @{ ou \ ou espaces ou caractères de contrôle
  if (
    trimmed.includes('..') ||
    trimmed.includes('//') ||
    trimmed.includes('@{') ||
    trimmed.includes('\\') ||
    /\s/.test(trimmed) ||
    /[\x00-\x1f\x7f~^:?*[]/.test(trimmed)
  ) {
    return { valid: false, error: `Le nom de branche "${trimmed}" contient des caractères interdits.` };
  }

  // Caractères autorisés : lettres, chiffres, tirets, underscores, points, slashs
  if (!/^[a-zA-Z0-9._/-]+$/.test(trimmed)) {
    return { valid: false, error: `Le nom de branche "${trimmed}" contient des caractères non autorisés.` };
  }

  return { valid: true };
}

/**
 * Valide qu'un argument ne constitue pas une injection d'option Git suspecte.
 */
export function validateGitArgument(arg: string, contextDescription = 'argument'): { valid: boolean; error?: string } {
  if (!arg || typeof arg !== 'string') {
    return { valid: false, error: `Valeur invalide pour ${contextDescription}.` };
  }

  const lower = arg.trim().toLowerCase();

  for (const dangerous of DANGEROUS_GIT_OPTIONS) {
    if (lower === dangerous || lower.startsWith(`${dangerous}=`)) {
      return { valid: false, error: `Option Git interdite détectée : "${arg}".` };
    }
  }

  return { valid: true };
}

/**
 * Exécute une commande Git sécurisée via execFile avec un tableau d'arguments,
 * GIT_TERMINAL_PROMPT=0, environnement assaini et sans interpolation de shell.
 */
export async function runGit(
  args: string[],
  cwd: string,
  options: { maxBuffer?: number } = {}
): Promise<GitExecResult> {
  // Validation préalable de tous les arguments
  for (const arg of args) {
    const val = validateGitArgument(arg);
    if (!val.valid) {
      throw new Error(val.error);
    }
  }

  const sanitizedEnv = ProcessManager.getSanitizedEnv({
    GIT_TERMINAL_PROMPT: '0',
    GIT_OPTIONAL_LOCKS: '0'
  });

  return new Promise((resolve, reject) => {
    execFile(
      'git',
      args,
      {
        cwd,
        env: sanitizedEnv,
        maxBuffer: options.maxBuffer || 10 * 1024 * 1024,
        windowsHide: true
      },
      (error, stdout, stderr) => {
        if (error) {
          const err = new Error(stderr.trim() || stdout.trim() || error.message);
          (err as any).code = error.code;
          return reject(err);
        }
        resolve({
          stdout: stdout.toString(),
          stderr: stderr.toString()
        });
      }
    );
  });
}

/**
 * Plafonne un diff textuel volumineux à une taille maximale (500 Ko par défaut).
 */
export function truncateDiff(diffText: string, maxBytes = 500 * 1024): string {
  if (Buffer.byteLength(diffText, 'utf-8') <= maxBytes) {
    return diffText;
  }

  const head = diffText.slice(0, 200 * 1024);
  const tail = diffText.slice(-300 * 1024);
  return `${head}\n\n[Diff tronqué : limite de 500 Ko atteinte]\n\n${tail}`;
}
