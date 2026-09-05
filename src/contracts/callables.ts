import ts from 'typescript';
import type { ScanResult } from '../model/structural.js';
import type { ProposalRequest } from '../model/semantic.js';
import type { CallableObservation } from '../model/contracts.js';
import { SourceStore, sha256 } from '../repository/source.js';
import { digest } from '../semantics/identity.js';
import { compare } from '../repository/inventory.js';

/** Read only pinned Git objects, and expose only callables covered by the request. */
export function observeCallables(scan: ScanResult, request: ProposalRequest, repository: string): CallableObservation[] {
  const store = new SourceStore(repository, scan.data.manifest, scan.data.adapter);
  const observations: CallableObservation[] = [];
  const evidence = new Map(scan.data.evidence.map(item => [item.id, item]));
  for (const file of request.data.files.filter(file => file.status === 'parsed')) {
    const text = store.read(file.path, 'source');
    const source = ts.createSourceFile(file.path, text, ts.ScriptTarget.Latest, true);
    const byte = (pos: number) => Buffer.byteLength(text.slice(0, pos));
    const visit = (node: ts.Node): void => {
      if ((ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isMethodDeclaration(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node) || ts.isConstructorDeclaration(node)) && node.body) {
        const start_byte = byte(node.getStart(source)); const end_byte = byte(node.end);
        for (const project of file.project_ids) {
          const excerpt = request.data.evidence.filter(item => item.file_id === file.id && item.project_id === project && item.start_byte <= start_byte && item.end_byte >= end_byte)
            .sort((a, b) => (a.end_byte - a.start_byte) - (b.end_byte - b.start_byte) || compare(a.id, b.id))[0];
          if (!excerpt) continue;
          const candidates = request.data.symbols.filter(item => item.file_id === file.id && item.project_id === project)
            .map(symbol => ({ symbol, anchor: evidence.get(symbol.evidence_id)! }))
            .filter(({ anchor }) => anchor.start_byte <= start_byte && anchor.end_byte >= end_byte)
            .sort((a, b) => (a.anchor.end_byte - a.anchor.start_byte) - (b.anchor.end_byte - b.anchor.start_byte) || compare(a.symbol.id, b.symbol.id));
          const own = candidates.find(({ anchor }) => anchor.start_byte === start_byte && anchor.end_byte === end_byte)
            ?? (ts.isVariableDeclaration(node.parent) || ts.isPropertyDeclaration(node.parent) || ts.isPropertyAssignment(node.parent)
              ? candidates.find(({ anchor }) => anchor.start_byte === byte(node.parent.getStart(source)) && anchor.end_byte === byte(node.parent.end)) : undefined);
          const role = ts.isGetAccessorDeclaration(node) ? 'getter' : ts.isSetAccessorDeclaration(node) ? 'setter' : ts.isConstructorDeclaration(node) ? 'constructor' : ts.isMethodDeclaration(node) ? 'method' : ts.isArrowFunction(node) ? 'arrow' : 'function';
          const body: Omit<CallableObservation, 'id'> = { role, name: node.name?.getText(source) ?? own?.symbol.name ?? '<anonymous>',
            symbol_id: own?.symbol.id ?? null, enclosing_symbol_id: candidates.find(item => item !== own)?.symbol.id ?? null,
            evidence_id: excerpt.id, start_byte, end_byte, span_sha256: sha256(text.slice(node.getStart(source), node.end)) };
          observations.push({ id: digest('callable', body), ...body });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return observations.sort((a, b) => compare(a.id, b.id));
}
