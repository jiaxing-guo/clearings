import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
export function baseOptions(): BaseLayoutProps {
  return {
    nav: { title: 'Clearings' },
    links: [
      { text: 'Learn', url: '/docs/technical/learn/first-contract' },
      { text: 'Guides', url: '/docs/technical/guides/check-a-case' },
      { text: 'Reference', url: '/docs/technical' },
      { text: 'Architecture', url: '/docs/technical/architecture/system' },
    ],
    githubUrl: 'https://github.com/jiaxing-guo/clearings-semantic',
  };
}
