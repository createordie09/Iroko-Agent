// server/tools/lsp/lsp_worker.cjs
// Processus travailleur dédié pour le Language Server Protocol TypeScript (Cahier §14)

const path = require('path');
const fs = require('fs');

const workspacePath = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();

// 1. Résolution de TypeScript : priorité au node_modules du workspace, sinon repli sur le runtime
let ts;
try {
  const wsTs = path.join(workspacePath, 'node_modules', 'typescript');
  ts = require(wsTs);
} catch {
  try {
    ts = require('typescript');
  } catch (err) {
    if (process.send) {
      process.send({ type: 'init_error', error: 'Module TypeScript introuvable.' });
    }
    process.exit(1);
  }
}

// 2. Détection du fichier tsconfig.json
const tsconfigPath = ts.findConfigFile(workspacePath, ts.sys.fileExists, 'tsconfig.json');
if (!tsconfigPath) {
  if (process.send) {
    process.send({ type: 'init_error', error: 'Aucun fichier tsconfig.json détecté dans le workspace.' });
  }
  process.exit(1);
}

const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
if (configFile.error) {
  if (process.send) {
    process.send({ type: 'init_error', error: 'Erreur lors de la lecture du fichier tsconfig.json.' });
  }
  process.exit(1);
}

const parsedConfig = ts.parseJsonConfigFileContent(
  configFile.config,
  ts.sys,
  path.dirname(tsconfigPath)
);

// 3. Implémentation du TypeScript LanguageServiceHost
class TypeScriptServiceHost {
  constructor(workspace, config) {
    this.workspace = workspace;
    this.compilerOptions = config.options;
    this.files = new Map();
    for (const file of config.fileNames) {
      this.files.set(path.resolve(workspace, file), { version: 0 });
    }
  }

  updateFile(fileName) {
    const resolved = path.resolve(this.workspace, fileName);
    const existing = this.files.get(resolved);
    if (existing) {
      existing.version++;
    } else {
      this.files.set(resolved, { version: 0 });
    }
  }

  getCompilationSettings() {
    return this.compilerOptions;
  }

  getScriptFileNames() {
    return Array.from(this.files.keys());
  }

  getScriptVersion(fileName) {
    const file = this.files.get(fileName);
    return file ? String(file.version) : '0';
  }

  getScriptSnapshot(fileName) {
    if (!fs.existsSync(fileName)) return undefined;
    try {
      const content = fs.readFileSync(fileName, 'utf-8');
      return ts.ScriptSnapshot.fromString(content);
    } catch {
      return undefined;
    }
  }

  getCurrentDirectory() {
    return this.workspace;
  }

  getDefaultLibFileName(options) {
    return ts.getDefaultLibFilePath(options);
  }

  fileExists(filePath) {
    return fs.existsSync(filePath);
  }

  readFile(filePath, encoding) {
    try {
      return fs.existsSync(filePath) ? fs.readFileSync(filePath, encoding || 'utf-8') : undefined;
    } catch {
      return undefined;
    }
  }

  readDirectory(dirPath, extensions, exclude, include, depth) {
    return ts.sys.readDirectory(dirPath, extensions, exclude, include, depth);
  }

  directoryExists(dirPath) {
    try {
      return fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
    } catch {
      return false;
    }
  }

  getDirectories(dirPath) {
    return ts.sys.getDirectories(dirPath);
  }
}

const host = new TypeScriptServiceHost(workspacePath, parsedConfig);
const service = ts.createLanguageService(host, ts.createDocumentRegistry());

// 4. Gestionnaires des requêtes LSP
function handleGetDiagnostics(targetFile) {
  const diagnostics = [];
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

        let category = 'error';
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
  return diagnostics.slice(0, 50);
}

function handleFindDefinition(filePath, line, column) {
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

  const results = [];
  let symbolName;

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
    definitions: results.slice(0, 20)
  };
}

function handleFindReferences(filePath, line, column) {
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

  const results = [];
  let symbolName;

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
      isDefinition: ref.isDefinition,
      isWriteAccess: ref.isWriteAccess
    });
  }

  return {
    found: results.length > 0,
    symbol: symbolName,
    total: results.length,
    references: results.slice(0, 50)
  };
}

function handleGetDocumentSymbols(filePath) {
  const absPath = path.resolve(workspacePath, filePath);
  if (!fs.existsSync(absPath)) return [];

  host.updateFile(absPath);
  const program = service.getProgram();
  const sourceFile = program?.getSourceFile(absPath);
  if (!sourceFile) return [];

  const navTree = service.getNavigationTree(absPath);
  if (!navTree) return [];

  const symbols = [];
  const relFile = path.relative(workspacePath, absPath).replace(/\\/g, '/');

  function walk(item, containerName) {
    if (item.spans && item.spans.length > 0) {
      const start = item.spans[0].start;
      const { line, character } = sourceFile.getLineAndCharacterOfPosition(start);
      const baseName = path.basename(absPath);
      if (item.text !== `"${baseName}"` && item.text !== baseName) {
        symbols.push({
          name: item.text,
          kind: item.kind,
          containerName: containerName || undefined,
          line: line + 1,
          column: character + 1,
          file: relFile
        });
      }
    }
    if (item.childItems) {
      for (const child of item.childItems) {
        walk(child, item.text);
      }
    }
  }

  if (navTree.childItems) {
    for (const child of navTree.childItems) {
      walk(child, '');
    }
  } else {
    walk(navTree, '');
  }

  return symbols.slice(0, 100);
}

// 5. Écoute des requêtes IPC
if (process.send) {
  process.on('message', (msg) => {
    if (!msg || typeof msg.id !== 'number') return;
    const { id, method, params } = msg;

    try {
      if (method === 'get_diagnostics') {
        const data = handleGetDiagnostics(params?.targetFile);
        process.send({ id, success: true, data });
      } else if (method === 'find_definition') {
        const data = handleFindDefinition(params?.filePath, params?.line, params?.column);
        process.send({ id, success: true, data });
      } else if (method === 'find_references') {
        const data = handleFindReferences(params?.filePath, params?.line, params?.column);
        process.send({ id, success: true, data });
      } else if (method === 'get_document_symbols') {
        const data = handleGetDocumentSymbols(params?.filePath);
        process.send({ id, success: true, data });
      } else if (method === 'ping') {
        process.send({ id, success: true, data: 'pong' });
      } else {
        process.send({ id, success: false, error: `Méthode inconnue : ${method}` });
      }
    } catch (err) {
      process.send({ id, success: false, error: err.message || String(err) });
    }
  });

  // Signal de préparation
  process.send({ type: 'ready', pid: process.pid });
} else {
  console.error('[lsp_worker] Ce script doit être exécuté avec un canal IPC Node.js.');
  process.exit(1);
}

// Arrêt propre en cas de déconnexion du parent
process.on('disconnect', () => {
  process.exit(0);
});
