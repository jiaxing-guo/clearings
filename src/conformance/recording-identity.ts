import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { sha256 } from '../repository/source.js';
import { canonical } from '../repository/inventory.js';
import type { ExecutionRecord } from './model.js';

/** A conservative file-set manifest, not compiler provenance or a dynamic import proof. */
export function componentFiles(root: string): { path: string; sha256: string }[] {
  const paths = ['package.json', 'package-lock.json'];
  function walk(path: string): void {
    for (const entry of readdirSync(join(root, path), { withFileTypes: true })) {
      const child = `${path}/${entry.name}`;
      if (entry.isSymbolicLink()) throw new Error(`Component manifests require regular files: ${child}`);
      if (entry.isDirectory()) walk(child);
      else if (/\.(?:ts|js|json)$/.test(child) && !child.endsWith('.d.ts')) paths.push(child);
    }
  }
  for (const directory of ['src', 'dist', 'schemas']) if (existsSync(join(root, directory))) walk(directory);
  for (const name of ['profile', 'specification']) {
    const path = `specifications/clearings/conformance/${name}.json`;
    if (existsSync(join(root, path))) paths.push(path);
  }
  for (const path of ['src/specification/context.ts', 'dist/specification/context.js']) if (!paths.includes(path)) throw new Error(`Missing context-assembly component file: ${path}`);
  return paths.sort().map(path => {
    if (!lstatSync(join(root, path)).isFile()) throw new Error(`Expected a regular component file: ${path}`);
    return { path, sha256: sha256(readFileSync(join(root, path))) };
  });
}
export function implementationIdentity(root: string, repository: string): ExecutionRecord['identities']['implementation'] {
  const top = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: root, encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  if (realpathSync(top) !== root) throw new Error('Implementation root must be the Git working-tree root.');
  const git = (ref: string) => execFileSync('git', ['rev-parse', '--verify', ref], { cwd: root, encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  return { repository, commit: git('HEAD'), tree: git('HEAD^{tree}'), module: 'src/specification/context.ts', export: 'assembleContext', files: componentFiles(root) };
}
export const componentDigest = (root: string): string => sha256(canonical(componentFiles(root)));
