#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { ClearingsError, SCHEMA_VERSION, TOOL_VERSION } from '../model/types.js';
import { inventory } from '../repository/inventory.js';
import { fetchTarget, readTarget } from '../repository/target.js';
import { writeInventory } from '../repository/output.js';
import { terminalText } from './output.js';
import { validateInventory } from '../model/validate.js';

const help = `Clearings ${TOOL_VERSION} — typed programs, compilation, and semantic contracts

clearings program <list|validate|inspect|compile|run|demo> [arguments] [--format markdown|json]
clearings inspect <specification.json> [--operation alias] [--format json|markdown|html]
clearings context <specification.json> --operation alias --max-bytes n [--format json|markdown]
clearings check <specification.json> --operation alias --observation case.json
clearings explain <specification.json> --operation alias [--format markdown|html]
clearings conformance [--suite smoke|full] [--out new-directory]
clearings conformance run [invocation.json] [--out new-directory] [--suite smoke|full] [--implementation-root checkout] [--timeout-ms n]
clearings conformance replay <record.json|run-directory> [--out new-directory]
clearings inventory <repository> [--ref HEAD] [--include path] [--exclude path] [--out file]
clearings inventory <repository> --target manifest.json [--scope inventory|deep] [--out file]
clearings scan <repository> [inventory options] [--project tsconfig.json] [--mode source-only] [--strict]
clearings benchmark-fetch --target manifest.json --out new-bare-directory
clearings propose <scan.json> --repository repo --instruction text [--include path] [--evidence id] [--max-bytes n] [--out request.json]
clearings inspect <semantic.json> [--capability alias] [--behavior alias] [--id record-id] [--format json] [--scan scan.json --repository repo]
clearings context <semantic.json> --capability alias [--behavior alias] --max-bytes n [--no-neighbors] [--out context.json --repository repo]
clearings evidence <scan.json> --repository repo --id evidence-id [--out excerpt.json]
clearings import <proposal.json> --request request.json --scan scan.json --repository repo [--out semantic.json]
clearings replay <proposal.json> --request request.json --scan scan.json --repository repo [--out replay.json]
clearings explain <semantic.json> --scan scan.json --repository repo --capability alias [--format markdown|html] [--audience engineer|overview] [--presentation plan.json] [--out page]
clearings validate <artifact.json> [--scan scan.json] [--request request.json] [--repository repo]

Repeat --include/--exclude for literal repository-relative paths. Default: all tracked entries.
Target mode uses the pinned commit; custom include/exclude overrides are not accepted.
JSON goes to stdout; explain emits Markdown or HTML. --out saves a new file outside the target.
Explain defaults to the engineer view. --audience overview requires an overview in the presentation plan.
Use --companion filename.html (or filename.md) to link a report in the same directory.
Use propose --schema-version 0.2.0 to request contracts. The default remains 0.1.0.
Typed specifications use version 0.3.0 and select operations by --operation.
Check evaluates supplied observations; exit 1 means a failed rule, and 3 means unknown.
Conformance writes execution records, evaluations, run.json, and report.md to a new directory.
It defaults to run, the smoke suite, and a unique directory under ../clearings-conformance-runs relative to this checkout.
From a source checkout, npm run conformance builds and runs these defaults.
Its exit codes are 0 scoped acceptance, 1 rejection, 2 invalid input, and 3 inconclusive.
Replay re-evaluates saved conformance evidence without executing the candidate.
Program commands default to Markdown; use program --help for formats, limits, and exit statuses.
For legacy context use --format readable-json to resolve prose assertions in place.
Legacy inspect/context use 0.2.0 models. Only --scan with --repository revalidates their source.
Their --out option requires --repository for output protection; this alone does not recheck source.
Context emits compact JSON with exact UTF-8 byte accounting, including its final newline.
For propose, --include selects exact source paths already present in the scan.
Scan follows repository imports as labeled supporting source; it never installs dependencies.
Validate checks internal integrity; --repository also verifies scan source blobs and evidence spans.
Exit codes: 0 success (including reported partial scan), 1 operational failure,
2 invalid input/schema, 3 --strict scan with errors or unresolved facts.
Propose exports source to a file only. Import validates supplied interpretations; replay is explicitly labeled.
Claim support and acceptance remain unreviewed after citation validation.
`;

let command = process.argv[2] ?? 'help';
try {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    strict: true,
    options: {
      help: { type: 'boolean' },
      version: { type: 'boolean' },
      ref: { type: 'string' },
      target: { type: 'string' },
      scope: { type: 'string' },
      include: { type: 'string', multiple: true },
      exclude: { type: 'string', multiple: true },
      out: { type: 'string' },
      project: { type: 'string' },
      mode: { type: 'string' },
      strict: { type: 'boolean' },
      repository: { type: 'string' },
      instruction: { type: 'string' },
      evidence: { type: 'string', multiple: true },
      'max-bytes': { type: 'string' },
      id: { type: 'string' },
      request: { type: 'string' },
      scan: { type: 'string' },
      capability: { type: 'string' },
      format: { type: 'string' },
      backend: { type: 'string' },
      audience: { type: 'string' },
      companion: { type: 'string' },
      presentation: { type: 'string' },
      'schema-version': { type: 'string' },
      behavior: { type: 'string' },
      operation: { type: 'string' },
      observation: { type: 'string' },
      'no-neighbors': { type: 'boolean' },
      suite: { type: 'string' },
      'implementation-root': { type: 'string' },
      'timeout-ms': { type: 'string' },
      work: { type: 'string' },
      'allocation-units': { type: 'string' },
      'value-units': { type: 'string' },
      'evaluation-depth': { type: 'string' },
    },
  });
  command = positionals[0] ?? 'help';
  if (values.version) process.stdout.write(`${TOOL_VERSION}\n`);
  else if (command === 'program') {
    const { programCommand } = await import('./program.js');
    programCommand(positionals, values);
  } else if (values.help || command === 'help') process.stdout.write(help);
  else if (command === 'conformance') {
    const { conformanceCommand } = await import('./conformance.js');
    await conformanceCommand(positionals, values);
  } else {
    const allowed: Record<string, string[]> = {
      inventory: ['ref', 'target', 'scope', 'include', 'exclude', 'out'],
      scan: ['ref', 'target', 'scope', 'include', 'exclude', 'out', 'project', 'mode', 'strict'],
      'benchmark-fetch': ['target', 'out'],
      validate: ['repository', 'scan', 'request'],
      check: ['operation', 'id', 'observation', 'format', 'out', 'repository'],
      inspect: ['operation', 'id', 'capability', 'behavior', 'format', 'scan', 'repository', 'out'],
      context: [
        'operation',
        'id',
        'capability',
        'behavior',
        'format',
        'scan',
        'repository',
        'out',
        'max-bytes',
        'no-neighbors',
      ],
      propose: [
        'schema-version',
        'repository',
        'instruction',
        'include',
        'evidence',
        'max-bytes',
        'out',
      ],
      evidence: ['repository', 'id', 'out'],
      import: ['repository', 'request', 'scan', 'out'],
      replay: ['repository', 'request', 'scan', 'out'],
      explain: [
        'operation',
        'id',
        'max-bytes',
        'repository',
        'scan',
        'capability',
        'out',
        'format',
        'presentation',
        'audience',
        'companion',
      ],
    };
    if (!allowed[command] || Object.keys(values).some((key) => !allowed[command]?.includes(key)))
      throw new ClearingsError(
        'INVALID_ARGUMENTS',
        'Unknown command or unsupported option; use --help.',
      );
    let specificationHandled = false;
    if (['inspect', 'context', 'check', 'explain'].includes(command) && positionals.length === 2) {
      const { readJson } = await import('./semantic.js');
      const artifact = readJson(positionals[1]!);
      if (
        artifact &&
        typeof artifact === 'object' &&
        'kind' in artifact &&
        artifact.kind === 'specification'
      ) {
        const { specificationCommand } = await import('./specification.js');
        specificationCommand(command, positionals, values, artifact);
        specificationHandled = true;
      }
    }
    if (specificationHandled) {
      // Specification commands use the same file-output protection as source reports.
    } else if (command === 'check' || values.operation || values.observation) {
      throw new ClearingsError(
        'INVALID_ARGUMENTS',
        '--operation and check require a typed specification.',
      );
    } else if (command === 'inventory' || command === 'scan') {
      if (positionals.length !== 2)
        throw new ClearingsError(
          'INVALID_ARGUMENTS',
          'Inventory/scan requires one local repository path.',
        );
      if (values.mode && values.mode !== 'source-only')
        throw new ClearingsError('INVALID_ARGUMENTS', 'Only source-only mode is implemented.');
      if (
        (values.scope && !values.target) ||
        (values.scope && !['inventory', 'deep'].includes(values.scope)) ||
        (values.target && (values.include || values.exclude))
      )
        throw new ClearingsError(
          'INVALID_ARGUMENTS',
          'Use target scope inventory/deep, or custom include/exclude paths.',
        );
      const target = values.target ? readTarget(values.target) : null;
      const repository = positionals[1]!;
      const options = {
        repository,
        ref: values.ref ?? target?.commit ?? 'HEAD',
        ...(target
          ? {
              include: [
                ...(values.scope === 'deep'
                  ? target.scope.deep_source_files
                  : target.scope.inventory_roots),
                ...target.scope.supporting_context,
              ],
              exclude: target.scope.excluded_roots,
              expectedCommit: target.commit,
              expectedTree: target.tree_sha,
            }
          : {
              ...(values.include ? { include: values.include } : {}),
              ...(values.exclude ? { exclude: values.exclude } : {}),
            }),
      };
      let result;
      if (command === 'scan') {
        const { scan } = await import('../analysis/scan.js');
        const validateScan: typeof import('../model/validate-scan.js').validateScan = (
          await import('../model/validate-scan.js')
        ).validateScan;
        process.stderr.write(
          'Extracting source-only TypeScript structure from immutable Git objects\n',
        );
        result = scan({ ...options, ...(values.project ? { project: values.project } : {}) });
        validateScan(result);
        if (
          values.strict &&
          (result.status === 'partial' ||
            result.data.facts.some((fact) => fact.resolution === 'unresolved'))
        )
          process.exitCode = 3;
      } else {
        result = inventory(options);
        validateInventory(result);
      }
      const json = `${JSON.stringify(result, null, 2)}\n`;
      if (values.out) writeInventory(repository, values.out, json);
      process.stdout.write(json);
    } else if (command === 'benchmark-fetch') {
      if (positionals.length !== 1 || !values.target || !values.out)
        throw new ClearingsError(
          'INVALID_ARGUMENTS',
          'Benchmark fetch requires --target and a new --out directory.',
        );
      const target = readTarget(values.target);
      process.stderr.write(`Fetching pinned benchmark ${target.target_id}\n`);
      const repository = fetchTarget(target, values.out);
      process.stdout.write(
        `${JSON.stringify({ schema_version: SCHEMA_VERSION, command, status: 'complete', snapshot_id: null, data: { repository, commit_sha: target.commit, tree_sha: target.tree_sha }, diagnostics: [], coverage: null }, null, 2)}\n`,
      );
    } else if (command === 'inspect' || command === 'context') {
      const { contractQueryCommand } = await import('./contracts.js');
      contractQueryCommand(command, positionals, values);
    } else if (['propose', 'evidence', 'import', 'replay', 'explain'].includes(command)) {
      if (command === 'explain' && (values.id || values['max-bytes']))
        throw new ClearingsError(
          'INVALID_ARGUMENTS',
          '--id and --max-bytes on explain require a typed specification.',
        );
      const { semanticCommand } = await import('./semantic.js');
      semanticCommand(command, positionals, values);
    } else {
      if (positionals.length !== 2)
        throw new ClearingsError('INVALID_ARGUMENTS', 'Validate requires one artifact JSON file.');
      let value: unknown;
      let inputBytes: number;
      try {
        const json = readFileSync(positionals[1]!);
        inputBytes = json.length;
        value = JSON.parse(json.toString('utf8'));
      } catch {
        throw new ClearingsError('INVALID_JSON', 'Cannot read artifact JSON.');
      }
      // Legacy validation has no file-size cap. Apply the specification limit only
      // after identifying that artifact family, without parsing the file twice.
      if (value && typeof value === 'object' && 'kind' in value && value.kind === 'specification') {
        if (inputBytes > 64 * 1024 * 1024)
          throw new ClearingsError('INVALID_JSON', 'Cannot read artifact JSON (maximum 64 MiB).');
        const { specificationCommand } = await import('./specification.js');
        specificationCommand(command, positionals, values, value);
      } else {
        let snapshot_id;
        let coverage;
        const isScan =
          !!value && typeof value === 'object' && 'command' in value && value.command === 'scan';
        const isSemantic =
          !!value &&
          typeof value === 'object' &&
          'command' in value &&
          ['propose', 'proposal', 'import'].includes(String(value.command));
        if (isSemantic) {
          const { validateSemanticArtifact } = await import('./semantic.js');
          const checked = validateSemanticArtifact(value, values);
          snapshot_id = checked.snapshot_id;
          coverage = checked.coverage;
        } else if (isScan) {
          if (values.scan || values.request)
            throw new ClearingsError(
              'INVALID_ARGUMENTS',
              '--scan/--request apply only to semantic artifacts.',
            );
          const validateScan: typeof import('../model/validate-scan.js').validateScan = (
            await import('../model/validate-scan.js')
          ).validateScan;
          validateScan(value, values.repository ? { repository: values.repository } : {});
          snapshot_id = value.snapshot_id;
          coverage = value.coverage;
        } else {
          if (values.scan || values.request)
            throw new ClearingsError(
              'INVALID_ARGUMENTS',
              '--scan/--request apply only to semantic artifacts.',
            );
          if (values.repository)
            throw new ClearingsError(
              'INVALID_ARGUMENTS',
              '--repository source validation requires a scan artifact.',
            );
          validateInventory(value);
          snapshot_id = value.snapshot_id;
          coverage = value.coverage;
        }
        process.stdout.write(
          `${JSON.stringify({ schema_version: SCHEMA_VERSION, command, status: 'complete', snapshot_id, data: { valid: true, checks: ['schema', 'digest', 'coverage', ...(!isSemantic ? ['ordering'] : []), 'scope-consistency', ...(isSemantic ? ['semantic-references', 'flow-integrity', 'unreviewed-claim-status', ...(values.repository ? ['source-blobs', 'evidence-spans'] : [])] : []), ...(isScan ? ['record-references', ...(values.repository ? ['source-blobs', 'evidence-spans'] : [])] : [])], source_rechecked: !!values.repository }, diagnostics: [], coverage }, null, 2)}\n`,
        );
      }
    }
  }
} catch (error) {
  const known = error instanceof ClearingsError;
  const argumentError =
    error instanceof TypeError &&
    'code' in error &&
    String(error.code).startsWith('ERR_PARSE_ARGS');
  const code = known ? error.code : argumentError ? 'INVALID_ARGUMENTS' : 'OPERATION_FAILED';
  const message = known
    ? error.message
    : argumentError
      ? 'Invalid arguments; use --help.'
      : 'Operation failed. Check input paths and filesystem permissions.';
  const diagnostic = {
    code,
    message,
    ...(known &&
    error.details &&
    (command === 'program' ||
      code === 'CONTEXT_RESOURCE' ||
      code === 'CONTEXT_NATIVE_FAILED' ||
      code.startsWith('RUST_'))
      ? { details: error.details }
      : {}),
  };
  const stderr = `${code}: ${message}\n`;
  process.stderr.write(
    command === 'program' && process.stderr.isTTY ? terminalText(stderr) : stderr,
  );
  const stdout = `${JSON.stringify({ schema_version: SCHEMA_VERSION, command, status: 'failed', snapshot_id: null, data: null, diagnostics: [diagnostic], coverage: null }, null, 2)}\n`;
  process.stdout.write(
    command === 'program' && process.stdout.isTTY ? terminalText(stdout) : stdout,
  );
  process.exitCode = known ? error.exitCode : argumentError ? 2 : 1;
}
