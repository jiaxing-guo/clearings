import type { ContractModel } from '../model/contracts.js';
import type { SourceValidation } from '../semantics/validate.js';
import { inspectSemantic, createContextPack, serializeContextPack } from '../contracts/query.js';
import { ClearingsError } from '../model/types.js';
import { html as h, markdown as md, codeFence } from './report.js';
import { REPORT_CSS, REPORT_JS } from './assets.js';

/** Real query output and exact attached source; this function does not perform inference. */
export function createSemanticWalkthrough(model: ContractModel, options: SourceValidation & { behavior: string; functionId?: string; maxBytes?: number }) {
  const inspection = inspectSemantic(model, { behavior: options.behavior }, options);
  const behavior = model.data.proposal.data.behaviors.find(b => inspection.root_ids.includes(b.id))!;
  const functionId = options.functionId ?? behavior.function_ids[0]!;
  if (!behavior.function_ids.includes(functionId)) throw new ClearingsError('INVALID_SELECTION', 'Walkthrough function must participate in the selected behavior.');
  const fn = model.data.proposal.data.functions.find(f => f.id === functionId)!;
  const claimId = fn.output_claim_ids[0] ?? fn.input_claim_ids[0];
  const claim = model.data.proposal.data.claims.find(c => c.id === claimId) ?? null;
  const sources = (claim?.evidence_ids ?? []).map(id => model.data.request.data.source_request.data.evidence.find(e => e.id === id)!);
  const source = sources[0] ?? null;
  const queries = [inspection, inspectSemantic(model, { id: fn.id }, options),
    ...fn.state_access.slice(0,1).map(access => inspectSemantic(model, { id: access.state_id }, options)),
    ...(claimId ? [inspectSemantic(model, { id: claimId }, options)] : [])];
  const context = createContextPack(model, { behavior: behavior.id }, { ...options, maxBytes: options.maxBytes ?? 131072, includeNeighbors: false });
  return { artifact_id: model.artifact_id, snapshot_id: model.snapshot_id,
    capability: model.data.proposal.data.concepts.find(c => c.id === behavior.capability_id)!, behavior, function: fn,
    claim,
    relationships: behavior.function_ids.map(id => {
      const participant = model.data.proposal.data.functions.find(f => f.id === id)!;
      return { from_id: behavior.id, relation: 'participating-function', to_id: id, title: participant.title,
        result_assertions: participant.output_claim_ids.map(claimId => ({ id: claimId, text: model.data.proposal.data.claims.find(claim => claim.id === claimId)!.text })) };
    }),
    queries, source, sources, checks: inspection.checks, context, context_bytes: Buffer.byteLength(serializeContextPack(context)) };
}
export type SemanticWalkthrough = ReturnType<typeof createSemanticWalkthrough>;
export function renderSemanticWalkthrough(model: ContractModel, options: Parameters<typeof createSemanticWalkthrough>[1] & { format?: 'html' | 'markdown'; sourceNotice?: string }): string {
  const view = createSemanticWalkthrough(model, options);
  const format = options.format ?? 'markdown';
  if (format !== 'html' && format !== 'markdown') throw new ClearingsError('INVALID_ARGUMENTS', 'Supported walkthrough formats are markdown and html.');
  const json = (value: unknown) => JSON.stringify(value,null,2);
  const commands = [
    'node dist/cli/main.js inspect semantic.json',
    `node dist/cli/main.js inspect semantic.json --id '${view.behavior.id}'`,
    `node dist/cli/main.js inspect semantic.json --id '${view.function.id}'`,
    view.source ? `node dist/cli/main.js evidence scan.json --repository repo --id '${view.source.id}'` : `node dist/cli/main.js inspect semantic.json --id '${view.claim?.id ?? view.function.id}'`,
    `node dist/cli/main.js context semantic.json --behavior '${view.behavior.id}' --max-bytes ${view.context.budget.max_bytes} --no-neighbors`,
  ];
  const sections = [
    { title: '1. Choose a capability', text: view.capability.description, data: { id: view.capability.id, title: view.capability.title } },
    { title: '2. Inspect a behavior', text: 'Conditions select outcomes. The function links below show participation, not observed call order.', data: view.behavior },
    { title: '3. Follow a function and shared state', text: 'This contract links assertions to inputs, outputs, state access, effects, failures, and unknowns.', data: view.function },
    { title: '4. Check an assertion against source', text: view.claim?.text ?? 'No input or output assertion is recorded for this function.', data: view.claim },
    { title: '5. Export bounded context', text: `${view.context_bytes} UTF-8 bytes. Required rules and critical unknowns remain in the selection. Extra source text is retrieved separately.`, data: { budget: view.context.budget, omissions: view.context.omissions, retrieval: view.context.retrieval, checks: view.context.checks } },
  ];
  const status = `Partial repository view. Recorded ${model.data.transport}. Claim support needs independent review. Acceptance: proposed. Source rechecked in this walkthrough: ${view.checks.source_rechecked}.`;
  if (format === 'markdown') return ['# Inspect the internal representation', '', status, '', `Artifact: \`${view.artifact_id}\`. Snapshot: \`${view.snapshot_id}\`.`, '', ...sections.flatMap((section,i) => [`## ${section.title}`, '', md(section.text), '', codeFence(commands[i] ?? commands.at(-1)!).replace('typescript\n','bash\n'), '', '<details>', '<summary>Open canonical record</summary>', '', codeFence(json(section.data)).replace('typescript\n','json\n'), '', '</details>', '']), '## Participating functions', '', '| Function | Recorded results |', '| --- | --- |', ...view.relationships.map(r => `| ${md(r.title)} | ${md(r.result_assertions.map(claim => claim.text).join(' '))} |`), '', '## Exact source', '', ...(view.sources.length ? view.sources.flatMap(source => [`${md(source.path)}:${source.start_line}–${source.end_line}. Evidence cited by the selected assertion; the excerpt can include surrounding code.`, '', codeFence(source.text)]) : ['No source excerpt is attached to this assertion.']), '', '## Reproduce the inspection', '', 'The adjacent walkthrough.json contains the actual query output and context selection. Commands assume model and scan files plus the pinned repository.', '', ...(options.sourceNotice ? ['## Source license', '', codeFence(options.sourceNotice).replace('typescript\n','text\n')] : []), ''].join('\n');
  return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Inspect the internal representation · Clearings</title><style>${REPORT_CSS}main{max-width:850px;margin:auto;padding:32px 24px}section{margin:32px 0}pre{overflow:auto;max-width:100%;padding:16px;background:var(--soft)}p,td{overflow-wrap:anywhere}table{width:100%}td,th{text-align:left;padding:8px}</style></head><body><a class="skip" href="#main">Skip to content</a><main id="main"><h1>Inspect the internal representation</h1><p>${h(status)}</p><details><summary>Artifact identity</summary><p>${h(view.artifact_id)}</p><p>${h(view.snapshot_id)}</p></details>${sections.map((section,i)=>`<section><h2>${h(section.title)}</h2><p>${h(section.text)}</p><pre tabindex="0" aria-label="Inspection command"><code>${h(commands[i] ?? commands.at(-1)!)}</code></pre><details><summary>Open canonical record</summary><pre tabindex="0" aria-label="Canonical JSON"><code>${h(json(section.data))}</code></pre></details></section>`).join('')}<section><h2>Participating functions</h2><p>Each row is generated from the behavior contract.</p><table><thead><tr><th scope="col">Function</th><th scope="col">Recorded results</th></tr></thead><tbody>${view.relationships.map(r=>`<tr><td>${h(r.title)}<details><summary>Canonical ID</summary>${h(r.to_id)}</details></td><td>${h(r.result_assertions.map(claim => claim.text).join(" "))}</td></tr>`).join('')}</tbody></table></section><section><h2>Exact source</h2>${view.sources.length ? view.sources.map(source => `<details><summary>${h(source.path)}:${source.start_line}–${source.end_line} · evidence cited by the selected assertion</summary><pre tabindex="0" aria-label="Exact source"><code>${h(source.text)}</code></pre></details>`).join('') : '<p>No source excerpt is attached to this assertion.</p>'}</section><p>The adjacent walkthrough.json contains actual query output and context selection. Commands assume model and scan files plus the pinned repository.</p>${options.sourceNotice ? `<details><summary>Source license</summary><pre>${h(options.sourceNotice)}</pre></details>` : ''}</main><script>${REPORT_JS}</script></body></html>\n`;
}
