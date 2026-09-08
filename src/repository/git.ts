import { execFileSync } from 'node:child_process';
import { ClearingsError } from '../model/types.js';

// Git configuration can redirect object access. Keep inherited repository-specific
// environment out of subprocesses; never invoke a shell or a target's scripts.
export function git(repository: string, args: string[], network = false): Buffer {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')),
  );
  Object.assign(env, {
    GIT_TERMINAL_PROMPT: '0',
    GIT_OPTIONAL_LOCKS: '0',
    GIT_NO_REPLACE_OBJECTS: '1',
    GIT_NO_LAZY_FETCH: '1',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
  });
  try {
    return execFileSync(
      'git',
      [
        '-c',
        'core.hooksPath=/dev/null',
        '-c',
        'core.fsmonitor=false',
        '-c',
        'protocol.ext.allow=never',
        '-c',
        'protocol.file.allow=never',
        '-C',
        repository,
        ...args,
      ],
      {
        env,
        maxBuffer: 64 * 1024 * 1024,
        timeout: network ? 120_000 : 30_000,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
  } catch {
    // Avoid echoing credentials, config, or arbitrary source-controlled stderr.
    throw new ClearingsError(
      'GIT_FAILED',
      `Git ${args[0] ?? 'operation'} failed. Check repository, revision, available objects, and Git installation.`,
      1,
    );
  }
}

export function gitText(repository: string, args: string[]): string {
  return git(repository, args).toString('utf8').trim();
}

export function resolveSnapshot(repository: string, ref: string) {
  if (!ref || ref.includes('\0') || ref.startsWith('-')) {
    throw new ClearingsError(
      'INVALID_REF',
      'Provide a nonempty Git revision that does not start with a dash.',
    );
  }
  const commit_sha = gitText(repository, [
    'rev-parse',
    '--verify',
    '--end-of-options',
    `${ref}^{commit}`,
  ]);
  const tree_sha = gitText(repository, ['rev-parse', '--verify', `${commit_sha}^{tree}`]);
  const object_format = gitText(repository, ['rev-parse', '--show-object-format']);
  if (
    !['sha1', 'sha256'].includes(object_format) ||
    ![commit_sha, tree_sha].every((id) =>
      new RegExp(`^[a-f0-9]{${object_format === 'sha1' ? 40 : 64}}$`).test(id),
    )
  ) {
    throw new ClearingsError('UNSUPPORTED_OBJECT_FORMAT', 'Unsupported Git object format.', 1);
  }
  return {
    mode: 'git-commit' as const,
    object_format: object_format as 'sha1' | 'sha256',
    commit_sha,
    tree_sha,
  };
}
