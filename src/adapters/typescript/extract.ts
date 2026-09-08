import ts from 'typescript';
import type {
  Declaration,
  Evidence,
  Fact,
  ScanData,
  ScanDiagnostic,
  SourceUnit,
} from '../../model/structural.js';
import { SourceStore, sha256, sourcePath, VIRTUAL_ROOT } from '../../repository/source.js';
import { compare } from '../../repository/inventory.js';
import { recordId } from '../../analysis/identity.js';
import { discoverProjects } from './projects.js';

function declarationKind(node: ts.Node): Declaration['kind'] | null {
  if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node))
    return 'function';
  if (ts.isVariableDeclaration(node)) return 'variable';
  if (ts.isParameter(node)) return 'parameter';
  if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) return 'class';
  if (
    ts.isMethodDeclaration(node) ||
    ts.isMethodSignature(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node)
  )
    return 'method';
  if (
    ts.isPropertyDeclaration(node) ||
    ts.isPropertySignature(node) ||
    ts.isPropertyAssignment(node)
  )
    return 'property';
  if (ts.isInterfaceDeclaration(node)) return 'interface';
  if (ts.isTypeAliasDeclaration(node) || ts.isTypeParameterDeclaration(node)) return 'type';
  if (ts.isEnumDeclaration(node) || ts.isEnumMember(node)) return 'enum';
  if (ts.isModuleDeclaration(node)) return 'namespace';
  if (ts.isBindingElement(node)) return 'binding';
  return null;
}

function typeUse(node: ts.Node): boolean {
  for (let current: ts.Node | undefined = node; current; current = current.parent) {
    // Type arguments are encountered first, but the base-class expression itself
    // is evaluated. Interface heritage and implements clauses remain type-only.
    if (
      ts.isExpressionWithTypeArguments(current) &&
      ts.isHeritageClause(current.parent) &&
      current.parent.token === ts.SyntaxKind.ExtendsKeyword &&
      ts.isClassLike(current.parent.parent)
    )
      return false;
    if (
      ts.isTypeNode(current) ||
      ts.isInterfaceDeclaration(current) ||
      ts.isTypeAliasDeclaration(current)
    )
      return true;
    if (ts.isExpressionStatement(current) || ts.isStatement(current)) return false;
  }
  return false;
}

const isTypeDeclaration = (node: ts.Node) =>
  ts.isInterfaceDeclaration(node) ||
  ts.isTypeAliasDeclaration(node) ||
  ts.isTypeParameterDeclaration(node);
const named = (node: ts.Node): ts.DeclarationName | undefined => (node as ts.NamedDeclaration).name;
function ambient(node: ts.Node): boolean {
  if (node.getSourceFile().isDeclarationFile) return true;
  for (let current: ts.Node | undefined = node; current; current = current.parent) {
    if (
      ts.canHaveModifiers(current) &&
      ts.getModifiers(current)?.some((modifier) => modifier.kind === ts.SyntaxKind.DeclareKeyword)
    )
      return true;
  }
  return false;
}

export function extract(
  store: SourceStore,
  diagnostics: ScanDiagnostic[],
  projectPath?: string,
): Pick<ScanData, 'projects' | 'files' | 'reads' | 'symbols' | 'facts' | 'evidence'> {
  const selected = store.manifest.data.files
    .filter(
      (file) => file.status === 'inventoried' && ['source', 'declaration'].includes(file.kind),
    )
    .map((file) => file.path);
  const selectedSet = new Set(selected);
  const projects = discoverProjects(store, selected, diagnostics, projectPath);
  const units = new Map<string, SourceUnit>();
  const symbols = new Map<string, Declaration>();
  const evidence = new Map<string, Evidence>();
  const facts = new Map<string, Fact>();
  const snapshot = store.manifest.snapshot_id;
  const unit = (path: string): SourceUnit => {
    let value = units.get(path);
    if (!value) {
      const entry = store.entries.get(path)!;
      value = {
        id: recordId('file', [snapshot, path, entry.object_id]),
        path,
        blob_sha: entry.object_id,
        content_sha256: null,
        size_bytes: entry.size_bytes!,
        role: selectedSet.has(path) ? 'selected' : 'support',
        status: 'failed',
        project_ids: [],
      };
      units.set(path, value);
    }
    return value;
  };
  for (const path of selected) unit(path);

  for (const project of projects) {
    if (!project.record.selected_files.length) continue;
    const projectId = project.record.id;
    // Source-only programs preserve the project's resolver options but never load
    // ambient packages, compiler libs, build outputs, or host filesystem content.
    const options: ts.CompilerOptions = {
      ...project.options,
      noLib: true,
      types: [],
      noEmit: true,
      allowJs: true,
      checkJs: false,
      incremental: false,
      composite: false,
    };
    const sources = new Map<string, ts.SourceFile>();
    const host: ts.CompilerHost = {
      getSourceFile: (fileName, languageVersion) => {
        const cached = sources.get(fileName);
        if (cached) return cached;
        const path = sourcePath(fileName);
        const entry = path === null ? undefined : store.entries.get(path);
        if (
          path !== null &&
          entry &&
          store.allowed(path) &&
          ['source', 'declaration'].includes(entry.kind)
        ) {
          const file = unit(path);
          file.project_ids = [...new Set([...file.project_ids, projectId])].sort(compare);
        }
        const text = store.readVirtual(fileName);
        if (text === undefined) return undefined;
        const source = ts.createSourceFile(fileName, text, languageVersion, true);
        sources.set(fileName, source);
        return source;
      },
      getDefaultLibFileName: () => VIRTUAL_ROOT + '__no_standard_library__.d.ts',
      writeFile: () => {
        throw new Error('The structural adapter must never emit files.');
      },
      getCurrentDirectory: () => VIRTUAL_ROOT,
      getDirectories: store.directories,
      fileExists: store.exists,
      readFile: store.readVirtual,
      directoryExists: store.directoryExists,
      realpath: (path) => path,
      getCanonicalFileName: (path) => path,
      useCaseSensitiveFileNames: () => true,
      getNewLine: () => '\n',
    };
    const program = ts.createProgram(
      project.record.selected_files.map((path) => VIRTUAL_ROOT + path),
      options,
      host,
    );
    const checker = program.getTypeChecker();
    const failed = new Set<string>();
    const sourceFiles = program
      .getSourceFiles()
      .filter((source) => {
        const path = sourcePath(source.fileName);
        const entry = path === null ? undefined : store.entries.get(path);
        return !!entry && ['source', 'declaration'].includes(entry.kind);
      })
      .sort((a, b) => compare(a.fileName, b.fileName));
    for (const source of sourceFiles) {
      const path = sourcePath(source.fileName)!;
      const file = unit(path);
      file.project_ids = [...new Set([...file.project_ids, projectId])].sort(compare);
      file.content_sha256 = store.reads.get(path)!.content_sha256;
      const errors = program.getSyntacticDiagnostics(source);
      file.status = errors.length ? 'failed' : 'parsed';
      if (errors.length) failed.add(path);
      for (const error of errors) {
        const start = error.start ?? 0;
        const end = start + (error.length ?? 0);
        diagnostics.push({
          code: `PARSE_${error.code}`,
          message: ts.flattenDiagnosticMessageText(error.messageText, '\n'),
          severity: 'error',
          path,
          project_id: projectId,
          start_byte: Buffer.byteLength(source.text.slice(0, start)),
          end_byte: Buffer.byteLength(source.text.slice(0, end)),
        });
      }
    }
    for (const path of project.record.selected_files) {
      const file = unit(path);
      file.project_ids = [...new Set([...file.project_ids, projectId])].sort(compare);
      if (!program.getSourceFile(VIRTUAL_ROOT + path))
        diagnostics.push({
          code: 'SOURCE_NOT_PARSED',
          message:
            store.failures.get(path) ??
            'Selected source could not be loaded by the source-only program.',
          severity: 'error',
          path,
          project_id: projectId,
          start_byte: null,
          end_byte: null,
        });
    }

    const addEvidence = (
      node: ts.Node,
      method: Evidence['method'] = 'typescript-syntax',
    ): string => {
      const source = node.getSourceFile();
      const file = unit(sourcePath(source.fileName)!);
      const start = node.getStart(source);
      const end = node.getEnd();
      const a = source.getLineAndCharacterOfPosition(start);
      const b = source.getLineAndCharacterOfPosition(end);
      const value: Omit<Evidence, 'id'> = {
        snapshot_id: snapshot,
        file_id: file.id,
        project_id: projectId,
        blob_sha: file.blob_sha,
        content_sha256: file.content_sha256!,
        start_byte: Buffer.byteLength(source.text.slice(0, start)),
        end_byte: Buffer.byteLength(source.text.slice(0, end)),
        start_line: a.line + 1,
        start_column: a.character + 1,
        end_line: b.line + 1,
        end_column: b.character + 1,
        span_sha256: sha256(source.text.slice(start, end)),
        method,
      };
      const id = recordId('evidence', value);
      evidence.set(id, { id, ...value });
      return id;
    };
    const addDeclaration = (node: ts.Declaration): string | null => {
      const source = node.getSourceFile();
      const path = sourcePath(source.fileName);
      if (!path || failed.has(path) || !units.has(path)) return null;
      const kind = declarationKind(node);
      if (!kind) return null;
      const name =
        named(node)?.getText(source) ??
        (ts.isFunctionDeclaration(node) ||
        ts.isClassDeclaration(node) ||
        ts.isExportAssignment(node.parent)
          ? 'default'
          : '<anonymous>');
      const value: Omit<Declaration, 'id'> = {
        file_id: unit(path).id,
        project_id: projectId,
        name,
        kind,
        evidence_id: addEvidence(node),
      };
      const id = recordId('symbol', value);
      symbols.set(id, { id, ...value });
      return id;
    };
    const addFact = (
      node: ts.Node,
      value: Omit<Fact, 'id' | 'project_id' | 'evidence_ids'>,
      method: Evidence['method'] = 'typescript-syntax',
    ) => {
      const body = { ...value, project_id: projectId, evidence_ids: [addEvidence(node, method)] };
      const id = recordId('fact', body);
      facts.set(id, { id, ...body });
    };
    const unalias = (symbol: ts.Symbol | undefined): ts.Symbol | undefined =>
      symbol && symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
    const symbolAt = (node: ts.Node) => unalias(checker.getSymbolAtLocation(node));
    const targetOf = (symbol: ts.Symbol | undefined): string | null => {
      const declarations = symbol?.declarations;
      if (!declarations?.length) return null;
      // Overloads/merges are a set of declarations, not a unique source anchor.
      if (declarations.length !== 1) return null;
      return addDeclaration(declarations[0]!);
    };
    const writes = new Set<ts.Symbol>();
    const markWrite = (node: ts.Node): void => {
      if (ts.isArrayLiteralExpression(node)) {
        node.elements.forEach(markWrite);
        return;
      }
      if (ts.isObjectLiteralExpression(node)) {
        for (const property of node.properties) {
          if (ts.isShorthandPropertyAssignment(property)) {
            const symbol = unalias(checker.getShorthandAssignmentValueSymbol(property));
            if (symbol) writes.add(symbol);
          } else if (ts.isPropertyAssignment(property)) markWrite(property.initializer);
          else if (ts.isSpreadAssignment(property)) markWrite(property.expression);
        }
        return;
      }
      if (ts.isSpreadElement(node) || ts.isParenthesizedExpression(node)) {
        markWrite(node.expression);
        return;
      }
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
        markWrite(node.left);
        return;
      }
      const symbol = symbolAt(node);
      if (symbol) writes.add(symbol);
    };
    const collectWrites = (node: ts.Node) => {
      if (
        (ts.isForOfStatement(node) || ts.isForInStatement(node)) &&
        !ts.isVariableDeclarationList(node.initializer)
      )
        markWrite(node.initializer);
      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
        node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
      ) {
        markWrite(node.left);
      }
      if (
        (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
        [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(node.operator)
      ) {
        const symbol = symbolAt(node.operand);
        if (symbol) writes.add(symbol);
      }
      ts.forEachChild(node, collectWrites);
    };
    for (const source of sourceFiles)
      if (!failed.has(sourcePath(source.fileName)!)) collectWrites(source);

    for (const source of sourceFiles) {
      const path = sourcePath(source.fileName)!;
      // Dependency bodies support resolution, but do not acquire full extraction coverage.
      if (!project.record.selected_files.includes(path) || failed.has(path)) continue;
      const file = unit(path);
      const base = (
        kind: Fact['kind'],
        name: string,
        usage: Fact['usage'] = 'runtime',
      ): Omit<Fact, 'id' | 'project_id' | 'evidence_ids'> => ({
        kind,
        subject_id: file.id,
        target_id: null,
        name,
        specifier: null,
        usage,
        resolution: 'observed',
        reason: null,
      });
      const moduleFact = (
        node: ts.Node,
        specifier: ts.Expression | undefined,
        kind: 'import' | 'export',
        usage: Fact['usage'],
        name: string,
      ) => {
        const literal = specifier && ts.isStringLiteralLike(specifier) ? specifier : null;
        const declaration = literal
          ? checker.getSymbolAtLocation(literal)?.declarations?.find(ts.isSourceFile)
          : undefined;
        const targetPath = declaration ? sourcePath(declaration.fileName) : null;
        const target =
          targetPath && units.has(targetPath) && !failed.has(targetPath)
            ? unit(targetPath).id
            : null;
        addFact(
          node,
          {
            ...base(kind, name, usage),
            specifier: literal?.text ?? null,
            target_id: target,
            resolution: target ? 'resolved' : 'unresolved',
            reason: target
              ? null
              : literal
                ? 'module-unavailable-in-source-only-mode'
                : 'dynamic-module-specifier',
          },
          'typescript-symbol',
        );
      };
      const visit = (node: ts.Node, owner: string) => {
        const kind = declarationKind(node);
        let currentOwner = owner;
        const nodeModifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
        const anonymousDefault =
          (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) &&
          nodeModifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword);
        if (kind && (named(node) || anonymousDefault)) {
          const symbol = addDeclaration(node as ts.Declaration);
          if (symbol) {
            addFact(node, {
              ...base(
                'declaration',
                named(node)?.getText(source) ?? 'default',
                isTypeDeclaration(node) ? 'type' : 'runtime',
              ),
              subject_id: symbol,
            });
            const constCallable =
              ts.isVariableDeclaration(node) &&
              !!(node.parent.flags & ts.NodeFlags.Const) &&
              node.initializer &&
              (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer));
            if (['function', 'method', 'class', 'namespace'].includes(kind) || constCallable)
              currentOwner = symbol;
            const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
            if (modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword))
              addFact(node, {
                ...base(
                  'export',
                  modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword)
                    ? 'default'
                    : named(node)!.getText(source),
                  isTypeDeclaration(node) ? 'type' : 'runtime',
                ),
                target_id: symbol,
                resolution: 'resolved',
              });
            if (
              ts.isVariableDeclaration(node) &&
              ts.isVariableDeclarationList(node.parent) &&
              ts.isVariableStatement(node.parent.parent) &&
              node.parent.parent.modifiers?.some(
                (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
              )
            )
              addFact(node, {
                ...base('export', named(node)!.getText(source)),
                target_id: symbol,
                resolution: 'resolved',
              });
          }
        }
        if (ts.isImportDeclaration(node)) {
          const clause = node.importClause;
          if (!clause) moduleFact(node, node.moduleSpecifier, 'import', 'runtime', '<side-effect>');
          else {
            if (clause.name)
              moduleFact(
                clause.name,
                node.moduleSpecifier,
                'import',
                clause.isTypeOnly ? 'type' : 'runtime',
                clause.name.text,
              );
            const bindings = clause.namedBindings;
            if (bindings && ts.isNamespaceImport(bindings))
              moduleFact(
                bindings,
                node.moduleSpecifier,
                'import',
                clause.isTypeOnly ? 'type' : 'runtime',
                bindings.name.text,
              );
            if (bindings && ts.isNamedImports(bindings)) {
              if (!bindings.elements.length)
                moduleFact(
                  node,
                  node.moduleSpecifier,
                  'import',
                  clause.isTypeOnly ? 'type' : 'runtime',
                  '<empty-bindings>',
                );
              for (const binding of bindings.elements)
                moduleFact(
                  binding,
                  node.moduleSpecifier,
                  'import',
                  clause.isTypeOnly || binding.isTypeOnly ? 'type' : 'runtime',
                  binding.name.text,
                );
            }
          }
          return;
        }
        if (ts.isImportEqualsDeclaration(node)) {
          moduleFact(
            node,
            ts.isExternalModuleReference(node.moduleReference)
              ? node.moduleReference.expression
              : undefined,
            'import',
            node.isTypeOnly ? 'type' : 'runtime',
            node.name.text,
          );
          return;
        }
        if (ts.isImportTypeNode(node)) {
          moduleFact(
            node,
            ts.isLiteralTypeNode(node.argument) ? node.argument.literal : undefined,
            'import',
            'type',
            '<import-type>',
          );
        }
        if (ts.isExportDeclaration(node)) {
          const clause = node.exportClause;
          if (!clause || ts.isNamespaceExport(clause))
            moduleFact(
              node,
              node.moduleSpecifier,
              'export',
              node.isTypeOnly ? 'type' : 'runtime',
              clause && ts.isNamespaceExport(clause) ? clause.name.text : '*',
            );
          else
            for (const element of clause.elements) {
              const symbol = symbolAt(element.name);
              const target = targetOf(symbol);
              addFact(
                element,
                {
                  ...base(
                    'export',
                    element.name.text,
                    node.isTypeOnly ||
                      element.isTypeOnly ||
                      symbol?.declarations?.every(isTypeDeclaration)
                      ? 'type'
                      : 'runtime',
                  ),
                  specifier:
                    node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)
                      ? node.moduleSpecifier.text
                      : null,
                  target_id: target,
                  resolution: target ? 'resolved' : 'unresolved',
                  reason: target ? null : 'export-target-unavailable-or-ambiguous',
                },
                'typescript-symbol',
              );
            }
          return;
        }
        if (ts.isExportAssignment(node)) {
          const inline =
            ts.isArrowFunction(node.expression) ||
            ts.isFunctionExpression(node.expression) ||
            ts.isClassExpression(node.expression);
          const target =
            targetOf(symbolAt(node.expression)) ??
            (inline ? addDeclaration(node.expression as ts.Declaration) : null);
          addFact(node, {
            ...base('export', node.isExportEquals ? 'export=' : 'default'),
            target_id: target,
            resolution: target ? 'resolved' : 'unresolved',
            reason: target ? null : 'export-expression-not-a-unique-declaration',
          });
          if (inline && target) currentOwner = target;
        }
        if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
          const callee = node.expression;
          if (
            ts.isCallExpression(node) &&
            (callee.kind === ts.SyntaxKind.ImportKeyword ||
              (ts.isIdentifier(callee) &&
                callee.text === 'require' &&
                !checker.getSymbolAtLocation(callee)))
          ) {
            moduleFact(node, node.arguments[0], 'import', 'runtime', callee.getText(source));
            // Module syntax has its own fact; retain computation in its arguments
            // without adding a duplicate unresolved call/reference to the loader.
            node.typeArguments?.forEach((child) => visit(child, currentOwner));
            node.arguments.forEach((child) => visit(child, currentOwner));
            return;
          }
          const symbol = symbolAt(callee);
          const declarations = symbol?.declarations ?? [];
          const declaration = declarations.length === 1 ? declarations[0] : undefined;
          let reason: string | null = 'dynamic-dispatch';
          let direct = false;
          if (
            ts.isIdentifier(callee) ||
            (ts.isPropertyAccessExpression(callee) &&
              (ts.isPrivateIdentifier(callee.name) ||
                (ts.isIdentifier(callee.expression) &&
                  !!checker
                    .getSymbolAtLocation(callee.expression)
                    ?.declarations?.some(ts.isNamespaceImport))))
          ) {
            if (declarations.length > 1) reason = 'ambiguous-declarations';
            else if (!declaration) reason = 'declaration-unavailable';
            else if (ts.isParameter(declaration)) reason = 'callback-parameter';
            else if (ambient(declaration)) reason = 'declaration-without-runtime-implementation';
            else if (symbol && writes.has(symbol)) reason = 'reassigned-binding';
            else if (
              (ts.isFunctionDeclaration(declaration) || ts.isMethodDeclaration(declaration)) &&
              declaration.body
            )
              direct = true;
            else if (
              ts.isNewExpression(node) &&
              ts.isClassDeclaration(declaration) &&
              !declaration.getSourceFile().isDeclarationFile
            )
              direct = true;
            else if (
              ts.isVariableDeclaration(declaration) &&
              declaration.initializer &&
              (ts.isArrowFunction(declaration.initializer) ||
                ts.isFunctionExpression(declaration.initializer)) &&
              declaration.parent.flags & ts.NodeFlags.Const
            )
              direct = true;
            else reason = 'no-unique-static-implementation';
          }
          const target = direct ? targetOf(symbol) : null;
          addFact(
            node,
            {
              ...base('call', callee.getText(source)),
              subject_id: currentOwner,
              target_id: target,
              resolution: target ? 'resolved' : 'unresolved',
              reason: target ? null : direct ? 'implementation-outside-readable-source' : reason,
            },
            'typescript-symbol',
          );
        }
        if (
          ts.isBinaryExpression(node) &&
          node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
          node.operatorToken.kind <= ts.SyntaxKind.LastAssignment &&
          (ts.isElementAccessExpression(node.left) || ts.isPropertyAccessExpression(node.left))
        )
          addFact(node, {
            ...base('dynamic-write', node.left.getText(source)),
            subject_id: currentOwner,
            resolution: 'unresolved',
            reason: 'property-write-runtime-target-unknown',
          });
        if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) {
          const declarationName =
            declarationKind(node.parent) !== null && named(node.parent) === node;
          if (!declarationName) {
            const symbol = symbolAt(node);
            const target = targetOf(symbol);
            addFact(
              node,
              {
                ...base('reference', node.getText(source), typeUse(node) ? 'type' : 'runtime'),
                subject_id: currentOwner,
                target_id: target,
                resolution: target ? 'resolved' : 'unresolved',
                reason: target
                  ? null
                  : symbol?.declarations && symbol.declarations.length > 1
                    ? 'ambiguous-declarations'
                    : 'declaration-unavailable',
              },
              'typescript-symbol',
            );
          }
        }
        ts.forEachChild(node, (child) => visit(child, currentOwner));
      };
      visit(source, file.id);
    }
  }
  for (const [path, message] of store.failures)
    diagnostics.push({
      code: 'SOURCE_READ_FAILED',
      message,
      severity: 'error',
      path,
      project_id: null,
      start_byte: null,
      end_byte: null,
    });
  return {
    projects: projects.map((project) => project.record),
    reads: [...store.reads.values()].sort((a, b) => compare(a.path, b.path)),
    files: [...units.values()].sort((a, b) => compare(a.path, b.path)),
    symbols: [...symbols.values()].sort((a, b) => compare(a.id, b.id)),
    evidence: [...evidence.values()].sort((a, b) => compare(a.id, b.id)),
    facts: [...facts.values()].sort((a, b) => compare(a.id, b.id)),
  };
}
