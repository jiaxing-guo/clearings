import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
export function baseOptions(): BaseLayoutProps {
  return { nav: { title: 'Clearings' }, links: [{ text: 'Start here', url: '/docs' }, { text: 'Three demos', url: '/docs/demos' }], githubUrl: 'https://github.com/jiaxing-guo/clearings-semantic' };
}
