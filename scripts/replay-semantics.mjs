// Recorded benchmark transport. Never invoke a model or read evaluator answers here.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, realpathSync, existsSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { scan, readTarget, createProposalRequest, importProposal, renderCapability } from '../dist/index.js';
import { writeInventory } from '../dist/repository/output.js';
import { canonical } from '../dist/repository/inventory.js';

const [repositoryArg, outputArg] = process.argv.slice(2);
if (!repositoryArg || !outputArg) throw new Error('Usage: node scripts/replay-semantics.mjs <pinned-hono-repository> <new-output-directory>');
const repository = realpathSync(repositoryArg); const output = resolve(outputArg);
if (existsSync(output)) throw new Error('Use a new output directory.');
const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const target = readTarget(fileURLToPath(new URL('../benchmarks/targets/hono.json', import.meta.url)));
const selection = read('../benchmarks/targets/hono-semantic.json');
const response = read('../benchmarks/proposals/hono/response.json');
const recorded = read('../benchmarks/proposals/hono/request.json');
const hash = (value) => createHash('sha256').update(value).digest('hex');
const fingerprint = () => {
  const digest = createHash('sha256');
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : 1)) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) digest.update(relative(repository, path)).update('\0').update(readFileSync(path));
      else throw new Error('Benchmark fingerprint requires regular files/directories.');
    }
  };
  visit(repository); return digest.digest('hex');
};
const before = fingerprint();
const start = performance.now();
const result = scan({ repository, ref: target.commit, expectedCommit: target.commit, expectedTree: target.tree_sha,
  include: [...target.scope.deep_source_files, ...target.scope.supporting_context], exclude: target.scope.excluded_roots, project: 'tsconfig.build.json' });
const scanned = performance.now();
const request = createProposalRequest(result, { repository, instruction: selection.instruction, paths: selection.paths, evidenceIds: selection.evidence_ids, maxBytes: selection.max_bytes });
const requested = performance.now();
if (canonical(request) !== canonical(recorded)) throw new Error('Recorded request differs from freshly verified request; re-author the proposal instead of rebinding it.');
const first = importProposal(request, response, { scan: result, repository, replay: true });
const imported = performance.now();
const second = importProposal(request, response, { scan: result, repository, replay: true });
const json = JSON.stringify(first, null, 2) + '\n';
if (json !== JSON.stringify(second, null, 2) + '\n') throw new Error('Replay is not byte-stable.');
const presentations = first.data.proposal.data.concepts.filter((concept) => concept.kind === 'capability').map((concept) => ({
  concept, plan: read(`../benchmarks/presentations/hono/${concept.alias}.json`),
}));
const sourceNotice = readFileSync(new URL('../benchmarks/proposals/hono/LICENSE', import.meta.url), 'utf8');
const pages = presentations.flatMap(({ concept, plan }) => ['overview', 'engineer'].flatMap((audience) => ['markdown', 'html'].map((format) => {
  const extension = format === 'html' ? 'html' : 'md';
  const companion = `${concept.alias}.${audience === 'overview' ? 'engineer' : 'overview'}.${extension}`;
  const options = { format, audience, companion, sourceNotice, presentation: plan };
  const page = renderCapability(first, concept.id, options);
  if (page !== renderCapability(second, concept.id, options)) throw new Error('Report rendering is not byte-stable.');
  return [`${concept.alias}.${audience}.${extension}`, page];
})));
if (fingerprint() !== before) throw new Error('Target content changed.');
const summary = {
  schema_version: '0.1.0', transport: 'recorded-replay', model_called: false,
  snapshot_id: result.snapshot_id, scan_artifact_id: result.artifact_id, request_id: request.request_id, semantic_artifact_id: first.artifact_id,
  request_bytes: Buffer.byteLength(JSON.stringify(request, null, 2) + '\n'), semantic_bytes: Buffer.byteLength(json), semantic_sha256: hash(json),
  excerpts: request.coverage.evidence_records, omitted_scope_evidence: request.coverage.omitted_scope_evidence,
  coverage: first.coverage, source_coverage: result.coverage, byte_identical_replays: 2, target_files_unchanged: true,
  measurements: { node: process.version, scan_ms: scanned - start, request_ms: requested - scanned, import_with_source_validation_ms: imported - requested, node_peak_rss_kib: process.resourceUsage().maxRSS },
  measurement_note: 'One process; request and import timings include source verification. RSS includes two imports/rendering and excludes Git children. Replay is recorded agent output, not a fresh inference or independent semantic-quality assessment. Producer token counts/model ID were not available.',
  presentation_plans: presentations.map(({ concept, plan }) => ({ path: `${concept.alias}.presentation.json`, sha256: hash(JSON.stringify(plan, null, 2) + '\n') })),
  pages: pages.map(([path, page]) => ({ path, sha256: hash(page), bytes: Buffer.byteLength(page) })),
};
// The first write uses the existing target/symlink protection before creating directories.
writeInventory(repository, join(output, 'scan.json'), JSON.stringify(result, null, 2) + '\n');
writeInventory(repository, join(output, 'LICENSE-HONO'), sourceNotice);
writeInventory(repository, join(output, 'request.json'), JSON.stringify(request, null, 2) + '\n');
writeInventory(repository, join(output, 'response.json'), JSON.stringify(response, null, 2) + '\n');
writeInventory(repository, join(output, 'semantic.json'), json);
for (const [path, page] of pages) writeInventory(repository, join(output, path), page);
for (const { concept, plan } of presentations) writeInventory(repository, join(output, `${concept.alias}.presentation.json`), JSON.stringify(plan, null, 2) + '\n');
writeInventory(repository, join(output, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
