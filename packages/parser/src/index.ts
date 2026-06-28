import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

export type CodeGraphLanguage = "typescript" | "javascript";

export type CodeGraphDirectory = {
  id: string;
  path: string;
  name: string;
  parentPath: string | null;
};

export type CodeGraphFile = {
  id: string;
  path: string;
  name: string;
  directoryPath: string;
  language: CodeGraphLanguage;
  startLine: number;
  endLine: number;
  imports: CodeGraphImport[];
  exports: string[];
};

export type CodeGraphImport = {
  moduleSpecifier: string;
  resolvedPath: string | null;
};

export type CodeGraphSymbolKind = "function" | "method" | "component" | "class" | "interface" | "type" | "enum";

export type CodeGraphWorkflowNodeKind = "entry" | "condition" | "statement" | "return" | "throw";

export type CodeGraphWorkflowNode = {
  id: string;
  kind: CodeGraphWorkflowNodeKind;
  name: string;
  summary: string;
  codeContext: string;
  startLine: number;
  endLine: number;
};

export type CodeGraphWorkflowEdge = {
  id: string;
  sourceId: string;
  targetId: string;
  label: string;
  codeContext: string;
};

export type CodeGraphFunctionWorkflow = {
  nodes: CodeGraphWorkflowNode[];
  edges: CodeGraphWorkflowEdge[];
};

export type CodeGraphSymbol = {
  id: string;
  filePath: string;
  kind: "function" | "object";
  symbolKind: CodeGraphSymbolKind;
  name: string;
  exported: boolean;
  parentSymbolId: string | null;
  startLine: number;
  endLine: number;
  signature: string;
  parameters: CodeGraphParameter[];
  returnHint: string | null;
  calls: string[];
  workflow: CodeGraphFunctionWorkflow | null;
  summary: string;
};

export type CodeGraphParameter = {
  name: string;
  typeHint: string | null;
};

export type CodeGraphEdge = {
  id: string;
  kind: "imports" | "calls";
  sourceId: string;
  targetId: string;
  label: string;
  codeContext: string;
};

export type CodeGraphSnapshot = {
  rootPath: string;
  directories: CodeGraphDirectory[];
  files: CodeGraphFile[];
  symbols: CodeGraphSymbol[];
  edges: CodeGraphEdge[];
};

export type CodeGraphScanOptions = {
  files?: string[];
  maxFiles?: number;
};

type SymbolCollectionContext = {
  filePath: string;
  sourceFile: ts.SourceFile;
  symbols: CodeGraphSymbol[];
  exports: string[];
};

type PendingFlowExit = {
  nodeId: string;
  label?: string;
};

type WorkflowBuildContext = {
  symbolId: string;
  symbolName: string;
  sourceFile: ts.SourceFile;
  nodes: CodeGraphWorkflowNode[];
  edges: CodeGraphWorkflowEdge[];
  nodeIds: Set<string>;
  edgeIds: Set<string>;
};

const CODE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const IGNORED_DIRECTORIES = new Set([".git", ".graphcode", "node_modules", "dist", "build", "coverage"]);

export function scanRepositoryCodeGraph(rootPath: string, options: CodeGraphScanOptions = {}): CodeGraphSnapshot {
  const resolvedRoot = path.resolve(rootPath);
  fileSymbolsByPath.clear();
  const files = selectFiles(resolvedRoot, options);
  const parsedFiles = files.map((filePath) => parseSourceFile(resolvedRoot, filePath));
  const filePathSet = new Set(parsedFiles.map((file) => file.path));
  const fileIdByPath = new Map(parsedFiles.map((file) => [file.path, file.id]));

  const normalizedFiles = parsedFiles.map((file) => ({
    ...file,
    imports: file.imports.map((item) => ({
      ...item,
      resolvedPath: item.resolvedPath ?? resolveImportPath(file.path, item.moduleSpecifier, filePathSet)
    }))
  }));
  const directories = buildDirectories(normalizedFiles.map((file) => file.path));
  const symbols = normalizedFiles.flatMap((file) => fileSymbolsByPath.get(file.path) ?? []);
  const symbolBySimpleName = buildSymbolNameIndex(symbols);
  const edges = buildEdges(normalizedFiles, fileIdByPath, symbols, symbolBySimpleName);

  return {
    rootPath: resolvedRoot,
    directories,
    files: normalizedFiles,
    symbols,
    edges
  };
}

const fileSymbolsByPath = new Map<string, CodeGraphSymbol[]>();

export function codeGraphId(prefix: "code-dir" | "code-file" | "code-symbol", value: string): string {
  return `${prefix}-${hashStable(value)}`;
}

function selectFiles(rootPath: string, options: CodeGraphScanOptions): string[] {
  if (!options.files && !fs.existsSync(rootPath)) {
    return [];
  }
  const inputFiles = options.files
    ? options.files.map((filePath) => normalizeRelativePath(filePath)).filter(isCodeFile)
    : walkFiles(rootPath, rootPath).filter(isCodeFile);
  return [...new Set(inputFiles)].sort().slice(0, options.maxFiles ?? 2000);
}

function walkFiles(rootPath: string, currentPath: string): string[] {
  const entries = fs.readdirSync(currentPath, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) {
      continue;
    }
    const absolutePath = path.join(currentPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(rootPath, absolutePath));
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    files.push(normalizeRelativePath(path.relative(rootPath, absolutePath)));
  }
  return files;
}

function parseSourceFile(rootPath: string, relativePath: string): CodeGraphFile {
  const absolutePath = path.join(rootPath, relativePath);
  const text = fs.readFileSync(absolutePath, "utf8");
  const sourceFile = ts.createSourceFile(relativePath, text, ts.ScriptTarget.Latest, true, scriptKindForPath(relativePath));
  const imports: CodeGraphImport[] = [];
  const exports: string[] = [];
  const symbols: CodeGraphSymbol[] = [];

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      imports.push({
        moduleSpecifier: statement.moduleSpecifier.text,
        resolvedPath: null
      });
    }
  }

  collectSymbolsFromNode(sourceFile, null, {
    filePath: relativePath,
    sourceFile,
    symbols,
    exports
  });

  fileSymbolsByPath.set(relativePath, symbols);

  return {
    id: codeGraphId("code-file", relativePath),
    path: relativePath,
    name: path.posix.basename(relativePath),
    directoryPath: normalizeDirectoryPath(path.posix.dirname(relativePath)),
    language: languageForPath(relativePath),
    startLine: 1,
    endLine: Math.max(1, text.split(/\r?\n/).length),
    imports,
    exports
  };
}

function collectSymbolsFromNode(node: ts.Node, parentSymbolId: string | null, context: SymbolCollectionContext): void {
  const visit = (current: ts.Node) => {
    if (ts.isFunctionDeclaration(current) && current.name) {
      const symbol = createFunctionSymbol(
        context.filePath,
        context.sourceFile,
        current,
        current.name.text,
        "function",
        hasExportModifier(current),
        parentSymbolId
      );
      registerSymbol(symbol, context);
      collectSymbolsFromFunctionBody(current, symbol.id, context);
      return;
    }

    if (ts.isClassDeclaration(current) && current.name) {
      const classSymbol = createObjectSymbol(
        context.filePath,
        context.sourceFile,
        current,
        current.name.text,
        "class",
        hasExportModifier(current),
        parentSymbolId
      );
      registerSymbol(classSymbol, context);
      for (const member of current.members) {
        if (ts.isMethodDeclaration(member) && member.name) {
          const methodName = `${current.name.text}.${propertyNameText(member.name, context.sourceFile)}`;
          const methodSymbol = createFunctionSymbol(
            context.filePath,
            context.sourceFile,
            member,
            methodName,
            "method",
            classSymbol.exported || hasExportModifier(member),
            parentSymbolId
          );
          registerSymbol(methodSymbol, context);
          collectSymbolsFromFunctionBody(member, methodSymbol.id, context);
        } else if (ts.isPropertyDeclaration(member) && member.name && member.initializer && isFunctionLikeNode(member.initializer)) {
          const methodName = `${current.name.text}.${propertyNameText(member.name, context.sourceFile)}`;
          const propertySymbol = createFunctionSymbol(
            context.filePath,
            context.sourceFile,
            member.initializer,
            methodName,
            "method",
            classSymbol.exported || hasExportModifier(member),
            parentSymbolId,
            member
          );
          registerSymbol(propertySymbol, context);
          collectSymbolsFromFunctionBody(member.initializer, propertySymbol.id, context);
        }
      }
      return;
    }

    if (ts.isInterfaceDeclaration(current)) {
      registerSymbol(
        createObjectSymbol(
          context.filePath,
          context.sourceFile,
          current,
          current.name.text,
          "interface",
          hasExportModifier(current),
          parentSymbolId
        ),
        context
      );
      return;
    }

    if (ts.isTypeAliasDeclaration(current)) {
      registerSymbol(
        createObjectSymbol(context.filePath, context.sourceFile, current, current.name.text, "type", hasExportModifier(current), parentSymbolId),
        context
      );
      return;
    }

    if (ts.isEnumDeclaration(current)) {
      registerSymbol(
        createObjectSymbol(context.filePath, context.sourceFile, current, current.name.text, "enum", hasExportModifier(current), parentSymbolId),
        context
      );
      return;
    }

    if (ts.isVariableStatement(current)) {
      const exported = hasExportModifier(current);
      for (const declaration of current.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) {
          continue;
        }
        if (declaration.initializer && (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer))) {
          const name = declaration.name.text;
          const symbolKind = isLikelyComponent(name, context.filePath, declaration.initializer) ? "component" : "function";
          const symbol = createFunctionSymbol(
            context.filePath,
            context.sourceFile,
            declaration.initializer,
            name,
            symbolKind,
            exported,
            parentSymbolId,
            declaration
          );
          registerSymbol(symbol, context);
          collectSymbolsFromFunctionBody(declaration.initializer, symbol.id, context);
        }
      }
      return;
    }

    ts.forEachChild(current, visit);
  };

  ts.forEachChild(node, visit);
}

function collectSymbolsFromFunctionBody(node: ts.FunctionLikeDeclaration, parentSymbolId: string, context: SymbolCollectionContext): void {
  if (!node.body) {
    return;
  }
  collectSymbolsFromNode(node.body, parentSymbolId, context);
}

function registerSymbol(symbol: CodeGraphSymbol, context: SymbolCollectionContext): void {
  context.symbols.push(symbol);
  if (symbol.exported && !symbol.parentSymbolId) {
    context.exports.push(symbol.name);
  }
}

function buildDirectories(filePaths: string[]): CodeGraphDirectory[] {
  const directories = new Set<string>(["."]);
  for (const filePath of filePaths) {
    let current = normalizeDirectoryPath(path.posix.dirname(filePath));
    while (current !== ".") {
      directories.add(current);
      current = normalizeDirectoryPath(path.posix.dirname(current));
    }
  }

  return [...directories]
    .sort((a, b) => pathDepth(a) - pathDepth(b) || a.localeCompare(b))
    .map((directoryPath) => ({
      id: codeGraphId("code-dir", directoryPath),
      path: directoryPath,
      name: directoryPath === "." ? "Code Graph" : path.posix.basename(directoryPath),
      parentPath: directoryPath === "." ? null : normalizeDirectoryPath(path.posix.dirname(directoryPath))
    }));
}

function buildEdges(
  files: CodeGraphFile[],
  fileIdByPath: Map<string, string>,
  symbols: CodeGraphSymbol[],
  symbolBySimpleName: Map<string, CodeGraphSymbol>
): CodeGraphEdge[] {
  const edges: CodeGraphEdge[] = [];
  const seen = new Set<string>();

  for (const file of files) {
    for (const imported of file.imports) {
      if (!imported.resolvedPath) {
        continue;
      }
      const targetId = fileIdByPath.get(imported.resolvedPath);
      if (!targetId) {
        continue;
      }
      const key = `${file.id}:imports:${targetId}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      edges.push({
        id: `code-edge-${hashStable(key)}`,
        kind: "imports",
        sourceId: file.id,
        targetId,
        label: imported.moduleSpecifier,
        codeContext: `${file.path} imports ${imported.resolvedPath}.`
      });
    }
  }

  for (const symbol of symbols) {
    for (const call of symbol.calls) {
      const target = symbolBySimpleName.get(call);
      if (!target || target.id === symbol.id) {
        continue;
      }
      const key = `${symbol.id}:calls:${target.id}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      edges.push({
        id: `code-edge-${hashStable(key)}`,
        kind: "calls",
        sourceId: symbol.id,
        targetId: target.id,
        label: call,
        codeContext: `${symbol.name} calls ${target.name}.`
      });
    }
  }

  return edges.sort((a, b) => a.id.localeCompare(b.id));
}

function createFunctionSymbol(
  filePath: string,
  sourceFile: ts.SourceFile,
  node: ts.FunctionLikeDeclaration,
  name: string,
  symbolKind: "function" | "method" | "component",
  exported: boolean,
  parentSymbolId: string | null,
  idNode: ts.Node = node
): CodeGraphSymbol {
  const range = lineRange(sourceFile, idNode);
  const parameters = node.parameters.map((parameter) => ({
    name: parameter.name.getText(sourceFile),
    typeHint: parameter.type?.getText(sourceFile) ?? null
  }));
  const id = codeGraphId("code-symbol", `${filePath}:${name}:${range.startLine}`);
  const finalKind = symbolKind === "function" && isLikelyComponent(name, filePath, node) ? "component" : symbolKind;
  const calls = extractCalls(node, sourceFile);
  return {
    id,
    filePath,
    kind: "function",
    symbolKind: finalKind,
    name,
    exported,
    parentSymbolId,
    startLine: range.startLine,
    endLine: range.endLine,
    signature: signatureText(node, sourceFile, name),
    parameters,
    returnHint: node.type?.getText(sourceFile) ?? (containsJsx(node) ? "JSX.Element" : null),
    calls,
    workflow: buildFunctionWorkflow(id, name, node, sourceFile),
    summary: `${exported ? "Exported " : ""}${parentSymbolId ? "nested " : ""}${finalKind} ${name} from ${filePath}.`
  };
}

function createObjectSymbol(
  filePath: string,
  sourceFile: ts.SourceFile,
  node: ts.Node & { name?: ts.Identifier },
  name: string,
  symbolKind: "class" | "interface" | "type" | "enum",
  exported: boolean,
  parentSymbolId: string | null
): CodeGraphSymbol {
  const range = lineRange(sourceFile, node);
  return {
    id: codeGraphId("code-symbol", `${filePath}:${name}:${range.startLine}`),
    filePath,
    kind: "object",
    symbolKind,
    name,
    exported,
    parentSymbolId,
    startLine: range.startLine,
    endLine: range.endLine,
    signature: node.getText(sourceFile).split(/\r?\n/, 1)[0]?.trim() ?? name,
    parameters: [],
    returnHint: null,
    calls: [],
    workflow: null,
    summary: `${exported ? "Exported " : ""}${parentSymbolId ? "nested " : ""}${symbolKind} ${name} from ${filePath}.`
  };
}

function buildFunctionWorkflow(symbolId: string, symbolName: string, node: ts.FunctionLikeDeclaration, sourceFile: ts.SourceFile): CodeGraphFunctionWorkflow {
  const range = lineRange(sourceFile, node);
  const context: WorkflowBuildContext = {
    symbolId,
    symbolName,
    sourceFile,
    nodes: [],
    edges: [],
    nodeIds: new Set(),
    edgeIds: new Set()
  };
  const entryNode: CodeGraphWorkflowNode = {
    id: `${symbolId}-process`,
    kind: "entry",
    name: `Entry ${symbolName}`,
    summary: `Function entry for ${symbolName}`,
    codeContext: signatureText(node, sourceFile, symbolName),
    startLine: range.startLine,
    endLine: range.endLine
  };
  addWorkflowNode(context, entryNode);

  if (!node.body) {
    return { nodes: context.nodes, edges: context.edges };
  }

  if (ts.isBlock(node.body)) {
    buildStatementFlow([...node.body.statements], [{ nodeId: entryNode.id }], context);
  } else {
    const returnNode = createReturnNode(node.body, context, "Returns expression");
    connectToWorkflowNode(context, [{ nodeId: entryNode.id }], returnNode.id, "return");
  }

  return {
    nodes: context.nodes,
    edges: context.edges
  };
}

function buildStatementFlow(statements: ts.Statement[], incoming: PendingFlowExit[], context: WorkflowBuildContext): PendingFlowExit[] {
  let exits = incoming;
  for (const statement of statements) {
    if (exits.length === 0) {
      continue;
    }
    exits = buildStatement(statement, exits, context);
  }
  return exits;
}

function buildStatement(statement: ts.Statement, incoming: PendingFlowExit[], context: WorkflowBuildContext): PendingFlowExit[] {
  if (ts.isBlock(statement)) {
    return buildStatementFlow([...statement.statements], incoming, context);
  }

  if (ts.isIfStatement(statement)) {
    return buildIfStatement(statement, incoming, context);
  }

  if (ts.isSwitchStatement(statement)) {
    return buildSwitchStatement(statement, incoming, context);
  }

  if (isLoopStatement(statement)) {
    return buildLoopStatement(statement, incoming, context);
  }

  if (ts.isTryStatement(statement)) {
    return buildTryStatement(statement, incoming, context);
  }

  if (ts.isReturnStatement(statement)) {
    return buildReturnStatement(statement, incoming, context);
  }

  if (ts.isThrowStatement(statement)) {
    const throwNode = createThrowNode(statement, context);
    connectToWorkflowNode(context, incoming, throwNode.id, "throw");
    return [];
  }

  const conditionalExpression = findConditionalExpression(statement);
  if (conditionalExpression) {
    return buildTernaryExpression(statement, conditionalExpression, incoming, context);
  }

  const statementNode = createStatementNode(statement, context);
  connectToWorkflowNode(context, incoming, statementNode.id, defaultFlowLabel(statement));
  return [{ nodeId: statementNode.id }];
}

function buildIfStatement(statement: ts.IfStatement, incoming: PendingFlowExit[], context: WorkflowBuildContext): PendingFlowExit[] {
  const conditionText = expressionText(statement.expression, context.sourceFile);
  const conditionNode = createConditionNode(statement.expression, context, `If ${conditionText}`, `Branch on ${conditionText}`);
  connectToWorkflowNode(context, incoming, conditionNode.id, "evaluate");
  const thenExits = buildStatement(statement.thenStatement, [{ nodeId: conditionNode.id, label: `if ${conditionText}` }], context);
  const elseExits = statement.elseStatement
    ? buildStatement(statement.elseStatement, [{ nodeId: conditionNode.id, label: "else" }], context)
    : [{ nodeId: conditionNode.id, label: "else" }];
  return [...thenExits, ...elseExits];
}

function buildSwitchStatement(statement: ts.SwitchStatement, incoming: PendingFlowExit[], context: WorkflowBuildContext): PendingFlowExit[] {
  const switchText = expressionText(statement.expression, context.sourceFile);
  const conditionNode = createConditionNode(statement.expression, context, `Switch ${switchText}`, `Branch on switch ${switchText}`);
  connectToWorkflowNode(context, incoming, conditionNode.id, "evaluate");

  const exits: PendingFlowExit[] = [];
  for (const clause of statement.caseBlock.clauses) {
    const label = ts.isCaseClause(clause) ? `case ${expressionText(clause.expression, context.sourceFile)}` : "default";
    const clauseExits = buildStatementFlow([...clause.statements], [{ nodeId: conditionNode.id, label }], context);
    exits.push(...clauseExits);
  }
  return exits.length > 0 ? exits : [{ nodeId: conditionNode.id, label: "default" }];
}

function buildLoopStatement(statement: ts.Statement, incoming: PendingFlowExit[], context: WorkflowBuildContext): PendingFlowExit[] {
  const loopNode = createConditionNode(statement, context, loopNodeName(statement, context.sourceFile), "Loop control flow");
  connectToWorkflowNode(context, incoming, loopNode.id, "enter loop");
  const body = loopBody(statement);
  if (body) {
    const bodyExits = buildStatement(body, [{ nodeId: loopNode.id, label: "loop" }], context);
    for (const exit of bodyExits) {
      addWorkflowEdge(context, exit.nodeId, loopNode.id, exit.label ?? "next iteration", `${context.symbolName} continues loop execution.`);
    }
  }
  return [{ nodeId: loopNode.id, label: "exit loop" }];
}

function buildTryStatement(statement: ts.TryStatement, incoming: PendingFlowExit[], context: WorkflowBuildContext): PendingFlowExit[] {
  const tryNode = createStatementNode(statement, context, "Try block", "Protected try block");
  connectToWorkflowNode(context, incoming, tryNode.id, "try");
  const tryExits = buildStatementFlow([...statement.tryBlock.statements], [{ nodeId: tryNode.id }], context);
  const catchExits = statement.catchClause
    ? buildStatementFlow([...statement.catchClause.block.statements], [{ nodeId: tryNode.id, label: "catch error" }], context)
    : [];
  const combinedExits = [...tryExits, ...catchExits];
  if (!statement.finallyBlock) {
    return combinedExits;
  }

  const finallyNode = createStatementNode(statement.finallyBlock, context, "Finally block", "Always-run cleanup block");
  connectToWorkflowNode(context, combinedExits.length > 0 ? combinedExits : [{ nodeId: tryNode.id }], finallyNode.id, "finally");
  return buildStatementFlow([...statement.finallyBlock.statements], [{ nodeId: finallyNode.id }], context);
}

function buildReturnStatement(statement: ts.ReturnStatement, incoming: PendingFlowExit[], context: WorkflowBuildContext): PendingFlowExit[] {
  if (statement.expression && ts.isConditionalExpression(statement.expression)) {
    return buildTernaryReturn(statement, statement.expression, incoming, context);
  }
  const returnNode = createReturnNode(statement, context);
  connectToWorkflowNode(context, incoming, returnNode.id, "return");
  return [];
}

function buildTernaryReturn(
  statement: ts.ReturnStatement,
  expression: ts.ConditionalExpression,
  incoming: PendingFlowExit[],
  context: WorkflowBuildContext
): PendingFlowExit[] {
  const conditionText = expressionText(expression.condition, context.sourceFile);
  const conditionNode = createConditionNode(expression.condition, context, `Ternary ${conditionText}`, `Return branches on ${conditionText}`);
  connectToWorkflowNode(context, incoming, conditionNode.id, "evaluate");
  const trueReturn = createReturnNode(statement, context, `Return ${shortText(expression.whenTrue, context.sourceFile)}`, expression.whenTrue);
  const falseReturn = createReturnNode(statement, context, `Return ${shortText(expression.whenFalse, context.sourceFile)}`, expression.whenFalse);
  addWorkflowEdge(context, conditionNode.id, trueReturn.id, `if ${conditionText}`, `${context.symbolName} returns the true branch.`);
  addWorkflowEdge(context, conditionNode.id, falseReturn.id, "else", `${context.symbolName} returns the false branch.`);
  return [];
}

function buildTernaryExpression(
  statement: ts.Statement,
  expression: ts.ConditionalExpression,
  incoming: PendingFlowExit[],
  context: WorkflowBuildContext
): PendingFlowExit[] {
  const conditionText = expressionText(expression.condition, context.sourceFile);
  const conditionNode = createConditionNode(expression.condition, context, `Ternary ${conditionText}`, `Expression branches on ${conditionText}`);
  const trueNode = createStatementNode(expression.whenTrue, context, `Ternary true ${shortText(expression.whenTrue, context.sourceFile)}`, "Ternary true branch");
  const falseNode = createStatementNode(expression.whenFalse, context, `Ternary false ${shortText(expression.whenFalse, context.sourceFile)}`, "Ternary false branch");
  connectToWorkflowNode(context, incoming, conditionNode.id, defaultFlowLabel(statement));
  addWorkflowEdge(context, conditionNode.id, trueNode.id, `if ${conditionText}`, `${context.symbolName} evaluates the ternary true branch.`);
  addWorkflowEdge(context, conditionNode.id, falseNode.id, "else", `${context.symbolName} evaluates the ternary false branch.`);
  return [{ nodeId: trueNode.id }, { nodeId: falseNode.id }];
}

function createConditionNode(node: ts.Node, context: WorkflowBuildContext, name: string, summary: string): CodeGraphWorkflowNode {
  const range = lineRange(context.sourceFile, node);
  const text = normalizedText(node, context.sourceFile);
  const conditionNode = {
    id: `${context.symbolId}-condition-${hashStable(`${range.startLine}:${text}`)}`,
    kind: "condition" as const,
    name: truncate(name, 72),
    summary,
    codeContext: text,
    startLine: range.startLine,
    endLine: range.endLine
  };
  addWorkflowNode(context, conditionNode);
  return conditionNode;
}

function createStatementNode(node: ts.Node, context: WorkflowBuildContext, name?: string, summary?: string): CodeGraphWorkflowNode {
  const range = lineRange(context.sourceFile, node);
  const text = normalizedText(node, context.sourceFile);
  const statementNode = {
    id: `${context.symbolId}-stmt-${hashStable(`${range.startLine}:${range.endLine}:${text}`)}`,
    kind: "statement" as const,
    name: truncate(name ?? statementNodeName(node, context.sourceFile), 72),
    summary: summary ?? "Statement step",
    codeContext: text,
    startLine: range.startLine,
    endLine: range.endLine
  };
  addWorkflowNode(context, statementNode);
  return statementNode;
}

function createReturnNode(
  node: ts.Node,
  context: WorkflowBuildContext,
  name = "Return value",
  idNode: ts.Node = node
): CodeGraphWorkflowNode {
  const range = lineRange(context.sourceFile, idNode);
  const text = normalizedText(idNode, context.sourceFile);
  const returnNode = {
    id: `${context.symbolId}-return-${hashStable(`${range.startLine}:${text}`)}`,
    kind: "return" as const,
    name: truncate(name, 72),
    summary: "Return path",
    codeContext: text,
    startLine: range.startLine,
    endLine: range.endLine
  };
  addWorkflowNode(context, returnNode);
  return returnNode;
}

function createThrowNode(node: ts.ThrowStatement, context: WorkflowBuildContext): CodeGraphWorkflowNode {
  const range = lineRange(context.sourceFile, node);
  const text = normalizedText(node, context.sourceFile);
  const throwNode = {
    id: `${context.symbolId}-throw-${hashStable(`${range.startLine}:${text}`)}`,
    kind: "throw" as const,
    name: "Throw error",
    summary: "Exceptional output path",
    codeContext: text,
    startLine: range.startLine,
    endLine: range.endLine
  };
  addWorkflowNode(context, throwNode);
  return throwNode;
}

function addWorkflowNode(context: WorkflowBuildContext, node: CodeGraphWorkflowNode): void {
  if (context.nodeIds.has(node.id)) {
    return;
  }
  context.nodeIds.add(node.id);
  context.nodes.push(node);
}

function connectToWorkflowNode(context: WorkflowBuildContext, incoming: PendingFlowExit[], targetId: string, fallbackLabel: string): void {
  for (const exit of incoming) {
    addWorkflowEdge(context, exit.nodeId, targetId, exit.label ?? fallbackLabel, `${context.symbolName} ${exit.label ?? fallbackLabel}.`);
  }
}

function addWorkflowEdge(context: WorkflowBuildContext, sourceId: string, targetId: string, label: string, codeContext: string): void {
  const id = `code-edge-${hashStable(`${sourceId}:flows:${targetId}:${label}`)}`;
  if (context.edgeIds.has(id)) {
    return;
  }
  context.edgeIds.add(id);
  context.edges.push({
    id,
    sourceId,
    targetId,
    label,
    codeContext
  });
}

function extractCalls(node: ts.Node, sourceFile: ts.SourceFile): string[] {
  const calls = new Set<string>();
  const visit = (current: ts.Node) => {
    if (current !== node && (isFunctionLikeNode(current) || ts.isClassDeclaration(current))) {
      return;
    }
    if (ts.isCallExpression(current)) {
      const name = callExpressionName(current.expression, sourceFile);
      if (name) {
        calls.add(name);
      }
    }
    ts.forEachChild(current, visit);
  };
  ts.forEachChild(node, visit);
  return [...calls].sort();
}

function buildSymbolNameIndex(symbols: CodeGraphSymbol[]): Map<string, CodeGraphSymbol> {
  const byName = new Map<string, CodeGraphSymbol>();
  for (const symbol of symbols) {
    byName.set(symbol.name, symbol);
    byName.set(symbol.name.split(".").at(-1) ?? symbol.name, symbol);
  }
  return byName;
}

function resolveImportPath(sourceFilePath: string, moduleSpecifier: string, filePathSet: Set<string>): string | null {
  if (!moduleSpecifier.startsWith(".")) {
    return null;
  }
  const base = normalizeRelativePath(path.posix.join(path.posix.dirname(sourceFilePath), moduleSpecifier));
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    `${base}.mjs`,
    `${base}.cjs`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
    `${base}/index.js`,
    `${base}/index.jsx`
  ];
  return candidates.find((candidate) => filePathSet.has(candidate)) ?? null;
}

function signatureText(node: ts.FunctionLikeDeclaration, sourceFile: ts.SourceFile, name: string): string {
  const params = node.parameters.map((parameter) => parameter.getText(sourceFile)).join(", ");
  const returnType = node.type ? `: ${node.type.getText(sourceFile)}` : "";
  return `${name}(${params})${returnType}`;
}

function isLikelyComponent(name: string, filePath: string, node: ts.Node): boolean {
  return (/^[A-Z]/.test(name) && filePath.endsWith(".tsx")) || containsJsx(node);
}

function containsJsx(node: ts.Node): boolean {
  let found = false;
  const visit = (current: ts.Node) => {
    if (found) {
      return;
    }
    if (ts.isJsxElement(current) || ts.isJsxSelfClosingElement(current) || ts.isJsxFragment(current)) {
      found = true;
      return;
    }
    ts.forEachChild(current, visit);
  };
  visit(node);
  return found;
}

function callExpressionName(expression: ts.Expression, sourceFile: ts.SourceFile): string | null {
  if (ts.isIdentifier(expression)) {
    return expression.text;
  }
  if (ts.isPropertyAccessExpression(expression)) {
    return expression.name.text;
  }
  if (ts.isElementAccessExpression(expression)) {
    return expression.argumentExpression?.getText(sourceFile) ?? null;
  }
  return null;
}

function propertyNameText(name: ts.PropertyName, sourceFile: ts.SourceFile): string {
  if (ts.isIdentifier(name) || ts.isPrivateIdentifier(name)) {
    return name.text;
  }
  return name.getText(sourceFile);
}

function hasExportModifier(node: ts.Node): boolean {
  return Boolean(ts.canHaveModifiers(node) && ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword));
}

function lineRange(sourceFile: ts.SourceFile, node: ts.Node): { startLine: number; endLine: number } {
  const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
  const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
  return { startLine: start, endLine: end };
}

function scriptKindForPath(filePath: string): ts.ScriptKind {
  if (filePath.endsWith(".tsx")) {
    return ts.ScriptKind.TSX;
  }
  if (filePath.endsWith(".jsx")) {
    return ts.ScriptKind.JSX;
  }
  if (filePath.endsWith(".js") || filePath.endsWith(".mjs") || filePath.endsWith(".cjs")) {
    return ts.ScriptKind.JS;
  }
  return ts.ScriptKind.TS;
}

function languageForPath(filePath: string): CodeGraphLanguage {
  return filePath.endsWith(".js") || filePath.endsWith(".jsx") || filePath.endsWith(".mjs") || filePath.endsWith(".cjs") ? "javascript" : "typescript";
}

function isCodeFile(filePath: string): boolean {
  if (filePath.endsWith(".d.ts")) {
    return false;
  }
  return CODE_EXTENSIONS.has(path.extname(filePath));
}

function normalizeDirectoryPath(value: string): string {
  const normalized = normalizeRelativePath(value);
  return normalized === "" ? "." : normalized;
}

function normalizeRelativePath(value: string): string {
  const normalized = value.replaceAll(path.sep, "/").replace(/^\.\/+/, "");
  return normalized === "." ? "." : normalized;
}

function pathDepth(value: string): number {
  return value === "." ? 0 : value.split("/").length;
}

function hashStable(value: string): string {
  return crypto.createHash("sha1").update(value).digest("hex").slice(0, 16);
}

function isFunctionLikeNode(node: ts.Node): node is ts.FunctionLikeDeclaration {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isGetAccessor(node) ||
    ts.isSetAccessor(node)
  );
}

function isLoopStatement(statement: ts.Statement): statement is ts.ForStatement | ts.ForInStatement | ts.ForOfStatement | ts.WhileStatement | ts.DoStatement {
  return (
    ts.isForStatement(statement) ||
    ts.isForInStatement(statement) ||
    ts.isForOfStatement(statement) ||
    ts.isWhileStatement(statement) ||
    ts.isDoStatement(statement)
  );
}

function loopBody(statement: ts.Statement): ts.Statement | null {
  if (isLoopStatement(statement)) {
    return statement.statement;
  }
  return null;
}

function loopNodeName(statement: ts.Statement, sourceFile: ts.SourceFile): string {
  if (ts.isWhileStatement(statement) || ts.isDoStatement(statement)) {
    return `Loop ${expressionText(statement.expression, sourceFile)}`;
  }
  if (ts.isForStatement(statement)) {
    return `Loop ${statement.condition ? expressionText(statement.condition, sourceFile) : "for"}`;
  }
  if (ts.isForInStatement(statement) || ts.isForOfStatement(statement)) {
    return `Loop ${shortText(statement.expression, sourceFile)}`;
  }
  return "Loop";
}

function defaultFlowLabel(statement: ts.Statement): string {
  if (ts.isVariableStatement(statement)) {
    return "assign";
  }
  if (ts.isExpressionStatement(statement)) {
    return "execute";
  }
  if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) {
    return "declare";
  }
  return "then";
}

function statementNodeName(node: ts.Node, sourceFile: ts.SourceFile): string {
  if (ts.isVariableStatement(node)) {
    return `Assign ${shortText(node.declarationList, sourceFile)}`;
  }
  if (ts.isExpressionStatement(node)) {
    return `Execute ${shortText(node.expression, sourceFile)}`;
  }
  if (ts.isFunctionDeclaration(node) && node.name) {
    return `Declare ${node.name.text}`;
  }
  if (ts.isClassDeclaration(node) && node.name) {
    return `Declare ${node.name.text}`;
  }
  return shortText(node, sourceFile);
}

function findConditionalExpression(node: ts.Node): ts.ConditionalExpression | null {
  let found: ts.ConditionalExpression | null = null;
  const visit = (current: ts.Node) => {
    if (found || isFunctionLikeNode(current)) {
      return;
    }
    if (ts.isConditionalExpression(current)) {
      found = current;
      return;
    }
    ts.forEachChild(current, visit);
  };
  ts.forEachChild(node, visit);
  return found;
}

function expressionText(expression: ts.Expression | ts.Node, sourceFile: ts.SourceFile): string {
  return truncate(normalizedText(expression, sourceFile), 96);
}

function shortText(node: ts.Node, sourceFile: ts.SourceFile): string {
  return truncate(normalizedText(node, sourceFile), 56);
}

function normalizedText(node: ts.Node, sourceFile: ts.SourceFile): string {
  return node.getText(sourceFile).replace(/\s+/g, " ").trim();
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxLength - 1))}...`;
}
