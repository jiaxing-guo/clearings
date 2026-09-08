import { readFileSync } from 'node:fs';
import { ClearingsError } from '../model/types.js';
import { canonical } from '../repository/inventory.js';
import { sha256 } from '../repository/source.js';
import { createContextAssemblyCases } from './context-cases.js';
import { getContextAssemblyContract } from './context-contract.js';
import type { ContentIdentity, ExecutionRecord } from './model.js';
import type { ContextAssemblyEvaluation } from './context-evaluator.js';

export type ContextSuiteName = 'smoke' | 'full' | 'single';
export interface ContextConformanceEntry {
  case_id: string;
  record_id: string;
  evaluation_id: string;
  record_file: string;
  record_sha256: string;
  evaluation_file: string;
  completion: ExecutionRecord['completion']['kind'];
  acceptance: ContextAssemblyEvaluation['acceptance'];
  contract_verdict: 'pass' | 'fail' | 'unknown' | null;
  failures: string[];
  unknowns: string[];
}
export interface ContextConformanceReport {
  schema_version: '0.1.0';
  kind: 'context-conformance-run';
  artifact_id: string;
  mode: 'execution' | 'replay';
  source_run_id: string | null;
  profile_id: string;
  specification_id: string;
  evaluator: ContentIdentity;
  suite: {
    name: ContextSuiteName;
    definition_id: string | null;
    expected_cases: number;
    covered_cases: number;
  };
  acceptance: ContextAssemblyEvaluation['acceptance'];
  summary: { accepted: number; rejected: number; inconclusive: number; contract_unknown: number };
  cases: ContextConformanceEntry[];
  limitations: string[];
}
export function contextConformanceReportIdentity(
  value: Omit<ContextConformanceReport, 'artifact_id'> | ContextConformanceReport,
): string {
  const { artifact_id: _, ...body } = value as ContextConformanceReport;
  return `context-conformance-run:${sha256(canonical(body))}`;
}
/** Check the authored suite binding against newly generated input values. */
export function contextSuiteIdentity(name: 'smoke' | 'full'): {
  artifact_id: string;
  cases: number;
} {
  const manifest = JSON.parse(
    readFileSync(
      new URL('../../specifications/clearings/conformance/suite.json', import.meta.url),
      'utf8',
    ),
  );
  const { artifact_id, ...body } = manifest;
  const cases = createContextAssemblyCases(name),
    definition = manifest[name];
  if (
    manifest.schema_version !== '0.1.0' ||
    manifest.kind !== 'context-conformance-suite' ||
    artifact_id !== `context-conformance-suite:${sha256(canonical(body))}` ||
    manifest.profile_id !== getContextAssemblyContract().profile.artifact_id ||
    definition?.cases !== cases.length ||
    definition?.cases_sha256 !== sha256(canonical(cases))
  )
    throw new ClearingsError(
      'INVALID_CONFORMANCE',
      'Suite definition differs from generated cases or the current profile.',
    );
  return { artifact_id, cases: cases.length };
}
export function contextConformanceEntry(
  record: ExecutionRecord,
  evaluation: ContextAssemblyEvaluation,
  index: number,
  recordBytes: string,
): ContextConformanceEntry {
  const suffix = String(index).padStart(5, '0');
  return {
    case_id: record.case_id,
    record_id: record.artifact_id,
    evaluation_id: evaluation.artifact_id,
    record_file: `record-${suffix}.json`,
    record_sha256: sha256(recordBytes),
    evaluation_file: `evaluation-${suffix}.json`,
    completion: record.completion.kind,
    acceptance: evaluation.acceptance,
    contract_verdict: evaluation.contract?.verdict ?? null,
    failures: [...evaluation.checks, ...evaluation.obligations]
      .filter((check) => check.status === 'fail')
      .map((check) => `${check.id}: ${check.reason}`),
    unknowns: [...evaluation.checks, ...evaluation.obligations]
      .filter((check) => check.status === 'unknown')
      .map((check) => `${check.id}: ${check.reason}`),
  };
}
export function createContextConformanceReport(
  mode: 'execution' | 'replay',
  name: ContextSuiteName,
  cases: ContextConformanceEntry[],
  evaluator: ContentIdentity,
  source_run_id: string | null,
): ContextConformanceReport {
  const { profile, specification } = getContextAssemblyContract();
  const definition = name === 'single' ? null : contextSuiteIdentity(name);
  const expected = definition?.cases ?? 1;
  if (cases.length !== expected || new Set(cases.map((item) => item.case_id)).size !== cases.length)
    throw new ClearingsError(
      'INVALID_CONFORMANCE',
      'Run coverage must contain every expected case exactly once.',
    );
  const summary = { accepted: 0, rejected: 0, inconclusive: 0, contract_unknown: 0 };
  for (const item of cases) {
    summary[item.acceptance]++;
    if (item.contract_verdict === 'unknown') summary.contract_unknown++;
  }
  const body = {
    schema_version: '0.1.0' as const,
    kind: 'context-conformance-run' as const,
    mode,
    source_run_id,
    profile_id: profile.artifact_id,
    specification_id: specification.artifact_id,
    evaluator,
    suite: {
      name,
      definition_id: definition?.artifact_id ?? null,
      expected_cases: expected,
      covered_cases: cases.length,
    },
    acceptance: summary.rejected
      ? ('rejected' as const)
      : summary.inconclusive
        ? ('inconclusive' as const)
        : ('accepted' as const),
    summary,
    cases,
    limitations: [
      'Acceptance is restricted to these inputs, captures, and the declared mandatory obligations. The broader contract retains unknowns.',
      'Replay re-evaluates saved evidence with the current evaluator; it does not execute or authenticate the recorded implementation.',
      'External effects, installed dependency bytes, compiler provenance, universal refinement, and agent coding advantage are not established.',
    ],
  };
  return { ...body, artifact_id: contextConformanceReportIdentity(body) };
}
const escape = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/[\\`*_[\]{}|]/g, '\\$&')
    .replace(/[\r\n]+/g, ' ');
export function renderContextConformanceReport(report: ContextConformanceReport): string {
  const lines = [
    '# Context conformance report',
    '',
    `Mode: **${report.mode}**. Scoped result: **${report.acceptance}**.`,
    '',
    `${report.suite.covered_cases}/${report.suite.expected_cases} cases covered: ${report.summary.accepted} accepted, ${report.summary.rejected} rejected, ${report.summary.inconclusive} inconclusive.`,
    '',
    `The broader contract verdict remains unknown in ${report.summary.contract_unknown} cases. External effects are not instrumented.`,
    '',
    `Report identity: \`${report.artifact_id}\``,
    '',
    `Evaluator: \`${report.evaluator.sha256}\``,
    '',
    '| Case | Completion | Scoped result | Contract verdict | Evidence |',
    '| --- | --- | --- | --- | --- |',
  ];
  for (const item of report.cases)
    lines.push(
      `| ${escape(item.case_id)} | ${item.completion} | ${item.acceptance} | ${item.contract_verdict ?? 'unmapped'} | [Record](${item.record_file}) · [Evaluation](${item.evaluation_file}) |`,
    );
  for (const item of report.cases.filter((item) => item.acceptance !== 'accepted')) {
    lines.push(
      '',
      `## ${escape(item.case_id)}`,
      '',
      ...[...item.failures, ...item.unknowns].map((reason) => `- ${escape(reason)}`),
    );
  }
  lines.push('', '## Scope', '', ...report.limitations.map((reason) => `- ${escape(reason)}`), '');
  return lines.join('\n');
}
