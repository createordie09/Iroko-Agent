// server/tools/lsp/LspManager.ts
// Cahier §14 : Language Server Protocol (LSP) - Diagnostics, Définitions et Références TypeScript

import path from 'path';
import fs from 'fs';
import ts from 'typescript';

export interface LspDiagnostic {
  file: string;
  line: number;
  column: number;
  code: number;
  category: 'error' | 'warning' | 'suggestion' | 'message';
  message: string;
}

export interface LspLocation {
  file: string;
  line: number;
  column: number;
  text?: string;
  isDefinition?: boolean;
  isWriteAccess?: boolean;
}

export interface LspDefinitionResult {
  found: boolean;
  symbol?: string;
  definitions: LspLocation[];
}

export interface LspReferencesResult {
  found: boolean;
  symbol?: string;
  total: number;
  references: LspLocation[];
}

class TypeScriptServiceHost implements ts.LanguageServiceHost {
  private files: Map<string, { version: number }> = new Map();
  private compilerOptions: ts.CompilerOptions;

  constructor(public readonly workspacePath: string, parsedConfig: ts.ParsedCommandLine) {
    this.compilerOptions = parsedConfig.options;
    for (const file of parsedConfig.fileNames) {
      this.files.set(path.resolve(workspacePath, file), { version: 0 });
    }
  }

  public updateFile(fileName: string): void {
    const resolved = path.resolve(this.workspacePath, fileName);
    const existing = this.files.get(resolved);
    if (existing) {
      existing.version++;
    } else {
      this.files.set(resolved, { version: 0 });
    }
  }

  getCompilationSettings(): ts.CompilerOptions {
    return this.compilerOptions;
  }

  getScriptFileNames(): string[] {
    return Array.from(this.files.keys());
  }

  getScriptVersion(fileName: string): string {
    const file = this.files.get(fileName);
    return file ? String(file.version) : '0';
  }

  getScriptSnapshot(fileName: string): ts.IScriptSnapshot | undefined {
    if (!fs.existsSync(fileName)) return undefined;
    try {
      const content = fs.readFileSync(fileName, 'utf-8');
      return ts.ScriptSnapshot.fromString(content);
    } catch {
      return undefined;
    }
  }

  getCurrentDirectory(): string {
    return this.workspacePath;
  }

  getDefaultLibFileName(options: ts.CompilerOptions): string {
    return ts.getDefaultLibFilePath(options);
  }

  fileExists(filePath: string): boolean {
    return fs.existsSync(filePath);
  }

  readFile(filePath: string, encoding?: string): string | undefined {
    try {
      return fs.existsSync(filePath)
        ? fs.readFileSync(filePath, (encoding as BufferEncoding) || 'utf-8')
        : undefined;
    } catch {
      return undefined;
    }
  }

  readDirectory(
    dirPath: string,
    extensions?: readonly string[],
    exclude?: readonly string[],
    include?: readonly string[],
    depth?: number
  ): string[] {
    return ts.sys.readDirectory(dirPath, extensions, exclude, include, depth);
  }

  directoryExists(dirPath: string): boolean {
    try {
      return fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
    } catch {
      return false;
    }
  }

  getDirectories(dirPath: string): string[] {
    return ts.sys.getDirectories(dirPath);
  }
}

export class LspManager {
  private servicesCache: Map<string, {
    service: ts.LanguageService;
    host: TypeScriptServiceHost;
    timestamp: number;
  }> = new Map();

  private getOrUpdateLanguageService(workspacePath: string): { service: ts.LanguageService; host: TypeScriptServiceHost } | null {
    const tsconfigPath = ts.findConfigFile(workspacePath, ts.sys.fileExists, 'tsconfig.json');
    if (!tsconfigPath) return null;

    const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
    if (configFile.error) return null;

    const parsedConfig = ts.parseJsonConfigFileContent(
      configFile.config,
      ts.sys,
      path.dirname(tsconfigPath)
    );

    const now = Date.now();
    const cached = this.servicesCache.get(workspacePath);
    // Invalider le service après 30 secondes pour rafraîchir la liste de fichiers
    if (cached && (now - cached.timestamp < 30000)) {
      return { service: cached.service, host: cached.host };
    }

    const host = new TypeScriptServiceHost(workspacePath, parsedConfig);
    const service = ts.createLanguageService(host, ts.createDocumentRegistry());

    this.servicesCache.set(workspacePath, { service, host, timestamp: now });
    return { service, host };
  }

  /**
   * Récupère les diagnostics d'un fichier ou de l'ensemble du workspace.
   */
  public getDiagnostics(workspacePath: string, targetFile?: string): LspDiagnostic[] {
    const ls = this.getOrUpdateLanguageService(workspacePath);
    if (!ls) return [];

    const { service, host } = ls;
    const diagnostics: LspDiagnostic[] = [];

    const filesToDiagnose = targetFile
      ? [path.resolve(workspacePath, targetFile)]
      : host.getScriptFileNames().filter(f => !f.endsWith('.d.ts') && f.includes(workspacePath));

    for (const fileName of filesToDiagnose) {
      if (!fs.existsSync(fileName)) continue;

      host.updateFile(fileName);
      const syntactic = service.getSyntacticDiagnostics(fileName);
      const semantic = service.getSemanticDiagnostics(fileName);
      const all = [...syntactic, ...semantic];

      for (const diag of all) {
        if (diag.file && diag.start !== undefined) {
          const { line, character } = diag.file.getLineAndCharacterOfPosition(diag.start);
          const rawMessage = ts.flattenDiagnosticMessageText(diag.messageText, '\n');

          let category: LspDiagnostic['category'] = 'error';
          if (diag.category === ts.DiagnosticCategory.Warning) category = 'warning';
          else if (diag.category === ts.DiagnosticCategory.Suggestion) category = 'suggestion';
          else if (diag.category === ts.DiagnosticCategory.Message) category = 'message';

          const relPath = path.relative(workspacePath, diag.file.fileName).replace(/\\/g, '/');

          diagnostics.push({
            file: relPath,
            line: line + 1,
            column: character + 1,
            code: diag.code,
            category,
            message: rawMessage
          });
        }
      }
    }

    return diagnostics;
  }

  /**
   * Trouve la définition d'un symbole à un emplacement précis (fichier, ligne, colonne).
   */
  public getDefinition(
    workspacePath: string,
    filePath: string,
    line: number,
    column: number
  ): LspDefinitionResult {
    const ls = this.getOrUpdateLanguageService(workspacePath);
    if (!ls) return { found: false, definitions: [] };

    const { service, host } = ls;
    const absPath = path.resolve(workspacePath, filePath);
    if (!fs.existsSync(absPath)) return { found: false, definitions: [] };

    host.updateFile(absPath);
    const program = service.getProgram();
    const sourceFile = program?.getSourceFile(absPath);
    if (!sourceFile) return { found: false, definitions: [] };

    const position = sourceFile.getPositionOfLineAndCharacter(line - 1, column - 1);
    const definitions = service.getDefinitionAtPosition(absPath, position);

    if (!definitions || definitions.length === 0) {
      return { found: false, definitions: [] };
    }

    const results: LspLocation[] = [];
    let symbolName: string | undefined;

    for (const def of definitions) {
      const defSource = program?.getSourceFile(def.fileName);
      if (!defSource) continue;

      const { line: dLine, character: dCol } = defSource.getLineAndCharacterOfPosition(def.textSpan.start);
      const text = defSource.text.slice(def.textSpan.start, def.textSpan.start + def.textSpan.length);
      if (!symbolName) symbolName = def.name;

      results.push({
        file: path.relative(workspacePath, def.fileName).replace(/\\/g, '/'),
        line: dLine + 1,
        column: dCol + 1,
        text
      });
    }

    return {
      found: results.length > 0,
      symbol: symbolName,
      definitions: results
    };
  }

  /**
   * Trouve toutes les références d'un symbole dans le workspace.
   */
  public getReferences(
    workspacePath: string,
    filePath: string,
    line: number,
    column: number
  ): LspReferencesResult {
    const ls = this.getOrUpdateLanguageService(workspacePath);
    if (!ls) return { found: false, total: 0, references: [] };

    const { service, host } = ls;
    const absPath = path.resolve(workspacePath, filePath);
    if (!fs.existsSync(absPath)) return { found: false, total: 0, references: [] };

    host.updateFile(absPath);
    const program = service.getProgram();
    const sourceFile = program?.getSourceFile(absPath);
    if (!sourceFile) return { found: false, total: 0, references: [] };

    const position = sourceFile.getPositionOfLineAndCharacter(line - 1, column - 1);
    const references = service.getReferencesAtPosition(absPath, position);

    if (!references || references.length === 0) {
      return { found: false, total: 0, references: [] };
    }

    const results: LspLocation[] = [];
    let symbolName: string | undefined;

    for (const ref of references) {
      const refSource = program?.getSourceFile(ref.fileName);
      if (!refSource) continue;

      const { line: rLine, character: rCol } = refSource.getLineAndCharacterOfPosition(ref.textSpan.start);
      const text = refSource.text.slice(ref.textSpan.start, ref.textSpan.start + ref.textSpan.length);

      results.push({
        file: path.relative(workspacePath, ref.fileName).replace(/\\/g, '/'),
        line: rLine + 1,
        column: rCol + 1,
        text,
        isDefinition: (ref as any).isDefinition,
        isWriteAccess: ref.isWriteAccess
      });
    }

    return {
      found: results.length > 0,
      symbol: symbolName,
      total: results.length,
      references: results
    };
  }
}

export const lspManager = new LspManager();
