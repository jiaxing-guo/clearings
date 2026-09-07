import type { Root, Item, Node } from 'fumadocs-core/page-tree';
import { source } from './source';

// Reuse the ordered source pages while grouping navigation by reader task.
const pages: Item[] = [];
function collect(nodes: Node[]) {
  for (const node of nodes) {
    if (node.type === 'page') pages.push(node);
    if (node.type === 'folder') { if (node.index) pages.push(node.index); collect(node.children); }
  }
}
collect(source.getPageTree().children);
const remaining = new Map(pages.map(page => [page.url, page]));
function take(path: string, descendants = true) {
  const selected = [...remaining.values()].filter(page => page.url === path || (descendants && page.url.startsWith(path + '/')));
  for (const page of selected) remaining.delete(page.url);
  return selected;
}
const folder = (name: string, children: Node[]): Node => ({ type: 'folder', name, defaultOpen: true, children });
export const documentationTree: Root = {
  name: 'Clearings documentation',
  children: [
    ...take('/docs', false),
    folder('Learn Clearings', take('/docs/technical/learn')),
    folder('Guides', take('/docs/technical/guides')),
    folder('Reference', [
      ...take('/docs/technical', false),
      folder('Semantics', take('/docs/technical/semantics')),
      folder('Interfaces', take('/docs/technical/reference')),
    ]),
    folder('Architecture', take('/docs/technical/architecture')),
    folder('Development', [...take('/docs/technical/development'), ...take('/docs/contributing')]),
    { type: 'folder', name: 'Recorded examples and legacy APIs', defaultOpen: false, children: [...remaining.values()] },
  ],
};
