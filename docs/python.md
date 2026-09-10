# Python SDK

The Python SDK uses asyncio and the same Rust execution core as the TypeScript SDK. Application values, callbacks and service clients stay in Python. It provides finite read flows, dependencies, joins, bounded mapping, synchronous transformations, local capacity, deadlines and cancellation. Batching, reuse, shared admission and real service adapters remain subsequent work.

## Build and validate

Contributors use uv, CPython 3.11–3.14 and the pinned Rust toolchain. The workspace lockfile fixes Python development dependencies; Maturin is pinned in the package build requirements.

```sh
uv sync --project python/clearings --frozen --group dev
uv run --project python/clearings --frozen --group dev pytest -c python/clearings/pyproject.toml tests/python -q
uv build --project python/clearings --wheel --out-dir dist/python
python scripts/check-python-package.py
```

The built wheel contains the SDK and its private native extension. The package check installs it without resolving dependencies or invoking a compiler and runs the independently authored acceptance cases. It does not load a Node process. Linux container checks cover Python 3.11–3.14 with Rust and Node absent. Native build jobs also run on macOS and Windows; those jobs establish their specific tested coverage. Packages remain unpublished release candidates.

## Compose a flow

```python
from clearings import Runtime, flow, operation, s

async def read_stock(product_id, context):
    return await inventory_client.read(product_id)

stock = operation(
    id="inventory.stock", version="1", input=s.string, output=s.number,
    execute=read_stock,
)
stock_for_products = flow(
    "stock-for-products",
    lambda q, ids: q.map(ids, lambda product_id: q.call(stock, product_id)),
)
runtime = Runtime(max_in_flight=16, build="application-revision")
result = await runtime.run(stock_for_products, ["A", "B", "A"], timeout_ms=800)
```

The application provides `inventory_client`. Its adapter must implement the cancellation semantics it claims; the context exposes a cancellation event and monotonic deadline. A Runtime belongs to one asyncio event loop and shares capacity across its concurrent runs. Reuse it at the application resource boundary.

`q.join` accepts a list or named dictionary of references. `q.transform` requires a synchronous pure function. `q.map` takes a finite list with an item cap of at most 128. Maps over future service results and automatic retries are not implemented. Typed codecs declare operation input and output meaning; portable-value checks reject unsupported numbers, dates, object types, cycles and implicit conversions.

## Task cancellation and cleanup

Cancelling a task awaiting `run` preserves Python's normal `asyncio.CancelledError`. The core receives the cancellation and stops new dispatch. `TIMEOUT` is a ClearingsError with a stable code and next action. Records preserve the runtime outcome separately from the caller's task exception.

`runtime.close()` prevents new runs and requests cancellation of owned work. `await runtime.drain()` waits for actions and cleanup. A handler that suppresses cancellation can retain capacity until it settles. A cancelled task does not prove an external request stopped or was rolled back. The driver accounts for a host task cancelled before its coroutine body begins.

`runtime.records` exposes bounded metadata copies. `runtime.snapshot()` reports live handles, owned nodes, runs and active actions. Adapter exception messages and customer payloads do not appear in default records. A terminal native/driver fault makes drain report failure rather than claim successful cleanup.

## ASGI endpoint and SDK parity

The [product-card example](../examples/product-cards/python.py) exports an ordinary ASGI application with lifecycle handling. Run it using an ASGI server such as Uvicorn in your application environment, with `examples/product-cards` as the application directory and `python:app` as the import target. The example uses fake read adapters and returns three cards for `?id=A&id=B&id=A` through six individual calls.

The example follows the [ASGI HTTP](https://asgi.readthedocs.io/en/latest/specs/www.html) and [lifespan](https://asgi.readthedocs.io/en/latest/specs/lifespan.html) message interfaces. The SDK itself does not depend on an HTTP server.

After building and checking both SDK packages:

```sh
npm run check:node-package
python scripts/check-python-package.py
python scripts/check-sdk-parity.py
```

The comparison reads results from the two isolated installed-package checks. It compares public outputs, errors, logical and physical call accounting, uncertainty counts and execution versions against the same acceptance cases. Timing values differ by host and are not equality assertions. This establishes the shared execution slice, not performance gains from later optimizations.
