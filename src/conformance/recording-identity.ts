import { lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { sha256 } from '../repository/source.js';
import { canonical } from '../repository/inventory.js';
import type { ExecutionRecord } from './model.js';
import type { NativeProgramBinding } from './model.js';
import { validateProgram } from '../program/validate.js';

/** Bind stage program identities to bytes read before candidate execution. */
export function nativeProgramBindings(
  root: string,
  files: { path: string; sha256: string }[],
): NativeProgramBinding[] {
  return (['closure', 'selection'] as const).map((stage) => {
    const path = `programs/clearings/${stage === 'closure' ? 'required-dependency-closure' : 'context-selection'}.json`;
    try {
      const bytes = readFileSync(join(root, path)),
        hash = sha256(bytes),
        program = JSON.parse(bytes.toString('utf8'));
      validateProgram(program);
      if (!files.some((file) => file.path === path && file.sha256 === hash))
        throw new Error('Program changed after manifest capture.');
      return { stage, status: 'bound', path, sha256: hash, program_id: program.artifact_id };
    } catch {
      return {
        stage,
        status: 'unavailable',
        reason: `No validated, manifest-bound ${stage} program was available.`,
      };
    }
  });
}

/** A conservative file-set manifest, not compiler provenance or a dynamic import proof. */
export function componentFiles(root: string): { path: string; sha256: string }[] {
  const paths = ['package.json', 'package-lock.json'];
  function checkDirectory(path: string): boolean {
    const stat = lstatSync(join(root, path), { throwIfNoEntry: false });
    if (stat && !stat.isDirectory())
      throw new Error(`Expected a regular component directory: ${path}`);
    return stat !== undefined;
  }
  function walk(path: string): void {
    if (!checkDirectory(path)) return;
    for (const entry of readdirSync(join(root, path), { withFileTypes: true })) {
      const child = `${path}/${entry.name}`;
      if (entry.isSymbolicLink())
        throw new Error(`Component manifests require regular files: ${child}`);
      if (entry.isDirectory()) walk(child);
      else if (/\.(?:ts|js|json|rs|toml|lock)$/.test(child) && !child.endsWith('.d.ts'))
        paths.push(child);
    }
  }
  for (const directory of ['src', 'dist', 'schemas', 'programs']) walk(directory);
  if (
    ['specifications', 'specifications/clearings', 'specifications/clearings/conformance'].every(
      checkDirectory,
    )
  ) {
    for (const name of ['profile', 'specification', 'suite']) {
      const path = `specifications/clearings/conformance/${name}.json`;
      if (lstatSync(join(root, path), { throwIfNoEntry: false })) paths.push(path);
    }
  }
  if (['runtime', 'runtime/rust'].every(checkDirectory)) {
    for (const path of ['runtime/rust/src', 'runtime/rust/runner']) walk(path);
    for (const path of [
      'runtime/rust/Cargo.toml',
      'runtime/rust/Cargo.lock',
      'runtime/rust/rust-toolchain.toml',
    ])
      if (lstatSync(join(root, path), { throwIfNoEntry: false })) paths.push(path);
  }
  for (const path of ['src/specification/context.ts', 'dist/specification/context.js'])
    if (!paths.includes(path)) throw new Error(`Missing context-assembly component file: ${path}`);
  return paths.sort().map((path) => {
    if (!lstatSync(join(root, path)).isFile())
      throw new Error(`Expected a regular component file: ${path}`);
    return { path, sha256: sha256(readFileSync(join(root, path))) };
  });
}
export function implementationIdentity(
  root: string,
  repository: string,
): ExecutionRecord['identities']['implementation'] {
  const top = execFileSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 5000,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  if (realpathSync(top) !== root)
    throw new Error('Implementation root must be the Git working-tree root.');
  const git = (ref: string) =>
    execFileSync('git', ['rev-parse', '--verify', ref], {
      cwd: root,
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  return {
    repository,
    commit: git('HEAD'),
    tree: git('HEAD^{tree}'),
    module: 'src/specification/context.ts',
    export: 'assembleContext',
    files: componentFiles(root),
  };
}
export const componentDigest = (root: string): string => sha256(canonical(componentFiles(root)));
