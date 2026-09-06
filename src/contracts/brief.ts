import type { SemanticSelection } from './query.js';
import { validateContractModel } from './validate.js';
import { createContractGraph } from './graph.js';
import { accountBytes, compactJson, validateByteBudget } from '../analysis/budget.js';
import { normalized } from '../semantics/identity.js';
import { ClearingsError } from '../model/types.js';
import type { ContractModel } from '../model/contracts.js';
import type { SourceValidation } from '../semantics/validate.js';

/** Legacy prose stays prose. This projection does not invent typed predicates. */
export function createContractBrief(model: ContractModel, selection: SemanticSelection, options: SourceValidation & { maxBytes: number }) {
  validateContractModel(model, options); validateByteBudget(options.maxBytes);
  const q = createContractGraph(model, selection);
  if (!q.roots.length) throw new ClearingsError('INVALID_SELECTION', 'A brief requires a capability, behavior, or record selection.');
  const selected = q.collect(q.roots, true), view = q.materialize(selected);
  const claims = new Map(view.records.claims.map(claim => [claim.id, claim]));
  const assertions = (ids: string[]) => ids.map(id => claims.get(id)!).filter(Boolean);
  const name = (id: string) => { const item = q.index.get(id); return item && 'title' in item ? item.title : id; };
  const brief = normalized({ schema_version: '0.3.0', kind: 'contract-brief', artifact_id: model.artifact_id, snapshot_id: model.snapshot_id,
    formalization: 'legacy-prose-only', selection, checks: { ...q.checks, source_rechecked: !!options.repository },
    behaviors: view.records.behaviors.map(behavior => ({ id: behavior.id, name: behavior.title, triggers: assertions(behavior.trigger_claim_ids),
      outcomes: behavior.outcomes.map(outcome => ({ condition: outcome.condition, assertions: assertions(outcome.claim_ids) })),
      failures: behavior.failures.map(failure => ({ condition: failure.condition, destination: failure.destination_id ? name(failure.destination_id) : 'Beyond the represented boundary', assertions: assertions(failure.claim_ids) })),
      constraints: assertions(behavior.constraint_claim_ids), implementations: behavior.function_ids.map(id => ({ id, name: name(id) })) })),
    functions: view.records.functions.map(fn => ({ id: fn.id, name: fn.title, role: fn.role,
      inputs: assertions(fn.input_claim_ids), outputs: assertions(fn.output_claim_ids), effects: assertions(fn.effect_claim_ids), assumptions: assertions(fn.assumption_claim_ids),
      state: fn.state_access.map(access => ({ name: name(access.state_id), mode: access.mode, assertions: assertions(access.claim_ids) })),
      failures: fn.failures.map(failure => ({ condition: failure.condition, destination: failure.destination_id ? name(failure.destination_id) : 'Beyond the represented boundary', assertions: assertions(failure.claim_ids) })),
      dependencies: fn.dependencies.map(dependency => ({ id: dependency.target_id, name: name(dependency.target_id), assertions: assertions(dependency.claim_ids) })) })),
    flows: view.records.flows.map(flow => ({ id: flow.id, capability: name(flow.capability_id), entry_step_ids: flow.entry_step_ids, steps: flow.steps.map(step => ({ ...step, assertions: assertions(step.claim_ids) })) })),
    assertions: view.records.claims, unknowns: view.records.unknowns, evidence: view.evidence, deferred_evidence_ids: view.deferred_evidence_ids,
    omissions: { record_ids: [...q.index.keys()].filter(id => !selected.has(id)).sort() },
    retrieval: 'Inspect the bound semantic model by canonical ID. Retrieve exact evidence from its bound scan. Prose assertions have not been converted to typed predicates.',
    budget: { max_bytes: options.maxBytes, required_bytes: 0, used_bytes: 0, serialization: 'compact-json-utf8-with-newline' as const } });
  accountBytes(brief);
  if (brief.budget.used_bytes > options.maxBytes) throw new ClearingsError('CONTEXT_BUDGET', `Resolved context needs ${brief.budget.used_bytes} bytes; budget is ${options.maxBytes}. Select a narrower record.`);
  return brief;
}
export type ContractBrief = ReturnType<typeof createContractBrief>;
export const serializeContractBrief = compactJson;
