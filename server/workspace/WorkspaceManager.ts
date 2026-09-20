import path from 'path';
import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface WorkspaceMetadata {
  path: string;
  os: {
    platform: NodeJS.Platform;
    arch: string;
  };
  packageManager: 'npm' | 'pnpm' | 'yarn' | 'bun' | 'pip' | 'poetry' | 'cargo' | 'go' | 'unknown';
  languages: string[];
  frameworks: string[];
  scripts: Record<string, string>;
  projectRulesFile?: string;
  projectRulesContent?: string;
  git: {
    isRepo: boolean;
    branch?: string;
    isClean?: boolean;
    remoteUrl?: string;
  };
  keyFiles: string[];
}

export class WorkspaceManager {
  public async analyze(workspacePath: string): Promise<WorkspaceMetadata> {
    const keyFilesFound: string[] = [];
    const checkFile = (fileName: string) => {
      if (fs.existsSync(path.join(workspacePath, fileName))) {
        keyFilesFound.push(fileName);
        return true;
      }
      return false;
    };

    // 1. Détection des fichiers clés
    const candidateFiles = [
      'package.json',
      'tsconfig.json',
      'vite.config.ts',
      'vite.config.js',
      'next.config.js',
      'next.config.mjs',
      'next.config.ts',
      'nuxt.config.ts',
      'pyproject.toml',
      'requirements.txt',
      'Cargo.toml',
      'go.mod',
      'Dockerfile',
      'docker-compose.yml',
      '.env.example',
      'IROKO.md',
      'AGENTS.md',
      'CLAUDE.md',
      'README.md'
    ];

    candidateFiles.forEach(f => checkFile(f));

    // 2. Détection du gestionnaire de paquets
    let packageManager: WorkspaceMetadata['packageManager'] = 'unknown';
    if (fs.existsSync(path.join(workspacePath, 'pnpm-lock.yaml'))) {
      packageManager = 'pnpm';
    } else if (fs.existsSync(path.join(workspacePath, 'yarn.lock'))) {
      packageManager = 'yarn';
    } else if (fs.existsSync(path.join(workspacePath, 'bun.lockb')) || fs.existsSync(path.join(workspacePath, 'bun.lock'))) {
      packageManager = 'bun';
    } else if (fs.existsSync(path.join(workspacePath, 'package-lock.json'))) {
      packageManager = 'npm';
    } else if (fs.existsSync(path.join(workspacePath, 'poetry.lock'))) {
      packageManager = 'poetry';
    } else if (fs.existsSync(path.join(workspacePath, 'requirements.txt')) || fs.existsSync(path.join(workspacePath, 'Pipfile'))) {
      packageManager = 'pip';
    } else if (fs.existsSync(path.join(workspacePath, 'Cargo.lock')) || fs.existsSync(path.join(workspacePath, 'Cargo.toml'))) {
      packageManager = 'cargo';
    } else if (fs.existsSync(path.join(workspacePath, 'go.sum')) || fs.existsSync(path.join(workspacePath, 'go.mod'))) {
      packageManager = 'go';
    } else if (fs.existsSync(path.join(workspacePath, 'package.json'))) {
      packageManager = 'npm';
    }

    // 3. Détection des langages et frameworks
    const languages: Set<string> = new Set();
    const frameworks: Set<string> = new Set();
    let scripts: Record<string, string> = {};

    const pkgPath = path.join(workspacePath, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        languages.add('JavaScript');
        if (checkFile('tsconfig.json') || pkg.devDependencies?.typescript || pkg.dependencies?.typescript) {
          languages.add('TypeScript');
        }

        scripts = pkg.scripts || {};
        const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };

        if (allDeps['react']) frameworks.add('React');
        if (allDeps['vue']) frameworks.add('Vue');
        if (allDeps['next']) frameworks.add('Next.js');
        if (allDeps['nuxt']) frameworks.add('Nuxt');
        if (allDeps['vite']) frameworks.add('Vite');
        if (allDeps['tailwindcss']) frameworks.add('TailwindCSS');
        if (allDeps['@supabase/supabase-js']) frameworks.add('Supabase');
        if (allDeps['express']) frameworks.add('Express');
        if (allDeps['jest']) frameworks.add('Jest');
        if (allDeps['vitest']) frameworks.add('Vitest');
      } catch (e) {
        console.warn('[WorkspaceManager] Impossible de parser package.json :', e);
      }
    }

    if (fs.existsSync(path.join(workspacePath, 'Cargo.toml'))) {
      languages.add('Rust');
    }
    if (fs.existsSync(path.join(workspacePath, 'go.mod'))) {
      languages.add('Go');
    }
    if (fs.existsSync(path.join(workspacePath, 'requirements.txt')) || fs.existsSync(path.join(workspacePath, 'pyproject.toml'))) {
      languages.add('Python');
    }

    // 4. Instructions de projet
    let projectRulesFile: string | undefined;
    let projectRulesContent: string | undefined;

    const ruleFiles = ['IROKO.md', 'AGENTS.md', 'CLAUDE.md', 'README.md'];
    for (const rf of ruleFiles) {
      const fullRf = path.join(workspacePath, rf);
      if (fs.existsSync(fullRf)) {
        try {
          projectRulesFile = rf;
          projectRulesContent = fs.readFileSync(fullRf, 'utf-8').slice(0, 3000);
          break;
        } catch {}
      }
    }

    // 5. Statut Git
    const gitInfo: WorkspaceMetadata['git'] = {
      isRepo: false
    };

    if (fs.existsSync(path.join(workspacePath, '.git'))) {
      gitInfo.isRepo = true;
      try {
        const { stdout: branchOut } = await execAsync('git branch --show-current', { cwd: workspacePath });
        gitInfo.branch = branchOut.trim() || 'HEAD';

        const { stdout: statusOut } = await execAsync('git status --porcelain', { cwd: workspacePath });
        gitInfo.isClean = statusOut.trim().length === 0;

        try {
          const { stdout: remoteOut } = await execAsync('git remote get-url origin', { cwd: workspacePath });
          gitInfo.remoteUrl = remoteOut.trim();
        } catch {}
      } catch (gitErr) {
        console.warn('[WorkspaceManager] Détection git partielle :', gitErr);
      }
    }

    return {
      path: workspacePath,
      os: {
        platform: process.platform,
        arch: process.arch
      },
      packageManager,
      languages: Array.from(languages),
      frameworks: Array.from(frameworks),
      scripts,
      projectRulesFile,
      projectRulesContent,
      git: gitInfo,
      keyFiles: keyFilesFound
    };
  }

  public formatForPrompt(meta: WorkspaceMetadata): string {
    const lines: string[] = [];
    lines.push(`Workspace : "${meta.path}"`);
    lines.push(`OS : ${meta.os.platform} (${meta.os.arch})`);
    lines.push(`Package Manager : ${meta.packageManager}`);
    if (meta.languages.length > 0) lines.push(`Langages : ${meta.languages.join(', ')}`);
    if (meta.frameworks.length > 0) lines.push(`Frameworks & Libs : ${meta.frameworks.join(', ')}`);

    const availableScripts = Object.keys(meta.scripts);
    if (availableScripts.length > 0) {
      lines.push(`Scripts npm disponibles : ${availableScripts.join(', ')}`);
    }

    if (meta.git.isRepo) {
      lines.push(`Git : Branche "${meta.git.branch || 'main'}", ${meta.git.isClean ? 'Clean' : 'Modifications non commitées'}`);
    } else {
      lines.push(`Git : Non initialisé`);
    }

    if (meta.projectRulesFile && meta.projectRulesContent) {
      lines.push(`\n--- Instructions du projet (${meta.projectRulesFile}) ---\n${meta.projectRulesContent}`);
    }

    return lines.join('\n');
  }
}

export const workspaceManager = new WorkspaceManager();
