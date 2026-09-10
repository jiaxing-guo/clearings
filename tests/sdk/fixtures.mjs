import { flow, operation, s } from '@clearings/sdk';
export function caseFlow(kind, observe = () => {}) {
  const op = (id, input, output, fn) =>
    operation({ id, version: 'fixture-v1', input, output }, async (value) => {
      observe(id, value);
      return fn(value);
    });
  const catalog = op('catalog', s.string, s.object({ name: s.string }), (id) => {
    if (id === 'A') return { name: 'Apple' };
    if (id === 'B') return { name: 'Book' };
    throw new Error('private provider detail');
  });
  const stock = op('stock', s.string, s.number, (id) => (id === 'A' ? 3 : 0));
  const inc = op('inc', s.number, s.number, (x) => x + 1);
  const double = op('double', s.number, s.number, (x) => x * 2);
  return flow(`fixture:${kind}`, (q, input) => {
    switch (kind) {
      case 'value':
        return q.value(input);
      case 'cards':
        return q.map(input, (id) =>
          q.transform(q.join({ product: q.call(catalog, id), stock: q.call(stock, id) }), (x) => ({
            name: x.product.name,
            available: x.stock > 0,
          })),
        );
      case 'dependency':
        return q.call(double, q.call(inc, input));
      case 'shared': {
        const x = q.call(inc, input);
        return q.join([x, q.transform(x, (v) => v * 2)]);
      }
      case 'failure':
        return q.call(catalog, input);
      case 'transform_failure':
        return q.transform(q.value(input), () => {
          throw new Error('private transform detail');
        });
      default:
        throw new Error(`Unknown fixture ${kind}`);
    }
  });
}
