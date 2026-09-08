import {
  closeSync,
  constants,
  fstatSync,
  mkdirSync,
  openSync,
  readSync,
  writeFileSync,
} from 'node:fs';
import { dirname } from 'node:path';
import { ClearingsError } from '../model/types.js';
import { executeProgram } from '../program/interpreter.js';
import { PROGRAM_EXECUTION_MAX_LIMITS } from '../program/execution.js';
import type { ProgramExecutionOptions, ProgramExecutionResult } from '../program/execution.js';
import type { Program } from '../program/model.js';
import { renderProgram, renderProgramExecution } from '../program/render.js';
import { validateProgram } from '../program/validate.js';
import { terminalText } from './output.js';

export const programHelp = `Clearings Program IR

clearings program list
clearings program validate <name|program.json>
clearings program inspect <name|program.json>
clearings program run <name|program.json> <arguments.json>
clearings program demo [name]

Names: closure, identity, sum. Demo defaults to closure and executes authored example arguments.
Run requires a JSON array of entry-function arguments, including [] for a zero-parameter entry.
All commands accept --format markdown|json (default markdown) and --out new-file.
Run/demo accept --work n, --allocation-units n, --value-units n, --evaluation-depth n.
Inspect validates and displays every function without execution.
Run/demo JSON is the reference interpreter's ProgramExecutionResult.
Exit codes: 0 success/return, 1 application failure/runtime fault, 2 invalid input/output, 3 resource exhaustion.
From a source checkout: npm run program -- demo
`;

const examples = [
  {
    name: 'closure',
    description: 'Ordered required dependency closure',
    path: 'clearings/required-dependency-closure',
  },
  { name: 'identity', description: 'String identity', path: 'examples/identity' },
  { name: 'sum', description: 'Sum nonnegative integers', path: 'examples/sum-nonnegative' },
] as const;
const limitOptions = {
  work: 'work',
  'allocation-units': 'allocation_units',
  'value-units': 'value_units',
  'evaluation-depth': 'evaluation_depth',
} as const;
type Values = Record<string, string | boolean | string[] | undefined>;
const MAX_FILE_BYTES = 8 * 1024 * 1024;

function invalid(message: string): never {
  throw new ClearingsError('INVALID_ARGUMENTS', message, 2);
}

/** Bound the read itself and reject devices/FIFOs before parsing. */
function readJson(path: string | URL): unknown {
  let fd: number | undefined;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK);
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) throw new Error('Invalid file');
    const chunks: Buffer[] = [];
    let size = 0;
    while (size <= MAX_FILE_BYTES) {
      const chunk = Buffer.allocUnsafe(Math.min(64 * 1024, MAX_FILE_BYTES + 1 - size));
      const count = readSync(fd, chunk, 0, chunk.length, null);
      if (count === 0) break;
      chunks.push(chunk.subarray(0, count));
      size += count;
    }
    if (size > MAX_FILE_BYTES) throw new Error('File too large');
    return JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, size)),
    );
  } catch {
    throw new ClearingsError(
      'INVALID_JSON',
      'Cannot read program input: require a regular UTF-8 JSON file of at most 8 MiB.',
      2,
    );
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function example(name: string) {
  return examples.find((entry) => entry.name === name);
}
function asset(path: string): URL {
  return new URL(`../../programs/${path}.json`, import.meta.url);
}
function loadProgram(source: string): Program {
  const selected = example(source);
  const value = readJson(selected ? asset(selected.path) : source);
  validateProgram(value);
  return value;
}
function status(result: ProgramExecutionResult): number {
  switch (result.completion.kind) {
    case 'return':
      return 0;
    case 'application-failure':
    case 'runtime-fault':
      return 1;
    case 'resource-exhaustion':
      return 3;
  }
}

export function programCommand(positionals: readonly string[], values: Values): void {
  const action = positionals[1] ?? 'help';
  if (values.help || action === 'help') {
    if (
      positionals.length > (action === 'help' ? 2 : 3) ||
      Object.keys(values).some((key) => key !== 'help')
    )
      invalid('Use program --help without other options.');
    process.stdout.write(programHelp);
    return;
  }
  const positionalCounts: Readonly<Record<string, readonly number[]>> = {
    list: [2],
    validate: [3],
    inspect: [3],
    run: [4],
    demo: [2, 3],
  };
  const execute = action === 'run' || action === 'demo';
  const allowed = ['format', 'out', ...(execute ? Object.keys(limitOptions) : [])];
  if (
    !Object.hasOwn(positionalCounts, action) ||
    Object.keys(values).some((key) => !allowed.includes(key))
  )
    invalid('Unknown program action or unsupported option; use program --help.');
  if (!positionalCounts[action]?.includes(positionals.length))
    invalid('Incorrect program arguments; use program --help.');
  const format = values.format ?? 'markdown';
  if (format !== 'markdown' && format !== 'json')
    invalid('Program output format must be markdown or json.');
  if (values.out !== undefined && (typeof values.out !== 'string' || !values.out))
    invalid('--out requires a new file path.');
  const options: ProgramExecutionOptions = {};
  for (const [flag, resource] of Object.entries(limitOptions)) {
    const value = values[flag];
    if (value === undefined) continue;
    const maximum = PROGRAM_EXECUTION_MAX_LIMITS[resource];
    const limit = typeof value === 'string' && /^[1-9][0-9]*$/.test(value) ? Number(value) : NaN;
    if (!Number.isSafeInteger(limit) || limit > maximum)
      invalid(`--${flag} must be a positive decimal integer no greater than ${maximum}.`);
    options[resource] = limit;
  }
  let output: string;
  let exitCode = 0;
  if (action === 'list') {
    const catalog = examples.map(({ name, description }) => {
      const program = loadProgram(name);
      return {
        name,
        description,
        program_id: program.artifact_id,
        entry_function: program.entry_function,
      };
    });
    output =
      format === 'json'
        ? JSON.stringify(catalog, null, 2) + '\n'
        : '# Bundled programs\n\n| Name | Description | Entry function |\n| --- | --- | --- |\n' +
          catalog
            .map((entry) => `| ${entry.name} | ${entry.description} | ${entry.entry_function} |\n`)
            .join('') +
          '\nRun an authored example with `clearings program demo <name>`.\n';
  } else {
    const source = positionals[2] ?? 'closure';
    const selectedExample = example(source);
    if (action === 'demo' && !selectedExample)
      invalid('Demo requires a bundled name: closure, identity, or sum.');
    const program = loadProgram(source);
    if (action === 'validate') {
      const validation = { program_id: program.artifact_id, valid: true, executed: false };
      output =
        format === 'json'
          ? JSON.stringify(validation, null, 2) + '\n'
          : `# Program validation\n\nStatic validation passed. Program: \`${program.artifact_id}\`.\n\nThe program was not executed.\n`;
    } else if (action === 'inspect') {
      output = format === 'json' ? JSON.stringify(program, null, 2) + '\n' : renderProgram(program);
    } else {
      const argumentsPath =
        action === 'demo' && selectedExample
          ? asset(`${selectedExample.path}.arguments`)
          : positionals[3];
      if (argumentsPath === undefined) invalid('Incorrect program arguments; use program --help.');
      const arguments_ = readJson(argumentsPath);
      const result = executeProgram(program, arguments_, options);
      output =
        format === 'json' ? JSON.stringify(result, null, 2) + '\n' : renderProgramExecution(result);
      if (action === 'demo') {
        const label = `Authored example: ${source}; arguments are bundled example data. This is a fresh interpreter execution.`;
        if (format === 'markdown') output = label + '\n\n' + output;
        else process.stderr.write(label + '\n');
      }
      exitCode = status(result);
    }
  }
  if (typeof values.out === 'string') {
    try {
      mkdirSync(dirname(values.out), { recursive: true });
      writeFileSync(values.out, output, { flag: 'wx', encoding: 'utf8' });
    } catch {
      throw new ClearingsError(
        'INVALID_OUTPUT',
        'Cannot create output; --out must name a new writable file.',
        2,
      );
    }
  }
  process.stdout.write(process.stdout.isTTY ? terminalText(output) : output);
  process.exitCode = exitCode;
}
