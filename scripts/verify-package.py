#!/usr/bin/env python3
"""Exercise the packaged product with no interpreter or compiler on its PATH."""
import json
import subprocess
import sys
import tempfile
from pathlib import Path

package = Path(sys.argv[1]).resolve()
binary = package / 'clearings'
with tempfile.TemporaryDirectory() as temporary:
    temp = Path(temporary)
    empty = temp / 'empty-path'
    empty.mkdir()
    environment = {'PATH': str(empty)}
    store = temp / 'state.db'
    def run(*args):
        result = subprocess.run([str(binary), '--store', str(store), *map(str, args)], cwd=package, env=environment, text=True, capture_output=True, timeout=30)
        if result.returncode:
            raise RuntimeError(result.stderr + result.stdout)
        return json.loads(result.stdout)
    for name in ['repository-context', 'group-logs', 'normalize-contacts']:
        folder = package / 'examples' / name
        task = run('prepare-task', folder / 'task.json')['task']
        version = run('submit', '--task', task, '--source', folder / 'routine.ts')['version']
        assert run('evaluate', version)['accepted'] is True
        run('activate', version)
        first = run('run', task, '--input', folder / 'input.json', '--policy', folder / 'policy.json')
        assert first['run']['outcome']['status'] == 'completed', first
        assert first['run']['model_usage'] is None
        if name == 'repository-context':
            path = folder / 'data' / 'README.md'
            original = path.read_bytes()
            try:
                path.write_text('Fresh data after activation')
                second = run('run', task, '--input', folder / 'input.json', '--policy', folder / 'policy.json')
                assert second['run']['outcome']['output'][0]['text'] == 'Fresh data after activation'
                assert second['run']['capability_calls'] == 2
            finally:
                path.write_bytes(original)
        if name == 'group-logs':
            path = folder / 'data' / 'sample.jsonl'
            original = path.read_bytes()
            try:
                row = {'level': 'warn', 'message': '__proto__'}
                path.write_text(json.dumps(row) + '\n' + json.dumps(row) + '\n')
                second = run('run', task, '--input', folder / 'input.json', '--policy', folder / 'policy.json')
                assert second['run']['outcome']['output'] == [{**row, 'count': 2}]
            finally:
                path.write_bytes(original)
        if name == 'normalize-contacts':
            new_input = temp / 'contacts.json'
            new_input.write_text(json.dumps({'rows': [{'name': ' Zoe ', 'email': 'Z@EXAMPLE.COM'}, {'name': 'Second', 'email': 'z@example.com'}]}))
            second = run('run', task, '--input', new_input, '--policy', folder / 'policy.json')
            assert second['run']['outcome']['output'] == [{'name': 'Zoe', 'email': 'z@example.com'}]
            new_input.write_text('{"rows":[{}]}')
            handoff = run('run', task, '--input', new_input, '--policy', folder / 'policy.json')
            assert handoff['run']['outcome']['status'] == 'needs_agent'
    assert len(run('list')['tasks']) == 3
    assert len(run('runs')['runs']) == 7
print('Packaged binary: 3 taught routines, 7 fresh executions, explicit handoff, empty PATH.')
