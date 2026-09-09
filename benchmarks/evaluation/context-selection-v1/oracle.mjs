import { isDeepStrictEqual } from 'node:util';

// Relational membership oracle: no production adapter, selector, or interpreter imports.
export function expectedSelection([selected, operations, states, sources]) {
  const reaches = (operation) => selected.includes(operation.id);
  const selects = (state) =>
    operations.some(
      (operation) =>
        reaches(operation) &&
        (operation.complete_frame ||
          operation.reads.includes(state.id) ||
          operation.writes.includes(state.id)),
    );
  const uniqueOrdered = (ids) => [...new Set(ids)].sort();
  return {
    state_ids: uniqueOrdered(states.filter(selects).map((state) => state.id)),
    source_ids: uniqueOrdered(
      sources.filter(
        (id) =>
          operations.some(
            (operation) =>
              reaches(operation) && operation.evidence_groups.some((group) => group.includes(id)),
          ) || states.some((state) => selects(state) && state.evidence_ids.includes(id)),
      ),
    ),
  };
}

/** Missing execution cannot satisfy an obligation; observed violations still reject. */
export function evaluateSelection(args, observation, argumentsAfter) {
  const checks = [];
  if (argumentsAfter === undefined) checks.push({ id: 'input-ownership', status: 'unobserved' });
  else
    checks.push({
      id: 'input-ownership',
      status: isDeepStrictEqual(args, argumentsAfter) ? 'pass' : 'fail',
    });
  if (observation.status !== 'observed') checks.push({ id: 'selection', status: 'unobserved' });
  else
    checks.push({
      id: 'selection',
      status: isDeepStrictEqual(observation.completion, {
        kind: 'return',
        value: expectedSelection(args),
      })
        ? 'pass'
        : 'fail',
    });
  return {
    checks,
    verdict: checks.some((check) => check.status === 'fail')
      ? 'rejected'
      : checks.some((check) => check.status === 'unobserved')
        ? 'inconclusive'
        : 'accepted',
  };
}
