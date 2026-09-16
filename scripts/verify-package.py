#!/usr/bin/env python3
"""Exercise the packaged product with no interpreter or compiler on its PATH."""

import json
import subprocess
import sys
import tempfile
from pathlib import Path

package = Path(sys.argv[1]).resolve()
binary = package / 'clearings'
codex_plugin = package / 'plugins/clearings'
claude_plugin = package / 'integrations/claude-code/plugins/clearings'
version = json.loads((codex_plugin / '.codex-plugin/plugin.json').read_text())['version']
assert json.loads((claude_plugin / '.claude-plugin/plugin.json').read_text())['version'] == version
assert (
    json.loads((package / '.claude-plugin/marketplace.json').read_text())['plugins'][0]['version']
    == version
)
for plugin in (codex_plugin, claude_plugin):
    assert (plugin / 'runtime-version').read_text().strip() == 'v' + version
    assert {p.name for p in (plugin / 'skills').iterdir()} == {
        'reuse-work',
        'learn-from-conversations',
        'manage-clearings',
    }
with tempfile.TemporaryDirectory() as temporary:
    temp = Path(temporary)
    empty = temp / 'empty-path'
    empty.mkdir()
    environment = {'PATH': str(empty)}
    store = temp / 'state.db'

    def run(*args):
        result = subprocess.run(
            [str(binary), '--store', str(store), *map(str, args)],
            cwd=package,
            env=environment,
            text=True,
            capture_output=True,
            timeout=30,
        )
        if result.returncode:
            raise RuntimeError(result.stderr + result.stdout)
        return json.loads(result.stdout)

    for name in ['repository-context', 'group-logs', 'normalize-contacts']:
        folder = package / 'examples' / name
        task = run('prepare-task', folder / 'task.json')['task']
        version = run('submit', '--task', task, '--source', folder / 'routine.ts')['version']
        assert run('evaluate', version)['accepted'] is True
        run('activate', version)
        first = run(
            'run', task, '--input', folder / 'input.json', '--policy', folder / 'policy.json'
        )
        assert first['run']['outcome']['status'] == 'completed', first
        assert first['run']['model_usage'] is None
        if name == 'repository-context':
            path = folder / 'data' / 'README.md'
            original = path.read_bytes()
            try:
                path.write_text('Fresh data after activation')
                second = run(
                    'run',
                    task,
                    '--input',
                    folder / 'input.json',
                    '--policy',
                    folder / 'policy.json',
                )
                assert (
                    second['run']['outcome']['output'][0]['text'] == 'Fresh data after activation'
                )
                assert second['run']['capability_calls'] == 2
            finally:
                path.write_bytes(original)
        if name == 'group-logs':
            path = folder / 'data' / 'sample.jsonl'
            original = path.read_bytes()
            try:
                row = {'level': 'warn', 'message': '__proto__'}
                path.write_text(json.dumps(row) + '\n' + json.dumps(row) + '\n')
                second = run(
                    'run',
                    task,
                    '--input',
                    folder / 'input.json',
                    '--policy',
                    folder / 'policy.json',
                )
                assert second['run']['outcome']['output'] == [{**row, 'count': 2}]
            finally:
                path.write_bytes(original)
        if name == 'normalize-contacts':
            new_input = temp / 'contacts.json'
            new_input.write_text(
                json.dumps(
                    {
                        'rows': [
                            {'name': ' Zoe ', 'email': 'Z@EXAMPLE.COM'},
                            {'name': 'Second', 'email': 'z@example.com'},
                        ]
                    }
                )
            )
            second = run('run', task, '--input', new_input, '--policy', folder / 'policy.json')
            assert second['run']['outcome']['output'] == [{'name': 'Zoe', 'email': 'z@example.com'}]
            new_input.write_text('{"rows":[{}]}')
            handoff = run('run', task, '--input', new_input, '--policy', folder / 'policy.json')
            assert handoff['run']['outcome']['status'] == 'needs_agent'
    assert len(run('list')['tasks']) == 3
    assert len(run('runs')['runs']) == 7
    settings = temp / 'settings.json'
    settings.write_text('{}')
    project = run(
        'project-configure', '--root', temp, '--name', 'Package check', '--settings', settings
    )['id']

    def scoped(*args):
        return run('--project', project, *args)

    folder = package / 'examples' / 'normalize-contacts'
    name = json.loads((folder / 'task.json').read_text())['contract']['name']
    scoped('prepare-task', folder / 'task.json')
    saved = scoped('save', name, '--source', folder / 'routine.ts')
    assert saved['accepted'] is True
    assert (
        scoped('reuse', name, '--input', folder / 'input.json')['run']['outcome']['status']
        == 'completed'
    )
    assert len(scoped('discover')['routines']) == 1
    scoped('manage', name, 'pause')
    assert scoped('routine', name)['controls']['paused'] is True
    scoped('manage', name, 'resume')
    assert scoped('model-usage')['connection'] is None
    assert scoped('background', '--once')['status'] == 'disabled'
    scoped('manage', name, 'retire', '--expected-active', saved['version'])
    assert scoped('routine', name)['controls']['excluded'] is True
    # The ordinary standalone interface needs no store/project IDs or policy file.
    default_project = temp / 'default project'
    default_project.mkdir()
    default_data = temp / 'default state'
    default_env = {
        'PATH': str(empty),
        'HOME': str(temp / 'isolated home'),
        'CLEARINGS_DATA_DIR': str(default_data),
    }
    Path(default_env['HOME']).mkdir()

    def ordinary(*args, cwd=default_project):
        result = subprocess.run(
            [str(binary), *map(str, args)],
            cwd=cwd,
            env=default_env,
            text=True,
            capture_output=True,
            timeout=30,
        )
        if result.returncode:
            raise RuntimeError(result.stderr + result.stdout)
        return json.loads(result.stdout)

    defaults = ordinary('learning-status')['preferences']
    assert defaults['learning_enabled'] and defaults['interval_seconds'] == 86400
    assert defaults['lookback_days'] == 7 and defaults['max_requests_per_day'] == 6
    ordinary('install', '--no-service', '--no-client')
    ordinary('learning-schedule', 'weekly')
    ordinary('pause-learning')
    assert ordinary('learning-status')['preferences']['learning_enabled'] is False
    folder = package / 'examples/normalize-contacts'
    task = ordinary('prepare-task', folder / 'task.json')['task']
    saved = ordinary('save', 'normalize-contacts', '--source', folder / 'routine.ts')
    assert saved['accepted']
    ordinary(
        'share-routine',
        'normalize-contacts',
        '--applicability',
        'Normalize contacts by email, trim names, preserve the first duplicate',
    )
    # A second project must discover the same definition and execute fresh input.
    receiving = temp / 'receiving project'
    receiving.mkdir()
    fresh = temp / 'fresh-contact.json'
    fresh.write_text(
        json.dumps(
            {
                'rows': [
                    {'name': ' Mia ', 'email': 'M@EXAMPLE.COM'},
                    {'name': 'Duplicate', 'email': 'm@example.com'},
                ]
            }
        )
    )
    found = ordinary('find-routines', 'normalize contacts email duplicates', cwd=receiving)[
        'routines'
    ]
    assert found[0]['routine'] == task
    assert ordinary('run-routine', task, '--input', fresh, cwd=receiving)['run']['outcome'][
        'output'
    ] == [{'name': 'Mia', 'email': 'm@example.com'}]
    assert ordinary('library-routine', task, cwd=receiving)['usage']['windows']['7']['calls'] == 1
    assert (
        ordinary('find-routines', 'photosynthesis chloroplast sunlight', cwd=receiving)['routines']
        == []
    )
    ordinary('pause-shared', task, cwd=receiving)
    assert ordinary('find-routines', 'normalize contacts', cwd=receiving)['routines'] == []
    ordinary('pause-shared', task, '--resume', cwd=receiving)
    ordinary('resume-learning')
    assert ordinary('learning-status')['preferences']['interval_seconds'] == 604800
    assert not list(Path(default_env['HOME']).glob('Library/LaunchAgents/*'))
    assert not list(Path(default_env['HOME']).glob('.config/systemd/user/*'))
    # Clients copy only the plugin directory into their own cache. Exercise that
    # copy with an unrelated process cwd and no tools or download on PATH.
    import shutil

    for index, relative in enumerate(
        ['plugins/clearings', 'integrations/claude-code/plugins/clearings']
    ):
        plugin = temp / f'client cache {index}'
        shutil.copytree(package / relative, plugin)
        assert (plugin / 'licenses').is_dir()
        project_root = temp / f'working project {index}'
        project_root.mkdir()
        hook = subprocess.run(
            [
                '/bin/sh',
                str(plugin / 'scripts/start.sh'),
                '--register-session',
                '--data-dir',
                str(temp / 'plugin state'),
            ],
            cwd=plugin,
            env=environment,
            input=json.dumps({'hook_event_name': 'SessionStart', 'cwd': str(project_root)}),
            text=True,
            capture_output=True,
            timeout=30,
        )
        assert hook.returncode == 0, hook.stderr
        assert hook.stdout == ''
        messages = [
            {
                'jsonrpc': '2.0',
                'id': 1,
                'method': 'initialize',
                'params': {
                    'protocolVersion': '2025-06-18',
                    'capabilities': {},
                    'clientInfo': {'name': 'package-check', 'version': '1'},
                },
            },
            {'jsonrpc': '2.0', 'method': 'notifications/initialized'},
            {
                'jsonrpc': '2.0',
                'id': 2,
                'method': 'tools/call',
                'params': {
                    'name': 'clearings_open_project',
                    'arguments': {'path': str(project_root)},
                },
            },
            {
                'jsonrpc': '2.0',
                'id': 3,
                'method': 'tools/call',
                'params': {'name': 'clearings_discover', 'arguments': {}},
            },
        ]
        result = subprocess.run(
            ['/bin/sh', str(plugin / 'scripts/start.sh'), '--data-dir', str(temp / 'plugin state')],
            cwd=plugin,
            env=environment,
            input=''.join(json.dumps(m) + '\n' for m in messages),
            text=True,
            capture_output=True,
            timeout=30,
        )
        assert result.returncode == 0, result.stderr
        replies = [json.loads(line) for line in result.stdout.splitlines()]
        selected = replies[1]['result']['structuredContent']['project']
        assert selected['root'] == str(project_root.resolve())
        assert selected['settings']['grants']['roots']['repo'] == selected['root']
        assert replies[2]['result']['structuredContent']['routines'] == []
print(
    'Packaged binary and both cached plugins: default controls, cross-project fresh reuse, usage, handoff, project isolation, version pins and all three skills; empty PATH.'
)
