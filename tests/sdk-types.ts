async function checkCapabilityTypes() {
  const read = await clearings.call('files.read', { root: 'data', path: 'a' });
  const text: string = read.text;
  const list = await clearings.call('files.list', { root: 'data', path: '.' });
  const names: string[] = list.entries;
  const external: Json = await clearings.call('data.get', { query: 'x' });
  // @ts-expect-error Built-in calls require root and path.
  await clearings.call('files.read', { nope: true });
  // @ts-expect-error The catch-all must not accept an invalid built-in path.
  await clearings.call('files.list', { root: 'data', path: 2 });
  // @ts-expect-error Built-in return types remain specific.
  const wrong: number = read.text;
  // @ts-expect-error HTTP query arguments must be an object of strings.
  await clearings.call('data.get', null);
  // @ts-expect-error Numeric query values are rejected by the live broker.
  await clearings.call('data.get', { status: 1 });
  // @ts-expect-error Other names in the files namespace are unsupported.
  await clearings.call('files.write', { root: 'data', path: 'a' });
  return { text, names, external, wrong };
}
void checkCapabilityTypes;
