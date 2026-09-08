import type { FunctionContract, BehaviorContract } from '../model/contracts.js';
import { anchor, html as h, markdown as md, type Report } from './report.js';

type Field = { label: string; text?: string; target_id?: string; ids: string[] };
/** Field values come only from canonical records. No authored contract summaries. */
function fields(item: FunctionContract | BehaviorContract): Field[] {
  const common = item.failures.map((f) => ({
    label: 'Failure',
    text: f.destination_id ? f.condition : `${f.condition} → Outside the represented boundary`,
    ...(f.destination_id ? { target_id: f.destination_id } : {}),
    ids: f.claim_ids,
  }));
  if ('component_id' in item)
    return [
      { label: 'Inputs', ids: item.input_claim_ids },
      { label: 'Outputs', ids: item.output_claim_ids },
      ...item.state_access.map((s) => ({
        label: `State: ${s.mode}`,
        target_id: s.state_id,
        ids: s.claim_ids,
      })),
      { label: 'Effects', ids: item.effect_claim_ids },
      ...common,
      ...item.dependencies.map((d) => ({
        label: 'Dependency',
        target_id: d.target_id,
        ids: d.claim_ids,
      })),
      { label: 'Assumptions', ids: item.assumption_claim_ids },
      { label: 'Unknowns', ids: item.unknown_ids },
    ];
  return [
    { label: 'Triggers', ids: item.trigger_claim_ids },
    { label: 'Functions', ids: item.function_ids },
    { label: 'State', ids: item.state_ids },
    { label: 'Flow steps', ids: item.step_ids },
    ...item.outcomes.map((o) => ({
      label: 'Outcome condition',
      text: o.condition,
      ids: o.claim_ids,
    })),
    ...common,
    { label: 'Constraints', ids: item.constraint_claim_ids },
    { label: 'Unknowns', ids: item.unknown_ids },
  ];
}
function label(report: Report, id: string): { text: string; target?: string } {
  const claim = report.claimMap.get(id);
  if (claim) return { text: `${report.claimLabels.get(id)}: ${claim.text}`, target: anchor(id) };
  const unknown = report.unknowns.find((u) => 'id' in u && u.id === id);
  if (unknown) return { text: unknown.question, target: `unknown-${unknown.index}` };
  const fn = report.contractFunctions.find((f) => f.id === id);
  if (fn) return { text: fn.title, target: anchor(id) };
  const step = report.steps.get(id);
  if (step) return { text: step.title, target: anchor(id) };
  const concept = report.concepts.get(id);
  return { text: concept ? `${concept.title} (${id})` : id };
}
export function contractsHtml(report: Report): string {
  if (!report.contractFunctions.length) return '';
  const link = (id: string, canonical = false) => {
    const item = label(report, id);
    const text =
      canonical && item.text !== id && !item.text.endsWith(`(${id})`)
        ? `${h(item.text)} <code>${h(id)}</code>`
        : h(item.text);
    return item.target ? `<a href="#${item.target}">${text}</a>` : text;
  };
  const record = (item: FunctionContract | BehaviorContract) => {
    const implementation =
      'implementation_id' in item
        ? report.implementations.find((c) => c.id === item.implementation_id)
        : undefined;
    const excerpt = implementation && report.evidenceMap.get(implementation.evidence_id);
    return `<article class="function-ref" id="${anchor(item.id)}"><h4>${h(item.title)}</h4><p class="evidence-id">${h(item.id)}</p>${'role' in item ? `<p>Role: ${h(item.role)}. ${implementation && excerpt ? `<a href="#${anchor(excerpt.id)}">${h(excerpt.path)} · UTF-8 bytes [${implementation.start_byte}, ${implementation.end_byte})</a>` : 'No implementation is supplied for this callback.'}</p>` : ''}<dl>${fields(
      item,
    )
      .map(
        (f) =>
          `<dt>${h(f.label)}</dt><dd>${f.text || f.target_id ? `<p>${f.text ? h(f.text) : ''}${f.text && f.target_id ? ' → ' : ''}${f.target_id ? link(f.target_id, true) : ''}</p>` : ''}${f.ids.length ? `<ul>${f.ids.map((id) => `<li>${link(id)}</li>`).join('')}</ul>` : 'None recorded; this does not prove absence.'}</dd>`,
      )
      .join('')}</dl></article>`;
  };
  return `<section id="contracts"><h3>Canonical contracts</h3><p>These fields come from the semantic model. They remain proposed interpretations. References include required functions and related component functions. A component reference does not establish a runtime callee or execution order.</p><details><summary>Open ${report.contractBehaviors.length} behavior contracts</summary>${report.contractBehaviors.map(record).join('')}</details><details id="functions"><summary>Open ${report.contractFunctions.length} function contracts</summary>${report.contractFunctions.map(record).join('')}</details></section>`;
}
export function contractsMarkdown(report: Report): string {
  if (!report.contractFunctions.length) return '';
  const link = (id: string, canonical = false) => {
    const item = label(report, id);
    const text =
      canonical && item.text !== id && !item.text.endsWith(`(${id})`)
        ? `${md(item.text)} (${id})`
        : md(item.text);
    return item.target ? `[${text}](#${item.target})` : text;
  };
  return [
    '<a id="contracts"></a>',
    '',
    '### Canonical contracts',
    '',
    'Fields from the semantic model. References include required functions and related component functions. Proposed interpretations; these links do not establish runtime callees or execution order.',
    '',
    '<details>',
    '<summary>Open behavior and function contracts</summary>',
    '',
    '<a id="functions"></a>',
    '',
    ...[...report.contractBehaviors, ...report.contractFunctions].flatMap((item) => {
      const implementation =
        'implementation_id' in item
          ? report.implementations.find((c) => c.id === item.implementation_id)
          : undefined;
      const excerpt = implementation && report.evidenceMap.get(implementation.evidence_id);
      return [
        `<a id="${anchor(item.id)}"></a>`,
        '',
        `#### ${md(item.title)}`,
        '',
        `ID: \`${item.id}\`.`,
        '',
        ...('role' in item
          ? [
              `Role: ${item.role}. ${implementation && excerpt ? `[${md(excerpt.path)}](#${anchor(excerpt.id)}) · UTF-8 bytes [${implementation.start_byte}, ${implementation.end_byte}).` : 'No implementation is supplied for this callback.'}`,
              '',
            ]
          : []),
        ...fields(item).flatMap((f) => [
          `**${md(f.label)}**${f.text || f.target_id ? `: ${f.text ? md(f.text) : ''}${f.text && f.target_id ? ' → ' : ''}${f.target_id ? link(f.target_id, true) : ''}` : ''}`,
          '',
          ...(f.ids.length
            ? f.ids.map((id) => `- ${link(id)}`)
            : ['None recorded; this does not prove absence.']),
          '',
        ]),
      ];
    }),
    '</details>',
    '',
  ].join('\n');
}
