import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ESLint } from 'eslint';
import * as prettier from 'prettier';

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env: { ...process.env, CARGO_NET_OFFLINE: 'true', RUSTUP_AUTO_INSTALL: '0' },
    ...options,
  });
  if (result.error) {
    throw new Error(
      `Cannot run ${command}. Run npm run dev:setup and install the pinned Rust toolchain.`,
      { cause: result.error },
    );
  }
  if (result.status !== 0)
    throw new Error(`${command} failed; correct the reported errors and retry.`);
  return result.stdout;
}

export function trackedFiles() {
  return run('git', ['ls-files', '-z'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] })
    .split('\0')
    .filter(Boolean);
}

const python = path.join('.venv-tools', 'bin', 'python');
const rustChange = (file) =>
  /(?:\.rs$|(?:^|\/)Cargo\.(?:toml|lock)$|(?:^|\/)rust-toolchain(?:\.toml)?$|(?:^|\/)(?:\.rustfmt|rustfmt)\.toml$|^\.cargo\/)/.test(
    file,
  );
const webChange = (file) => /^website\/.*\.(?:tsx?|m?js|json)$/.test(file);
const sdkChange = (file) => /^(?:sdk\/|tests\/sdk-types\.ts$)/.test(file);
const checkConfig = (file) =>
  /^(?:package(?:-lock)?\.json|eslint\.config\.mjs|ruff\.toml|requirements-dev\.txt|\.prettier(?:rc\.json|ignore)|scripts\/(?:checks|pre-commit)\.mjs)$/.test(
    file,
  );

export async function checkFiles(changed, { fix = false, workspace = false } = {}) {
  const relative = changed.map((file) => path.relative(process.cwd(), path.resolve(file)));
  const configChanged = relative.some(checkConfig);
  const selected = configChanged ? trackedFiles() : relative;
  const files = selected.filter((file) => existsSync(file) && lstatSync(file).isFile());
  // Format only staged files, even when configuration changes request a full lint check.
  const staged = new Set(relative);
  for (const file of files) {
    const info = await prettier.getFileInfo(file, { ignorePath: '.prettierignore' });
    if (info.ignored || !info.inferredParser) continue;
    const source = readFileSync(file, 'utf8');
    const formatted = await prettier.format(source, {
      ...(await prettier.resolveConfig(file)),
      filepath: file,
    });
    if (source === formatted) continue;
    if (fix && staged.has(file)) writeFileSync(file, formatted);
    else throw new Error(`${file} needs formatting. Run npm run format.`);
  }
  const js = files.filter((file) => /\.(?:[cm]?js|jsx|tsx?)$/.test(file));
  if (js.length) {
    const eslint = new ESLint();
    const eligible = [];
    for (const file of js) if (!(await eslint.isPathIgnored(file))) eligible.push(file);
    const results = eligible.length ? await eslint.lintFiles(eligible) : [];
    if (results.some((result) => result.errorCount || result.warningCount)) {
      console.error((await eslint.loadFormatter('stylish')).format(results));
      throw new Error('JavaScript/TypeScript lint failed.');
    }
  }
  const py = files.filter((file) => file.endsWith('.py'));
  if (py.length) {
    if (!existsSync(python)) throw new Error('Python checks are missing. Run npm run dev:setup.');
    // Bound argument lists without repeating workspace checks.
    for (let offset = 0; offset < py.length; offset += 100) {
      const batch = py.slice(offset, offset + 100);
      const writable = fix ? batch.filter((file) => staged.has(file)) : [];
      if (writable.length) run(python, ['-m', 'ruff', 'format', '--', ...writable]);
      run(python, ['-m', 'ruff', 'format', '--check', '--', ...batch]);
      run(python, ['-m', 'ruff', 'check', '--', ...batch]);
    }
  }
  for (const file of files.filter((file) => file.endsWith('.sh') || file === '.husky/pre-commit')) {
    const firstLine = readFileSync(file, 'utf8').split('\n')[0];
    const shell =
      file === '.husky/pre-commit'
        ? 'sh'
        : firstLine.match(/^#!(?:\/usr\/bin\/env\s+|\/bin\/)(sh|bash|zsh)\s*$/)?.[1];
    if (!shell) throw new Error(`${file} needs a supported sh, bash, or zsh shebang.`);
    run(shell, ['-n', path.resolve(file)]);
  }
  if (!workspace) return;
  if (relative.some(rustChange)) {
    run('cargo', ['fmt', '--all', '--check']);
    run('cargo', [
      'clippy',
      '--locked',
      '--offline',
      '--workspace',
      '--all-targets',
      '--',
      '-D',
      'warnings',
    ]);
  }
  if (configChanged || relative.some(webChange)) run('npm', ['run', 'web:typecheck']);
  if (configChanged || relative.some(sdkChange)) run('npm', ['run', 'sdk:check']);
}

if (import.meta.main) {
  try {
    await checkFiles(trackedFiles());
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
