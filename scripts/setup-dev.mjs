import { run } from './checks.mjs';

run('npm', ['--prefix', 'website', 'ci', '--ignore-scripts']);
run('python3', ['-m', 'venv', '.venv-tools']);
run('.venv-tools/bin/python', [
  '-m',
  'pip',
  'install',
  '--disable-pip-version-check',
  '-r',
  'requirements-dev.txt',
]);
run(process.execPath, ['node_modules/husky/bin.js']);
console.log('Developer checks and Git hooks are ready.');
