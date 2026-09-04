import { existsSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { ClearingsError } from '../model/types.js';
import { gitText } from './git.js';

function physical(path: string): string {
  if (existsSync(path)) return realpathSync(path);
  return resolve(physical(dirname(path)), relative(dirname(path), path));
}

export function writeInventory(repository: string, destination: string, json: string): string {
  const output = physical(resolve(destination));
  const gitDir = gitText(repository, ['rev-parse', '--absolute-git-dir']);
  const commonDir = resolve(repository, gitText(repository, ['rev-parse', '--git-common-dir']));
  const roots = [gitDir, commonDir];
  if (gitText(repository, ['rev-parse', '--is-bare-repository']) === 'false') roots.push(gitText(repository, ['rev-parse', '--show-toplevel']));
  if (roots.some((root) => {
    const rel = relative(physical(root), output);
    return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`));
  })) throw new ClearingsError('OUTPUT_IN_TARGET', 'Output must be outside the target working tree and Git object store.');
  mkdirSync(dirname(output), { recursive: true });
  try { writeFileSync(output, json, { flag: 'wx' }); }
  catch { throw new ClearingsError('OUTPUT_EXISTS', 'Output must be a new writable file.'); }
  return output;
}
