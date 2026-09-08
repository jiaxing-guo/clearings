import { readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';
import { ClearingsError } from '../model/types.js';
import { canonical } from '../repository/inventory.js';
import { sha256 } from '../repository/source.js';
import { snapshot, unavailable } from './capture.js';
import { getContextAssemblyContract, validateContextInvocation } from './context-contract.js';
import { measureContextCaptures } from './context-adapter.js';
import { componentDigest, implementationIdentity } from './recording-identity.js';
import { sealExecutionRecord } from './validate.js';
import type { ContextAssemblyInvocation } from './context-contract.js';
import type { CapturedValue, ExecutionCompletion, ExecutionRecord } from './model.js';

export interface RecordContextAssemblyOptions {
  case_id: string;
  invocation: ContextAssemblyInvocation;
  fixture_name?: string;
  /** A built local checkout with the same src/dist context-assembly entrypoints. */
  implementation_root?: string;
  repository?: string;
  /** Covers worker startup, module import, synchronous invocation, and capture. */
  timeout_ms?: number;
}
type Captures = { arguments_after: CapturedValue; completion: ExecutionCompletion };

async function execute(
  module_url: string,
  invocation: ContextAssemblyInvocation,
  timeout: number,
): Promise<Captures> {
  return new Promise((resolve) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./context-worker.js', import.meta.url), {
        workerData: { module_url, invocation },
        execArgv: [],
        stdout: true,
        stderr: true,
        resourceLimits: {
          maxOldGenerationSizeMb: 128,
          maxYoungGenerationSizeMb: 16,
          stackSizeMb: 4,
        },
      });
    } catch {
      resolve({
        arguments_after: unavailable('Worker could not be started.'),
        completion: {
          kind: 'harness-failure',
          phase: 'prepare',
          message: 'Worker could not be started.',
        },
      });
      return;
    }
    worker.stdout.resume();
    worker.stderr.resume();
    let phase: 'prepare' | 'invoke' | 'capture' = 'prepare',
      known: 'return' | 'throw' | undefined,
      finished = false;
    let resultingSnapshot: CapturedValue | undefined;
    const fallback = (message: string, timedOut = false): Captures => ({
      arguments_after: resultingSnapshot ?? unavailable(message),
      completion:
        known === 'return'
          ? { kind: 'return', result: unavailable(message) }
          : known === 'throw'
            ? { kind: 'throw', thrown: unavailable(message) }
            : timedOut
              ? { kind: 'timeout', limit_ms: timeout }
              : { kind: 'harness-failure', phase, message },
    });
    const finish = async (captures: Captures): Promise<void> => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      await worker.terminate();
      resolve(captures);
    };
    const timer = setTimeout(() => {
      void finish(fallback('Worker exceeded the recording time limit.', true));
    }, timeout);
    worker.on(
      'message',
      (message: {
        phase: string;
        kind?: 'return' | 'throw';
        completion?: ExecutionCompletion;
        arguments_after?: CapturedValue;
      }) => {
        if (finished) return;
        if (message.phase === 'invoke') phase = 'invoke';
        else if (message.phase === 'capture') {
          phase = 'capture';
          known = message.kind;
        } else if (message.phase === 'snapshot' && message.arguments_after)
          resultingSnapshot = message.arguments_after;
        else if (message.phase === 'complete' && message.completion && message.arguments_after)
          void finish({ completion: message.completion, arguments_after: message.arguments_after });
        else if (message.phase === 'failed')
          void finish(fallback('Candidate module could not be prepared.'));
      },
    );
    worker.on('error', () => {
      void finish(fallback('Worker failed before capture completed.'));
    });
    worker.on('exit', () => {
      if (!finished) void finish(fallback('Worker exited before capture completed.'));
    });
  });
}

/** Execute only the declared synchronous context-assembly API in an isolated worker. */
export async function recordContextAssembly(
  options: RecordContextAssemblyOptions,
): Promise<ExecutionRecord> {
  if (!options || typeof options !== 'object' || Array.isArray(options))
    throw new ClearingsError('INVALID_CONFORMANCE', 'Expected a recording options object.');
  const timeout = options.timeout_ms ?? 10000;
  if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 60000)
    throw new ClearingsError(
      'INVALID_CONFORMANCE',
      'timeout_ms must be an integer from 1 through 60000.',
    );
  if (typeof options.case_id !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_.:/-]*$/.test(options.case_id))
    throw new ClearingsError('INVALID_CONFORMANCE', 'Expected a nonempty canonical case_id.');
  if (
    options.fixture_name !== undefined &&
    (typeof options.fixture_name !== 'string' || !options.fixture_name.length)
  )
    throw new ClearingsError('INVALID_CONFORMANCE', 'fixture_name must be nonempty.');
  if (
    options.repository !== undefined &&
    (typeof options.repository !== 'string' || !options.repository.length)
  )
    throw new ClearingsError('INVALID_CONFORMANCE', 'repository must be nonempty.');
  const caseId = options.case_id,
    fixtureName = options.fixture_name ?? caseId;
  const invocation = snapshot(options.invocation);
  validateContextInvocation(invocation);
  const { specification, profile } = getContextAssemblyContract();
  const recorderRoot = fileURLToPath(new URL('../../', import.meta.url));
  let implementation: ExecutionRecord['identities']['implementation'],
    adapterDigest: string,
    lockfileDigest: string,
    implementationRoot: string;
  try {
    implementationRoot = realpathSync(options.implementation_root ?? recorderRoot);
    implementation = implementationIdentity(
      implementationRoot,
      options.repository ??
        (implementationRoot === realpathSync(recorderRoot)
          ? 'https://github.com/jiaxing-guo/clearings-semantic'
          : pathToFileURL(implementationRoot).href),
    );
    adapterDigest = componentDigest(recorderRoot);
    lockfileDigest = sha256(readFileSync(join(implementationRoot, 'package-lock.json')));
  } catch {
    throw new ClearingsError(
      'CONFORMANCE_PREPARATION',
      'Cannot bind the built checkout: require Git HEAD, package.json, package-lock.json, and regular src/dist context-assembly files.',
    );
  }
  const captures = await execute(
    pathToFileURL(join(implementationRoot, 'dist/specification/context.js')).href,
    invocation,
    timeout,
  );
  const raw = {
    arguments_before: invocation as unknown as ExecutionRecord['arguments_before'],
    ...captures,
  };
  return sealExecutionRecord(
    {
      schema_version: '0.1.0',
      kind: 'execution-record',
      origin: 'recorded-execution',
      case_id: caseId,
      profile_id: profile.artifact_id,
      specification_id: specification.artifact_id,
      identities: {
        implementation,
        adapter: {
          status: 'bound',
          name: 'Clearings context recorder and observation adapter; project file-set manifest',
          sha256: adapterDigest,
        },
        evaluator: {
          status: 'unavailable',
          reason: 'Independent reference evaluation has not been performed.',
        },
        fixture: { name: fixtureName, sha256: sha256(canonical(invocation)) },
        runtime: {
          status: 'bound',
          name: 'node',
          version: process.version,
          platform: process.platform,
          architecture: process.arch,
          lockfile_sha256: lockfileDigest,
        },
      },
      ...raw,
      measurements: measureContextCaptures(raw, profile),
      limitations: [
        `One synchronous invocation; worker lifetime limit is ${timeout} ms including startup, import, invocation, and capture. Workers are not a security sandbox.`,
        'Captures are JSON values limited to 25,000 visited values and depth 48. Native errors retain own data fields and name/message, excluding stack traces and prototypes.',
        'Git commit/tree identify the checkout baseline. File digests identify working source, emitted JavaScript, schemas, and package/contract metadata read before execution; dirty files are permitted.',
        'The file-set manifest is a conservative project scope, not proof of compiler provenance or complete dynamic dependencies. Environment variables and installed dependency bytes are not captured; the lockfile identifies declared dependencies.',
        'Concurrent file changes are outside the recording protocol. Boundary snapshots do not exclude transient writes, retained aliases, or external effects.',
        'Independent reference measurements, effect instrumentation, scoped acceptance, and source refinement are not established.',
      ],
    },
    profile,
    specification,
  );
}
