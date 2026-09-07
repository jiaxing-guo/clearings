import { ClearingsError } from '../model/types.js';
import { validateScan } from '../model/validate-scan.js';
import { readJson } from './semantic.js';
import { inspectSemantic, createContextPack, serializeContextPack } from '../contracts/query.js';
import { validateContractModel } from '../contracts/validate.js';
import { createContractBrief, serializeContractBrief } from '../contracts/brief.js';
import { terminalText } from './output.js';
import { writeInventory } from '../repository/output.js';

type Values = Record<string, string | string[] | boolean | undefined>;
export function contractQueryCommand(command: string, positionals: string[], values: Values): void {
  if (positionals.length !== 2) throw new ClearingsError('INVALID_ARGUMENTS', 'Inspection/context requires one semantic artifact.');
  if (values.format && values.format !== 'json' && !(command === 'context' && values.format === 'readable-json')) throw new ClearingsError('INVALID_ARGUMENTS', 'Use json, or readable-json for resolved legacy context.');
  if (values.scan && !values.repository) throw new ClearingsError('INVALID_ARGUMENTS', '--scan requires --repository for explicit source revalidation.');
  if (values.out && !values.repository) throw new ClearingsError('INVALID_ARGUMENTS', '--out requires --repository for target output protection.');
  const model = readJson(positionals[1]!); validateContractModel(model);
  const scan = typeof values.scan === 'string' ? readJson(values.scan) : undefined;
  if (scan !== undefined) validateScan(scan);
  const options = scan !== undefined && typeof values.repository === 'string' ? { scan, repository: values.repository } : {};
  const selection = { ...(typeof values.id === 'string' ? { id: values.id } : {}), ...(typeof values.capability === 'string' ? { capability: values.capability } : {}), ...(typeof values.behavior === 'string' ? { behavior: values.behavior } : {}) };
  const text = command === 'inspect' ? JSON.stringify(inspectSemantic(model, selection, options), null, 2) + '\n'
    : values.format === 'readable-json' ? serializeContractBrief(createContractBrief(model, selection, { ...options, maxBytes: Number(values['max-bytes']) }))
    : serializeContextPack(createContextPack(model, selection, { ...options, maxBytes: Number(values['max-bytes']), includeNeighbors: values['no-neighbors'] !== true }));
  if (typeof values.out === 'string') writeInventory(values.repository as string, values.out, text);
  process.stdout.write(process.stdout.isTTY ? terminalText(text) : text);
}
