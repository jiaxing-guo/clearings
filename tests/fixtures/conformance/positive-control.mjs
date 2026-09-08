// Independently authored executable positive control. This module imports no
// production or reference functions. Its inputs are prevalidated by the recorder.
export function assembleContext(spec, selection, { maxBytes }) {
  const fail = (code, details) => { const error = Object.assign(new Error(code), { code }); if (details) error.details = details; throw error; };
  const find = id => spec.operations.find(operation => operation.id === id);
  for (const operation of spec.operations) for (const edge of operation.dependencies) {
    if (edge.requirement === 'required' && !find(edge.operation_id)) fail('MISSING_REQUIRED_DEPENDENCY');
  }
  if (maxBytes < 1 || maxBytes > 2097152) fail('INVALID_BUDGET');
  const root = spec.operations.find(operation => operation.id === selection || operation.alias === selection);
  if (!root) fail('INVALID_SELECTION');
  const selected = [], queue = [root.id];
  while (queue.length) {
    const id = queue.shift();
    if (selected.some(operation => operation.id === id)) continue;
    const operation = find(id);
    selected.push(operation);
    queue.push(...operation.dependencies.filter(edge => edge.requirement === 'required').map(edge => edge.operation_id).sort());
  }
  const included = id => selected.some(operation => operation.id === id);
  const stateSelected = state => selected.some(operation => operation.frame === 'complete' || operation.reads.includes(state.id) || operation.writes.includes(state.id));
  const byId = (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  const states = spec.states.filter(stateSelected).sort(byId);
  const sourceIds = [];
  for (const state of states) sourceIds.push(...state.evidence_ids);
  for (const operation of selected) {
    sourceIds.push(...operation.evidence_ids);
    for (const key of ['guarantees', 'decisions', 'implementations']) for (const item of operation[key]) sourceIds.push(...item.evidence_ids);
    for (const outcome of operation.outcomes) {
      sourceIds.push(...outcome.evidence_ids);
      for (const rule of outcome.ensures) sourceIds.push(...rule.evidence_ids);
    }
  }
  const links = [];
  for (const operation of selected) for (const edge of operation.dependencies) links.push({ from_id: operation.id, to_id: edge.operation_id,
    target_name: find(edge.operation_id)?.name ?? null, kind: edge.kind, role: edge.role, included: included(edge.operation_id) });
  const result = JSON.parse(JSON.stringify({ schema_version: '0.3.0', command: 'context', artifact_id: spec.artifact_id,
    perspective: spec.perspective, provenance: spec.provenance, selection: { operation_id: root.id, name: root.name }, operations: selected, states,
    sources: spec.sources.filter(source => sourceIds.includes(source.id)).sort(byId), links,
    omissions: { operation_ids: spec.operations.filter(operation => !included(operation.id)).map(operation => operation.id).sort(),
      deferred_dependencies: links.filter(link => !link.included).map(link => ({ from_id: link.from_id, to_id: link.to_id, role: link.role, available: !!find(link.to_id) })) },
    checks: { integrity: 'valid', source_authentication: 'not-performed', claim_support: 'not-reviewed', acceptance: 'proposed' },
    retrieval: 'Use inspect on this exact specification with --operation <id>. Source text is attached and hashed; hashes establish content integrity, not source authenticity. Dependencies describe declared relationships, not an observed execution trace.',
    budget: { max_bytes: maxBytes, required_bytes: 0, used_bytes: 0, serialization: 'compact-json-utf8-with-newline' } }));
  // Mutations used by the separate fault manifest are inserted before accounting.
  const encode = value => JSON.stringify(value) + '\n';
  for (;;) {
    const bytes = Buffer.byteLength(encode(result), 'utf8');
    if (result.budget.used_bytes === bytes && result.budget.required_bytes === bytes) break;
    result.budget.used_bytes = bytes; result.budget.required_bytes = bytes;
  }
  if (result.budget.used_bytes > maxBytes) fail('CONTEXT_BUDGET', { required_bytes: result.budget.required_bytes, max_bytes: maxBytes });
  return result;
}
