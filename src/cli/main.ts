#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { ClearingsError, SCHEMA_VERSION, TOOL_VERSION } from '../model/types.js';
import { inventory } from '../repository/inventory.js';
import { fetchTarget, readTarget } from '../repository/target.js';
import { writeInventory } from '../repository/output.js';
import { validateInventory } from '../model/validate.js';

const help = `Clearings ${TOOL_VERSION} — repository structure and semantic proposal exchange

clearings inventory <repository> [--ref HEAD] [--include path] [--exclude path] [--out file]
clearings inventory <repository> --target manifest.json [--scope inventory|deep] [--out file]
clearings scan <repository> [inventory options] [--project tsconfig.json] [--mode source-only] [--strict]
clearings benchmark-fetch --target manifest.json --out new-bare-directory
clearings propose <scan.json> --repository repo --instruction text [--include path] [--evidence id] [--max-bytes n] [--out request.json]
clearings evidence <scan.json> --repository repo --id evidence-id [--out excerpt.json]
clearings import <proposal.json> --request request.json --scan scan.json --repository repo [--out semantic.json]
clearings replay <proposal.json> --request request.json --scan scan.json --repository repo [--out replay.json]
clearings explain <semantic.json> --scan scan.json --repository repo --capability alias [--out page.md]
clearings validate <artifact.json> [--scan scan.json] [--request request.json] [--repository repo]

Repeat --include/--exclude for literal repository-relative paths. Default: all tracked entries.
Target mode uses the pinned commit; custom include/exclude overrides are not accepted.
JSON goes to stdout; explain emits Markdown. --out saves a new file outside the target.
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
    args: process.argv.slice(2), allowPositionals: true, strict: true,
    options: { help: { type: 'boolean' }, version: { type: 'boolean' }, ref: { type: 'string' }, target: { type: 'string' }, scope: { type: 'string' }, include: { type: 'string', multiple: true }, exclude: { type: 'string', multiple: true }, out: { type: 'string' }, project: { type: 'string' }, mode: { type: 'string' }, strict: { type: 'boolean' }, repository: { type: 'string' }, instruction: { type: 'string' }, evidence: { type: 'string', multiple: true }, 'max-bytes': { type: 'string' }, id: { type: 'string' }, request: { type: 'string' }, scan: { type: 'string' }, capability: { type: 'string' } },
  });
  command = positionals[0] ?? 'help';
  if (values.version) process.stdout.write(`${TOOL_VERSION}\n`);
  else if (values.help || command === 'help') process.stdout.write(help);
  else {
    const allowed: Record<string, string[]> = { inventory: ['ref', 'target', 'scope', 'include', 'exclude', 'out'], scan: ['ref', 'target', 'scope', 'include', 'exclude', 'out', 'project', 'mode', 'strict'], 'benchmark-fetch': ['target', 'out'], validate: ['repository', 'scan', 'request'], propose: ['repository', 'instruction', 'include', 'evidence', 'max-bytes', 'out'], evidence: ['repository', 'id', 'out'], import: ['repository', 'request', 'scan', 'out'], replay: ['repository', 'request', 'scan', 'out'], explain: ['repository', 'scan', 'capability', 'out'] };
    if (!allowed[command] || Object.keys(values).some((key) => !allowed[command]?.includes(key))) throw new ClearingsError('INVALID_ARGUMENTS', 'Unknown command or unsupported option; use --help.');
    if (command === 'inventory' || command === 'scan') {
      if (positionals.length !== 2) throw new ClearingsError('INVALID_ARGUMENTS', 'Inventory/scan requires one local repository path.');
      if (values.mode && values.mode !== 'source-only') throw new ClearingsError('INVALID_ARGUMENTS', 'Only source-only mode is implemented.');
      if ((values.scope && !values.target) || (values.scope && !['inventory', 'deep'].includes(values.scope)) || (values.target && (values.include || values.exclude))) throw new ClearingsError('INVALID_ARGUMENTS', 'Use target scope inventory/deep, or custom include/exclude paths.');
      const target = values.target ? readTarget(values.target) : null;
      const repository = positionals[1]!;
      const options = {
        repository, ref: values.ref ?? target?.commit ?? 'HEAD',
        ...(target ? {
          include: [...(values.scope === 'deep' ? target.scope.deep_source_files : target.scope.inventory_roots), ...target.scope.supporting_context],
          exclude: target.scope.excluded_roots, expectedCommit: target.commit, expectedTree: target.tree_sha,
        } : { ...(values.include ? { include: values.include } : {}), ...(values.exclude ? { exclude: values.exclude } : {}) }),
      };
      let result;
      if (command === 'scan') {
        const { scan } = await import('../analysis/scan.js');
        const validateScan: typeof import('../model/validate-scan.js').validateScan = (await import('../model/validate-scan.js')).validateScan;
        process.stderr.write('Extracting source-only TypeScript structure from immutable Git objects\n');
        result = scan({ ...options, ...(values.project ? { project: values.project } : {}) });
        validateScan(result);
        if (values.strict && (result.status === 'partial' || result.data.facts.some((fact) => fact.resolution === 'unresolved'))) process.exitCode = 3;
      } else {
        result = inventory(options);
        validateInventory(result);
      }
      const json = `${JSON.stringify(result, null, 2)}\n`;
      if (values.out) writeInventory(repository, values.out, json);
      process.stdout.write(json);
    } else if (command === 'benchmark-fetch') {
      if (positionals.length !== 1 || !values.target || !values.out) throw new ClearingsError('INVALID_ARGUMENTS', 'Benchmark fetch requires --target and a new --out directory.');
      const target = readTarget(values.target);
      process.stderr.write(`Fetching pinned benchmark ${target.target_id}\n`);
      const repository = fetchTarget(target, values.out);
      process.stdout.write(`${JSON.stringify({ schema_version: SCHEMA_VERSION, command, status: 'complete', snapshot_id: null, data: { repository, commit_sha: target.commit, tree_sha: target.tree_sha }, diagnostics: [], coverage: null }, null, 2)}\n`);
    } else if (['propose', 'evidence', 'import', 'replay', 'explain'].includes(command)) {
      const { semanticCommand } = await import('./semantic.js');
      semanticCommand(command, positionals, values);
    } else {
      if (positionals.length !== 2) throw new ClearingsError('INVALID_ARGUMENTS', 'Validate requires one artifact JSON file.');
      let value: unknown;
      try { value = JSON.parse(readFileSync(positionals[1]!, 'utf8')); }
      catch { throw new ClearingsError('INVALID_JSON', 'Cannot read artifact JSON.'); }
      let snapshot_id; let coverage;
      const isScan = !!value && typeof value === 'object' && 'command' in value && value.command === 'scan';
      const isSemantic = !!value && typeof value === 'object' && 'command' in value && ['propose', 'proposal', 'import'].includes(String(value.command));
      if (isSemantic) {
        const { validateSemanticArtifact } = await import('./semantic.js');
        const checked = validateSemanticArtifact(value, values); snapshot_id = checked.snapshot_id; coverage = checked.coverage;
      } else if (isScan) {
        if (values.scan || values.request) throw new ClearingsError('INVALID_ARGUMENTS', '--scan/--request apply only to semantic artifacts.');
        const validateScan: typeof import('../model/validate-scan.js').validateScan = (await import('../model/validate-scan.js')).validateScan;
        validateScan(value, values.repository ? { repository: values.repository } : {});
        snapshot_id = value.snapshot_id; coverage = value.coverage;
      } else {
        if (values.scan || values.request) throw new ClearingsError('INVALID_ARGUMENTS', '--scan/--request apply only to semantic artifacts.');
        if (values.repository) throw new ClearingsError('INVALID_ARGUMENTS', '--repository source validation requires a scan artifact.');
        validateInventory(value); snapshot_id = value.snapshot_id; coverage = value.coverage;
      }
      process.stdout.write(`${JSON.stringify({ schema_version: SCHEMA_VERSION, command, status: 'complete', snapshot_id, data: { valid: true, checks: ['schema', 'digest', 'coverage', ...(!isSemantic ? ['ordering'] : []), 'scope-consistency', ...(isSemantic ? ['semantic-references', 'flow-integrity', 'unreviewed-claim-status', ...(values.repository ? ['source-blobs', 'evidence-spans'] : [])] : []), ...(isScan ? ['record-references', ...(values.repository ? ['source-blobs', 'evidence-spans'] : [])] : [])], source_rechecked: !!values.repository }, diagnostics: [], coverage }, null, 2)}\n`);
    }
  }
} catch (error) {
  const known = error instanceof ClearingsError;
  const argumentError = error instanceof TypeError && 'code' in error && String(error.code).startsWith('ERR_PARSE_ARGS');
  const code = known ? error.code : argumentError ? 'INVALID_ARGUMENTS' : 'OPERATION_FAILED';
  const message = known ? error.message : argumentError ? 'Invalid arguments; use --help.' : 'Operation failed. Check input paths and filesystem permissions.';
  process.stderr.write(`${code}: ${message}\n`);
  process.stdout.write(`${JSON.stringify({ schema_version: SCHEMA_VERSION, command, status: 'failed', snapshot_id: null, data: null, diagnostics: [{ code, message }], coverage: null }, null, 2)}\n`);
  process.exitCode = known ? error.exitCode : argumentError ? 2 : 1;
}
