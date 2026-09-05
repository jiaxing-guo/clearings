import type { SemanticModel } from '../model/semantic.js';
import { ClearingsError } from '../model/types.js';
import { validateSemanticModel } from '../semantics/validate.js';

// Treat narrative/source as text, never as executable HTML, links, or directives.
const escape = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/([\\`*_[\]{}()#+.!|~\-])/g, '\\$1').replace(/\r\n|\r|\n|\u2028|\u2029/g, ' ');
const code = (text: string): string => {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const fence = '`'.repeat(Math.max(3, longest + 1));
  return `${fence}typescript\n${text}\n${fence}`;
};

/** Human projection only; proposal records remain the shared machine interface. */
export function renderCapability(model: SemanticModel, capability: string): string {
  validateSemanticModel(model);
  const { request, proposal } = model.data;
  const concept = proposal.data.concepts.find((item) => item.kind === 'capability' && (item.id === capability || item.alias === capability));
  if (!concept) throw new ClearingsError('UNKNOWN_CAPABILITY', 'Capability ID or alias is absent from this model.');
  const flow = proposal.data.flows.find((item) => item.capability_id === concept.id)!;
  const claims = proposal.data.claims.filter((claim) => claim.subject_ids.includes(concept.id));
  const evidence = new Map(request.data.evidence.map((item) => [item.id, item]));
  const symbols = new Map(request.data.symbols.map((item) => [item.id, item]));
  const concepts = new Map(proposal.data.concepts.map((item) => [item.id, item]));
  const steps = new Map(flow.steps.map((item) => [item.id, item]));
  const relevantRelations = proposal.data.relations.filter((item) => item.from_id === concept.id || item.to_id === concept.id);
  const unknowns = proposal.data.unknowns.filter((item) => item.subject_id === concept.id || item.critical);
  const cited = new Set<string>();
  const refs = (ids: string[]) => ids.map((id) => { cited.add(id); const item = evidence.get(id)!; return `[${escape(item.path.split('/').at(-1)!)}:${item.start_line}](#${id.replace(':', '-')})`; }).join(', ');
  const claimLabels = new Map(claims.map((claim, index) => [claim.id, `C${index + 1}`]));
  const lines = [
    `# ${escape(concept.title)}`, '', escape(concept.description), '',
    `Status: **proposed**. Origin: **${proposal.producer.kind === 'agent' ? 'model inference' : 'human declaration'}**. Claim support: **unreviewed**. Citation integrity: **validated against the recorded request**.`, '',
    `Transport: **${model.data.transport}**. Producer: ${escape(proposal.producer.name)}. Model: ${escape(proposal.producer.model ?? 'not recorded')}.`, '',
    `Snapshot: \`${model.snapshot_id}\`. Structural scan: \`${request.data.scan_artifact_id}\`.`, '',
    `Scope: ${request.data.scope.paths.map(escape).join(', ')}. ${request.coverage.evidence_records} excerpts supplied; ${request.coverage.omitted_scope_evidence} other structural evidence records omitted. Source scan: ${request.data.scan_coverage.parsed_source_files}/${request.data.scan_coverage.selected_source_files} selected files parsed, ${request.data.scan_coverage.failed_source_files} failed; ${request.data.scan_coverage.support_source_files} support files. This page does not imply full repository interpretation.`, '',
    `Purpose evidence: ${refs(concept.evidence_ids)}`, '', '## Entry points', '',
    ...flow.entry_symbol_ids.map((id) => { const symbol = symbols.get(id)!; const file = request.data.files.find((file) => file.id === symbol.file_id)!; return `- ${escape(symbol.name)} in ${escape(file.path)}`; }), '',
    '## Claims', '',
    ...claims.map((claim) => `- <a id="${claim.id.replace(':', '-')}"></a> **${claimLabels.get(claim.id)} · ${escape(claim.category)}:** ${escape(claim.text)} ${refs(claim.evidence_ids)}`), '',
    '## Flow', '',
    `Start: ${flow.entry_step_ids.map((id) => escape(steps.get(id)!.title)).join(', ')}.`, '',
    ...flow.steps.flatMap((step, i) => [
      `### ${i + 1}. ${escape(step.title)}`, '',
      `Kind: ${step.kind}. Claims: ${step.claim_ids.map((id) => `[${claimLabels.get(id)}](#${id.replace(':', '-')})`).join(', ')}. ${refs(step.evidence_ids)}`, '',
      ...(step.next.length ? step.next.map((edge) => `- ${edge.condition === null ? 'Then' : escape(edge.condition)} → ${escape(steps.get(edge.step_id)!.title)} ${refs(edge.evidence_ids)}`) : ['Terminal step within this flow.']), '',
    ]),
    '## Related state and components', '',
    ...(relevantRelations.length ? relevantRelations.map((item) => `- ${escape(concepts.get(item.from_id)!.title)} — ${item.kind} → ${escape(concepts.get(item.to_id)!.title)} ${refs(item.evidence_ids)}`) : ['No additional relations proposed.']), '',
    '## Unknowns', '',
    ...(unknowns.length ? unknowns.map((item) => `- ${item.critical ? '**Critical:** ' : ''}${escape(item.question)} ${refs(item.evidence_ids)}`) : ['No capability-specific unknowns were supplied; this is not evidence of completeness.']), '',
    '## Source diagnostics', '',
    ...(model.diagnostics.length ? model.diagnostics.map((item) => `- ${escape(item.code)}: ${escape(item.message)}`) : ['No source errors or warnings were recorded.']), '', '## Evidence', '',
  ];
  for (const id of [...cited].sort()) {
    const item = evidence.get(id)!;
    // Anchors contain only a schema-validated hash, never proposal-controlled HTML.
    lines.push(`<a id="${id.replace(':', '-')}"></a>`, '', `### ${escape(item.path)}:${item.start_line}:${item.start_column}–${item.end_line}:${item.end_column}`, '',
      `Evidence: \`${id}\`. Blob: \`${item.blob_sha}\`. UTF-8 bytes [${item.start_byte}, ${item.end_byte}).`, '', code(item.text), '');
  }
  return lines.join('\n');
}
