import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
export function getLayoutOptions(): BaseLayoutProps {
  return {
    nav: { title: 'Clearings' },
    links: [
      { text: 'Overview', url: '/docs' },
      { text: 'Product', url: '/docs/product' },
      { text: 'Development', url: '/docs/development' },
      { text: 'History', url: '/docs/history' },
    ],
    githubUrl: 'https://github.com/jiaxing-guo/clearings',
  };
}
