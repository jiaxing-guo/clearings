"""Verify captured evidence and package the completed run. Does not rerun coding."""
from pathlib import Path
import collections
import datetime
import hashlib
import json
import re
import subprocess
import sys
import zipfile

run = Path(__file__).resolve().parent
repo = run.parents[2]
evaluation_workspace = Path(sys.argv[1]).resolve()
read = lambda path: json.loads(path.read_text())
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
write = lambda path, value: path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n')
freeze = read(run / 'freeze.json')
capture = read(run / 'submission/capture.json')
baseline = read(run / 'frozen/source-files.json')
initial = read(run / 'results/evaluated/evaluation.json')
trace = [json.loads(line) for line in (run / 'submission/trace/activity.jsonl').read_text().splitlines()]

assert sha(run / 'freeze.json') == capture['freeze_sha256']
for name, metadata in freeze['files'].items():
    assert sha(run / name) == metadata['sha256'], f'Frozen file changed: {name}'
for name, metadata in capture['files'].items():
    assert sha(run / 'submission' / name) == metadata['sha256'], f'Submission changed: {name}'
    assert sha(evaluation_workspace / name) == metadata['sha256'], f'Evaluated candidate changed: {name}'
assert sha(run / 'submission/candidate.patch') == capture['patch_sha256']
for name, metadata in baseline.items():
    assert sha(repo / name) == metadata['sha256'], f'Main snapshot changed during experiment: {name}'
    if name not in capture['files']:
        assert sha(evaluation_workspace / name) == metadata['sha256'], f'Evaluation baseline changed: {name}'
assert not (repo / 'src/specification/impact.ts').exists(), 'Candidate was integrated into main source'
for entry in trace:
    assert sha(run / 'submission/trace' / entry['output_file']) == entry['output_sha256']
for command in initial['commands']:
    assert sha(run / 'results/evaluated' / (command['label'] + '.log')) == command['log_sha256']

check = subprocess.run(['git', 'apply', '--check', str(run / 'submission/candidate.patch')], cwd=repo, capture_output=True, text=True)
assert check.returncode == 0, check.stderr
rerun_path = run / 'results/evaluated/integration-claim-review-rerun.log'
rerun = rerun_path.read_text()
counts = {key: int(re.search(r'^# ' + key + r' (\d+)', rerun, re.M)[1]) for key in ['tests', 'pass', 'fail']}
assert counts == {'tests': 2, 'pass': 2, 'fail': 0}
feature = next(command for command in initial['commands'] if command['label'] == 'withheld-tests')
regression = next(command for command in initial['commands'] if command['label'] == 'integration-tests')
assert (feature['tests'], feature['passed'], feature['failed']) == (20, 20, 0)
assert (regression['tests'], regression['passed'], regression['failed']) == (72, 71, 1)
accesses = {name: metadata for entry in trace if entry['action'] == 'read' for name, metadata in entry['details'].items()}
trace_summary = {
    'recorded_events': len(trace), 'actions': dict(collections.Counter(entry['action'] for entry in trace)),
    'unique_read_files': len(accesses), 'unique_read_bytes': sum(metadata['bytes'] for metadata in accesses.values()),
    'read_files': accesses, 'first_recorded_action': trace[0]['start'], 'last_recorded_action': trace[-1]['end'],
    'recorded_action_interval_seconds': (datetime.datetime.fromisoformat(trace[-1]['end']) - datetime.datetime.fromisoformat(trace[0]['start'])).total_seconds(),
    'complete_tool_access_audit': False, 'native_token_usage': None,
    'own_test_files_submitted': 0, 'own_npm_test_count': 0,
    'own_manual_checks': {'passed': 1, 'invalid_fixture_setup': 2, 'error_assertions_require_exceptions': False},
    'commands': [{key: entry[key] for key in ['start', 'end', 'args', 'status', 'output_file']} for entry in trace if entry['action'] == 'run'],
}
write(run / 'results/trace-summary.json', trace_summary)
summary = {
    'run_id': freeze['run_id'], 'recorded_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'outcome': 'pass-feature-checks-and-regressions-after-evaluator-setup-correction',
    'coding_attempts': 1, 'candidate_repaired': False, 'candidate_integrated': False,
    'requested_model': 'gpt-5.6-luna', 'fork_turns': 'none', 'verified_backend_model_revision': None, 'native_token_usage': None,
    'feature_tests': {'candidate_facing_passed': 19, 'candidate_facing_total': 19, 'oracle_only_self_check_passed': 1, 'generated_queries': 160, 'generated_graphs': 80, 'deep_chain_operations': 350},
    'build': 'pass', 'typecheck': 'pass',
    'regression_tests': {'initial_passed': 71, 'initial_test_file_load_errors': 1, 'targeted_rerun_passed': 2, 'distinct_tests_passed_across_runs': 73, 'single_uninterrupted_full_suite_pass_claimed': False},
    'setup_correction': 'results/evaluation-setup-correction.json',
    'targeted_rerun': {'log': 'results/evaluated/integration-claim-review-rerun.log', 'sha256': sha(rerun_path), 'tap_counts': counts},
    'original_evaluation_outcome_preserved': initial['outcome'],
    'baseline_without_feature': {'candidate_facing_failed': 19, 'oracle_only_passed': 1},
    'frozen_files_verified': len(freeze['files']), 'main_snapshot_files_unchanged': len(baseline),
    'patch_applies_to_main_working_tree': True, 'freeze_sha256': sha(run / 'freeze.json'), 'candidate_patch_sha256': sha(run / 'submission/candidate.patch'),
    'supplementary_typed_check': {'scored_as_frozen_test': False, 'verdict': 'unknown', 'passed_checks': 11, 'opaque_rules': 8, 'executable_rule_predicates': 8, 'total_rule_records': 16, 'adapter_verified_by_kernel': False, 'instrumented_effect_trace': False},
    'test_independence': 'Orchestrator authored before coding; withheld from coder. Not independent human review.',
    'limitations': ['One task and one initial submission.', 'No prose-only control or model comparison.', 'Agent used prose, API mapping, project documentation, and library source as well as typed records.', 'Eight opaque rules; executable predicates can cover less than their English descriptions.', 'Protocol workspace separation; no OS isolation or complete independent tool-access audit.', 'Own npm test ran zero tests and both own graph fixtures failed during setup.'],
}
write(run / 'results/summary.json', summary)
excluded = {'clearings-luna-experiment.zip', 'MANIFEST.json'}
files = sorted(path for path in run.rglob('*') if path.is_file() and path.relative_to(run).parts[0] not in {'replay', 'replay-results'} and path.name not in excluded)
manifest = {path.relative_to(run).as_posix(): {'sha256': sha(path), 'bytes': path.stat().st_size} for path in files}
write(run / 'MANIFEST.json', {'scope': 'Post-run package contents; this does not replace the preregistered freeze.', 'files': manifest})
files.append(run / 'MANIFEST.json')
archive = run / 'clearings-luna-experiment.zip'
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as package:
    for path in sorted(files):
        item = zipfile.ZipInfo(path.relative_to(run).as_posix(), (2026, 9, 6, 0, 0, 0))
        item.compress_type = zipfile.ZIP_DEFLATED
        item.external_attr = 0o100644 << 16
        package.writestr(item, path.read_bytes())
with zipfile.ZipFile(archive) as package:
    assert package.testzip() is None
    for name, metadata in manifest.items():
        assert hashlib.sha256(package.read(name)).hexdigest() == metadata['sha256']
print(json.dumps({'summary': summary, 'package_files': len(files), 'package_bytes': archive.stat().st_size, 'package_sha256': sha(archive)}, indent=2))
