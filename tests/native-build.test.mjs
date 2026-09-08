import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareNativeBuild, nativeExecutable } from '../dist/compiler/native-build.js';

test(
  'new builds normalize group-writable compiler output while existing cache permissions remain enforced',
  { skip: process.platform === 'win32' },
  (t) => {
    const cache = mkdtempSync(join(tmpdir(), 'clearings-build-permissions-'));
    t.after(() => rmSync(cache, { recursive: true, force: true }));
    const previous = process.umask(0o002);
    try {
      const build = (directory) => {
        const executable = join(directory, nativeExecutable);
        // Reproduce the file-creation mode inherited by rustc under a common shared-group umask.
        writeFileSync(executable, 'generated executable fixture', { mode: 0o777 });
        assert.equal(statSync(executable).mode & 0o777, 0o775);
      };
      for (const cacheDirectory of [undefined, cache]) {
        const prepared = prepareNativeBuild('permission-test', build, cacheDirectory);
        const executable = join(prepared.directory, nativeExecutable);
        assert.equal(statSync(executable).mode & 0o777, 0o700);
        prepared.verify();
        if (cacheDirectory) {
          const warm = prepareNativeBuild(
            'permission-test',
            () => assert.fail('Unexpected rebuild'),
            cacheDirectory,
          );
          warm.verify();
          warm.dispose();
          chmodSync(executable, 0o775);
          assert.throws(() => prepared.verify(), { code: 'RUST_BUILD_INVALID' });
          assert.throws(() => prepareNativeBuild('permission-test', build, cacheDirectory), {
            code: 'RUST_BUILD_INVALID',
          });
          assert.equal(
            statSync(executable).mode & 0o777,
            0o775,
            'Existing cache is not silently repaired',
          );
        }
        prepared.dispose();
        assert.equal(existsSync(prepared.directory), cacheDirectory !== undefined);
      }
    } finally {
      process.umask(previous);
    }
  },
);

test(
  'failed fresh builds remove staging files without following a generated symlink',
  { skip: process.platform === 'win32' },
  (t) => {
    const root = mkdtempSync(join(tmpdir(), 'clearings-build-symlink-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const target = join(root, 'external');
    writeFileSync(target, 'retained');
    chmodSync(target, 0o644);
    for (const cacheDirectory of [undefined, join(root, 'cache')]) {
      let directory;
      assert.throws(
        () =>
          prepareNativeBuild(
            'symlink-test',
            (path) => {
              directory = path;
              symlinkSync(target, join(path, nativeExecutable));
            },
            cacheDirectory,
          ),
        { code: 'RUST_BUILD_INVALID' },
      );
      assert(!existsSync(directory));
      assert.equal(statSync(target).mode & 0o777, 0o644);
      if (cacheDirectory) assert.deepEqual(readdirSync(cacheDirectory), []);
    }
  },
);
