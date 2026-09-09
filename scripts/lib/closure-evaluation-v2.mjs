import { AssertionError } from 'node:assert';
import { prepareRustProgram } from 'clearings/compiler';
import { observe, assess, compareNative, limits } from './closure-evaluation.mjs';

const diagnostic = (error) => ({
  ...(typeof error?.code === 'string' ? { code: error.code } : {}),
  message: error instanceof Error ? error.message : String(error),
});

/** Missing native evidence is distinct from an observed semantic disagreement. */
export function evaluateClosureCases(
  candidate,
  baseline,
  cases,
  { backend = 'both', prepare = prepareRustProgram } = {},
) {
  if (!['reference', 'both'].includes(backend) || cases.length === 0)
    throw new Error('A supported backend and a nonempty evaluation domain are required.');
  const rows = [];
  const nativeErrors = [];
  let prepared;
  if (backend === 'both') {
    try {
      prepared = prepare(candidate);
    } catch (error) {
      nativeErrors.push({ stage: 'preparation', ...diagnostic(error) });
    }
  }
  try {
    for (const item of cases) {
      const row = {
        id: item.id,
        baseline: observe(baseline, item),
        candidate: observe(candidate, item),
      };
      if (prepared) {
        let native;
        try {
          native = prepared.execute(structuredClone(item.args), limits);
        } catch (error) {
          const details = { stage: 'execution', case_id: item.id, ...diagnostic(error) };
          nativeErrors.push(details);
          row.native = { equal: null, error: details };
        }
        if (!row.native) {
          try {
            compareNative(row.candidate.result, native);
            row.native = { equal: true, usage: native.usage, completion: native.completion };
          } catch (error) {
            if (!(error instanceof AssertionError)) throw error;
            row.native = { equal: false, message: error.message, result: native };
          }
        }
      }
      rows.push(row);
    }
  } finally {
    try {
      prepared?.dispose();
    } catch (error) {
      nativeErrors.push({ stage: 'disposal', ...diagnostic(error) });
    }
  }
  const nativeStatus = rows.some((row) => row.native?.equal === false)
    ? 'failed'
    : backend === 'reference'
      ? 'not-run'
      : nativeErrors.length || rows.some((row) => row.native?.equal !== true)
        ? 'unavailable'
        : 'passed';
  // The frozen v1 assessor treats any falsy agreement as disagreement. Supply
  // only observed comparisons, retaining unknowns and diagnostics in the report.
  const observedRows = rows.map((row) =>
    row.native?.equal === null ? { ...row, native: undefined } : row,
  );
  return {
    ...assess(observedRows, nativeStatus),
    native_errors: nativeErrors,
    rows,
  };
}
