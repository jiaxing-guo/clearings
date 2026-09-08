import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

export const controlSource = readFileSync(
  new URL('../fixtures/conformance/positive-control.mjs', import.meta.url),
  'utf8',
);
export const faults = JSON.parse(
  readFileSync(new URL('../fixtures/conformance/faults.json', import.meta.url), 'utf8'),
);
export function faultSource(fault) {
  const find =
    fault.find ??
    '// Mutations used by the separate fault manifest are inserted before accounting.';
  assert.equal(
    controlSource.split(find).length,
    2,
    `Fault ${fault.id} must have exactly one mutation site`,
  );
  return controlSource.replace(find, fault.replace ?? fault.insert);
}
export function candidateCheckout(source) {
  const root = mkdtempSync(join(tmpdir(), 'clearings-conformance-control-'));
  const dispose = () => rmSync(root, { recursive: true, force: true });
  try {
    for (const directory of ['src/specification', 'dist/specification'])
      mkdirSync(join(root, directory), { recursive: true });
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({ name: 'clearings-conformance-control', type: 'module' }),
    );
    writeFileSync(
      join(root, 'package-lock.json'),
      JSON.stringify({ name: 'clearings-conformance-control', lockfileVersion: 3, packages: {} }),
    );
    writeFileSync(join(root, 'src/specification/context.ts'), source);
    writeFileSync(join(root, 'dist/specification/context.js'), source);
    execFileSync('git', ['init', '--quiet', root]);
    execFileSync('git', ['add', '.'], { cwd: root });
    execFileSync(
      'git',
      [
        '-c',
        'user.name=Conformance control',
        '-c',
        'user.email=conformance@example.invalid',
        '-c',
        'commit.gpgsign=false',
        'commit',
        '--quiet',
        '-m',
        'test: define executable conformance control',
      ],
      { cwd: root },
    );
    return { root, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
