// Recorded input only. No model call, target execution, or evaluator input.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, realpathSync, existsSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import {
  scan,
  readTarget,
  createContractRequest,
  importContractProposal,
  inspectSemantic,
  createContextPack,
  serializeContextPack,
  createEvidenceReader,
} from '../dist/index.js';
import { canonical } from '../dist/repository/inventory.js';
import { writeInventory } from '../dist/repository/output.js';
const [repositoryArg, outputArg] = process.argv.slice(2);
if (!repositoryArg || !outputArg)
  throw new Error(
    'Usage: node scripts/replay-contracts.mjs <pinned-hono-repository> <new-output-directory>',
  );
const repository = realpathSync(repositoryArg),
  output = resolve(outputArg);
if (existsSync(output)) throw new Error('Use a new output directory.');
const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const target = readTarget(
  fileURLToPath(new URL('../benchmarks/targets/hono.json', import.meta.url)),
);
const selection = read('../benchmarks/targets/hono-contracts.json');
const recorded = read('../benchmarks/proposals/hono-contracts/request.json');
const response = read('../benchmarks/proposals/hono-contracts/response.json');
const hash = (text) => createHash('sha256').update(text).digest('hex');
const fingerprint = () => {
  const digest = createHash('sha256');
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : 1,
    )) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile())
        digest.update(relative(repository, path)).update('\0').update(readFileSync(path));
      else throw new Error('Target fingerprint needs regular files/directories.');
    }
  };
  walk(repository);
  return digest.digest('hex');
};
const before = fingerprint();
const start = performance.now();
const structural = scan({
  repository,
  ref: target.commit,
  expectedCommit: target.commit,
  expectedTree: target.tree_sha,
  include: [...target.scope.deep_source_files, ...target.scope.supporting_context],
  exclude: target.scope.excluded_roots,
  project: 'tsconfig.build.json',
});
const scanned = performance.now();
const request = createContractRequest(structural, {
  repository,
  instruction: selection.instruction,
  paths: selection.paths,
  evidenceIds: selection.evidence_ids,
  maxBytes: selection.max_bytes,
});
if (canonical(request) !== canonical(recorded))
  throw new Error('Verified request differs from recorded input. Re-author instead of rebinding.');
const requested = performance.now();
const model = importContractProposal(request, response, {
  scan: structural,
  repository,
  replay: true,
});
const first = JSON.stringify(model, null, 2) + '\n';
const imported = performance.now();
if (
  first !==
  JSON.stringify(
    importContractProposal(request, response, { scan: structural, repository, replay: true }),
    null,
    2,
  ) +
    '\n'
)
  throw new Error('Contract replay differs.');
const artifacts = {
  'scan.json': JSON.stringify(structural, null, 2) + '\n',
  'semantic.json': first,
};
const inspection = {
  description: 'Actual library query output. JSON-only queries report source_rechecked false.',
  catalog: inspectSemantic(model),
  capabilities: [],
};
const contextSizes = {};
for (const capability of model.data.proposal.data.concepts.filter((c) => c.kind === 'capability')) {
  inspection.capabilities.push(inspectSemantic(model, { capability: capability.alias }));
  const options = { maxBytes: 131072, includeNeighbors: false };
  const pack = createContextPack(model, { capability: capability.alias }, options);
  const text = serializeContextPack(pack);
  if (
    text !==
    serializeContextPack(createContextPack(model, { capability: capability.alias }, options))
  )
    throw new Error('Context selection differs.');
  if (Buffer.byteLength(text) !== pack.budget.used_bytes)
    throw new Error('Context byte accounting differs.');
  artifacts[capability.alias + '.context.json'] = text;
  contextSizes[capability.alias] = pack.budget;
}
// Select IDs from the canonical model. This is a walkthrough, not a second model.
const behavior = model.data.proposal.data.behaviors.find((b) => b.alias === 'response-selection');
const getter = model.data.proposal.data.functions.find((f) => f.alias === 'context-res-getter');
const state = model.data.proposal.data.concepts.find((c) => c.alias === 'response-state');
const assertion = model.data.proposal.data.claims.find((c) => c.id === getter.output_claim_ids[0]);
const implementation = request.data.callables.find((c) => c.id === getter.implementation_id);
const reader = createEvidenceReader(structural, repository);
const excerpt = request.data.source_request.data.evidence.find(
  (e) => e.id === implementation.evidence_id,
);
const source = reader.read(excerpt.id);
if (source !== excerpt.text) throw new Error('Walkthrough source differs.');
const focused = createContextPack(
  model,
  { id: getter.id },
  { maxBytes: 32768, includeNeighbors: false },
);
artifacts['response-getter.context.json'] = serializeContextPack(focused);
contextSizes['response-getter'] = focused.budget;
const chain = {
  capability_id: behavior.capability_id,
  behavior_id: behavior.id,
  function_id: getter.id,
  state_id: state.id,
  assertion_id: assertion.id,
  implementation_id: implementation.id,
  evidence_id: excerpt.id,
  path: excerpt.path,
  text: source,
  queries: [
    inspectSemantic(model, { id: behavior.id }),
    inspectSemantic(model, { id: getter.id }),
    inspectSemantic(model, { id: state.id }),
    inspectSemantic(model, { id: assertion.id }),
  ],
  source_rechecked_for_excerpt: true,
};
artifacts['inspection.json'] = JSON.stringify(inspection, null, 2) + '\n';
artifacts['source-walkthrough.json'] = JSON.stringify(chain, null, 2) + '\n';
artifacts['LICENSE-HONO'] = readFileSync(
  new URL('../benchmarks/results/hono-semantics/LICENSE-HONO', import.meta.url),
  'utf8',
);
const after = fingerprint();
if (before !== after) throw new Error('Target bytes changed.');
const summary = {
  schema_version: '0.2.0',
  transport: 'recorded-replay',
  model_called: false,
  snapshot_id: model.snapshot_id,
  scan_artifact_id: structural.artifact_id,
  request_id: request.request_id,
  artifact_id: model.artifact_id,
  proposal_id: model.data.proposal_id,
  request_bytes: Buffer.byteLength(JSON.stringify(request, null, 2) + '\n'),
  proposal_bytes: Buffer.byteLength(JSON.stringify(response, null, 2) + '\n'),
  semantic_bytes: Buffer.byteLength(first),
  coverage: model.coverage,
  source_coverage: structural.coverage,
  context_sizes: contextSizes,
  deterministic_replay: true,
  deterministic_context: true,
  source_excerpts_verified: request.data.source_request.data.evidence.length,
  target_bytes_unchanged: before === after,
  target_fingerprint: before,
  elapsed_ms: {
    scan: +(scanned - start).toFixed(2),
    request: +(requested - scanned).toFixed(2),
    first_import: +(imported - requested).toFixed(2),
  },
  producer_usage: response.producer,
  peak_rss_bytes: process.resourceUsage().maxRSS * 1024,
  files: Object.fromEntries(
    Object.entries(artifacts).map(([name, text]) => [
      name,
      { bytes: Buffer.byteLength(text), sha256: hash(text) },
    ]),
  ),
};
artifacts['summary.json'] = JSON.stringify(summary, null, 2) + '\n';
for (const [name, text] of Object.entries(artifacts))
  writeInventory(repository, join(output, name), text);
process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
