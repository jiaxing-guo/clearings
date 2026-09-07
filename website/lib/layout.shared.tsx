import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
export function baseOptions(): BaseLayoutProps {
  return { nav: { title: 'Clearings' }, links: [{ text: 'Technical reference', url: '/docs/technical' }, { text: 'Examples', url: '/docs/demos' }], githubUrl: 'https://github.com/jiaxing-guo/clearings-semantic' };
}
