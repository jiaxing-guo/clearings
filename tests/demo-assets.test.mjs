import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';

test('download verification rejects changed, absent, extra, duplicate, and symlink ZIP entries', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'clearings-zip-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const content = 'Reviewed source: 中文\n';
  writeFileSync(join(directory, 'source.txt'), content);
  writeFileSync(
    join(directory, 'SHA256SUMS'),
    createHash('sha256').update(content).digest('hex') + '  source.txt\n',
  );
  const writer = `import pathlib,sys,zipfile,stat
root=pathlib.Path(sys.argv[1]); mode=sys.argv[2]
with zipfile.ZipFile(root/'clearings-shared-review.zip','w') as z:
 z.write(root/'SHA256SUMS','SHA256SUMS')
 if mode!='missing':
  info=zipfile.ZipInfo('source.txt');info.external_attr=(stat.S_IFLNK|0o777)<<16 if mode=='symlink' else (stat.S_IFREG|0o644)<<16
  z.writestr(info,b'wrong' if mode=='changed' else (root/'source.txt').read_bytes())
 if mode=='extra':z.writestr('unreviewed.txt','extra')
 if mode=='duplicate':z.writestr('source.txt',(root/'source.txt').read_bytes())
`;
  const checker = new URL('../scripts/check-review-archive.py', import.meta.url).pathname;
  for (const mode of ['valid', 'changed', 'missing', 'extra', 'duplicate', 'symlink']) {
    execFileSync('python3', ['-c', writer, directory, mode], { stdio: 'pipe' });
    const result = spawnSync('python3', [checker, directory], { encoding: 'utf8' });
    assert.equal(result.status === 0, mode === 'valid', mode + ': ' + result.stderr);
  }
  execFileSync('python3', ['-c', writer, directory, 'valid']);
  writeFileSync(join(directory, 'source.txt'), 'unrecorded change');
  assert.notEqual(spawnSync('python3', [checker, directory]).status, 0);
});
