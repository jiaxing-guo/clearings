import assert from 'node:assert/strict';
import { parse } from '../website/node_modules/parse5/dist/index.js';
import { setTimeout } from 'node:timers/promises';

const origin = new URL(process.argv[2]);
assert.equal(origin.protocol, 'https:');
const check = async (url) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000), cache: 'no-store' });
  assert.equal(response.status, 200, `${url}: HTTP ${response.status}`);
  return response;
};
for (let attempt = 1; attempt <= 6; attempt++) {
  try {
    const html = await (await check(origin)).text();
    const assets = new Set();
    function visit(node) {
      const attrs = Object.fromEntries((node.attrs ?? []).map((a) => [a.name, a.value]));
      if (node.tagName === 'link' && attrs.rel === 'stylesheet')
        assets.add(new URL(attrs.href, origin).href);
      if (node.tagName === 'script' && attrs.src) assets.add(new URL(attrs.src, origin).href);
      for (const child of node.childNodes ?? []) visit(child);
    }
    visit(parse(html));
    assert(assets.size > 0, 'Landing has no stylesheet or script assets');
    await Promise.all(
      [...assets].map((url) => {
        assert.equal(new URL(url).origin, origin.origin);
        return check(url);
      }),
    );
    const docs = await (await check(new URL('docs/', origin))).text();
    assert.match(docs, /Clearings guide/);
    const index = await (await check(new URL('search-index.json', origin))).json();
    assert(index && typeof index === 'object', 'Search index is missing');
    console.log(`Live site passed: ${assets.size} assets, docs and search at ${origin}`);
    break;
  } catch (error) {
    if (attempt === 6) throw error;
    console.warn(`Attempt ${attempt}: ${error.message}; retrying after propagation delay.`);
    await setTimeout(10000);
  }
}
