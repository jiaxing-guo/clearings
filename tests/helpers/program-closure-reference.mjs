/**
 * Independent ordering oracle for small closed graphs. Enumerate every simple
 * required path, then order paths by distance, root position, and UTF-16 labels.
 * This uses neither a worklist traversal nor the candidate or production code.
 * Deliberately exponential: callers restrict exhaustive use to three vertices.
 */
export function referenceRequiredClosure(roots, records) {
  const recordsById = new Map(records.map(record => [record.id, record]));
  if (recordsById.size !== records.length) throw new Error('The path oracle requires unique record IDs.');
  const paths = [];
  function enumerate(path, rootPosition) {
    const record = recordsById.get(path.at(-1));
    if (!record) throw new Error('The path oracle requires every reached ID to exist.');
    paths.push({ path, rootPosition });
    for (const edge of record.dependencies) {
      if (edge.required && !path.includes(edge.target)) enumerate([...path, edge.target], rootPosition);
    }
  }
  roots.forEach((root, rootPosition) => enumerate([root], rootPosition));
  paths.sort((a, b) => {
    if (a.path.length !== b.path.length) return a.path.length - b.path.length;
    if (a.rootPosition !== b.rootPosition) return a.rootPosition - b.rootPosition;
    for (let i = 0; i < a.path.length; i++) if (a.path[i] !== b.path[i]) return a.path[i] < b.path[i] ? -1 : 1;
    return 0;
  });
  return [...new Set(paths.map(({ path }) => path.at(-1)))];
}
