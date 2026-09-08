import type { ContractModel } from '../model/contracts.js';
import type { ContractRecords, EvidenceReference, Inspection, SemanticSelection } from './query.js';
import { ClearingsError } from '../model/types.js';
import { assertionIds } from './validate.js';

const keys = [
  'concepts',
  'claims',
  'relations',
  'flows',
  'functions',
  'behaviors',
  'unknowns',
  'callables',
  'symbols',
] as const;
type RecordValue = ContractRecords[(typeof keys)[number]][number];
const empty = (): ContractRecords => ({
  concepts: [],
  claims: [],
  relations: [],
  flows: [],
  functions: [],
  behaviors: [],
  unknowns: [],
  callables: [],
  symbols: [],
});
const fail = (message: string): never => {
  throw new ClearingsError('INVALID_SELECTION', message);
};

export function createContractGraph(model: ContractModel, selection: SemanticSelection) {
  const data = model.data.proposal.data;
  const all: ContractRecords = {
    concepts: data.concepts,
    claims: data.claims,
    relations: data.relations,
    flows: data.flows,
    functions: data.functions,
    behaviors: data.behaviors,
    unknowns: data.unknowns,
    callables: model.data.request.data.callables,
    symbols: model.data.request.data.source_request.data.symbols,
  };
  const index = new Map<string, RecordValue>();
  for (const key of keys) for (const record of all[key]) index.set(record.id, record);
  if (selection.id && (selection.capability || selection.behavior))
    fail('Use --id alone, or select a capability and optional behavior.');
  const resolve = <T extends { id: string; alias: string }>(
    items: T[],
    value: string,
    label: string,
  ): T =>
    items.find((item) => item.id === value || item.alias === value) ?? fail(`Unknown ${label}.`);
  const capability = selection.capability
    ? resolve(
        data.concepts.filter((c) => c.kind === 'capability'),
        selection.capability,
        'capability',
      )
    : undefined;
  const behavior = selection.behavior
    ? resolve(data.behaviors, selection.behavior, 'behavior')
    : undefined;
  if (behavior && capability && behavior.capability_id !== capability.id)
    fail('Behavior does not belong to the selected capability.');
  if (selection.id && !index.has(selection.id)) fail('Unknown canonical record ID.');
  const roots = selection.id
    ? [selection.id]
    : behavior
      ? [behavior.id]
      : capability
        ? [
            capability.id,
            ...data.behaviors.filter((b) => b.capability_id === capability.id).map((b) => b.id),
          ]
        : [];
  const checks: Inspection['checks'] = {
    integrity: 'valid',
    source_rechecked: false,
    claim_support: 'not-reviewed',
    acceptance: 'proposed',
  };
  const catalog = {
    capabilities: data.concepts.filter((c) => c.kind === 'capability'),
    functions: data.functions,
    behaviors: data.behaviors,
  };
  const catalogView = Object.fromEntries(
    Object.entries(catalog).map(([key, items]) => [
      key,
      items
        .map(({ id, alias, title }) => ({ id, alias, title }))
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    ]),
  ) as Inspection['catalog'];

  // References establish required records, not observed execution order.
  const direct = (item: RecordValue): string[] => {
    const ids = assertionIds(item);
    if ('component_id' in item)
      ids.push(
        item.component_id,
        ...(item.implementation_id ? [item.implementation_id] : []),
        ...item.state_access.map((s) => s.state_id),
        ...item.dependencies.map((d) => d.target_id),
        ...item.unknown_ids,
        ...item.failures.flatMap((f) => (f.destination_id ? [f.destination_id] : [])),
      );
    else if ('trigger_claim_ids' in item)
      ids.push(
        item.capability_id,
        ...item.function_ids,
        ...item.state_ids,
        item.flow_id,
        ...item.unknown_ids,
        ...item.failures.flatMap((f) => (f.destination_id ? [f.destination_id] : [])),
      );
    else if ('subject_ids' in item) ids.push(...item.subject_ids);
    else if ('subject_id' in item) ids.push(item.subject_id);
    else if ('from_id' in item) ids.push(item.from_id, item.to_id);
    else if ('steps' in item) ids.push(item.capability_id, ...item.entry_symbol_ids);
    else if ('symbol_id' in item)
      ids.push(
        ...[item.symbol_id, item.enclosing_symbol_id].filter((id): id is string => id !== null),
      );
    else if ('symbol_ids' in item) ids.push(...item.symbol_ids);
    return ids.filter((id) => id !== item.id);
  };
  const collect = (initial: string[], recursive: boolean): Set<string> => {
    const selected = new Set(initial);
    const pending = [...initial];
    const relevant = new Set(initial);
    if (initial.some((id) => all.concepts.some((c) => c.id === id && c.kind === 'capability'))) {
      for (const b of all.behaviors.filter((b) => initial.includes(b.capability_id))) {
        selected.add(b.id);
        pending.push(b.id);
      }
      for (const claim of all.claims.filter((c) =>
        c.subject_ids.some((id) => initial.includes(id)),
      )) {
        selected.add(claim.id);
        pending.push(claim.id);
      }
    }
    const add = (id: string, expand: boolean) => {
      if (!selected.has(id)) {
        selected.add(id);
        if (expand) pending.push(id);
      }
    };
    while (pending.length) {
      const id = pending.shift()!;
      const item = index.get(id)!;
      for (const target of direct(item)) {
        // Assertion subjects are attribution metadata, not a request to expand every
        // capability mentioned by a shared assertion. Semantic participant links are.
        const semanticLink = !('subject_ids' in item) && !('subject_id' in item);
        if (semanticLink) {
          if (!relevant.has(target) && selected.has(target) && recursive) pending.push(target);
          relevant.add(target);
        }
        add(
          target,
          semanticLink &&
            (recursive ||
              target.startsWith('claim:') ||
              target.startsWith('unknown:') ||
              target.startsWith('callable:')),
        );
      }
      for (const unknown of all.unknowns)
        if (relevant.has(id) && unknown.subject_id === id) add(unknown.id, true);
      // Constraints are compulsory even if a proposal omitted an explicit link.
      for (const claim of all.claims)
        if (relevant.has(id) && claim.category === 'constraint' && claim.subject_ids.includes(id))
          add(claim.id, true);
    }
    // Preserve unknowns about direct references, including shared state and callbacks.
    for (const unknown of all.unknowns)
      if (relevant.has(unknown.subject_id)) selected.add(unknown.id);
    for (const relation of all.relations)
      if (selected.has(relation.from_id) && selected.has(relation.to_id)) selected.add(relation.id);
    return selected;
  };
  const materialize = (
    selected: Set<string>,
  ): {
    records: ContractRecords;
    evidence: EvidenceReference[];
    deferred_evidence_ids: string[];
  } => {
    const records = empty();
    for (const key of keys)
      (records[key] as RecordValue[]) = [...all[key]]
        .filter((item) => selected.has(item.id))
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const evidenceIds = new Set<string>();
    const visit = (v: unknown): void => {
      if (Array.isArray(v)) v.forEach(visit);
      else if (v && typeof v === 'object')
        for (const [key, field] of Object.entries(v)) {
          if (key === 'evidence_id' && typeof field === 'string') evidenceIds.add(field);
          else if (key === 'evidence_ids' && Array.isArray(field))
            field.forEach((id) => evidenceIds.add(id));
          else visit(field);
        }
    };
    visit(records);
    return {
      records,
      deferred_evidence_ids: [...evidenceIds]
        .filter(
          (id) => !model.data.request.data.source_request.data.evidence.some((e) => e.id === id),
        )
        .sort(),
      evidence: model.data.request.data.source_request.data.evidence
        .filter((item) => evidenceIds.has(item.id))
        .map(({ text: _, ...anchor }) => anchor)
        .sort((a, b) => (a.id < b.id ? -1 : 1)),
    };
  };
  return { all, index, roots: roots.sort(), checks, catalog: catalogView, collect, materialize };
}
