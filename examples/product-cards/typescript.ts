import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { Runtime, flow, operation, s } from '@clearings/sdk';

// Fake read adapters keep this execution example independent of provider credentials.
const catalog = operation(
  {
    id: 'catalog.product',
    version: 'fixture-v1',
    input: s.string,
    output: s.object({ name: s.string }),
  },
  async (id) => {
    if (id === 'A') return { name: 'Apple' };
    if (id === 'B') return { name: 'Book' };
    throw new Error('Unknown product');
  },
);
const inventory = operation(
  { id: 'inventory.stock', version: 'fixture-v1', input: s.string, output: s.number },
  async (id) => (id === 'A' ? 3 : 0),
);
export const productCards = flow('product-cards', (q, ids: string[]) =>
  q.map(ids, (id) =>
    q.transform(
      q.join({ product: q.call(catalog, id), stock: q.call(inventory, id) }),
      (result) => ({ name: result.product.name, available: result.stock > 0 }),
    ),
  ),
);
export function server(
  runtime = new Runtime({ maxInFlight: 16, build: 'product-cards-fixture-v1' }),
) {
  return createServer(async (request, response) => {
    const ids = new URL(request.url ?? '/', 'http://localhost').searchParams.getAll('id');
    try {
      const result = await runtime.run(productCards, ids, { timeoutMs: 1000 });
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(result));
    } catch {
      response.writeHead(503, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'Product cards unavailable' }));
    }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  server().listen(3000, '127.0.0.1', () => console.log('http://127.0.0.1:3000/?id=A&id=B&id=A'));
