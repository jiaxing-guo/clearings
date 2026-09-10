import { channel } from 'node:diagnostics_channel';
import { parentPort, workerData } from 'node:worker_threads';
import { capture, captureException } from './capture.js';
import type { ContextAssemblyInvocation } from './context-contract.js';

// Only the recorder starts this worker. Candidate code is trusted local code;
// worker termination bounds its lifetime but provides no filesystem/network sandbox.
if (!parentPort) throw new Error('Context recorder worker requires a parent port.');
const port = parentPort;
const { module_url, invocation } = workerData as {
  module_url: string;
  invocation: ContextAssemblyInvocation;
};
try {
  const candidate = (await import(module_url)) as { assembleContext?: unknown };
  if (typeof candidate.assembleContext !== 'function')
    throw new Error('Candidate does not export assembleContext.');
  const native = channel('clearings.context.native.v1');
  let observed = false;
  native.subscribe((message) => {
    if (observed) return;
    observed = true;
    port.postMessage({ phase: 'native', observation: capture(message) });
  });
  let stageMessages = 0;
  channel('clearings.context.native.v2').subscribe((message) => {
    stageMessages++;
    if (stageMessages <= 8)
      port.postMessage({ phase: 'native-stage', observation: capture(message) });
    else if (stageMessages === 9) port.postMessage({ phase: 'native-stage-overflow' });
  });
  port.postMessage({ phase: 'invoke' });
  let kind: 'return' | 'throw', value: unknown;
  try {
    value = candidate.assembleContext(
      invocation.specification,
      invocation.selection,
      invocation.options,
    );
    kind = 'return';
  } catch (error) {
    value = error;
    kind = 'throw';
  }
  // Publish the known completion before attempting potentially failing capture.
  port.postMessage({ phase: 'capture', kind });
  const arguments_after = capture(invocation);
  port.postMessage({ phase: 'snapshot', arguments_after });
  const captured = kind === 'throw' ? captureException(value) : capture(value);
  port.postMessage({
    phase: 'complete',
    arguments_after,
    completion: kind === 'return' ? { kind, result: captured } : { kind, thrown: captured },
  });
} catch {
  port.postMessage({
    phase: 'failed',
    message: 'Candidate module could not be imported or does not export assembleContext.',
  });
}
