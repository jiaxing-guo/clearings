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
    settings = temp / 'settings.json'
    settings.write_text('{}')
    project = run('project-configure', '--root', temp, '--name', 'Package check', '--settings', settings)['id']
    def scoped(*args):
        return run('--project', project, *args)
    folder = package / 'examples' / 'normalize-contacts'
    name = json.loads((folder / 'task.json').read_text())['contract']['name']
    scoped('prepare-task', folder / 'task.json')
    saved = scoped('save', name, '--source', folder / 'routine.ts')
    assert saved['accepted'] is True
    assert scoped('reuse', name, '--input', folder / 'input.json')['run']['outcome']['status'] == 'completed'
    assert len(scoped('discover')['routines']) == 1
    scoped('manage', name, 'pause')
    assert scoped('routine', name)['controls']['paused'] is True
    scoped('manage', name, 'resume')
    assert scoped('model-usage')['connection'] is None
    assert scoped('background', '--once')['status'] == 'disabled'
    scoped('manage', name, 'retire', '--expected-active', saved['version'])
    assert scoped('routine', name)['controls']['excluded'] is True
    # Clients copy only the plugin directory into their own cache. Exercise that
    # copy with an unrelated process cwd and no tools or download on PATH.
    import shutil
    for index, relative in enumerate(['plugins/clearings', 'integrations/claude-code/plugins/clearings']):
        plugin = temp / f'client cache {index}'
        shutil.copytree(package / relative, plugin)
        assert (plugin / 'licenses').is_dir()
        project_root = temp / f'working project {index}'
        project_root.mkdir()
        hook = subprocess.run(['/bin/sh', str(plugin / 'scripts/start.sh'), '--register-session', '--data-dir', str(temp / 'plugin state')],
                              cwd=plugin, env=environment, input=json.dumps({'hook_event_name': 'SessionStart', 'cwd': str(project_root)}),
                              text=True, capture_output=True, timeout=30)
        assert hook.returncode == 0, hook.stderr
        assert hook.stdout == ''
        messages = [
            {'jsonrpc': '2.0', 'id': 1, 'method': 'initialize', 'params': {'protocolVersion': '2025-06-18', 'capabilities': {}, 'clientInfo': {'name': 'package-check', 'version': '1'}}},
            {'jsonrpc': '2.0', 'method': 'notifications/initialized'},
            {'jsonrpc': '2.0', 'id': 2, 'method': 'tools/call', 'params': {'name': 'clearings_open_project', 'arguments': {'path': str(project_root)}}},
            {'jsonrpc': '2.0', 'id': 3, 'method': 'tools/call', 'params': {'name': 'clearings_discover', 'arguments': {}}},
        ]
        result = subprocess.run(['/bin/sh', str(plugin / 'scripts/start.sh'), '--data-dir', str(temp / 'plugin state')],
                                cwd=plugin, env=environment, input=''.join(json.dumps(m) + '\n' for m in messages),
                                text=True, capture_output=True, timeout=30)
        assert result.returncode == 0, result.stderr
        replies = [json.loads(line) for line in result.stdout.splitlines()]
        selected = replies[1]['result']['structuredContent']['project']
        assert selected['root'] == str(project_root.resolve())
        assert selected['settings']['grants']['roots']['repo'] == selected['root']
        assert replies[2]['result']['structuredContent']['routines'] == []
print('Packaged binary and both cached plugins: teaching, fresh reuse, handoff, project controls, automatic binding and private state, empty PATH.')
