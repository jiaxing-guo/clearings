# TypeScript SDK

The current SDK runs finite read flows through the embedded Rust core. It supports typed operations, dependencies, ordered joins and maps, synchronous host transformations, local capacity, cancellation and deadlines. Batching, reuse, shared quotas, real service adapters and CLI/MCP remain subsequent work.

## Build and validate

Contributors use Node 24, the pinned Rust toolchain and root npm workspaces. The website retains its separate install.

```sh
npm ci --ignore-scripts
npm run build:native
npm run build:sdk
npm run test:sdk
npm run check:node-package
```

The package check creates platform-specific native and SDK tarballs in `dist/node/`, installs them together into an isolated project with install scripts disabled and Rust unavailable on PATH, and executes the shared acceptance cases. CI also checks Linux installation in a Node container without Rust. These private release-candidate packages are not published to npm. Linux, macOS and Windows build jobs establish their tested coverage individually.

## Use a reusable Runtime

```typescript
import { Runtime, flow, operation, s } from '@clearings/sdk';

const readStock = operation(
  { id: 'inventory.stock', version: '1', input: s.string, output: s.number },
  async (id, { signal }) => inventoryClient.read(id, { signal })
);
const stockForProducts = flow('stock-for-products', (q, ids: string[]) =>
  q.map(ids, id => q.call(readStock, id))
);
const runtime = new Runtime({ maxInFlight: 16, build: 'application-revision' });
const result = await runtime.run(stockForProducts, ['A', 'B', 'A'], {
  timeoutMs: 800,
});
```

The application supplies `inventoryClient`. Operations declare codecs and an async read implementation. `s` includes primitive, array, object and nullable codecs; `codec` adds application-defined schema/validation pairs. Validation does not silently coerce values. Unsupported operation settings fail explicitly.

Create Runtime once for the application resource boundary. Its local capacity spans concurrent runs. Run settings may reduce its capacity; they cannot enlarge it. This first strategy executes individual calls and performs no retries or reuse.

`q.join` preserves array order or named fields; `q.transform` takes a synchronous pure callback. `q.map` takes a finite input array of at most 128 items, with an optional smaller item cap. Service-result-dependent expansion is not implemented. Unused graph nodes are excluded before dispatch. Foreign references, oversized plans and unsupported options fail before service work.

Values are snapshotted at operation boundaries and remain in JavaScript. Copies have bounded depth, entry count and aggregate string bytes. Large integers and timestamps need explicit string codecs. CPU-heavy host callbacks remain the application's responsibility; the runtime cannot preempt synchronous JavaScript.

## Cancellation and records

Pass an AbortSignal to `run`. `close()` prevents new submissions and requests cancellation; `await drain()` waits for owned runs and actions to settle. Non-cooperative service calls can retain capacity after the caller receives TIMEOUT or CANCELLED. Their external effects are not rolled back.

`runtime.records` returns bounded metadata records, including source-independent counts, SDK/core/adapter versions, timing and uncertain actions. `runtime.snapshot()` exposes live owned state. Operation exception messages and payloads are not copied into records. Stable ClearingsError codes include a source label and next action; custom source labels can be supplied on operation calls and transformations.

## Runnable endpoint

```sh
node examples/product-cards/typescript.ts
```

Request `http://127.0.0.1:3000/?id=A&id=B&id=A`. The [example source](../examples/product-cards/typescript.ts) uses ordinary Node HTTP integration and fake read adapters. It returns three ordered cards and performs six individual reads. It is an execution example, not evidence of batching or real-service performance.
