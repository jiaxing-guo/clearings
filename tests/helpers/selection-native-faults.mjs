// Host-side fault injection for evaluator tests; never loaded by the production evaluator.
import { registerHooks } from 'node:module';
import { executeProgram } from 'clearings/program';

registerHooks({
  resolve(specifier, context, nextResolve) {
    return specifier === 'clearings/compiler'
      ? { url: import.meta.url, shortCircuit: true }
      : nextResolve(specifier, context);
  },
});

export function prepareRustProgram(program) {
  const mode = process.env.CLEARINGS_SELECTION_NATIVE_FAULT;
  if (mode === 'preparation') throw Object.assign(new Error('cache denied'), { code: 'EACCES' });
  if (mode === 'uncoded-preparation') throw 'preparation interrupted';
  let count = 0;
  return {
    native: { build_id: 'authored evaluator fault control' },
    artifact: { artifact_id: 'authored evaluator fault control' },
    execute(args, limits) {
      count++;
      if (mode === 'unavailable')
        throw Object.assign(new Error('execution denied'), { code: 'EPERM' });
      if (count === 22)
        throw Object.assign(new Error('process stopped'), { code: 'RUST_EXECUTION_FAILED' });
      if (count === 23) throw Object.assign(new Error('execution denied'), { code: 'EPERM' });
      if (count === 24) throw new Error('uncoded execution failure');
      const result = executeProgram(program, args, limits);
      if (count <= 21)
        result.completion = { kind: 'return', value: { state_ids: ['wrong'], source_ids: [] } };
      return result;
    },
    dispose() {},
  };
}
