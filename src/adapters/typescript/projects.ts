import ts from 'typescript';
import { posix } from 'node:path';
import type { Project, ScanDiagnostic } from '../../model/structural.js';
import { ClearingsError } from '../../model/types.js';
import { SourceStore, sourcePath, VIRTUAL_ROOT } from '../../repository/source.js';
import { compare } from '../../repository/inventory.js';
import { recordId } from '../../analysis/identity.js';

export interface CompilerProject {
  record: Project;
  options: ts.CompilerOptions;
}
export const defaults: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  jsx: ts.JsxEmit.Preserve,
};

// matchFiles is a version-pinned compiler implementation detail, confined to this
// adapter. It preserves TypeScript's include/exclude/extension semantics in Git's
// virtual filesystem; never delegate config globbing to the host filesystem.
type Matcher = (
  path: string,
  extensions: readonly string[] | undefined,
  excludes: readonly string[] | undefined,
  includes: readonly string[] | undefined,
  caseSensitive: boolean,
  cwd: string,
  depth: number | undefined,
  entries: (path: string) => { files: string[]; directories: string[] },
  realpath: (path: string) => string,
) => string[];
const matchFiles = (ts as unknown as { matchFiles: Matcher }).matchFiles;

export function discoverProjects(
  store: SourceStore,
  selected: string[],
  diagnostics: ScanDiagnostic[],
  requested?: string,
): CompilerProject[] {
  const projects = new Map<string, CompilerProject>();
  const visiting = new Set<string>();
  const diagnostic = (
    code: string,
    message: string,
    path: string | null,
    project_id: string | null,
    severity: 'warning' | 'error' = 'warning',
  ) =>
    diagnostics.push({
      code,
      message,
      path,
      project_id,
      severity,
      start_byte: null,
      end_byte: null,
    });
  const portableOptions = (options: ts.CompilerOptions): Project['options'] => ({
    base_url: options.baseUrl ? sourcePath(options.baseUrl) : null,
    paths: options.paths ?? {},
    module: ts.ModuleKind[options.module ?? defaults.module!],
    module_resolution:
      ts.ModuleResolutionKind[options.moduleResolution ?? defaults.moduleResolution!],
    target: ts.ScriptTarget[options.target ?? defaults.target!],
    jsx: ts.JsxEmit[options.jsx ?? defaults.jsx!],
    types: options.types ?? [],
  });
  const load = (path: string): CompilerProject | undefined => {
    if (visiting.has(path)) {
      diagnostic('PROJECT_CYCLE', 'Project reference cycle detected.', path, null, 'error');
      return projects.get(path);
    }
    const existing = projects.get(path);
    if (existing) return existing;
    if (projects.size >= store.limits.max_projects) {
      diagnostic(
        'PROJECT_LIMIT',
        'Project discovery budget exceeded; this configuration was not loaded.',
        path,
        null,
        'error',
      );
      return undefined;
    }
    const id = recordId('project', [store.manifest.snapshot_id, path]);
    const record: Project = {
      id,
      config_path: path,
      config_sha256: null,
      references: [],
      source_files: [],
      selected_files: [],
      status: 'failed',
      options: portableOptions(defaults),
    };
    const project = { record, options: { ...defaults } };
    projects.set(path, project);
    visiting.add(path);
    const host: ts.ParseConfigFileHost = {
      useCaseSensitiveFileNames: true,
      getCurrentDirectory: () => VIRTUAL_ROOT,
      fileExists: store.exists,
      readFile: store.readVirtual,
      readDirectory: (path, extensions, excludes, includes, depth) =>
        matchFiles(
          path,
          extensions,
          excludes,
          includes,
          true,
          VIRTUAL_ROOT,
          depth,
          (path) => store.directoryEntries(path),
          (path) => path,
        ),
      onUnRecoverableConfigFileDiagnostic: (error) =>
        diagnostic(
          `TSCONFIG_${error.code}`,
          ts.flattenDiagnosticMessageText(error.messageText, '\n').replaceAll(VIRTUAL_ROOT, ''),
          path,
          id,
          'error',
        ),
    };
    const parsed = ts.getParsedCommandLineOfConfigFile(VIRTUAL_ROOT + path, {}, host);
    record.config_sha256 = store.reads.get(path)?.content_sha256 ?? null;
    if (parsed) {
      project.options = { ...defaults, ...parsed.options };
      record.options = portableOptions(project.options);
      record.source_files = parsed.fileNames
        .map(sourcePath)
        .filter((path): path is string => path !== null)
        .sort(compare);
      // No-input configs are still useful containers for explicitly selected files.
      for (const error of parsed.errors)
        diagnostic(
          `TSCONFIG_${error.code}`,
          ts.flattenDiagnosticMessageText(error.messageText, '\n').replaceAll(VIRTUAL_ROOT, ''),
          path,
          id,
          error.code === 18003 ? 'warning' : 'error',
        );
      record.status = parsed.errors.some((error) => error.code !== 18003) ? 'failed' : 'loaded';
      if (record.options.types.length)
        diagnostic(
          'EXTERNAL_TYPES_UNAVAILABLE',
          `Source-only mode does not load ambient type packages: ${record.options.types.join(', ')}`,
          path,
          id,
        );
      for (const reference of parsed.projectReferences ?? []) {
        const virtual = ts.resolveProjectReferencePath(reference);
        const referenced = sourcePath(virtual);
        if (referenced === null) {
          diagnostic(
            'PROJECT_OUTSIDE_REPOSITORY',
            'Project reference leaves the snapshot.',
            path,
            id,
            'error',
          );
          continue;
        }
        const child = load(referenced);
        if (child) record.references.push(child.record.id);
      }
      record.references = [...new Set(record.references)].sort(compare);
    }
    visiting.delete(path);
    return project;
  };
  if (requested) {
    const path = posix.normalize(requested);
    if (
      path.startsWith('/') ||
      path.startsWith('../') ||
      !path.endsWith('.json') ||
      !store.allowed(path)
    )
      throw new ClearingsError(
        'INVALID_PROJECT',
        'Project must be an available repository-relative JSON compiler configuration path.',
      );
    load(path);
  } else {
    const configs = new Set<string>();
    for (const file of selected) {
      let directory = posix.dirname(file);
      while (true) {
        const candidate = posix.join(directory, 'tsconfig.json');
        if (store.allowed(candidate)) configs.add(candidate);
        if (directory === '.') break;
        directory = posix.dirname(directory);
      }
    }
    for (const config of [...configs].sort(compare)) load(config);
  }
  let fallback: CompilerProject | undefined;
  for (const path of selected) {
    const candidates = [...projects.values()]
      .filter(
        (project) =>
          project.record.status === 'loaded' && project.record.source_files.includes(path),
      )
      .sort(
        (a, b) =>
          posix.dirname(b.record.config_path!).split('/').length -
            posix.dirname(a.record.config_path!).split('/').length ||
          a.record.source_files.length - b.record.source_files.length ||
          compare(a.record.config_path!, b.record.config_path!),
      );
    let owner = candidates[0];
    if (candidates.length > 1)
      diagnostic(
        'PROJECT_OVERLAP',
        `Multiple configs include this file; selected ${owner!.record.config_path}. Use --project to restrict discovery.`,
        path,
        owner!.record.id,
      );
    if (!owner) {
      fallback ??= {
        record: {
          id: recordId('project', [store.manifest.snapshot_id, null]),
          config_path: null,
          config_sha256: null,
          references: [],
          source_files: [],
          selected_files: [],
          status: 'loaded',
          options: portableOptions(defaults),
        },
        options: { ...defaults },
      };
      owner = fallback;
      owner.record.source_files.push(path);
      if (projects.size)
        diagnostic(
          'SOURCE_ONLY_FALLBACK',
          'No successfully loaded project includes this selected file; using documented source-only defaults.',
          path,
          owner.record.id,
        );
    }
    owner.record.selected_files.push(path);
  }
  return [...projects.values(), ...(fallback ? [fallback] : [])].sort((a, b) =>
    compare(a.record.id, b.record.id),
  );
}
