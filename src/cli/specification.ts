import { readJson } from './semantic.js';
import { ClearingsError } from '../model/types.js';
import { writeInventory } from '../repository/output.js';
import { terminalText } from './output.js';
import { validateSpecification } from '../specification/validate.js';
import { assembleContext, serializeOperationContext } from '../specification/context.js';
import { checkOperation, resolveOperation } from '../specification/check.js';
import { renderOperationContext } from '../specification/render.js';
import type { OperationObservation } from '../specification/model.js';

type Values = Record<string, string | string[] | boolean | undefined>;
export function specificationCommand(command: string, positionals: string[], values: Values, artifact?: unknown): void {
  if (positionals.length !== 2) throw new ClearingsError('INVALID_ARGUMENTS', 'This command requires one specification file.');
  if (values.scan || values.request || values.capability || values.behavior || values.presentation || values.audience || values.companion || values['no-neighbors']) throw new ClearingsError('INVALID_ARGUMENTS', 'Specifications use --operation or --id. Source scan/report options apply only to historical models.');
  const spec = artifact ?? readJson(positionals[1]!); validateSpecification(spec);
  if (values.id && values.operation) throw new ClearingsError('INVALID_ARGUMENTS', 'Select an operation with either --operation or --id.');
  const operation = typeof values.operation === 'string' ? values.operation : typeof values.id === 'string' ? values.id : undefined;
  const format = typeof values.format === 'string' ? values.format : command === 'explain' ? 'markdown' : 'json';
  if (!['json', 'markdown', 'html'].includes(format)) throw new ClearingsError('INVALID_ARGUMENTS', 'Specification output supports json, markdown, or html.');
  let text: string;
  if (command === 'validate') {
    text = JSON.stringify({ schema_version: '0.3.0', command, artifact_id: spec.artifact_id, valid: true, perspective: spec.perspective,
      checks: ['schema', 'content-identity', 'source-text-hashes', 'typed-expressions', 'reference-integrity', 'declared-state-and-effects'], source_authenticated: false, claim_support: 'not-reviewed' }, null, 2) + '\n';
  } else if (command === 'inspect' && !operation) {
    if (format !== 'json') throw new ClearingsError('INVALID_ARGUMENTS', 'Choose an operation for a readable inspection.');
    text = JSON.stringify({ schema_version: '0.3.0', command, artifact_id: spec.artifact_id, perspective: spec.perspective,
      operations: spec.operations.map(item => ({ id: item.id, alias: item.alias, name: item.name, purpose: item.purpose, coverage: item.coverage })) }, null, 2) + '\n';
  } else {
    if (!operation) throw new ClearingsError('INVALID_SELECTION', 'Select an operation with --operation.');
    resolveOperation(spec, operation);
    if (command === 'check') {
      if (format !== 'json' || typeof values.observation !== 'string') throw new ClearingsError('INVALID_ARGUMENTS', 'Check requires --observation file and JSON output.');
      const result = checkOperation(spec, operation, readJson(values.observation) as OperationObservation);
      text = JSON.stringify(result, null, 2) + '\n';
      if (result.verdict !== 'pass') process.exitCode = result.verdict === 'fail' ? 1 : 3;
    } else {
      const pack = assembleContext(spec, operation, { maxBytes: values['max-bytes'] === undefined ? (command === 'inspect' ? 2097152 : 131072) : Number(values['max-bytes']) });
      text = format === 'json' ? serializeOperationContext(pack) : renderOperationContext(pack, { format: format === 'html' ? 'html' : 'markdown' });
    }
  }
  if (typeof values.out === 'string') {
    if (typeof values.repository !== 'string') throw new ClearingsError('INVALID_ARGUMENTS', '--out requires --repository to protect source files.');
    writeInventory(values.repository, values.out, text);
  }
  process.stdout.write(process.stdout.isTTY ? terminalText(text) : text);
}
