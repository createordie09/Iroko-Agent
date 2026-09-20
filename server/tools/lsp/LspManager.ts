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

export class LspManager {
  private programCache: Map<string, { program: ts.Program; timestamp: number }> = new Map();

  private getOrUpdateProgram(workspacePath: string): ts.Program | null {
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
    const cached = this.programCache.get(workspacePath);
    // Invalider le cache après 10 secondes ou réutiliser
    if (cached && (now - cached.timestamp < 10000)) {
      return cached.program;
    }

    const program = ts.createProgram({
      rootNames: parsedConfig.fileNames,
      options: parsedConfig.options,
      projectReferences: parsedConfig.projectReferences
    });

    this.programCache.set(workspacePath, { program, timestamp: now });
    return program;
  }

  public getDiagnostics(workspacePath: string, targetFile?: string): LspDiagnostic[] {
    const program = this.getOrUpdateProgram(workspacePath);
    if (!program) {
      return [];
    }

    const diagnostics: LspDiagnostic[] = [];
    const sourceFiles = targetFile
      ? [program.getSourceFile(path.resolve(workspacePath, targetFile))].filter((f): f is ts.SourceFile => Boolean(f))
      : program.getSourceFiles().filter(f => !f.isDeclarationFile && f.fileName.includes(workspacePath));

    for (const sourceFile of sourceFiles) {
      const syntactic = program.getSyntacticDiagnostics(sourceFile);
      const semantic = program.getSemanticDiagnostics(sourceFile);
      const all = [...syntactic, ...semantic];

      for (const diag of all) {
        if (diag.file && diag.start !== undefined) {
          const { line, character } = diag.file.getLineAndCharacterOfPosition(diag.start);
          const rawMessage = ts.flattenDiagnosticMessageText(diag.messageText, '\n');

          let category: LspDiagnostic['category'] = 'error';
          if (diag.category === ts.DiagnosticCategory.Warning) category = 'warning';
          else if (diag.category === ts.DiagnosticCategory.Suggestion) category = 'suggestion';
          else if (diag.category === ts.DiagnosticCategory.Message) category = 'message';

          const relPath = path.relative(workspacePath, diag.file.fileName);

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
}

export const lspManager = new LspManager();
