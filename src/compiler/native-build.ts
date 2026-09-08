import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ClearingsError } from '../model/types.js';
import { sha256 } from '../repository/source.js';

export interface NativeBuildIdentity {
  build_id: string;
  executable_sha256: string;
  platform: string;
  architecture: string;
}
export const nativeExecutable = process.platform === 'win32' ? 'native.exe' : 'native';

function regular(path: string, directory = false): void {
  const stat = lstatSync(path);
  if (
    (directory ? !stat.isDirectory() : !stat.isFile()) ||
    (process.platform !== 'win32' && ((stat.mode & 0o022) !== 0 || stat.uid !== process.getuid?.()))
  )
    throw new Error('Expected an owned path without group or other write permission.');
  if (!directory && stat.size > 64 * 1024 * 1024)
    throw new Error('Native build file exceeds 64 MiB.');
}

/** A local build cache is trusted like the user's installed package, not authenticated native code. */
export function prepareNativeBuild(
  inputs: unknown,
  build: (directory: string) => void,
  cacheDirectory?: string,
): { directory: string; identity: NativeBuildIdentity; verify: () => void; dispose: () => void } {
  const build_id = `native-build:${sha256(JSON.stringify({ inputs, platform: process.platform, architecture: process.arch }))}`;
  const expected = { build_id, platform: process.platform, architecture: process.arch };
  const read = (directory: string): NativeBuildIdentity => {
    regular(directory, true);
    regular(join(directory, 'native.json'));
    regular(join(directory, nativeExecutable));
    const value = JSON.parse(
      readFileSync(join(directory, 'native.json'), 'utf8'),
    ) as NativeBuildIdentity;
    if (
      Object.keys(value).length !== 4 ||
      value.build_id !== expected.build_id ||
      value.platform !== expected.platform ||
      value.architecture !== expected.architecture ||
      value.executable_sha256 !== sha256(readFileSync(join(directory, nativeExecutable)))
    )
      throw new Error('Native executable or build identity differs from its manifest.');
    return value;
  };
  let directory: string | undefined;
  let temporary: string | undefined;
  try {
    if (cacheDirectory !== undefined) {
      if (typeof cacheDirectory !== 'string' || !cacheDirectory.trim())
        throw new Error('Invalid cache directory.');
      const cache = resolve(cacheDirectory);
      mkdirSync(cache, { recursive: true, mode: 0o700 });
      regular(cache, true);
      directory = join(cache, build_id.slice('native-build:'.length));
      if (!lstatSync(directory, { throwIfNoEntry: false }))
        temporary = mkdtempSync(join(cache, '.build-'));
    } else temporary = mkdtempSync(join(tmpdir(), 'clearings-rust-'));
    if (temporary) {
      build(temporary);
      const identity = {
        ...expected,
        executable_sha256: sha256(readFileSync(join(temporary, nativeExecutable))),
      };
      writeFileSync(join(temporary, 'native.json'), JSON.stringify(identity) + '\n', {
        flag: 'wx',
        mode: 0o600,
      });
      if (directory) {
        try {
          renameSync(temporary, directory);
        } catch (error) {
          if (
            !error ||
            typeof error !== 'object' ||
            !('code' in error) ||
            !['EEXIST', 'ENOTEMPTY'].includes(String(error.code))
          )
            throw error;
          // A concurrent builder may have published the same input identity first.
          read(directory);
          rmSync(temporary, { recursive: true, force: true });
        }
      } else directory = temporary;
      temporary = undefined;
    }
    const destination = directory!;
    const identity = read(destination);
    return {
      directory: destination,
      identity,
      verify: () => {
        try {
          const current = read(destination);
          if (current.executable_sha256 !== identity.executable_sha256)
            throw new Error('Prepared executable changed.');
        } catch {
          throw new ClearingsError(
            'RUST_BUILD_INVALID',
            'Prepared native executable is missing, altered, or incompatible.',
            1,
          );
        }
      },
      dispose: () => {
        if (cacheDirectory === undefined) rmSync(destination, { recursive: true, force: true });
      },
    };
  } catch (error) {
    if (temporary) rmSync(temporary, { recursive: true, force: true });
    if (error instanceof ClearingsError) throw error;
    throw new ClearingsError(
      'RUST_BUILD_INVALID',
      'Cannot prepare or verify the local native build. Remove invalid cached entries and prepare again.',
      1,
    );
  }
}
