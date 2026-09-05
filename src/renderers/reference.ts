import { anchor, html as h, markdown as md, codeFence, type Report } from './report.js';
import type { Explanation } from '../presentation/plan.js';
import { sourceCodeHtml } from './code.js';
function supportingIds(report: Report, text: Explanation | Explanation[]): string[] {
  return [...new Set((Array.isArray(text) ? text : [text]).flatMap(report.evidenceFor))];
}
function supportingUnknowns(text: Explanation | Explanation[]): number[] {
  return [...new Set((Array.isArray(text) ? text : [text]).flatMap((item) => item.unknown_indices))];
}
export function supportingHtml(report: Report, text: Explanation | Explanation[]): string {
  return [...supportingIds(report, text).map((id) => `<a href="#${anchor(id)}">${h(report.evidenceMap.get(id)!.path)}:${report.evidenceMap.get(id)!.start_line}</a>`),
    ...supportingUnknowns(text).map((index) => `<a href="#unknown-${index}">Scope note ${index + 1}</a>`)].join(' · ');
}
export function supportingMarkdown(report: Report, text: Explanation | Explanation[]): string {
  return [...supportingIds(report, text).map((id) => `[${md(report.evidenceMap.get(id)!.path)}:${report.evidenceMap.get(id)!.start_line}](#${anchor(id)})`),
    ...supportingUnknowns(text).map((index) => `[Scope note ${index + 1}](#unknown-${index})`)].join(' · ');
}
export function referenceHtml(report: Report): string {
  const { model, claims, claimLabels, flow, steps, unknowns, evidence, evidenceMap } = report;
  const refs = (ids: string[]) => ids.map((id) => `<a href="#${anchor(id)}">${h(evidenceMap.get(id)!.path)}:${evidenceMap.get(id)!.start_line}</a>`).join(' · ');
  return `<div class="reference-body"><p>Source-based explanation. Claim support and the new explanations need independent review.</p>
<h3>Scope and unknowns</h3><ul>${unknowns.map((item) => `<li id="unknown-${item.index}">${h(item.question)} <span class="support">${refs(item.evidence_ids)}</span></li>`).join('')}</ul>
<details class="audit"><summary>All ${claims.length} claims</summary>${claims.map((claim) => `<article class="claim" id="${anchor(claim.id)}"><h4>${claimLabels.get(claim.id)} · ${h(claim.category)}</h4><p>${h(claim.text)}</p><span class="support">${refs(claim.evidence_ids)}</span></article>`).join('')}</details>
<details class="audit"><summary>Exact control flow</summary>${flow.steps.map((step) => `<div class="branch" id="${anchor(step.id)}"><h4>${h(step.title)}</h4><p class="support">${step.claim_ids.map((id) => `<a href="#${anchor(id)}">${claimLabels.get(id)}</a>`).join(', ')} · ${refs(step.evidence_ids)}</p>${step.next.length ? `<ul>${step.next.map((edge) => `<li>${h(edge.condition ?? 'Then')} → <a href="#${anchor(edge.step_id)}">${h(steps.get(edge.step_id)!.title)}</a> <span class="support">${refs(edge.evidence_ids)}</span></li>`).join('')}</ul>` : '<p>This branch ends within the recorded flow.</p>'}</div>`).join('')}</details>
<h3>Source excerpts</h3>${evidence.map((item) => `<details class="source" id="${anchor(item.id)}"><summary>${h(item.path)}:${item.start_line}–${item.end_line}</summary><p class="source-meta">${item.id}<br>Blob: ${item.blob_sha}<br>UTF-8 bytes [${item.start_byte}, ${item.end_byte}).</p>${sourceCodeHtml(item.text, `Source code at ${item.path}:${item.start_line}–${item.end_line}`)}</details>`).join('')}
<details class="metadata"><summary>Analysis and review details</summary><dl><dt>Transport</dt><dd>${model.data.transport}</dd><dt>Producer</dt><dd>${h(model.data.proposal.producer.name)}</dd><dt>Model</dt><dd>${h(model.data.proposal.producer.model ?? 'not recorded')}</dd><dt>Review</dt><dd>Claim support: unreviewed. Acceptance: proposed. Presentation: ${report.plan.origin}, unreviewed.</dd><dt>Semantic artifact</dt><dd>${model.artifact_id}</dd><dt>Snapshot</dt><dd>${model.snapshot_id}</dd><dt>Structural scan</dt><dd>${model.data.request.data.scan_artifact_id}</dd><dt>Entry points</dt><dd>${report.entries.map((item) => `${h(item.name)} in ${h(item.path)}`).join('<br>')}</dd><dt>Flow entries</dt><dd>${flow.entry_step_ids.map((id) => `<a href="#${anchor(id)}">${h(steps.get(id)!.title)}</a>`).join(', ')}</dd><dt>Selected paths</dt><dd>${model.data.request.data.scope.paths.map(h).join('<br>')}</dd><dt>Coverage</dt><dd>${model.data.request.coverage.evidence_records} excerpts; ${model.data.request.coverage.omitted_scope_evidence} other structural evidence records omitted.</dd><dt>Source scan</dt><dd>${model.data.request.data.scan_coverage.parsed_source_files}/${model.data.request.data.scan_coverage.selected_source_files} selected files parsed; ${model.data.request.data.scan_coverage.failed_source_files} failed; ${model.data.request.data.scan_coverage.support_source_files} support files.</dd></dl><h4>Source diagnostics</h4>${model.diagnostics.length ? `<ul>${model.diagnostics.map((item) => `<li>${h(item.code)}: ${h(item.message)}</li>`).join('')}</ul>` : '<p>No source errors or warnings were recorded.</p>'}<h4>Related state and components</h4><ul>${report.relations.map((item) => `<li>${h(report.concepts.get(item.from_id)!.title)} — ${item.kind} → ${h(report.concepts.get(item.to_id)!.title)} <span class="support">${refs(item.evidence_ids)}</span></li>`).join('')}</ul></details>
${report.options.sourceNotice ? `<details class="metadata"><summary>Source license</summary><pre class="license">${h(report.options.sourceNotice)}</pre></details>` : ''}</div>`;
}
export function referenceMarkdown(report: Report): string {
  const { model, claims, claimLabels, flow, steps, unknowns, evidence, evidenceMap } = report;
  const refs = (ids: string[]) => ids.map((id) => `[${md(evidenceMap.get(id)!.path)}:${evidenceMap.get(id)!.start_line}](#${anchor(id)})`).join(', ');
  return ['<details>', '<summary>Claims, exact flow, and source evidence</summary>', '',
    'Source-based explanation. Claim support and the new explanations need independent review.', '',
    '### Scope and unknowns', '', ...unknowns.flatMap((item) => [`<a id="unknown-${item.index}"></a>`, '', `${md(item.question)} ${refs(item.evidence_ids)}`, '']),
    '### Claims', '', ...claims.flatMap((item) => [`<a id="${anchor(item.id)}"></a>`, '', `**${claimLabels.get(item.id)} · ${md(item.category)}:** ${md(item.text)} ${refs(item.evidence_ids)}`, '']),
    '### Exact control flow', '', ...flow.steps.flatMap((step) => [`<a id="${anchor(step.id)}"></a>`, '', `**${md(step.title)}**`, '', ...step.next.map((edge) => `- ${md(edge.condition ?? 'Then')} → [${md(steps.get(edge.step_id)!.title)}](#${anchor(edge.step_id)}) ${refs(edge.evidence_ids)}`), `Claims: ${step.claim_ids.map((id) => `[${claimLabels.get(id)}](#${anchor(id)})`).join(', ')}. ${refs(step.evidence_ids)}`, '']),
    '### Evidence', '', ...evidence.flatMap((item) => [`<a id="${anchor(item.id)}"></a>`, '', `#### ${md(item.path)}:${item.start_line}–${item.end_line}`, '', `Evidence: \`${item.id}\`. Blob: \`${item.blob_sha}\`. UTF-8 bytes [${item.start_byte}, ${item.end_byte}).`, '', codeFence(item.text), '']),
    '### Analysis details', '', `Entry points: ${report.entries.map((item) => `${md(item.name)} in ${md(item.path)}`).join(', ')}.`, '', `Flow entries: ${flow.entry_step_ids.map((id) => `[${md(steps.get(id)!.title)}](#${anchor(id)})`).join(', ')}.`, '', `Transport: ${model.data.transport}. Producer: ${md(model.data.proposal.producer.name)}. Model: ${md(model.data.proposal.producer.model ?? 'not recorded')}.`, '',
    `Semantic artifact: \`${model.artifact_id}\`. Snapshot: \`${model.snapshot_id}\`.`, '',
    `Structural scan: \`${model.data.request.data.scan_artifact_id}\`.`, '',
    `Claim support: unreviewed. Acceptance: proposed. Presentation: ${report.plan.origin}, unreviewed.`, '',
    `Scope: ${model.data.request.data.scope.paths.map(md).join(', ')}. ${model.data.request.coverage.evidence_records} excerpts; ${model.data.request.coverage.omitted_scope_evidence} other structural evidence records omitted.`, '',
    `Source scan: ${model.data.request.data.scan_coverage.parsed_source_files}/${model.data.request.data.scan_coverage.selected_source_files} selected files parsed; ${model.data.request.data.scan_coverage.failed_source_files} failed; ${model.data.request.data.scan_coverage.support_source_files} support files.`, '',
    '### Related state and components', '', ...report.relations.map((item) => `- ${md(report.concepts.get(item.from_id)!.title)} — ${item.kind} → ${md(report.concepts.get(item.to_id)!.title)} ${refs(item.evidence_ids)}`), '',
    '### Source diagnostics', '', ...(model.diagnostics.length ? model.diagnostics.map((item) => `- ${md(item.code)}: ${md(item.message)}`) : ['No source errors or warnings were recorded.']), '',
    ...(report.options.sourceNotice ? ['### Source license', '', codeFence(report.options.sourceNotice).replace('typescript\n','text\n'), ''] : []), '</details>', ''].join('\n');
}
