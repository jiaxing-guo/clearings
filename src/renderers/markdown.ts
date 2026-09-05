import type { Explanation } from '../presentation/plan.js';
import { anchor, markdown as escape, html as escapeHtml, codeFence, type Report } from './report.js';

export function renderMarkdown(report: Report): string {
  const { model, plan, concept, claims, flow, claimLabels, steps, unknowns, relations, concepts, evidence, evidenceMap, entries } = report;
  const { request, proposal } = model.data;
  const refs = (ids: string[]) => ids.map((id) => { const item = evidenceMap.get(id)!; return `[${escape(item.path)}:${item.start_line}](#${anchor(id)})`; }).join(', ');
  const claimRefs = (ids: string[]) => ids.map((id) => `[${claimLabels.get(id)}](#${anchor(id)})`).join(', ');
  const support = (item: Explanation) => [claimRefs(item.claim_ids), refs(item.evidence_ids ?? []), ...item.unknown_indices.map((index) => `[Scope note ${index + 1}](#unknown-${index})`)].filter(Boolean).join(' · ');
  const paragraph = (item: Explanation) => `${escape(item.text)}${support(item) ? ` (Support: ${support(item)})` : ''}`;
  const lines = [`# ${escape(concept.title)}`, '', escape(plan.introduction.text), '',
    `**${model.data.transport === 'recorded-replay' ? 'Recorded example' : 'Proposed explanation'} · Support unreviewed.** Source excerpts are available below.`, '',
    `Scope: ${request.data.scope.paths.length} selected files; ${request.coverage.evidence_records} source excerpts. This is a partial view of the repository.`, '',
    '[Follow the flow](#flow) · [Explore a case](#cases) · [Scope and unknowns](#unknowns) · [Inspect evidence](#evidence)', '',
    `Introduction support: ${support(plan.introduction)}`, '',
    '<a id="flow"></a>', '', '## Follow the flow', '',
    'These stages group related behavior. The conditions in each stage determine the path.', '',
    ...plan.stages.map((stage, index) => `${index + 1}. [${escape(stage.title)}](#stage-${stage.key}) — ${escape(stage.summary.text)}`), '',
  ];
  if (plan.sequence) {
    const seq = plan.sequence; const labels = new Map(seq.participants.map((item) => [item.key, item.label]));
    lines.push(`### ${escape(seq.title)}`, '', paragraph(seq.assumption), '', 'This is a possible sequence under the stated condition, not an observed execution.', '',
      '| Order | From | To | Action | Support |', '| --- | --- | --- | --- | --- |',
      ...seq.messages.map((msg, i) => `| ${i + 1} | ${escape(labels.get(msg.from)!)} | ${escape(labels.get(msg.to)!)} | ${escape(msg.label)} | ${claimRefs(msg.claim_ids)} |`), '');
  }
  for (const [index, stage] of plan.stages.entries()) {
    lines.push(`<a id="stage-${stage.key}"></a>`, '', `### ${index + 1}. ${escape(stage.title)}`, '', paragraph(stage.summary), '',
      ...stage.cautions.map((item) => `**Watch for:** ${paragraph(item)}`), '', '<details>', '<summary>Explain this stage</summary>', '',
      ...stage.notes.flatMap((item) => [paragraph(item), '']), '#### Exact branches', '');
    for (const id of stage.step_ids) {
      const step = steps.get(id)!;
      lines.push(`<a id="${anchor(id)}"></a>`, '', `**${escape(step.title)}**`, '', `Support: ${claimRefs(step.claim_ids)}. ${refs(step.evidence_ids)}`, '',
        ...(step.next.length ? step.next.map((edge) => `- ${edge.condition === null ? 'Then' : escape(edge.condition)} → [${escape(steps.get(edge.step_id)!.title)}](#${anchor(edge.step_id)}) ${refs(edge.evidence_ids)}`) : ['This branch ends within the recorded flow.']), '');
    }
    lines.push(`All claims for this stage: ${claimRefs(stage.claim_ids)}`, '', '</details>', '');
  }
  lines.push('<a id="cases"></a>', '', '## Explore a case', '');
  if (!plan.cases.length) lines.push('No case explanations were supplied. Use the exact branches above.', '');
  for (const item of plan.cases) lines.push(`<a id="case-${item.key}"></a>`, '', `### ${escape(item.question)}`, '', ...item.answer.flatMap((text) => [paragraph(text), '']), `Related stages: ${item.stage_keys.map((key) => `[${escape(plan.stages.find((stage) => stage.key === key)!.title)}](#stage-${key})`).join(', ')}`, '');
  lines.push('<a id="unknowns"></a>', '', '## Scope and unknowns', '',
    'These limits remain part of the explanation. A source citation does not prove that a claim is correct.', '',
    ...unknowns.flatMap((item) => [`<a id="unknown-${item.index}"></a>`, '', `- ${item.critical ? '**Critical:** ' : ''}${escape(item.question)} ${refs(item.evidence_ids)}`, '']),
    ...(unknowns.length ? [] : ['No unknowns were supplied. This does not establish complete coverage.', '']),
    '<a id="claims"></a>', '', `## Claim inventory (${claims.length})`, '', 'Use this inventory to audit the explanation. The claim text is preserved from the semantic proposal.', '', '<details>', '<summary>Open all claims</summary>', '',
    ...claims.flatMap((claim) => [`<a id="${anchor(claim.id)}"></a>`, '', `**${claimLabels.get(claim.id)} · ${escape(claim.category)}:** ${escape(claim.text)} ${refs(claim.evidence_ids)}`, '']), '</details>', '',
    '<a id="evidence"></a>', '', '## Evidence', '', 'Source text is preserved from the recorded request.', '');
  for (const item of evidence) lines.push(`<a id="${anchor(item.id)}"></a>`, '', '<details>', `<summary>${escapeHtml(item.path)}:${item.start_line}–${item.end_line}</summary>`, '',
    `Evidence: \`${item.id}\`. Blob: \`${item.blob_sha}\`. UTF-8 bytes [${item.start_byte}, ${item.end_byte}).`, '', codeFence(item.text), '', '</details>', '');
  lines.push('<a id="report-details"></a>', '', '## Report details', '', '<details>', '<summary>Source, coverage, and record details</summary>', '',
    `Transport: **${model.data.transport}**. Producer: ${escape(proposal.producer.name)}. Model: ${escape(proposal.producer.model ?? 'not recorded')}.`, '',
    `Origin: ${proposal.producer.kind === 'agent' ? 'model inference' : 'human declaration'}. Claim support: unreviewed. Acceptance: proposed.`, '',
    `Presentation: ${plan.origin}; ${plan.review_status}. Citation checks establish reference integrity, not English entailment.`, '',
    `Semantic artifact: \`${model.artifact_id}\`. Snapshot: \`${model.snapshot_id}\`. Structural scan: \`${request.data.scan_artifact_id}\`.`, '',
    `Scope: ${request.data.scope.paths.map(escape).join(', ')}. ${request.coverage.evidence_records} excerpts supplied; ${request.coverage.omitted_scope_evidence} other structural evidence records omitted.`, '',
    `Source scan: ${request.data.scan_coverage.parsed_source_files}/${request.data.scan_coverage.selected_source_files} selected files parsed; ${request.data.scan_coverage.failed_source_files} failed; ${request.data.scan_coverage.support_source_files} support files.`, '',
    `Flow entries: ${flow.entry_step_ids.map((id) => `[${escape(steps.get(id)!.title)}](#${anchor(id)})`).join(', ')}`, '', '### Entry points', '', ...entries.map((item) => `- ${escape(item.name)} in ${escape(item.path)}`), '',
    '### Related state and components', '', ...relations.map((item) => `- ${escape(concepts.get(item.from_id)!.title)} — ${item.kind} → ${escape(concepts.get(item.to_id)!.title)} ${refs(item.evidence_ids)}`), '',
    '### Source diagnostics', '', ...(model.diagnostics.length ? model.diagnostics.map((item) => `- ${escape(item.code)}: ${escape(item.message)}`) : ['No source errors or warnings were recorded.']), '', '</details>', '');
  return lines.join('\n');
}
